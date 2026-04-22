import { describe, it, expect } from 'vitest';
import {
  structuringScan, smurfingScan, roundAmountRate, roundTripScan,
  peelChainScore, timeClusteringScore, washTradeScore, journalAnomalyScore,
  extractAmounts, extractTimestamps,
} from './tx-patterns.js';

describe('extractors', () => {
  it('extract amounts from mixed input', () => {
    const txs = [{ amount: 100 }, { amount: '1,234.5' }, { amount: 'x' }, 50];
    expect(extractAmounts(txs)).toEqual([100, 1234.5, 50]);
  });
  it('extract timestamps', () => {
    const txs = [{ timestamp: 1000 }, { timestamp: '2025-01-01T00:00:00Z' }];
    expect(extractTimestamps(txs).length).toBe(2);
  });
});

describe('structuringScan', () => {
  it('catches near-threshold amounts', () => {
    const r = structuringScan([9500, 9600, 9800, 500, 12000]);
    expect(r.nearThreshold).toBe(3);
    expect(r.rate).toBeCloseTo(0.6, 1);
  });
});

describe('smurfingScan', () => {
  it('detects burst windows', () => {
    const base = Date.parse('2025-01-01T00:00:00Z');
    const txs = [0,1,2,3,4,5].map((i) => ({ amount: 900, timestamp: base + i * 3600_000 }));
    const r = smurfingScan(txs);
    expect(r.windows).toBeGreaterThan(0);
    expect(r.burstSize).toBeGreaterThanOrEqual(3);
  });
});

describe('roundAmountRate', () => {
  it('scores round amounts', () => {
    const r = roundAmountRate([1000, 500, 1234, 2000]);
    expect(r.rate).toBeCloseTo(0.75, 1);
  });
});

describe('roundTripScan', () => {
  it('detects in/out cycle', () => {
    const txs = [
      { amount: 1000, direction: 'in', counterparty: 'X' },
      { amount: 1000, direction: 'out', counterparty: 'X' },
    ];
    const r = roundTripScan(txs);
    expect(r.cycles).toBeGreaterThanOrEqual(1);
  });
});

describe('washTradeScore', () => {
  it('matches balanced pair', () => {
    const txs = [
      { amount: 500, direction: 'in', counterparty: 'Y' },
      { amount: 505, direction: 'out', counterparty: 'Y' },
    ];
    const r = washTradeScore(txs);
    expect(r.pairs).toBe(1);
  });
});

describe('peelChainScore', () => {
  it('returns 0 below 5 outs', () => {
    expect(peelChainScore([{ amount: 1, direction: 'out', timestamp: 1 }]).score).toBe(0);
  });
});

describe('timeClusteringScore', () => {
  it('classifies regular bursts', () => {
    const ts = [0, 1000, 2000, 3000, 4000, 5000];
    const r = timeClusteringScore(ts);
    expect(r.verdict).toBe('regular');
  });
});

describe('journalAnomalyScore', () => {
  it('reports weekend rate', () => {
    const sat = Date.parse('2025-01-04T12:00:00Z'); // Saturday UTC
    const r = journalAnomalyScore([sat, sat + 86400_000]);
    expect(r.weekendRate).toBeGreaterThan(0);
  });
});
