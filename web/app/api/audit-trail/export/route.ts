// GET /api/audit-trail/export
//
// Exports audit trail entries as JSON or CSV within an optional date range.
//
// Query params:
//   from    (ISO date, inclusive) — filter entries on or after this date
//   to      (ISO date, inclusive) — filter entries on or before this date
//   format  (json|csv, default json) — output format
//
// Response:
//   JSON: { ok, format, count, from, to, entries, exportedAt }
//   CSV:  text/csv with columns seq,event,subject,actor,severity,hitsCount,
//         listsChecked,enrichmentPending,caseId,asanaTaskId,at
//
// Auth: withGuard (API key required)

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
  get: (key: string, opts?: { type?: string }) => Promise<unknown>;
}

async function loadAuditStore(): Promise<BlobStoreI | null> {
  try {
    const { getStore } = await import("@netlify/blobs") as unknown as {
      getStore: (opts: { name: string; siteID?: string; token?: string; consistency?: string }) => BlobStoreI;
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

async function handleGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from") ?? null;
  const toParam = url.searchParams.get("to") ?? null;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

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
    return NextResponse.json(
      { ok: false, error: `chain read failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  // Filter by date range (inclusive).
  const filtered = chain.filter((entry) => {
    const at = new Date(entry.at);
    if (fromDate && at < fromDate) return false;
    if (toDate && at > toDate) return false;
    return true;
  });

  // Sort ascending by seq for export.
  filtered.sort((a, b) => a.seq - b.seq);

  const exportedAt = new Date().toISOString();
  const dateStamp = exportedAt.slice(0, 10);
  const filename = `hawkeye-audit-${dateStamp}.${format}`;
  const disposition = `attachment; filename="${filename}"`;

  if (format === "csv") {
    const csv = entriesToCsv(filtered);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": disposition,
      },
    });
  }

  // JSON format.
  const body = JSON.stringify({
    ok: true,
    format: "json",
    count: filtered.length,
    from: fromParam ?? null,
    to: toParam ?? null,
    entries: filtered,
    exportedAt,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": disposition,
    },
  });
}

export const GET = withGuard(handleGet);
