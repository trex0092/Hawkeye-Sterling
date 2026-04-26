// Hawkeye Sterling — SSE streaming batch screening endpoint.
// Emits per-row results as Server-Sent Events so the UI can show live
// progress instead of a 60-second black box.
//
// Event stream format:
//   data: {"type":"start","total":500}\n\n
//   data: {"type":"row","index":0,...rowResult}\n\n
//   data: {"type":"summary",...summary}\n\n
//   data: {"type":"done","durationMs":4210}\n\n

import { quickScreen as _quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import { normaliseForMatch as _normaliseForMatch } from "../../../../dist/src/brain/matching.js";
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
import { checkWatchman } from "@/lib/server/watchman-client";
import { checkMarble } from "@/lib/server/marble-client";
import { checkJube } from "@/lib/server/jube-client";
import { saveBatchRun } from "@/lib/server/batch-history";
import { BatchBodySchema, validateDob } from "@/lib/server/row-validator";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Netlify streaming requires maxDuration to allow long-lived responses.
export const maxDuration = 300;

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
) => QuickScreenResult;
type NormaliseFn = (input: string) => string;

const quickScreen = _quickScreen as QuickScreenFn;
const normaliseForMatch = _normaliseForMatch as NormaliseFn;

const DEFAULT_PROJECT_GID = "1214148630166524";
const DEFAULT_WORKSPACE_GID = "1213645083721316";
const DEFAULT_ASSIGNEE_GID = "1213645083721304";

interface CrossRef {
  watchmanHits?: number;
  marbleStatus?: string;
  jubeRisk?: number;
}

interface TopHit {
  candidateName: string;
  listId: string;
  method: string;
  score: number;
  reason: string;
}

export interface StreamRowResult {
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
  // Explainability (gap #9, #14 from analysis)
  scoreMethod?: string;
  topHit?: TopHit;
  // KYC-analyst checkpoints
  checkpoints?: string[];
  // Cross-validation signals
  crossRef?: CrossRef;
  // Deduplication (gap #4)
  isDuplicate?: boolean;
  duplicateOf?: string;
  // DOB validation (date-fns)
  age?: number;
  dobFlag?: string;
}

function computeCheckpoints(
  row: { name: string; entityType?: string; dob?: string; aliases?: string[]; jurisdiction?: string },
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
  // Cross-ref consistency check (gap #11)
  return flags;
}

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const CANDIDATES = await loadCandidates();
  const started = Date.now();

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const parsed = BatchBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "invalid request";
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const { rows } = parsed.data;
  const runId = randomUUID();
  let aborted = false;
  req.signal.addEventListener("abort", () => { aborted = true; });

  // Build deduplication map: normalized name → first index (gap #4)
  const normToFirstIdx = new Map<string, number>();
  const dedupeMap = rows.map((r, i) => {
    const norm = normaliseForMatch(r.name);
    if (normToFirstIdx.has(norm)) {
      return { isDuplicate: true, duplicateOf: rows[normToFirstIdx.get(norm)!]!.name };
    }
    normToFirstIdx.set(norm, i);
    return { isDuplicate: false };
  });

  const allResults: StreamRowResult[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const emit = (data: object) => {
        if (aborted) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { aborted = true; }
      };

      emit({ type: "start", total: rows.length, runId });

      // Cache screening results for deduped rows
      const screenCache = new Map<string, QuickScreenResult>();

      for (let i = 0; i < rows.length; i++) {
        if (aborted) break;

        const row = rows[i]!;
        const dedup = dedupeMap[i]!;
        const t0 = Date.now();

        try {
          if (!row.name?.trim()) {
            const errResult: StreamRowResult = {
              name: row.name ?? "",
              topScore: 0,
              severity: "error",
              hitCount: 0,
              listCoverage: [],
              keywordGroups: [],
              esgCategories: [],
              durationMs: 0,
              error: "empty name",
            };
            allResults.push(errResult);
            emit({ type: "row", index: i, total: rows.length, ...errResult });
            continue;
          }

          const cleanAliases = Array.isArray(row.aliases)
            ? row.aliases.filter((a): a is string => typeof a === "string")
            : [];

          const subject: QuickScreenSubject = {
            name: row.name.trim(),
            ...(cleanAliases.length ? { aliases: cleanAliases } : {}),
            ...(row.entityType ? { entityType: row.entityType } : {}),
            ...(row.jurisdiction ? { jurisdiction: row.jurisdiction } : {}),
          };

          // Reuse cached result for duplicates
          const cacheKey = normaliseForMatch(row.name);
          let screen: QuickScreenResult;
          if (dedup.isDuplicate && screenCache.has(cacheKey)) {
            screen = screenCache.get(cacheKey)!;
          } else {
            screen = quickScreen(subject, CANDIDATES as QuickScreenCandidate[]);
            screenCache.set(cacheKey, screen);
          }

          const haystack = `${row.name} ${cleanAliases.join(" ")}`;
          const kw = classifyAdverseKeywords(haystack);
          const esg = classifyEsg(haystack);
          const kwGroups = Array.from(new Set(kw.map((k) => k.group)));
          const esgCats = Array.from(new Set(esg.map((e) => e.categoryId)));
          const checkpoints = computeCheckpoints(row, screen, kwGroups, esgCats);

          // Score decomposition (gap #9, #14)
          const sortedHits = [...screen.hits].sort((a, b) => b.score - a.score);
          const best = sortedHits[0];
          const topHit: TopHit | undefined = best
            ? {
                candidateName: best.candidateName,
                listId: best.listId,
                method: best.method,
                score: Math.round(best.score * 100),
                reason: best.reason,
              }
            : undefined;

          // DOB validation (date-fns, gap #5 from my research)
          let age: number | undefined;
          let dobFlag: string | undefined;
          if (row.dob) {
            const dv = validateDob(row.dob);
            if (dv.valid) {
              age = dv.age;
            } else {
              dobFlag = dv.flag;
              checkpoints.push(`dob-${dv.flag ?? "invalid"}`);
            }
          }

          // Cross-validation only for elevated subjects (performance)
          const isElevated =
            screen.severity === "critical" || screen.severity === "high";
          let crossRef: CrossRef | undefined;

          if (isElevated) {
            const [watchmanRes, marbleRes, jubeRes] = await Promise.all([
              checkWatchman(row.name),
              checkMarble(row.name, row.entityType),
              checkJube(row.name, row.entityType, row.jurisdiction),
            ]);

            const cr: CrossRef = {};
            if (watchmanRes !== null) cr.watchmanHits = watchmanRes.hitCount;
            if (marbleRes !== null) cr.marbleStatus = marbleRes.status;
            if (jubeRes !== null) cr.jubeRisk = jubeRes.riskScore;

            // Cross-ref consistency check (gap #11)
            const hasWatchmanDisagreement =
              watchmanRes !== null &&
              watchmanRes.hitCount === 0 &&
              screen.hits.length > 0;
            if (hasWatchmanDisagreement) checkpoints.push("cross-ref-disagreement");

            if (Object.keys(cr).length > 0) crossRef = cr;
          }

          const rowResult: StreamRowResult = {
            name: row.name,
            topScore: screen.topScore,
            severity: screen.severity,
            hitCount: screen.hits.length,
            listCoverage: Array.from(new Set(screen.hits.map((h) => h.listId))),
            keywordGroups: kwGroups,
            esgCategories: esgCats,
            durationMs: Date.now() - t0,
            scoreMethod: best?.method,
            ...(topHit ? { topHit } : {}),
            checkpoints,
            ...(crossRef ? { crossRef } : {}),
            ...(dedup.isDuplicate ? { isDuplicate: true, duplicateOf: dedup.duplicateOf } : {}),
            ...(row.entityType ? { entityType: row.entityType } : {}),
            ...(cleanAliases.length ? { aliases: cleanAliases } : {}),
            ...(row.dob ? { dob: row.dob } : {}),
            ...(row.gender ? { gender: row.gender } : {}),
            ...(row.jurisdiction ? { jurisdiction: row.jurisdiction } : {}),
            ...(row.idNumber ? { idNumber: row.idNumber } : {}),
            ...(age !== undefined ? { age } : {}),
            ...(dobFlag ? { dobFlag } : {}),
          };

          allResults.push(rowResult);
          emit({ type: "row", index: i, total: rows.length, ...rowResult });
        } catch (err) {
          const errResult: StreamRowResult = {
            name: row?.name ?? "",
            topScore: 0,
            severity: "error",
            hitCount: 0,
            listCoverage: [],
            keywordGroups: [],
            esgCategories: [],
            durationMs: Date.now() - t0,
            error: err instanceof Error ? err.message : String(err),
          };
          allResults.push(errResult);
          emit({ type: "row", index: i, total: rows.length, ...errResult });
        }
      }

      const totalDurationMs = Date.now() - started;
      const summary = {
        total: allResults.length,
        critical: allResults.filter((r) => r.severity === "critical").length,
        high: allResults.filter((r) => r.severity === "high").length,
        medium: allResults.filter((r) => r.severity === "medium").length,
        low: allResults.filter((r) => r.severity === "low").length,
        clear: allResults.filter((r) => r.severity === "clear").length,
        errors: allResults.filter((r) => r.error).length,
        duplicates: allResults.filter((r) => r.isDuplicate).length,
        totalDurationMs,
      };

      emit({ type: "summary", ...summary, runId });
      emit({ type: "done", durationMs: totalDurationMs });

      try { controller.close(); } catch { /* already closed */ }

      // Post-stream async tasks (non-blocking)
      const elevated = allResults.filter(
        (r) => r.severity === "critical" || r.severity === "high",
      );

      // Save to batch history (gap #3)
      void saveBatchRun({
        runId,
        timestamp: new Date().toISOString(),
        rowCount: rows.length,
        durationMs: totalDurationMs,
        summary,
        elevatedSubjects: elevated.slice(0, 30).map((r) => r.name),
        results: elevated.concat(
          allResults.filter((r) => r.severity !== "critical" && r.severity !== "high"),
        ),
      }).catch((err) => console.error("[batch-stream] history save failed", err));

      // Asana notification
      const token = process.env["ASANA_TOKEN"];
      if (elevated.length > 0 && token) {
        const topSeverity = elevated.some((r) => r.severity === "critical") ? "CRITICAL" : "HIGH";
        const runAt = new Date().toISOString();
        const lines = [
          `HAWKEYE STERLING · BATCH SCREENING ALERT (STREAMING)`,
          `Run at           : ${runAt}`,
          `Run ID           : ${runId}`,
          `Batch size       : ${allResults.length} subjects`,
          `Elevated (≥HIGH) : ${elevated.length}`,
          ``,
          `── ELEVATED SUBJECTS ──`,
          ...elevated.slice(0, 30).map(
            (r) =>
              `• [${r.severity.toUpperCase()}] ${r.name}` +
              (r.jurisdiction ? ` · ${r.jurisdiction}` : "") +
              ` · score ${r.topScore} · ${r.hitCount} hit(s)` +
              (r.scoreMethod ? ` · via ${r.scoreMethod}` : "") +
              (r.listCoverage.length ? ` · lists: ${r.listCoverage.join(", ")}` : ""),
          ),
          ...(elevated.length > 30 ? [`  … and ${elevated.length - 30} more`] : []),
          ``,
          `Summary: critical ${summary.critical} · high ${summary.high} · medium ${summary.medium} · low ${summary.low} · clear ${summary.clear}`,
          `Legal   : FDL 10/2025 Art.26-27 · CR 134/2025 Art.18`,
        ];
        fetch("https://app.asana.com/api/1.0/tasks", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            data: {
              name: `[BATCH-STREAM · ${topSeverity}] ${elevated.length} elevated — ${allResults.length} total screened`,
              notes: lines.join("\n"),
              projects: [process.env["ASANA_PROJECT_GID"] ?? DEFAULT_PROJECT_GID],
              workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID,
              assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE_GID,
            },
          }),
        }).catch((err) => console.error("[batch-stream] Asana failed", err));
      }

      // Webhook
      void postWebhook({
        type: "screening.completed",
        subjectId: `BATCH-STREAM-${runId}`,
        subjectName: `Batch · ${allResults.length} subjects`,
        severity:
          summary.critical > 0 ? "critical" : summary.high > 0 ? "high" : summary.medium > 0 ? "medium" : "clear",
        topScore: Math.max(...allResults.map((r) => r.topScore), 0),
        newHits: elevated.slice(0, 10).map((r) => ({
          listId: r.listCoverage[0] ?? "batch",
          listRef: r.name,
          candidateName: r.name,
        })),
        generatedAt: new Date().toISOString(),
        source: "hawkeye-sterling",
      }).catch((err) => console.error("[batch-stream] webhook failed", err));
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-store",
      "x-accel-buffering": "no",
      ...gate.headers,
    },
  });
}
