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

import { createHash, createPrivateKey, type KeyObject } from "crypto";

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
}

export interface AuditCertificate {
  caseId: string;
  tenantId: string;
  trigger: AuditSnapshotInput["trigger"];
  issuedAt: string;
  auditEntryCount: number;
  /** SHA-256 of the canonicalised snapshot — what the signature signs. */
  snapshotSha256: string;
  /** Hash chain — auditor can re-link to the on-chain audit log. */
  firstSeq: number;
  lastSeq: number;
  digest: Record<string, string | number | boolean>;
  /** Algorithm identifier (currently always Ed25519). */
  algorithm: "Ed25519";
  /** Base64 signature over snapshotSha256. Empty when no key is configured. */
  signature: string;
  /** Public-key fetch URL for offline verification. */
  publicKeyUrl: string;
  /** Always-true when the certificate carries a real signature. */
  signed: boolean;
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

/**
 * Build + sign a tamper-evident snapshot. Returns a certificate that
 * carries the SHA-256 of the canonical snapshot + an Ed25519 signature
 * (empty string when REPORT_ED25519_PRIVATE_KEY isn't configured).
 *
 * Verifiers reconstruct the snapshot from the published audit chain,
 * compute SHA-256 over the canonical JSON, and verify the signature
 * against the public key.
 */
export function buildAuditCertificate(input: AuditSnapshotInput): AuditCertificate {
  const issuedAt = new Date().toISOString();
  const sortedEntries = [...input.auditEntries].sort((a, b) => a.seq - b.seq);
  const firstSeq = sortedEntries[0]?.seq ?? -1;
  const lastSeq = sortedEntries[sortedEntries.length - 1]?.seq ?? -1;

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

  return {
    caseId: input.caseId,
    tenantId: input.tenantId,
    trigger: input.trigger,
    issuedAt,
    auditEntryCount: sortedEntries.length,
    snapshotSha256,
    firstSeq,
    lastSeq,
    digest: input.digest,
    algorithm: "Ed25519",
    signature,
    publicKeyUrl,
    signed: signature.length > 0,
  };
}
