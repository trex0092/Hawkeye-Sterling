// GET /api/audit-trail/export
//
// Exports audit trail entries as JSON, CSV, or JSONL within an optional date range.
//
// Query params:
//   from     (ISO date, inclusive) — filter entries on or after this date
//   to       (ISO date, inclusive) — filter entries on or before this date
//   format   (json|csv|jsonl, default json) — output format
//   limit    (integer, default 5000, max 10000) — max entries per page
//   offset   (integer, default 0) — entries to skip (for pagination)
//   manifest (true) — include SHA-256 hash of export content as X-Export-SHA256
//                     header and as a trailing manifest comment/record
//
// Response:
//   JSON:  { ok, format, count, total, truncated, from, to, entries, exportedAt }
//   CSV:   text/csv with columns seq,event,subject,actor,severity,hitsCount,
//          listsChecked,enrichmentPending,caseId,asanaTaskId,at
//   JSONL: application/x-ndjson — one JSON record per line (Splunk/ELK compatible)
//
// Auth: withGuard (API key required)

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  payload: unknown;
  at: string;
}

interface BlobStoreI {
  get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
}

async function loadAuditStore(): Promise<BlobStoreI | null> {
  try {
    const { getStore } = await import("@netlify/blobs") as unknown as {
      getStore: (_opts: { name: string; siteID?: string; token?: string; consistency?: string }) => BlobStoreI;
    };
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    return siteID && token
      ? getStore({ name: "hawkeye-audit-chain", siteID, token, consistency: "strong" })
      : getStore({ name: "hawkeye-audit-chain" });
  } catch {
    return null;
  }
}

const CSV_HEADERS = [
  "seq",
  "event",
  "subject",
  "actor",
  "severity",
  "hitsCount",
  "listsChecked",
  "enrichmentPending",
  "caseId",
  "asanaTaskId",
  "at",
] as const;

type CsvField = (typeof CSV_HEADERS)[number];

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function extractField(payload: unknown, field: string): string {
  if (payload === null || typeof payload !== "object") return "";
  const val = (payload as Record<string, unknown>)[field];
  if (val === undefined || val === null) return "";
  return String(val);
}

function entriesToCsv(entries: ChainEntry[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const entry of entries) {
    const row = CSV_HEADERS.map((col: CsvField) => {
      if (col === "seq") return String(entry.seq);
      if (col === "at") return csvEscape(entry.at);
      return csvEscape(extractField(entry.payload, col));
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

const MAX_EXPORT_ROWS = 10_000;
const DEFAULT_EXPORT_ROWS = 5_000;

async function handleGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from") ?? null;
  const toParam = url.searchParams.get("to") ?? null;
  const rawFormat = url.searchParams.get("format");
  const format: "json" | "csv" | "jsonl" =
    rawFormat === "csv" ? "csv" : rawFormat === "jsonl" ? "jsonl" : "json";

  const includeManifest = url.searchParams.get("manifest") === "true";

  const rawLimit = parseInt(url.searchParams.get("limit") ?? "", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = isNaN(rawLimit) || rawLimit <= 0
    ? DEFAULT_EXPORT_ROWS
    : Math.min(rawLimit, MAX_EXPORT_ROWS);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  const fromDate = fromParam ? new Date(fromParam) : null;
  const toDate = toParam ? new Date(toParam) : null;

  if (fromDate && isNaN(fromDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid `from` date" }, { status: 400 });
  }
  if (toDate && isNaN(toDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid `to` date" }, { status: 400 });
  }
  // Normalise toDate to end-of-day so date-only strings are inclusive.
  if (toDate) {
    toDate.setUTCHours(23, 59, 59, 999);
  }

  const store = await loadAuditStore();
  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Blob store unavailable — check NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN" },
      { status: 503 },
    );
  }

  let chain: ChainEntry[] = [];
  try {
    const raw = await store.get("chain.json", { type: "json" }) as ChainEntry[] | null;
    if (!raw) {
      chain = [];
    } else if (!Array.isArray(raw)) {
      return NextResponse.json({ ok: false, error: "chain.json is not an array" }, { status: 500 });
    } else {
      chain = raw;
    }
  } catch (err) {
    console.error("[audit-trail/export] chain read failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "audit chain temporarily unavailable" },
      { status: 500 },
    );
  }

  // Filter by date range (inclusive).
  const allFiltered = chain.filter((entry) => {
    const at = new Date(entry.at);
    if (fromDate && at < fromDate) return false;
    if (toDate && at > toDate) return false;
    return true;
  });

  // Sort ascending by seq for export.
  allFiltered.sort((a, b) => a.seq - b.seq);

  // Apply pagination — cap at MAX_EXPORT_ROWS to prevent data-exfiltration
  // of the full 10-year audit trail in one unbounded request.
  const total = allFiltered.length;
  const page = allFiltered.slice(offset, offset + limit);
  const truncated = offset + limit < total;

  const exportedAt = new Date().toISOString();
  const dateStamp = exportedAt.slice(0, 10);

  function buildManifestHeaders(content: string): Record<string, string> {
    if (!includeManifest) return {};
    const hash = createHash("sha256").update(content).digest("hex");
    return { "x-export-sha256": hash };
  }

  if (format === "csv") {
    const csv = entriesToCsv(page);
    // Append manifest as a trailing comment line when requested.
    const exportContent = includeManifest
      ? csv + "\n# sha256:" + createHash("sha256").update(csv).digest("hex")
      : csv;
    const filename = `hawkeye-audit-${dateStamp}.csv`;
    return new Response(exportContent, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-total-count": String(total),
        "x-truncated": String(truncated),
        ...buildManifestHeaders(csv),
      },
    });
  }

  if (format === "jsonl") {
    const jsonl = page.map((e) => JSON.stringify(e)).join("\n");
    // Append manifest as a trailing JSONL record when requested.
    const exportContent = includeManifest
      ? jsonl + "\n" + JSON.stringify({ _manifest: true, sha256: createHash("sha256").update(jsonl).digest("hex"), exportedAt })
      : jsonl;
    const filename = `hawkeye-audit-${dateStamp}.jsonl`;
    return new Response(exportContent, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-total-count": String(total),
        "x-truncated": String(truncated),
        ...buildManifestHeaders(jsonl),
      },
    });
  }

  // JSON format.
  const body = JSON.stringify({
    ok: true,
    format: "json",
    count: page.length,
    total,
    truncated,
    offset,
    limit,
    from: fromParam ?? null,
    to: toParam ?? null,
    entries: page,
    exportedAt,
  });

  const filename = `hawkeye-audit-${dateStamp}.json`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-total-count": String(total),
      "x-truncated": String(truncated),
      ...buildManifestHeaders(body),
    },
  });
}

export const GET = withGuard(handleGet);
