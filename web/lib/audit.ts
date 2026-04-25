// Tamper-evident audit-trail utility.
// Uses a djb2-based rolling hash chain: each entry's hash covers its own
// content plus the previous entry's hash, so any tampering breaks the chain.
// All data lives in localStorage under a versioned key.

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

function chainHash(partial: Omit<AuditEntry, "hash">, prevHash: string): string {
  const payload = [prevHash, partial.id, partial.timestamp, partial.actor, partial.action, partial.target].join("|");
  return `hs:${djb2(payload)}`;
}

export function loadAuditEntries(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch { return []; }
}

export function writeAuditEvent(
  actor: string,
  action: string,
  target: string,
): AuditEntry {
  const entries = loadAuditEntries();
  const prevHash = entries.length > 0 ? (entries[entries.length - 1]?.hash ?? GENESIS) : GENESIS;
  const partial: Omit<AuditEntry, "hash"> = {
    id: `ae-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    target,
  };
  const entry: AuditEntry = { ...partial, hash: chainHash(partial, prevHash) };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, entry]));
  } catch { /* storage full — non-fatal */ }
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

export function exportAuditCsv(entries: AuditEntry[]): string {
  const header = "id,timestamp,actor,action,target,hash";
  const rows = entries.map((e) =>
    [e.id, e.timestamp, `"${e.actor}"`, `"${e.action.replace(/"/g, '""')}"`, `"${e.target}"`, e.hash].join(","),
  );
  return [header, ...rows].join("\n");
}
