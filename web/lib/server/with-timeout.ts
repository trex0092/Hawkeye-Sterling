// Hawkeye Sterling — shared request-timeout helpers.
//
// The codebase had ~48 ad-hoc AbortController + setTimeout patterns
// scattered across API routes and adapters. This module centralises the
// two canonical shapes operators reach for:
//
//   - withTimeout(promise, ms)   — race a generic promise against a timeout
//   - abortableSignal(ms)        — get a fetch-compatible AbortSignal that
//                                  auto-aborts after `ms`
//
// Both throw a typed `TimeoutError` so callers can branch on it instead
// of relying on .name === "AbortError" string-matching.

export class TimeoutError extends Error {
  readonly isTimeout = true as const;
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Race a promise against a timeout. The underlying work is NOT cancelled
 * — callers that need cancellation should use `abortableSignal()` and
 * pass it into fetch. Use this for promise pipelines where there's no
 * AbortController hook available (LLM SDK calls, internal compute, etc.).
 */
export async function withTimeout<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Returns an AbortSignal that fires after `ms` plus a `clear()` helper
 * the caller MUST invoke in a `finally` block to release the timer.
 *
 * Prefer `AbortSignal.timeout(ms)` when targeting Node 17.3+. This wrapper
 * exists for older targets / explicit cleanup paths and to keep the
 * signature identical to the pre-consolidation `mkAbort` helpers scattered
 * across the codebase.
 */
export function abortableSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    clear: () => clearTimeout(timer),
  };
}

/** True if `err` is a TimeoutError raised by withTimeout(). */
export function isTimeoutError(err: unknown): err is TimeoutError {
  return err instanceof TimeoutError;
}
