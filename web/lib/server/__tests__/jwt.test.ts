// Unit tests for the JWT signer/verifier (web/lib/server/jwt.ts).
//
// Covers: alg-pinning, expiry, bad signature, dual-key rotation,
// issuer validation (defense-in-depth against cross-service JWT confusion).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SECRET = "a".repeat(32);
const PREV_SECRET = "b".repeat(32);

beforeEach(() => {
  vi.stubEnv("JWT_SIGNING_SECRET", SECRET);
  vi.stubEnv("JWT_SIGNING_SECRET_PREV", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function getJwt() {
  const { issueJwt, verifyJwt } = await import("../jwt");
  return { issueJwt, verifyJwt };
}

describe("issueJwt / verifyJwt", () => {
  it("round-trips a valid token", async () => {
    const { issueJwt, verifyJwt } = await getJwt();
    const { token } = issueJwt({ sub: "key_001", tier: "standard" }, { iss: "hawkeye-sterling" });
    const result = verifyJwt(token);
    expect(result.ok).toBe(true);
    expect(result.payload?.sub).toBe("key_001");
  });

  it("rejects an expired token", async () => {
    const { issueJwt, verifyJwt } = await getJwt();
    const { token } = issueJwt({ sub: "key_001", tier: "standard" }, { iss: "hawkeye-sterling", ttlSec: -1 });
    const result = verifyJwt(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("rejects a tampered signature", async () => {
    const { issueJwt, verifyJwt } = await getJwt();
    const { token } = issueJwt({ sub: "key_001", tier: "standard" }, { iss: "hawkeye-sterling" });
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.aaaa`;
    const result = verifyJwt(tampered);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad_signature");
  });

  it("rejects alg:none forgery", async () => {
    const { verifyJwt } = await getJwt();
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "evil", tier: "admin", iat: 0, exp: 9999999999 })).toString("base64url");
    const result = verifyJwt(`${header}.${payload}.`);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("alg_mismatch");
  });

  it("rejects malformed token (missing segments)", async () => {
    const { verifyJwt } = await getJwt();
    expect(verifyJwt("not.a.jwt.with.too.many.dots").ok).toBe(false);
    expect(verifyJwt("only.two").ok).toBe(false);
  });

  it("accepts token verified by JWT_SIGNING_SECRET_PREV during rotation", async () => {
    vi.stubEnv("JWT_SIGNING_SECRET", PREV_SECRET);
    const { issueJwt } = await getJwt();
    const { token } = issueJwt({ sub: "key_001", tier: "standard" }, { iss: "hawkeye-sterling" });

    vi.resetModules();
    vi.stubEnv("JWT_SIGNING_SECRET", SECRET);
    vi.stubEnv("JWT_SIGNING_SECRET_PREV", PREV_SECRET);
    const { verifyJwt: verifyWithNew } = await import("../jwt");
    const result = verifyWithNew(token);
    expect(result.ok).toBe(true);
    expect(result.usedPrevKey).toBe(true);
  });

  it("rejects token with a wrong issuer", async () => {
    const { issueJwt, verifyJwt } = await getJwt();
    // Manually craft a token with iss: "other-service"
    const { token } = issueJwt({ sub: "key_001", tier: "standard" }, { iss: "other-service" });
    const result = verifyJwt(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_issuer");
  });

  it("accepts token with correct issuer hawkeye-sterling", async () => {
    const { issueJwt, verifyJwt } = await getJwt();
    const { token } = issueJwt({ sub: "key_001", tier: "standard" }, { iss: "hawkeye-sterling" });
    const result = verifyJwt(token);
    expect(result.ok).toBe(true);
  });

  it("rejects token with wrong iss field (required after F-06 fix)", async () => {
    const { issueJwt, verifyJwt } = await getJwt();
    const { token } = issueJwt({ sub: "key_001", tier: "standard" }, { iss: "wrong-service" });
    const result = verifyJwt(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_issuer");
  });

  it("returns no_secret when JWT_SIGNING_SECRET is absent", async () => {
    vi.stubEnv("JWT_SIGNING_SECRET", "");
    vi.resetModules();
    const { verifyJwt } = await import("../jwt");
    expect(verifyJwt("a.b.c").reason).toBe("no_secret");
  });
});
