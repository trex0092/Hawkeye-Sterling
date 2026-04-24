// Hawkeye Sterling — append-only, tamper-evident audit chain.
// Each entry includes the hash of the previous entry, so any retroactive edit
// breaks the chain at the mutated row onwards.
//
// Default hasher: SHA-256 via Node.js crypto (synchronous, collision-resistant).
// FNV-1a is retained as a lightweight option for non-security contexts (tests,
// development) but MUST NOT be used in production audit chains.

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

// ── SHA-256 (default, production-grade) ─────────────────────────────────────
// Uses Node.js crypto — synchronous, no WebCrypto async ceremony required.
// Produces a 64-char hex digest; collision resistance is 2^128 (birthday bound).
let _cryptoCreateHash: ((alg: string) => { update(d: string, enc: string): { digest(enc: string): string } }) | null = null;

function getCreateHash() {
  if (_cryptoCreateHash) return _cryptoCreateHash;
  // Dynamic require keeps this module importable in non-Node environments
  // (browser bundles) where it would be unused.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _cryptoCreateHash = (require('node:crypto') as { createHash: typeof _cryptoCreateHash }).createHash;
  } catch {
    _cryptoCreateHash = null;
  }
  return _cryptoCreateHash;
}

export function sha256hex(input: string): string {
  const createHash = getCreateHash();
  if (!createHash) {
    // Fallback: FNV-1a if crypto is unavailable (edge runtime / browser).
    // This should never happen in production — emit a console warning.
    console.warn('[audit-chain] SHA-256 unavailable; falling back to FNV-1a. Do not use in production.');
    return fnv1a(input);
  }
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ── FNV-1a (non-cryptographic — retained for tests and local dev only) ───────
// WARNING: FNV-1a is a 32-bit non-cryptographic hash. Collisions can be
// engineered trivially. Never use this as the default hasher in a production
// audit chain — it does NOT provide tamper-evidence against a determined adversary.
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

  constructor(hasher: Hasher = sha256hex, initialEntries: AuditEntry[] = []) {
    this.hasher = hasher;
    this.entries = initialEntries.map((e) => ({ ...e }));
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

  static fromEntries(entries: AuditEntry[], hasher: Hasher = sha256hex): AuditChain {
    return new AuditChain(hasher, entries);
  }
}
