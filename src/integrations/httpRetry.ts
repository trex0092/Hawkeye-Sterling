// Hawkeye Sterling — resilient HTTP helper for LLM / external API calls.
//
// Reason for existence: bare `fetch` leaves callers vulnerable to
// "Stream idle timeout - partial response received" failures. This helper
// adds:
//   · per-attempt total timeout            (abort if attempt exceeds perAttemptMs)
//   · idle-read timeout on the body        (abort if bytes stop arriving for idleReadMs)
//   · bounded retry on transient failures  (429, 5xx, network errors)
//   · exponential backoff with jitter      (caller-tunable)
//   · partial-response detection           (body is non-empty but JSON parse fails)
//   · outer AbortSignal honoured           (caller cancellation stops all retries)
//
// Use `fetchJsonWithRetry(url, init, opts)` for JSON APIs (the common case
// for Anthropic Messages API). It returns a structured result rather than
// throwing, so callers can branch on .ok / .partial / .error without
// try/catch.

export interface HttpRetryOptions {
  /** Max attempts including the initial one. Default 3. */
  maxAttempts?: number;
  /** Total wall-clock budget per attempt. Default 30s. */
  perAttemptMs?: number;
  /** Abort body read if no new bytes arrive for this long. Default 20s. */
  idleReadMs?: number;
  /** Initial backoff before the first retry. Default 500ms. */
  initialBackoffMs?: number;
  /** Upper cap for backoff between retries. Default 5000ms. */
  maxBackoffMs?: number;
  /** Caller cancellation. If this aborts, no further attempts are made. */
  signal?: AbortSignal;
  /**
   * Custom decision for whether to retry. Defaults to: 5xx, 408, 429, or
   * any network / abort / idle-timeout error thrown by fetch().
   */
  retryOn?: (status: number | null, err: unknown) => boolean;
}

export interface HttpRetryResult<T = unknown> {
  ok: boolean;
  status: number | null;
  body: string;
  json: T | null;
  error: string | null;
  attempts: number;
  elapsedMs: number;
  /** True when the response body arrived but was truncated / unparseable. */
  partial: boolean;
}

const DEFAULTS = {
  maxAttempts: 3,
  perAttemptMs: 30_000,
  idleReadMs: 20_000,
  initialBackoffMs: 500,
  maxBackoffMs: 5_000,
} as const;

function defaultRetryOn(status: number | null, err: unknown): boolean {
  if (status !== null) return status === 408 || status === 429 || (status >= 500 && status < 600);
  // Network / abort / idle = err set, status null.
  if (err && typeof err === 'object') {
    const e = err as { name?: string; code?: string; message?: string };
    if (e.name === 'AbortError') return true;
    if (e.name === 'TypeError') return true;                          // fetch network error
    if (e.code && /^(ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR)/.test(e.code)) return true;
    if (e.message && /timeout|idle|reset|partial|stream/i.test(e.message)) return true;
  }
  return false;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function readBodyWithIdleTimeout(
  res: Response,
  idleReadMs: number,
  outerSignal: AbortSignal,
): Promise<{ body: string; partial: boolean }> {
  if (!res.body) {
    const body = await res.text();
    return { body, partial: false };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const armIdle = (onIdle: () => void): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdle, idleReadMs);
  };

  return new Promise<{ body: string; partial: boolean }>((resolve, reject) => {
    let settled = false;
    const settle = (value: { body: string; partial: boolean } | Error): void => {
      if (settled) return;
      settled = true;
      outerSignal.removeEventListener('abort', onOuterAbort);
      if (idleTimer) clearTimeout(idleTimer);
      try { void reader.cancel(); } catch { /* ignore */ }
      if (value instanceof Error) reject(value);
      else resolve(value);
    };

    const onOuterAbort = (): void => {
      settle(new DOMException('Aborted by outer signal', 'AbortError'));
    };
    outerSignal.addEventListener('abort', onOuterAbort, { once: true });

    armIdle(() => {
      settle({ body: accumulated, partial: true });
    });

    const pump = (): void => {
      reader.read().then(({ done, value }) => {
        if (settled) return;
        if (done) {
          if (idleTimer) clearTimeout(idleTimer);
          outerSignal.removeEventListener('abort', onOuterAbort);
          resolve({ body: accumulated, partial: false });
          settled = true;
          return;
        }
        if (value) accumulated += decoder.decode(value, { stream: true });
        armIdle(() => settle({ body: accumulated, partial: true }));
        pump();
      }).catch((err: unknown) => {
        settle(err instanceof Error ? err : new Error(String(err)));
      });
    };
    pump();
  });
}

// ── Anthropic streaming (SSE) helpers ────────────────────────────────────────

export interface AnthropicStreamResult {
  ok: boolean;
  /** Accumulated text from all content_block_delta / text_delta events. */
  text: string;
  /** Accumulated thinking summary from thinking_delta events (requires display:"summarized"). */
  thinking?: string;
  error: string | null;
  attempts: number;
  elapsedMs: number;
  partial: boolean;
}

/**
 * Reads an Anthropic SSE streaming response body, accumulating text deltas.
 * Returns partial=true if the stream ends unexpectedly (idle timeout or an
 * in-stream error event from the API).
 */
async function readAnthropicSSEBody(
  res: Response,
  idleReadMs: number,
  outerSignal: AbortSignal,
): Promise<{ text: string; thinking?: string; partial: boolean; streamError?: string }> {
  if (!res.body) return { text: '', partial: false };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let text = '';
  let thinking = '';
  let streamError: string | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<{ text: string; thinking?: string; partial: boolean; streamError?: string }>((resolve, reject) => {
    let settled = false;

    const settle = (value: { text: string; thinking?: string; partial: boolean; streamError?: string } | Error): void => {
      if (settled) return;
      settled = true;
      outerSignal.removeEventListener('abort', onOuterAbort);
      if (idleTimer) clearTimeout(idleTimer);
      try { void reader.cancel(); } catch { /* ignore */ }
      if (value instanceof Error) reject(value);
      else resolve(value);
    };

    const onOuterAbort = (): void => {
      settle(new DOMException('Aborted by outer signal', 'AbortError'));
    };
    outerSignal.addEventListener('abort', onOuterAbort, { once: true });

    const armIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => settle({ text, ...(thinking ? { thinking } : {}), partial: true }), idleReadMs);
    };

    armIdle();

    const pump = (): void => {
      reader.read().then(({ done, value: chunk }) => {
        if (settled) return;
        if (done) {
          if (idleTimer) clearTimeout(idleTimer);
          outerSignal.removeEventListener('abort', onOuterAbort);
          settled = true;
          resolve({ text, ...(thinking ? { thinking } : {}), partial: false, ...(streamError ? { streamError } : {}) });
          return;
        }
        if (chunk) {
          lineBuffer += decoder.decode(chunk, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const evt = JSON.parse(data) as {
                type?: string;
                delta?: { type?: string; text?: string; thinking?: string };
                error?: { message?: string };
              };
              if (evt.type === 'content_block_delta') {
                if (evt.delta?.type === 'text_delta') {
                  text += evt.delta.text ?? '';
                } else if (evt.delta?.type === 'thinking_delta') {
                  thinking += evt.delta.thinking ?? '';
                }
              } else if (evt.type === 'error') {
                streamError = evt.error?.message ?? 'stream error';
                settle({ text, ...(thinking ? { thinking } : {}), partial: true, streamError });
                return;
              }
            } catch { /* ignore malformed SSE line */ }
          }
        }
        armIdle();
        pump();
      }).catch((err: unknown) => {
        settle(err instanceof Error ? err : new Error(String(err)));
      });
    };
    pump();
  });
}

/**
 * Makes an Anthropic streaming API call (the request body must include
 * `stream: true`). Parses SSE events and accumulates text_delta content.
 * Retries on transient errors with exponential backoff, same as
 * fetchJsonWithRetry.
 */
export async function fetchAnthropicStreamText(
  url: string,
  init: RequestInit = {},
  opts: HttpRetryOptions = {},
): Promise<AnthropicStreamResult> {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts;
  const perAttemptMs = opts.perAttemptMs ?? DEFAULTS.perAttemptMs;
  const idleReadMs = opts.idleReadMs ?? DEFAULTS.idleReadMs;
  const initialBackoffMs = opts.initialBackoffMs ?? DEFAULTS.initialBackoffMs;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULTS.maxBackoffMs;
  const retryOn = opts.retryOn ?? defaultRetryOn;
  const started = Date.now();

  let attempts = 0;
  let lastError: string | null = null;
  let lastText = '';
  let lastThinking: string | undefined;
  let lastPartial = false;

  while (attempts < maxAttempts) {
    if (opts.signal?.aborted) {
      return { ok: false, text: lastText, ...(lastThinking !== undefined ? { thinking: lastThinking } : {}), error: 'aborted by caller', attempts, elapsedMs: Date.now() - started, partial: lastPartial };
    }
    attempts++;

    const attemptCtl = new AbortController();
    const totalTimer = setTimeout(() => attemptCtl.abort(), perAttemptMs);
    const onOuter = (): void => attemptCtl.abort();
    opts.signal?.addEventListener('abort', onOuter, { once: true });

    try {
      const res = await fetch(url, { ...init, signal: attemptCtl.signal });

      if (!res.ok) {
        clearTimeout(totalTimer);
        opts.signal?.removeEventListener('abort', onOuter);
        const body = await res.text().catch(() => '');
        lastError = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body) as { error?: { message?: string } };
          if (parsed?.error?.message) lastError = `API Error: ${res.status} ${parsed.error.message}`;
        } catch { /* keep default */ }
        if (attempts < maxAttempts && retryOn(res.status, null)) {
          try { await sleep(backoff(attempts, initialBackoffMs, maxBackoffMs), opts.signal); } catch { /* aborted */ }
          continue;
        }
        return { ok: false, text: '', error: lastError, attempts, elapsedMs: Date.now() - started, partial: false };
      }

      const { text, thinking, partial, streamError } = await readAnthropicSSEBody(res, idleReadMs, attemptCtl.signal);
      clearTimeout(totalTimer);
      opts.signal?.removeEventListener('abort', onOuter);

      lastText = text;
      lastThinking = thinking;
      lastPartial = partial;

      if (partial || streamError) {
        lastError = streamError ?? `partial response (attempt ${attempts}/${maxAttempts})`;
        if (attempts < maxAttempts) {
          try {
            await sleep(backoff(attempts, initialBackoffMs, maxBackoffMs), opts.signal);
          } catch {
            return { ok: false, text, ...(thinking !== undefined ? { thinking } : {}), error: lastError, attempts, elapsedMs: Date.now() - started, partial: true };
          }
          continue;
        }
        return { ok: false, text, ...(thinking !== undefined ? { thinking } : {}), error: lastError, attempts, elapsedMs: Date.now() - started, partial: true };
      }

      return { ok: true, text, ...(thinking !== undefined ? { thinking } : {}), error: null, attempts, elapsedMs: Date.now() - started, partial: false };

    } catch (err) {
      clearTimeout(totalTimer);
      opts.signal?.removeEventListener('abort', onOuter);
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      if (attempts < maxAttempts && retryOn(null, err)) {
        try { await sleep(backoff(attempts, initialBackoffMs, maxBackoffMs), opts.signal); } catch { /* aborted */ }
        continue;
      }
      return { ok: false, text: lastText, ...(lastThinking !== undefined ? { thinking: lastThinking } : {}), error: msg, attempts, elapsedMs: Date.now() - started, partial: lastPartial };
    }
  }

  return { ok: false, text: lastText, ...(lastThinking !== undefined ? { thinking: lastThinking } : {}), error: lastError ?? 'exhausted retries', attempts, elapsedMs: Date.now() - started, partial: lastPartial };
}

// ── JSON (non-streaming) helper ───────────────────────────────────────────────

export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts: HttpRetryOptions = {},
): Promise<HttpRetryResult<T>> {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts;
  const perAttemptMs = opts.perAttemptMs ?? DEFAULTS.perAttemptMs;
  const idleReadMs = opts.idleReadMs ?? DEFAULTS.idleReadMs;
  const initialBackoffMs = opts.initialBackoffMs ?? DEFAULTS.initialBackoffMs;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULTS.maxBackoffMs;
  const retryOn = opts.retryOn ?? defaultRetryOn;
  const started = Date.now();

  let attempts = 0;
  let lastError: string | null = null;
  let lastStatus: number | null = null;
  let lastBody = '';
  let lastPartial = false;

  while (attempts < maxAttempts) {
    if (opts.signal?.aborted) {
      return {
        ok: false, status: lastStatus, body: lastBody, json: null,
        error: 'aborted by caller', attempts, elapsedMs: Date.now() - started,
        partial: lastPartial,
      };
    }
    attempts++;

    const attemptCtl = new AbortController();
    const totalTimer = setTimeout(() => attemptCtl.abort(), perAttemptMs);
    const onOuter = (): void => attemptCtl.abort();
    opts.signal?.addEventListener('abort', onOuter, { once: true });

    try {
      const res = await fetch(url, { ...init, signal: attemptCtl.signal });
      lastStatus = res.status;
      const { body, partial } = await readBodyWithIdleTimeout(res, idleReadMs, attemptCtl.signal);
      clearTimeout(totalTimer);
      opts.signal?.removeEventListener('abort', onOuter);

      lastBody = body;
      lastPartial = partial;

      if (partial || !res.ok) {
        lastError = partial
          ? `partial response (attempt ${attempts}/${maxAttempts})`
          : `HTTP ${res.status}`;
        // Partial bodies (our idle timeout fired) are always worth retrying regardless
        // of HTTP status — a 200 with a truncated body is just as transient as a 5xx.
        if (attempts < maxAttempts && (partial || retryOn(res.status, null))) {
          try {
            await sleep(backoff(attempts, initialBackoffMs, maxBackoffMs), opts.signal);
          } catch {
            return {
              ok: false, status: res.status, body, json: null,
              error: lastError, attempts, elapsedMs: Date.now() - started, partial,
            };
          }
          continue;
        }
        return {
          ok: false, status: res.status, body, json: null,
          error: lastError, attempts, elapsedMs: Date.now() - started, partial,
        };
      }

      try {
        const json = JSON.parse(body) as T;
        return {
          ok: true, status: res.status, body, json,
          error: null, attempts, elapsedMs: Date.now() - started, partial: false,
        };
      } catch {
        lastError = 'json_parse_error (body may be truncated)';
        lastPartial = true;
        if (attempts < maxAttempts) {
          try {
            await sleep(backoff(attempts, initialBackoffMs, maxBackoffMs), opts.signal);
          } catch {
            return {
              ok: false, status: res.status, body, json: null,
              error: lastError, attempts, elapsedMs: Date.now() - started, partial: true,
            };
          }
          continue;
        }
        return {
          ok: false, status: res.status, body, json: null,
          error: lastError, attempts, elapsedMs: Date.now() - started, partial: true,
        };
      }
    } catch (err) {
      clearTimeout(totalTimer);
      opts.signal?.removeEventListener('abort', onOuter);
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      if (attempts < maxAttempts && retryOn(null, err)) {
        try { await sleep(backoff(attempts, initialBackoffMs, maxBackoffMs), opts.signal); }
        catch { /* caller aborted; fall through to return */ }
        continue;
      }
      return {
        ok: false, status: null, body: lastBody, json: null,
        error: msg, attempts, elapsedMs: Date.now() - started, partial: lastPartial,
      };
    }
  }

  return {
    ok: false, status: lastStatus, body: lastBody, json: null,
    error: lastError ?? 'exhausted retries', attempts,
    elapsedMs: Date.now() - started, partial: lastPartial,
  };
}

function backoff(attempt: number, initial: number, max: number): number {
  const base = Math.min(max, initial * Math.pow(2, attempt - 1));
  const jitter = Math.random() * 0.3 * base;
  return Math.floor(base + jitter);
}
