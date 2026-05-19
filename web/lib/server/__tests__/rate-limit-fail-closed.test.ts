// Tests for the rate-limit fail-closed behavior.
//
// Verifies that concurrent write detection (the Blobs CAS gap) causes
// the rate-limit function to REJECT rather than allow the request through.
// This is a security property: a Lambda that sees its write was overrun by
// a concurrent sibling must return allowed:false, not allowed:true.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { consumeRateLimit } from '../rate-limit';

// Mock the store module so tests run without Netlify Blobs infrastructure.
// The mock is per-test-file (hoisted by vitest).
vi.mock('../store', () => {
  let stored: Record<string, unknown> = {};
  return {
    getJson: vi.fn(async (key: string) => stored[key] ?? null),
    setJson: vi.fn(async (key: string, val: unknown) => { stored[key] = val; }),
    _resetStore: () => { stored = {}; },
    _setStored: (key: string, val: unknown) => { stored[key] = val; },
  };
});

// import after mock is set up
import { getJson, setJson } from '../store';

const store = await import('../store') as unknown as {
  getJson: ReturnType<typeof vi.fn>;
  setJson: ReturnType<typeof vi.fn>;
  _resetStore: () => void;
  _setStored: (k: string, v: unknown) => void;
};

beforeEach(() => {
  store._resetStore();
  vi.clearAllMocks();
});

const now = Date.now();
const secondStart = Math.floor(now / 1000) * 1000;
const minuteStart = Math.floor(now / 60000) * 60000;

// Simulate a state where our write (count=1) was overwritten by a concurrent
// sibling that bumped it to 3 — visible in the read-back after our setJson.
function simulateConcurrentWrite(keyId: string, ourCount = 1, racedCount = 3): void {
  const key = `ratelimit/${keyId}`;
  let callCount = 0;
  store.getJson.mockImplementation(async (k: string) => {
    callCount++;
    if (k === key) {
      if (callCount === 1) {
        // First read (prior state) — return low count so we decide to allow
        return { second: { startMs: secondStart, count: ourCount - 1 }, minute: { startMs: minuteStart, count: 0 } };
      }
      // Second read (post-write read-back) — return inflated count from concurrent write
      return { second: { startMs: secondStart, count: racedCount }, minute: { startMs: minuteStart, count: 0 } };
    }
    return null;
  });
}

describe('rate-limit — fail-closed on concurrent write detection', () => {
  it('returns allowed:false when read-back shows higher count than we wrote', async () => {
    simulateConcurrentWrite('test-key-1', 1, 5);
    // Use a real tier ID that exists — 'sandbox' is the most permissive
    const result = await consumeRateLimit('test-key-1', 'sandbox');
    expect(result.allowed).toBe(false);
  });

  it('sets retryAfterSec=1 when failing closed from concurrent write', async () => {
    simulateConcurrentWrite('test-key-2', 1, 5);
    const result = await consumeRateLimit('test-key-2', 'sandbox');
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('returns allowed:true when read-back matches written count (no race)', async () => {
    const key = 'ratelimit/test-key-3';
    let callCount = 0;
    store.getJson.mockImplementation(async (k: string) => {
      if (k !== key) return null;
      callCount++;
      // Both reads return count=1 — no concurrent overrun
      return { second: { startMs: secondStart, count: callCount === 1 ? 0 : 1 }, minute: { startMs: minuteStart, count: callCount === 1 ? 0 : 1 } };
    });
    const result = await consumeRateLimit('test-key-3', 'sandbox');
    expect(result.allowed).toBe(true);
  });

  it('does not fail-closed when read-back count exceeds written by exactly 1 (within tolerance)', async () => {
    // The guard is `readBack.second.count > nextSecond + 1` (strictly greater than +1).
    // A delta of exactly 1 is the normal single-concurrent-request case, not worth blocking.
    const key = 'ratelimit/test-key-4';
    let callCount = 0;
    store.getJson.mockImplementation(async (k: string) => {
      if (k !== key) return null;
      callCount++;
      const priorCount = callCount === 1 ? 0 : 2; // second read shows count=2 (our 1 + 1 concurrent)
      return { second: { startMs: secondStart, count: priorCount }, minute: { startMs: minuteStart, count: priorCount } };
    });
    const result = await consumeRateLimit('test-key-4', 'sandbox');
    // delta is 1 (2 - 1), which is ≤ 1 so NOT blocked
    expect(result.allowed).toBe(true);
  });
});

describe('rate-limit — basic enforcement (no race)', () => {
  it('rejects when per-second limit is exceeded', async () => {
    const key = 'ratelimit/test-key-sec';
    // Simulate a state where the second counter is already at the limit
    store.getJson.mockResolvedValue({
      second: { startMs: secondStart, count: 999 }, // very high count
      minute: { startMs: minuteStart, count: 0 },
    });
    const result = await consumeRateLimit('test-key-sec', 'sandbox');
    expect(result.allowed).toBe(false);
  });

  it('allowed:true returns non-negative remainingSecond', async () => {
    store.getJson.mockResolvedValue(null); // fresh state
    const result = await consumeRateLimit('test-fresh', 'sandbox');
    if (result.allowed) {
      expect(result.remainingSecond).toBeGreaterThanOrEqual(0);
      expect(result.remainingMinute).toBeGreaterThanOrEqual(0);
    }
  });
});
