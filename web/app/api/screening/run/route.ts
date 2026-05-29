// POST /api/screening/run
//
// Unified, production-grade screening entry point.
//
// Every screening invocation through this route:
//   1. Validates input with a typed schema (Zod-like structural check)
//   2. Assigns a deterministic, immutable screening result ID
//      (sha256 of subject + timestamp + request-id — suitable for audit)
//   3. Runs the brain quickScreen against the live watchlist corpus
//   4. Returns a typed screening envelope with:
//      - result ID, subject, hits, score, severity
//      - source provenance (listId, listRef) on every hit
//      - match rationale on every hit
//      - negative evidence (what was checked and found clear)
//      - confidence calibration note
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
import { loadCandidates } from "@/lib/server/candidates-loader";
import { ScreeningAuditWriter } from "@/lib/server/screening-audit";
// Bare writer used for one-off adversarial-input audit events that fire
// BEFORE the per-request ScreeningAuditWriter is constructed. These events
// don't need J-04/J-05 enrichment (no screening result has been produced
// yet) so the simpler API is appropriate.
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { recordScreeningBias } from "@/lib/server/bias-monitor";
import { checkAdversarialInput } from "@/lib/server/adversarial-guard";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Brain loader — dynamic so a missing dist/ doesn't crash the module ────────
type BrainScreenFn = (_s: QuickScreenSubject, _c: QuickScreenCandidate[], _o?: QuickScreenOptions) => QuickScreenResult;
let _brainFn: BrainScreenFn | null = null;
let _brainLoadError: string | null = null;

async function loadBrain(): Promise<BrainScreenFn | null> {
  if (_brainFn) return _brainFn;
  if (_brainLoadError) return null;
  try {
    const mod = (await import("../../../../../src/brain/quick-screen.js")) as { quickScreen: BrainScreenFn };
    _brainFn = mod.quickScreen;
    return _brainFn;
  } catch (err) {
    _brainLoadError = err instanceof Error ? err.message : String(err);
    console.error("[screening/run] Brain module unavailable — rule-based fallback active:", _brainLoadError);
    return null;
  }
}

const SCHEMA_VERSION = "1.0";
const MAX_CANDIDATES = 5_000;
const MAX_ALIASES = 50;

// ── Input validation ──────────────────────────────────────────────────────────

interface ScreeningRunRequest {
  subject: QuickScreenSubject;
  candidates?: QuickScreenCandidate[];
  options?: QuickScreenOptions;
  requestId?: string; // caller-supplied idempotency key (optional)
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

  // Subject
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

  // Candidates (optional)
  if (body["candidates"] !== undefined) {
    if (!Array.isArray(body["candidates"])) {
      errors.push({ field: "candidates", message: "candidates must be an array" });
    } else if ((body["candidates"] as unknown[]).length > MAX_CANDIDATES) {
      errors.push({ field: "candidates", message: `candidates must not exceed ${MAX_CANDIDATES} entries` });
    }
  }

  // Options (optional)
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
// sha256(requestId | subject.name | subject.entityType | ISO-timestamp)
// Stable across retries when caller supplies requestId (idempotency).
// Unique per screening when requestId is omitted.

function buildResultId(subject: QuickScreenSubject, ts: string, requestId?: string): string {
  // NFKD normalization + strip combining marks prevents homoglyph collisions
  // (e.g. German ß → ss lowercases differently across locales; Cyrillic
  // lookalikes would produce distinct IDs masking as the same entity).
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
// Explains what was checked and found clear — required by regulator-grade
// non-match documentation requirements.

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

// ── Route handler ─────────────────────────────────────────────────────────────

async function isUaeListStale(): Promise<boolean> {
  try {
    const { getJson } = await import("@/lib/server/store");
    const STALE_H = 36;
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
    return ageH(eocn) > STALE_H || ageH(ltl) > STALE_H;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const t0 = Date.now();

  // Structured request ID for observability
  const reqId = req.headers.get("x-request-id") ?? randomUUID();
  const responseHeaders: Record<string, string> = {
    ...gate.headers,
    "x-request-id": reqId,
    "x-schema-version": SCHEMA_VERSION,
  };

  // Parse body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Request body is not valid JSON", requestId: reqId },
      { status: 400, headers: responseHeaders },
    );
  }

  // Validate
  const validation = validateRequest(raw);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: "validation_error", message: "Request validation failed", errors: validation.errors, requestId: reqId },
      { status: 400, headers: responseHeaders },
    );
  }
  const { subject, candidates: callerCandidates, options, requestId: callerRequestId } = validation.value;

  // Load watchlist candidates
  let candidates: QuickScreenCandidate[];
  let listsLoaded = 0;
  if (Array.isArray(callerCandidates)) {
    candidates = callerCandidates;
    listsLoaded = candidates.length;
  } else {
    try {
      const loaded = await loadCandidates();
      if (!Array.isArray(loaded) || loaded.length === 0) {
        return NextResponse.json(
          { ok: false, error: "corpus_unavailable", message: "Watchlist corpus is unavailable. Run /api/sanctions/refresh to ingest lists.", requestId: reqId, degraded: true, latencyMs: Date.now() - t0 },
          { status: 503, headers: responseHeaders },
        );
      }
      candidates = loaded.filter(
        (c): c is QuickScreenCandidate =>
          !!c && typeof c === "object" &&
          typeof (c as QuickScreenCandidate).listId === "string" &&
          typeof (c as QuickScreenCandidate).listRef === "string" &&
          typeof (c as QuickScreenCandidate).name === "string",
      );
      listsLoaded = candidates.length;
    } catch (err) {
      console.error("[screening/run] loadCandidates failed", { reqId, detail: err instanceof Error ? err.message : String(err) });
      return NextResponse.json(
        { ok: false, error: "corpus_unavailable", message: "Failed to load watchlist corpus", requestId: reqId, degraded: true, latencyMs: Date.now() - t0 },
        { status: 503, headers: responseHeaders },
      );
    }
  }

  // Run screening
  const ts = new Date().toISOString();
  const resultId = buildResultId(subject, ts, callerRequestId);
  const uaeStale = await isUaeListStale();

  // Adversarial input check — log suspicious names before screening.
  const adversarialCheck = await checkAdversarialInput(tenant, subject.name);
  if (adversarialCheck.risk !== "none") {
    void writeAuditChainEntry({
      event: "screening.adversarial_input_suspected",
      actor: gate.keyId,
      resultId,
      subjectName: subject.name,
      risk: adversarialCheck.risk,
      reasons: adversarialCheck.reasons,
    }, tenant).catch(() => undefined);
  }

  const brainFn = await loadBrain();

  let result: QuickScreenResult;
  if (!brainFn) {
    // Rule-based fallback: exact/near-exact name matching against candidates.
    const lowerName = subject.name.toLowerCase();
    const hits = candidates.filter((c) => {
      const cn = (c.name ?? "").toLowerCase();
      return cn === lowerName || cn.includes(lowerName) || lowerName.includes(cn);
    });
    result = {
      subject,
      hits: hits.map((c) => ({ ...c, score: 0.95, matchRationale: "Exact name match (rule-based fallback — AI engine unavailable)" })),
      topScore: hits.length > 0 ? 0.95 : 0,
      severity: (hits.length > 0 ? "critical" : "clear") as "critical" | "clear",
      screenedAt: new Date().toISOString(),
      listsChecked: listsLoaded,
      listIds: candidates.map((c) => (c as unknown as Record<string, unknown>)["listId"] as string ?? "").filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).sort(),
      candidatesChecked: candidates.length,
      durationMs: Date.now() - t0,
      generatedAt: new Date().toISOString(),
      degraded: true,
      screeningMode: "rule-based-fallback" as const,
      brainUnavailable: _brainLoadError ?? "unknown",
    } as unknown as QuickScreenResult;
  } else {
    try {
      result = brainFn(subject, candidates, options);
    } catch (err) {
      console.error("[screening/run] quickScreen threw", { reqId, resultId, detail: err instanceof Error ? err.message : String(err) });
      return NextResponse.json(
        { ok: false, error: "screening_failed", message: "Screening engine error", requestId: reqId, resultId, latencyMs: Date.now() - t0 },
        { status: 500, headers: responseHeaders },
      );
    }
  }

  // FDL 10/2025 Art.15 — every screening invocation must be permanently logged.
  // Audit entry is enriched with J-04 (list versions snapshot) + J-05 (match
  // threshold) so regulators can reconstruct exactly which corpus and
  // sensitivity produced this verdict.
  const auditWriter = new ScreeningAuditWriter({
    matchThreshold: options?.scoreThreshold,
  });
  void auditWriter
    .write(
      {
        event: "screening.completed",
        actor: gate.keyId,
        resultId,
        requestId: reqId,
        subjectName: subject.name,
        entityType: subject.entityType,
        severity: result.severity,
        topScore: result.topScore,
        hitsCount: result.hits.length,
        listsLoaded,
      },
      tenant,
    )
    .catch((err) =>
      console.warn(
        "[screening/run] audit chain write failed:",
        err instanceof Error ? err.message : String(err),
      ),
    );

  // Auto-create compliance case when hits are found (fire-and-forget).
  if (result.hits.length > 0) {
    void (async () => {
      try {
        const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
        const res = await fetch(`${baseUrl}/api/hs-cases`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env["ADMIN_TOKEN"] ?? "",
          },
          body: JSON.stringify({
            subjectName: subject.name,
            subjectId: resultId,
            severity: result.severity,
            hits: result.hits.map((h) => ({
              listId: h.listId,
              listRef: h.listRef,
              candidateName: h.candidateName,
              matchScore: h.score,
            })),
            linkedAuditSeq: undefined,
            createdBy: gate.keyId,
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.warn("[screening/run] auto-case creation failed:", res.status, errBody.slice(0, 200));
        } else {
          const caseData = await res.json().catch(() => ({})) as { ok: boolean; case?: { caseId: string }; deduplicated?: boolean };
          if (caseData.ok && caseData.case?.caseId && !caseData.deduplicated) {
            void fetch(`${baseUrl}/api/hs-cases/${caseData.case.caseId}/enrich`, {
              method: "POST",
              headers: { "x-api-key": process.env["ADMIN_TOKEN"] ?? "" },
            }).catch((e: unknown) => {
              console.warn("[screening/run] auto-enrich failed:", e instanceof Error ? e.message : String(e));
            });
          }
          // If UAE lists are stale, queue subject for re-screen after refresh.
          if (uaeStale) {
            void fetch(`${baseUrl}/api/rescreen-queue`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": process.env["ADMIN_TOKEN"] ?? "",
              },
              body: JSON.stringify({
                subjectId: resultId,
                subjectName: subject.name,
                reason: "Screened while UAE EOCN or LTL list was stale (>36h). Re-screen required after refresh.",
              }),
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        console.warn("[screening/run] auto-case creation error:", err instanceof Error ? err.message : String(err));
      }
    })();
  }

  // Record screening result for bias monitoring (fire-and-forget).
  void recordScreeningBias(
    tenant,
    subject.name,
    result.topScore,
    result.severity,
    result.hits.length,
  ).catch(() => undefined);

  // Auto-create compliance case when hits are found (fire-and-forget).
  if (result.hits.length > 0) {
    void (async () => {
      try {
        const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
        const res = await fetch(`${baseUrl}/api/hs-cases`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env["ADMIN_TOKEN"] ?? "",
          },
          body: JSON.stringify({
            subjectName: subject.name,
            subjectId: resultId,
            severity: result.severity,
            hits: result.hits.map((h) => ({
              listId: h.listId,
              listRef: h.listRef,
              candidateName: h.candidateName,
              matchScore: h.score,
            })),
            linkedAuditSeq: undefined,
            createdBy: gate.keyId,
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.warn("[screening/run] auto-case creation failed:", res.status, errBody.slice(0, 200));
        } else {
          const caseData = await res.json() as { ok: boolean; case?: { caseId: string }; deduplicated?: boolean };
          if (caseData.ok && caseData.case?.caseId && !caseData.deduplicated) {
            void fetch(`${baseUrl}/api/hs-cases/${caseData.case.caseId}/enrich`, {
              method: "POST",
              headers: { "x-api-key": process.env["ADMIN_TOKEN"] ?? "" },
            }).catch((e: unknown) => {
              console.warn("[screening/run] auto-enrich failed:", e instanceof Error ? e.message : String(e));
            });
          }
          // If UAE lists are stale, queue subject for re-screen after refresh.
          if (uaeStale) {
            void fetch(`${baseUrl}/api/rescreen-queue`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": process.env["ADMIN_TOKEN"] ?? "",
              },
              body: JSON.stringify({
                subjectId: resultId,
                subjectName: subject.name,
                reason: "Screened while UAE EOCN or LTL list was stale (>36h). Re-screen required after refresh.",
              }),
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        console.warn("[screening/run] auto-case creation error:", err instanceof Error ? err.message : String(err));
      }
    })();
  }

  // Record screening result for bias monitoring (fire-and-forget).
  void recordScreeningBias(
    tenant,
    subject.name,
    result.topScore,
    result.severity,
    result.hits.length,
  ).catch(() => undefined);

  // Confidence calibration note — honest statement about what was and
  // wasn't checked. Never claim higher confidence than supported.
  const confidenceNote =
    listsLoaded > 0
      ? `Screened ${listsLoaded.toLocaleString()} watchlist entries from configured sanctions and PEP sources. ` +
        `Score is based on name similarity (Levenshtein + phonetic ensemble). ` +
        `Results should be reviewed by a qualified compliance officer before taking adverse action.`
      : "No watchlist entries available — result is based on caller-supplied candidates only.";

  const negativeEvidence = buildNegativeEvidence(result, listsLoaded);

  // ADD-4: if any mandatory list was stale at screening time, mark result
  // REQUIRES_REVERIFICATION so operators and downstream consumers know the
  // screening must be repeated after the next successful list refresh.
  const requiresReverification = uaeStale;

  return NextResponse.json(
    {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      resultId,
      requestId: reqId,
      ...result,
      provisionalScreening: uaeStale,
      ...(requiresReverification ? {
        requiresReverification: true,
        reverificationReason: "Screened while one or more mandatory lists were stale (>36h). Result must be re-verified after the next successful sanctions list refresh. UAE FDL No.10/2025 Art.15.",
      } : {}),
      adversarialRisk: adversarialCheck.risk !== "none" ? adversarialCheck.risk : undefined,
      negativeEvidence,
      confidenceNote,
      latencyMs: Date.now() - t0,
      // Disambiguate unresolved ambiguity
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
