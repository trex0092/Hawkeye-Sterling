// Tamper-evident audit-trail utility.
// Uses a djb2-based rolling hash chain: each entry's hash covers its own
// content plus the previous entry's hash, so any tampering breaks the chain.
//
// Storage strategy (two-tier for compliance):
//   1. localStorage — fast, synchronous, available offline. Primary for UI.
//   2. Server-side HMAC chain (via POST /api/audit/client-event) — durable,
//      tamper-evident, regulator-accessible. Required by FDL 10/2025 Art.24.
//
// writeAuditEvent() writes to localStorage immediately (synchronous) and
// then fires a fire-and-forget POST to persist server-side. The server write
// is non-blocking so UI callers never wait for it.

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  hash: string;
}

const STORAGE_KEY = "hawkeye.audit-trail.v1";
const GENESIS = "genesis:hawkeye-sterling";

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}

function randomHex6(): string {
  const arr = new Uint8Array(3);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function chainHash(partial: Omit<AuditEntry, "hash">, prevHash: string): string {
  const payload = [prevHash, partial.id, partial.timestamp, partial.actor, partial.action, partial.target].join("|");
  return `hs:${djb2(payload)}`;
}

export function loadAuditEntries(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch (err) {
    console.error("[hawkeye] audit ledger corrupted (parse failed) — returning empty:", err);
    return [];
  }
}

// Fire-and-forget server-side persistence. Errors are logged but never throw
// to the caller — the primary localStorage write has already succeeded.
function persistToServer(actor: string, action: string, target: string): void {
  if (typeof window === "undefined") return;
  void fetch("/api/audit/client-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actor, action, target }),
    keepalive: true,
  }).then((r) => {
    if (!r.ok) {
      console.warn("[hawkeye] server audit persist returned", r.status, "— localStorage copy still intact");
    }
  }).catch((err: unknown) => {
    console.warn("[hawkeye] server audit persist failed (network) — localStorage copy still intact:", err);
  });
}

export function writeAuditEvent(
  actor: string,
  action: string,
  target: string,
): AuditEntry {
  const partial: Omit<AuditEntry, "hash"> = {
    id: `ae-${Date.now()}-${randomHex6()}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    target,
  };
  // Server-side (no window): return the entry without persisting.
  // Server-side compliance events must use writeAuditChainEntry from
  // @/lib/server/audit-chain instead — localStorage is client-only.
  if (typeof window === "undefined") {
    return { ...partial, hash: chainHash(partial, GENESIS) };
  }
  const entries = loadAuditEntries();
  const prevHash = entries.length > 0 ? (entries[entries.length - 1]?.hash ?? GENESIS) : GENESIS;
  const entry: AuditEntry = { ...partial, hash: chainHash(partial, prevHash) };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, entry]));
  } catch (err) {
    console.error(
      "[hawkeye] audit ledger NOT persisted (storage full or disabled). Entry will be lost on reload:",
      err,
      entry,
    );
  }
  // Persist to server-side HMAC chain (fire-and-forget) so the event survives
  // browser cache clears and is accessible to regulators per FDL 10/2025 Art.24.
  persistToServer(actor, action, target);
  return entry;
}

export function verifyChain(entries: AuditEntry[]): { ok: boolean; brokenAt?: number } {
  if (entries.length === 0) return { ok: true };
  // Validate entry[0] against the hardcoded genesis sentinel.
  const first = entries[0]!;
  const { hash: _h0, ...firstPartial } = first;
  if (chainHash(firstPartial, GENESIS) !== first.hash) return { ok: false, brokenAt: 0 };
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1]!;
    const curr = entries[i]!;
    const { hash: _ignore, ...partial } = curr;
    if (chainHash(partial, prev.hash) !== curr.hash) return { ok: false, brokenAt: i };
  }
  return { ok: true };
}

function csvCell(v: string): string {
  const escaped = String(v ?? "").replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportAuditCsv(entries: AuditEntry[]): string {
  const header = "id,timestamp,actor,action,target,hash";
  const rows = entries.map((e) =>
    [csvCell(e.id), csvCell(e.timestamp), csvCell(e.actor), csvCell(e.action), csvCell(e.target), csvCell(e.hash)].join(","),
  );
  return [header, ...rows].join("\n");
}
