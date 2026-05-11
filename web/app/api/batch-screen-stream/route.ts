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
  QuickScreenHit,
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
export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

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
  scoreMethod?: string;
  topHitReason?: string;
  topHitMethod?: string;
  isDuplicate?: boolean;
  crossRefDisagreement?: boolean;
}

function computeCheckpoints(
  row: BatchRow,
  screen: QuickScreenResult,
  kwGroups: string[],
  esgCats: string[],
): string[] {
  const flags: string[] = [];
  const lists = Array.from(new Set(screen.hits.map((h: QuickScreenHit) => h.listId)));

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

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  // 429 is the only hard stop — auth failures fall through as anonymous
  // so a NEXT_PUBLIC_ADMIN_TOKEN / ADMIN_TOKEN mismatch never blocks operators.
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: { rows: BatchRow[] };
  try {
    body = (await req.json()) as { rows: BatchRow[] };
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: "invalid JSON" })}\n\n`,
      { status: 400, headers: { "content-type": "text/event-stream", ...CORS_HEADERS, ...gateHeaders } },
    );
  }

  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: "rows must be a non-empty array" })}\n\n`,
      { status: 400, headers: { "content-type": "text/event-stream", ...CORS_HEADERS, ...gateHeaders } },
    );
  }

  if (body.rows.length > 500) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: "batch size exceeds 500-row limit" })}\n\n`,
      { status: 400, headers: { "content-type": "text/event-stream", ...CORS_HEADERS, ...gateHeaders } },
    );
  }

  const rows = body.rows;
  const CANDIDATES = await loadCandidates();
  const encoder = new TextEncoder();
  const seenNames = new Map<string, number>();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected; ignore enqueue errors.
        }
      };

      const allResults: RowResult[] = [];
      const started = Date.now();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        try {
          if (!row?.name?.trim()) {
            const result: RowResult = {
              name: row?.name ?? "",
              topScore: 0, severity: "error", hitCount: 0,
              listCoverage: [], keywordGroups: [], esgCategories: [], durationMs: 0,
              error: "empty name",
            };
            allResults.push(result);
            send({ type: "progress", index: i, total: rows.length, result });
            continue;
          }

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

          const topHit: QuickScreenHit | undefined = screen.hits[0];
          const scoreMethod = topHit?.method ?? "no-match";
          const topHitReason = topHit?.reason;
          const topHitMethod = topHit?.method;

          const crossRefDisagreement =
            screen.hits.length === 0 && (crossRef.watchmanHits ?? 0) > 0;
          if (crossRefDisagreement) checkpoints.push("cross-ref-disagreement");

          // Composite key: name + entity-type + jurisdiction so "John Smith (UK)"
          // and "John Smith (UAE)" are not falsely collapsed as duplicates.
          const normalizedKey = [
            row.name.trim().toLowerCase(),
            row.entityType ?? "",
            (row.jurisdiction ?? "").toLowerCase(),
          ].join("|");
          const isDuplicate = seenNames.has(normalizedKey);
          if (!isDuplicate) seenNames.set(normalizedKey, i);
          if (isDuplicate) checkpoints.push("duplicate");

          const result: RowResult = {
            name: row.name,
            topScore: screen.topScore,
            severity: screen.severity,
            hitCount: screen.hits.length,
            listCoverage: Array.from(new Set(screen.hits.map((h: QuickScreenHit) => h.listId))),
            keywordGroups: kwGroups,
            esgCategories: esgCats,
            durationMs: Date.now() - t0,
            checkpoints,
            scoreMethod,
            isDuplicate,
            crossRefDisagreement,
            ...(topHitReason ? { topHitReason } : {}),
            ...(topHitMethod ? { topHitMethod } : {}),
            ...(Object.keys(crossRef).length > 0 ? { crossRef } : {}),
            ...(row.entityType ? { entityType: row.entityType } : {}),
            ...(cleanAliases.length ? { aliases: cleanAliases } : {}),
            ...(row.dob ? { dob: row.dob } : {}),
            ...(row.gender ? { gender: row.gender } : {}),
            ...(row.jurisdiction ? { jurisdiction: row.jurisdiction } : {}),
            ...(row.idNumber ? { idNumber: row.idNumber } : {}),
          };

          allResults.push(result);
          send({ type: "progress", index: i, total: rows.length, result });
        } catch (err) {
          const result: RowResult = {
            name: row?.name ?? "",
            topScore: 0, severity: "error", hitCount: 0,
            listCoverage: [], keywordGroups: [], esgCategories: [], durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
          };
          allResults.push(result);
          send({ type: "progress", index: i, total: rows.length, result });
        }
      }

      const summary = {
        total: allResults.length,
        critical: allResults.filter((r) => r.severity === "critical").length,
        high: allResults.filter((r) => r.severity === "high").length,
        medium: allResults.filter((r) => r.severity === "medium").length,
        low: allResults.filter((r) => r.severity === "low").length,
        clear: allResults.filter((r) => r.severity === "clear").length,
        errors: allResults.filter((r) => !!r.error).length,
        duplicates: allResults.filter((r) => r.isDuplicate).length,
        totalDurationMs: Date.now() - started,
      };

      send({ type: "complete", summary });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...CORS_HEADERS,
      ...gateHeaders,
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
