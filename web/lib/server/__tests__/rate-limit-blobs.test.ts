import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Ensure Redis env vars are absent so all tests exercise the Blobs fallback path.
const originalEnv = { ...process.env };

vi.mock('../store', () => {
  const store = new Map<string, unknown>();
  return {
    getJson: vi.fn(async (key: string) => store.get(key) ?? null),
    setJson: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    _store: store,
  };
});

vi.mock('../metrics-store', () => ({
  incrementCounter: vi.fn(),
}));

describe('consumeRateLimit — Netlify Blobs fallback path', () => {
  beforeEach(async () => {
    // Remove Redis env vars to force Blobs path
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['RATE_LIMIT_STRICT'];
    vi.resetModules();

    // Clear the mock store between tests
    const { _store } = await import('../store') as { _store: Map<string, unknown> };
    _store.clear();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it('allows the first request (counter starts at 0)', async () => {
    const { consumeRateLimit } = await import('../rate-limit');
    const result = await consumeRateLimit('blobs-test-allow', 'free');
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSec).toBe(0);
  });

  it('increments counter on each call', async () => {
    const { consumeRateLimit } = await import('../rate-limit');
    const { setJson, getJson } = await import('../store');

    await consumeRateLimit('blobs-incr-test', 'free');
    await consumeRateLimit('blobs-incr-test', 'free');

    // setJson called twice (once per consumeRateLimit call)
    expect(vi.mocked(setJson).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(getJson).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects request when per-second limit is exceeded', async () => {
    const { consumeRateLimit } = await import('../rate-limit');
    const { _store } = await import('../store') as { _store: Map<string, unknown> };

    const nowMs = Date.now();
    const secStart = Math.floor(nowMs / 1_000) * 1_000;
    const minStart = Math.floor(nowMs / 60_000) * 60_000;

    // Pre-seed the store with a counter at the per-second limit
    // 'free' tier allows 10 req/s — inject 10 already consumed
    _store.set('ratelimit/blobs-over-limit', {
      second: { startMs: secStart, count: 10 },
      minute: { startMs: minStart, count: 10 },
    });

    const result = await consumeRateLimit('blobs-over-limit', 'free');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
    expect(result.remainingSecond).toBe(0);
  });

  it('resets window when the second boundary is crossed', async () => {
    const { consumeRateLimit } = await import('../rate-limit');
    const { _store } = await import('../store') as { _store: Map<string, unknown> };

    // Inject a stale second window (1 000 ms ago) with a maxed-out counter
    const staleSecStart = Math.floor((Date.now() - 2_000) / 1_000) * 1_000;
    const minStart = Math.floor(Date.now() / 60_000) * 60_000;
    _store.set('ratelimit/blobs-window-reset', {
      second: { startMs: staleSecStart, count: 9999 },
      minute: { startMs: minStart, count: 1 },
    });

    const result = await consumeRateLimit('blobs-window-reset', 'free');
    // New second window should be started, so the request should be allowed
    expect(result.allowed).toBe(true);
  });

  // RATE_LIMIT_STRICT=true selects the deterministic in-memory per-instance
  // limiter when Redis is absent: requests under the tier limit pass, requests
  // over it are denied, and no blob I/O happens. The previous blanket denial
  // ("fail-closed") caused the 2026-06-11 platform outage.
  it('RATE_LIMIT_STRICT=true enforces in-memory limits when Redis is absent', async () => {
    process.env['RATE_LIMIT_STRICT'] = 'true';
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'));
    try {
      const { consumeRateLimit } = await import('../rate-limit');
      // free tier: 5/sec — five pass, the sixth is denied within the same second
      for (let i = 0; i < 5; i++) {
        const r = await consumeRateLimit('memory-strict-test', 'free');
        expect(r.allowed).toBe(true);
      }
      const denied = await consumeRateLimit('memory-strict-test', 'free');
      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterSec).toBeGreaterThan(0);
      // next second: the window rolls over and requests pass again
      vi.setSystemTime(new Date('2026-01-01T00:00:01.500Z'));
      const recovered = await consumeRateLimit('memory-strict-test', 'free');
      expect(recovered.allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Production default (RATE_LIMIT_STRICT unset): Redis-unavailable must NOT
  // refuse traffic wholesale — it degrades to in-memory per-instance
  // enforcement with zero store I/O. Regression test for the 2026-06-11
  // outage where every route answered 429 during an Upstash brownout.
  it('production default serves traffic via in-memory limits when Redis is absent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    try {
      const { consumeRateLimit } = await import('../rate-limit');
      const { getJson, setJson } = await import('../store');
      // Delta-based: mock call history can bleed across tests in this file.
      const getCallsBefore = vi.mocked(getJson).mock.calls.length;
      const setCallsBefore = vi.mocked(setJson).mock.calls.length;
      const result = await consumeRateLimit('memory-prod-default-test', 'free');
      expect(result.allowed).toBe(true);
      expect(vi.mocked(getJson).mock.calls.length).toBe(getCallsBefore);
      expect(vi.mocked(setJson).mock.calls.length).toBe(setCallsBefore);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('RATE_LIMIT_STRICT=false opts production back into the soft Blobs fallback', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env['RATE_LIMIT_STRICT'] = 'false';
    vi.resetModules();
    try {
      const { consumeRateLimit } = await import('../rate-limit');
      const result = await consumeRateLimit('blobs-prod-optout-test', 'free');
      expect(result.allowed).toBe(true); // soft path served it
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
