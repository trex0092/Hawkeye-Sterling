// POST /api/screening/run
//
// Unified, production-grade screening entry point.
//
// Every screening invocation through this route:
//   1. Validates input with a typed schema (Zod-like structural check)
//   2. Assigns a deterministic, immutable screening result ID
//      (sha256 of subject + timestamp + request-id — suitable for audit)
//   3. Runs the brain quickScreen against the live watchlist corpus
//   4. Runs PEP matching in parallel (OpenSanctions bulk corpus)
//   5. When a PEP hit is found, fires PEP family/RCA graph lookup (fire-and-forget)
//   6. Applies adverse-media relevance scoring + deduplication
//   7. Returns a typed screening envelope with:
//      - result ID, subject, hits, score, severity
//      - PEP hits with positions, countries, topics
//      - scored adverse media articles (relevance + severity per article)
//      - source provenance (listId, listRef) on every hit
//      - match rationale on every hit
//      - negative evidence (what was checked and found clear)
//      - confidence calibration note
//      - screeningTrace (tier-by-tier audit trail for Federal Decree-Law No. 10 of 2025 Art.18)
//      - generation timestamp + schema version
//      - auditable request-id header
//
// This route is the primary production endpoint.
// /api/quick-screen is maintained for backward compatibility.
//
// Rate-limited per tier. Returns typed errors — no silent 200 failures.

import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { runMultiSourceScreening } from "@/lib/server/multi-source-screener";
import { ScreeningAuditWriter } from "@/lib/server/screening-audit";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { checkAdversarialInput } from "@/lib/server/adversarial-guard";
import { handlePostScreenResult } from "@/lib/server/post-screen-handler";
import { scoreAndFilterArticles, aggregateMediaSeverity } from "@/lib/server/adverse-media-scorer";
import { getScreeningThresholds } from "@/lib/server/screening-threshold-config";
import { SCREENING_BUDGETS } from "@/lib/server/screening-budgets";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// In-band deadlines (SCREENING_BUDGETS) keep the response ≤5s; 10 gives 2x
// headroom for serialization without letting a regression hide behind 30s.
export const maxDuration = 10;

const SCHEMA_VERSION = "1.0";
const MAX_CANDIDATES = 5_000;
const MAX_ALIASES = 50;

// ── Input validation ──────────────────────────────────────────────────────────

interface ScreeningRunRequest {
  subject: QuickScreenSubject;
  candidates?: QuickScreenCandidate[];
  options?: QuickScreenOptions;
  requestId?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateRequest(raw: unknown): { ok: true; value: ScreeningRunRequest } | { ok: false; errors: ValidationError[] } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }
  const body = raw as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!body["subject"] || typeof body["subject"] !== "object") {
    errors.push({ field: "subject", message: "subject is required and must be an object" });
    return { ok: false, errors };
  }
  const subject = body["subject"] as Record<string, unknown>;
  if (typeof subject["name"] !== "string" || !subject["name"].trim()) {
    errors.push({ field: "subject.name", message: "subject.name must be a non-empty string" });
  }
  const name = typeof subject["name"] === "string" ? subject["name"].trim() : "";
  if (name.length > 512) {
    errors.push({ field: "subject.name", message: "subject.name must not exceed 512 characters" });
  }

  const VALID_ENTITY_TYPES = ["individual", "organisation", "vessel", "aircraft", "other"];
  if (subject["entityType"] !== undefined && !VALID_ENTITY_TYPES.includes(subject["entityType"] as string)) {
    errors.push({ field: "subject.entityType", message: `entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}` });
  }

  if (subject["aliases"] !== undefined) {
    if (!Array.isArray(subject["aliases"])) {
      errors.push({ field: "subject.aliases", message: "aliases must be an array of strings" });
    } else if ((subject["aliases"] as unknown[]).length > MAX_ALIASES) {
      errors.push({ field: "subject.aliases", message: `aliases must not exceed ${MAX_ALIASES} entries` });
    } else if (!(subject["aliases"] as unknown[]).every((a) => typeof a === "string")) {
      errors.push({ field: "subject.aliases", message: "all aliases must be strings" });
    } else if ((subject["aliases"] as string[]).some((a) => a.length > 512)) {
      errors.push({ field: "subject.aliases", message: "each alias must not exceed 512 characters" });
    }
  }

  if (subject["dateOfBirth"] !== undefined && typeof subject["dateOfBirth"] !== "string") {
    errors.push({ field: "subject.dateOfBirth", message: "dateOfBirth must be a string (ISO date or partial)" });
  }

  if (body["candidates"] !== undefined) {
    if (!Array.isArray(body["candidates"])) {
      errors.push({ field: "candidates", message: "candidates must be an array" });
    } else if ((body["candidates"] as unknown[]).length > MAX_CANDIDATES) {
      errors.push({ field: "candidates", message: `candidates must not exceed ${MAX_CANDIDATES} entries` });
    }
  }

  if (body["options"] !== undefined && (typeof body["options"] !== "object" || body["options"] === null)) {
    errors.push({ field: "options", message: "options must be an object" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      subject: body["subject"] as QuickScreenSubject,
      candidates: body["candidates"] as QuickScreenCandidate[] | undefined,
      options: body["options"] as QuickScreenOptions | undefined,
      requestId: typeof body["requestId"] === "string" ? body["requestId"] : undefined,
    },
  };
}

// ── Deterministic result ID ───────────────────────────────────────────────────

function buildResultId(subject: QuickScreenSubject, ts: string, requestId?: string): string {
  const normName = subject.name.trim().normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const seed = [
    requestId ?? randomUUID(),
    normName,
    subject.entityType ?? "",
    ts,
  ].join("|");
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

// ── Negative evidence summary ─────────────────────────────────────────────────

function buildNegativeEvidence(
  result: QuickScreenResult,
  listsLoaded: number,
): string[] {
  const clear: string[] = [];
  if (result.hits.length === 0) {
    clear.push(`Screened against ${listsLoaded.toLocaleString()} watchlist entries — no matches found`);
  }
  if (result.topScore < 50) {
    clear.push(`Top match score (${result.topScore.toFixed(0)}%) is below significance threshold — no material similarity detected`);
  }
  if (result.severity === "clear") {
    clear.push("Severity assessment: CLEAR — no actionable hits requiring human review");
  }
  return clear;
}

// ── UAE list staleness check ──────────────────────────────────────────────────

async function isUaeListStale(staleHours: number): Promise<boolean> {
  try {
    const { getJson } = await import("@/lib/server/store");
    const [eocn, ltl] = await Promise.all([
      getJson<{ fetchedAt?: number | string; generatedAt?: string }>("uae_eocn/latest.json").catch(() => null),
      getJson<{ fetchedAt?: number | string; generatedAt?: string }>("uae_ltl/latest.json").catch(() => null),
    ]);
    const ageH = (meta: { fetchedAt?: number | string; generatedAt?: string } | null) => {
      if (!meta) return Infinity;
      const raw = meta.fetchedAt ?? meta.generatedAt;
      if (!raw) return Infinity;
      const t = typeof raw === "number" ? raw : Date.parse(raw as string);
      if (!Number.isFinite(t)) return Infinity;
      return (Date.now() - t) / 3_600_000;
    };
    return ageH(eocn) > staleHours || ageH(ltl) > staleHours;
  } catch {
    return false;
  }
}

// ── PEP screening ─────────────────────────────────────────────────────────────
// Runs the OpenSanctions PEP corpus match in-process (same logic as
// /api/pep-match but without the HTTP round-trip). Result is merged into
// the unified response envelope.

interface PepHitSummary {
  id: string;
  name: string;
  score: number;
  positions: string[];
  countries: string[];
  topics: string[];
  birthDate?: string;
  isFormerPep: boolean;
}

async function runPepScreening(
  subjectName: string,
  aliases: string[] = [],
): Promise<{ hits: PepHitSummary[]; source: string; corpusSize: number }> {
  try {
    // Dynamically import to avoid bundling the pep corpus at startup.
    const { loadCorpus, scoreRecord, normName } =
      await import("@/lib/server/pep-corpus").catch(() => null) ??
      { loadCorpus: null, scoreRecord: null, normName: null };

    if (!loadCorpus || !scoreRecord || !normName) {
      return { hits: [], source: "unavailable", corpusSize: 0 };
    }

    const corpus = await loadCorpus();
    if (corpus.length === 0) return { hits: [], source: "none", corpusSize: 0 };

    const qNorm = normName(subjectName);
    const aliasNorms = aliases.map(normName);

    const MIN_SCORE = 0.45;
    const scored: Array<{ rec: unknown; score: number }> = [];
    for (const rec of corpus) {
      let s = scoreRecord(qNorm, rec);
      for (const an of aliasNorms) {
        const as2 = scoreRecord(an, rec);
        if (as2 > s) s = as2;
      }
      if (s >= MIN_SCORE) scored.push({ rec, score: s });
    }
    scored.sort((a, b) => b.score - a.score);

    const hits: PepHitSummary[] = scored.slice(0, 5).map(({ rec, score }) => {
      const r = rec as Record<string, unknown>;
      const topics = (r["topics"] as string[] | undefined) ?? [];
      return {
        id:          String(r["id"] ?? ""),
        name:        String(r["name"] ?? ""),
        score,
        positions:   (r["positions"] as string[] | undefined) ?? [],
        countries:   (r["countries"] as string[] | undefined) ?? [],
        topics,
        birthDate:   r["birthDate"] as string | undefined,
        isFormerPep: topics.includes("former_pep"),
      };
    });

    return { hits, source: "corpus", corpusSize: corpus.length };
  } catch {
    return { hits: [], source: "error", corpusSize: 0 };
  }
}

// ── PEP family/RCA graph lookup ───────────────────────────────────────────────
// Fires when a PEP hit is found. Fire-and-forget; result is not awaited on
// the response path so it never adds latency.

function firePepFamilyLookup(subjectName: string, tenantId: string): void {
  void (async () => {
    try {
      const { fetchPepFamilyNetwork } = await import("@/lib/intelligence/wikidata-pep");
      const network = await fetchPepFamilyNetwork(subjectName);
      // Write a structured audit event so MLRO can see the RCA network.
      void writeAuditChainEntry({
        event: "pep.family_graph.fetched",
        actor:     "system/pep-family-lookup",
        subjectName,
        nodeCount: ((network as unknown) as Record<string, unknown>)["nodeCount"] ?? 0,
        edgeCount: ((network as unknown) as Record<string, unknown>)["edgeCount"] ?? 0,
      }, tenantId).catch(() => undefined);
    } catch {
      // Non-critical — family graph is advisory only.
    }
  })();
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const t0 = Date.now();
  const thresholds = getScreeningThresholds();

  const reqId = req.headers.get("x-request-id") ?? randomUUID();
  const responseHeaders: Record<string, string> = {
    ...gate.headers,
    "x-request-id": reqId,
    "x-schema-version": SCHEMA_VERSION,
  };

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Request body is not valid JSON", requestId: reqId },
      { status: 400, headers: responseHeaders },
    );
  }

  const validation = validateRequest(raw);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: "validation_error", message: "Request validation failed", errors: validation.errors, requestId: reqId },
      { status: 400, headers: responseHeaders },
    );
  }
  const { subject, candidates: callerCandidates, options, requestId: callerRequestId } = validation.value;

  const ts       = new Date().toISOString();
  const resultId = buildResultId(subject, ts, callerRequestId);

  // Tier trace — captures each pipeline stage for Federal Decree-Law No. 10 of 2025 Art.18
  // explainability. Written to the audit chain with the screening result.
  const screeningTrace: Record<string, unknown> = {
    staleHoursThreshold: thresholds.staleListHours,
    decisiveThreshold:   thresholds.decisiveThreshold,
    minBaseScoreForHigh: thresholds.minBaseScoreForHigh,
  };

  // ── Adversarial input check ───────────────────────────────────────────────
  const adversarialCheck = await checkAdversarialInput(tenant, subject.name);
  screeningTrace["adversarialRisk"] = adversarialCheck.risk;
  if (adversarialCheck.risk !== "none") {
    void writeAuditChainEntry({
      event: "screening.adversarial_input_suspected",
      actor: gate.keyId,
      resultId,
      subjectName: subject.name,
      risk:    adversarialCheck.risk,
      reasons: adversarialCheck.reasons,
    }, tenant).catch(() => undefined);
  }

  // ── Multi-source sanctions screening — kicked off FIRST ───────────────────
  // The lanes are the long pole, so they start before the pre-work await:
  // wall-clock becomes max(prework, lanes) instead of their sum. Previously
  // the PEP corpus load ran serially ahead of the lanes and could alone blow
  // the 5s SLA on a cold start (its CDN fetch allows up to 30s).
  const lanesPromise = runMultiSourceScreening(
    subject,
    options,
    Array.isArray(callerCandidates) ? callerCandidates : undefined,
  );
  // Pre-attach a handler so a rejection while pre-work is awaited below is
  // never reported as unhandled; the real handling is the try/catch around
  // the await further down.
  lanesPromise.catch(() => undefined);

  // ── UAE list staleness + PEP screening (parallel, budget-capped) ───────────
  type PepScreenResult = Awaited<ReturnType<typeof runPepScreening>>;
  const [uaeStale, pepResult] = await Promise.race([
    Promise.all([
      isUaeListStale(thresholds.staleListHours),
      runPepScreening(subject.name, subject.aliases ?? []),
    ]),
    new Promise<[boolean, PepScreenResult]>((resolve) =>
      setTimeout(() => {
        screeningTrace["preworkTimedOut"] = true;
        // Degraded fallbacks: uaeStale=false (staleness unknown — the lane
        // health + verdict-reliability layers still surface list quality),
        // PEP source 'timeout' (consumers already tolerate non-corpus values).
        resolve([false, { hits: [], source: "timeout", corpusSize: 0 }]);
      }, SCREENING_BUDGETS.RUN_PREWORK_TIMEOUT_MS),
    ),
  ]);
  screeningTrace["uaeListsStale"]  = uaeStale;
  screeningTrace["pepSource"]      = pepResult.source;
  screeningTrace["pepCorpusSize"]  = pepResult.corpusSize;
  screeningTrace["pepHitsCount"]   = pepResult.hits.length;

  // Fire PEP family graph lookup when a PEP hit is found (non-blocking).
  if (pepResult.hits.length > 0) {
    firePepFamilyLookup(subject.name, tenant);
  }

  let msResult: Awaited<ReturnType<typeof runMultiSourceScreening>>;
  try {
    msResult = await lanesPromise;
  } catch (err) {
    console.error("[screening/run] runMultiSourceScreening threw", { reqId, resultId, detail: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { ok: false, error: "screening_failed", message: "Screening engine error", requestId: reqId, resultId, latencyMs: Date.now() - t0 },
      { status: 500, headers: responseHeaders },
    );
  }

  if (msResult.listsChecked === 0 && msResult.laneHealth?.["local_corpus"] === "degraded") {
    return NextResponse.json(
      { ok: false, error: "corpus_unavailable", degraded: true, requestId: reqId, resultId, latencyMs: Date.now() - t0 },
      { status: 503, headers: responseHeaders },
    );
  }

  const result     = msResult;
  const listsLoaded = msResult.listsChecked;

  // Capture lane health in the trace.
  screeningTrace["laneHealth"]     = msResult.laneHealth;
  screeningTrace["sourcesQueried"] = msResult.sourcesQueried;
  screeningTrace["listsChecked"]   = listsLoaded;
  screeningTrace["hitsBeforeAdverseMedia"] = result.hits.length;

  // ── Adverse media relevance scoring + deduplication ────────────────────────
  // Raw articles from LLM/news adapters are scored by relevance to the subject,
  // filtered below the threshold, and deduplicated across adapter sources.
  const rawAdverseArticles = (msResult.adverseMedia?.items ?? []) as unknown as Array<Record<string, unknown>>;
  const scoredArticles = scoreAndFilterArticles(subject.name, rawAdverseArticles);
  const mediaSeverity  = aggregateMediaSeverity(scoredArticles);
  screeningTrace["adverseMediaRawCount"]    = rawAdverseArticles.length;
  screeningTrace["adverseMediaScoredCount"] = scoredArticles.length;
  screeningTrace["adverseMediaSeverity"]    = mediaSeverity;

  // ── Audit chain entry ─────────────────────────────────────────────────────
  const auditWriter = new ScreeningAuditWriter({ matchThreshold: options?.scoreThreshold });
  void auditWriter
    .write(
      {
        event:               "screening.completed",
        actor:               gate.keyId,
        resultId,
        requestId:           reqId,
        subjectName:         subject.name,
        entityType:          subject.entityType,
        severity:            result.severity,
        topScore:            result.topScore,
        hitsCount:           result.hits.length,
        pepHitsCount:        pepResult.hits.length,
        listsLoaded,
        sourcesQueried:      msResult.sourcesQueried,
        laneHealth:          msResult.laneHealth,
        adverseMediaFound:   scoredArticles.length > 0,
        adverseMediaSeverity: mediaSeverity,
        screeningTrace,
      },
      tenant,
    )
    .catch((err) =>
      console.warn("[screening/run] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );

  // ── Post-screen side-effects (fire-and-forget) ────────────────────────────
  // Single canonical call — eliminates the duplicated block that previously
  // existed at lines 317–373 and 386–443. Handles:
  //   • compliance case auto-creation
  //   • UAE stale-list re-screen queue
  //   • pKYC auto-enrollment (medium+ severity — now present in this route)
  //   • bias monitor recording (with per-list source data)
  handlePostScreenResult({
    subject,
    result,
    resultId,
    tenantId: tenant,
    actorKeyId: gate.keyId,
    uaeStale,
  });

  const confidenceNote =
    listsLoaded > 0
      ? `Screened ${listsLoaded.toLocaleString()} watchlist entries across ${msResult.sourcesQueried.filter((s) => s !== "adverse_media").join(", ")}. ` +
        `Score is based on name similarity (Levenshtein + phonetic ensemble). ` +
        `Results should be reviewed by a qualified compliance officer before taking adverse action.`
      : "No watchlist entries available — result is based on caller-supplied candidates only.";

  const negativeEvidence = buildNegativeEvidence(result, listsLoaded);
  const requiresReverification = uaeStale;

  // Build PEP section for the response.
  const pepSection = pepResult.hits.length > 0
    ? {
        pepHits:           pepResult.hits,
        pepSource:         pepResult.source,
        pepCorpusSize:     pepResult.corpusSize,
        pepFamilyGraphPending: true, // graph is fetched async; poll /api/pep-family-graph
      }
    : {
        pepHits:   [] as PepHitSummary[],
        pepSource: pepResult.source,
      };

  // Determine combined severity: escalate if PEP hit is found.
  const pepEscalated =
    pepResult.hits.length > 0 &&
    (result.severity === "clear" || result.severity === "low");

  return NextResponse.json(
    {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      resultId,
      requestId: reqId,
      ...result,

      // PEP section
      ...pepSection,
      ...(pepEscalated ? {
        severity: "medium" as const,
        pepEscalated: true,
        pepEscalationNote: "Severity escalated to MEDIUM because subject matched a PEP record. EDD required under FATF R.12.",
      } : {}),

      // Adverse media — scored and deduplicated
      adverseMedia: {
        ...(msResult.adverseMedia ?? {}),
        scoredArticles,
        severity:  mediaSeverity,
        found:     scoredArticles.length > 0,
        rawCount:  rawAdverseArticles.length,
      },

      provisionalScreening: uaeStale,
      ...(requiresReverification ? {
        requiresReverification: true,
        reverificationReason: "Screened while one or more mandatory lists were stale (>36h). Result must be re-verified after the next successful sanctions list refresh. Federal Decree-Law No. 10 of 2025 Art.15.",
      } : {}),

      adversarialRisk: adversarialCheck.risk !== "none" ? adversarialCheck.risk : undefined,
      negativeEvidence,
      confidenceNote,

      // Tier trace — intermediate pipeline decisions for explainability audit
      screeningTrace,

      sourcesQueried: msResult.sourcesQueried,
      laneHealth:     msResult.laneHealth,
      latencyMs:      Date.now() - t0,

      unresolvedAmbiguity:
        result.severity === "medium" || result.topScore >= 70
          ? ["Manual reviewer must confirm or dismiss hits. Automated disposition not permitted for scores >= 70."]
          : [],
    },
    { headers: responseHeaders },
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key, x-request-id",
    },
  });
}
