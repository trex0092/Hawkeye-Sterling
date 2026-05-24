// GET /api/audit-trail/export/ndjson
//
// Exports audit trail entries as NDJSON (Newline Delimited JSON / JSON Lines)
// within an optional date range and action filter.
//
// Query params:
//   from   (ISO date, inclusive) — filter entries on or after this date
//   to     (ISO date, inclusive) — filter entries on or before this date
//   action (string) — filter entries whose payload.event matches this string
//
// Response:
//   application/x-ndjson — one JSON record per line (Splunk/ELK compatible)
//   Content-Disposition: attachment; filename="audit-trail-YYYY-MM-DD.ndjson"
//
// Auth: requireAuth: true

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  payload: unknown;
  at: string;
}

export async function GET(req: Request): Promise<Response> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from") ?? null;
  const toParam = url.searchParams.get("to") ?? null;
  const actionParam = url.searchParams.get("action") ?? null;

  const fromDate = fromParam ? new Date(fromParam) : null;
  const toDate = toParam ? new Date(toParam) : null;

  if (fromDate && isNaN(fromDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid `from` date" }, { status: 400, headers: gate.headers });
  }
  if (toDate && isNaN(toDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid `to` date" }, { status: 400, headers: gate.headers });
  }
  // Normalise toDate to end-of-day so date-only strings are inclusive.
  if (toDate) {
    toDate.setUTCHours(23, 59, 59, 999);
  }

  const store = await loadAuditStore();
  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Blob store unavailable — check NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN" },
      { status: 503, headers: gate.headers },
    );
  }

  let chain: ChainEntry[] = [];
  try {
    const raw = await store.get("chain.json", { type: "json" }) as ChainEntry[] | null;
    if (!raw) {
      chain = [];
    } else if (!Array.isArray(raw)) {
      return NextResponse.json({ ok: false, error: "chain.json is not an array" }, { status: 500, headers: gate.headers });
    } else {
      chain = raw;
    }
  } catch (err) {
    console.error("[audit-trail/export/ndjson] chain read failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "audit chain temporarily unavailable" },
      { status: 500, headers: gate.headers },
    );
  }

  // Filter by date range (inclusive) and optional action.
  const filtered = chain.filter((entry) => {
    const at = new Date(entry.at);
    if (fromDate && at < fromDate) return false;
    if (toDate && at > toDate) return false;
    if (actionParam) {
      const payload = entry.payload as Record<string, unknown> | null;
      const event = payload && typeof payload === "object" ? String(payload["event"] ?? "") : "";
      if (!event.includes(actionParam)) return false;
    }
    return true;
  });

  // Sort ascending by seq for export.
  filtered.sort((a, b) => a.seq - b.seq);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const lines = filtered.map((e) => JSON.stringify(e)).join("\n");

  return new Response(lines, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="audit-trail-${dateStamp}.ndjson"`,
      "x-total-count": String(filtered.length),
      ...gate.headers,
    },
  });
}
