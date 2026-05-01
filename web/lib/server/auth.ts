// Platform authentication helpers — no external dependencies, uses Node.js crypto.
// Password hashing: SHA-256(salt + ":" + password)
// Session signing:  HMAC-SHA256 over base64url(payload) using SESSION_SECRET env var

import { createHash, createHmac, randomBytes } from "node:crypto";

const SESSION_COOKIE = "hs_session";
const SESSION_TTL_S = 8 * 60 * 60; // 8 hours

// ── Password helpers ─────────────────────────────────────────────────────────

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const candidate = hashPassword(password, salt);
  // constant-time comparison to prevent timing attacks
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
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
  return process.env["SESSION_SECRET"] ?? "hawkeye-sterling-dev-secret-change-in-prod";
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
  // constant-time compare
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE, SESSION_TTL_S };
