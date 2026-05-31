// Platform authentication helpers — no external dependencies, uses Node.js crypto.
// scrypt options: N=65536 (2^16), r=8, p=1 — ~200ms on modern hardware, GPU-resistant.
// Session signing:  HMAC-SHA256 over base64url(payload) using SESSION_SECRET env var

import { scryptSync, timingSafeEqual, createHmac, randomBytes } from "node:crypto";

const SESSION_COOKIE = "hs_session";
const SESSION_TTL_S = 8 * 60 * 60; // 8 hours

// ── Password helpers ─────────────────────────────────────────────────────────

// maxmem: Node.js's default (32 MB) is below the ~64 MB needed for N=65536, r=8.
// Setting 128 MB is explicit and prevents ERR_CRYPTO_INVALID_SCRYPT_PARAMS on
// environments where the default maxmem limit is hit (tests, constrained hosts).
const SCRYPT_OPTS = { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 } as const;

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64, SCRYPT_OPTS).toString("hex");
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const candidate = scryptSync(password, salt, 64, SCRYPT_OPTS);
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(new Uint8Array(candidate), new Uint8Array(stored));
}

// ── Session token helpers ────────────────────────────────────────────────────

interface SessionPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
  /** Password version at issue time — used to detect stale sessions after a
   *  password reset. Absent on sessions issued before this field was added;
   *  treat as 0 for backward compat. */
  pwv?: number;
  /** 16-char SHA-256 prefix of login IP + User-Agent — used to detect
   *  mid-session IP changes that may indicate session token theft. */
  fpHash?: string;
  /** Tenant identifier for multi-tenant deployments. Absent on sessions
   *  issued before this field was added; treat as "default" for single-tenant
   *  compatibility. Enables audit-chain and blob-key isolation per tenant
   *  without an extra API-key record lookup on each request. */
  tenantId?: string;
}

function getSecret(): string {
  const explicit = process.env["SESSION_SECRET"];
  if (explicit) {
    // Enforce a minimum of 32 bytes so the HMAC-SHA256 key has adequate
    // entropy. A shorter secret is trivially brute-forced offline.
    if (explicit.length < 32) {
      throw new Error(
        `SESSION_SECRET is only ${explicit.length} characters — minimum is 32. ` +
        "Generate a 64-character random hex string: openssl rand -hex 32",
      );
    }
    return explicit;
  }

  throw new Error(
    "SESSION_SECRET must be set in Netlify environment variables. " +
    "Generate a 64-character random hex string: openssl rand -hex 32",
  );
}

export function issueSession(
  userId: string,
  username: string,
  role: string,
  pwVersion = 0,
  fpHash = "",
  tenantId?: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    userId, username, role, iat: now, exp: now + SESSION_TTL_S, pwv: pwVersion,
    ...(fpHash ? { fpHash } : {}),
    ...(tenantId && tenantId !== "default" ? { tenantId } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

/** Compute a 32-char (128-bit) fingerprint from client IP and User-Agent.
 *  Embeds in the session token at login; compared on each /api/auth/me
 *  call to detect possible session token theft via IP change. */
export function computeRequestFingerprint(ip: string, userAgent: string): string {
  return createHmac("sha256", getSecret())
    .update(`${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

const SESSION_COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");

export function verifySession(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  // Normalise both values to fixed-length HMAC digests before constant-time
  // comparison — eliminates the padded-buffer length oracle entirely.
  const ha = createHmac("sha256", SESSION_COMPARE_KEY).update(expected).digest();
  const hb = createHmac("sha256", SESSION_COMPARE_KEY).update(sig).digest();
  if (!timingSafeEqual(ha, hb)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    // RFC 7519 §4.1.4: token is valid only if exp is strictly after now.
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Extract tenantId from a verified session payload; returns "default" when absent. */
export function tenantIdFromSession(payload: ReturnType<typeof verifySession>): string {
  return (payload as SessionPayload | null)?.tenantId ?? "default";
}

export { SESSION_COOKIE, SESSION_TTL_S };
