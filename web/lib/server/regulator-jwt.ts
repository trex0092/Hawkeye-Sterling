// Hawkeye Sterling — regulator read-only JWT.
//
// UAE FIU / FATF / internal-audit examiners need independent read-only
// access to a tenant's case history, audit trail, screening logs, and
// goAML archive WITHOUT operator involvement. The audit's enhancement
// list flagged this as a competitive moat over legacy AML platforms.
//
// Token shape (Ed25519-signed JWT):
//   {
//     iss: "hawkeye-sterling",
//     sub: "regulator:<examiner-id>",
//     aud: "regulator-read-only",
//     scope: ["tenant:<tenant-id>"] | ["case:<case-id>"]
//     iat, exp,
//     nbf,                          // not-before — optional case-window
//     jti,                          // unique token id (revocation linkage)
//     issuedBy: "<admin-actor>"
//   }
//
// Algorithm: EdDSA / Ed25519 — same key (REPORT_ED25519_PRIVATE_KEY) the
// compliance-report and audit-certificate flows already use. Verifiers
// fetch the public key from /.well-known/hawkeye-pubkey.pem.

import { createHash, createPrivateKey, createPublicKey, randomBytes, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "crypto";

export interface RegulatorTokenClaims {
  iss: "hawkeye-sterling";
  sub: string;
  aud: "regulator-read-only";
  scope: string[];
  iat: number;
  exp: number;
  nbf?: number;
  jti: string;
  issuedBy: string;
}

export interface IssueOptions {
  /** Examiner identifier (email / regulator-issued ID). */
  examinerId: string;
  /** Tenant scope OR case scope. At least one entry required. */
  scope: { tenants?: string[]; cases?: string[] };
  /** Validity window — defaults to 7 days. Max 90 days. */
  ttlDays?: number;
  /** Identifier of the operator who issued the token (audit trail). */
  issuedBy: string;
  /** Optional not-before (ISO date) — for windowed audits. */
  notBefore?: string;
}

const TOKEN_VERSION = "v1";

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function loadPrivateKey(): KeyObject | null {
  const raw = process.env["REPORT_ED25519_PRIVATE_KEY"];
  if (!raw) return null;
  try {
    const pem = raw.includes("-----BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return createPrivateKey(pem);
  } catch {
    return null;
  }
}

function loadPublicKey(): KeyObject | null {
  const raw = process.env["REPORT_ED25519_PUBLIC_KEY"];
  if (raw) {
    try {
      const pem = raw.includes("-----BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
      return createPublicKey(pem);
    } catch { /* fall through */ }
  }
  // Derive public key from private (no separate pubkey env required).
  const priv = loadPrivateKey();
  if (!priv) return null;
  try {
    return createPublicKey(priv);
  } catch {
    return null;
  }
}

/**
 * Issue a regulator read-only JWT. Returns null if no signing key is
 * configured (the admin route surfaces this as a 503 with a hint).
 */
export function issueRegulatorToken(opts: IssueOptions): {
  token: string;
  claims: RegulatorTokenClaims;
  publicKeyUrl: string;
} | null {
  const key = loadPrivateKey();
  if (!key) return null;

  const ttlDays = Math.max(1, Math.min(90, opts.ttlDays ?? 7));
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlDays * 24 * 60 * 60;
  const scope: string[] = [];
  for (const t of opts.scope.tenants ?? []) scope.push(`tenant:${t}`);
  for (const c of opts.scope.cases ?? []) scope.push(`case:${c}`);
  if (scope.length === 0) throw new Error("regulator-jwt: scope must include at least one tenant or case");

  const jti = `reg_${Date.now()}_${randomBytes(6).toString("hex")}`;
  const claims: RegulatorTokenClaims = {
    iss: "hawkeye-sterling",
    sub: `regulator:${opts.examinerId}`,
    aud: "regulator-read-only",
    scope,
    iat: now,
    exp,
    jti,
    issuedBy: opts.issuedBy,
    ...(() => {
      if (!opts.notBefore) return {};
      // Accept only ISO 8601 date strings (YYYY-MM-DD or full datetime).
      // Non-ISO locale formats (e.g. "01/01/2026") silently NaN in Date.parse
      // which would drop the nbf claim without error; reject them explicitly.
      if (!/^\d{4}-\d{2}-\d{2}(T[\d:.Z+\-]+)?$/.test(opts.notBefore)) {
        throw new Error(`regulator-jwt: notBefore must be ISO 8601 (YYYY-MM-DD), got: ${opts.notBefore}`);
      }
      const ms = Date.parse(opts.notBefore);
      if (!Number.isFinite(ms)) return {};
      return { nbf: Math.floor(ms / 1000) };
    })(),
  };

  const header = { alg: "EdDSA", typ: "JWT", kid: TOKEN_VERSION };
  const headerB64 = base64url(JSON.stringify(header));
  const claimsB64 = base64url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${claimsB64}`;
  const inBuf = Buffer.from(signingInput);
  const inView = new Uint8Array(inBuf.buffer, inBuf.byteOffset, inBuf.byteLength);
  const sigBuf = cryptoSign(null, inView, key);
  const sigB64 = base64url(sigBuf);
  const token = `${signingInput}.${sigB64}`;

  const publicKeyUrl =
    (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app").replace(/\/$/, "") +
    "/.well-known/hawkeye-pubkey.pem";

  return { token, claims, publicKeyUrl };
}

export type VerifyRegulatorTokenResult =
  | { ok: true; claims: RegulatorTokenClaims }
  | { ok: false; reason: string };

/**
 * Verify + decode a regulator JWT. Returns `{ ok: true, claims }` on success
 * or `{ ok: false, reason }` if the token is malformed / signature invalid /
 * expired / not-yet-valid / revoked.
 * Caller MUST cross-check that the requested resource is within scope.
 */
export async function verifyRegulatorToken(token: string): Promise<VerifyRegulatorTokenResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed token" };
  const [headerB64, claimsB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string };
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString("utf8")) as { alg?: string };
  } catch { return { ok: false, reason: "malformed header" }; }
  if (header.alg !== "EdDSA") return { ok: false, reason: "unsupported algorithm" };

  let claims: RegulatorTokenClaims;
  try {
    claims = JSON.parse(base64urlDecode(claimsB64).toString("utf8")) as RegulatorTokenClaims;
  } catch {
    return { ok: false, reason: "malformed claims" };
  }
  if (claims.iss !== "hawkeye-sterling") return { ok: false, reason: "invalid issuer" };
  if (claims.aud !== "regulator-read-only") return { ok: false, reason: "invalid audience" };
  const now = Math.floor(Date.now() / 1000);
  // RFC 7519 §4.1.4: token is valid only if exp is *strictly after* the current
  // time. Using `<= now` ensures a token with exp == now is treated as expired
  // (the prior `< now` would have accepted it for the remainder of that second).
  if (typeof claims.exp !== "number" || claims.exp <= now) return { ok: false, reason: "token expired" };
  if (typeof claims.nbf === "number" && claims.nbf > now) return { ok: false, reason: "token not yet valid" };

  const pub = loadPublicKey();
  if (!pub) return { ok: false, reason: "no public key configured" };
  try {
    const inBuf = Buffer.from(`${headerB64}.${claimsB64}`);
    const inView = new Uint8Array(inBuf.buffer, inBuf.byteOffset, inBuf.byteLength);
    const sigBuf = base64urlDecode(sigB64);
    const sigView = new Uint8Array(sigBuf.buffer, sigBuf.byteOffset, sigBuf.byteLength);
    const valid = cryptoVerify(null, inView, pub, sigView);
    if (!valid) return { ok: false, reason: "invalid signature" };
  } catch {
    return { ok: false, reason: "signature verification error" };
  }

  // After signature verification, check revocation list before returning claims.
  const jti = claims.jti as string | undefined;
  if (jti) {
    try {
      const { getStore } = await import("@netlify/blobs") as unknown as { getStore: (..._args: unknown[]) => { get: (_key: string) => Promise<string | null> } };
      const store = getStore({ name: "hawkeye-revoked-tokens" });
      const revoked = await store.get(jti);
      if (revoked) {
        return { ok: false, reason: "token has been revoked" };
      }
    } catch {
      // Revocation store unavailable — log and allow (fail-open is acceptable
      // since Ed25519 signature is still the primary control)
      console.warn("[regulator-jwt] revocation store unavailable");
    }
  }

  return { ok: true, claims };
}

/**
 * Revoke a regulator token by its jti claim. Writes a marker to the
 * Netlify Blobs revocation store; subsequent calls to verifyRegulatorToken
 * with the same jti will return { ok: false, reason: "token has been revoked" }.
 */
export async function revokeRegulatorToken(jti: string): Promise<void> {
  const { getStore } = await import("@netlify/blobs") as unknown as { getStore: (..._args: unknown[]) => { set: (_key: string, _value: string) => Promise<void> } };
  const store = getStore({ name: "hawkeye-revoked-tokens" });
  await store.set(jti, JSON.stringify({ revokedAt: new Date().toISOString() }));
}

/**
 * Returns true if the token's scope covers the requested tenant or case.
 * Caller passes whichever it has (route-handler decides which fits).
 */
export function tokenCoversScope(
  claims: RegulatorTokenClaims,
  ask: { tenantId?: string; caseId?: string },
): boolean {
  if (ask.tenantId && claims.scope.includes(`tenant:${ask.tenantId}`)) return true;
  if (ask.caseId && claims.scope.includes(`case:${ask.caseId}`)) return true;
  return false;
}

/** Stable fingerprint over a token — used for revocation log keys. */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}
