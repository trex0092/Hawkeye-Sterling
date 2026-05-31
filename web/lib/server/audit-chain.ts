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
import { startSpan, SpanStatus } from './tracer';
import { incrementCounter } from './metrics-store';
import { emitAndLog } from '../../../src/integrations/webhook-emitter';

// ── Per-tenant key derivation ─────────────────────────────────────────────────
// Derives a per-tenant HMAC signing key from the root AUDIT_CHAIN_SECRET.
// An explicit AUDIT_CHAIN_SECRET_<TENANTID> env var takes full precedence so
// operators can isolate tenant keys completely (a per-tenant secret compromise
// does not affect other tenants even if an attacker cannot derive the root).
//
// Key material:  HMAC-SHA256(rootSecret, "hawkeye-audit-chain-v1:" + tenantId)
// Domain label prevents cross-protocol key reuse with other HMAC contexts.
export function deriveChainKey(rootSecret: string, tenantId: string): string {
  return createHmac("sha256", rootSecret)
    .update(`hawkeye-audit-chain-v1:${tenantId}`)
    .digest("hex");
}

export function getChainSecret(tenantId = "default"): string | null {
  const envKey = `AUDIT_CHAIN_SECRET_${tenantId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const perTenant = process.env[envKey];
  if (perTenant && perTenant.length >= 32) return perTenant;

  const root = process.env["AUDIT_CHAIN_SECRET"];
  if (!root || root.length < 32) return null;
  return deriveChainKey(root, tenantId);
}

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
    // Only advance anchor when entry is fully clean — prevents re-chained entries
    // after a tamper from silently passing verification.
    if (e.previousHash === prevHash && recomputedId === e.id) {
      prevHash = e.id;
    }
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
  /** hashAlg absent = legacy FNV-1a; "sha256" = SHA-256 (no HMAC);
   *  "hmac-sha256" = HMAC-SHA256 with per-tenant derived key (current). */
  hashAlg?: "sha256" | "fnv1a" | "hmac-sha256";
  payload: unknown;
  at: string;
}

// Hash each chain entry. When a tenant signing key is available the material
// is HMAC-SHA256-signed (unforgeability without the key). Without a key it
// falls back to pure SHA-256 hash linking (tamper-detectable but forgeable
// by anyone with Blobs write access). New entries always prefer HMAC.
function computeHash(
  prevHash: string | undefined,
  payload: unknown,
  at: string,
  seq: number,
  hmacSecret?: string | null,
): string {
  const material = `${prevHash ?? ""}::${seq}::${at}::${JSON.stringify(payload)}`;
  if (hmacSecret) {
    return createHmac("sha256", hmacSecret).update(material).digest("hex");
  }
  return sha256Hex(material);
}

async function loadAuditStore() {
  const { getStore } = await import("@netlify/blobs") as unknown as {
    getStore: (_opts: { name: string; siteID?: string; token?: string; consistency?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: (_key: string, _opts?: any) => Promise<unknown>;
      setJSON: (_key: string, _value: unknown) => Promise<void>;
      set: (_key: string, _data: string) => Promise<void>;
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
 * Appends one HMAC-SHA256-signed entry to the server-side audit chain blob.
 *
 * @param event    - The compliance event payload to record.
 * @param tenantId - Optional tenant identifier (default: "default"). Used to
 *   derive an isolated signing key and to namespace the chain blob. A per-
 *   tenant AUDIT_CHAIN_SECRET_<TENANTID> env var overrides derivation entirely
 *   so operators can achieve complete key isolation between tenants.
 *
 * Retries up to 3 times with exponential backoff on transient failures.
 * Returns true on success, false after all retries exhausted (non-throwing).
 */
export async function writeAuditChainEntry(event: AuditChainEvent, tenantId = "default"): Promise<boolean> {
  const span = startSpan('audit-chain.write', {
    'aml.tenant': tenantId,
    'aml.event': String(event.event ?? 'unknown'),
  });
  try {
    const ok = await _writeAuditChainEntry(event, tenantId);
    if (ok) incrementCounter('hawkeye_audit_chain_entries_total', 1, { tenant: tenantId });
    return ok;
  } catch (err) {
    span.setStatus({ code: SpanStatus.ERROR });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    span.end();
  }
}

// Alert debounce: at most one critical alert per event type per 5 seconds to
// prevent alert floods when blob storage is degraded under load (M-8).
const _lastAlertMs: Record<string, number> = {};
const ALERT_DEBOUNCE_MS = 5_000;

async function _writeAuditChainEntry(event: AuditChainEvent, tenantId: string): Promise<boolean> {
  const chainSecret = getChainSecret(tenantId);
  if (!chainSecret) {
    console.error(
      "[audit-chain] AUDIT_CHAIN_SECRET is missing or too short (min 32 chars). " +
      "Writing chain entry WITHOUT HMAC protection — chain is tamper-detectable " +
      "but not tamper-proof. Generate with: openssl rand -hex 64",
    );
  }

  // Tenant chains are stored in separate blobs for namespace isolation.
  // The "default" tenant keeps "chain.json" for backward compatibility.
  // Reserved names ("chain") that would collide with the default blob are
  // rejected to prevent cross-tenant data corruption.
  if (tenantId === "chain") {
    console.error("[audit-chain] tenantId 'chain' is reserved and cannot be used as a tenant identifier");
    return false;
  }
  const chainFile = tenantId === "default" ? "chain.json" : `${tenantId}.json`;

  // Extra attempts cover both transient blob errors and concurrent-write retries (C-1).
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const store = await loadAuditStore();
      const raw = await store.get(chainFile, { type: "json" }) as ChainEntry[] | null;
      const chain: ChainEntry[] = Array.isArray(raw) ? structuredClone(raw) : [];

      // H-4: Detect sequence gaps before appending — indicates prior corruption/lost entries.
      for (let i = 1; i < chain.length; i++) {
        const expectedSeq = (chain[i - 1].seq ?? -1) + 1;
        if (chain[i].seq !== expectedSeq) {
          console.error(
            `[audit-chain] sequence gap detected: expected seq=${expectedSeq}, got seq=${chain[i].seq}`,
            { tenant: tenantId },
          );
          incrementCounter('hawkeye_audit_chain_gaps_total', 1, { tenant: tenantId });
        }
      }

      const prev = chain[chain.length - 1];
      const seq = (prev?.seq ?? -1) + 1;
      const at = new Date().toISOString();
      const { event: eventName, actor, caseId, ...rest } = event;
      const payload: Record<string, unknown> = { event: eventName, actor };
      if (caseId) payload["caseId"] = caseId;
      Object.assign(payload, rest);
      const hash = computeHash(prev?.entryHash, payload, at, seq, chainSecret);
      chain.push({
        seq,
        ...(prev ? { prevHash: prev.entryHash } : {}),
        entryHash: hash,
        hashAlg: chainSecret ? "hmac-sha256" : "sha256",
        payload,
        at,
      });
      await store.set(chainFile, JSON.stringify(chain));

      // C-1: Post-write race detection — verify our entry persisted under concurrent writes.
      // With consistency:"strong" the read reflects the winning write. If our hash is absent,
      // another Lambda's write overwrote ours; retry with jitter so we append on top of it.
      const readBack = await store.get(chainFile, { type: "json" }) as ChainEntry[] | null;
      const readBackChain = Array.isArray(readBack) ? readBack : [];
      if (!readBackChain.some((e: ChainEntry) => e.entryHash === hash)) {
        const jitterMs = 50 + Math.floor(Math.random() * 100);
        console.warn(
          `[audit-chain] concurrent write detected (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${jitterMs}ms`,
        );
        incrementCounter('hawkeye_audit_chain_concurrent_write_total', 1, { tenant: tenantId });
        await new Promise((r) => setTimeout(r, jitterMs));
        continue;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS - 1) {
        const delayMs = 100 * (2 ** attempt); // 100ms, 200ms, 400ms, 800ms
        console.warn(`[audit-chain] write failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${delayMs}ms: ${msg}`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error(`[audit-chain] write FAILED after ${MAX_ATTEMPTS} attempts — entry lost: ${msg}`, { event: event.event, actor: event.actor, caseId: event.caseId });
      }
    }
  }
  incrementCounter('hawkeye_audit_write_failures_total', 1, { event: String(event.event ?? 'unknown') });
  // M-8: Rate-limit critical alerts to prevent alert floods during storage outages.
  const alertKey = String(event.event ?? 'unknown');
  const now = Date.now();
  if (now - (_lastAlertMs[alertKey] ?? 0) > ALERT_DEBOUNCE_MS) {
    _lastAlertMs[alertKey] = now;
    void emitAndLog('audit_write_failure', {
      event: 'audit_chain_write_failed',
      auditEvent: event.event,
      actor: event.actor,
      caseId: event.caseId ?? null,
      tenantId,
      severity: 'critical',
      at: new Date().toISOString(),
    }).catch(() => undefined);
  }
  return false;
}
