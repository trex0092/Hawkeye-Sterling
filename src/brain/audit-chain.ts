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

    _cryptoCreateHash = (require('node:crypto') as { createHash: typeof _cryptoCreateHash }).createHash;
  } catch (err) {
    // CRITICAL: tamper-evident audit chain falls back to FNV-1a (non-cryptographic)
    // when node:crypto isn't reachable. Operators MUST see this — a forged
    // chain entry may not be detectable. Loud warn (not silent) every time
    // the fallback is selected.
    console.warn(
      "[hawkeye] audit-chain: node:crypto unavailable — falling back to FNV-1a hash. " +
      "Tamper-evidence guarantees are DEGRADED. Investigate runtime environment.",
      err,
    );
    _cryptoCreateHash = null;
  }
  return _cryptoCreateHash;
}

// AML-05: eager-init guard. In production we never want the silent FNV-1a
// fallback path to fire on first append — by that time forged entries may
// already be persisted. Setting AUDIT_CHAIN_REQUIRE_CRYPTO=true (default in
// production via env) throws here so misconfiguration surfaces at boot,
// not at write time. Tests / dev can omit the env to keep the lazy path.
export function assertSha256Available(): void {
  const createHash = getCreateHash();
  if (!createHash) {
    throw new Error(
      "[hawkeye] audit-chain: SHA-256 unavailable (node:crypto failed to load). " +
      "Refusing to operate with FNV-1a fallback — tamper-evidence would be lost.",
    );
  }
  // Sanity check: hashing a known input must produce the expected digest length.
  const probe = createHash("sha256").update("hawkeye-probe", "utf8").digest("hex");
  if (typeof probe !== "string" || probe.length !== 64) {
    throw new Error(
      "[hawkeye] audit-chain: SHA-256 probe failed (got length=" + (probe?.length ?? "unknown") + "). " +
      "Refusing to operate without a verified hasher.",
    );
  }
}

export function sha256hex(input: string): string {
  const createHash = getCreateHash();
  if (!createHash) {
    // Production fail-closed: if AUDIT_CHAIN_REQUIRE_CRYPTO is set we throw
    // rather than silently degrade. Dev / tests retain the FNV-1a fallback.
    if (process.env["AUDIT_CHAIN_REQUIRE_CRYPTO"] === "true" || process.env["NODE_ENV"] === "production") {
      throw new Error(
        "[audit-chain] SHA-256 unavailable in production — refusing FNV-1a fallback. " +
        "Set AUDIT_CHAIN_REQUIRE_CRYPTO=false only in dev/test environments.",
      );
    }
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

// Recursively sort object keys so structurally-equal payloads produce the
// same JSON string regardless of property declaration order. Critical for
// audit-chain integrity: passing only the top-level keys to JSON.stringify's
// replacer parameter would silently drop ALL nested properties — different
// nested payloads could then hash identically.
function canonicalise(obj: unknown): string {
  return JSON.stringify(sortKeysDeep(obj));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      out[k] = sortKeysDeep(src[k]);
    }
    return out;
  }
  return value;
}

export class AuditChain {
  private entries: AuditEntry[] = [];
  private hasher: Hasher;
  private readonly genesisHash: string;

  constructor(hasher: Hasher = sha256hex, initialEntries: AuditEntry[] = []) {
    this.hasher = hasher;
    this.genesisHash = '0'.repeat(hasher('').length);
    this.entries = initialEntries.map((e) => ({ ...e }));
  }

  append(actor: string, action: string, payload: unknown = null): AuditEntry {
    const seq = this.entries.length + 1;
    const timestamp = new Date().toISOString();
    const prev = this.entries[this.entries.length - 1];
    const prevHash = prev?.entryHash ?? this.genesisHash;
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
      const e = this.entries[i];
      if (!e) continue;
      const expectedPrev = i === 0 ? this.genesisHash : (this.entries[i - 1]?.entryHash ?? this.genesisHash);
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
