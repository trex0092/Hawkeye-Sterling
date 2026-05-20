import { describe, expect, it } from 'vitest';
import dpmsStructuringApply from './wave3-dpms-structuring.js';
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

describe('wave3-dpms-structuring', () => {
  it('returns inconclusive when no dpmsTransactions supplied', async () => {
    const r = await dpmsStructuringApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('dpms_cash_structuring_split');
  });

  it('returns inconclusive when dpmsTransactions is empty', async () => {
    const r = await dpmsStructuringApply(makeCtx({ dpmsTransactions: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 30000, channel: 'wire' },
      ],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags threshold_band_cash_density when >= 3 cash txns in AED 45-55k band', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 45000, channel: 'cash' },
        { txnId: 't2', amountAed: 50000, channel: 'cash' },
        { txnId: 't3', amountAed: 54999, channel: 'cash' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag threshold_band_cash_density when < 3 in-band txns', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 45000, channel: 'cash' },
        { txnId: 't2', amountAed: 50000, channel: 'cash' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('counts cash_courier channel in band', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 45000, channel: 'cash_courier' },
        { txnId: 't2', amountAed: 50000, channel: 'cash_courier' },
        { txnId: 't3', amountAed: 54000, channel: 'cash_courier' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not count non-cash channels in band', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 45000, channel: 'wire' },
        { txnId: 't2', amountAed: 50000, channel: 'card' },
        { txnId: 't3', amountAed: 54000, channel: 'crypto' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('does not count amounts below band (< 45k)', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 44999, channel: 'cash' },
        { txnId: 't2', amountAed: 44999, channel: 'cash' },
        { txnId: 't3', amountAed: 44999, channel: 'cash' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('does not count amounts >= 55k', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 55000, channel: 'cash' },
        { txnId: 't2', amountAed: 55000, channel: 'cash' },
        { txnId: 't3', amountAed: 55000, channel: 'cash' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('flags same_customer_split when same customer >= 3 in-band in <= 30 days', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 48000, channel: 'cash', customerId: 'C1', at: '2024-01-01T00:00:00Z' },
        { txnId: 't2', amountAed: 50000, channel: 'cash', customerId: 'C1', at: '2024-01-10T00:00:00Z' },
        { txnId: 't3', amountAed: 52000, channel: 'cash', customerId: 'C1', at: '2024-01-20T00:00:00Z' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag same_customer_split when span > 30 days', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 48000, channel: 'cash', customerId: 'C2', at: '2024-01-01T00:00:00Z' },
        { txnId: 't2', amountAed: 50000, channel: 'cash', customerId: 'C2', at: '2024-02-05T00:00:00Z' },
        { txnId: 't3', amountAed: 52000, channel: 'cash', customerId: 'C2', at: '2024-02-10T00:00:00Z' },
      ],
    }));
    // first to last = 40 days > 30 → same_customer_split does NOT fire
    // however, threshold_band_cash_density (0.35) DOES fire for 3 in-band txns
    expect(r.score).toBeGreaterThan(0); // threshold_band fires
    // verify same_customer_split specifically did not fire (check evidence)
    const hasSameCustomer = r.evidence.some((e) => e.includes('C2'));
    // threshold_band_cash_density includes txnIds not customer IDs in evidence
    // the same-customer check produces evidence like "C2 (3 txns)"
    expect(hasSameCustomer).toBe(false);
  });

  it('skips same_customer_split for unknown customerId', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 48000, channel: 'cash', at: '2024-01-01T00:00:00Z' },
        { txnId: 't2', amountAed: 50000, channel: 'cash', at: '2024-01-10T00:00:00Z' },
        { txnId: 't3', amountAed: 52000, channel: 'cash', at: '2024-01-15T00:00:00Z' },
      ],
    }));
    // no customerId → uses 'unknown' → skipped in same-customer check
    // threshold_band_cash_density fires (3 in band)
    expect(r.score).toBeGreaterThan(0); // threshold_band fires
  });

  it('does not flag same_customer_split when fewer than 3 in-band for that customer', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 48000, channel: 'cash', customerId: 'C3', at: '2024-01-01T00:00:00Z' },
        { txnId: 't2', amountAed: 50000, channel: 'cash', customerId: 'C3', at: '2024-01-05T00:00:00Z' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('flags rapid_resale when >= 2 txns have rapidResaleDays <= 30', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'wire', rapidResaleDays: 7 },
        { txnId: 't2', amountAed: 10000, channel: 'wire', rapidResaleDays: 14 },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag rapid_resale with only 1 qualifying txn', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'wire', rapidResaleDays: 7 },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('does not count txns with rapidResaleDays > 30 for rapid_resale', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'wire', rapidResaleDays: 31 },
        { txnId: 't2', amountAed: 10000, channel: 'wire', rapidResaleDays: 60 },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('uses Infinity for missing rapidResaleDays (> 30)', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'wire' }, // no rapidResaleDays
        { txnId: 't2', amountAed: 10000, channel: 'wire' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('flags third_party_settlement when >= 2 txns have thirdPartySettlement = true', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'wire', thirdPartySettlement: true },
        { txnId: 't2', amountAed: 10000, channel: 'wire', thirdPartySettlement: true },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag third_party_settlement with only 1 qualifying txn', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'wire', thirdPartySettlement: true },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('flags bullion_as_currency when >= 2 txns have goldGrams >= 100 and cash channel', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'cash', goldGrams: 100 },
        { txnId: 't2', amountAed: 10000, channel: 'cash', goldGrams: 200 },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag bullion_as_currency when goldGrams < 100', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 10000, channel: 'cash', goldGrams: 99 },
        { txnId: 't2', amountAed: 10000, channel: 'cash', goldGrams: 50 },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when multiple signals accumulate above 0.6', async () => {
    const r = await dpmsStructuringApply(makeCtx({
      dpmsTransactions: [
        { txnId: 't1', amountAed: 48000, channel: 'cash', thirdPartySettlement: true, rapidResaleDays: 5 },
        { txnId: 't2', amountAed: 50000, channel: 'cash', thirdPartySettlement: true, rapidResaleDays: 10 },
        { txnId: 't3', amountAed: 52000, channel: 'cash' },
      ],
    }));
    // threshold_band (0.35) + third_party (0.25) + rapid_resale (0.2) = 0.8 → escalate
    expect(r.verdict).toBe('escalate');
  });
});
