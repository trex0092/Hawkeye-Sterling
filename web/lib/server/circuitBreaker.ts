// Per-key circuit breaker with exponential-backoff retry and
// dual-layer persistence so state survives Lambda cold starts.
//
// Hot path (isBreakerOpen / recordSuccess / recordFailure) stays in-memory
// for latency. Persistence order:
//   1. Upstash Redis — consistent, sub-millisecond, shared across all Lambda
//      instances. TTL = RESET_MS so expired entries auto-expire. (F-17 fix)
//   2. Netlify Blobs fallback — best-effort when Redis is unavailable.
//
// On first probe of any key, we hydrate the in-memory entry from Redis (then
// Blobs) so a fresh Lambda inherits whatever state a sibling Lambda last wrote.
// The Blob store key is `circuit-breaker/<sanitisedKey>.json`.
//
// Concurrency model: last-writer-wins. Circuit-breaker state is advisory,
// not transactional — a brief disagreement between concurrent Lambdas
// won't cause an outage, just slightly faster trip / reset behaviour.

interface BreakerState { failures: number; openedAt: number | null }
import { setGauge } from "./metrics-store";

const breakers = new Map<string, BreakerState>();
const hydrated = new Set<string>();
const THRESHOLD = 5;
const RESET_MS = 60_000; // 1 minute
// Redis key prefix and TTL for circuit breaker state entries.
const REDIS_CB_PREFIX = "cb:";
const REDIS_TTL_SEC = Math.ceil(RESET_MS / 1000) * 2; // 2× reset window

// Sanitise an arbitrary breaker key for use as a Blob/Redis key.
function storageKeyFor(key: string): string {
  return key.replace(/[^a-zA-Z0-9_.\-]/g, "_").slice(0, 100);
}
function blobKeyFor(key: string): string {
  return `circuit-breaker/${storageKeyFor(key)}.json`;
}
function redisKeyFor(key: string): string {
  return `${REDIS_CB_PREFIX}${storageKeyFor(key)}`;
}

// F-17: Read circuit breaker state from Upstash Redis if configured.
async function redisGet(key: string): Promise<BreakerState | null> {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(redisKeyFor(key))}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const j = await res.json() as { result: string | null };
    if (!j.result) return null;
    return JSON.parse(j.result) as BreakerState;
  } catch {
    return null;
  }
}

// F-17: Write circuit breaker state to Upstash Redis with auto-expiry TTL.
async function redisSet(key: string, state: BreakerState): Promise<void> {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/${encodeURIComponent(redisKeyFor(key))}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify([JSON.stringify(state), "EX", REDIS_TTL_SEC]),
    });
  } catch {
    // Redis write failure must not break the request path.
  }
}

// Best-effort hydration — Redis first, Blobs fallback. Fire-and-forget on a miss.
function hydrate(key: string): void {
  if (hydrated.has(key)) return;
  hydrated.add(key);
  void (async () => {
    try {
      // F-17: Try Redis first — consistent across all Lambda instances.
      let persisted = await redisGet(key);
      if (!persisted) {
        // Fall back to Blobs for continuity with pre-F-17 deployments.
        const { getJson } = await import("./store");
        persisted = await getJson<BreakerState>(blobKeyFor(key));
      }
      if (!persisted) return;
      // Only adopt persisted state if it's still recent.
      if (persisted.openedAt !== null && Date.now() - persisted.openedAt > RESET_MS) return;
      if (!breakers.has(key)) breakers.set(key, persisted);
    } catch {
      // Storage layer unavailable — breaker works purely from memory.
    }
  })();
}

function persist(key: string, state: BreakerState): void {
  void redisSet(key, state); // F-17: primary persistence path
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
  setGauge('hawkeye_circuit_breaker_open', 0, { service: key });
  const s = breakers.get(key) ?? { failures: 0, openedAt: null };
  s.failures = 0; s.openedAt = null;
  breakers.set(key, s);
  persist(key, s);
}

export function recordFailure(key: string): void {
  hydrate(key);
  const s = breakers.get(key) ?? { failures: 0, openedAt: null };
  s.failures++;
  // Only stamp openedAt on the closed→open transition. Re-stamping on every
  // subsequent failure would extend the RESET_MS window indefinitely, preventing
  // recovery when a service fails intermittently above the threshold.
  if (s.failures >= THRESHOLD && s.openedAt === null) {
    s.openedAt = Date.now();
    setGauge('hawkeye_circuit_breaker_open', 1, { service: key });
  }
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
