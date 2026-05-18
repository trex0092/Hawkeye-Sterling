// Deep coverage tests for modes/behavioral.ts
// Covers: all five modes' null-guard / insufficient-data paths AND main logic paths:
//   velocity_analysis, spike_detection, pattern_of_life, peer_group_anomaly, regime_change.

import { describe, it, expect } from 'vitest';
import { BEHAVIORAL_MODE_APPLIES } from '../modes/behavioral.js';
import type { BrainContext } from '../types.js';

// ── ctx builder ───────────────────────────────────────────────────────────────

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: ['cdd'],
  };
}

/** Build an array of transaction objects with timestamps spread uniformly. */
function buildTxs(count: number, baseDate = '2026-01-01', intervalDays = 1): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i * intervalDays);
    return { timestamp: d.toISOString(), amount: 1000 + i * 10 };
  });
}

/** Build transactions with a velocity spike in the second half. */
function buildSpikeTxs(n: number): Record<string, unknown>[] {
  // First half: sparse (1 per 7 days); second half: dense (1 per day).
  const txs: Record<string, unknown>[] = [];
  let day = 0;
  // First half: n/2 transactions spaced 7 days apart.
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const d = new Date('2026-01-01');
    d.setUTCDate(d.getUTCDate() + day);
    txs.push({ timestamp: d.toISOString(), amount: 1000 });
    day += 7;
  }
  // Second half: n/2 transactions on consecutive days.
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    const d = new Date('2026-01-01');
    d.setUTCDate(d.getUTCDate() + day);
    txs.push({ timestamp: d.toISOString(), amount: 1000 });
    day += 1;
  }
  return txs;
}

// ── velocity_analysis ─────────────────────────────────────────────────────────

describe('velocity_analysis', () => {
  const apply = BEHAVIORAL_MODE_APPLIES.velocity_analysis;

  it('returns inconclusive with < 10 timestamped transactions', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(5) }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('velocity_analysis');
  });

  it('returns inconclusive when transactions is absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('returns inconclusive when transactions is not an array', async () => {
    const f = await apply(makeCtx({ transactions: 'bad' }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('returns clear when velocity is uniform (no spike)', async () => {
    // Uniform: 20 transactions, 1 per day.
    const f = await apply(makeCtx({ transactions: buildTxs(20) }));
    expect(f.verdict).toBe('clear');
  });

  it('returns flag or escalate when velocity doubles in second half', async () => {
    const f = await apply(makeCtx({ transactions: buildSpikeTxs(20) }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({ transactions: buildTxs(20) }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── spike_detection ────────────────────────────────────────────────────────────

describe('spike_detection', () => {
  const apply = BEHAVIORAL_MODE_APPLIES.spike_detection;

  it('returns inconclusive with < 10 amounts', async () => {
    const ctx = makeCtx({ transactions: [{ amount: 100 }, { amount: 200 }] });
    expect((await apply(ctx)).verdict).toBe('inconclusive');
  });

  it('returns inconclusive when transactions is absent', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('returns clear when all amounts are uniform', async () => {
    const txs = Array.from({ length: 20 }, () => ({ amount: 1000 }));
    const f = await apply(makeCtx({ transactions: txs }));
    // No outliers → clear.
    expect(f.verdict).toBe('clear');
  });

  it('scores are in valid range when applied to real transaction data', async () => {
    // The spike detector uses rolling MAD (window=7). It requires past values
    // to have non-zero variance for z/MAD scores to fire.
    // Use amounts with natural variation so the scorer can operate.
    const txs = Array.from({ length: 20 }, (_, i) => ({
      amount: 1000 + Math.sin(i) * 200 + i * 5,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    // Result must be a valid verdict (not throw).
    expect(['clear', 'flag', 'escalate', 'inconclusive']).toContain(f.verdict);
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });

  it('escalates when a large fraction of amounts are extreme outliers (high z-score)', async () => {
    // Use a dataset where the past window has variance, so outliers are detected.
    // Past values oscillate between 100–900, then a spike at 1M.
    // The spike detection requires enough entries with variance to build a baseline.
    const base = Array.from({ length: 14 }, (_, i) => ({
      amount: 100 + (i % 8) * 100,  // 100, 200, ..., 800, 100, ...
    }));
    // Add 6 extreme outliers to make hit rate > 15% of total 20 txs.
    const spikes = Array.from({ length: 6 }, () => ({ amount: 1_000_000 }));
    const txs = [...base, ...spikes];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(['flag', 'escalate']).toContain(f.verdict);
  });

  it('score is in [0, 1]', async () => {
    const txs = Array.from({ length: 20 }, (_, i) => ({ amount: 1000 + i }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── pattern_of_life ────────────────────────────────────────────────────────────

describe('pattern_of_life', () => {
  const apply = BEHAVIORAL_MODE_APPLIES.pattern_of_life;

  it('returns inconclusive with < 6 events', async () => {
    const ctx = makeCtx({ transactions: buildTxs(4) });
    expect((await apply(ctx)).verdict).toBe('inconclusive');
  });

  it('returns inconclusive when transactions is absent', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('flags suspiciously regular intervals (bot-like activity)', async () => {
    // Exactly 1-hour apart: CV = 0 → flag.
    const txs = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString(),
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
  });

  it('returns clear for human-like irregular intervals', async () => {
    // Random-ish intervals.
    const base = Date.UTC(2026, 0, 1);
    const gaps = [10, 62, 5, 180, 3, 90, 45, 600, 1]; // minutes
    let t = base;
    const txs = gaps.map((g) => {
      t += g * 60_000;
      return { timestamp: new Date(t).toISOString() };
    });
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('clear');
  });
});

// ── peer_group_anomaly ────────────────────────────────────────────────────────

describe('peer_group_anomaly', () => {
  const apply = BEHAVIORAL_MODE_APPLIES.peer_group_anomaly;

  it('returns inconclusive when subject transactions < 3', async () => {
    const ctx = makeCtx({
      transactions: [{ amount: 100 }],
      peerGroup: Array.from({ length: 20 }, () => ({ amount: 100 })),
    });
    expect((await apply(ctx)).verdict).toBe('inconclusive');
  });

  it('returns inconclusive when peer data < 10', async () => {
    const ctx = makeCtx({
      transactions: Array.from({ length: 10 }, () => ({ amount: 100 })),
      peerGroup: [{ amount: 100 }],
    });
    expect((await apply(ctx)).verdict).toBe('inconclusive');
  });

  it('returns inconclusive when both are absent', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('returns inconclusive when peer variance is zero', async () => {
    const ctx = makeCtx({
      transactions: Array.from({ length: 5 }, () => ({ amount: 500 })),
      peerGroup: Array.from({ length: 15 }, () => ({ amount: 100 })), // all same → sd=0
    });
    const f = await apply(ctx);
    expect(f.verdict).toBe('inconclusive');
  });

  it('returns clear when subject is close to peer group mean', async () => {
    const ctx = makeCtx({
      transactions: Array.from({ length: 10 }, () => ({ amount: 1000 })),
      peerGroup: Array.from({ length: 20 }, (_, i) => ({ amount: 900 + i * 10 })), // mean~1000, sd~60
    });
    const f = await apply(ctx);
    expect(f.verdict).toBe('clear');
  });

  it('escalates when subject is far above peer group (z > 2.5)', async () => {
    const ctx = makeCtx({
      transactions: Array.from({ length: 10 }, () => ({ amount: 50_000 })),
      peerGroup: Array.from({ length: 30 }, (_, i) => ({ amount: 1000 + i * 10 })), // mean~1150, sd~88
    });
    const f = await apply(ctx);
    expect(['flag', 'escalate']).toContain(f.verdict);
  });
});

// ── regime_change ─────────────────────────────────────────────────────────────

describe('regime_change', () => {
  const apply = BEHAVIORAL_MODE_APPLIES.regime_change;

  it('returns inconclusive with < 10 amounts', async () => {
    const ctx = makeCtx({ transactions: [{ amount: 100 }] });
    expect((await apply(ctx)).verdict).toBe('inconclusive');
  });

  it('returns inconclusive when transactions is absent', async () => {
    expect((await apply(makeCtx())).verdict).toBe('inconclusive');
  });

  it('returns clear when first and second half means are similar', async () => {
    const txs = Array.from({ length: 20 }, (_, i) => ({ amount: 1000 + (i % 3) * 10 }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('clear');
  });

  it('flags when second-half mean is drastically higher', async () => {
    // The t-test needs variance in both groups to compute a non-zero SE.
    // First half: ~100 ± 10; second half: ~50_000 ± 100.
    const txs = [
      ...Array.from({ length: 10 }, (_, i) => ({ amount: 100 + i })),       // mean ~105
      ...Array.from({ length: 10 }, (_, i) => ({ amount: 50_000 + i * 10 })), // mean ~50_045
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
  });

  it('score is in [0, 1]', async () => {
    const txs = Array.from({ length: 20 }, (_, i) => ({ amount: i * 100 }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});
