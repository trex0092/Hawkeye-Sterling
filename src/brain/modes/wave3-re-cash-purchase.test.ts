import { describe, expect, it } from 'vitest';
import reCashPurchaseCheckApply from './wave3-re-cash-purchase.js';
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

describe('wave3-re-cash-purchase', () => {
  it('returns inconclusive when no realEstateTransactions', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('re_cash_purchase_check');
  });

  it('returns inconclusive when realEstateTransactions is empty', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({ realEstateTransactions: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when cash below both thresholds', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 10_000, propertyValueAed: 500_000 }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags cash_flag when cash >= 55000 but < 100000', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 55_000, propertyValueAed: 1_000_000 }],
    }));
    expect(r.verdict).toBe('flag');
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates cash_escalate when cash >= 100000', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 100_000, propertyValueAed: 500_000 }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags cash_pct_flag when cashPct >= 50% but < 80%', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 25_000, propertyValueAed: 50_000 }],
    }));
    // 50% cash — flag level
    expect(r.verdict).toBe('flag');
  });

  it('escalates cash_pct_escalate when cashPct >= 80%', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 40_000, propertyValueAed: 50_000 }],
    }));
    // 80% cash — escalate
    expect(r.verdict).toBe('escalate');
  });

  it('derives total from cash + financing when propertyValueAed missing', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 80_000, financingComponentAed: 20_000 }],
    }));
    // total = max(100000, 1) = 100000; pct = 80% → escalate on pct
    expect(r.verdict).toBe('escalate');
  });

  it('handles zero total gracefully (cashPct = 0)', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 0, propertyValueAed: 0 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalate overrides flag in highestVerdict', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [
        { txnId: 't1', cashComponentAed: 55_000, propertyValueAed: 1_000_000 }, // flag
        { txnId: 't2', cashComponentAed: 100_000, propertyValueAed: 200_000 },  // escalate
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('uses (unidentified) when txnId missing', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ cashComponentAed: 100_000, propertyValueAed: 200_000 }],
    }));
    expect(r.evidence[0]).toBe('(unidentified)');
  });

  it('includes detail signals in rationale', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 'T1', cashComponentAed: 100_000, propertyValueAed: 200_000 }],
    }));
    expect(r.rationale).toContain('Signals:');
  });

  it('returns all-under-threshold message when no hits', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 1_000, propertyValueAed: 100_000 }],
    }));
    expect(r.rationale).toContain('all under cash thresholds');
  });

  it('highestVerdict stays escalate when second txn hits flag range (false branch of highestVerdict===clear)', async () => {
    // t1: cash >= 100k → escalate; t2: cash in flag range → tries to set flag but highestVerdict already escalate
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [
        { txnId: 't1', cashComponentAed: 100_000, propertyValueAed: 1_000_000 }, // escalate
        { txnId: 't2', cashComponentAed: 75_000, propertyValueAed: 1_000_000 },  // flag-range cash; hits line 63 false branch
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('handles missing cashComponentAed (defaults to 0)', async () => {
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', propertyValueAed: 500_000 }],
    }));
    // cash = 0, cashPct = 0 → clear
    expect(r.verdict).toBe('clear');
  });

  it('derives total from cash only when both propertyValueAed and financingComponentAed missing', async () => {
    // cash=200k, financing=undefined → total = max(200k, 1) = 200k; pct = 100% → escalate
    const r = await reCashPurchaseCheckApply(makeCtx({
      realEstateTransactions: [{ txnId: 't1', cashComponentAed: 200_000 }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});
