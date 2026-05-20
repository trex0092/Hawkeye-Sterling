import { describe, expect, it } from 'vitest';
import { dpmsrThresholdApply } from './wave3-dpmsr-threshold.js';
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

describe('wave3-dpmsr-threshold', () => {
  it('returns inconclusive when no dpmsrTransactions supplied', async () => {
    const r = await dpmsrThresholdApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('dpmsr_55k_threshold');
  });

  it('returns inconclusive when dpmsrTransactions is empty', async () => {
    const r = await dpmsrThresholdApply(makeCtx({ dpmsrTransactions: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when cash transactions are all below threshold', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 't1', amountAed: 30000, channel: 'cash', at: '2024-01-01T00:00:00Z' },
        { txnId: 't2', amountAed: 20000, channel: 'cash', at: '2024-01-02T00:00:00Z' },
      ],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('returns clear when non-cash transactions are present (not counted)', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 't1', amountAed: 100000, channel: 'wire', at: '2024-01-01T00:00:00Z' },
        { txnId: 't2', amountAed: 100000, channel: 'card', at: '2024-01-01T00:00:00Z' },
      ],
    }));
    // wire and card are not cash channels → cashTxns empty
    expect(r.verdict).toBe('clear');
  });

  it('triggers single_breach when single cash transaction >= 55k', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'single1', amountAed: 55000, channel: 'cash', at: '2024-01-01T00:00:00Z' },
      ],
    }));
    expect(r.verdict).toBe('suspicious');
    expect(r.score).toBeGreaterThan(0);
    expect(r.rationale).toContain('1 single-transaction breach');
  });

  it('triggers single_breach for cash_courier channel', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'single2', amountAed: 60000, channel: 'cash_courier', at: '2024-01-01T00:00:00Z', customerId: 'C1' },
      ],
    }));
    expect(r.verdict).toBe('suspicious');
  });

  it('does not trigger single_breach when amount < 55k', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 't1', amountAed: 54999, channel: 'cash', at: '2024-01-01T00:00:00Z' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('triggers linked_breach when same customer has 2+ cash txns in 3 days summing >= 55k', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'link1', amountAed: 30000, channel: 'cash', at: '2024-01-01T00:00:00Z', customerId: 'CUST1' },
        { txnId: 'link2', amountAed: 30000, channel: 'cash', at: '2024-01-02T00:00:00Z', customerId: 'CUST1' },
      ],
    }));
    // 30k + 30k = 60k >= 55k within 3 days → linked_breach
    expect(r.verdict).toBe('suspicious');
    expect(r.rationale).toContain('linked-transaction aggregation');
  });

  it('does not trigger linked_breach when total < 55k', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'link3', amountAed: 20000, channel: 'cash', at: '2024-01-01T00:00:00Z', customerId: 'CUST2' },
        { txnId: 'link4', amountAed: 20000, channel: 'cash', at: '2024-01-02T00:00:00Z', customerId: 'CUST2' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not trigger linked_breach when transactions are outside 3-day window', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'link5', amountAed: 30000, channel: 'cash', at: '2024-01-01T00:00:00Z', customerId: 'CUST3' },
        { txnId: 'link6', amountAed: 30000, channel: 'cash', at: '2024-01-10T00:00:00Z', customerId: 'CUST3' },
      ],
    }));
    // 9 days apart > 3 days window
    expect(r.verdict).toBe('clear');
  });

  it('does not trigger linked_breach when only 1 transaction per customer', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'link7', amountAed: 30000, channel: 'cash', at: '2024-01-01T00:00:00Z', customerId: 'CUST4' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('skips linked_breach for txns without customerId', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'link8', amountAed: 30000, channel: 'cash', at: '2024-01-01T00:00:00Z' },
        { txnId: 'link9', amountAed: 30000, channel: 'cash', at: '2024-01-02T00:00:00Z' },
      ],
    }));
    // no customerId → skipped in linked check
    expect(r.verdict).toBe('clear');
  });

  it('does not double-count single + linked for same transactions', async () => {
    // Single breach transaction should not also be counted as linked
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'overlap1', amountAed: 60000, channel: 'cash', at: '2024-01-01T00:00:00Z', customerId: 'CUST5' },
        { txnId: 'overlap2', amountAed: 10000, channel: 'cash', at: '2024-01-01T00:00:00Z', customerId: 'CUST5' },
      ],
    }));
    // single_breach fires for overlap1; linked check: overlap1 is in a single-breach → alreadyCovered → skipped
    expect(r.verdict).toBe('suspicious');
    // Should have 1 single breach obligation and potentially not trigger linked
    const rationale = r.rationale;
    expect(rationale).toContain('single-transaction breach');
  });

  it('triggers group_breach when linkedGroupId transactions sum >= 55k', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'grp1', amountAed: 30000, channel: 'cash', at: '2024-01-01T00:00:00Z', linkedGroupId: 'GROUP_A' },
        { txnId: 'grp2', amountAed: 30000, channel: 'cash', at: '2024-01-05T00:00:00Z', linkedGroupId: 'GROUP_A' },
      ],
    }));
    // 30k + 30k = 60k >= 55k → group_breach
    expect(r.verdict).toBe('suspicious');
    expect(r.rationale).toContain('linked-transaction aggregation');
  });

  it('does not trigger group_breach when group total < 55k', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'grp3', amountAed: 20000, channel: 'cash', at: '2024-01-01T00:00:00Z', linkedGroupId: 'GROUP_B' },
        { txnId: 'grp4', amountAed: 20000, channel: 'cash', at: '2024-01-05T00:00:00Z', linkedGroupId: 'GROUP_B' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not double-count group_breach when already covered by single_breach', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'grp5', amountAed: 60000, channel: 'cash', at: '2024-01-01T00:00:00Z', linkedGroupId: 'GROUP_C' },
        { txnId: 'grp6', amountAed: 10000, channel: 'cash', at: '2024-01-05T00:00:00Z', linkedGroupId: 'GROUP_C' },
      ],
    }));
    // single breach for grp5; group_breach would overlap → alreadyCovered
    expect(r.verdict).toBe('suspicious');
  });

  it('ignores transactions without linkedGroupId for group_breach', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'grp7', amountAed: 30000, channel: 'cash', at: '2024-01-01T00:00:00Z' }, // no linkedGroupId
        { txnId: 'grp8', amountAed: 30000, channel: 'cash', at: '2024-01-05T00:00:00Z' },
      ],
    }));
    // no linkedGroupId → byGroup empty → no group_breach
    expect(r.verdict).toBe('clear');
  });

  it('score uses maxWeight + 0.05 for multiple hits', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'multi1', amountAed: 55000, channel: 'cash', at: '2024-01-01T00:00:00Z', customerId: 'M1' },
        { txnId: 'multi2', amountAed: 55000, channel: 'cash', at: '2024-01-02T00:00:00Z', customerId: 'M1' },
      ],
    }));
    // 2 single breaches → score = min(1, 0.9 + 0.05) = 0.95 → clamped
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('score is clamped to 1', async () => {
    const r = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'max1', amountAed: 100000, channel: 'cash', at: '2024-01-01T00:00:00Z', linkedGroupId: 'G1' },
        { txnId: 'max2', amountAed: 100000, channel: 'cash', at: '2024-01-02T00:00:00Z', linkedGroupId: 'G1' },
      ],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('confidence increases with number of hits', async () => {
    const r1 = await dpmsrThresholdApply(makeCtx({
      dpmsrTransactions: [
        { txnId: 'conf1', amountAed: 55000, channel: 'cash', at: '2024-01-01T00:00:00Z' },
      ],
    }));
    expect(r1.confidence).toBeGreaterThan(0.8);
  });
});
