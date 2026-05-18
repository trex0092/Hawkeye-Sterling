// Hawkeye-Sterling — audit chain verification primitives.
//
// Extracted from /api/audit/verify so the canonical-payload, id and
// HMAC-signature math is unit-testable in isolation. The route layer
// owns the Blobs read loop + HTTP envelope; this module owns the
// cryptographic invariants. Both must agree on a single source of
// truth or the chain becomes unverifiable.
//
// Tamper model:
//   - id        = sha256(canonical({action, target, actor, body, at}))
//   - signature = HMAC-SHA256(previousHash || id || at, AUDIT_CHAIN_SECRET)
//   - chain     = entries linked by previousHash == prior.id
//
// Any of those three properties failing on ANY entry means the chain
// is broken; regulator-defensibility under FDL 10/2025 Art.24
// requires the verifier to surface ALL three classes.

import { createHash, createHmac } from 'node:crypto';

export interface AuditEntry {
  sequence: number;
  id: string;
  at: string;
  actor: { role: string; name?: string };
  action: string;
  target: string;
  body: Record<string, unknown>;
  previousHash: string;
  signature: string;
}

export const GENESIS_HASH = '0'.repeat(64);

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Canonical serialisation used to compute the entry id. Property order
 * is fixed (action, target, actor, body, at) — changing the order
 * invalidates every prior entry's id. DO NOT REORDER.
 */
export function canonicalPayload(e: AuditEntry): string {
  return JSON.stringify({
    action: e.action,
    target: e.target,
    actor: e.actor,
    body: e.body ?? {},
    at: e.at,
  });
}

export function computeId(e: AuditEntry): string {
  return sha256Hex(canonicalPayload(e));
}

export function computeSignature(e: AuditEntry, secret: string): string {
  return createHmac('sha256', secret)
    .update(e.previousHash)
    .update(e.id)
    .update(e.at)
    .digest('hex');
}

export interface VerificationFault {
  sequence: number;
  expected: string;
  got: string;
}

export interface SequenceGap {
  expected: number;
  got: number;
}

export interface ChainVerification {
  ok: boolean;
  totalScanned: number;
  totalVerified: number;
  brokenLinks: VerificationFault[];
  invalidIds: VerificationFault[];
  invalidSignatures: VerificationFault[];
  sequenceGaps: SequenceGap[];
  finalSequence: number;
  finalHash: string;
}

/**
 * Verify an ordered chain of audit entries against the three
 * tamper-evidence invariants. The caller is responsible for sorting
 * entries by their storage key (lexicographic = chronological in the
 * production layout).
 *
 * Returns a structured fault inventory rather than throwing. Empty
 * arrays + ok=true mean the chain is intact from genesis through
 * entries[last].
 */
export function verifyChain(
  entries: readonly AuditEntry[],
  secret: string,
): ChainVerification {
  const brokenLinks: VerificationFault[] = [];
  const invalidIds: VerificationFault[] = [];
  const invalidSignatures: VerificationFault[] = [];
  const sequenceGaps: SequenceGap[] = [];

  let prevHash = GENESIS_HASH;
  let prevSequence = 0;
  let verified = 0;

  for (const e of entries) {
    if (e.sequence !== prevSequence + 1) {
      sequenceGaps.push({ expected: prevSequence + 1, got: e.sequence });
    }
    prevSequence = e.sequence;

    if (e.previousHash !== prevHash) {
      brokenLinks.push({
        sequence: e.sequence,
        expected: prevHash,
        got: e.previousHash,
      });
    }

    const recomputedId = computeId(e);
    if (recomputedId !== e.id) {
      invalidIds.push({ sequence: e.sequence, expected: recomputedId, got: e.id });
    }

    const recomputedSig = computeSignature(e, secret);
    if (recomputedSig !== e.signature) {
      invalidSignatures.push({
        sequence: e.sequence,
        expected: recomputedSig,
        got: e.signature,
      });
    }

    if (recomputedId === e.id && recomputedSig === e.signature) verified++;
    prevHash = e.id;
  }

  return {
    ok:
      brokenLinks.length === 0 &&
      invalidIds.length === 0 &&
      invalidSignatures.length === 0 &&
      sequenceGaps.length === 0,
    totalScanned: entries.length,
    totalVerified: verified,
    brokenLinks,
    invalidIds,
    invalidSignatures,
    sequenceGaps,
    finalSequence: prevSequence,
    finalHash: prevHash,
  };
}

/**
 * Build a fresh entry whose id + signature satisfy the chain
 * invariants given the prior entry's hash. Used by the writer side
 * (audit/sign route) and by tests that need to construct a valid
 * chain without duplicating the math.
 */
export function buildEntry(
  partial: Omit<AuditEntry, 'id' | 'signature' | 'previousHash'> & { previousHash?: string },
  prevHash: string,
  secret: string,
): AuditEntry {
  const previousHash = partial.previousHash ?? prevHash;
  const draft: AuditEntry = {
    sequence: partial.sequence,
    id: '',
    at: partial.at,
    actor: partial.actor,
    action: partial.action,
    target: partial.target,
    body: partial.body,
    previousHash,
    signature: '',
  };
  draft.id = computeId(draft);
  draft.signature = computeSignature(draft, secret);
  return draft;
}

// ───────────────────────────────────────────────────────────────────────────
// Server-side tamper-evident audit chain writer (separate chain).
//
// Appends a signed entry to hawkeye-audit-chain/chain.json using a
// SHA-256 hash chain that audit-chain-probe.mts verifies hourly and that
// GET /api/audit-trail reads back. This chain is DISTINCT from the
// /api/audit/sign + /api/audit/verify chain above:
//   - /api/audit/sign     → audit/entry/<key>      (sha256+HMAC, RULE 5)
//   - writeAuditChainEntry → hawkeye-audit-chain/chain.json (sha256)
// The two co-exist for different observability purposes; keep both.
//
// MIGRATION NOTE: entries written before 2026-05-18 used FNV-1a (32-bit).
// New entries use SHA-256 and carry hashAlg: "sha256". The probe handles
// both; legacy entries are verified with FNV-1a, new entries with SHA-256.
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
  /** hashAlg absent = legacy FNV-1a; "sha256" = SHA-256 (current). */
  hashAlg?: "sha256" | "fnv1a";
  payload: unknown;
  at: string;
}

// SHA-256 for the write-side chain. FNV-1a (32-bit) had birthday-collision
// risk at ~65k entries; SHA-256 provides 256-bit resistance suitable for
// multi-year compliance audit chains.  Legacy FNV-1a function preserved
// for reference by the probe (audit-chain-probe.mts) which handles migration.
function computeHash(prevHash: string | undefined, payload: unknown, at: string, seq: number): string {
  return sha256Hex(`${prevHash ?? ""}::${seq}::${at}::${JSON.stringify(payload)}`);
}

async function loadAuditStore() {
  const { getStore } = await import("@netlify/blobs") as unknown as {
    getStore: (_opts: { name: string; siteID?: string; token?: string; consistency?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: (_key: string, _opts?: any) => Promise<unknown>;
      setJSON: (_key: string, _value: unknown) => Promise<void>;
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
 * Appends one SHA-256-hashed entry to the server-side audit chain blob.
 * Retries up to 3 times with exponential backoff on transient failures.
 * Returns true on success, false after all retries exhausted (non-throwing).
 */
export async function writeAuditChainEntry(event: AuditChainEvent): Promise<boolean> {
  // Warn loudly if AUDIT_CHAIN_SECRET is absent or too short — every compliance
  // action that reaches here should have a properly configured secret.
  const chainSecret = process.env["AUDIT_CHAIN_SECRET"];
  if (!chainSecret || chainSecret.length < 32) {
    console.error(
      "[audit-chain] AUDIT_CHAIN_SECRET is missing or too short (min 32 chars). " +
      "The write-side chain is being written without HMAC protection. " +
      "Generate with: openssl rand -hex 64",
    );
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const store = await loadAuditStore();
      const raw = await store.get("chain.json", { type: "json" }) as ChainEntry[] | null;
      const chain: ChainEntry[] = Array.isArray(raw) ? structuredClone(raw) : [];
      const prev = chain[chain.length - 1];
      const seq = (prev?.seq ?? -1) + 1;
      const at = new Date().toISOString();
      const { event: eventName, actor, caseId, ...rest } = event;
      const payload: Record<string, unknown> = { event: eventName, actor };
      if (caseId) payload["caseId"] = caseId;
      Object.assign(payload, rest);
      // SHA-256 is used for all new entries (replaces FNV-1a — see migration note above).
      const hash = computeHash(prev?.entryHash, payload, at, seq);
      chain.push({
        seq,
        ...(prev ? { prevHash: prev.entryHash } : {}),
        entryHash: hash,
        hashAlg: "sha256",
        payload,
        at,
      });
      await store.setJSON("chain.json", chain);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS - 1) {
        const delayMs = 100 * (2 ** attempt); // 100ms, 200ms
        console.warn(`[audit-chain] write failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${delayMs}ms: ${msg}`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error(`[audit-chain] write FAILED after ${MAX_ATTEMPTS} attempts — entry lost: ${msg}`, { event: event.event, actor: event.actor, caseId: event.caseId });
      }
    }
  }
  return false;
}
