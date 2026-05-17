// GET /api/audit-trail/verify
//
// Verifies the integrity of the full audit chain by recomputing every entry's
// FNV-1a hash and checking that the prevHash links form an unbroken sequence.
//
// Response:
//   {
//     ok: true,
//     chainIntegrity: "intact" | "broken",
//     entriesVerified: N,
//     firstBreakAt: null | seq,
//     compositeHash: "<hex>",
//     verifiedAt: "<ISO timestamp>"
//   }
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

async function handleGet(_req: Request): Promise<Response> {
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
      // Empty chain is trivially intact.
      return NextResponse.json({
        ok: true,
        chainIntegrity: "intact",
        entriesVerified: 0,
        firstBreakAt: null,
        compositeHash: fnv1a(""),
        verifiedAt: new Date().toISOString(),
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

  // Sort ascending by seq to walk in insertion order.
  const sorted = [...chain].sort((a, b) => a.seq - b.seq);

  let broken = false;
  let firstBreakAt: number | null = null;
  let prevEntryHash: string | undefined = undefined;

  for (const entry of sorted) {
    // 1. Recompute this entry's hash and verify it matches the stored value.
    const expected = computeEntryHash(entry.prevHash, entry.payload, entry.at, entry.seq);
    const hashMismatch = expected !== entry.entryHash;

    // 2. Verify prevHash link — the stored prevHash should equal the hash of
    //    the previous entry (undefined for the very first entry).
    const prevLinkBroken = entry.prevHash !== prevEntryHash;

    if ((hashMismatch || prevLinkBroken) && !broken) {
      broken = true;
      firstBreakAt = entry.seq;
    }

    prevEntryHash = entry.entryHash;
  }

  const compositeHash = prevEntryHash ?? fnv1a("");

  return NextResponse.json({
    ok: true,
    chainIntegrity: broken ? "broken" : "intact",
    entriesVerified: sorted.length,
    firstBreakAt,
    compositeHash,
    verifiedAt: new Date().toISOString(),
  });
}

export const GET = withGuard(handleGet);
