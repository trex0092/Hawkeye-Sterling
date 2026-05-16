// GET /api/audit-trail
//
// Reads the tamper-evident FNV-1a audit chain from Netlify Blobs and
// returns paginated entries. Written by the audit-chain-probe scheduled
// function (netlify/functions/audit-chain-probe.mts) which runs hourly
// and verifies the chain hashes.
//
// Blob store: "hawkeye-audit-chain"
//   chain.json            → ChainEntry[] (the full chain, append-only)
//   tamper-detected.json  → written by probe when tamper is found
//
// Query params:
//   page      (default 1)    — 1-indexed page number
//   pageSize  (default 50)   — entries per page, max 200
//   verified  (default false) — when "true", include computed-hash status per entry
//
// Response:
//   { ok, totalEntries, page, pageSize, entries, tamperMarker? }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  payload: unknown;
  at: string;
}

interface TamperMarker {
  detectedAt: string;
  tamperedAt: number[];
  brokenLinkAt: number[];
  totalEntries: number;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function computeEntryHash(prevHash: string | undefined, payload: unknown, at: string, seq: number): string {
  return fnv1a(`${prevHash ?? ""}::${seq}::${at}::${JSON.stringify(payload)}`);
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

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  const v = Number.isFinite(n) && n > 0 ? n : fallback;
  return max !== undefined ? Math.min(v, max) : v;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 50, 200);
  const includeVerified = url.searchParams.get("verified") === "true";

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
      return NextResponse.json({
        ok: true,
        totalEntries: 0,
        page,
        pageSize,
        entries: [],
        message: "Audit chain is empty — no entries recorded yet",
      });
    }
    if (!Array.isArray(raw)) {
      return NextResponse.json({ ok: false, error: "chain.json is not an array" }, { status: 500 });
    }
    chain = raw;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `chain read failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  // Newest entries first.
  const sorted = [...chain].reverse();
  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const page_entries = sorted.slice(start, start + pageSize);

  // Optionally annotate each entry with HMAC verification status.
  type EntryWithVerification = ChainEntry & { hashValid?: boolean };
  let annotated: EntryWithVerification[] = page_entries;
  if (includeVerified) {
    // Build a seq→entry map for prevHash lookup (from original order).
    const bySeq = new Map(chain.map((e) => [e.seq, e]));
    annotated = page_entries.map((e) => {
      const prev = typeof e.prevHash === "string" ? bySeq.get(e.seq - 1) : undefined;
      const expected = computeEntryHash(
        prev?.entryHash ?? e.prevHash,
        e.payload,
        e.at,
        e.seq,
      );
      return { ...e, hashValid: expected === e.entryHash };
    });
  }

  // Attach tamper marker if present.
  let tamperMarker: TamperMarker | null = null;
  try {
    const tm = await store.get("tamper-detected.json", { type: "json" }) as TamperMarker | null;
    if (tm) tamperMarker = tm;
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    ok: true,
    totalEntries: total,
    page,
    pageSize,
    entries: annotated,
    ...(tamperMarker ? { tamperMarker } : {}),
  });
}

export const GET = (req: Request) =>
  enforce(req as Parameters<typeof enforce>[0]).then((gate) => {
    if (!gate.ok) return gate.response as unknown as NextResponse;
    return handleGet(req);
  });
