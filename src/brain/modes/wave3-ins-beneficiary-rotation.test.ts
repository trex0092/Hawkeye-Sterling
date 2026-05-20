import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import insBeneficiaryRotationApply from './wave3-ins-beneficiary-rotation.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('ins_beneficiary_rotation', () => {
  it('returns inconclusive when no beneficiaryChanges provided', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('ins_beneficiary_rotation');
  });

  it('returns inconclusive when beneficiaryChanges is empty', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({ beneficiaryChanges: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when changes present but no signals fire', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: '2024-01-01T00:00:00Z', newBeneficiaryRelationship: 'spouse', cddOnNewBeneficiary: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires rotation_significant when 3-4 changes in 12 months', async () => {
    const base = new Date('2024-01-01').getTime();
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: new Date(base).toISOString(), newBeneficiaryRelationship: 'spouse' },
        { policyId: 'P1', changeId: 'C2', changedAt: new Date(base + 30 * 86400000).toISOString(), newBeneficiaryRelationship: 'child' },
        { policyId: 'P1', changeId: 'C3', changedAt: new Date(base + 60 * 86400000).toISOString(), newBeneficiaryRelationship: 'parent' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    // 3 changes in <12 months => rotation_significant
    expect(result.evidence).toContain('P1');
  });

  it('fires rotation_extreme when >= 5 changes in 12 months', async () => {
    const base = new Date('2024-01-01').getTime();
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: new Date(base).toISOString() },
        { policyId: 'P1', changeId: 'C2', changedAt: new Date(base + 20 * 86400000).toISOString() },
        { policyId: 'P1', changeId: 'C3', changedAt: new Date(base + 40 * 86400000).toISOString() },
        { policyId: 'P1', changeId: 'C4', changedAt: new Date(base + 60 * 86400000).toISOString() },
        { policyId: 'P1', changeId: 'C5', changedAt: new Date(base + 80 * 86400000).toISOString() },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('does NOT fire rotation when changes span more than 12 months', async () => {
    const base = new Date('2024-01-01').getTime();
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: new Date(base).toISOString() },
        { policyId: 'P1', changeId: 'C2', changedAt: new Date(base + 100 * 86400000).toISOString() },
        { policyId: 'P1', changeId: 'C3', changedAt: new Date(base + 400 * 86400000).toISOString() }, // > 12 months span
      ],
    }));
    // The span from C1 to C3 is > 365 days, so no rotation signal
    expect(result.verdict).toBe('clear');
  });

  it('does NOT fire rotation signal when only 2 changes on same policy', async () => {
    const base = new Date('2024-01-01').getTime();
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: new Date(base).toISOString() },
        { policyId: 'P1', changeId: 'C2', changedAt: new Date(base + 30 * 86400000).toISOString() },
      ],
    }));
    // < ROTATION_FLAG_COUNT_12MO (3)
    expect(result.rationale).not.toContain('rotation_significant');
    expect(result.rationale).not.toContain('rotation_extreme');
  });

  it('fires unrelated_new_beneficiary when relationship is unrelated', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: '2024-01-01T00:00:00Z', newBeneficiaryRelationship: 'unrelated' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.evidence).toContain('C1');
  });

  it('fires high_risk_new_beneficiary when newBeneficiaryFatfHighRisk is true', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: '2024-01-01T00:00:00Z', newBeneficiaryFatfHighRisk: true, newBeneficiaryJurisdiction: 'IR' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.evidence).toContain('C1');
  });

  it('fires pep_new_beneficiary when newBeneficiaryIsPep is true', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: '2024-01-01T00:00:00Z', newBeneficiaryIsPep: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('fires no_cdd_new_beneficiary when cddOnNewBeneficiary is false', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: '2024-01-01T00:00:00Z', cddOnNewBeneficiary: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('uses fallback cref when changeId is undefined', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changedAt: '2024-01-01T00:00:00Z', newBeneficiaryFatfHighRisk: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('uses (unknown) policyId when policyId undefined', async () => {
    const base = new Date('2024-01-01').getTime();
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { changeId: 'C1', changedAt: new Date(base).toISOString() },
        { changeId: 'C2', changedAt: new Date(base + 30 * 86400000).toISOString() },
        { changeId: 'C3', changedAt: new Date(base + 60 * 86400000).toISOString() },
      ],
    }));
    expect(result.modeId).toBe('ins_beneficiary_rotation');
  });

  it('handles invalid date strings gracefully', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: 'invalid-date' },
        { policyId: 'P1', changeId: 'C2', changedAt: 'invalid-date' },
        { policyId: 'P1', changeId: 'C3', changedAt: 'invalid-date' },
      ],
    }));
    // NaN dates don't satisfy the check, no rotation signal
    expect(result.modeId).toBe('ins_beneficiary_rotation');
  });

  it('verdict is flag when only flag-severity hits (unrelated beneficiary)', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: '2024-01-01T00:00:00Z', newBeneficiaryRelationship: 'unrelated' },
      ],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('confidence increases with number of hits', async () => {
    const result = await insBeneficiaryRotationApply(makeCtx({
      beneficiaryChanges: [
        { policyId: 'P1', changeId: 'C1', changedAt: '2024-01-01T00:00:00Z', cddOnNewBeneficiary: false, newBeneficiaryIsPep: true },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
