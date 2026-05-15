// Per-key circuit breaker with exponential-backoff retry and
// Netlify-Blobs persistence so state survives Lambda cold starts.
//
// Hot path (isBreakerOpen / recordSuccess / recordFailure) stays in-memory
// for latency — Blobs writes are fire-and-forget. On first probe of any
// key, we hydrate the in-memory entry from Blobs (best-effort) so a fresh
// Lambda inherits whatever state a sibling Lambda last wrote. The Blob
// store key is `circuit-breaker/<sanitisedKey>.json`.
//
// Concurrency model: last-writer-wins. Circuit-breaker state is advisory,
// not transactional — a brief disagreement between concurrent Lambdas
// won't cause an outage, just slightly faster trip / reset behaviour.

interface BreakerState { failures: number; openedAt: number | null }
const breakers = new Map<string, BreakerState>();
const hydrated = new Set<string>();
const THRESHOLD = 5;
const RESET_MS = 60_000; // 1 minute

// Sanitise an arbitrary breaker key for use as a Blob key. Anything outside
// [a-zA-Z0-9_.-] is replaced with `_` and the result is capped at 100 chars.
// Keeps the storage key namespace stable across renames / config drift.
function blobKeyFor(key: string): string {
  return `circuit-breaker/${key.replace(/[^a-zA-Z0-9_.\-]/g, "_").slice(0, 100)}.json`;
}

// Best-effort hydration from Blobs. Fire-and-forget on a miss. We never
// throw — circuit-breaker checks must stay sync-able from hot paths.
function hydrate(key: string): void {
  if (hydrated.has(key)) return;
  hydrated.add(key);
  void (async () => {
    try {
      const { getJson } = await import("./store");
      const persisted = await getJson<BreakerState>(blobKeyFor(key));
      if (!persisted) return;
      // Only adopt persisted state if it's still recent — a `RESET_MS`-aged
      // openedAt is already due for reset, so skip the merge.
      if (persisted.openedAt !== null && Date.now() - persisted.openedAt > RESET_MS) return;
      // Merge with whatever the local map has accumulated since this call
      // was scheduled (local wins on ties).
      if (!breakers.has(key)) breakers.set(key, persisted);
    } catch {
      // Blob layer unavailable (no NETLIFY_SITE_ID locally, transient errors).
      // The breaker still works purely from memory.
    }
  })();
}

function persist(key: string, state: BreakerState): void {
  void (async () => {
    try {
      const { setJson } = await import("./store");
      await setJson(blobKeyFor(key), state);
    } catch {
      // Persistence failure must not break the request path.
    }
  })();
}

export function isBreakerOpen(key: string): boolean {
  hydrate(key);
  const s = breakers.get(key);
  if (!s || s.openedAt === null) return false;
  if (Date.now() - s.openedAt > RESET_MS) {
    s.failures = 0; s.openedAt = null;
    persist(key, s);
    return false;
  }
  return s.failures >= THRESHOLD;
}

export function recordSuccess(key: string): void {
  hydrate(key);
  const s = breakers.get(key) ?? { failures: 0, openedAt: null };
  s.failures = 0; s.openedAt = null;
  breakers.set(key, s);
  persist(key, s);
}

export function recordFailure(key: string): void {
  hydrate(key);
  const s = breakers.get(key) ?? { failures: 0, openedAt: null };
  s.failures++;
  if (s.failures >= THRESHOLD) s.openedAt = Date.now();
  breakers.set(key, s);
  persist(key, s);
}

export async function withRetry<T>(
  key: string,
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  if (isBreakerOpen(key)) throw new Error(`Circuit open for ${key} — service temporarily suspended`);
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await fn();
      recordSuccess(key);
      return result;
    } catch (err) {
      lastErr = err;
      recordFailure(key);
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}
