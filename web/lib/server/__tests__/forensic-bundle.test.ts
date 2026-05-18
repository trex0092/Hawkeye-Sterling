import { describe, expect, it } from 'vitest';
import {
  buildForensicBundle,
  verifyForensicBundle,
  canonicalSerialise,
  sha256Hex,
  hmacSha256Hex,
  type ForensicBundlePayload,
} from '../forensic-bundle';

const SECRET = 'test-secret-not-for-production-use';
const NOW = new Date('2026-05-18T12:00:00.000Z');

function freshPayload(over: Partial<ForensicBundlePayload> = {}): ForensicBundlePayload {
  return {
    subjectId: 'case-abc-123',
    profile: { id: 'case-abc-123', name: 'Test Subject' },
    latestSnapshot: { topScore: 80, severity: 'high' },
    adverseMediaSeen: { urls: ['https://example.test/a'] },
    auditEntries: [
      {
        sequence: 1,
        id: 'audit-1',
        at: '2026-05-17T10:00:00.000Z',
        actor: { role: 'mlro', name: 'Test MLRO' },
        action: 'disposition',
        target: 'case-abc-123',
        body: { decision: 'escalated' },
        previousHash: '0'.repeat(64),
        signature: 'sig-1',
      },
    ],
    fourEyesItems: [],
    ...over,
  };
}

describe('canonicalSerialise', () => {
  it('produces identical output regardless of input key order', () => {
    const a = canonicalSerialise({ b: 1, a: 2, c: 3 });
    const b = canonicalSerialise({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('sorts keys at every nesting level', () => {
    const obj = { z: { y: 1, x: 2 }, a: { c: 1, b: 2 } };
    const s = canonicalSerialise(obj);
    // 'a' comes before 'z'; within each nested object keys sort.
    expect(s).toBe('{"a":{"b":2,"c":1},"z":{"x":2,"y":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalSerialise([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles null and primitive values', () => {
    expect(canonicalSerialise(null)).toBe('null');
    expect(canonicalSerialise(42)).toBe('42');
    expect(canonicalSerialise('hello')).toBe('"hello"');
  });
});

describe('buildForensicBundle', () => {
  it('produces a bundle with sha256 + provenance fields', () => {
    const bundle = buildForensicBundle('case-1', freshPayload(), 'operator-x', SECRET, NOW);
    expect(bundle.subjectId).toBe('case-1');
    expect(bundle.generatedBy).toBe('operator-x');
    expect(bundle.generatedAt).toBe(NOW.toISOString());
    expect(bundle.bundleSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.bundleHmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('omits bundleHmac when no signing secret', () => {
    const bundle = buildForensicBundle('case-1', freshPayload(), 'operator-x', undefined, NOW);
    expect(bundle.bundleHmac).toBeUndefined();
    expect(bundle.bundleSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces deterministic sha256 for identical payloads', () => {
    const a = buildForensicBundle('case-1', freshPayload(), 'op', SECRET, NOW);
    const b = buildForensicBundle('case-1', freshPayload(), 'op', SECRET, NOW);
    expect(a.bundleSha256).toBe(b.bundleSha256);
    expect(a.bundleHmac).toBe(b.bundleHmac);
  });
});

describe('verifyForensicBundle', () => {
  it('passes a freshly built bundle', () => {
    const bundle = buildForensicBundle('case-1', freshPayload(), 'op', SECRET, NOW);
    const r = verifyForensicBundle(bundle, SECRET);
    expect(r.ok).toBe(true);
    expect(r.faults).toEqual([]);
  });

  it('passes without secret when verifying sha256 only', () => {
    const bundle = buildForensicBundle('case-1', freshPayload(), 'op', undefined, NOW);
    const r = verifyForensicBundle(bundle);
    expect(r.ok).toBe(true);
  });

  it('DETECTS payload tampering (sha256 mismatch)', () => {
    const bundle = buildForensicBundle('case-1', freshPayload(), 'op', SECRET, NOW);
    // Attacker rewrites the latestSnapshot but doesn't update sha256.
    bundle.payload.latestSnapshot = { topScore: 0, severity: 'clear' };
    const r = verifyForensicBundle(bundle, SECRET);
    expect(r.ok).toBe(false);
    expect(r.faults.some((f) => f.includes('bundleSha256 mismatch'))).toBe(true);
  });

  it('DETECTS signature forgery with wrong secret', () => {
    const bundle = buildForensicBundle('case-1', freshPayload(), 'op', SECRET, NOW);
    const r = verifyForensicBundle(bundle, 'wrong-secret');
    expect(r.ok).toBe(false);
    expect(r.faults.some((f) => f.includes('bundleHmac mismatch'))).toBe(true);
  });

  it('FLAGS missing HMAC when verifier expects one', () => {
    const bundle = buildForensicBundle('case-1', freshPayload(), 'op', undefined, NOW);
    const r = verifyForensicBundle(bundle, SECRET);
    expect(r.ok).toBe(false);
    expect(r.faults.some((f) => f.includes('bundleHmac missing'))).toBe(true);
  });
});

describe('sha256Hex + hmacSha256Hex', () => {
  it('sha256 is deterministic', () => {
    expect(sha256Hex('test')).toBe(sha256Hex('test'));
  });

  it('sha256 changes on input change', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });

  it('hmac changes on secret change', () => {
    expect(hmacSha256Hex('msg', 'k1')).not.toBe(hmacSha256Hex('msg', 'k2'));
  });
});
