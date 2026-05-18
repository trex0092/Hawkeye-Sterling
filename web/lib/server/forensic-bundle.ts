// Hawkeye-Sterling - forensic case-bundle builder.
//
// Produces a deterministic, chain-of-custody-signed JSON bundle for a
// single screening subject. The bundle is the artefact an external
// auditor (FIU / regulator / FATF reviewer) downloads to inspect a
// case end-to-end without needing live API access.
//
// Contents (every blob keyed on the subjectId):
//   - profile/<subjectId>             - the rolling profile dossier
//   - ongoing/last/<subjectId>        - latest screening snapshot
//   - ongoing/adverse-seen/<subjectId> - adverse-media URLs ever
//                                        observed for this subject
//   - audit chain entries filtered to target === subjectId
//   - four-eyes items filtered to subjectId === subjectId
//
// Chain-of-custody: every bundle carries
//   - generatedAt          ISO timestamp
//   - generatedBy          the auth principal that requested it
//   - bundleSha256         sha256 hex of the canonical serialisation
//                           of `payload` (sorted keys, no whitespace)
//   - bundleHmac           optional HMAC-SHA256(bundleSha256,
//                           AUDIT_CHAIN_SECRET) so the recipient can
//                           verify provenance without contacting
//                           Hawkeye-Sterling.
//
// The auditor verifies by:
//   1. Stripping `bundleSha256` + `bundleHmac` from the JSON.
//   2. Re-canonicalising the remaining `payload`.
//   3. Confirming sha256 matches `bundleSha256`.
//   4. (Optional) Confirming HMAC(bundleSha256, secret) matches.

import { createHash, createHmac } from 'node:crypto';

export interface ForensicBundlePayload {
  subjectId: string;
  profile: unknown;
  latestSnapshot: unknown;
  adverseMediaSeen: unknown;
  auditEntries: unknown[];
  fourEyesItems: unknown[];
}

export interface ForensicBundle {
  generatedAt: string;
  generatedBy: string;
  subjectId: string;
  payload: ForensicBundlePayload;
  bundleSha256: string;
  bundleHmac?: string;
}

/**
 * Deterministic JSON serialisation: keys are sorted at every level,
 * no whitespace. Two byte-identical payloads produce the same string,
 * which means the same SHA-256. Required for chain-of-custody.
 */
export function canonicalSerialise(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256Hex(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

/**
 * Build a forensic bundle from already-loaded payload data. The
 * caller is responsible for reading the Blobs / audit chain - this
 * helper produces the deterministic chain-of-custody envelope.
 *
 * When AUDIT_CHAIN_SECRET is provided as `signingSecret`, the bundle
 * carries an HMAC over `bundleSha256` so a recipient can verify
 * provenance offline. Without a secret the bundle is still
 * tamper-evident (sha256) but not provenance-attested.
 */
export function buildForensicBundle(
  subjectId: string,
  payload: ForensicBundlePayload,
  generatedBy: string,
  signingSecret: string | undefined,
  now: Date = new Date(),
): ForensicBundle {
  const canonical = canonicalSerialise(payload);
  const bundleSha256 = sha256Hex(canonical);
  const bundle: ForensicBundle = {
    generatedAt: now.toISOString(),
    generatedBy,
    subjectId,
    payload,
    bundleSha256,
  };
  if (signingSecret && signingSecret.length > 0) {
    bundle.bundleHmac = hmacSha256Hex(bundleSha256, signingSecret);
  }
  return bundle;
}

/**
 * Verifier - returns { ok, faults } given a bundle and optional secret.
 * Recipients can call this to confirm tamper-evidence + provenance.
 */
export function verifyForensicBundle(
  bundle: ForensicBundle,
  signingSecret?: string,
): { ok: boolean; faults: string[] } {
  const faults: string[] = [];
  const recomputedSha = sha256Hex(canonicalSerialise(bundle.payload));
  if (recomputedSha !== bundle.bundleSha256) {
    faults.push(`bundleSha256 mismatch: expected ${recomputedSha}, got ${bundle.bundleSha256}`);
  }
  if (signingSecret && bundle.bundleHmac) {
    const recomputedHmac = hmacSha256Hex(bundle.bundleSha256, signingSecret);
    if (recomputedHmac !== bundle.bundleHmac) {
      faults.push(`bundleHmac mismatch (wrong secret or tampered)`);
    }
  } else if (signingSecret && !bundle.bundleHmac) {
    faults.push('bundleHmac missing — bundle was not signed at generation');
  }
  return { ok: faults.length === 0, faults };
}
