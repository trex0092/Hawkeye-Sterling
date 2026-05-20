import { describe, expect, it } from 'vitest';
import typosquatDomainDetectionApply from './wave3-typosquat-domain.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-typosquat-domain', () => {
  it('returns inconclusive when no domainObservations', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('typosquat_domain_detection');
  });

  it('returns inconclusive when observations is empty', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({ domainObservations: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'amazon.com',
        legitimateDomain: 'amazon.com',
        hasValidTls: true,
        hasMxRecords: true,
        isInIcannAbuseList: false,
        registrarReputationScore: 0.9,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('escalates when levenshtein distance is 1', async () => {
    // "amaz0n" vs "amazon" — edit distance 1 (0→a)
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'amaz0n.com',
        legitimateDomain: 'amazon.com',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates when levenshtein distance is 2', async () => {
    // "amaznn" vs "amazon" — edit distance 2
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'amaznn.com',
        legitimateDomain: 'amazon.com',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag when levenshtein distance > 2', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'xyz123.com',
        legitimateDomain: 'amazon.com',
        hasValidTls: true,
        hasMxRecords: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates when homoglyph substitution detected (same length, o→0)', async () => {
    // paypal vs paypa1 (l→1) — same length, homoglyph
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'paypa1.com',
        legitimateDomain: 'paypal.com',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag when observed = legit (same domain)', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'amazon.com',
        legitimateDomain: 'amazon.com',
        hasValidTls: true,
        hasMxRecords: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags fresh_registration when domain registered < 90 days ago', async () => {
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'somesite.com',
        legitimateDomain: 'different.com',
        registrationDate: recentDate,
        hasValidTls: true,
        hasMxRecords: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag fresh_registration when >= 90 days old', async () => {
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'somesite.com',
        legitimateDomain: 'somesite.com',
        registrationDate: oldDate,
        hasValidTls: true,
        hasMxRecords: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags low_reputation_registrar when score < 0.3', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'legit.com',
        legitimateDomain: 'legit.com',
        registrarReputationScore: 0.2,
        hasValidTls: true,
        hasMxRecords: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag low_reputation_registrar when score >= 0.3', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'legit.com',
        legitimateDomain: 'legit.com',
        registrarReputationScore: 0.3,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag registrar reputation when score undefined', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{ observedDomain: 'legit.com', legitimateDomain: 'legit.com' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags no_valid_tls when hasValidTls=false', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'legit.com',
        legitimateDomain: 'legit.com',
        hasValidTls: false,
        hasMxRecords: true,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags no_mx_records when hasMxRecords=false', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'legit.com',
        legitimateDomain: 'legit.com',
        hasValidTls: true,
        hasMxRecords: false,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates icann_abuse_listed', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'malicious.com',
        legitimateDomain: 'trusted.com',
        isInIcannAbuseList: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('uses (unidentified) for missing observedDomain', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{ hasMxRecords: false }],
    }));
    expect(r.evidence[0]).toBe('(unidentified)');
  });

  it('handles rootLabel for domain with https:// prefix', async () => {
    // rootLabel strips http:// prefix
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'https://amaz0n.com',
        legitimateDomain: 'https://amazon.com',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('handles rootLabel for .co.uk style TLD', async () => {
    // bbc.co.uk → root = bbc
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: 'bbb.co.uk',  // root = bbb vs bbc (dist=1)
        legitimateDomain: 'bbc.co.uk',
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('handles empty observed domain gracefully', async () => {
    const r = await typosquatDomainDetectionApply(makeCtx({
      domainObservations: [{
        observedDomain: '',
        legitimateDomain: 'amazon.com',
        hasValidTls: true,
        hasMxRecords: true,
      }],
    }));
    // obsRoot empty → no levenshtein check
    expect(r.verdict).toBe('clear');
  });
});
