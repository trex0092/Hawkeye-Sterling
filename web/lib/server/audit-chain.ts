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
