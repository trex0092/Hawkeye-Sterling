// Unit test: LUISA_INITIAL_PASSWORD recovery path is single-use only.
//
// Security requirement (Fix-1.4): after a successful recovery login,
// recoveryUsed is set to true and persisted. Any subsequent attempt with
// LUISA_INITIAL_PASSWORD must be denied before password comparison —
// the env-var must not act as a permanent backdoor.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "info").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

// --------------------------------------------------------------------------
// In-memory user store
// --------------------------------------------------------------------------

interface FakeUser {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  passwordHash: string;
  passwordSalt: string;
  pwVersion: number;
  recoveryUsed?: boolean;
  lastIpHash?: string;
}

let userStore: FakeUser[] = [];

vi.mock("next/server", async () => {
  const { NextResponse } = await import("../../src/__mocks__/next-server.js");
  return { NextResponse };
});

vi.mock("@/lib/server/store", () => ({
  getJson: vi.fn().mockResolvedValue(null),
  setJson: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  listKeys: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/server/audit-chain", () => ({
  writeAuditChainEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/metrics-store", () => ({
  incrementCounter: vi.fn(),
  getCounter: vi.fn().mockReturnValue(0),
  getAllCounters: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/server/auth", () => ({
  verifyPassword: vi.fn().mockReturnValue(false),
  hashPassword: vi.fn().mockReturnValue("new-hash"),
  generateSalt: vi.fn().mockReturnValue("new-salt"),
  issueSession: vi.fn().mockReturnValue("session-token"),
  computeRequestFingerprint: vi.fn().mockReturnValue("fp"),
  SESSION_COOKIE: "hs_session",
  SESSION_TTL_S: 3600,
}));

vi.mock("@/app/api/access/_store", () => ({
  loadUsers: vi.fn().mockImplementation(() => Promise.resolve(userStore)),
  saveUsers: vi.fn().mockImplementation((users: FakeUser[]) => {
    userStore = users;
    return Promise.resolve();
  }),
  withUsersLock: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
  appendSession: vi.fn().mockResolvedValue(undefined),
  maskIp: vi.fn().mockReturnValue("masked"),
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const RECOVERY_PASSWORD = "TestRecovery@2026!";

function makeLuisaUser(recoveryUsed?: boolean): FakeUser {
  return {
    id: "usr-001",
    username: "luisa",
    name: "Luisa Fernanda",
    role: "mlro",
    active: true,
    passwordHash: "stale-hash",
    passwordSalt: "stale-salt",
    pwVersion: 1,
    recoveryUsed,
  };
}

function makeRecoveryRequest() {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify({ username: "luisa", password: RECOVERY_PASSWORD }),
  });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("LUISA_INITIAL_PASSWORD recovery — single-use enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env["LUISA_INITIAL_PASSWORD"] = RECOVERY_PASSWORD;
    userStore = [makeLuisaUser(false)];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env["LUISA_INITIAL_PASSWORD"];
    userStore = [];
  });

  it("first recovery login succeeds (recoveryUsed is false)", async () => {
    const { POST } = await import("@/app/api/auth/login/route");

    const resPromise = POST(makeRecoveryRequest());
    await vi.runAllTimersAsync();
    const res = await resPromise;

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("first recovery login sets recoveryUsed=true on the stored record", async () => {
    const { saveUsers } = await import("@/app/api/access/_store");
    const { POST } = await import("@/app/api/auth/login/route");

    const resPromise = POST(makeRecoveryRequest());
    await vi.runAllTimersAsync();
    await resPromise;

    // saveUsers must have been called with recoveryUsed: true on the luisa record.
    expect(saveUsers).toHaveBeenCalled();
    const lastCall = (saveUsers as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [FakeUser[]];
    const luisa = lastCall[0].find((u: FakeUser) => u.id === "usr-001");
    expect(luisa?.recoveryUsed).toBe(true);
  });

  it("second recovery attempt is rejected when recoveryUsed=true", async () => {
    // Simulate the state after a successful first recovery: recoveryUsed is true.
    userStore = [makeLuisaUser(true)];

    const { POST } = await import("@/app/api/auth/login/route");

    const resPromise = POST(makeRecoveryRequest());
    await vi.runAllTimersAsync();
    const res = await resPromise;

    // Must be rejected — recovery path is closed.
    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("rejection occurs before recovery block executes (userStore unchanged when recoveryUsed=true)", async () => {
    userStore = [makeLuisaUser(true)];
    const { POST } = await import("@/app/api/auth/login/route");

    const resPromise = POST(makeRecoveryRequest());
    await vi.runAllTimersAsync();
    const res = await resPromise;

    // The !luisaRecord.recoveryUsed guard short-circuits the recovery block entirely.
    // The recovery block re-hashes the password and sets passwordHash="new-hash".
    // If recoveryUsed=true, the hash must remain "stale-hash" — the block was never entered.
    expect(res.status).toBe(401);
    expect(userStore[0]!.passwordHash).toBe("stale-hash");
  });

  it("recovery does not work when LUISA_INITIAL_PASSWORD env var is absent", async () => {
    delete process.env["LUISA_INITIAL_PASSWORD"];
    userStore = [makeLuisaUser(false)]; // recoveryUsed=false, but no env var

    const { POST } = await import("@/app/api/auth/login/route");

    const resPromise = POST(makeRecoveryRequest());
    await vi.runAllTimersAsync();
    const res = await resPromise;

    expect(res.status).toBe(401);
  });
});
