// POST /api/batch-screen-stream
// Same body as /api/batch-screen but streams results as Server-Sent Events
// so the operator sees a live progress bar instead of waiting for the full
// batch to complete. Each row result is emitted as soon as it finishes.
//
// SSE event format (text/event-stream):
//   data: {"type":"progress","index":0,"total":5,"result":{...}}\n\n
//   data: {"type":"complete","summary":{...}}\n\n
//   data: {"type":"error","error":"..."}\n\n

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
import { checkWatchman } from "@/lib/server/watchman-client";
import { checkMarble } from "@/lib/server/marble-client";
import { checkJube } from "@/lib/server/jube-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;

interface BatchRow {
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  dob?: string;
  gender?: string;
  idNumber?: string;
}

interface CrossRef {
  watchmanHits?: number;
  marbleStatus?: string;
  jubeRisk?: number;
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
  checkpoints?: string[];
  crossRef?: CrossRef;
  isDuplicate?: boolean;
  topHitReason?: string;
  topHitMethod?: string;
}

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

function sse(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;

  let rows: BatchRow[];
  try {
    const body = (await req.json()) as { rows?: BatchRow[] };
    if (!Array.isArray(body?.rows) || body.rows.length === 0) {
      return new Response(
        sse({ type: "error", error: "rows must be a non-empty array" }),
        { status: 400, headers: { "content-type": "text/event-stream" } },
      );
    }
    if (body.rows.length > 500) {
      return new Response(
        sse({ type: "error", error: "batch size exceeds 500-row limit" }),
        { status: 400, headers: { "content-type": "text/event-stream" } },
      );
    }
    rows = body.rows;
  } catch {
    return new Response(
      sse({ type: "error", error: "invalid JSON" }),
      { status: 400, headers: { "content-type": "text/event-stream" } },
    );
  }

  const CANDIDATES = await loadCandidates();
  const total = rows.length;

  // Track names seen so far to flag duplicates in this batch.
  const seenNames = new Map<string, number>();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (event: unknown) => {
        controller.enqueue(enc.encode(sse(event)));
      };

      const started = Date.now();
      const results: RowResult[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        try {
          if (!row?.name?.trim()) {
            const r: RowResult = {
              name: row?.name ?? "",
              topScore: 0, severity: "error", hitCount: 0,
              listCoverage: [], keywordGroups: [], esgCategories: [], durationMs: 0,
              error: "empty name",
            };
            results.push(r);
            emit({ type: "progress", index: i, total, result: r });
            continue;
          }

          const normalised = row.name.trim().toLowerCase();
          const dupeOf = seenNames.get(normalised);
          const isDuplicate = dupeOf !== undefined;
          if (!isDuplicate) seenNames.set(normalised, i);

          const t0 = Date.now();
          const cleanAliases = Array.isArray(row.aliases)
            ? (row.aliases as unknown[]).filter((a): a is string => typeof a === "string")
            : [];
          const subject: QuickScreenSubject = {
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

          const [watchmanRes, marbleRes, jubeRes] = await Promise.all([
            checkWatchman(row.name),
            checkMarble(row.name, row.entityType),
            checkJube(row.name, row.entityType, row.jurisdiction),
          ]);

          const crossRef: CrossRef = {};
          if (watchmanRes !== null) crossRef.watchmanHits = watchmanRes.hitCount;
          if (marbleRes !== null) crossRef.marbleStatus = marbleRes.status;
          if (jubeRes !== null) crossRef.jubeRisk = jubeRes.riskScore;

          const topHit = screen.hits.length > 0
            ? screen.hits.reduce((a, b) => a.score > b.score ? a : b)
            : null;

          const r: RowResult = {
            name: row.name,
            topScore: screen.topScore,
            severity: screen.severity,
            hitCount: screen.hits.length,
            listCoverage: Array.from(new Set(screen.hits.map((h) => h.listId))),
            keywordGroups: kwGroups,
            esgCategories: esgCats,
            durationMs: Date.now() - t0,
            checkpoints,
            isDuplicate,
            ...(topHit ? { topHitReason: topHit.reason, topHitMethod: topHit.method } : {}),
            ...(Object.keys(crossRef).length > 0 ? { crossRef } : {}),
          };
          if (row.entityType) r.entityType = row.entityType;
          if (row.aliases?.length) r.aliases = row.aliases;
          if (row.dob) r.dob = row.dob;
          if (row.gender) r.gender = row.gender;
          if (row.jurisdiction) r.jurisdiction = row.jurisdiction;
          if (row.idNumber) r.idNumber = row.idNumber;

          results.push(r);
          emit({ type: "progress", index: i, total, result: r });
        } catch (err) {
          const r: RowResult = {
            name: row?.name ?? "",
            topScore: 0, severity: "error", hitCount: 0,
            listCoverage: [], keywordGroups: [], esgCategories: [], durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
          };
          results.push(r);
          emit({ type: "progress", index: i, total, result: r });
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
        duplicates: results.filter((r) => r.isDuplicate).length,
        totalDurationMs: Date.now() - started,
      };

      emit({ type: "complete", summary });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
