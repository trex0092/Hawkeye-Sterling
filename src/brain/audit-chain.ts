// Hawkeye Sterling — append-only, tamper-evident audit chain.
// Each entry includes the hash of the previous entry, so any retroactive edit
// breaks the chain at the mutated row onwards. Uses FNV-1a (no WebCrypto
// dependency); downstream can swap in SHA-256 via a pluggable hasher.

export interface AuditEntry {
  seq: number;
  timestamp: string;   // ISO 8601 UTC
  actor: string;       // user-id or system component
  action: string;      // short verb phrase
  payload: unknown;    // serialisable
  prevHash: string;
  entryHash: string;
}

export type Hasher = (input: string) => string;

export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function canonicalise(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as Record<string, unknown> ?? {}).sort());
}

export class AuditChain {
  private entries: AuditEntry[] = [];
  private hasher: Hasher;

  constructor(hasher: Hasher = fnv1a) {
    this.hasher = hasher;
  }

  append(actor: string, action: string, payload: unknown = null): AuditEntry {
    const seq = this.entries.length + 1;
    const timestamp = new Date().toISOString();
    const prev = this.entries[this.entries.length - 1];
    const prevHash = prev?.entryHash ?? '0'.repeat(8);
    const body = `${seq}|${timestamp}|${actor}|${action}|${canonicalise(payload)}|${prevHash}`;
    const entryHash = this.hasher(body);
    const entry: AuditEntry = { seq, timestamp, actor, action, payload, prevHash, entryHash };
    this.entries.push(entry);
    return entry;
  }

  list(): readonly AuditEntry[] {
    return this.entries;
  }

  head(): AuditEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  verify(): { ok: boolean; firstBreakAt?: number } {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      const expectedPrev = i === 0 ? '0'.repeat(8) : this.entries[i - 1]!.entryHash;
      if (e.prevHash !== expectedPrev) return { ok: false, firstBreakAt: e.seq };
      const body = `${e.seq}|${e.timestamp}|${e.actor}|${e.action}|${canonicalise(e.payload)}|${e.prevHash}`;
      if (this.hasher(body) !== e.entryHash) return { ok: false, firstBreakAt: e.seq };
    }
    return { ok: true };
  }

  export(): AuditEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  static fromEntries(entries: AuditEntry[], hasher: Hasher = fnv1a): AuditChain {
    const chain = new AuditChain(hasher);
    (chain as unknown as { entries: AuditEntry[] }).entries = entries.map((e) => ({ ...e }));
    return chain;
  }
}
