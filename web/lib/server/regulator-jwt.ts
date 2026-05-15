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

import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "crypto";
import type { KeyObject } from "crypto";

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

  const jti = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const claims: RegulatorTokenClaims = {
    iss: "hawkeye-sterling",
    sub: `regulator:${opts.examinerId}`,
    aud: "regulator-read-only",
    scope,
    iat: now,
    exp,
    jti,
    issuedBy: opts.issuedBy,
    ...(opts.notBefore ? { nbf: Math.floor(Date.parse(opts.notBefore) / 1000) } : {}),
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

/**
 * Verify + decode a regulator JWT. Returns the claims on success or null
 * if the token is malformed / signature invalid / expired / not-yet-valid.
 * Caller MUST cross-check that the requested resource is within scope.
 */
export function verifyRegulatorToken(token: string): RegulatorTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, claimsB64, sigB64] = parts as [string, string, string];

  let claims: RegulatorTokenClaims;
  try {
    claims = JSON.parse(base64urlDecode(claimsB64).toString("utf8")) as RegulatorTokenClaims;
  } catch {
    return null;
  }
  if (claims.iss !== "hawkeye-sterling") return null;
  if (claims.aud !== "regulator-read-only") return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  if (typeof claims.nbf === "number" && claims.nbf > now) return null;

  const pub = loadPublicKey();
  if (!pub) return null;
  try {
    const inBuf = Buffer.from(`${headerB64}.${claimsB64}`);
    const inView = new Uint8Array(inBuf.buffer, inBuf.byteOffset, inBuf.byteLength);
    const sigBuf = base64urlDecode(sigB64);
    const sigView = new Uint8Array(sigBuf.buffer, sigBuf.byteOffset, sigBuf.byteLength);
    const valid = cryptoVerify(null, inView, pub, sigView);
    if (!valid) return null;
  } catch {
    return null;
  }
  return claims;
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
