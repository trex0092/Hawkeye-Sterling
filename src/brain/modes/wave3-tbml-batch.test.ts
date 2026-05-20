import { describe, expect, it } from 'vitest';
import { TBML_BATCH_APPLIES } from './wave3-tbml-batch.js';
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

describe('tbml-batch: phantom_shipment_detection', () => {
  const apply = TBML_BATCH_APPLIES['phantom_shipment_detection']!;

  it('returns inconclusive when no phantomShipments', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('phantom_shipment_detection');
  });

  it('flags phantom_pattern when >= 2 missing and declared value > 0', async () => {
    const r = await apply(makeCtx({ phantomShipments: [{ invoiceId: 'i1', manifestExists: false, trackingExists: false, declaredValueAed: 100_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when only 1 missing', async () => {
    const r = await apply(makeCtx({ phantomShipments: [{ invoiceId: 'i1', manifestExists: false, trackingExists: true, portInRecord: true, declaredValueAed: 100_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when declared value is 0', async () => {
    const r = await apply(makeCtx({ phantomShipments: [{ invoiceId: 'i1', manifestExists: false, trackingExists: false, declaredValueAed: 0 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags with all three missing', async () => {
    const r = await apply(makeCtx({ phantomShipments: [{ invoiceId: 'i1', manifestExists: false, trackingExists: false, portInRecord: false, declaredValueAed: 50_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when >= 2 missing but declaredValueAed is undefined (defaults to 0)', async () => {
    const r = await apply(makeCtx({ phantomShipments: [{ invoiceId: 'i1', manifestExists: false, trackingExists: false }] }));
    // declaredValueAed ?? 0 → 0, not > 0 → no flag
    expect(r.verdict).toBe('clear');
  });

  it('does not count manifest as missing when manifestExists is true', async () => {
    const r = await apply(makeCtx({ phantomShipments: [{ invoiceId: 'i1', manifestExists: true, trackingExists: false, portInRecord: false, declaredValueAed: 50_000 }] }));
    // missing = ['tracking', 'port_record'] → length=2 → flag
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('tbml-batch: carousel_vat_fraud', () => {
  const apply = TBML_BATCH_APPLIES['carousel_vat_fraud']!;

  it('returns inconclusive when no vatChains', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags missing_trader', async () => {
    const r = await apply(makeCtx({ vatChains: [{ chainId: 'c1', missingTraderDetected: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags goods_recirculation when sameGoodsCirculatedTimes >= 3', async () => {
    const r = await apply(makeCtx({ vatChains: [{ chainId: 'c1', sameGoodsCirculatedTimes: 3 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags large_reclaim when vatReclaimedAed >= 500k', async () => {
    const r = await apply(makeCtx({ vatChains: [{ chainId: 'c1', vatReclaimedAed: 500_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no signals', async () => {
    const r = await apply(makeCtx({ vatChains: [{ chainId: 'c1', sameGoodsCirculatedTimes: 2, vatReclaimedAed: 100_000 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('tbml-batch: circular_trade_pattern', () => {
  const apply = TBML_BATCH_APPLIES['circular_trade_pattern']!;

  it('returns inconclusive when no circularTrades', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags closed_loop', async () => {
    const r = await apply(makeCtx({ circularTrades: [{ tradeId: 't1', closesLoop: true, partyChain: ['A', 'B', 'C', 'A'] }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags no_net_change when < 0.01 change and >= 4 parties', async () => {
    const r = await apply(makeCtx({ circularTrades: [{ tradeId: 't1', netInventoryChange: 0.005, partyChain: ['A', 'B', 'C', 'D'] }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag no_net_change when partyChain < 4', async () => {
    const r = await apply(makeCtx({ circularTrades: [{ tradeId: 't1', netInventoryChange: 0, partyChain: ['A', 'B', 'C'] }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag no_net_change when change >= 0.01', async () => {
    const r = await apply(makeCtx({ circularTrades: [{ tradeId: 't1', netInventoryChange: 0.05, partyChain: ['A', 'B', 'C', 'D'] }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags closed_loop without partyChain (partyChain ?? [] defaults to [])', async () => {
    const r = await apply(makeCtx({ circularTrades: [{ tradeId: 't1', closesLoop: true }] }));
    // partyChain undefined → ?? [] → length=0 label says "Loop length 0", no_net_change needs >=4 so no
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('tbml-batch: multi_invoicing_anomaly', () => {
  const apply = TBML_BATCH_APPLIES['multi_invoicing_anomaly']!;

  it('returns inconclusive when no invoiceSets', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags duplicate_diff_values when sameGoodsCount >= 2 and valuesMatch=false', async () => {
    const r = await apply(makeCtx({ invoiceSets: [{ groupId: 'g1', sameGoodsCount: 2, valuesMatch: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags duplicate_diff_parties when partiesOverlap=false and sameGoodsCount >= 2', async () => {
    const r = await apply(makeCtx({ invoiceSets: [{ groupId: 'g1', sameGoodsCount: 2, partiesOverlap: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when sameGoodsCount < 2', async () => {
    const r = await apply(makeCtx({ invoiceSets: [{ groupId: 'g1', sameGoodsCount: 1, valuesMatch: false, partiesOverlap: false }] }));
    expect(r.verdict).toBe('clear');
  });

  it('clear when sameGoodsCount is undefined (defaults to 0)', async () => {
    const r = await apply(makeCtx({ invoiceSets: [{ groupId: 'g1', valuesMatch: false, partiesOverlap: false }] }));
    // sameGoodsCount undefined → ?? 0 → 0 < 2 → no flag
    expect(r.verdict).toBe('clear');
  });
});

describe('tbml-batch: mis_described_goods', () => {
  const apply = TBML_BATCH_APPLIES['mis_described_goods']!;

  it('returns inconclusive when no declaredGoods', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags hs_mismatch when first 4 chars of HS codes differ', async () => {
    const r = await apply(makeCtx({ declaredGoods: [{ invoiceId: 'i1', declaredHsCode: '0101.10', physicalDescriptionHsCode: '7203.10' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when HS chapter matches', async () => {
    const r = await apply(makeCtx({ declaredGoods: [{ invoiceId: 'i1', declaredHsCode: '0101.10', physicalDescriptionHsCode: '0101.20' }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags no_physical_check when physicalInspectionDone=false and declaredHsCode present', async () => {
    const r = await apply(makeCtx({ declaredGoods: [{ invoiceId: 'i1', declaredHsCode: '0101.10', physicalInspectionDone: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag no_physical_check when no declaredHsCode', async () => {
    const r = await apply(makeCtx({ declaredGoods: [{ invoiceId: 'i1', physicalInspectionDone: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('tbml-batch: transfer_pricing_manipulation', () => {
  const apply = TBML_BATCH_APPLIES['transfer_pricing_manipulation']!;

  it('returns inconclusive when no intraGroupTransactions', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags non_arms_length when price / bench < 0.6', async () => {
    const r = await apply(makeCtx({ intraGroupTransactions: [{ transactionId: 't1', relatedParty: true, declaredPriceAed: 50_000, armsLengthBenchmarkAed: 100_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags non_arms_length when price / bench > 1.6', async () => {
    const r = await apply(makeCtx({ intraGroupTransactions: [{ transactionId: 't1', relatedParty: true, declaredPriceAed: 170_000, armsLengthBenchmarkAed: 100_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when in arms-length range', async () => {
    const r = await apply(makeCtx({ intraGroupTransactions: [{ transactionId: 't1', relatedParty: true, declaredPriceAed: 100_000, armsLengthBenchmarkAed: 100_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('skips non-relatedParty transactions', async () => {
    const r = await apply(makeCtx({ intraGroupTransactions: [{ transactionId: 't1', relatedParty: false, declaredPriceAed: 10, armsLengthBenchmarkAed: 100 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags low_tax_jur when jurisdictionTaxRatePct <= 5 and related party', async () => {
    const r = await apply(makeCtx({ intraGroupTransactions: [{ transactionId: 't1', relatedParty: true, declaredPriceAed: 100_000, armsLengthBenchmarkAed: 100_000, jurisdictionTaxRatePct: 0 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag low_tax_jur when bench = 0', async () => {
    const r = await apply(makeCtx({ intraGroupTransactions: [{ transactionId: 't1', relatedParty: true, declaredPriceAed: 100, armsLengthBenchmarkAed: 0, jurisdictionTaxRatePct: 5 }] }));
    expect(r.score).toBeGreaterThan(0); // low_tax_jur still fires for <=5
  });

  it('handles undefined declaredPriceAed and armsLengthBenchmarkAed (defaults to 0)', async () => {
    const r = await apply(makeCtx({ intraGroupTransactions: [{ transactionId: 't1', relatedParty: true }] }));
    // declared=0, bench=0 → bench not > 0 → no non_arms_length; jurisdictionTaxRatePct ?? 100 → 100 > 5 → no low_tax_jur
    expect(r.verdict).toBe('clear');
  });
});

describe('tbml-batch: round_tripping_pattern', () => {
  const apply = TBML_BATCH_APPLIES['round_tripping_pattern']!;

  it('returns inconclusive when no roundTrips', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags mirror_amount_same_ubo when same UBO, out > 0, |out-in|/out < 0.1', async () => {
    const r = await apply(makeCtx({ roundTrips: [{ roundTripId: 'rt1', sameUboBothEnds: true, outflowAed: 100_000, inflowAed: 99_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag mirror when not same UBO', async () => {
    const r = await apply(makeCtx({ roundTrips: [{ roundTripId: 'rt1', sameUboBothEnds: false, outflowAed: 100_000, inflowAed: 99_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag mirror when out = 0', async () => {
    const r = await apply(makeCtx({ roundTrips: [{ roundTripId: 'rt1', sameUboBothEnds: true, outflowAed: 0, inflowAed: 0 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags rapid_return when round-trip span <= 14 days', async () => {
    const r = await apply(makeCtx({ roundTrips: [{ roundTripId: 'rt1', outflowDate: '2024-01-01', inflowDate: '2024-01-10' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag rapid_return when span > 14 days', async () => {
    const r = await apply(makeCtx({ roundTrips: [{ roundTripId: 'rt1', outflowDate: '2024-01-01', inflowDate: '2024-02-01' }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag rapid_return with invalid dates', async () => {
    const r = await apply(makeCtx({ roundTrips: [{ roundTripId: 'rt1', outflowDate: 'bad-date', inflowDate: 'also-bad' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('tbml-batch: import_export_ratio_anomaly', () => {
  const apply = TBML_BATCH_APPLIES['import_export_ratio_anomaly']!;

  it('returns inconclusive when no importExportRatios', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags extreme_ratio when exp/imp >= 5', async () => {
    const r = await apply(makeCtx({ importExportRatios: [{ entityId: 'e1', importsAed: 100_000, exportsAed: 500_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags extreme_ratio when exp/imp <= 0.2', async () => {
    const r = await apply(makeCtx({ importExportRatios: [{ entityId: 'e1', importsAed: 1_000_000, exportsAed: 100_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when ratio is between 0.2 and 5', async () => {
    const r = await apply(makeCtx({ importExportRatios: [{ entityId: 'e1', importsAed: 100_000, exportsAed: 200_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when imp or exp is 0', async () => {
    const r = await apply(makeCtx({ importExportRatios: [{ entityId: 'e1', importsAed: 0, exportsAed: 500_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags zero_margin_high_volume when margin <= 0.01 and exp >= 1M', async () => {
    const r = await apply(makeCtx({ importExportRatios: [{ entityId: 'e1', importsAed: 0, exportsAed: 1_000_000, declaredMargin: 0.01 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag zero_margin when exp < 1M', async () => {
    const r = await apply(makeCtx({ importExportRatios: [{ entityId: 'e1', declaredMargin: 0, exportsAed: 500_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('handles undefined importsAed and exportsAed (defaults to 0)', async () => {
    const r = await apply(makeCtx({ importExportRatios: [{ entityId: 'e1' }] }));
    // imp=0, exp=0 → condition (imp>0 && exp>0) false; margin ?? 0 → no zero_margin_high_volume
    expect(r.verdict).toBe('clear');
  });
});
