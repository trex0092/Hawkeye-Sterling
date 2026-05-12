// Simple per-key circuit breaker with exponential backoff retry.
// State is in-memory (per function instance); resets on cold start.

interface BreakerState { failures: number; openedAt: number | null }
const breakers = new Map<string, BreakerState>();
const THRESHOLD = 5;
const RESET_MS = 60_000; // 1 minute

export function isBreakerOpen(key: string): boolean {
  const s = breakers.get(key);
  if (!s || s.openedAt === null) return false;
  if (Date.now() - s.openedAt > RESET_MS) { s.failures = 0; s.openedAt = null; return false; }
  return s.failures >= THRESHOLD;
}

export function recordSuccess(key: string): void {
  const s = breakers.get(key) ?? { failures: 0, openedAt: null };
  s.failures = 0; s.openedAt = null;
  breakers.set(key, s);
}

export function recordFailure(key: string): void {
  const s = breakers.get(key) ?? { failures: 0, openedAt: null };
  s.failures++;
  if (s.failures >= THRESHOLD) s.openedAt = Date.now();
  breakers.set(key, s);
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
