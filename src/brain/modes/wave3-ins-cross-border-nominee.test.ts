import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import insCrossBorderNomineeApply from './wave3-ins-cross-border-nominee.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('ins_cross_border_nominee', () => {
  it('returns inconclusive when no crossBorderPolicies provided', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('ins_cross_border_nominee');
  });

  it('returns inconclusive when crossBorderPolicies is empty', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({ crossBorderPolicies: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', premiumSourceJurisdiction: 'AE', beneficiaryJurisdiction: 'AE', payoutJurisdiction: 'AE', uaeCbuaeNotificationFiled: true },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires three_jurisdictions when distinct jurisdictions >= 3', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', premiumSourceJurisdiction: 'UK', beneficiaryJurisdiction: 'CH', payoutJurisdiction: 'AE', uaeCbuaeNotificationFiled: true },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire three_jurisdictions when only 2 distinct jurisdictions', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', premiumSourceJurisdiction: 'AE', beneficiaryJurisdiction: 'UK', payoutJurisdiction: 'UK', uaeCbuaeNotificationFiled: true },
      ],
    }));
    expect(result.rationale).not.toContain('three_jurisdictions');
  });

  it('fires premium_source_mismatch when src != ph', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', premiumSourceJurisdiction: 'UK', uaeCbuaeNotificationFiled: true },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire premium_source_mismatch when src = ph', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', premiumSourceJurisdiction: 'AE', uaeCbuaeNotificationFiled: true },
      ],
    }));
    expect(result.rationale).not.toContain('premium_source_mismatch');
  });

  it('does NOT fire premium_source_mismatch when premiumSourceJurisdiction is empty', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', uaeCbuaeNotificationFiled: true },
      ],
    }));
    expect(result.rationale).not.toContain('premium_source_mismatch');
  });

  it('fires high_risk_funding_source when premiumSourceFatfHighRisk is true', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', premiumSourceFatfHighRisk: true, premiumSourceJurisdiction: 'IR' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires high_risk_beneficiary when beneficiaryFatfHighRisk is true', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', beneficiaryFatfHighRisk: true, beneficiaryJurisdiction: 'KP' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires nominee_indicators when hasNomineeIndicators is true', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', hasNomineeIndicators: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires third_party_payout when payoutAccountInThirdParty is true', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', payoutAccountInThirdParty: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires no_cbuae_notification when distinct >= 2 and uaeCbuaeNotificationFiled is false', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', beneficiaryJurisdiction: 'UK', uaeCbuaeNotificationFiled: false },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire no_cbuae_notification when only 1 distinct jurisdiction', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', policyholderJurisdiction: 'AE', uaeCbuaeNotificationFiled: false },
      ],
    }));
    expect(result.rationale).not.toContain('no_cbuae_notification');
  });

  it('uses unidentified fallback for policyId', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { hasNomineeIndicators: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('handles empty jurisdiction strings gracefully', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1' }, // all jurisdictions undefined
      ],
    }));
    expect(result.modeId).toBe('ins_cross_border_nominee');
  });

  it('confidence increases with hits', async () => {
    const result = await insCrossBorderNomineeApply(makeCtx({
      crossBorderPolicies: [
        { policyId: 'P1', hasNomineeIndicators: true, payoutAccountInThirdParty: true },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
