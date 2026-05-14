// Platform authentication helpers — no external dependencies, uses Node.js crypto.
// Password hashing: scrypt(password, salt, 64) — work factor ~100ms, GPU-resistant
// Session signing:  HMAC-SHA256 over base64url(payload) using SESSION_SECRET env var

import { scryptSync, timingSafeEqual, createHmac, randomBytes } from "node:crypto";

const SESSION_COOKIE = "hs_session";
const SESSION_TTL_S = 8 * 60 * 60; // 8 hours

// ── Password helpers ─────────────────────────────────────────────────────────

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const candidate = scryptSync(password, salt, 64);
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
}

function getSecret(): string {
  const explicit = process.env["SESSION_SECRET"];
  if (explicit) return explicit;

  // AUDIT_CHAIN_SECRET is operator-set and non-public — safe as a fallback
  // anchor. NETLIFY_SITE_ID and SITE_ID were previously accepted here but are
  // discoverable (visible in build logs and Netlify dashboard URLs), so they
  // are no longer permitted as session-key anchors.
  const anchor = process.env["AUDIT_CHAIN_SECRET"];
  if (anchor && anchor.length >= 32) {
    console.warn(
      "[hawkeye] SESSION_SECRET not set — deriving session key from AUDIT_CHAIN_SECRET. " +
      "Set SESSION_SECRET in Netlify env vars for production security.",
    );
    return createHmac("sha256", anchor).update("hawkeye-session-secret-v1").digest("hex");
  }

  throw new Error(
    "SESSION_SECRET must be set in Netlify environment variables. " +
    "Generate a 64-character random hex string: openssl rand -hex 32",
  );
}

export function issueSession(userId: string, username: string, role: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { userId, username, role, iat: now, exp: now + SESSION_TTL_S };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySession(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  // constant-time compare — pad to avoid length-based timing side-channel
  const expBuf = Buffer.from(expected, "utf8");
  const sigRaw = Buffer.from(sig, "utf8");
  const sigBuf = sigRaw.length === expBuf.length
    ? sigRaw
    : Buffer.concat([
        new Uint8Array(sigRaw.buffer, sigRaw.byteOffset, Math.min(sigRaw.length, expBuf.length)),
        new Uint8Array(Math.max(0, expBuf.length - sigRaw.length)),
      ]);
  if (!timingSafeEqual(new Uint8Array(expBuf), new Uint8Array(sigBuf)) || sigRaw.length !== expBuf.length) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE, SESSION_TTL_S };
