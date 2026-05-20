import { describe, expect, it } from 'vitest';
import reGoldenVisaInvestmentApply from './wave3-re-golden-visa.js';
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

const THRESHOLD = 2_000_000;

describe('wave3-re-golden-visa', () => {
  it('returns inconclusive when no realEstateGoldenVisaPurchases', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('re_golden_visa_investment');
  });

  it('returns inconclusive when array is empty', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({ realEstateGoldenVisaPurchases: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when purchase meets threshold and no flags', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: THRESHOLD,
        isMarketedAsGoldenVisa: false,
        buyerVisaApplicationOpened: false,
        paymentBreakdownAed: { cash: 0, mortgage: THRESHOLD },
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('escalates sub_threshold_marketed when marketed as GV but value < threshold', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: 1_000_000,
        isMarketedAsGoldenVisa: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not escalate sub_threshold_marketed if value >= threshold', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: THRESHOLD,
        isMarketedAsGoldenVisa: true,
      }],
    }));
    // No sub_threshold hit; but might have other signals
    const hasSubThreshold = r.evidence.includes('t1') && r.verdict === 'escalate';
    // We mainly check no sub_threshold_marketed fires
    expect(r.rationale).not.toContain('sub_threshold_marketed');
  });

  it('escalates visa_app_sub_threshold when visa app opened with sub-threshold value', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: 500_000,
        buyerVisaApplicationOpened: true,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not escalate visa_app when value >= threshold', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: THRESHOLD,
        buyerVisaApplicationOpened: true,
        paymentBreakdownAed: { cash: 0 },
      }],
    }));
    // No visa_app_sub_threshold (value >= threshold)
    expect(r.verdict).toBe('clear');
  });

  it('flags high_cash_investor when GV-tier purchase with >= 50% cash', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: THRESHOLD,
        paymentBreakdownAed: { cash: THRESHOLD }, // 100% cash
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag high_cash_investor when cash < 50% of value', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: THRESHOLD,
        paymentBreakdownAed: { cash: 500_000 }, // 25% < 50%
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('uses (unidentified) for missing txnId', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{ propertyValueAed: 500_000, isMarketedAsGoldenVisa: true }],
    }));
    expect(r.evidence[0]).toBe('(unidentified)');
  });

  it('defaults cash to 0 when paymentBreakdownAed missing', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [{
        txnId: 't1',
        propertyValueAed: THRESHOLD,
      }],
    }));
    // cash = 0 < 50% threshold, no high_cash_investor
    expect(r.verdict).toBe('clear');
  });

  it('handles multiple purchases', async () => {
    const r = await reGoldenVisaInvestmentApply(makeCtx({
      realEstateGoldenVisaPurchases: [
        { txnId: 't1', propertyValueAed: 500_000, isMarketedAsGoldenVisa: true },
        { txnId: 't2', propertyValueAed: THRESHOLD, paymentBreakdownAed: { cash: THRESHOLD } },
      ],
    }));
    expect(r.verdict).toBe('escalate');
    expect(r.evidence.length).toBeGreaterThan(1);
  });
});
