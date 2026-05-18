// Hawkeye-Sterling — cron min-interval lock.
//
// Implements RULE 12 (Zero Trust) for the scheduled-function fleet:
//   - cron jobs stop
//   - retries duplicate records
//
// Failure modes addressed:
//   D11 (idempotency on retried jobs) — Netlify will retry a scheduled
//       function on 5xx. Without a lock, a retry that arrives within
//       seconds re-runs the full ingestion pass, doubling alert-webhook
//       fanout and write contention.
//   D12 (cron lock + dedup) — Two crons configured for the same minute
//       (e.g. 03:00 daily AND 03:00 every-15-min) can fire simultaneously
//       across multiple Lambdas. Without a lock, both do the full
//       fan-out; the feed-integrity guard prevents empty-overwrite but
//       not duplicate alert pages.
//
// Lock model: optimistic, blob-backed. We read the prior run's
// timestamp from `cron-locks/<label>.json` and compare against
// minIntervalMs. If too recent, we skip. Otherwise we write the
// current timestamp + an invocation token, then re-read to confirm
// we won the race. Netlify Blobs has no CAS so this is best-effort
// — two crons firing in the same blob round-trip (~50ms) can both
// "win"; the integrity guard (refuse-empty-overwrite) covers that
// worst case.
//
// The lock is ADVISORY. If Blobs is unavailable the caller still
// runs (open-circuit) — better to ingest with possible duplication
// than skip a sanctions update.

import { randomUUID } from 'node:crypto';

const LOCK_PREFIX = 'cron-locks/';

interface LockRecord {
  /** ISO timestamp of when the lock was acquired. */
  at: string;
  /** Unique invocation token used to confirm we won the race. */
  token: string;
  /** Caller-provided label (mirrored for observability). */
  label: string;
}

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: 'strong' | 'eventual';
  }) => {
    setJSON: (key: string, value: unknown) => Promise<void>;
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
  };
}

async function loadBlobs(): Promise<BlobsModuleShape | null> {
  try {
    return (await import('@netlify/blobs')) as unknown as BlobsModuleShape;
  } catch {
    return null;
  }
}

function credentials(): { siteID?: string; token?: string } {
  const siteID = process.env['NETLIFY_SITE_ID'] ?? process.env['SITE_ID'];
  const token =
    process.env['NETLIFY_BLOBS_TOKEN'] ??
    process.env['NETLIFY_API_TOKEN'] ??
    process.env['NETLIFY_AUTH_TOKEN'];
  const out: { siteID?: string; token?: string } = {};
  if (siteID) out.siteID = siteID;
  if (token) out.token = token;
  return out;
}

async function getStore(): Promise<ReturnType<BlobsModuleShape['getStore']> | null> {
  const mod = await loadBlobs();
  if (!mod) return null;
  const creds = credentials();
  return mod.getStore({
    name: 'hawkeye-cron-locks',
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: 'strong',
  });
}

export interface AcquireResult {
  acquired: boolean;
  /** When skipped, the prior run's ISO timestamp. */
  priorAt?: string;
  /** When skipped, the elapsed-since-prior in milliseconds. */
  priorAgeMs?: number;
  /** When acquired, the unique token we wrote. */
  token?: string;
  /** When the blob layer is unavailable. */
  blobUnavailable?: boolean;
}

/**
 * Attempt to acquire the named cron lock. The lock holds for
 * `minIntervalMs`. If a prior run wrote within that window, the
 * function returns `{ acquired: false, priorAgeMs }` and the caller
 * MUST skip its work.
 *
 * The caller does not need to release — `minIntervalMs` is the
 * effective TTL. This is intentional: a crashed run that fails
 * to release would otherwise wedge the cron forever.
 */
export async function acquireCronLock(
  label: string,
  minIntervalMs: number,
): Promise<AcquireResult> {
  const store = await getStore();
  if (!store) {
    // Open-circuit when Blobs is unavailable. Logging is the caller's
    // responsibility — we don't import the logger here to keep the
    // helper free of cross-tree dependencies.
    return { acquired: true, blobUnavailable: true, token: randomUUID() };
  }

  const key = `${LOCK_PREFIX}${label}.json`;
  const now = Date.now();

  let prior: LockRecord | null = null;
  try {
    prior = (await store.get(key, { type: 'json' })) as LockRecord | null;
  } catch {
    // Read failure — treat as no prior lock. The worst case is a
    // duplicate run, which the integrity guard handles.
    prior = null;
  }

  if (prior?.at) {
    const priorAtMs = Date.parse(prior.at);
    if (Number.isFinite(priorAtMs)) {
      const ageMs = now - priorAtMs;
      if (ageMs < minIntervalMs) {
        return { acquired: false, priorAt: prior.at, priorAgeMs: ageMs };
      }
    }
  }

  const token = randomUUID();
  const record: LockRecord = { at: new Date(now).toISOString(), token, label };
  try {
    await store.setJSON(key, record);
  } catch {
    // Write failure — let the caller proceed (open circuit). Duplicate
    // protection downgrades to integrity guard only.
    return { acquired: true, blobUnavailable: true, token };
  }

  // Best-effort race detection. Re-read; if someone else won (different
  // token), back off.
  try {
    const winner = (await store.get(key, { type: 'json' })) as LockRecord | null;
    if (winner?.token && winner.token !== token) {
      return { acquired: false, priorAt: winner.at, priorAgeMs: 0 };
    }
  } catch {
    // Verify read failed — assume we won.
  }

  return { acquired: true, token };
}

/**
 * Wrap an async function so it only runs if the cron lock was
 * acquired. Convenient for the scheduled-function-as-default-export
 * pattern used in `netlify/functions/*.mts`.
 */
export async function withCronLock<T>(
  label: string,
  minIntervalMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T; lock: AcquireResult } | { ran: false; lock: AcquireResult }> {
  const lock = await acquireCronLock(label, minIntervalMs);
  if (!lock.acquired) return { ran: false, lock };
  const result = await fn();
  return { ran: true, result, lock };
}
