import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import insPremiumOverfundApply from './wave3-ins-premium-overfund.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('ins_premium_overfund', () => {
  it('returns inconclusive when no policyFunding provided', async () => {
    const result = await insPremiumOverfundApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('ins_premium_overfund');
  });

  it('returns inconclusive when policyFunding is empty', async () => {
    const result = await insPremiumOverfundApply(makeCtx({ policyFunding: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsCountYtd: 1, hasFinancialJustification: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires overfund_extreme when ratio >= 3.0', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 300000, hasFinancialJustification: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires overfund_significant when 1.5 <= ratio < 3.0', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 200000, hasFinancialJustification: true },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire overfund when ratio < 1.5', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 140000, hasFinancialJustification: true },
      ],
    }));
    expect(result.rationale).not.toContain('overfund_extreme');
    expect(result.rationale).not.toContain('overfund_significant');
  });

  it('does NOT fire overfund signals when scheduledAnnualPremiumAed is 0', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 0, actualPremiumPaidYtdAed: 300000 },
      ],
    }));
    expect(result.rationale).not.toContain('overfund_extreme');
    expect(result.rationale).not.toContain('overfund_significant');
  });

  it('fires topup_withdraw_churn when topUps > 0, withdrawals > 0, and churnRatio >= 0.5', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsValueYtdAed: 60000, partialWithdrawalsYtdAed: 60000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire topup_withdraw_churn when churnRatio < 0.5', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsValueYtdAed: 40000, partialWithdrawalsYtdAed: 40000 },
      ],
    }));
    expect(result.rationale).not.toContain('topup_withdraw_churn');
  });

  it('does NOT fire topup_withdraw_churn when topUpsValue is 0', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsValueYtdAed: 0, partialWithdrawalsYtdAed: 60000 },
      ],
    }));
    expect(result.rationale).not.toContain('topup_withdraw_churn');
  });

  it('does NOT fire topup_withdraw_churn when withdrawals is 0', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsValueYtdAed: 60000, partialWithdrawalsYtdAed: 0 },
      ],
    }));
    expect(result.rationale).not.toContain('topup_withdraw_churn');
  });

  it('fires frequent_top_ups when topUpsCountYtd >= 5', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsCountYtd: 5 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire frequent_top_ups when topUpsCountYtd < 5', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsCountYtd: 4 },
      ],
    }));
    expect(result.rationale).not.toContain('frequent_top_ups');
  });

  it('fires overfund_no_justification when ratio >= 1.5 and hasFinancialJustification is false', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 200000, hasFinancialJustification: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire overfund_no_justification when ratio < 1.5', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, hasFinancialJustification: false },
      ],
    }));
    expect(result.rationale).not.toContain('overfund_no_justification');
  });

  it('uses ref with reportingYear in evidence', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', reportingYear: '2024', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 400000, hasFinancialJustification: true },
      ],
    }));
    expect(result.evidence[0]).toContain('P1@2024');
  });

  it('uses topUpsValueYtdAed for churnRatio when it is less than withdrawals', async () => {
    // churn = Math.min(topUpsValue, withdrawals) = topUpsValue when topUps < withdrawals
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 100000, topUpsValueYtdAed: 60000, partialWithdrawalsYtdAed: 100000 },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('confidence increases with hits', async () => {
    const result = await insPremiumOverfundApply(makeCtx({
      policyFunding: [
        { policyId: 'P1', scheduledAnnualPremiumAed: 100000, actualPremiumPaidYtdAed: 400000, hasFinancialJustification: false, topUpsCountYtd: 6 },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
