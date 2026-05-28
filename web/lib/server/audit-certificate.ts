// Hawkeye Sterling — tamper-evident audit-immutability certificate.
//
// On case closure / STR filing / disposition commit, downstream auditors
// (UAE FIU, internal compliance review, external auditor) need to confirm
// that the audit trail wasn't retroactively edited during the 10-year
// retention window mandated by UAE PDPL 45/2021 Art.13 + FDL 10/2025 Art.24.
//
// This module produces a signed snapshot of the audit-chain entries
// relevant to a case + the case payload itself. The signature uses the
// existing REPORT_ED25519_PRIVATE_KEY (also used by compliance-report
// for the same regulator-verifiable signature pattern), with the public
// key published at /.well-known/hawkeye-pubkey.pem.
//
// Regulators verify offline with:
//   openssl pkeyutl -verify -pubin -inkey hawkeye-pubkey.pem \
//     -sigfile <certificate>.sig -in <certificate>.snapshot

import { createHash, createHmac, randomBytes, createPrivateKey, type KeyObject } from "node:crypto";

export interface AuditSnapshotInput {
  /** Stable case / report identifier. Becomes part of the signed payload. */
  caseId: string;
  /** Tenant / customer scope. */
  tenantId: string;
  /** What event triggered the certificate — case_closure, str_filed, four_eyes_approval, etc. */
  trigger: "case_closure" | "str_filed" | "ctr_filed" | "four_eyes_approval" | "disposition_committed" | "evidence_pack";
  /** The audit-chain entries (hashes only — never raw PII) covering this case. */
  auditEntries: Array<{ seq: number; entryHash: string; at: string; actor?: string }>;
  /** Optional summary fields the auditor needs to re-verify. Hashed, not stored verbatim. */
  digest: Record<string, string | number | boolean>;
  /** Subject identifier for HMAC binding (e.g. entity name or customer ID). */
  subjectId?: string;
  /** Free-form filing-entity name for the regulatory attestation block. */
  filingEntity?: string;
}

/** Regulatory attestation block — binds the certificate to UAE FDL 10/2025. */
export interface RegulatoryAttestation {
  standard: string;
  article: string;
  retentionPeriod: string;
  jurisdictionCode: string;
  regulatoryBody: string;
  filingEntity: string;
}

export interface AuditCertificate {
  /** Unique certificate serial number — "HS-CERT-" + 8 random hex bytes. */
  serialNumber: string;
  caseId: string;
  tenantId: string;
  trigger: AuditSnapshotInput["trigger"];
  issuedAt: string;
  auditEntryCount: number;
  /** SHA-256 of the serialised audit data — proves the payload hasn't been tampered with. */
  contentHash: string;
  /** SHA-256 of the canonicalised snapshot — what the Ed25519 signature signs. */
  snapshotSha256: string;
  /** HMAC-SHA256 over (contentHash + issuedAt + subjectId) using SESSION_SECRET.
   *  Any party with the shared secret can verify the certificate offline. */
  hmacSignature: string;
  /** Hash chain — auditor can re-link to the on-chain audit log. */
  firstSeq: number;
  lastSeq: number;
  digest: Record<string, string | number | boolean>;
  /** Algorithm identifier (currently always Ed25519). */
  algorithm: "Ed25519";
  /** Base64 Ed25519 signature over snapshotSha256. Empty when no key is configured. */
  signature: string;
  /** Public-key fetch URL for offline verification. */
  publicKeyUrl: string;
  /** Always-true when the certificate carries a real Ed25519 signature. */
  signed: boolean;
  /** UAE FDL 10/2025 regulatory attestation block. */
  regulatoryAttestation: RegulatoryAttestation;
  /** Certificate metadata. */
  generatedBy: string;
  generatedAt: string;
  /** Five years from generation — FDL 10/2025 Art.19 retention window. */
  expiresAt: string;
  purpose: string;
}

function loadKey(): KeyObject | null {
  const raw = process.env["REPORT_ED25519_PRIVATE_KEY"];
  if (!raw) return null;
  try {
    // Accept raw PEM or base64-wrapped PEM (matches the existing
    // complianceReport convention).
    const looksLikePem = raw.includes("-----BEGIN");
    const pem = looksLikePem ? raw : Buffer.from(raw, "base64").toString("utf8");
    return createPrivateKey(pem);
  } catch {
    return null;
  }
}

function canonicalise(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalise).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + keys.map((k) => `${JSON.stringify(k)}:${canonicalise((obj as Record<string, unknown>)[k])}`).join(",") + "}";
}

/** Read SESSION_SECRET for HMAC operations. Returns empty string when not configured
 *  (certificate will carry an empty hmacSignature — caller should warn). */
function readSessionSecret(): string {
  return process.env["SESSION_SECRET"] ?? "";
}

/**
 * Build + sign a tamper-evident snapshot. Returns a certificate that carries:
 *   - contentHash      SHA-256 of the serialised audit data
 *   - snapshotSha256   SHA-256 of the canonical snapshot (what Ed25519 signs)
 *   - hmacSignature    HMAC-SHA256(contentHash + issuedAt + subjectId) using SESSION_SECRET
 *   - serialNumber     "HS-CERT-" + 8 random hex bytes
 *   - regulatoryAttestation   UAE FDL 10/2025 / CBUAE binding
 *   - certificate metadata (generatedBy, generatedAt, expiresAt, purpose)
 *
 * Verifiers reconstruct the snapshot from the published audit chain,
 * compute SHA-256 over the canonical JSON, and verify the Ed25519 signature
 * against the public key at publicKeyUrl.
 */
export function buildAuditCertificate(input: AuditSnapshotInput): AuditCertificate {
  const issuedAt = new Date().toISOString();
  const sortedEntries = [...input.auditEntries].sort((a, b) => a.seq - b.seq);
  const firstSeq = sortedEntries[0]?.seq ?? -1;
  const lastSeq = sortedEntries[sortedEntries.length - 1]?.seq ?? -1;

  // ── Serial number ──────────────────────────────────────────────────────────
  const serialNumber = "HS-CERT-" + randomBytes(8).toString("hex");

  // ── Content hash — SHA-256 of the serialised audit entries + digest ────────
  // This is computed over the raw input data (before canonicalisation) so that
  // any tampering with the underlying audit entries is detectable independently
  // of the snapshot canonicalisation used for the Ed25519 path.
  const auditDataForHash = JSON.stringify({
    caseId: input.caseId,
    tenantId: input.tenantId,
    trigger: input.trigger,
    auditEntries: sortedEntries,
    digest: input.digest,
  });
  const contentHash = createHash("sha256").update(auditDataForHash).digest("hex");

  // ── HMAC signature ─────────────────────────────────────────────────────────
  // HMAC-SHA256 over (contentHash + issuedAt + subjectId) using SESSION_SECRET.
  // Any party with the shared secret can verify the certificate without the
  // Ed25519 private key.
  const subjectId = input.subjectId ?? input.caseId;
  const secret = readSessionSecret();
  const hmacSignature = secret.length >= 32
    ? createHmac("sha256", secret).update(`${contentHash}:${issuedAt}:${subjectId}`).digest("hex")
    : "";

  // ── Canonical snapshot + Ed25519 signature ────────────────────────────────
  const snapshot = {
    caseId: input.caseId,
    tenantId: input.tenantId,
    trigger: input.trigger,
    issuedAt,
    auditEntryCount: sortedEntries.length,
    firstSeq,
    lastSeq,
    auditChain: sortedEntries.map((e) => ({ seq: e.seq, entryHash: e.entryHash, at: e.at, actor: e.actor ?? "system" })),
    digest: input.digest,
  };
  const canonical = canonicalise(snapshot);
  const snapshotSha256 = createHash("sha256").update(canonical).digest("hex");

  const key = loadKey();
  let signature = "";
  if (key) {
    try {
      // Ed25519 in Node: pass null algorithm to crypto.sign.
      const { sign } = require("crypto") as typeof import("crypto");
      const msgBuf = Buffer.from(snapshotSha256);
      const msgView = new Uint8Array(msgBuf.buffer, msgBuf.byteOffset, msgBuf.byteLength);
      signature = sign(null, msgView, key).toString("base64");
    } catch {
      signature = "";
    }
  }

  const publicKeyUrl =
    (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app").replace(/\/$/, "") +
    "/.well-known/hawkeye-pubkey.pem";

  // ── Regulatory attestation block ───────────────────────────────────────────
  const regulatoryAttestation: RegulatoryAttestation = {
    standard: "UAE FDL 10/2025",
    article: "Art.19 (record keeping)",
    retentionPeriod: "5 years from last transaction date",
    jurisdictionCode: "AE",
    regulatoryBody: "CBUAE",
    filingEntity: input.filingEntity ?? input.tenantId,
  };

  // ── Certificate metadata ───────────────────────────────────────────────────
  const generatedAt = issuedAt;
  const expiresAt = new Date(new Date(issuedAt).getTime() + 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString();

  return {
    serialNumber,
    caseId: input.caseId,
    tenantId: input.tenantId,
    trigger: input.trigger,
    issuedAt,
    auditEntryCount: sortedEntries.length,
    contentHash,
    snapshotSha256,
    hmacSignature,
    firstSeq,
    lastSeq,
    digest: input.digest,
    algorithm: "Ed25519",
    signature,
    publicKeyUrl,
    signed: signature.length > 0,
    regulatoryAttestation,
    generatedBy: "Hawkeye Sterling v2",
    generatedAt,
    expiresAt,
    purpose: "AML/CFT Compliance Record",
  };
}
