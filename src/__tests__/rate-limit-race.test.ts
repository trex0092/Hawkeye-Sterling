// Unit test: rate-limit concurrent write detection returns allowed:false.
//
// Security requirement: under concurrent Lambda invocations the blob-based
// soft-limit path may race. If the post-write read-back shows a count higher
// than our own increment (+1), another Lambda won the race. The request must
// be DENIED (not silently allowed) to prevent per-second/per-minute bypass.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "info").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

// --------------------------------------------------------------------------
// Mock infrastructure
// --------------------------------------------------------------------------

const mockIncrementCounter = vi.fn();

// getJson call sequence: first call returns existing state, second call
// (the read-back) returns a state with a higher concurrent count.
let getJsonCallCount = 0;
let mockInitialState: unknown = null;
let mockReadBackState: unknown = null;

vi.mock("@/lib/server/store", () => ({
  getJson: async (_key: string) => {
    getJsonCallCount++;
    if (getJsonCallCount === 1) return mockInitialState;
    return mockReadBackState; // post-write read-back
  },
  setJson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/metrics-store", () => ({
  incrementCounter: (...args: unknown[]) => mockIncrementCounter(...args),
  getCounter: vi.fn().mockReturnValue(0),
  getAllCounters: vi.fn().mockReturnValue({}),
}));

// Stub Redis so it's never used (forces blob path).
vi.mock("@upstash/redis", () => ({}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const NOW = 1_700_000_000_000;
const SEC_START = Math.floor(NOW / 1_000) * 1_000;
const MIN_START = Math.floor(NOW / 60_000) * 60_000;

function makeLimitState(secondCount: number, minuteCount = 0) {
  return {
    second: { startMs: SEC_START, count: secondCount },
    minute: { startMs: MIN_START, count: minuteCount },
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("consumeRateLimit — concurrent write detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    getJsonCallCount = 0;
    mockIncrementCounter.mockClear();
    mockInitialState = null;
    mockReadBackState = null;
    delete process.env["RATE_LIMIT_STRICT"];
    delete process.env["UPSTASH_REDIS_REST_URL"];
    delete process.env["UPSTASH_REDIS_REST_TOKEN"];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns allowed:false when read-back count exceeds expected by more than 1", async () => {
    // Initial state: count=0 (within limits).
    mockInitialState = makeLimitState(0);
    // Read-back state: count=5 (4 concurrent writes detected).
    // nextSecond would be 1, so readBack.second.count (5) > nextSecond+1 (2).
    mockReadBackState = makeLimitState(5);

    const { consumeRateLimit } = await import("@/lib/server/rate-limit");
    const result = await consumeRateLimit("test-key", "standard");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBe(1);
  });

  it("increments hawkeye_rate_limit_rejections_total with concurrent_write window label", async () => {
    mockInitialState = makeLimitState(0);
    mockReadBackState = makeLimitState(5);

    const { consumeRateLimit } = await import("@/lib/server/rate-limit");
    await consumeRateLimit("test-key", "standard");

    expect(mockIncrementCounter).toHaveBeenCalledWith(
      "hawkeye_rate_limit_rejections_total",
      1,
      expect.objectContaining({ window: "concurrent_write" }),
    );
  });

  it("returns allowed:false when read-back count is exactly nextSecond + 1 (concurrent write detected)", async () => {
    // nextSecond will be 1 (0 + effectiveCost 1).
    // readBack count = 2 ≠ nextSecond (1). Stricter check: any delta triggers rejection.
    // This prevents the 1-request slippage bypass where two concurrent requests at the
    // limit boundary both pass (C-8 fix: changed > nextSecond+1 to !== nextSecond).
    mockInitialState = makeLimitState(0);
    mockReadBackState = makeLimitState(2);

    const { consumeRateLimit } = await import("@/lib/server/rate-limit");
    const result = await consumeRateLimit("test-key", "standard");

    expect(result.allowed).toBe(false);
  });

  it("returns allowed:true when read-back count equals nextSecond (normal single-instance write)", async () => {
    mockInitialState = makeLimitState(0);
    mockReadBackState = makeLimitState(1); // exactly our write, no race

    const { consumeRateLimit } = await import("@/lib/server/rate-limit");
    const result = await consumeRateLimit("test-key", "standard");

    expect(result.allowed).toBe(true);
  });

  it("denies immediately under RATE_LIMIT_STRICT=true when Redis is unavailable", async () => {
    process.env["RATE_LIMIT_STRICT"] = "true";
    mockInitialState = null;

    const { consumeRateLimit } = await import("@/lib/server/rate-limit");
    const result = await consumeRateLimit("test-key", "standard");

    expect(result.allowed).toBe(false);
    expect(mockIncrementCounter).toHaveBeenCalledWith(
      "hawkeye_rate_limit_rejections_total",
      1,
      expect.objectContaining({ window: "strict_redis_unavailable" }),
    );
  });
});
