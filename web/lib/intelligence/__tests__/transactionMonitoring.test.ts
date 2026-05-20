// Hawkeye Sterling — transaction monitoring rules unit tests.
// Covers rules 71-85 (all exported functions).

import { describe, it, expect } from 'vitest';
import {
  velocityRule,
  aggregateThreshold,
  unusualAmount,
  offHoursActivity,
  duplicateAmounts,
  roundAmount,
  cashThreshold,
  crossBorderHighRisk,
  counterpartyCountryRisk,
  newCounterpartyVelocity,
  dormancyBurst,
  nostroVostroPair,
  currencyMixAnomaly,
  backToBack,
  wireStripping,
  type Tx,
} from '../transactionMonitoring.js';

function makeTx(overrides: Partial<Tx> = {}): Tx {
  return {
    id: 'tx-1',
    at: new Date().toISOString(),
    amountUsd: 1000,
    ...overrides,
  };
}

function makeTxAt(offsetMs: number, overrides: Partial<Tx> = {}): Tx {
  return makeTx({
    at: new Date(Date.now() + offsetMs).toISOString(),
    ...overrides,
  });
}

describe('velocityRule (rule 71)', () => {
  it('fires when count exceeds maxCount in window', () => {
    const txs = Array.from({ length: 8 }, (_, i) =>
      makeTxAt(i * 1000, { id: `t${i}`, amountUsd: 100 }),
    );
    const alerts = velocityRule(txs, 5, 1);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.rule).toBe('velocity_count');
    expect(alerts[0]!.severity).toBe('medium');
  });

  it('does not fire when count is within limit', () => {
    const txs = Array.from({ length: 3 }, (_, i) =>
      makeTxAt(i * 1000, { id: `t${i}`, amountUsd: 100 }),
    );
    expect(velocityRule(txs, 5, 1)).toHaveLength(0);
  });

  it('returns empty for empty input', () => {
    expect(velocityRule([], 5, 1)).toHaveLength(0);
  });
});

describe('aggregateThreshold (rule 72)', () => {
  it('fires when cumulative amount exceeds threshold', () => {
    const txs = [
      makeTxAt(0, { id: 't0', amountUsd: 5000 }),
      makeTxAt(60000, { id: 't1', amountUsd: 6000 }),
    ];
    const alerts = aggregateThreshold(txs, 10_000, 1);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.rule).toBe('aggregate_threshold');
    expect(alerts[0]!.severity).toBe('high');
  });

  it('does not fire when amounts stay below threshold', () => {
    const txs = [
      makeTxAt(0, { id: 't0', amountUsd: 1000 }),
      makeTxAt(60000, { id: 't1', amountUsd: 2000 }),
    ];
    expect(aggregateThreshold(txs, 50_000, 1)).toHaveLength(0);
  });

  it('ignores txs outside the time window', () => {
    const txs = [
      makeTxAt(0, { id: 't0', amountUsd: 9000 }),
      makeTxAt(3 * 3600000, { id: 't1', amountUsd: 9000 }), // 3h later, outside 1h window
    ];
    expect(aggregateThreshold(txs, 10_000, 1)).toHaveLength(0);
  });
});

describe('unusualAmount (rule 73)', () => {
  it('fires when z-score >= 3', () => {
    const tx = makeTx({ id: 'tx', amountUsd: 100_000 });
    const alert = unusualAmount(tx, 1000, 5000);
    // z = (100000 - 1000) / 5000 = 19.8
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('unusual_amount');
    expect(alert!.severity).toBe('high'); // >= 5 sigma
  });

  it('fires with medium severity when 3 <= z < 5', () => {
    const tx = makeTx({ id: 'tx', amountUsd: 4500 });
    const alert = unusualAmount(tx, 1000, 1000);
    // z = (4500-1000)/1000 = 3.5
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('medium');
  });

  it('returns null when z-score < 3', () => {
    const tx = makeTx({ id: 'tx', amountUsd: 1200 });
    expect(unusualAmount(tx, 1000, 1000)).toBeNull(); // z=0.2
  });

  it('returns null when sigmaUsd is 0 or negative', () => {
    const tx = makeTx({ id: 'tx', amountUsd: 99999 });
    expect(unusualAmount(tx, 1000, 0)).toBeNull();
    expect(unusualAmount(tx, 1000, -1)).toBeNull();
  });

  it('fires for negative z (unusually small)', () => {
    const tx = makeTx({ id: 'tx', amountUsd: 0 });
    const alert = unusualAmount(tx, 60_000, 10_000);
    // z = (0-60000)/10000 = -6 → |z| >= 5 → high
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('high');
  });
});

describe('offHoursActivity (rule 74)', () => {
  it('fires for transactions in off-hours (h < 6)', () => {
    // UTC+4 offset, at 01:00 UTC → local 05:00 (< 6)
    const tx = makeTx({ id: 'tx', at: '2026-05-18T01:00:00.000Z' });
    const alert = offHoursActivity(tx, 4);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('off_hours');
    expect(alert!.severity).toBe('low');
  });

  it('fires for transactions in off-hours (h >= 22)', () => {
    // UTC+0 offset, at 23:00 UTC → local 23:00 (>= 22)
    const tx = makeTx({ id: 'tx', at: '2026-05-18T23:00:00.000Z' });
    const alert = offHoursActivity(tx, 0);
    expect(alert).not.toBeNull();
  });

  it('does not fire during business hours', () => {
    // at 09:00 UTC, UTC+0
    const tx = makeTx({ id: 'tx', at: '2026-05-18T09:00:00.000Z' });
    expect(offHoursActivity(tx, 0)).toBeNull();
  });
});

describe('duplicateAmounts (rule 75)', () => {
  it('fires when 3+ txs have the same amount within window', () => {
    const base = Date.now();
    const txs = [
      { id: 't1', at: new Date(base).toISOString(), amountUsd: 9999 },
      { id: 't2', at: new Date(base + 60000).toISOString(), amountUsd: 9999 },
      { id: 't3', at: new Date(base + 120000).toISOString(), amountUsd: 9999 },
    ];
    const alerts = duplicateAmounts(txs, 60);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.rule).toBe('duplicate_amount');
  });

  it('does not fire with only 2 identical amounts', () => {
    const base = Date.now();
    const txs = [
      { id: 't1', at: new Date(base).toISOString(), amountUsd: 9999 },
      { id: 't2', at: new Date(base + 60000).toISOString(), amountUsd: 9999 },
    ];
    expect(duplicateAmounts(txs, 60)).toHaveLength(0);
  });

  it('does not fire when amounts differ', () => {
    const base = Date.now();
    const txs = [
      { id: 't1', at: new Date(base).toISOString(), amountUsd: 9999 },
      { id: 't2', at: new Date(base + 60000).toISOString(), amountUsd: 8888 },
      { id: 't3', at: new Date(base + 120000).toISOString(), amountUsd: 7777 },
    ];
    expect(duplicateAmounts(txs, 60)).toHaveLength(0);
  });
});

describe('roundAmount (rule 76)', () => {
  it('fires for round amounts >= 1000', () => {
    const tx = makeTx({ id: 'tx', amountUsd: 5000 });
    const alert = roundAmount(tx);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('round_amount');
    expect(alert!.severity).toBe('low');
  });

  it('does not fire for non-round amounts', () => {
    expect(roundAmount(makeTx({ amountUsd: 4567 }))).toBeNull();
  });

  it('does not fire for round amounts below 1000', () => {
    expect(roundAmount(makeTx({ amountUsd: 500 }))).toBeNull();
  });
});

describe('cashThreshold (rule 77)', () => {
  it('fires for cash transactions above threshold', () => {
    const tx = makeTx({ id: 'tx', channel: 'cash', amountUsd: 20_000 });
    const alert = cashThreshold(tx);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('ctr_threshold');
    expect(alert!.severity).toBe('high');
  });

  it('does not fire for non-cash channels', () => {
    const tx = makeTx({ id: 'tx', channel: 'wire', amountUsd: 20_000 });
    expect(cashThreshold(tx)).toBeNull();
  });

  it('does not fire for cash below threshold', () => {
    const tx = makeTx({ id: 'tx', channel: 'cash', amountUsd: 5_000 });
    expect(cashThreshold(tx)).toBeNull();
  });

  it('respects custom threshold', () => {
    const tx = makeTx({ id: 'tx', channel: 'cash', amountUsd: 60_000 });
    expect(cashThreshold(tx, 55_000)).not.toBeNull();
    expect(cashThreshold(tx, 70_000)).toBeNull();
  });
});

describe('crossBorderHighRisk (rule 78)', () => {
  it('fires when toIso2 is high-risk', () => {
    const tx = makeTx({ fromIso2: 'AE', toIso2: 'IR' });
    const alert = crossBorderHighRisk(tx);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('cross_border_hr');
  });

  it('fires when fromIso2 is high-risk', () => {
    const tx = makeTx({ fromIso2: 'KP', toIso2: 'AE' });
    expect(crossBorderHighRisk(tx)).not.toBeNull();
  });

  it('does not fire for domestic transactions (same country)', () => {
    const tx = makeTx({ fromIso2: 'AE', toIso2: 'AE' });
    expect(crossBorderHighRisk(tx)).toBeNull();
  });

  it('does not fire for low-risk cross-border', () => {
    const tx = makeTx({ fromIso2: 'AE', toIso2: 'GB' });
    expect(crossBorderHighRisk(tx)).toBeNull();
  });

  it('does not fire when country codes are missing', () => {
    expect(crossBorderHighRisk(makeTx({}))).toBeNull();
    expect(crossBorderHighRisk(makeTx({ fromIso2: 'AE' }))).toBeNull();
  });

  it('is case-insensitive', () => {
    const tx = makeTx({ fromIso2: 'ae', toIso2: 'ir' });
    expect(crossBorderHighRisk(tx)).not.toBeNull();
  });
});

describe('counterpartyCountryRisk (rule 79)', () => {
  it('fires when toIso2 is high-risk', () => {
    const tx = makeTx({ toIso2: 'RU' });
    const alert = counterpartyCountryRisk(tx);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('cp_country_hr');
    expect(alert!.severity).toBe('medium');
  });

  it('falls back to fromIso2 when toIso2 is absent', () => {
    const tx = makeTx({ fromIso2: 'SY' });
    expect(counterpartyCountryRisk(tx)).not.toBeNull();
  });

  it('returns null when no country code is present', () => {
    expect(counterpartyCountryRisk(makeTx({}))).toBeNull();
  });

  it('returns null for low-risk countries', () => {
    expect(counterpartyCountryRisk(makeTx({ toIso2: 'GB' }))).toBeNull();
  });
});

describe('newCounterpartyVelocity (rule 80)', () => {
  it('fires when distinct counterparty count meets threshold', () => {
    const base = Date.now();
    const txs = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      at: new Date(base + i * 1000).toISOString(),
      amountUsd: 100,
      toParty: `party-${i}`,
    }));
    const alerts = newCounterpartyVelocity(txs, 7, 5);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.rule).toBe('new_cp_velocity');
  });

  it('does not fire below threshold', () => {
    const base = Date.now();
    const txs = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      at: new Date(base + i * 1000).toISOString(),
      amountUsd: 100,
      toParty: `party-${i}`,
    }));
    expect(newCounterpartyVelocity(txs, 7, 5)).toHaveLength(0);
  });

  it('ignores txs outside the window', () => {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    const txs = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      at: old,
      amountUsd: 100,
      toParty: `party-${i}`,
    }));
    expect(newCounterpartyVelocity(txs, 7, 5)).toHaveLength(0);
  });
});

describe('dormancyBurst (rule 81)', () => {
  it('detects dormancy followed by burst', () => {
    const old = new Date(Date.now() - 200 * 86400000).toISOString(); // 200 days ago
    const recent = new Date().toISOString();
    const txs = [
      { id: 't0', at: old, amountUsd: 100 },
      { id: 't1', at: recent, amountUsd: 500 },
      { id: 't2', at: recent, amountUsd: 500 },
      { id: 't3', at: recent, amountUsd: 500 },
    ];
    const alert = dormancyBurst(txs, 90);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('dormancy_burst');
    expect(alert!.severity).toBe('high');
  });

  it('returns null when no dormancy gap is detected', () => {
    const base = Date.now();
    const txs = [
      { id: 't0', at: new Date(base).toISOString(), amountUsd: 100 },
      { id: 't1', at: new Date(base + 86400000).toISOString(), amountUsd: 100 },
    ];
    expect(dormancyBurst(txs, 90)).toBeNull();
  });

  it('returns null for fewer than 2 transactions', () => {
    expect(dormancyBurst([makeTx()], 90)).toBeNull();
    expect(dormancyBurst([], 90)).toBeNull();
  });
});

describe('nostroVostroPair (rule 82)', () => {
  it('fires when description contains both nostro and vostro', () => {
    const tx = makeTx({ description: 'nostro account matched with vostro entry' });
    const alert = nostroVostroPair(tx);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('nostro_vostro');
    expect(alert!.severity).toBe('medium');
  });

  it('fires in reverse order (vostro...nostro)', () => {
    const tx = makeTx({ description: 'vostro transfer matched nostro ref' });
    expect(nostroVostroPair(tx)).not.toBeNull();
  });

  it('returns null when no description', () => {
    expect(nostroVostroPair(makeTx({ description: undefined }))).toBeNull();
  });

  it('returns null when only one keyword present', () => {
    expect(nostroVostroPair(makeTx({ description: 'nostro account' }))).toBeNull();
  });
});

describe('currencyMixAnomaly (rule 83)', () => {
  it('fires when 5+ distinct currencies appear', () => {
    const txs = ['USD', 'EUR', 'GBP', 'JPY', 'AED'].map((ccy, i) =>
      makeTx({ id: `t${i}`, ccy }),
    );
    const alert = currencyMixAnomaly(txs);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('currency_mix');
    expect(alert!.severity).toBe('medium');
  });

  it('does not fire with fewer than 5 currencies', () => {
    const txs = ['USD', 'EUR', 'GBP'].map((ccy, i) => makeTx({ id: `t${i}`, ccy }));
    expect(currencyMixAnomaly(txs)).toBeNull();
  });

  it('does not fire when ccy is empty/missing', () => {
    const txs = Array.from({ length: 5 }, (_, i) => makeTx({ id: `t${i}`, ccy: undefined }));
    expect(currencyMixAnomaly(txs)).toBeNull();
  });
});

describe('backToBack (rule 84)', () => {
  it('fires for round-trip between same two parties', () => {
    const base = Date.now();
    const txs: Tx[] = [
      { id: 't0', at: new Date(base).toISOString(), amountUsd: 1000, fromParty: 'alice', toParty: 'bob' },
      { id: 't1', at: new Date(base + 60000).toISOString(), amountUsd: 1000, fromParty: 'bob', toParty: 'alice' },
    ];
    const alert = backToBack(txs, 120);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('back_to_back');
    expect(alert!.severity).toBe('high');
  });

  it('does not fire when transactions are outside the window', () => {
    const base = Date.now();
    const txs: Tx[] = [
      { id: 't0', at: new Date(base).toISOString(), amountUsd: 1000, fromParty: 'alice', toParty: 'bob' },
      { id: 't1', at: new Date(base + 5 * 3600000).toISOString(), amountUsd: 1000, fromParty: 'bob', toParty: 'alice' },
    ];
    expect(backToBack(txs, 120)).toBeNull();
  });

  it('does not fire when parties are not mirrored', () => {
    const base = Date.now();
    const txs: Tx[] = [
      { id: 't0', at: new Date(base).toISOString(), amountUsd: 1000, fromParty: 'alice', toParty: 'bob' },
      { id: 't1', at: new Date(base + 60000).toISOString(), amountUsd: 1000, fromParty: 'charlie', toParty: 'alice' },
    ];
    expect(backToBack(txs, 120)).toBeNull();
  });
});

describe('wireStripping (rule 85)', () => {
  it('fires for "re-routed" in description', () => {
    const tx = makeTx({ description: 'payment re-routed through correspondent' });
    const alert = wireStripping(tx);
    expect(alert).not.toBeNull();
    expect(alert!.rule).toBe('wire_stripping');
    expect(alert!.severity).toBe('critical');
  });

  it('fires for "stripped" in description', () => {
    expect(wireStripping(makeTx({ description: 'fields stripped from message' }))).not.toBeNull();
  });

  it('fires for "cleared via" in description', () => {
    expect(wireStripping(makeTx({ description: 'cleared via offshore entity' }))).not.toBeNull();
  });

  it('fires for "original beneficiary unknown"', () => {
    expect(wireStripping(makeTx({ description: 'original beneficiary unknown' }))).not.toBeNull();
  });

  it('returns null when description is absent', () => {
    expect(wireStripping(makeTx({ description: undefined }))).toBeNull();
  });

  it('returns null for innocuous description', () => {
    expect(wireStripping(makeTx({ description: 'routine payment' }))).toBeNull();
  });
});
