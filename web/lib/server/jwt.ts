// Hawkeye Sterling — minimal HS256 JWT signer/verifier.
//
// Why hand-rolled instead of `jsonwebtoken`? Netlify Functions cold-starts
// charge for every dep loaded; HS256 is a HMAC-SHA-256 over base64url
// JSON — small enough that a 60-line implementation removes a 150 KB
// transitive dependency from the bundle. No RSA, no JWKS, no asymmetric
// keys: pair a single shared secret with the API-key store so an API key
// is exchanged for a short-lived (10 min default) bearer JWT.
//
// Threat model:
//   - JWT_SIGNING_SECRET is a server-side env (≥ 32 bytes, never logged).
//   - Tokens carry { sub: keyId, tier, iat, exp }; verifier checks exp,
//     signature, and alg-pinning to "HS256" (no `alg: none` confusion).
//   - We do NOT support refresh tokens — revocation is via API-key
//     revocation; existing JWTs expire within JWT_TTL_SEC.

import { createHmac, timingSafeEqual } from "node:crypto";

const ALG = "HS256" as const;
const DEFAULT_TTL_SEC = 600;

export interface JwtPayload {
  sub: string;       // API key id
  tier: string;      // tier id at issuance time
  iat: number;       // issued-at, unix seconds
  exp: number;       // expiry, unix seconds
  iss?: string;      // issuer
}

interface JwtHeader {
  alg: typeof ALG;
  typ: "JWT";
}

function getSecret(): Buffer {
  const raw = process.env["JWT_SIGNING_SECRET"];
  if (!raw || raw.length < 32) {
    throw new Error("JWT_SIGNING_SECRET unset or shorter than 32 bytes");
  }
  return Buffer.from(raw, "utf8");
}

function b64uEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function b64uDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function sign(headerB64: string, payloadB64: string, secret: Buffer): string {
  return createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
}

export function issueJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  opts: { ttlSec?: number; iss?: string } = {},
): { token: string; expSec: number } {
  const secret = getSecret();
  const ttl = opts.ttlSec ?? DEFAULT_TTL_SEC;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttl;
  const full: JwtPayload = {
    ...payload,
    iat: now,
    exp,
    ...(opts.iss ? { iss: opts.iss } : {}),
  };
  const header: JwtHeader = { alg: ALG, typ: "JWT" };
  const headerB64 = b64uEncode(JSON.stringify(header));
  const payloadB64 = b64uEncode(JSON.stringify(full));
  const sig = sign(headerB64, payloadB64, secret);
  return { token: `${headerB64}.${payloadB64}.${sig}`, expSec: exp };
}

export interface JwtVerifyResult {
  ok: boolean;
  reason?: "malformed" | "bad_signature" | "expired" | "alg_mismatch" | "no_secret";
  payload?: JwtPayload;
}

export function verifyJwt(token: string): JwtVerifyResult {
  let secret: Buffer;
  try { secret = getSecret(); } catch { return { ok: false, reason: "no_secret" }; }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, payloadB64, sig] = parts as [string, string, string];

  let header: JwtHeader;
  try { header = JSON.parse(b64uDecode(headerB64).toString("utf8")) as JwtHeader; }
  catch { return { ok: false, reason: "malformed" }; }
  // Pin alg server-side — refuse `none` and any non-HS256 forgery.
  if (header.alg !== ALG) return { ok: false, reason: "alg_mismatch" };

  const expected = sign(headerB64, payloadB64, secret);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: JwtPayload;
  try { payload = JSON.parse(b64uDecode(payloadB64).toString("utf8")) as JwtPayload; }
  catch { return { ok: false, reason: "malformed" }; }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    return { ok: false, reason: "expired", payload };
  }

  return { ok: true, payload };
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m && m[1] ? m[1].trim() : null;
}

/** Heuristic: API keys start with `hks_live_`; JWTs are three dot-segments. */
export function looksLikeJwt(token: string): boolean {
  if (token.startsWith("hks_live_")) return false;
  return token.split(".").length === 3;
}
