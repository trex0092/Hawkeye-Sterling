import { NextResponse } from "next/server";
// Import from the concrete module, not the index barrel — see super-brain
// route for why pulling in the 80-module barrel at cold-start kills these
// Netlify Functions with 502s.
import { quickScreen as _quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { classifyAdverseKeywords } from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";
import { enforce } from "@/lib/server/enforce";
import { postWebhook } from "@/lib/server/webhook";
// Optional cross-validation services (all fail-soft — no env var = no-op).
import { checkWatchman } from "@/lib/server/watchman-client";   // moov-io/watchman
import { checkMarble } from "@/lib/server/marble-client";       // checkmarble/marble
import { checkJube } from "@/lib/server/jube-client";           // jube AML
import { yenteMatch } from "../../../../dist/src/integrations/yente.js"; // opensanctions/yente FtM matching
import { asanaGids } from "@/lib/server/asanaConfig";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;

function batchScreenProjectGid(): string {
  return asanaGids.screening();
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

  if (screen.hits.length > 0) flags.push("sanctions-hit");
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
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  // Load live watchlist corpus once per batch request (cached in-process).
  const CANDIDATES = await loadCandidates();

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

  // For small batches (≤500 rows) that use external validators, process rows in
  // concurrent chunks so multiple external calls overlap. Fast-path (>500 rows)
  // skips external validators and runs at ~1ms/row so chunking adds no value.
  const BATCH_CONCURRENCY = 10;

  const started = Date.now();
  const results: RowResult[] = [];

  async function processRow(row: (typeof body.rows)[number]): Promise<RowResult> {
    if (!row?.name?.trim()) {
      return {
        name: row?.name ?? "",
        topScore: 0,
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
      topScore: screen.topScore,
      severity: screen.severity,
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

  if (useFastPath) {
    // Fast-path: sequential, ~1ms/row, no external I/O — chunking adds overhead.
    for (const row of body.rows) {
      try {
        results.push(await processRow(row));
      } catch (err) {
        results.push({
          name: row?.name ?? "",
          topScore: 0,
          severity: "error",
          hitCount: 0,
          listCoverage: [],
          keywordGroups: [],
          esgCategories: [],
          durationMs: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else {
    // Small batches with external validators: process in concurrent chunks so
    // external calls for different rows overlap and reduce total wall-clock time.
    for (let i = 0; i < body.rows.length; i += BATCH_CONCURRENCY) {
      const chunk = body.rows.slice(i, i + BATCH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map((row) =>
          processRow(row).catch((err: unknown) => ({
            name: row?.name ?? "",
            topScore: 0,
            severity: "error" as const,
            hitCount: 0,
            listCoverage: [] as string[],
            keywordGroups: [] as string[],
            esgCategories: [] as string[],
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
          }))
        )
      );
      results.push(...chunkResults);
    }
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
    lines.push(`Legal   : FDL 10/2025 Art.26-27 · CR 134/2025 Art.18`);
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
  }

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
      listRef: r.name,
      candidateName: r.name,
    })),
    ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
    generatedAt: new Date().toISOString(),
    source: "hawkeye-sterling",
  }).catch((err) => console.error("[batch-screen] webhook failed", err));

  const latencyMs = Date.now() - t0;
  if (latencyMs > 5000) console.warn(`[batch-screen] slow response latencyMs=${latencyMs}`);
  return NextResponse.json(
    { ok: true, summary, results, latencyMs, ...(asanaTaskUrl ? { asanaTaskUrl } : {}) },
    { headers: gateHeaders },
  );
}
