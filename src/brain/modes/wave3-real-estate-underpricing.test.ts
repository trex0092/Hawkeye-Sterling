import { describe, expect, it } from 'vitest';
import realEstateUnderpricingApply from './wave3-real-estate-underpricing.js';
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

describe('wave3-real-estate-underpricing', () => {
  it('returns inconclusive when no realEstateDeals', async () => {
    const r = await realEstateUnderpricingApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('real_estate_underpricing');
  });

  it('returns inconclusive when deals is empty', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({ realEstateDeals: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 1_000_000,
        marketComparablePriceAed: 1_000_000,
        paymentMethod: 'wire',
        closingTimeDays: 30,
        agentLicensed: true,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags under_market when ratio <= 0.7', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 700_000,
        marketComparablePriceAed: 1_000_000, // ratio = 0.7
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags under_market with weight capped at 0.4 for extreme underpricing', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 100_000, // ratio = 0.1
        marketComparablePriceAed: 1_000_000,
      }],
    }));
    const weight = r.score;
    expect(weight).toBeLessThanOrEqual(0.4);
  });

  it('flags over_market when ratio >= 1.3', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 1_300_000,
        marketComparablePriceAed: 1_000_000, // ratio = 1.3
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when ratio is between 0.7 and 1.3', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 1_000_000,
        marketComparablePriceAed: 1_000_000, // ratio = 1.0
        paymentMethod: 'wire',
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('skips price comparison when marketComparablePriceAed is 0', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 500_000,
        marketComparablePriceAed: 0,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('skips price comparison when declaredPriceAed missing', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        marketComparablePriceAed: 1_000_000,
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags high_value_cash when cash payment >= 1M AED', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 1_000_000,
        paymentMethod: 'cash',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag high_value_cash when cash < 1M', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 500_000,
        paymentMethod: 'cash',
      }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags crypto_settled when paymentMethod is crypto', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        paymentMethod: 'crypto',
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags rapid_closing when closingTimeDays <= 3', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        closingTimeDays: 3,
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag rapid_closing when closingTimeDays > 3', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{ dealId: 'd1', unitId: 'u1', closingTimeDays: 4 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag rapid_closing when closingTimeDays undefined (defaults to Infinity)', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{ dealId: 'd1', unitId: 'u1' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags unlicensed_agent when agentLicensed is false', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{ dealId: 'd1', unitId: 'u1', agentLicensed: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when score >= 0.6', async () => {
    // under_market(~0.4) + crypto(0.25) + rapid_closing(0.15) + unlicensed(0.2) = ~1.0 → compressed
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [{
        dealId: 'd1',
        unitId: 'u1',
        declaredPriceAed: 100_000,
        marketComparablePriceAed: 1_000_000, // ratio=0.1 → max 0.4
        paymentMethod: 'crypto',
        closingTimeDays: 1,
        agentLicensed: false,
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('compresses score above 0.7', async () => {
    const r = await realEstateUnderpricingApply(makeCtx({
      realEstateDeals: [
        { dealId: 'd1', unitId: 'u1', declaredPriceAed: 100_000, marketComparablePriceAed: 1_000_000, paymentMethod: 'crypto', closingTimeDays: 1, agentLicensed: false },
        { dealId: 'd2', unitId: 'u2', declaredPriceAed: 50_000, marketComparablePriceAed: 1_000_000, paymentMethod: 'cash', closingTimeDays: 1 },
      ],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
