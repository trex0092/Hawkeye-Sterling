// Server-side tamper-evident audit chain writer.
//
// Appends a signed entry to hawkeye-audit-chain/chain.json using the same
// FNV-1a hash chain that audit-chain-probe.mts verifies hourly and that
// GET /api/audit-trail reads back. Keeps the chain consistent across all
// three consumers.
//
// Non-throwing: errors are logged and return false so callers never block
// a compliance action on an audit-write failure.

export interface AuditChainEvent {
  event: string;           // e.g. "screening.completed" | "sar.submitted"
  actor: string;           // user email or "system" | "cron_internal"
  caseId?: string;
  [key: string]: unknown;  // additional payload fields
}

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  payload: unknown;
  at: string;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function computeHash(prevHash: string | undefined, payload: unknown, at: string, seq: number): string {
  return fnv1a(`${prevHash ?? ""}::${seq}::${at}::${JSON.stringify(payload)}`);
}

async function loadAuditStore() {
  const { getStore } = await import("@netlify/blobs") as unknown as {
    getStore: (opts: { name: string; siteID?: string; token?: string; consistency?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: (key: string, opts?: any) => Promise<unknown>;
      setJSON: (key: string, value: unknown) => Promise<void>;
    };
  };
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  return siteID && token
    ? getStore({ name: "hawkeye-audit-chain", siteID, token, consistency: "strong" })
    : getStore({ name: "hawkeye-audit-chain" });
}

/**
 * Appends one FNV-1a-signed entry to the server-side audit chain blob.
 * Returns true on success, false on failure (non-throwing — never blocks callers).
 */
export async function writeAuditChainEntry(event: AuditChainEvent): Promise<boolean> {
  try {
    const store = await loadAuditStore();
    const raw = await store.get("chain.json", { type: "json" }) as ChainEntry[] | null;
    const chain: ChainEntry[] = Array.isArray(raw) ? raw : [];
    const prev = chain[chain.length - 1];
    const seq = (prev?.seq ?? -1) + 1;
    const at = new Date().toISOString();
    const { event: eventName, actor, caseId, ...rest } = event;
    const payload: Record<string, unknown> = { event: eventName, actor };
    if (caseId) payload["caseId"] = caseId;
    Object.assign(payload, rest);
    const hash = computeHash(prev?.entryHash, payload, at, seq);
    chain.push({
      seq,
      ...(prev ? { prevHash: prev.entryHash } : {}),
      entryHash: hash,
      payload,
      at,
    });
    await store.setJSON("chain.json", chain);
    return true;
  } catch (err) {
    console.warn("[audit-chain] write failed (non-fatal):", err instanceof Error ? err.message : String(err));
    return false;
  }
}
