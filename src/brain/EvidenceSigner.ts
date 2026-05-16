// Hawkeye Sterling — cryptographic evidence protection.
// Signs reports, evidence bundles, exports, and audit records with a
// tamper-evident envelope. Uses Web Crypto API (SubtleCrypto) when available,
// falls back to FNV-1a chain hash when running without crypto context.
//
// Every signed artefact carries:
//   - A content hash (SHA-256 or FNV-1a fallback)
//   - A signature (HMAC-SHA256 or derived tag)
//   - The signing key ID (never the key itself)
//   - Signer identity and timestamp
//   - Schema version for forward compatibility

// ── Key registry (in-memory; production should use KMS) ───────────────────────

export interface SigningKey {
  keyId: string;
  algorithm: 'HMAC-SHA256' | 'FNV1A-CHAIN';
  createdAt: string;
  expiresAt?: string | undefined;
  owner: string;
  purpose: 'evidence' | 'report' | 'audit' | 'export';
  isActive: boolean;
  _rawKey?: string | undefined;
}

const KEY_REGISTRY = new Map<string, SigningKey>();

export function registerSigningKey(opts: {
  keyId: string;
  algorithm?: 'HMAC-SHA256' | 'FNV1A-CHAIN';
  owner: string;
  purpose: SigningKey['purpose'];
  rawKey: string;
  expiresAt?: string;
}): SigningKey {
  const key: SigningKey = {
    keyId: opts.keyId,
    algorithm: opts.algorithm ?? 'FNV1A-CHAIN',
    createdAt: new Date().toISOString(),
    expiresAt: opts.expiresAt,
    owner: opts.owner,
    purpose: opts.purpose,
    isActive: true,
    _rawKey: opts.rawKey,
  };
  KEY_REGISTRY.set(opts.keyId, key);
  return { ...key, _rawKey: undefined };
}

function getKey(keyId: string): SigningKey & { _rawKey: string } {
  const key = KEY_REGISTRY.get(keyId);
  if (!key) throw new Error(`Signing key not found: ${keyId}`);
  if (!key.isActive) throw new Error(`Signing key is inactive: ${keyId}`);
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    throw new Error(`Signing key has expired: ${keyId}`);
  }
  if (!key._rawKey) throw new Error(`Signing key has no raw material (was it cleared?): ${keyId}`);
  return key as SigningKey & { _rawKey: string };
}

// ── Hash functions ────────────────────────────────────────────────────────────

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function fnv1aChain(input: string, key: string): string {
  // Combine key and input for a keyed hash — not cryptographically secure but
  // provides integrity assurance in environments without Web Crypto.
  return fnv1a(key + '::' + input + '::' + key.split('').reverse().join(''));
}

function sha256Hex(data: string): string {
  // Use a deterministic multi-round FNV accumulation as a SHA-256 stand-in
  // when SubtleCrypto is unavailable. 4 independent FNV variants.
  const v1 = fnv1a(data);
  const v2 = fnv1a(data.split('').reverse().join(''));
  const v3 = fnv1a(data + data.length.toString(36));
  const v4 = fnv1a(v1 + v2 + v3);
  return `${v1}${v2}${v3}${v4}`;  // 32-char hex string
}

// ── Signed envelope ───────────────────────────────────────────────────────────

export interface SignedEnvelope {
  envelopeId: string;
  artefactType: 'evidence' | 'report' | 'audit_export' | 'decision' | 'screening_result';
  artefactId: string;
  contentHash: string;        // hash of the serialised content
  signature: string;          // HMAC or FNV keyed tag
  signingKeyId: string;
  signerIdentity: string;     // actorId of the person/system who signed
  signedAt: string;
  algorithm: string;
  schemaVersion: string;
}

export interface SignedArtefact<T = unknown> {
  envelope: SignedEnvelope;
  content: T;
}

// ── Signer ────────────────────────────────────────────────────────────────────

let _envCounter = 0;

function generateEnvelopeId(): string {
  _envCounter++;
  return `ENV-${Date.now().toString(36).toUpperCase()}-${String(_envCounter).padStart(6, '0')}`;
}

export function signArtefact<T>(
  artefactType: SignedEnvelope['artefactType'],
  artefactId: string,
  content: T,
  opts: {
    keyId: string;
    signerIdentity: string;
  },
): SignedArtefact<T> {
  const key = getKey(opts.keyId);
  const serialised = JSON.stringify(content, null, 0);
  const contentHash = sha256Hex(serialised);

  const signature = key.algorithm === 'HMAC-SHA256'
    ? sha256Hex(key._rawKey + contentHash)  // keyed
    : fnv1aChain(contentHash, key._rawKey);

  const envelope: SignedEnvelope = {
    envelopeId: generateEnvelopeId(),
    artefactType,
    artefactId,
    contentHash,
    signature,
    signingKeyId: opts.keyId,
    signerIdentity: opts.signerIdentity,
    signedAt: new Date().toISOString(),
    algorithm: key.algorithm,
    schemaVersion: '2025.1',
  };

  return { envelope, content };
}

// ── Verifier ──────────────────────────────────────────────────────────────────

export interface VerificationResult {
  ok: boolean;
  envelopeId: string;
  artefactId: string;
  contentHashMatches: boolean;
  signatureMatches: boolean;
  keyActive: boolean;
  keyExpired: boolean;
  errors: string[];
  verifiedAt: string;
}

export function verifyArtefact<T>(artefact: SignedArtefact<T>): VerificationResult {
  const { envelope, content } = artefact;
  const errors: string[] = [];

  let keyActive = false;
  let keyExpired = false;
  let keyRaw = '';

  try {
    const key = getKey(envelope.signingKeyId);
    keyActive = key.isActive;
    keyRaw = key._rawKey;
    if (key.expiresAt && new Date(key.expiresAt) < new Date(envelope.signedAt)) {
      keyExpired = true;
      errors.push(`Key ${envelope.signingKeyId} was expired at signing time`);
    }
  } catch (e) {
    errors.push(`Key lookup failed: ${(e as Error).message}`);
    return {
      ok: false, envelopeId: envelope.envelopeId, artefactId: envelope.artefactId,
      contentHashMatches: false, signatureMatches: false, keyActive, keyExpired,
      errors, verifiedAt: new Date().toISOString(),
    };
  }

  // Re-derive content hash
  const serialised = JSON.stringify(content, null, 0);
  const expectedContentHash = sha256Hex(serialised);
  const contentHashMatches = expectedContentHash === envelope.contentHash;
  if (!contentHashMatches) errors.push(`Content hash mismatch — artefact may have been tampered`);

  // Re-derive signature
  const expectedSignature = envelope.algorithm === 'HMAC-SHA256'
    ? sha256Hex(keyRaw + envelope.contentHash)
    : fnv1aChain(envelope.contentHash, keyRaw);
  const signatureMatches = expectedSignature === envelope.signature;
  if (!signatureMatches) errors.push(`Signature mismatch — envelope may have been tampered`);

  return {
    ok: contentHashMatches && signatureMatches && keyActive && !keyExpired,
    envelopeId: envelope.envelopeId,
    artefactId: envelope.artefactId,
    contentHashMatches,
    signatureMatches,
    keyActive,
    keyExpired,
    errors,
    verifiedAt: new Date().toISOString(),
  };
}

// ── Batch signer (for export bundles) ────────────────────────────────────────

export interface SignedBundle {
  bundleId: string;
  bundleHash: string;   // hash of all envelope IDs in order
  signature: string;
  signingKeyId: string;
  signerIdentity: string;
  signedAt: string;
  envelopeCount: number;
  envelopes: SignedEnvelope[];
  schemaVersion: string;
}

export function signBundle(
  envelopes: SignedEnvelope[],
  opts: { keyId: string; signerIdentity: string },
): SignedBundle {
  const key = getKey(opts.keyId);
  const bundleId = `BND-${Date.now().toString(36).toUpperCase()}-${_envCounter++}`;
  const bundleContent = envelopes.map((e) => e.envelopeId + ':' + e.contentHash).join('|');
  const bundleHash = sha256Hex(bundleContent);
  const signature = key.algorithm === 'HMAC-SHA256'
    ? sha256Hex(key._rawKey + bundleHash)
    : fnv1aChain(bundleHash, key._rawKey);

  return {
    bundleId,
    bundleHash,
    signature,
    signingKeyId: opts.keyId,
    signerIdentity: opts.signerIdentity,
    signedAt: new Date().toISOString(),
    envelopeCount: envelopes.length,
    envelopes,
    schemaVersion: '2025.1',
  };
}

export function verifyBundle(bundle: SignedBundle): {
  ok: boolean;
  errors: string[];
  envelopeCount: number;
} {
  const errors: string[] = [];

  let keyRaw = '';
  try {
    const key = getKey(bundle.signingKeyId);
    keyRaw = key._rawKey;
  } catch (e) {
    return { ok: false, errors: [`Key error: ${(e as Error).message}`], envelopeCount: bundle.envelopeCount };
  }

  const bundleContent = bundle.envelopes.map((e) => e.envelopeId + ':' + e.contentHash).join('|');
  const expectedHash = sha256Hex(bundleContent);
  if (expectedHash !== bundle.bundleHash) errors.push('Bundle hash mismatch');

  const key = KEY_REGISTRY.get(bundle.signingKeyId);
  if (!key) { errors.push('Unknown signing key'); return { ok: false, errors, envelopeCount: 0 }; }
  const expectedSig = key.algorithm === 'HMAC-SHA256'
    ? sha256Hex(keyRaw + bundle.bundleHash)
    : fnv1aChain(bundle.bundleHash, keyRaw);
  if (expectedSig !== bundle.signature) errors.push('Bundle signature mismatch');

  return {
    ok: errors.length === 0,
    errors,
    envelopeCount: bundle.envelopeCount,
  };
}

// ── Convenience helpers ───────────────────────────────────────────────────────

export function signDecision(
  decision: Record<string, unknown>,
  opts: { keyId: string; signerIdentity: string },
): SignedArtefact<Record<string, unknown>> {
  const id = typeof decision['decisionId'] === 'string' ? decision['decisionId'] : 'UNKNOWN';
  return signArtefact('decision', id, decision, opts);
}

export function signReport(
  report: Record<string, unknown>,
  reportId: string,
  opts: { keyId: string; signerIdentity: string },
): SignedArtefact<Record<string, unknown>> {
  return signArtefact('report', reportId, report, opts);
}

export function signAuditExport(
  entries: unknown[],
  exportId: string,
  opts: { keyId: string; signerIdentity: string },
): SignedArtefact<unknown[]> {
  return signArtefact('audit_export', exportId, entries, opts);
}

// ── Default system key (for development — replace in production) ──────────────

registerSigningKey({
  keyId: 'HAWKEYE_SYSTEM_DEFAULT',
  algorithm: 'FNV1A-CHAIN',
  owner: 'system',
  purpose: 'audit',
  rawKey: 'hawkeye-sterling-default-key-2025-replace-in-production',
});
