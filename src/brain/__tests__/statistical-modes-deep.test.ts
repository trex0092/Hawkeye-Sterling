// Deep coverage tests for modes/statistical.ts
// Covers: frequentist, chi_square, entropy, hypothesis_test,
//         confidence_interval, bayesian_network, causal_inference.

import { describe, it, expect } from 'vitest';
import { STATISTICAL_MODE_APPLIES } from '../modes/statistical.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: ['statistical'],
  };
}

/** Build a transaction list with n items, optionally marking some as suspicious. */
function buildTxs(
  n: number,
  opts: {
    flagRate?: number;    // fraction to mark suspicious (default 0)
    hrjurRate?: number;  // fraction to mark high-risk jurisdiction (default 0)
    amount?: number;     // fixed amount (default 1000)
    counterparty?: (i: number) => string;
  } = {},
): Record<string, unknown>[] {
  const { flagRate = 0, hrjurRate = 0, amount = 1000, counterparty } = opts;
  return Array.from({ length: n }, (_, i) => ({
    id: `tx-${i}`,
    amount: amount,
    suspicious: i < Math.floor(n * flagRate),
    highRiskJurisdiction: i < Math.floor(n * hrjurRate),
    counterparty: counterparty ? counterparty(i) : `cp-${i % 5}`,
  }));
}

// ── frequentist ───────────────────────────────────────────────────────────────

describe('frequentist', () => {
  const apply = STATISTICAL_MODE_APPLIES.frequentist;

  it('returns inconclusive when fewer than 5 transactions', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(3) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('frequentist');
  });

  it('returns inconclusive when transactions absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when flag rate is at baseline (5%)', async () => {
    // 0% suspicious → z is negative → clear
    const f = await apply(makeCtx({ transactions: buildTxs(50) }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when flag rate significantly exceeds baseline (z > 1.64)', async () => {
    // 50% suspicious over 50 transactions → z >> 1.64
    const f = await apply(makeCtx({ transactions: buildTxs(50, { flagRate: 0.5 }) }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when flag rate extremely high (z > 2.58)', async () => {
    // 80% suspicious → z way above 2.58
    const f = await apply(makeCtx({ transactions: buildTxs(100, { flagRate: 0.8 }) }));
    expect(f.verdict).toBe('escalate');
  });

  it('recognises flagged field as well as suspicious', async () => {
    const txs = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-${i}`,
      amount: 1000,
      flagged: i < 15, // 75% flagged
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('recognises score > 0.5 as a flag signal', async () => {
    const txs = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-${i}`,
      amount: 1000,
      score: i < 15 ? 0.9 : 0.2, // 75% with high score
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(20, { flagRate: 0.3 }) }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── chi_square ────────────────────────────────────────────────────────────────

describe('chi_square', () => {
  const apply = STATISTICAL_MODE_APPLIES.chi_square;

  it('returns inconclusive when fewer than 20 transactions', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(10) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('chi_square');
  });

  it('returns inconclusive when transactions absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('returns inconclusive when degenerate 2x2 (no marginal variance)', async () => {
    // All low-risk, none suspicious → c=0, d=20, a=0, b=0 → degenerate
    const txs = buildTxs(20, { flagRate: 0, hrjurRate: 0 });
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('flags when chi2 > 3.84 (α=0.05 critical)', async () => {
    // Need non-degenerate contingency table with association
    // a (hr+sus), b (hr+ok), c (lr+sus), d (lr+ok)
    // Strong association: all high-risk txs are suspicious, all low-risk are not
    const txs = [
      ...Array.from({ length: 15 }, () => ({ id: 'hr-sus', amount: 1000, suspicious: true, highRiskJurisdiction: true })),
      ...Array.from({ length: 15 }, () => ({ id: 'lr-ok', amount: 1000, suspicious: false, highRiskJurisdiction: false })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('escalates when chi2 > 10.83 (α=0.001)', async () => {
    // Very strong association in large sample
    const txs = [
      ...Array.from({ length: 80 }, () => ({ id: 'hr-sus', amount: 1000, suspicious: true, highRiskJurisdiction: true })),
      ...Array.from({ length: 80 }, () => ({ id: 'lr-ok', amount: 1000, suspicious: false, highRiskJurisdiction: false })),
      ...Array.from({ length: 5 }, () => ({ id: 'hr-ok', amount: 1000, suspicious: false, highRiskJurisdiction: true })),
      ...Array.from({ length: 5 }, () => ({ id: 'lr-sus', amount: 1000, suspicious: true, highRiskJurisdiction: false })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('escalate');
  });

  it('score is in [0, 1]', async () => {
    const txs = buildTxs(20, { flagRate: 0.3, hrjurRate: 0.5 });
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── entropy ───────────────────────────────────────────────────────────────────

describe('entropy', () => {
  const apply = STATISTICAL_MODE_APPLIES.entropy;

  it('returns inconclusive when fewer than 5 transactions', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(3) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('entropy');
  });

  it('returns inconclusive when transactions absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('flags when counterparty distribution is highly concentrated', async () => {
    // All 20 txs to the same counterparty → H = 0 → normalised = 0 → flag
    const txs = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: 'single-cp',
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
  });

  it('clears when counterparty distribution is diverse', async () => {
    // 20 txs to 20 distinct counterparties → H = Hmax → normalised = 1
    const txs = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: `unique-cp-${i}`,
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('clear');
  });

  it('uses peer/to fields as fallback for counterparty', async () => {
    // All 10 txs go to the same peer → entropy = 0 → normalised = 0 → flag
    const txs = Array.from({ length: 10 }, (_, i) => ({
      id: `tx-${i}`,
      peer: 'single-peer',
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    // H = 0 → normalised = 0 → below 0.35 threshold → flag
    expect(f.verdict).toBe('flag');
  });

  it('score is in [0, 1]', async () => {
    const txs = buildTxs(10);
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── hypothesis_test ───────────────────────────────────────────────────────────

describe('hypothesis_test', () => {
  const apply = STATISTICAL_MODE_APPLIES.hypothesis_test;

  it('returns inconclusive when fewer than 10 amounts', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(5) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('hypothesis_test');
  });

  it('returns inconclusive when transactions absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('flags when all amounts are identical (zero variance = structuring)', async () => {
    const txs = Array.from({ length: 15 }, () => ({ id: 'tx', amount: 9999 }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
    expect(f.rationale).toMatch(/zero variance/i);
  });

  it('clears for normal variance in amounts', async () => {
    const txs = Array.from({ length: 15 }, (_, i) => ({ id: `tx-${i}`, amount: 500 + i * 100 }));
    const f = await apply(makeCtx({ transactions: txs }));
    // Normal amounts → clear
    expect(f.verdict).toBe('clear');
  });

  it('score is in [0, 1]', async () => {
    const txs = Array.from({ length: 10 }, (_, i) => ({ id: `tx-${i}`, amount: 1000 + i }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── confidence_interval ───────────────────────────────────────────────────────

describe('confidence_interval', () => {
  const apply = STATISTICAL_MODE_APPLIES.confidence_interval;

  it('returns inconclusive when fewer than 5 transactions', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(3) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('confidence_interval');
  });

  it('returns inconclusive when transactions absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when lower CI bound is below 10%', async () => {
    // 0% flagged → CI lower bound = 0 → clear
    const f = await apply(makeCtx({ transactions: buildTxs(50) }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when lower CI bound exceeds 10%', async () => {
    // 80% flagged → CI lower bound >> 10% → flag
    const f = await apply(makeCtx({ transactions: buildTxs(50, { flagRate: 0.8 }) }));
    expect(f.verdict).toBe('flag');
  });

  it('rationale includes Wilson CI percentages', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(20, { flagRate: 0.3 }) }));
    expect(f.rationale).toMatch(/Wilson/i);
    expect(f.rationale).toMatch(/%/);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(20, { flagRate: 0.5 }) }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── bayesian_network ──────────────────────────────────────────────────────────

describe('bayesian_network', () => {
  const apply = STATISTICAL_MODE_APPLIES.bayesian_network;

  it('returns inconclusive when fewer than 10 transactions', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(5) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('bayesian_network');
  });

  it('returns inconclusive when transactions absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('returns inconclusive when one cohort is empty (all same jurisdiction)', async () => {
    // All are high-risk → lr = 0 → one cohort empty
    const txs = buildTxs(15, { flagRate: 0.3, hrjurRate: 1.0 });
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when lift is below 3 (no meaningful association)', async () => {
    // Mix of hr/lr with similar flag rates
    const txs = [
      ...Array.from({ length: 10 }, () => ({ id: 'hr', suspicious: true, highRiskJurisdiction: true, amount: 1000 })),
      ...Array.from({ length: 10 }, () => ({ id: 'lr', suspicious: true, highRiskJurisdiction: false, amount: 1000 })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    // P(hit|hr) = 1.0, P(hit|lr) = 1.0 → lift = 1 → clear
    expect(f.verdict).toBe('clear');
  });

  it('flags when high-risk jurisdiction dramatically raises hit probability (lift > 3)', async () => {
    // hr: all suspicious; lr: none suspicious → lift = Infinity → flag
    const txs = [
      ...Array.from({ length: 10 }, () => ({ id: 'hr', suspicious: true, highRiskJurisdiction: true, amount: 1000 })),
      ...Array.from({ length: 10 }, () => ({ id: 'lr', suspicious: false, highRiskJurisdiction: false, amount: 1000 })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
  });

  it('score is in [0, 1]', async () => {
    const txs = [
      ...Array.from({ length: 10 }, () => ({ suspicious: true, highRiskJurisdiction: true, amount: 1000 })),
      ...Array.from({ length: 10 }, () => ({ suspicious: false, highRiskJurisdiction: false, amount: 1000 })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });

  it('attaches likelihoodRatios when lift > 1', async () => {
    const txs = [
      ...Array.from({ length: 10 }, () => ({ suspicious: true, highRiskJurisdiction: true, amount: 1000 })),
      ...Array.from({ length: 10 }, () => ({ suspicious: false, highRiskJurisdiction: false, amount: 1000 })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.likelihoodRatios).toBeDefined();
    expect(f.likelihoodRatios!.length).toBeGreaterThan(0);
  });
});

// ── causal_inference ──────────────────────────────────────────────────────────

describe('causal_inference', () => {
  const apply = STATISTICAL_MODE_APPLIES.causal_inference;

  it('returns inconclusive when fewer than 10 transactions', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(5) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('causal_inference');
  });

  it('returns inconclusive when transactions absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('returns inconclusive when treated cohort is too small (< 3)', async () => {
    // Only 1 flagged transaction out of 20
    const txs = [
      { id: 'sus-1', amount: 50000, suspicious: true },
      ...Array.from({ length: 19 }, (_, i) => ({ id: `ok-${i}`, amount: 1000, suspicious: false })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when ATE is small (treatment and control have similar means)', async () => {
    const txs = [
      ...Array.from({ length: 5 }, () => ({ amount: 1000, suspicious: true })),
      ...Array.from({ length: 10 }, () => ({ amount: 1010, suspicious: false })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    // ATE ≈ -10 with low variance → |t| should be small → clear
    expect(f.verdict).toBe('clear');
  });

  it('flags when flagged transactions have dramatically different amounts (|t| > 2)', async () => {
    // treated: mean = 100_000; control: mean = 1000 with low variance
    const txs = [
      ...Array.from({ length: 5 }, (_, i) => ({ amount: 100_000 + i, suspicious: true, flagged: true })),
      ...Array.from({ length: 10 }, (_, i) => ({ amount: 1000 + i, suspicious: false })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
  });

  it('score is in [0, 1]', async () => {
    const txs = [
      ...Array.from({ length: 5 }, () => ({ amount: 50000, suspicious: true })),
      ...Array.from({ length: 10 }, () => ({ amount: 1000, suspicious: false })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});
