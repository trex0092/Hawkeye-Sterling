import { describe, expect, it } from 'vitest';
import { BEHAVIORAL_BATCH_APPLIES } from './wave3-behavioral-batch.js';
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

const rapidLayeringApply = BEHAVIORAL_BATCH_APPLIES['rapid_layering_pattern']!;
const funnelAccountApply = BEHAVIORAL_BATCH_APPLIES['funnel_account_indicator']!;
const circularPaymentApply = BEHAVIORAL_BATCH_APPLIES['circular_payment_loop']!;
const dormantWakeApply = BEHAVIORAL_BATCH_APPLIES['dormant_to_active_anomaly']!;
const roundAmountApply = BEHAVIORAL_BATCH_APPLIES['round_amount_clustering']!;
const midnightBurstApply = BEHAVIORAL_BATCH_APPLIES['midnight_burst_pattern']!;
const salaryMisuseApply = BEHAVIORAL_BATCH_APPLIES['salary_account_misuse']!;
const atmDensityApply = BEHAVIORAL_BATCH_APPLIES['atm_density_anomaly']!;
const impossibleGeoApply = BEHAVIORAL_BATCH_APPLIES['impossible_geo_velocity']!;
const chargebackRingApply = BEHAVIORAL_BATCH_APPLIES['chargeback_ring_pattern']!;

// ── rapid_layering_pattern ──────────────────────────────────────────────────

describe('rapid_layering_pattern', () => {
  it('returns inconclusive when no rapidLayers supplied', async () => {
    const r = await rapidLayeringApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('rapid_layering_pattern');
  });

  it('returns inconclusive on empty array', async () => {
    const r = await rapidLayeringApply(makeCtx({ rapidLayers: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await rapidLayeringApply(makeCtx({
      rapidLayers: [{ sequenceId: 'seq1', legCount: 2, totalSpanHours: 48 }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags fast_multi_leg when >= 5 legs in <= 24h', async () => {
    const r = await rapidLayeringApply(makeCtx({
      rapidLayers: [{ sequenceId: 'seq2', legCount: 5, totalSpanHours: 24 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag fast_multi_leg when legCount < 5', async () => {
    const r = await rapidLayeringApply(makeCtx({
      rapidLayers: [{ sequenceId: 'seq3', legCount: 4, totalSpanHours: 10 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag fast_multi_leg when span > 24h', async () => {
    const r = await rapidLayeringApply(makeCtx({
      rapidLayers: [{ sequenceId: 'seq4', legCount: 5, totalSpanHours: 25 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags high_cumulative when cumulativeAmountAed >= 1_000_000', async () => {
    const r = await rapidLayeringApply(makeCtx({
      rapidLayers: [{ sequenceId: 'seq5', cumulativeAmountAed: 1_000_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag high_cumulative when < 1_000_000', async () => {
    const r = await rapidLayeringApply(makeCtx({
      rapidLayers: [{ sequenceId: 'seq6', cumulativeAmountAed: 999_999 }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await rapidLayeringApply(makeCtx({
      rapidLayers: [{ sequenceId: 'seq7', legCount: 8, totalSpanHours: 10, cumulativeAmountAed: 2_000_000 }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── funnel_account_indicator ────────────────────────────────────────────────

describe('funnel_account_indicator', () => {
  it('returns inconclusive when no funnelAccounts supplied', async () => {
    const r = await funnelAccountApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('funnel_account_indicator');
  });

  it('returns clear when no signals fire', async () => {
    const r = await funnelAccountApply(makeCtx({
      funnelAccounts: [{ accountId: 'acc1', uniqueDepositors: 3, daysActive: 60, passThroughRatio: 0.5 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags many_depositors_short_life when >= 10 depositors and <= 30 daysActive', async () => {
    const r = await funnelAccountApply(makeCtx({
      funnelAccounts: [{ accountId: 'acc2', uniqueDepositors: 10, daysActive: 30 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag many_depositors_short_life when depositors < 10', async () => {
    const r = await funnelAccountApply(makeCtx({
      funnelAccounts: [{ accountId: 'acc3', uniqueDepositors: 9, daysActive: 10 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag many_depositors_short_life when daysActive > 30', async () => {
    const r = await funnelAccountApply(makeCtx({
      funnelAccounts: [{ accountId: 'acc4', uniqueDepositors: 10, daysActive: 31 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags pure_passthrough when passThroughRatio >= 0.95', async () => {
    const r = await funnelAccountApply(makeCtx({
      funnelAccounts: [{ accountId: 'acc5', passThroughRatio: 0.95 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag pure_passthrough when passThroughRatio < 0.95', async () => {
    const r = await funnelAccountApply(makeCtx({
      funnelAccounts: [{ accountId: 'acc6', passThroughRatio: 0.94 }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await funnelAccountApply(makeCtx({
      funnelAccounts: [{ accountId: 'acc7', uniqueDepositors: 15, daysActive: 5, passThroughRatio: 0.99 }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── circular_payment_loop ───────────────────────────────────────────────────

describe('circular_payment_loop', () => {
  it('returns inconclusive when no paymentLoops supplied', async () => {
    const r = await circularPaymentApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('circular_payment_loop');
  });

  it('returns clear when no signals fire', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l1', nodeCount: 2, closesIn24h: false, netDeltaAed: 5000 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags fast_circle when nodeCount >= 4 and closesIn24h = true', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l2', nodeCount: 4, closesIn24h: true, netDeltaAed: 5000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag fast_circle when nodeCount < 4', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l3', nodeCount: 3, closesIn24h: true, netDeltaAed: 5000 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag fast_circle when closesIn24h is false', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l4', nodeCount: 4, closesIn24h: false, netDeltaAed: 5000 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags zero_net when Math.abs(netDeltaAed) < 1000', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l5', nodeCount: 2, closesIn24h: false, netDeltaAed: 500 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags zero_net when netDeltaAed is negative but abs < 1000', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l6', netDeltaAed: -400 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag zero_net when abs >= 1000', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l7', netDeltaAed: 1000 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags zero_net when netDeltaAed missing (defaults to 0)', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l8' }],
    }));
    // netDeltaAed ?? 0 → abs(0) < 1000 → flags
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await circularPaymentApply(makeCtx({
      paymentLoops: [{ loopId: 'l9', nodeCount: 6, closesIn24h: true, netDeltaAed: 0 }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── dormant_to_active_anomaly ───────────────────────────────────────────────

describe('dormant_to_active_anomaly', () => {
  it('returns inconclusive when no dormantWakes supplied', async () => {
    const r = await dormantWakeApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('dormant_to_active_anomaly');
  });

  it('returns clear when dormantDays < 365', async () => {
    const r = await dormantWakeApply(makeCtx({
      dormantWakes: [{ accountId: 'dw1', dormantDays: 100, wakeAmountAed: 200_000 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('returns clear when wakeAmountAed < 100_000', async () => {
    const r = await dormantWakeApply(makeCtx({
      dormantWakes: [{ accountId: 'dw2', dormantDays: 400, wakeAmountAed: 50_000 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags big_wake when dormantDays >= 365 and wakeAmountAed >= 100_000', async () => {
    const r = await dormantWakeApply(makeCtx({
      dormantWakes: [{ accountId: 'dw3', dormantDays: 365, wakeAmountAed: 100_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates with sufficient hits', async () => {
    const r = await dormantWakeApply(makeCtx({
      dormantWakes: [
        { accountId: 'dw4', dormantDays: 1000, wakeAmountAed: 5_000_000 },
        { accountId: 'dw5', dormantDays: 730, wakeAmountAed: 2_000_000 },
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── round_amount_clustering ─────────────────────────────────────────────────

describe('round_amount_clustering', () => {
  it('returns inconclusive when no roundAmountTxns supplied', async () => {
    const r = await roundAmountApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('round_amount_clustering');
  });

  it('returns clear when fewer than 5 txns', async () => {
    // fewer than 5 items → condition items.length >= 5 fails
    const r = await roundAmountApply(makeCtx({
      roundAmountTxns: [
        { txId: 't1', amountAed: 1000 },
        { txId: 't2', amountAed: 2000 },
        { txId: 't3', amountAed: 3000 },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('returns clear when round ratio < 0.7', async () => {
    // 3 round out of 5 = 60% → below 70%
    const r = await roundAmountApply(makeCtx({
      roundAmountTxns: [
        { txId: 't1', amountAed: 1000 },
        { txId: 't2', amountAed: 2000 },
        { txId: 't3', amountAed: 3000 },
        { txId: 't4', amountAed: 1500 }, // not round-thousand
        { txId: 't5', amountAed: 2500 }, // not round-thousand
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags round_dominance when >= 70% are round-thousand txns with >= 5 items', async () => {
    const r = await roundAmountApply(makeCtx({
      roundAmountTxns: [
        { txId: 't1', amountAed: 1000 },
        { txId: 't2', amountAed: 2000 },
        { txId: 't3', amountAed: 3000 },
        { txId: 't4', amountAed: 4000 },
        { txId: 't5', amountAed: 1234 }, // not round
      ],
    }));
    // 4/5 = 80% → flags
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not count amounts < 1000 as round', async () => {
    const r = await roundAmountApply(makeCtx({
      roundAmountTxns: [
        { txId: 't1', amountAed: 500 },  // < 1000
        { txId: 't2', amountAed: 1000 },
        { txId: 't3', amountAed: 2000 },
        { txId: 't4', amountAed: 3000 },
        { txId: 't5', amountAed: 4000 },
      ],
    }));
    // 4/5 = 80% round → flags
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not count amounts with remainder as round', async () => {
    const r = await roundAmountApply(makeCtx({
      roundAmountTxns: [
        { txId: 't1', amountAed: 1001 }, // not % 1000 === 0
        { txId: 't2', amountAed: 1001 },
        { txId: 't3', amountAed: 1001 },
        { txId: 't4', amountAed: 1001 },
        { txId: 't5', amountAed: 1001 },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });
});

// ── midnight_burst_pattern ──────────────────────────────────────────────────

describe('midnight_burst_pattern', () => {
  it('returns inconclusive when no midnightTxns supplied', async () => {
    const r = await midnightBurstApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('midnight_burst_pattern');
  });

  it('returns clear when off-hours txns < 5', async () => {
    const r = await midnightBurstApply(makeCtx({
      midnightTxns: [
        { txId: 't1', hourLocal: 1 },
        { txId: 't2', hourLocal: 2 },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('returns clear when off-hours ratio < 0.5', async () => {
    // 5 off-hours out of 11 = 45% < 50%
    const r = await midnightBurstApply(makeCtx({
      midnightTxns: [
        { txId: 't1', hourLocal: 1 },
        { txId: 't2', hourLocal: 2 },
        { txId: 't3', hourLocal: 3 },
        { txId: 't4', hourLocal: 0 },
        { txId: 't5', hourLocal: 4 },
        { txId: 't6', hourLocal: 10 },
        { txId: 't7', hourLocal: 11 },
        { txId: 't8', hourLocal: 12 },
        { txId: 't9', hourLocal: 13 },
        { txId: 't10', hourLocal: 14 },
        { txId: 't11', hourLocal: 15 },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags midnight_concentration when >= 5 txns in 00:00-04:00 and >= 50% of total', async () => {
    const r = await midnightBurstApply(makeCtx({
      midnightTxns: [
        { txId: 't1', hourLocal: 0 },
        { txId: 't2', hourLocal: 1 },
        { txId: 't3', hourLocal: 2 },
        { txId: 't4', hourLocal: 3 },
        { txId: 't5', hourLocal: 4 },
        { txId: 't6', hourLocal: 5 }, // outside
      ],
    }));
    // 5/6 ≈ 83% off-hours
    expect(r.score).toBeGreaterThan(0);
  });

  it('handles hourLocal defaults correctly (default 12, which is NOT off-hours)', async () => {
    // hourLocal defaults to 12, not in 0-4 range
    const r = await midnightBurstApply(makeCtx({
      midnightTxns: [
        { txId: 't1' },
        { txId: 't2' },
        { txId: 't3' },
        { txId: 't4' },
        { txId: 't5' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('includes hourLocal = 0 as off-hours', async () => {
    const r = await midnightBurstApply(makeCtx({
      midnightTxns: [
        { txId: 't1', hourLocal: 0 },
        { txId: 't2', hourLocal: 0 },
        { txId: 't3', hourLocal: 0 },
        { txId: 't4', hourLocal: 0 },
        { txId: 't5', hourLocal: 0 },
      ],
    }));
    // 5/5 = 100%
    expect(r.score).toBeGreaterThan(0);
  });
});

// ── salary_account_misuse ───────────────────────────────────────────────────

describe('salary_account_misuse', () => {
  it('returns inconclusive when no salaryAccounts supplied', async () => {
    const r = await salaryMisuseApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('salary_account_misuse');
  });

  it('returns clear when no signals fire', async () => {
    const r = await salaryMisuseApply(makeCtx({
      salaryAccounts: [{ accountId: 'sa1', salaryDeposit: 10000, nonSalaryInflows: 20000, outflowsToHighRiskCountry: false }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags inflows_exceed_salary when nonSalaryInflows > 5x salary', async () => {
    const r = await salaryMisuseApply(makeCtx({
      salaryAccounts: [{ accountId: 'sa2', salaryDeposit: 10000, nonSalaryInflows: 50001 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when nonSalaryInflows <= 5x salary', async () => {
    const r = await salaryMisuseApply(makeCtx({
      salaryAccounts: [{ accountId: 'sa3', salaryDeposit: 10000, nonSalaryInflows: 50000 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags high_risk_outflow when outflowsToHighRiskCountry is true', async () => {
    const r = await salaryMisuseApply(makeCtx({
      salaryAccounts: [{ accountId: 'sa4', outflowsToHighRiskCountry: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await salaryMisuseApply(makeCtx({
      salaryAccounts: [{ accountId: 'sa5', salaryDeposit: 5000, nonSalaryInflows: 30000, outflowsToHighRiskCountry: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── atm_density_anomaly ─────────────────────────────────────────────────────

describe('atm_density_anomaly', () => {
  it('returns inconclusive when no atmDensity supplied', async () => {
    const r = await atmDensityApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('atm_density_anomaly');
  });

  it('returns clear when no signals fire', async () => {
    const r = await atmDensityApply(makeCtx({
      atmDensity: [{ atmId: 'atm1', depositsLast24h: 10, uniqueCardsLast24h: 10 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags few_cards_many_deposits when >= 50 deposits and <= 5 unique cards', async () => {
    const r = await atmDensityApply(makeCtx({
      atmDensity: [{ atmId: 'atm2', depositsLast24h: 50, uniqueCardsLast24h: 5 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when deposits < 50', async () => {
    const r = await atmDensityApply(makeCtx({
      atmDensity: [{ atmId: 'atm3', depositsLast24h: 49, uniqueCardsLast24h: 1 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when uniqueCardsLast24h > 5', async () => {
    const r = await atmDensityApply(makeCtx({
      atmDensity: [{ atmId: 'atm4', depositsLast24h: 100, uniqueCardsLast24h: 6 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates with multiple flagged ATMs', async () => {
    const r = await atmDensityApply(makeCtx({
      atmDensity: [
        { atmId: 'atm5', depositsLast24h: 80, uniqueCardsLast24h: 2 },
        { atmId: 'atm6', depositsLast24h: 100, uniqueCardsLast24h: 1 },
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── impossible_geo_velocity ─────────────────────────────────────────────────

describe('impossible_geo_velocity', () => {
  it('returns inconclusive when no geoVelocity supplied', async () => {
    const r = await impossibleGeoApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('impossible_geo_velocity');
  });

  it('returns clear when no signals fire', async () => {
    const r = await impossibleGeoApply(makeCtx({
      geoVelocity: [{ customerId: 'c1', firstCity: 'Dubai', secondCity: 'Abu Dhabi', gapMinutes: 60, estimatedDistanceKm: 100 }],
    }));
    // 100km / (60/60)h = 100 km/h < 1000 → no flag
    expect(r.verdict).toBe('clear');
  });

  it('flags supersonic_velocity when speed >= 1000 km/h', async () => {
    const r = await impossibleGeoApply(makeCtx({
      geoVelocity: [{ customerId: 'c2', firstCity: 'Dubai', secondCity: 'London', gapMinutes: 1, estimatedDistanceKm: 1000 }],
    }));
    // 1000km / (1/60)h = 60000 km/h > 1000 → flags
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when gapMinutes = 0', async () => {
    const r = await impossibleGeoApply(makeCtx({
      geoVelocity: [{ customerId: 'c3', gapMinutes: 0, estimatedDistanceKm: 10000 }],
    }));
    // gap = 0 → condition gap > 0 fails
    expect(r.verdict).toBe('clear');
  });

  it('escalates with multiple supersonic velocity hits', async () => {
    const r = await impossibleGeoApply(makeCtx({
      geoVelocity: [
        { customerId: 'c4', firstCity: 'A', secondCity: 'B', gapMinutes: 1, estimatedDistanceKm: 2000 },
        { customerId: 'c5', firstCity: 'C', secondCity: 'D', gapMinutes: 2, estimatedDistanceKm: 5000 },
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── chargeback_ring_pattern ─────────────────────────────────────────────────

describe('chargeback_ring_pattern', () => {
  it('returns inconclusive when no chargebackRings supplied', async () => {
    const r = await chargebackRingApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('chargeback_ring_pattern');
  });

  it('returns clear when no signals fire', async () => {
    const r = await chargebackRingApply(makeCtx({
      chargebackRings: [{ ringId: 'r1', chargebackPctOfVolume: 0.01, merchantCount: 2, cardCount: 5 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags high_chargeback when chargebackPctOfVolume >= 0.05', async () => {
    const r = await chargebackRingApply(makeCtx({
      chargebackRings: [{ ringId: 'r2', chargebackPctOfVolume: 0.05 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag high_chargeback when chargebackPctOfVolume < 0.05', async () => {
    const r = await chargebackRingApply(makeCtx({
      chargebackRings: [{ ringId: 'r3', chargebackPctOfVolume: 0.049 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags merchant_card_overlap when >= 5 merchants and >= 20 cards', async () => {
    const r = await chargebackRingApply(makeCtx({
      chargebackRings: [{ ringId: 'r4', merchantCount: 5, cardCount: 20 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag merchant_card_overlap when merchantCount < 5', async () => {
    const r = await chargebackRingApply(makeCtx({
      chargebackRings: [{ ringId: 'r5', merchantCount: 4, cardCount: 30 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag merchant_card_overlap when cardCount < 20', async () => {
    const r = await chargebackRingApply(makeCtx({
      chargebackRings: [{ ringId: 'r6', merchantCount: 10, cardCount: 19 }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates with both signals', async () => {
    const r = await chargebackRingApply(makeCtx({
      chargebackRings: [{ ringId: 'r7', chargebackPctOfVolume: 0.20, merchantCount: 10, cardCount: 50 }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});
