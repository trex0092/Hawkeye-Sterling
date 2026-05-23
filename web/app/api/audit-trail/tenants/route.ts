// GET /api/audit-trail/tenants
//
// Lists all tenant audit chains stored in the hawkeye-audit-chain blob store.
// Returns each tenant's chain key, entry count, first and last timestamps,
// and composite hash — enough for a regulator to enumerate which entity chains
// exist and whether each one should be verified via /api/audit-trail/verify?tenantId=.
//
// This endpoint is restricted to ADMIN_TOKEN or a valid regulator JWT so
// that third parties cannot enumerate which tenants exist on the platform.
//
// Response:
//   {
//     ok: true,
//     tenants: [
//       {
//         tenantId: string,
//         chainKey: string,
//         entryCount: number,
//         firstAt: string | null,
//         lastAt: string | null,
//         compositeHash: string
//       }
//     ],
//     enumeratedAt: string
//   }

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ChainEntry {
  seq: number;
  at: string;
  entryHash: string;
}

interface BlobStoreI {
  list: (_opts?: { prefix?: string }) => Promise<{ blobs: Array<{ key: string }> }>;
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

// Extract tenantId from a chain blob key.
// "chain.json" → "default", "<tenantId>.json" → tenantId.
function tenantIdFromKey(key: string): string {
  if (key === "chain.json") return "default";
  return key.replace(/\.json$/, "");
}

async function handleGet(_req: Request): Promise<Response> {
  const store = await loadAuditStore();
  if (!store) {
    return NextResponse.json(
      { ok: false, error: "Blob store unavailable — check NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN" },
      { status: 503 },
    );
  }

  let keys: string[] = [];
  try {
    const listing = await store.list({});
    keys = listing.blobs
      .map((b) => b.key)
      .filter((k) => k.endsWith(".json") && k !== "tamper-detected.json");
  } catch (err) {
    console.error("[audit-trail/tenants] blob store list failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "audit chain store temporarily unavailable" },
      { status: 500 },
    );
  }

  const tenants = await Promise.all(
    keys.map(async (key) => {
      const tenantId = tenantIdFromKey(key);
      try {
        const raw = await store.get(key, { type: "json" }) as ChainEntry[] | null;
        if (!raw || !Array.isArray(raw) || raw.length === 0) {
          return { tenantId, chainKey: key, entryCount: 0, firstAt: null, lastAt: null, compositeHash: fnv1a("") };
        }
        const sorted = [...raw].sort((a, b) => a.seq - b.seq);
        const last = sorted[sorted.length - 1]!;
        return {
          tenantId,
          chainKey: key,
          entryCount: raw.length,
          firstAt: sorted[0]?.at ?? null,
          lastAt: last.at,
          compositeHash: last.entryHash,
        };
      } catch {
        return { tenantId, chainKey: key, entryCount: -1, firstAt: null, lastAt: null, compositeHash: "read-error" };
      }
    }),
  );

  // Sort: default first, then alphabetical by tenantId.
  tenants.sort((a, b) => {
    if (a.tenantId === "default") return -1;
    if (b.tenantId === "default") return 1;
    return a.tenantId.localeCompare(b.tenantId);
  });

  return NextResponse.json({
    ok: true,
    tenants,
    enumeratedAt: new Date().toISOString(),
  });
}

export const GET = withGuard(handleGet);
