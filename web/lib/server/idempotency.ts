// Hawkeye-Sterling - idempotency-key cache for POST routes.
//
// Implements RULE 12 (Zero Trust) idempotency for retryable mutating
// operations. A client (Asana webhook, scheduled cron, batch-screen
// orchestrator) that retries a POST within the cache window gets back
// the original response WITHOUT side-effects running again.
//
// Used by:
//   /api/batch-screen           - prevents duplicate Asana task creation
//                                  on retry
//   /api/transaction-monitor/run - prevents duplicate STR fanout on retry
//
// Storage: Netlify Blobs `hawkeye-idempotency` store (consistent: strong).
// Falls back to in-memory cache when Blobs is unavailable so dev/test
// still exercises the same code path.
//
// Cache key: clientToken from the `Idempotency-Key` header. Clients
// MUST generate this; the server NEVER mints one (we can't tell
// whether two requests with no key are intended to be the same or
// different operations).

const STORE_NAME = 'hawkeye-idempotency';
const HEADER_NAME = 'idempotency-key';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000; // 24h

interface CachedResponse {
  /** ISO timestamp when the original request completed. */
  at: string;
  /** HTTP status of the original response. */
  status: number;
  /** Body of the original response (already serialised). */
  body: string;
  /** Original requestId so logs can correlate the retry to the original. */
  originalRequestId: string;
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

const _memCache = new Map<string, { value: CachedResponse; expiresAt: number }>();
const MEM_CAP = 5_000;

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
  try {
    return mod.getStore({
      name: STORE_NAME,
      ...(creds.siteID ? { siteID: creds.siteID } : {}),
      ...(creds.token ? { token: creds.token } : {}),
      consistency: 'strong',
    });
  } catch {
    // @netlify/blobs throws MissingBlobsEnvironmentError when neither
    // automatic context nor explicit creds are configured (dev/test
    // outside a Netlify Lambda). Fall back to in-memory cache only.
    return null;
  }
}

/**
 * Extract the idempotency key from a request. Returns null if no key
 * is present. Sanitises to printable ASCII (0x21-0x7E) max 128 chars
 * so a hostile client cannot blow up the cache namespace.
 */
export function getIdempotencyKey(req: Request): string | null {
  const raw = req.headers.get(HEADER_NAME);
  if (!raw || raw.length === 0 || raw.length > 128) return null;
  if (!/^[\x21-\x7E]+$/.test(raw)) return null;
  return raw;
}

/**
 * Look up a previously cached response for `key`. Returns null on miss
 * (caller should run the operation and persist via storeIdempotent()).
 *
 * Blobs is the source of truth; in-memory is the fast path.
 */
export async function getIdempotent(key: string): Promise<CachedResponse | null> {
  const now = Date.now();
  const mem = _memCache.get(key);
  if (mem && mem.expiresAt > now) return mem.value;
  if (mem) _memCache.delete(key);

  const store = await getStore();
  if (!store) return null;
  const v = await store.get(`entry/${key}`, { type: 'json' }).catch(() => null);
  if (!v) return null;
  const cached = v as CachedResponse;
  // Populate the warm cache so subsequent retries on this Lambda are
  // sub-millisecond.
  _memCache.set(key, { value: cached, expiresAt: now + DEFAULT_TTL_MS });
  if (_memCache.size > MEM_CAP) {
    const oldest = _memCache.keys().next().value;
    if (oldest !== undefined) _memCache.delete(oldest);
  }
  return cached;
}

/**
 * Persist the response under `key` so future retries within the cache
 * window get the same response without re-running side effects.
 *
 * Best-effort: if Blobs is unavailable, we cache in-memory only. The
 * worst case is a duplicate run when a retry lands on a different
 * Lambda instance - which is what the cron lock + integrity guard
 * already cover.
 */
export async function storeIdempotent(
  key: string,
  cached: CachedResponse,
): Promise<void> {
  const now = Date.now();
  _memCache.set(key, { value: cached, expiresAt: now + DEFAULT_TTL_MS });
  if (_memCache.size > MEM_CAP) {
    const oldest = _memCache.keys().next().value;
    if (oldest !== undefined) _memCache.delete(oldest);
  }

  const store = await getStore();
  if (!store) return;
  try {
    await store.setJSON(`entry/${key}`, cached);
  } catch {
    // In-memory cache is still populated; next retry on this Lambda
    // benefits. A different-Lambda retry falls through to the operation.
  }
}

export type { CachedResponse };
export const IDEMPOTENCY_HEADER = HEADER_NAME;
