// Unit tests for the auth enforcement middleware (web/lib/server/enforce.ts).
//
// Covers: content-type/body guards, property-level default merging, anonymous
// rejection, ADMIN_TOKEN + SANCTIONS_CRON_TOKEN bypass paths, session cookie
// path, JWT path (valid, expired, tampered, alg pinning, revocation, rotation),
// plaintext API-key path, cost parameter, and high-severity audit chain writes.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

// ─── Stable mock function refs (vi.hoisted runs before vi.mock factories) ────
// This is the idiomatic Vitest pattern that avoids factory-singleton / module-
// reset races: all vi.fn() instances are created once here and shared into
// vi.mock() declarations AND referenced directly in tests.
const mocks = vi.hoisted(() => ({
  extractKey: vi.fn<() => string | null>(() => null),
  validateAndConsume: vi.fn(),
  consumeRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(() => ({} as Record<string, string>)),
  getJson: vi.fn(async () => null as unknown),
  verifySession: vi.fn(() => null as unknown),
  writeAuditChainEntry: vi.fn(async () => true),
  incrementCounter: vi.fn(),
  log: vi.fn(),
}));

// ─── Mock declarations (hoisted; factories reference the stable refs above) ──

vi.mock("../api-keys", () => ({
  extractKey: mocks.extractKey,
  validateAndConsume: mocks.validateAndConsume,
}));

vi.mock("../rate-limit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  rateLimitHeaders: mocks.rateLimitHeaders,
}));

vi.mock("../store", () => ({
  getJson: mocks.getJson,
}));

vi.mock("../auth", () => ({
  verifySession: mocks.verifySession,
  SESSION_COOKIE: "hs_session",
}));

vi.mock("../audit-chain", () => ({
  writeAuditChainEntry: mocks.writeAuditChainEntry,
}));

vi.mock("../metrics-store", () => ({
  incrementCounter: mocks.incrementCounter,
}));

vi.mock("../logger", () => ({
  log: mocks.log,
}));

// ─── Static imports (enforce + jwt are NOT mocked; they use the mocks above) ─
// jwt.ts reads env vars inside each function call, so vi.stubEnv() is
// sufficient — no module reload required.
import { enforce, anonIpKey } from "../enforce";
import { issueJwt } from "../jwt";

// ─── Constants ────────────────────────────────────────────────────────────────

const JWT_SECRET = "a".repeat(32);
const PREV_SECRET = "b".repeat(32);
const ADMIN_TOKEN_VAL = "admin-token-for-test-32bytesXXXXX";
const CRON_TOKEN_VAL = "cron-token-for-test-32bytesXXXXXX";

// ─── Env + mock setup / teardown ─────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv("JWT_SIGNING_SECRET", JWT_SECRET);
  vi.stubEnv("JWT_SIGNING_SECRET_PREV", "");
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  vi.stubEnv("ADMIN_TOKEN", "");
  vi.stubEnv("SANCTIONS_CRON_TOKEN", "");
  vi.stubEnv("NODE_ENV", "test");

  // Clear call history and reset all implementations to safe defaults so that
  // mock state from one test never bleeds into the next.
  vi.clearAllMocks();
  mocks.extractKey.mockReturnValue(null);
  mocks.validateAndConsume.mockResolvedValue({ ok: false, reason: "invalid" });
  mocks.consumeRateLimit.mockResolvedValue(rlAllow());
  mocks.rateLimitHeaders.mockReturnValue({});
  mocks.getJson.mockResolvedValue(null);
  mocks.verifySession.mockReturnValue(null);
  mocks.writeAuditChainEntry.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── Factories ────────────────────────────────────────────────────────────────

function makeReq(opts: {
  method?: string;
  auth?: string;
  cookie?: string;
  contentType?: string | null;
  body?: string;
  xForwardedFor?: string;
} = {}): Request {
  const headers = new Headers();
  if (opts.auth) headers.set("authorization", `Bearer ${opts.auth}`);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.contentType != null) headers.set("content-type", opts.contentType);
  if (opts.xForwardedFor) headers.set("x-forwarded-for", opts.xForwardedFor);
  return new Request("https://test.local/api/test", {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: opts.body } : {}),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rlAllow(tierId = "standard"): any {
  return {
    allowed: true,
    retryAfterSec: 0,
    remainingSecond: 99,
    remainingMinute: 999,
    tier: { id: tierId, rateLimitPerSecond: 10, rateLimitPerMinute: 100 },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rlDeny(retryAfterSec = 1): any {
  return {
    allowed: false,
    retryAfterSec,
    remainingSecond: 0,
    remainingMinute: 0,
    tier: { id: "free", rateLimitPerSecond: 2, rateLimitPerMinute: 20 },
  };
}

function makeJwt(
  extraPayload: Record<string, unknown> = {},
  opts: { ttlSec?: number; iss?: string } = {},
): string {
  return issueJwt(
    { sub: "key_test", tier: "standard", ...extraPayload } as Parameters<typeof issueJwt>[0],
    { iss: "hawkeye-sterling", ...opts },
  ).token;
}

// Craft a JWT with arbitrary header/payload signed with JWT_SECRET.
function craftJwt(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validRecord(overrides: Record<string, unknown> = {}): any {
  return {
    id: "key_test",
    hash: "abc123",
    name: "Test Key",
    tier: "standard",
    email: "test@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    usageMonthly: 0,
    usageResetAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Content-Type and body guards
// ═════════════════════════════════════════════════════════════════════════════

describe("content-type / body guards", () => {
  it("POST with a body and no Content-Type returns 415", async () => {
    const result = await enforce(makeReq({ method: "POST", body: '{"x":1}' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(415);
  });

  it("POST with Content-Type: application/json passes the guard", async () => {
    // anonymous + requireAuth:true → 401 (guard passed, auth check fires)
    const result = await enforce(
      makeReq({ method: "POST", contentType: "application/json", body: "{}" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.clone().json();
      expect(body.error).toContain("API key");
    }
  });

  it("GET skips content-type guard regardless of headers", async () => {
    const result = await enforce(makeReq({ method: "GET" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("POST with requireJsonBody:false skips the Content-Type guard", async () => {
    const result = await enforce(makeReq({ method: "POST", body: "{}" }), {
      requireJsonBody: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("body exceeding maxBodyBytes returns 413", async () => {
    const bigBody = '{"x":"' + "y".repeat(30) + '"}';
    const result = await enforce(makeReq({ method: "POST", body: bigBody }), {
      maxBodyBytes: 10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("empty-body POST skips Content-Type check", async () => {
    // No body → hasBody=false → guard skips CT check → falls through to auth → 401
    const result = await enforce(makeReq({ method: "POST" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Property-level default merging (anti-footgun)
// ═════════════════════════════════════════════════════════════════════════════

describe("property-level default merging", () => {
  it("empty opts applies both requireAuth:true and requireJsonBody:true", async () => {
    // POST without CT → 415 (proves requireJsonBody defaulted true, not 401)
    const result = await enforce(makeReq({ method: "POST", body: "{}" }), {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(415);
  });

  it("{ requireAuth: false } still enforces requireJsonBody:true", async () => {
    const result = await enforce(makeReq({ method: "POST", body: "{}" }), {
      requireAuth: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(415);
  });

  it("{ requireJsonBody: false } still enforces requireAuth:true", async () => {
    const result = await enforce(makeReq({ method: "POST", body: "{}" }), {
      requireJsonBody: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("{ requireAuth: false, requireJsonBody: false } passes both defaults off", async () => {
    mocks.consumeRateLimit.mockResolvedValue(rlAllow("free"));
    const result = await enforce(makeReq({ method: "POST", body: "{}" }), {
      requireAuth: false,
      requireJsonBody: false,
    });
    expect(result.ok).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Anonymous path
// ═════════════════════════════════════════════════════════════════════════════

describe("anonymous path", () => {
  it("no key + requireAuth:true (default) returns 401 and writes audit chain entry", async () => {
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
    expect(mocks.incrementCounter).toHaveBeenCalledWith(
      "hawkeye_auth_failures_total",
      1,
      expect.objectContaining({ reason: "anonymous_request_rejected" }),
    );
  });

  it("no key + requireAuth:false routes through anonymous rate-limit bucket", async () => {
    const result = await enforce(makeReq({ xForwardedFor: "1.2.3.4" }), {
      requireAuth: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.keyId).toMatch(/^anon_/);
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^anon_/),
      "free",
      1,
    );
  });

  it("anonymous bucket uses the LAST x-forwarded-for IP (not the first)", async () => {
    // Compute expected bucket hash from the live anonIpKey
    const ipKey = anonIpKey();
    const bucket = (ip: string) =>
      `anon_${createHmac("sha256", ipKey).update(ip).digest("hex").slice(0, 12)}`;

    // "1.2.3.4, 9.9.9.9" → last IP = "9.9.9.9"
    await enforce(makeReq({ xForwardedFor: "1.2.3.4, 9.9.9.9" }), { requireAuth: false });
    expect(mocks.consumeRateLimit.mock.calls[0]?.[0]).toBe(bucket("9.9.9.9"));

    mocks.consumeRateLimit.mockClear();
    mocks.consumeRateLimit.mockResolvedValue(rlAllow("free"));

    // "5.6.7.8, 9.9.9.9" → same last IP → same bucket
    await enforce(makeReq({ xForwardedFor: "5.6.7.8, 9.9.9.9" }), { requireAuth: false });
    expect(mocks.consumeRateLimit.mock.calls[0]?.[0]).toBe(bucket("9.9.9.9"));

    // "1.2.3.4, 8.8.8.8" → different last IP → different bucket
    mocks.consumeRateLimit.mockClear();
    mocks.consumeRateLimit.mockResolvedValue(rlAllow("free"));
    await enforce(makeReq({ xForwardedFor: "1.2.3.4, 8.8.8.8" }), { requireAuth: false });
    expect(mocks.consumeRateLimit.mock.calls[0]?.[0]).toBe(bucket("8.8.8.8"));
    expect(bucket("8.8.8.8")).not.toBe(bucket("9.9.9.9"));
  });

  it("anonymous rate-limited returns 429", async () => {
    mocks.consumeRateLimit.mockResolvedValue(rlDeny());
    const result = await enforce(makeReq(), { requireAuth: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(429);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ADMIN_TOKEN bypass
// ═════════════════════════════════════════════════════════════════════════════

describe("ADMIN_TOKEN bypass", () => {
  it("matching token grants enterprise access as portal_admin", async () => {
    vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN_VAL);
    mocks.extractKey.mockReturnValue(ADMIN_TOKEN_VAL);
    mocks.consumeRateLimit.mockResolvedValue(rlAllow("enterprise"));
    const result = await enforce(makeReq());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyId).toBe("portal_admin");
      expect(result.tier.id).toBe("enterprise");
    }
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith("portal_admin", "enterprise");
  });

  it("matching token rate-limited returns 429", async () => {
    vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN_VAL);
    mocks.extractKey.mockReturnValue(ADMIN_TOKEN_VAL);
    mocks.consumeRateLimit.mockResolvedValue(rlDeny());
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(429);
  });

  it("wrong token falls through to normal auth paths", async () => {
    vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN_VAL);
    mocks.extractKey.mockReturnValue("not-the-admin-token");
    // falls through to plaintext API key path; mock returns "invalid"
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalledWith("portal_admin", expect.anything());
  });

  it("ADMIN_TOKEN env unset means admin path is never taken", async () => {
    // ADMIN_TOKEN defaults to "" — admin path skipped
    mocks.extractKey.mockReturnValue(ADMIN_TOKEN_VAL);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalledWith("portal_admin", expect.anything());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. SANCTIONS_CRON_TOKEN bypass
// ═════════════════════════════════════════════════════════════════════════════

describe("SANCTIONS_CRON_TOKEN bypass", () => {
  it("matching token grants access as cron_internal", async () => {
    vi.stubEnv("SANCTIONS_CRON_TOKEN", CRON_TOKEN_VAL);
    mocks.extractKey.mockReturnValue(CRON_TOKEN_VAL);
    mocks.consumeRateLimit.mockResolvedValue(rlAllow("enterprise"));
    const result = await enforce(makeReq());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.keyId).toBe("cron_internal");
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith("cron_internal", "enterprise");
  });

  it("cron token rate-limited returns 429", async () => {
    vi.stubEnv("SANCTIONS_CRON_TOKEN", CRON_TOKEN_VAL);
    mocks.extractKey.mockReturnValue(CRON_TOKEN_VAL);
    mocks.consumeRateLimit.mockResolvedValue(rlDeny());
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(429);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Session cookie path
// ═════════════════════════════════════════════════════════════════════════════

describe("session cookie path", () => {
  it("valid session cookie grants enterprise access keyed by userId", async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.verifySession.mockReturnValue({
      userId: "u1",
      username: "alice",
      role: "mlro",
      iat: now,
      exp: now + 28800,
    });
    mocks.consumeRateLimit.mockResolvedValue(rlAllow("enterprise"));
    const result = await enforce(makeReq({ cookie: "hs_session=valid-token" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyId).toBe("session_u1");
      expect(result.tier.id).toBe("enterprise");
    }
  });

  it("valid session rate-limited returns 429", async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.verifySession.mockReturnValue({ userId: "u2", username: "bob", role: "compliance_assistant", iat: now, exp: now + 28800 });
    mocks.consumeRateLimit.mockResolvedValue(rlDeny());
    const result = await enforce(makeReq({ cookie: "hs_session=valid-token" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(429);
  });

  it("invalid session (verifySession returns null) falls through to anonymous reject", async () => {
    mocks.verifySession.mockReturnValue(null);
    const result = await enforce(makeReq({ cookie: "hs_session=bad-token" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("verifySession throwing falls through gracefully to anonymous reject", async () => {
    mocks.verifySession.mockImplementation(() => { throw new Error("SESSION_SECRET missing"); });
    const result = await enforce(makeReq({ cookie: "hs_session=some-token" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. JWT path
// ═════════════════════════════════════════════════════════════════════════════

describe("JWT path", () => {
  it("valid JWT with live record returns ok:true", async () => {
    const token = makeJwt();
    mocks.extractKey.mockReturnValue(token);
    mocks.getJson.mockResolvedValue(validRecord());
    const result = await enforce(makeReq());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.keyId).toBe("key_test");
  });

  it("valid JWT when live record absent falls back to JWT-embedded tier", async () => {
    const token = makeJwt();
    mocks.extractKey.mockReturnValue(token);
    mocks.getJson.mockResolvedValue(null);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(true);
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith("key_test", "standard", 1);
  });

  it("expired JWT returns 401", async () => {
    const token = makeJwt({}, { ttlSec: -1 });
    mocks.extractKey.mockReturnValue(token);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.clone().json();
      expect(body.error).toContain("expired");
    }
  });

  it("tampered signature returns 401 and writes to audit chain (high-severity)", async () => {
    const token = makeJwt();
    const parts = token.split(".");
    mocks.extractKey.mockReturnValue(`${parts[0]}.${parts[1]}.aaaBBBccc`);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
  });

  it("alg:none forgery returns 401 and writes to audit chain (high-severity)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(
      JSON.stringify({ sub: "evil", tier: "admin", iat: now, exp: now + 9999, iss: "hawkeye-sterling" }),
    ).toString("base64url");
    mocks.extractKey.mockReturnValue(`${h}.${p}.`);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
  });

  it("alg:RS256 forgery returns 401 and writes to audit chain", async () => {
    const now = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(
      JSON.stringify({ sub: "evil", tier: "admin", iat: now, exp: now + 9999, iss: "hawkeye-sterling" }),
    ).toString("base64url");
    mocks.extractKey.mockReturnValue(`${h}.${p}.fakesig`);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
  });

  it("JWT with wrong issuer returns 401 (F-06 confusion guard)", async () => {
    const token = makeJwt({}, { iss: "other-service" });
    mocks.extractKey.mockReturnValue(token);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.clone().json();
      expect(body.error).toContain("invalid_issuer");
    }
  });

  it("JWT with wrong iss claim returns 401 (required after F-06)", async () => {
    const token = makeJwt({}, { iss: "wrong-service" });
    mocks.extractKey.mockReturnValue(token);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("JWT missing sub claim returns 401 with 'missing sub' error", async () => {
    const now = Math.floor(Date.now() / 1000);
    // craftJwt: valid HS256 signature, correct issuer, but no `sub` field
    const token = craftJwt(
      { alg: "HS256", typ: "JWT" },
      { tier: "standard", iat: now, exp: now + 600, iss: "hawkeye-sterling" },
    );
    mocks.extractKey.mockReturnValue(token);
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.clone().json();
      expect(body.error).toContain("missing sub");
    }
  });

  it("JWT with revoked live key returns 401 and writes to audit chain", async () => {
    const token = makeJwt();
    mocks.extractKey.mockReturnValue(token);
    mocks.getJson.mockResolvedValue(validRecord({ revokedAt: "2026-01-01T00:00:00.000Z" }));
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.clone().json();
      expect(body.error).toContain("revoked");
    }
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
  });

  it("JWT rate-limited returns 429", async () => {
    const token = makeJwt();
    mocks.extractKey.mockReturnValue(token);
    mocks.getJson.mockResolvedValue(validRecord());
    mocks.consumeRateLimit.mockResolvedValue(rlDeny());
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(429);
  });

  it("accepts JWT signed with JWT_SIGNING_SECRET_PREV during key rotation", async () => {
    // Issue with the old (prev) key by temporarily switching the stub
    vi.stubEnv("JWT_SIGNING_SECRET", PREV_SECRET);
    const prevToken = issueJwt(
      { sub: "key_prev", tier: "standard" },
      { iss: "hawkeye-sterling" },
    ).token;

    // Rotate: new key primary, old still accepted
    vi.stubEnv("JWT_SIGNING_SECRET", JWT_SECRET);
    vi.stubEnv("JWT_SIGNING_SECRET_PREV", PREV_SECRET);

    mocks.extractKey.mockReturnValue(prevToken);
    mocks.getJson.mockResolvedValue(validRecord({ id: "key_prev" }));

    const result = await enforce(makeReq());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.keyId).toBe("key_prev");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Plaintext API key path
// ═════════════════════════════════════════════════════════════════════════════

describe("plaintext API key path", () => {
  it("valid key returns ok:true with remainingMonthly and quota header", async () => {
    mocks.extractKey.mockReturnValue("hks_live_testkey");
    mocks.validateAndConsume.mockResolvedValue({
      ok: true,
      record: validRecord(),
      tier: { id: "standard" },
      remainingMonthly: 500,
    });
    const result = await enforce(makeReq());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remainingMonthly).toBe(500);
      expect(result.headers["x-quota-remaining-monthly"]).toBe("500");
    }
  });

  it("quota_exceeded returns 429", async () => {
    mocks.extractKey.mockReturnValue("hks_live_testkey");
    mocks.validateAndConsume.mockResolvedValue({ ok: false, reason: "quota_exceeded" });
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(429);
      const body = await result.response.clone().json();
      expect(body.error).toContain("quota");
    }
  });

  it("revoked key returns 401", async () => {
    mocks.extractKey.mockReturnValue("hks_live_testkey");
    mocks.validateAndConsume.mockResolvedValue({ ok: false, reason: "revoked" });
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("unknown key returns 401", async () => {
    mocks.extractKey.mockReturnValue("hks_live_testkey");
    mocks.validateAndConsume.mockResolvedValue({ ok: false, reason: "invalid" });
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.clone().json();
      expect(body.error).toContain("invalid API key");
    }
  });

  it("valid key rate-limited returns 429 with retryAfterSec", async () => {
    mocks.extractKey.mockReturnValue("hks_live_testkey");
    mocks.validateAndConsume.mockResolvedValue({
      ok: true,
      record: validRecord(),
      tier: { id: "standard" },
      remainingMonthly: 100,
    });
    mocks.consumeRateLimit.mockResolvedValue(rlDeny(60));
    const result = await enforce(makeReq());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(429);
      const body = await result.response.clone().json();
      expect(body.retryAfterSec).toBe(60);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Cost parameter
// ═════════════════════════════════════════════════════════════════════════════

describe("cost parameter", () => {
  it("cost:5 is forwarded to consumeRateLimit as the third argument", async () => {
    const token = makeJwt();
    mocks.extractKey.mockReturnValue(token);
    mocks.getJson.mockResolvedValue(validRecord());
    await enforce(makeReq(), { cost: 5 });
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith("key_test", expect.any(String), 5);
  });

  it("default cost:1 is used when opts.cost is omitted", async () => {
    const token = makeJwt();
    mocks.extractKey.mockReturnValue(token);
    mocks.getJson.mockResolvedValue(validRecord());
    await enforce(makeReq());
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith("key_test", expect.any(String), 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. High-severity audit chain writes
// ═════════════════════════════════════════════════════════════════════════════

describe("high-severity audit chain writes", () => {
  it("anonymous_request_rejected writes exactly one audit chain entry", async () => {
    await enforce(makeReq()); // no key → anonymous_request_rejected
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
  });

  it("expired JWT does NOT write to audit chain (low-severity)", async () => {
    const token = makeJwt({}, { ttlSec: -1 });
    mocks.extractKey.mockReturnValue(token);
    await enforce(makeReq());
    expect(mocks.writeAuditChainEntry).not.toHaveBeenCalled();
  });

  it("invalid_issuer JWT does NOT write to audit chain (low-severity)", async () => {
    const token = makeJwt({}, { iss: "other-service" });
    mocks.extractKey.mockReturnValue(token);
    await enforce(makeReq());
    expect(mocks.writeAuditChainEntry).not.toHaveBeenCalled();
  });

  it("quota_exceeded does NOT write to audit chain (low-severity)", async () => {
    mocks.extractKey.mockReturnValue("hks_live_testkey");
    mocks.validateAndConsume.mockResolvedValue({ ok: false, reason: "quota_exceeded" });
    await enforce(makeReq());
    expect(mocks.writeAuditChainEntry).not.toHaveBeenCalled();
  });

  it("bad_signature DOES write to audit chain (high-severity)", async () => {
    const token = makeJwt();
    const parts = token.split(".");
    mocks.extractKey.mockReturnValue(`${parts[0]}.${parts[1]}.TAMPERED`);
    await enforce(makeReq());
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
  });

  it("jwt_key_revoked DOES write to audit chain (high-severity)", async () => {
    const token = makeJwt();
    mocks.extractKey.mockReturnValue(token);
    mocks.getJson.mockResolvedValue(validRecord({ revokedAt: "2026-01-01T00:00:00.000Z" }));
    await enforce(makeReq());
    expect(mocks.writeAuditChainEntry).toHaveBeenCalledOnce();
  });
});
