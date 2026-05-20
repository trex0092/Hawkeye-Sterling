import { describe, expect, it } from 'vitest';
import assayCertificateAuditApply from './wave3-assay-certificate.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-assay-certificate', () => {
  it('returns inconclusive when no assayCertificates supplied', async () => {
    const result = await assayCertificateAuditApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.modeId).toBe('assay_certificate_audit');
  });

  it('returns inconclusive when assayCertificates is empty', async () => {
    const result = await assayCertificateAuditApply(makeCtx({ assayCertificates: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when certificate has no issues', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C001',
        laboratory: 'ValidLab',
        laboratoryIso17025Accredited: true,
        laboratoryLbmaApproved: true,
        finenessReportedPpt: 999.9,
        declaredMassGrams: 1000,
        assayedMassGrams: 1000,
        hasSignature: true,
        hasOriginCountry: true,
        certificateAgeDays: 100,
      }],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.score).toBe(0);
  });

  it('escalates when lab not ISO 17025 accredited', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C002',
        laboratory: 'BadLab',
        laboratoryIso17025Accredited: false,
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('flags when lab not LBMA approved', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C003',
        laboratory: 'NonLBMALab',
        laboratoryLbmaApproved: false,
        laboratoryIso17025Accredited: true,
      }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('flags when fineness < LBMA minimum (995.0)', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C004',
        finenessReportedPpt: 990.0,
      }],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('does NOT flag fineness when equal to LBMA minimum', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C005',
        finenessReportedPpt: 995.0,
      }],
    }));
    // 995.0 is exactly at LBMA min, not below it
    const hasFinenessHit = result.evidence.includes('C005');
    // At exactly 995.0 it should not flag (< 995.0 required)
    expect(result.verdict).toBe('clear');
  });

  it('does not flag fineness when not a number', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C006', finenessReportedPpt: undefined }],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('escalates mass deviation critical when >= 1%', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C007',
        declaredMassGrams: 1000,
        assayedMassGrams: 985, // 1.5% deviation
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('flags mass deviation when >= 0.1% but < 1%', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C008',
        declaredMassGrams: 1000,
        assayedMassGrams: 999, // 0.1% deviation exactly
      }],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does not flag mass deviation when < 0.1%', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C009',
        declaredMassGrams: 1000,
        assayedMassGrams: 999.9, // 0.01% deviation
      }],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('skips mass deviation check when declaredMassGrams is 0', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{
        certId: 'C010',
        declaredMassGrams: 0,
        assayedMassGrams: 100,
      }],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('skips mass deviation check when masses are missing', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C011' }],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('flags unsigned certificate', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C012', hasSignature: false }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('flags missing origin country', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C013', hasOriginCountry: false }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('flags stale certificate when age > 365 days', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C014', certificateAgeDays: 400 }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('does NOT flag stale certificate when age = 365 days', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C015', certificateAgeDays: 365 }],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('does not flag stale cert when certificateAgeDays is not a number', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C016', certificateAgeDays: undefined }],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('uses batchId as ref when certId is missing', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ batchId: 'B001', hasSignature: false }],
    }));
    expect(result.evidence).toContain('B001');
  });

  it('uses (unidentified) as ref when both ids missing', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ hasSignature: false }],
    }));
    expect(result.evidence).toContain('(unidentified)');
  });

  it('accumulates score correctly for multiple certificates with multiple flags', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [
        { certId: 'C017', laboratoryIso17025Accredited: false },  // 0.4 escalate
        { certId: 'C018', hasSignature: false, hasOriginCountry: false }, // 0.4 flag
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('rationale filter removes empty strings', async () => {
    const result = await assayCertificateAuditApply(makeCtx({
      assayCertificates: [{ certId: 'C019' }],
    }));
    expect(result.rationale).not.toContain('undefined');
  });
});
