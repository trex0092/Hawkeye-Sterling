// Hawkeye Sterling — transaction pattern detectors unit tests.
// Covers detectSmurfing, detectLayering, detectRoundTripping, clusterShellNetwork.

import { describe, it, expect } from 'vitest';
import {
  detectSmurfing,
  detectLayering,
  detectRoundTripping,
  clusterShellNetwork,
  type TransactionRecord,
  type EntityProfile,
} from '../transactionPatterns.js';

function makeRec(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: 'r-1',
    at: new Date().toISOString(),
    amountUsd: 5000,
    fromParty: 'alice',
    toParty: 'bob',
    ...overrides,
  };
}

describe('detectSmurfing', () => {
  it('fires when 3+ near-threshold txs share a counterparty in window', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i}`,
      at: new Date(base + i * 3600000).toISOString(), // 1h apart, same day
      amountUsd: 8500, // 85% of 10000 threshold (>= 70%)
      fromParty: 'alice',
    }));
    const findings = detectSmurfing(txs, 10_000, 7);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.pattern).toBe('smurfing');
    expect(findings[0]!.severity).toBe('high');
    expect(findings[0]!.confidence).toBeGreaterThan(0);
  });

  it('does not fire when fewer than 3 txs per counterparty', () => {
    const txs: TransactionRecord[] = [
      makeRec({ id: 't0', amountUsd: 8500, fromParty: 'alice' }),
      makeRec({ id: 't1', amountUsd: 8500, fromParty: 'alice' }),
    ];
    expect(detectSmurfing(txs)).toHaveLength(0);
  });

  it('does not fire for txs above the threshold', () => {
    const txs: TransactionRecord[] = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i}`,
      at: new Date().toISOString(),
      amountUsd: 12_000, // above threshold
      fromParty: 'alice',
    }));
    expect(detectSmurfing(txs)).toHaveLength(0);
  });

  it('uses toParty as key when fromParty is absent', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      at: new Date(base + i * 3600000).toISOString(),
      amountUsd: 9000,
      toParty: 'broker',
    }));
    const findings = detectSmurfing(txs);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('falls back to "unknown" key when no party is available', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      at: new Date(base + i * 3600000).toISOString(),
      amountUsd: 9000,
    }));
    // 3 txs all keyed as "unknown" should trigger
    const findings = detectSmurfing(txs);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('confidence increases with cluster size', () => {
    const base = Date.now();
    const txs3: TransactionRecord[] = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`, at: new Date(base + i * 1000).toISOString(), amountUsd: 9000, fromParty: 'x',
    }));
    const txs6: TransactionRecord[] = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`, at: new Date(base + i * 1000).toISOString(), amountUsd: 9000, fromParty: 'y',
    }));
    const f3 = detectSmurfing(txs3);
    const f6 = detectSmurfing(txs6);
    expect(f3[0]!.confidence).toBeLessThan(f6[0]!.confidence);
  });
});

describe('detectLayering', () => {
  it('returns empty for insufficient txs', () => {
    expect(detectLayering([makeRec(), makeRec({ id: 't2' })])).toHaveLength(0); // minHops=3
  });

  it('detects a 3-hop layering chain', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = [
      { id: 't0', at: new Date(base).toISOString(), amountUsd: 10_000, fromParty: 'alice', toParty: 'bob' },
      { id: 't1', at: new Date(base + 3600000).toISOString(), amountUsd: 9800, fromParty: 'bob', toParty: 'charlie' },
      { id: 't2', at: new Date(base + 7200000).toISOString(), amountUsd: 9600, fromParty: 'charlie', toParty: 'dave' },
    ];
    const findings = detectLayering(txs, 3, 14, 500);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.pattern).toBe('layering');
    expect(findings[0]!.confidence).toBeGreaterThan(0.6);
  });

  it('does not detect layering when amount difference exceeds tolerance', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = [
      { id: 't0', at: new Date(base).toISOString(), amountUsd: 10_000, fromParty: 'alice', toParty: 'bob' },
      { id: 't1', at: new Date(base + 3600000).toISOString(), amountUsd: 5_000, fromParty: 'bob', toParty: 'charlie' },
      { id: 't2', at: new Date(base + 7200000).toISOString(), amountUsd: 9_900, fromParty: 'charlie', toParty: 'dave' },
    ];
    expect(detectLayering(txs, 3, 14, 500)).toHaveLength(0);
  });

  it('does not detect layering when parties do not chain', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = [
      { id: 't0', at: new Date(base).toISOString(), amountUsd: 10_000, fromParty: 'alice', toParty: 'bob' },
      { id: 't1', at: new Date(base + 1000).toISOString(), amountUsd: 9_900, fromParty: 'charlie', toParty: 'dave' },
      { id: 't2', at: new Date(base + 2000).toISOString(), amountUsd: 9_800, fromParty: 'eve', toParty: 'frank' },
    ];
    expect(detectLayering(txs, 3, 14, 500)).toHaveLength(0);
  });
});

describe('detectRoundTripping', () => {
  it('returns empty for fewer than 2 txs', () => {
    expect(detectRoundTripping([])).toHaveLength(0);
    expect(detectRoundTripping([makeRec()])).toHaveLength(0);
  });

  it('detects round trip with same party origin', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = [
      { id: 'out', at: new Date(base).toISOString(), amountUsd: 50_000, fromParty: 'alice', toParty: 'offshore' },
      { id: 'back', at: new Date(base + 7 * 86400000).toISOString(), amountUsd: 49_000, fromParty: 'another', toParty: 'alice' },
    ];
    const findings = detectRoundTripping(txs, 30, 5000);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.pattern).toBe('round_tripping');
    expect(findings[0]!.severity).toBe('high');
    expect(findings[0]!.confidence).toBe(0.7);
  });

  it('does not fire when return party does not match origin', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = [
      { id: 'out', at: new Date(base).toISOString(), amountUsd: 50_000, fromParty: 'alice', toParty: 'offshore' },
      { id: 'back', at: new Date(base + 86400000).toISOString(), amountUsd: 50_000, fromParty: 'offshore', toParty: 'bob' },
    ];
    expect(detectRoundTripping(txs, 30, 5000)).toHaveLength(0);
  });

  it('does not fire when amount difference exceeds tolerance', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = [
      { id: 'out', at: new Date(base).toISOString(), amountUsd: 50_000, fromParty: 'alice', toParty: 'offshore' },
      { id: 'back', at: new Date(base + 86400000).toISOString(), amountUsd: 30_000, fromParty: 'other', toParty: 'alice' },
    ];
    expect(detectRoundTripping(txs, 30, 5000)).toHaveLength(0);
  });

  it('does not fire when round trip exceeds the window', () => {
    const base = Date.now();
    const txs: TransactionRecord[] = [
      { id: 'out', at: new Date(base).toISOString(), amountUsd: 50_000, fromParty: 'alice', toParty: 'offshore' },
      { id: 'back', at: new Date(base + 60 * 86400000).toISOString(), amountUsd: 50_000, fromParty: 'other', toParty: 'alice' },
    ];
    expect(detectRoundTripping(txs, 30, 5000)).toHaveLength(0);
  });

  it('skips txs missing fromParty on outbound', () => {
    const txs: TransactionRecord[] = [
      { id: 'out', at: new Date().toISOString(), amountUsd: 50_000, toParty: 'offshore' }, // no fromParty
      { id: 'back', at: new Date().toISOString(), amountUsd: 50_000, fromParty: 'other', toParty: 'alice' },
    ];
    expect(detectRoundTripping(txs)).toHaveLength(0);
  });
});

describe('clusterShellNetwork', () => {
  it('fires when 5+ entities share a registered address', () => {
    const profiles: EntityProfile[] = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      name: `Entity ${i}`,
      registeredAddress: '123 Shell Street, BVI',
    }));
    const findings = clusterShellNetwork(profiles, 5);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.pattern).toBe('shell_network');
    expect(findings[0]!.severity).toBe('high');
    expect(findings[0]!.confidence).toBe(0.75);
  });

  it('fires when 5+ entities share a director', () => {
    const profiles: EntityProfile[] = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      name: `Entity ${i}`,
      directors: ['John Nominee'],
    }));
    const findings = clusterShellNetwork(profiles, 5);
    expect(findings.length).toBeGreaterThan(0);
    const dirFinding = findings.find((f) => f.id.startsWith('shell-dir'));
    expect(dirFinding).toBeDefined();
    expect(dirFinding!.severity).toBe('medium');
    expect(dirFinding!.confidence).toBe(0.6);
  });

  it('does not fire when cluster is below minimum size', () => {
    const profiles: EntityProfile[] = Array.from({ length: 4 }, (_, i) => ({
      id: `e${i}`,
      name: `Entity ${i}`,
      registeredAddress: '123 Shell Street, BVI',
      directors: ['Nominee Director'],
    }));
    expect(clusterShellNetwork(profiles, 5)).toHaveLength(0);
  });

  it('ignores entities with no registeredAddress or directors', () => {
    const profiles: EntityProfile[] = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      name: `Entity ${i}`,
    }));
    expect(clusterShellNetwork(profiles, 5)).toHaveLength(0);
  });

  it('normalises address to lowercase for grouping', () => {
    const profiles: EntityProfile[] = [
      { id: 'e0', name: 'A', registeredAddress: '123 Main St' },
      { id: 'e1', name: 'B', registeredAddress: '123 MAIN ST' },
      { id: 'e2', name: 'C', registeredAddress: '123 Main St' },
      { id: 'e3', name: 'D', registeredAddress: '123 main st' },
      { id: 'e4', name: 'E', registeredAddress: '123 Main St' },
    ];
    const findings = clusterShellNetwork(profiles, 5);
    // All 5 have the same address (case-insensitive) so it should fire
    expect(findings.length).toBeGreaterThan(0);
  });
});
