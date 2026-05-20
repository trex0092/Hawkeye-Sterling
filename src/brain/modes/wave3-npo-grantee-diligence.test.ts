import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import npoGranteeDiligenceApply from './wave3-npo-grantee-diligence.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('npo_grantee_diligence', () => {
  it('returns inconclusive when no npoGrants provided', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('npo_grantee_diligence');
  });

  it('returns inconclusive when npoGrants is empty', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({ npoGrants: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', granteeJurisdiction: 'AE', amountAed: 1000, cddCompleted: true, cddDocsRetained: true, isCahraJurisdiction: false, isCashDistribution: false },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires no_cdd when cddCompleted is false', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 1000, cddCompleted: false, cddDocsRetained: true },
      ],
    }));
    // no_cdd hit => score 0.2, < 0.3 => verdict flag (but score 0.2 means clear)
    // Actually 0.2 < 0.3 => clear verdict, but hits.some(escalate) is false, hits.length > 0 => flag
    // Wait: verdict = hits.some(escalate) ? escalate : hits.length > 0 ? flag : clear
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
    expect(result.evidence).toContain('G1');
  });

  it('does NOT fire no_cdd when cddCompleted is true', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 1000, cddCompleted: true, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('fires no_cdd_docs when cddDocsRetained is false', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 1000, cddCompleted: true, cddDocsRetained: false },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires cahra_no_cdd when CAHRA jurisdiction and cddCompleted is false', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 1000, isCahraJurisdiction: true, cddCompleted: false, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire cahra_no_cdd when cddCompleted is true even in CAHRA jurisdiction', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 1000, isCahraJurisdiction: true, cddCompleted: true, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('fires cash_distribution when isCashDistribution and amount > 5000', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 6000, isCashDistribution: true, cddCompleted: true, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire cash_distribution when amount <= 5000', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 5000, isCashDistribution: true, cddCompleted: true, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('does NOT fire cash_distribution when isCashDistribution is false', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 10000, isCashDistribution: false, cddCompleted: true, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('fires large_grant_no_cdd when amount > 100000 and cddCompleted false', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 200000, cddCompleted: false, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire large_grant_no_cdd when amount <= 100000', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 100000, cddCompleted: false, cddDocsRetained: true },
      ],
    }));
    // score 0.2 (only no_cdd), but still flag
    expect(result.verdict).toBe('flag');
    expect(result.evidence).toContain('G1');
  });

  it('does NOT fire large_grant_no_cdd when cddCompleted is true', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 200000, cddCompleted: true, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('uses granteeName fallback when grantId is missing', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { granteeName: 'TestOrg', amountAed: 1000, cddCompleted: false, cddDocsRetained: true },
      ],
    }));
    expect(result.evidence).toContain('TestOrg');
  });

  it('uses unidentified fallback when both grantId and granteeName missing', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { amountAed: 1000, cddCompleted: false, cddDocsRetained: true },
      ],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('includes summary stats in rationale', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 1000, cddCompleted: false, cddDocsRetained: true, isCahraJurisdiction: true, isCashDistribution: true },
      ],
    }));
    expect(result.rationale).toContain('1 grant(s)');
    expect(result.rationale).toContain('CAHRA');
  });

  it('confidence increases with hits', async () => {
    const result = await npoGranteeDiligenceApply(makeCtx({
      npoGrants: [
        { grantId: 'G1', amountAed: 200000, cddCompleted: false, cddDocsRetained: false, isCahraJurisdiction: true },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
