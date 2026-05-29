// Unit test: login route returns 503 when lockout write fails.
//
// Security requirement: if the blob store write for brute-force lockout
// fails, the route must NOT silently allow the request. Failing open on
// a lockout write error would let an attacker brute-force credentials
// during a storage degradation event.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "info").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

// --------------------------------------------------------------------------
// Mock infrastructure
// --------------------------------------------------------------------------

const mockIncrementCounter = vi.fn();
let mockSetJsonImpl: (key: string, value: unknown) => Promise<void> = async () => undefined;
let mockGetJsonImpl: (key: string) => Promise<unknown> = async () => null;

vi.mock("next/server", async () => {
  const { NextResponse } = await import("../../src/__mocks__/next-server.js");
  return { NextResponse };
});

vi.mock("@/lib/server/metrics-store", () => ({
  incrementCounter: (...args: unknown[]) => mockIncrementCounter(...args),
  getCounter: vi.fn().mockReturnValue(0),
  getAllCounters: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/server/store", () => ({
  getJson: (key: string) => mockGetJsonImpl(key),
  setJson: (key: string, value: unknown) => mockSetJsonImpl(key, value),
  del: vi.fn().mockResolvedValue(undefined),
  listKeys: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/audit-chain", () => ({
  writeAuditChainEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/auth", () => ({
  verifyPassword: vi.fn().mockResolvedValue(false),
  hashPassword: vi.fn().mockResolvedValue("hash"),
  generateSalt: vi.fn().mockReturnValue("salt"),
  issueSession: vi.fn().mockResolvedValue("token"),
  computeRequestFingerprint: vi.fn().mockReturnValue("fp"),
  SESSION_COOKIE: "hs_session",
  SESSION_TTL_S: 3600,
}));

vi.mock("@/app/api/access/_store", () => ({
  loadUsers: vi.fn().mockResolvedValue([]),
  saveUsers: vi.fn().mockResolvedValue(undefined),
  withUsersLock: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
  appendSession: vi.fn().mockResolvedValue(undefined),
  maskIp: vi.fn().mockReturnValue("masked"),
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const NOW = 1_700_000_000_000;

function makeRequest(username = "attacker", password = "wrong") {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify({ username, password }),
  });
}

// An AttemptRecord that has hit the maximum failure threshold so the next
// checkRateLimit call will attempt to write the lockout timestamp.
function maxedOutRecord(maxFailures = 50) {
  return {
    count: maxFailures,
    windowStart: NOW - 1_000,
    lockedUntil: 0,
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("login route — lockout write failure returns 503", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockIncrementCounter.mockClear();
    mockGetJsonImpl = async () => null;
    mockSetJsonImpl = async () => undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns 503 when IP lockout write throws (blob store degraded)", async () => {
    // getJson returns a near-limit record so setJson will be called for lockout.
    mockGetJsonImpl = async () => maxedOutRecord(50);
    // setJson throws — simulates blob store being temporarily unavailable.
    mockSetJsonImpl = async (_key, _val) => { throw new Error("blob store unavailable"); };

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeRequest());
    const body = await res.json() as { ok: boolean; error: string };

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Service temporarily unavailable");
  });

  it("increments hawkeye_auth_failures_total with lockout_write_failed reason on 503", async () => {
    mockGetJsonImpl = async () => maxedOutRecord(50);
    mockSetJsonImpl = async () => { throw new Error("storage error"); };

    const { POST } = await import("@/app/api/auth/login/route");
    await POST(makeRequest());

    expect(mockIncrementCounter).toHaveBeenCalledWith(
      "hawkeye_auth_failures_total",
      1,
      { reason: "lockout_write_failed" },
    );
  });

  it("returns 429 (not 503) when lockout was already written and lockedUntil is set", async () => {
    // Simulate a record that was previously locked (lockedUntil in the future).
    mockGetJsonImpl = async () => ({
      count: 50,
      windowStart: NOW - 1_000,
      lockedUntil: NOW + 900_000, // locked for 15 more minutes
    });
    // setJson is NOT called in this path — the early return on lockedUntil fires first.
    mockSetJsonImpl = async () => { throw new Error("should not be called"); };

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
  });

  it("returns 200 or 401 when no record exists (no lockout, no 503)", async () => {
    mockGetJsonImpl = async () => null;
    mockSetJsonImpl = async () => undefined;

    const { POST } = await import("@/app/api/auth/login/route");
    // The login route has a 400ms uniform timing delay on failed attempts to
    // prevent user-enumeration via side-channel. With fake timers active we
    // must advance the clock so that setTimeout fires and the route resolves.
    const resPromise = POST(makeRequest());
    await vi.runAllTimersAsync();
    const res = await resPromise;

    // With no users loaded, result is 401 (invalid credentials). NOT 503.
    expect(res.status).not.toBe(503);
    expect(res.status).not.toBe(429);
  });
});
