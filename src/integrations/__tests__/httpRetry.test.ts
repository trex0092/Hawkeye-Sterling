import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJsonWithRetry } from '../httpRetry.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function makeResponse(status: number, jsonBody: unknown): Response {
  const text = JSON.stringify(jsonBody);
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    text: async () => text,
  } as unknown as Response;
}

function makeBadJsonResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    text: async () => 'not-json{{{{',
  } as unknown as Response;
}

/** Stub global fetch with a sequence of resolved responses or thrown errors. */
function stubFetch(...responses: Array<Response | Error>): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

const FAST = { initialBackoffMs: 0, maxBackoffMs: 0 };

// ── Success path ──────────────────────────────────────────────────────────────

describe('fetchJsonWithRetry — success on first attempt', () => {
  it('returns ok=true with parsed json, status, and no error on 200', async () => {
    stubFetch(makeResponse(200, { result: 'ok' }));
    const res = await fetchJsonWithRetry<{ result: string }>('https://api.example.com', {}, FAST);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ result: 'ok' });
    expect(res.error).toBeNull();
    expect(res.partial).toBe(false);
    expect(res.attempts).toBe(1);
  });

  it('returns ok=true on 201', async () => {
    stubFetch(makeResponse(201, { id: 'abc' }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, FAST);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ id: 'abc' });
  });

  it('body string round-trips as JSON', async () => {
    const payload = { nested: { value: 42 } };
    stubFetch(makeResponse(200, payload));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, FAST);
    expect(JSON.parse(res.body)).toEqual(payload);
  });

  it('elapsedMs is a non-negative number', async () => {
    stubFetch(makeResponse(200, {}));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, FAST);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('passes the RequestInit (method, headers) through to fetch', async () => {
    const fn = stubFetch(makeResponse(200, {}));
    await fetchJsonWithRetry(
      'https://api.example.com',
      { method: 'POST', headers: { Authorization: 'Bearer tok' } },
      FAST,
    );
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });
});

// ── HTTP error — non-retryable ────────────────────────────────────────────────

describe('fetchJsonWithRetry — non-retryable HTTP errors', () => {
  it('returns ok=false on 400 in a single attempt', async () => {
    stubFetch(makeResponse(400, { error: 'bad' }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.attempts).toBe(1);
  });

  it('returns ok=false on 401 without retrying', async () => {
    stubFetch(makeResponse(401, {}));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
  });

  it('returns ok=false on 403 without retrying', async () => {
    stubFetch(makeResponse(403, {}));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
  });

  it('returns ok=false on 404 without retrying', async () => {
    stubFetch(makeResponse(404, {}));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
  });

  it('error message includes the HTTP status code', async () => {
    stubFetch(makeResponse(400, {}));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, FAST);
    expect(res.error).toContain('400');
  });
});

// ── HTTP error — retryable ────────────────────────────────────────────────────

describe('fetchJsonWithRetry — retryable HTTP errors', () => {
  it('retries on 500 and succeeds on second attempt', async () => {
    const fn = stubFetch(makeResponse(500, {}), makeResponse(200, { result: 'ok' }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 and succeeds on third attempt', async () => {
    stubFetch(makeResponse(503, {}), makeResponse(503, {}), makeResponse(200, { done: true }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(3);
  });

  it('retries on 429 (rate limit) and succeeds', async () => {
    stubFetch(makeResponse(429, {}), makeResponse(200, { ok: true }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it('retries on 408 (request timeout) and succeeds', async () => {
    stubFetch(makeResponse(408, {}), makeResponse(200, { ok: true }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it('exhausts maxAttempts=3 on persistent 500 and returns ok=false', async () => {
    const fn = stubFetch(makeResponse(500, {}), makeResponse(500, {}), makeResponse(500, {}));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects maxAttempts=1 — no retries even on 500', async () => {
    const fn = stubFetch(makeResponse(500, {}));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 1 });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── Default maxAttempts ───────────────────────────────────────────────────────

describe('fetchJsonWithRetry — default maxAttempts=3', () => {
  it('defaults to 3 attempts when none specified', async () => {
    vi.fn()  // ensure clean state
    const fn = vi.fn().mockResolvedValue(makeResponse(500, {}));
    vi.stubGlobal('fetch', fn);
    const res = await fetchJsonWithRetry('https://api.example.com', {}, FAST);
    expect(res.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ── JSON parse failure (partial response) ─────────────────────────────────────

describe('fetchJsonWithRetry — JSON parse failure', () => {
  it('marks partial=true when 200 body is unparseable JSON', async () => {
    stubFetch(makeBadJsonResponse(), makeBadJsonResponse(), makeBadJsonResponse());
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(false);
    expect(res.partial).toBe(true);
    expect(res.json).toBeNull();
  });

  it('retries on parse failure and succeeds when later attempt parses', async () => {
    stubFetch(makeBadJsonResponse(), makeResponse(200, { recovered: true }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(true);
    expect(res.json).toEqual({ recovered: true });
    expect(res.attempts).toBe(2);
  });

  it('error contains json_parse_error after exhausting retries', async () => {
    stubFetch(makeBadJsonResponse(), makeBadJsonResponse());
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 2 });
    expect(res.error).toMatch(/json_parse_error/i);
  });
});

// ── Network / thrown errors ───────────────────────────────────────────────────

describe('fetchJsonWithRetry — network errors', () => {
  it('retries on TypeError (network error) and succeeds on second attempt', async () => {
    stubFetch(
      Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }),
      makeResponse(200, { ok: true }),
    );
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it('retries on ECONNRESET error code and succeeds', async () => {
    stubFetch(
      Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
      makeResponse(200, { ok: true }),
    );
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it('does NOT retry on generic non-network Error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('unexpected application error'));
    vi.stubGlobal('fetch', fn);
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 3 });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('captures the error message in result.error', async () => {
    stubFetch(Object.assign(new TypeError('DNS lookup failed'), { name: 'TypeError' }));
    const res = await fetchJsonWithRetry('https://api.example.com', {}, { ...FAST, maxAttempts: 1 });
    expect(res.error).toContain('DNS lookup failed');
    expect(res.status).toBeNull();
  });

  it('never throws — always returns a result object', async () => {
    stubFetch(new Error('boom'));
    await expect(fetchJsonWithRetry('https://api.example.com', {}, FAST)).resolves.toBeDefined();
  });
});

// ── Caller AbortSignal ────────────────────────────────────────────────────────

describe('fetchJsonWithRetry — caller AbortSignal', () => {
  it('returns ok=false immediately when signal is already aborted before first attempt', async () => {
    const fn = vi.fn().mockResolvedValue(makeResponse(200, {}));
    vi.stubGlobal('fetch', fn);
    const controller = new AbortController();
    controller.abort();
    const res = await fetchJsonWithRetry(
      'https://api.example.com',
      {},
      { ...FAST, signal: controller.signal },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('aborted');
    expect(fn).not.toHaveBeenCalled();
  });
});

// ── Custom retryOn ────────────────────────────────────────────────────────────

describe('fetchJsonWithRetry — custom retryOn', () => {
  it('does not retry when custom retryOn always returns false', async () => {
    const fn = vi.fn().mockResolvedValue(makeResponse(500, {}));
    vi.stubGlobal('fetch', fn);
    const res = await fetchJsonWithRetry(
      'https://api.example.com',
      {},
      { ...FAST, maxAttempts: 3, retryOn: () => false },
    );
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries 400 when custom retryOn returns true for that status', async () => {
    stubFetch(makeResponse(400, {}), makeResponse(200, { ok: true }));
    const res = await fetchJsonWithRetry(
      'https://api.example.com',
      {},
      { ...FAST, maxAttempts: 3, retryOn: (status) => status === 400 },
    );
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });
});
