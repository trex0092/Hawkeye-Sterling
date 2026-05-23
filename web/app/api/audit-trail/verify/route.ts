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
import { createHash, createHmac } from "crypto";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { getChainSecret } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  hashAlg?: "sha256" | "fnv1a" | "hmac-sha256";
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

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function computeEntryHash(
  prevHash: string | undefined,
  payload: unknown,
  at: string,
  seq: number,
  hashAlg?: string,
  tenantId = "default",
): string {
  const material = `${prevHash ?? ""}::${seq}::${at}::${JSON.stringify(payload)}`;
  if (hashAlg === "sha256") {
    return createHash("sha256").update(material).digest("hex");
  }
  if (hashAlg === "hmac-sha256") {
    const secret = getChainSecret(tenantId);
    if (!secret) return createHash("sha256").update(material).digest("hex");
    return createHmac("sha256", secret).update(material).digest("hex");
  }
  // Legacy FNV-1a (hashAlg absent or "fnv1a")
  return fnv1a(material);
}

// Resolves the chain blob key for a given tenantId — must mirror the naming
// logic in writeAuditChainEntry (audit-chain.ts). Two sources of truth here
// means a mismatch would silently verify the wrong chain; keep in sync.
function chainKeyForTenant(tenantId: string): string {
  return tenantId === "default" ? "chain.json" : `${tenantId}.json`;
}

async function handleGet(req: Request, ctx: RequestContext): Promise<Response> {
  void req;
  // Tenant isolation: always derive tenantId from the authenticated context —
  // never from a caller-supplied query param. A query-param tenantId allows any
  // authenticated key to verify a different tenant's chain (IDOR).
  const tenantId = (ctx.tenantId || "default").replace(/[^a-zA-Z0-9_@.-]/g, "_").slice(0, 64) || "default";
  const chainKey = chainKeyForTenant(tenantId);

  const store = await loadAuditStore();
  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Blob store unavailable — check NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN" },
      { status: 503 },
    );
  }

  let chain: ChainEntry[] = [];
  try {
    const raw = await store.get(chainKey, { type: "json" }) as ChainEntry[] | null;
    if (!raw) {
      // Empty chain is trivially intact.
      return NextResponse.json({
        ok: true,
        chainIntegrity: "intact",
        entriesVerified: 0,
        firstBreakAt: null,
        compositeHash: fnv1a(""),
        tenantId,
        chainKey,
        verifiedAt: new Date().toISOString(),
      });
    }
    if (!Array.isArray(raw)) {
      return NextResponse.json({ ok: false, error: `${chainKey} is not an array` }, { status: 500 });
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
  let prevSeq: number | undefined = undefined;
  let deletedEntries = 0;

  for (const entry of sorted) {
    // 0. Detect sequence gaps — a missing seq number means an entry was deleted.
    if (prevSeq !== undefined && entry.seq !== prevSeq + 1) {
      const gap = entry.seq - prevSeq - 1;
      deletedEntries += gap;
      if (!broken) {
        broken = true;
        firstBreakAt = prevSeq + 1;
      }
    }

    // 1. Recompute this entry's hash and verify it matches the stored value.
    const expected = computeEntryHash(entry.prevHash, entry.payload, entry.at, entry.seq, entry.hashAlg, tenantId);
    const hashMismatch = expected !== entry.entryHash;

    // 2. Verify prevHash link — the stored prevHash should equal the hash of
    //    the previous entry (undefined for the very first entry).
    const prevLinkBroken = entry.prevHash !== prevEntryHash;

    if ((hashMismatch || prevLinkBroken) && !broken) {
      broken = true;
      firstBreakAt = entry.seq;
    }

    prevEntryHash = entry.entryHash;
    prevSeq = entry.seq;
  }

  const compositeHash = prevEntryHash ?? fnv1a("");

  return NextResponse.json({
    ok: true,
    chainIntegrity: broken ? "broken" : "intact",
    entriesVerified: sorted.length,
    firstBreakAt,
    deletedEntries,
    compositeHash,
    tenantId,
    chainKey,
    verifiedAt: new Date().toISOString(),
  });
}

export const GET = withGuard(handleGet);
