import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import insSinglePremiumScrutinyApply from './wave3-ins-single-premium.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('ins_single_premium_scrutiny', () => {
  it('returns inconclusive when no singlePremiumPolicies provided', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('ins_single_premium_scrutiny');
  });

  it('returns inconclusive when singlePremiumPolicies is empty', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({ singlePremiumPolicies: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: false, premiumAmountAed: 100000 },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires large_single_premium when isSinglePremium and amount >= 1_000_000', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 1000000, customerSourceOfFundsDocumented: true, edDdPerformed: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires material_single_premium when isSinglePremium and 184000 <= amount < 1_000_000', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 500000, customerSourceOfFundsDocumented: true, edDdPerformed: true },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire large or material when isSinglePremium is false', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: false, premiumAmountAed: 2000000 },
      ],
    }));
    expect(result.rationale).not.toContain('large_single_premium');
    expect(result.rationale).not.toContain('material_single_premium');
  });

  it('does NOT fire when amount < 184000', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 100000 },
      ],
    }));
    expect(result.rationale).not.toContain('material_single_premium');
    expect(result.rationale).not.toContain('large_single_premium');
  });

  it('fires no_sof_documentation when high single premium and customerSourceOfFundsDocumented is false', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 300000, customerSourceOfFundsDocumented: false, edDdPerformed: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires no_edd when high single premium and edDdPerformed is false', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 300000, customerSourceOfFundsDocumented: true, edDdPerformed: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires tranche_structuring when paidInMultipleTranches and trancheCount >= 3', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 100000, paidInMultipleTranches: true, trancheCount: 3 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire tranche_structuring when trancheCount < 3', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 100000, paidInMultipleTranches: true, trancheCount: 2 },
      ],
    }));
    expect(result.rationale).not.toContain('tranche_structuring');
  });

  it('does NOT fire tranche_structuring when paidInMultipleTranches is false', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 100000, paidInMultipleTranches: false, trancheCount: 5 },
      ],
    }));
    expect(result.rationale).not.toContain('tranche_structuring');
  });

  it('fires cash_premium when premiumPaymentMethod is cash', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 100000, premiumPaymentMethod: 'cash' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('fires crypto_premium when premiumPaymentMethod is crypto', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 100000, premiumPaymentMethod: 'crypto' },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('escalate');
  });

  it('does NOT fire cash_premium or crypto_premium for wire payment', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 100000, premiumPaymentMethod: 'wire' },
      ],
    }));
    expect(result.rationale).not.toContain('cash_premium');
    expect(result.rationale).not.toContain('crypto_premium');
  });

  it('fires pep_no_edd when isSinglePremium + high amount + PEP + no EDD', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 300000, customerIsPep: true, edDdPerformed: false, customerSourceOfFundsDocumented: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire pep_no_edd when edDdPerformed is true', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 300000, customerIsPep: true, edDdPerformed: true, customerSourceOfFundsDocumented: true },
      ],
    }));
    expect(result.rationale).not.toContain('pep_no_edd');
  });

  it('fires high_risk_jurisdiction_customer when high amount + FATF high risk', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 300000, customerJurisdictionFatfHighRisk: true, customerSourceOfFundsDocumented: true, edDdPerformed: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('confidence increases with hits', async () => {
    const result = await insSinglePremiumScrutinyApply(makeCtx({
      singlePremiumPolicies: [
        { policyId: 'P1', isSinglePremium: true, premiumAmountAed: 2000000, customerSourceOfFundsDocumented: false, edDdPerformed: false, customerIsPep: true, customerJurisdictionFatfHighRisk: true },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
