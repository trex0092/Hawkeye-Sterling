import { describe, it, expect } from 'vitest';
import { npoProgrammeVsCashRatioApply } from './wave3-npo-programme-vs-cash.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test NPO', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-npo-programme-vs-cash', () => {
  it('returns inconclusive when no npoFinancials evidence', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.modeId).toBe('npo_programme_vs_cash_ratio');
  });

  it('returns clear when all financials look good', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO1',
        reportingYear: '2023',
        programmeExpenditureAed: 700_000,
        administrativeExpenditureAed: 200_000,
        fundraisingExpenditureAed: 100_000,
        totalRevenueAed: 1_000_000,
        cashOnHandAed: 500_000,
        hasAuditedAccounts: true,
        auditOpinion: 'unqualified',
      }],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.score).toBe(0);
  });

  it('flags when programmeRatio is between 50-65%', async () => {
    // 600k programme / 1000k total = 60%, between 50% and 65% threshold
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO2',
        reportingYear: '2023',
        programmeExpenditureAed: 600_000,
        administrativeExpenditureAed: 300_000,
        fundraisingExpenditureAed: 100_000,
        totalRevenueAed: 1_000_000,
        cashOnHandAed: 500_000,
        hasAuditedAccounts: true,
        auditOpinion: 'unqualified',
      }],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('escalates when programmeRatio < 50%', async () => {
    // 400k programme / 1000k total = 40%
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO3',
        reportingYear: '2023',
        programmeExpenditureAed: 400_000,
        administrativeExpenditureAed: 400_000,
        fundraisingExpenditureAed: 200_000,
        totalRevenueAed: 1_000_000,
        cashOnHandAed: 500_000,
        hasAuditedAccounts: true,
        auditOpinion: 'unqualified',
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('flags when cash to revenue > 1.0', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO4',
        reportingYear: '2023',
        programmeExpenditureAed: 700_000,
        administrativeExpenditureAed: 200_000,
        fundraisingExpenditureAed: 100_000,
        totalRevenueAed: 500_000,
        cashOnHandAed: 600_000, // 1.2× revenue
        hasAuditedAccounts: true,
        auditOpinion: 'unqualified',
      }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('flags when hasAuditedAccounts is false', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO5',
        reportingYear: '2023',
        programmeExpenditureAed: 700_000,
        administrativeExpenditureAed: 200_000,
        fundraisingExpenditureAed: 100_000,
        totalRevenueAed: 1_000_000,
        cashOnHandAed: 500_000,
        hasAuditedAccounts: false,
        auditOpinion: 'unqualified',
      }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('escalates when auditOpinion is adverse', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO6',
        reportingYear: '2023',
        programmeExpenditureAed: 700_000,
        administrativeExpenditureAed: 200_000,
        fundraisingExpenditureAed: 100_000,
        totalRevenueAed: 1_000_000,
        cashOnHandAed: 500_000,
        hasAuditedAccounts: true,
        auditOpinion: 'adverse',
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('escalates when auditOpinion is disclaimer', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO7',
        reportingYear: '2023',
        programmeExpenditureAed: 700_000,
        administrativeExpenditureAed: 200_000,
        fundraisingExpenditureAed: 100_000,
        totalRevenueAed: 1_000_000,
        cashOnHandAed: 500_000,
        hasAuditedAccounts: true,
        auditOpinion: 'disclaimer',
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('handles zero total expenditure (programmeRatio defaults to 1)', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO8',
        reportingYear: '2023',
        programmeExpenditureAed: 0,
        administrativeExpenditureAed: 0,
        fundraisingExpenditureAed: 0,
        totalRevenueAed: 1_000_000,
        cashOnHandAed: 0,
      }],
    }));
    // ratio defaults to 1, so no programme_ratio signals
    expect(result.verdict).toBe('clear');
  });

  it('handles zero revenue (cashToRevenue defaults to 0)', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{
        npoId: 'NPO9',
        reportingYear: '2023',
        programmeExpenditureAed: 700_000,
        administrativeExpenditureAed: 200_000,
        fundraisingExpenditureAed: 100_000,
        totalRevenueAed: 0,
        cashOnHandAed: 999_999,
      }],
    }));
    // cash ratio defaults to 0, no excess_cash signal
    expect(result.verdict).toBe('clear');
  });

  it('handles missing npoId and reportingYear in ref', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [{}],
    }));
    // No meaningful signals since all values default to 0
    expect(result.modeId).toBe('npo_programme_vs_cash_ratio');
  });

  it('handles multiple financials with mixed signals', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx({
      npoFinancials: [
        {
          npoId: 'A',
          programmeExpenditureAed: 700_000,
          administrativeExpenditureAed: 200_000,
          fundraisingExpenditureAed: 100_000,
          totalRevenueAed: 1_000_000,
          cashOnHandAed: 200_000,
          hasAuditedAccounts: true,
          auditOpinion: 'unqualified',
        },
        {
          npoId: 'B',
          programmeExpenditureAed: 300_000,
          administrativeExpenditureAed: 500_000,
          fundraisingExpenditureAed: 200_000,
          totalRevenueAed: 500_000,
          cashOnHandAed: 700_000,
          hasAuditedAccounts: false,
          auditOpinion: 'adverse',
        },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('returns correct modeId and faculties', async () => {
    const result = await npoProgrammeVsCashRatioApply(makeCtx());
    expect(result.modeId).toBe('npo_programme_vs_cash_ratio');
    expect(result.category).toBe('compliance_framework');
    expect(result.faculties).toContain('data_analysis');
  });
});
