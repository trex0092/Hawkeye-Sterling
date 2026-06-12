import { NextResponse } from "next/server";
// Import from the concrete module, not the index barrel — see super-brain
// route for why pulling in the 80-module barrel at cold-start kills these
// Netlify Functions with 502s.
import { quickScreen as _quickScreen } from "../../../../src/brain/quick-screen.js";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";
import { loadCandidatesWithHealth, coreSanctionsCoverageGaps } from "@/lib/server/candidates-loader";
import { classifyAdverseKeywords } from "@/lib/data/adverse-keywords";

const _BATCH_CONCURRENCY = 5; // max concurrent rows when using external validators

const KEYWORD_GROUP_WEIGHT: Record<string, number> = {
  "terrorism-financing": 20,
  "proliferation-wmd": 20,
  "regulatory-action": 14,
  "bribery-corruption": 14,
  "money-laundering": 14,
  "organised-crime": 14,
  "environmental-crime": 12,
  "human-trafficking": 12,
  "fraud-forgery": 12,
  "market-abuse": 10,
  "tax-crime": 10,
  "cybercrime": 10,
  "insider-threat": 10,
  "ai-misuse": 10,
  "law-enforcement": 6,
  "political-exposure": 2,
};

function scoreToBand(score: number): string {
  if (score >= 95) return "critical";
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  if (score > 0) return "low";
  return "clear";
}
import { classifyEsg } from "@/lib/data/esg";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { postWebhook } from "@/lib/server/webhook";
import { getIdempotencyKey, getIdempotent, storeIdempotent } from "@/lib/server/idempotency";
// Optional cross-validation services (all fail-soft — no env var = no-op).
import { checkWatchman } from "@/lib/server/watchman-client";   // moov-io/watchman
import { checkMarble } from "@/lib/server/marble-client";       // checkmarble/marble
import { checkJube } from "@/lib/server/jube-client";           // jube AML
import { yenteMatch } from "../../../../src/integrations/yente.js"; // opensanctions/yente FtM matching
import { asanaGids } from "@/lib/server/asanaConfig";
import { runEgressCheck } from "@/lib/server/egress-check";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { recordDecision } from "@/lib/server/drift-monitor";
import { recordScreeningBias } from "@/lib/server/bias-monitor";

type QuickScreenFn = (
  _subject: QuickScreenSubject,
  _candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;

function batchScreenProjectGid(): string {
  return asanaGids.screening();
}

// Process up to 5 subjects in parallel to avoid overwhelming downstream APIs
const CONCURRENCY = 5;
async function processWithConcurrency<T>(items: T[], fn: (_item: T) => Promise<unknown>) {
  const results = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface BatchRow {
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  dob?: string;
  gender?: string;
  idNumber?: string;
}

interface Body {
  rows: BatchRow[];
}

interface CrossRef {
  watchmanHits?: number;
  marbleStatus?: string;
  jubeRisk?: number;
  yenteScore?: number;       // opensanctions/yente FtM match score 0-1
  yenteDatasets?: string[];  // datasets that produced the yente hit
}

interface RowResult {
  name: string;
  entityType?: string;
  aliases?: string[];
  dob?: string;
  gender?: string;
  jurisdiction?: string;
  idNumber?: string;
  topScore: number;
  rawScore: number;
  severity: string;
  hitCount: number;
  listCoverage: string[];
  keywordGroups: string[];
  esgCategories: string[];
  durationMs: number;
  error?: string;
  // KYC-analyst style checkpoint flags (github.com/vyayasan/kyc-analyst)
  checkpoints?: string[];
  // Optional cross-validation from external services
  crossRef?: CrossRef;
}

// Lightweight rule-based checkpoints inspired by kyc-analyst's 17-checkpoint
// pattern (github.com/vyayasan/kyc-analyst). Applied per-row, zero latency.
function computeCheckpoints(
  row: BatchRow,
  screen: QuickScreenResult,
  kwGroups: string[],
  esgCats: string[],
): string[] {
  const flags: string[] = [];
  const lists = Array.from(new Set(screen.hits.map((h) => h.listId)));

  const allEntityAssociation =
    screen.hits.length > 0 &&
    screen.hits.every((h) => h.entityTypeMismatch === true);
  if (screen.hits.length > 0) flags.push(allEntityAssociation ? "entity-association" : "sanctions-hit");
  if (lists.some((l) => l.toLowerCase().includes("pep"))) flags.push("pep-flag");
  if (kwGroups.length > 0) flags.push("adverse-media");
  if (esgCats.length > 0) flags.push("esg-concern");
  if (screen.topScore >= 70 && screen.topScore < 95) flags.push("needs-disambiguation");
  if (row.entityType === "individual" && !row.dob) flags.push("missing-dob");
  if (row.name.trim().split(/\s+/).length === 1) flags.push("single-name-flag");
  if (!row.jurisdiction) flags.push("no-jurisdiction");
  if (lists.length >= 2) flags.push("multi-list-hit");
  if (/\d/.test(row.name)) flags.push("numeric-in-name");

  return flags;
}

export async function POST(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  // Batch is the single highest-cost endpoint (500 rows × brain
  // screening each). Gate + rate-limit before touching the body.
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  // D6 - idempotency-key support. If the caller passes
  // `Idempotency-Key: <token>` and we have a prior cached response
  // for that key, return it without re-running the screen + Asana
  // task fanout. Prevents duplicate Asana tasks on automatic retry
  // (RULE 12 / RULE 6 retry safety).
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const cached = await getIdempotent(idemKey);
    if (cached) {
      return new NextResponse(cached.body, {
        status: cached.status,
        headers: {
          ...gateHeaders,
          "content-type": "application/json; charset=utf-8",
          "x-idempotent-replay": "true",
          "x-idempotent-original-request-id": cached.originalRequestId,
          "x-idempotent-original-at": cached.at,
        },
      });
    }
  }

  // Load live watchlist corpus once per batch request (cached in-process).
  // Refuse the batch if a core sanctions list is missing — a degraded corpus
  // would mark sanctioned rows CLEAR across the whole file (operator policy
  // 2026-06-11: never a verdict against partial coverage).
  const { candidates: CANDIDATES, health: corpusHealth } = await loadCandidatesWithHealth();
  const missingCore = coreSanctionsCoverageGaps(CANDIDATES);
  if (missingCore.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "LISTS_MISSING",
        degraded: true,
        missingLists: missingCore,
        message: `Batch screening cannot proceed: core sanctions list(s) not loaded (${missingCore.join(", ")}). Coverage would be incomplete — refusing to screen. Retry shortly; the corpus reloads automatically.`,
        dataSourceHealth: { source: corpusHealth.source, healthy: corpusHealth.healthy, failedAdapters: corpusHealth.failedAdapters },
      },
      { status: 503, headers: gateHeaders },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json(
      { ok: false, error: "rows must be an array" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (body.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "rows is empty" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (body.rows.length > 10_000) {
    return NextResponse.json(
      { ok: false, error: "batch size exceeds 10000-row limit" },
      { status: 400, headers: gateHeaders },
    );
  }
  // Batches over 500 rows use a fast-path that skips external cross-validation
  // (Watchman, Marble, Jube, Yente) — each adds 1-5s per row and would exhaust
  // the function budget. In-memory quickScreen + keyword classification runs at
  // ~1ms/row so 10,000 rows completes in ~10s well within maxDuration.
  const useFastPath = body.rows.length > 500;

  const started = Date.now();
  const results: RowResult[] = [];

  async function processRow(row: (typeof body.rows)[number]): Promise<RowResult> {
    if (!row?.name?.trim()) {
      return {
        name: row?.name ?? "",
        topScore: 0,
        rawScore: 0,
        severity: "error",
        hitCount: 0,
        listCoverage: [],
        keywordGroups: [],
        esgCategories: [],
        durationMs: 0,
        error: "empty name",
      };
    }
    const t0 = Date.now();
    // Validate alias elements — drop non-string entries to prevent type confusion.
    const cleanAliases = Array.isArray(row.aliases)
      ? (row.aliases as unknown[]).filter((a): a is string => typeof a === "string")
      : [];
    const subject = {
      name: row.name.trim(),
      ...(cleanAliases.length ? { aliases: cleanAliases } : {}),
      ...(row.entityType ? { entityType: row.entityType } : {}),
      ...(row.jurisdiction ? { jurisdiction: row.jurisdiction } : {}),
    };
    const screen = quickScreen(subject, CANDIDATES);
    const haystack = `${row.name} ${(row.aliases ?? []).join(" ")}`;
    const kw = classifyAdverseKeywords(haystack);
    const esg = classifyEsg(haystack);
    const kwGroups = Array.from(new Set(kw.map((k) => k.group)));
    const esgCats = Array.from(new Set(esg.map((e) => e.categoryId)));

    // Keyword-adjusted composite score — adverse-media keywords must factor
    // into risk severity so a subject with terrorism-financing or
    // money-laundering coverage cannot score "clear".
    const kwBoost = Math.min(30, kwGroups.reduce((sum, g) => sum + (KEYWORD_GROUP_WEIGHT[g] ?? 0), 0));
    const adjustedScore = Math.min(100, screen.topScore + kwBoost);
    const adjustedSeverity = scoreToBand(adjustedScore);

    const checkpoints = computeCheckpoints(row, screen, kwGroups, esgCats);

    // External cross-validation is skipped for large batches (>500 rows) —
    // each service adds 1-5s per row which would exhaust the function budget.
    const [watchmanRes, marbleRes, jubeRes, yenteRes] = useFastPath
      ? [null, null, null, null]
      : await Promise.all([
          checkWatchman(row.name),
          checkMarble(row.name, row.entityType),
          checkJube(row.name, row.entityType, row.jurisdiction),
          yenteMatch([{
            name: row.name,
            schema: row.entityType === "individual" ? "Person" : row.entityType === "organisation" ? "Organization" : "LegalEntity",
            ...(row.jurisdiction ? { nationality: row.jurisdiction } : {}),
          }]).catch((err: unknown) => {
            console.warn("[hawkeye] batch-screen yenteMatch failed for row:", row.name, err);
            return null;
          }),
        ]);

    const crossRef: CrossRef = {};
    if (watchmanRes !== null) crossRef.watchmanHits = watchmanRes.hitCount;
    if (marbleRes !== null) crossRef.marbleStatus = marbleRes.status;
    if (jubeRes !== null) crossRef.jubeRisk = jubeRes.riskScore;
    const yenteTop = Array.isArray(yenteRes) ? yenteRes[0]?.hits[0] : null;
    if (yenteTop) {
      crossRef.yenteScore = yenteTop.score;
      crossRef.yenteDatasets = yenteTop.datasets;
    }

    const row_result: RowResult = {
      name: row.name,
      topScore: adjustedScore,
      rawScore: screen.topScore,
      severity: adjustedSeverity,
      hitCount: screen.hits.length,
      listCoverage: Array.from(new Set(screen.hits.map((h) => h.listId))),
      keywordGroups: kwGroups,
      esgCategories: esgCats,
      durationMs: Date.now() - t0,
      checkpoints,
      ...(Object.keys(crossRef).length > 0 ? { crossRef } : {}),
    };
    if (row.entityType) row_result.entityType = row.entityType;
    if (row.aliases && row.aliases.length) row_result.aliases = row.aliases;
    if (row.dob) row_result.dob = row.dob;
    if (row.gender) row_result.gender = row.gender;
    if (row.jurisdiction) row_result.jurisdiction = row.jurisdiction;
    if (row.idNumber) row_result.idNumber = row.idNumber;
    return row_result;
  }

  // Process subjects in parallel with a 5-concurrency limiter and a 30s
  // per-subject timeout so one slow subject cannot block the entire batch.
  // The fast-path (>500 rows) skips external validators (~1ms/row) so the
  // concurrency window still provides ordering without meaningful wait.
  const settled = await processWithConcurrency(body.rows, (row) =>
    Promise.race([
      processRow(row),
      new Promise<RowResult>((_, reject) =>
        setTimeout(() => reject(new Error("per-subject timeout")), 30_000)
      ),
    ]).catch((err: unknown) => {
      const isTimeout = err instanceof Error && err.message === "per-subject timeout";
      console.error(
        "[batch-screen] processRow failed:",
        err instanceof Error ? err.message : err,
      );
      return {
        name: row?.name ?? "",
        topScore: 0,
        rawScore: 0,
        severity: "error" as const,
        hitCount: 0,
        listCoverage: [] as string[],
        keywordGroups: [] as string[],
        esgCategories: [] as string[],
        durationMs: 0,
        error: isTimeout ? "screening timed out" : "Screening failed — please retry.",
      } satisfies RowResult;
    })
  );

  for (const s of settled) {
    // processWithConcurrency uses Promise.allSettled; each item is always
    // fulfilled because the .catch() above converts rejections to RowResult.
    if (s.status === "fulfilled") results.push(s.value as RowResult);
  }

  const summary = {
    total: results.length,
    critical: results.filter((r) => r.severity === "critical").length,
    high: results.filter((r) => r.severity === "high").length,
    medium: results.filter((r) => r.severity === "medium").length,
    low: results.filter((r) => r.severity === "low").length,
    clear: results.filter((r) => r.severity === "clear").length,
    errors: results.filter((r) => r.error).length,
    totalDurationMs: Date.now() - started,
  };

  // Post an Asana task for any CRITICAL / HIGH hits so the MLRO is
  // notified even when the analyst doesn't manually review the results.
  const elevated = results.filter(
    (r) => r.severity === "critical" || r.severity === "high",
  );
  let asanaTaskUrl: string | undefined;
  const token = process.env["ASANA_TOKEN"];
  if (elevated.length > 0 && token) {
    const topSeverity = elevated.some((r) => r.severity === "critical")
      ? "CRITICAL"
      : "HIGH";
    const runAt = new Date().toISOString();
    const lines: string[] = [
      `HAWKEYE STERLING · BATCH SCREENING ALERT`,
      `Run at           : ${runAt}`,
      `Batch size       : ${results.length} subjects`,
      `Elevated (≥HIGH) : ${elevated.length}`,
      ``,
      `── ELEVATED SUBJECTS ──`,
    ];
    for (const r of elevated.slice(0, 30)) {
      lines.push(
        `• [${r.severity.toUpperCase()}] ${r.name}` +
          (r.jurisdiction ? ` · ${r.jurisdiction}` : "") +
          ` · score ${r.topScore} · ${r.hitCount} hit(s)` +
          (r.listCoverage.length ? ` · lists: ${r.listCoverage.join(", ")}` : ""),
      );
    }
    if (elevated.length > 30) lines.push(`  … and ${elevated.length - 30} more`);
    lines.push(``);
    lines.push(`Summary: critical ${summary.critical} · high ${summary.high} · medium ${summary.medium} · low ${summary.low} · clear ${summary.clear}`);
    lines.push(`Legal   : Federal Decree-Law No. 10 of 2025 Art.26-27 · CR 134/2025 Art.18`);
    // Egress gate: compliance pre-check before MLRO inbox delivery.
    const egressResult = await runEgressCheck(lines.join("\n"), "Batch screening alert");
    if (!egressResult.allowed) {
      console.warn("[batch-screen] egress gate held Asana delivery:", egressResult.verdict, egressResult.reason);
      // Do not surface gate decision to the caller — log it, skip Asana, continue response.
      // (Batch screen returns results regardless; the gate only controls MLRO inbox delivery.)
    } else {
      try {
        const res = await fetch("https://app.asana.com/api/1.0/tasks", {
          signal: AbortSignal.timeout(15_000),
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            data: {
              name: `[BATCH · ${topSeverity}] ${elevated.length} elevated subject(s) — ${results.length} total screened`,
              notes: lines.join("\n"),
              projects: [batchScreenProjectGid()],
              workspace: asanaGids.workspace(),
              assignee: asanaGids.assignee(),
            },
          }),
        });
        const payload = (await res.json().catch((err: unknown) => {
          console.warn("[hawkeye] batch-screen Asana response parse failed:", err);
          return null;
        })) as
          | { data?: { permalink_url?: string } }
          | null;
        if (res.ok && payload?.data?.permalink_url) asanaTaskUrl = payload.data.permalink_url;
      } catch (err) {
        console.warn("[hawkeye] batch-screen Asana POST threw — batch results still returned to caller:", err);
      }
    } // end egress gate else
  } // end if (elevated.length > 0 && token)

  // C-6: Record each result for drift and bias monitoring so these monitors
  // are not blind to the highest-volume screening path. Fire-and-forget.
  const tenantForMonitors = tenantIdFromGate(gate);
  for (const result of results) {
    void recordDecision(tenantForMonitors, result.severity, result.topScore / 100, result.topScore).catch(() => undefined);
    void recordScreeningBias(tenantForMonitors, result.name, result.topScore, result.severity, result.hitCount).catch(() => undefined);
  }

  // Write tamper-evident audit chain entry for this batch screen run.
  void writeAuditChainEntry({
    event: "batch.screen_completed",
    actor: gate.keyId ?? "system",
    totalSubjects: body.rows.length,
    criticalHits: results.filter((r) => r.severity === "critical").length,
    requestedBy: gate.keyId,
  }, tenantIdFromGate(gate)).catch((e) =>
    console.warn("[audit] batch screen write failed:", e instanceof Error ? e.message : String(e))
  );

  // Fire webhook for batch completion (elevated subjects only surfaced
  // in newHits so the consumer can page/route without parsing the full list).
  void postWebhook({
    type: "screening.completed",
    subjectId: "BATCH",
    subjectName: `Batch · ${results.length} subjects`,
    severity: summary.critical > 0 ? "critical" : summary.high > 0 ? "high" : summary.medium > 0 ? "medium" : "clear",
    topScore: Math.max(...results.map((r) => r.topScore), 0),
    newHits: elevated.slice(0, 10).map((r) => ({
      listId: r.listCoverage[0] ?? "unknown",
      listRef: r.listCoverage[0] ?? "unknown",
      candidateName: r.name,
    })),
    ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
    generatedAt: new Date().toISOString(),
    source: "hawkeye-sterling",
  }).catch((err) => console.error("[batch-screen] webhook failed", err));

  const latencyMs = Date.now() - t0;
  if (latencyMs > 5000) console.warn(`[batch-screen] slow response latencyMs=${latencyMs}`);
  const responseBody = { ok: true, summary, results, latencyMs, ...(asanaTaskUrl ? { asanaTaskUrl } : {}) };
  const responseBodyJson = JSON.stringify(responseBody);

  // Persist the response under the idempotency key so retries within
  // the 24h cache window get the same body without re-creating Asana
  // tasks. Fire-and-forget so the original caller doesn't wait on the
  // Blobs write.
  if (idemKey) {
    const requestId = req.headers.get("x-request-id") ?? "unknown";
    void storeIdempotent(idemKey, {
      at: new Date().toISOString(),
      status: 200,
      body: responseBodyJson,
      originalRequestId: requestId,
    }).catch(() => undefined);
  }

  return new NextResponse(responseBodyJson, {
    status: 200,
    headers: { ...gateHeaders, "content-type": "application/json; charset=utf-8" },
  });
}
