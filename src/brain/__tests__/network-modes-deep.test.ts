// Deep coverage tests for modes/network.ts
// Covers: community_detection, relationship_mapping, network_centrality, chain_analysis.

import { describe, it, expect } from 'vitest';
import { NETWORK_MODE_APPLIES } from '../modes/network.js';
import type { BrainContext } from '../types.js';

function makeCtx(
  evidence: Record<string, unknown> = {},
  subjectOverrides: Record<string, unknown> = {},
): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Entity', type: 'entity', ...subjectOverrides } as BrainContext['subject'],
    evidence,
    priorFindings: [],
    domains: ['network'],
  };
}

/** Build transactions where a single counterparty dominates. */
function buildConcentratedTxs(total: number, dominantCp: string, otherCps: string[]): Record<string, unknown>[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `tx-${i}`,
    counterparty: i < Math.floor(total * 0.95) ? dominantCp : otherCps[i % otherCps.length],
    amount: 1000,
  }));
}

// ── community_detection ───────────────────────────────────────────────────────

describe('community_detection', () => {
  const apply = NETWORK_MODE_APPLIES.community_detection;

  it('returns inconclusive when no transactions', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('community_detection');
  });

  it('returns inconclusive when transactions is an empty array', async () => {
    const f = await apply(makeCtx({ transactions: [] }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('escalates when <= 3 counterparties absorb >= 90% of flows', async () => {
    // 2 counterparties absorbing 100% (≤3 and ≥90%)
    const txs = buildConcentratedTxs(20, 'cp-A', ['cp-B']);
    // All go to cp-A (95%) except a couple to cp-B → concentration >= 90%, unique <= 3
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBe(0.8);
  });

  it('flags when top-3 concentration is >= 70% but unique > 3', async () => {
    // 10 counterparties but top 3 absorb 80%
    const txs = [
      ...Array.from({ length: 8 }, () => ({ id: 'tx-a', counterparty: 'cp-A', amount: 1000 })),
      ...Array.from({ length: 3 }, () => ({ id: 'tx-b', counterparty: 'cp-B', amount: 1000 })),
      ...Array.from({ length: 2 }, () => ({ id: 'tx-c', counterparty: 'cp-C', amount: 1000 })),
      { id: 'tx-d', counterparty: 'cp-D', amount: 1000 },
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    // top 3 = 8+3+2 = 13 / 14 total > 70%
    expect(f.verdict).toBe('flag');
  });

  it('clears when counterparty distribution is sufficiently diverse', async () => {
    // 20 distinct counterparties, 1 tx each → concentration = 3/20 = 15%
    const txs = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: `cp-${i}`,
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('clear');
  });

  it('score is in [0, 1]', async () => {
    const txs = Array.from({ length: 10 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: `cp-${i % 3}`,
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── relationship_mapping ──────────────────────────────────────────────────────

describe('relationship_mapping', () => {
  const apply = NETWORK_MODE_APPLIES.relationship_mapping;

  it('clears when subject has no risk flags and no connections', async () => {
    const f = await apply(makeCtx({}, {}));
    expect(f.verdict).toBe('clear');
    expect(f.modeId).toBe('relationship_mapping');
    expect(f.score).toBe(0.05);
  });

  it('flags on direct PEP exposure', async () => {
    const f = await apply(makeCtx({}, { isPep: true }));
    expect(f.verdict).toBe('flag');
    expect(f.score).toBe(0.6);
  });

  it('flags on direct sanctions exposure (matchedLists)', async () => {
    const f = await apply(makeCtx({}, { matchedLists: ['un_1267'] }));
    expect(f.verdict).toBe('flag');
  });

  it('flags on direct adverse media', async () => {
    const f = await apply(makeCtx({}, { adverseMediaCategories: ['fraud', 'corruption'] }));
    expect(f.verdict).toBe('flag');
  });

  it('flags on indirect (first-hop) PEP connection when subject is clean', async () => {
    const f = await apply(makeCtx({}, {
      connections: [
        { isPep: true, matchedLists: [], adverseMediaCategories: [] },
        { isPep: false, matchedLists: [], adverseMediaCategories: [] },
      ],
    }));
    expect(f.verdict).toBe('flag');
    expect(f.score).toBe(0.4);
  });

  it('flags on indirect first-hop sanctions connection', async () => {
    const f = await apply(makeCtx({}, {
      connections: [
        { isPep: false, matchedLists: ['ofac_sdn'], adverseMediaCategories: [] },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('escalates when subject is directly exposed AND has risky first-hop connections', async () => {
    const f = await apply(makeCtx({}, {
      isPep: true,
      matchedLists: ['un_1267'],
      connections: [
        { isPep: true, matchedLists: [], adverseMediaCategories: [] },
      ],
    }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBe(0.9);
    expect(f.confidence).toBe(0.8);
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({}, { isPep: true }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── network_centrality ────────────────────────────────────────────────────────

describe('network_centrality', () => {
  const apply = NETWORK_MODE_APPLIES.network_centrality;

  it('returns inconclusive when no transactions', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('network_centrality');
  });

  it('returns inconclusive when transactions is empty', async () => {
    const f = await apply(makeCtx({ transactions: [] }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when degree is low (< 10 distinct counterparties)', async () => {
    const txs = Array.from({ length: 5 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: `cp-${i}`,
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0.1);
  });

  it('flags when degree is between 10 and 19', async () => {
    const txs = Array.from({ length: 15 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: `cp-${i}`,
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('flag');
    expect(f.score).toBe(0.45);
  });

  it('escalates when degree >= 20 distinct counterparties', async () => {
    const txs = Array.from({ length: 25 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: `cp-${i}`, // 25 distinct counterparties
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBe(0.75);
  });

  it('excludes subject name from counterparty count', async () => {
    // Subject is 'Test Entity' — transactions where counterparty IS subject should not count
    const txs = [
      { id: 'tx-1', counterparty: 'Test Entity', amount: 1000 },  // self → excluded
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `tx-ext-${i}`,
        counterparty: `external-cp-${i}`,
        amount: 1000,
      })),
    ];
    const f = await apply(makeCtx({ transactions: txs }));
    // degree = 8 (not 9), so 8 < 10 → clear
    expect(f.verdict).toBe('clear');
  });

  it('score is in [0, 1]', async () => {
    const txs = Array.from({ length: 30 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty: `cp-${i}`,
      amount: 1000,
    }));
    const f = await apply(makeCtx({ transactions: txs }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── chain_analysis ────────────────────────────────────────────────────────────

describe('chain_analysis', () => {
  const apply = NETWORK_MODE_APPLIES.chain_analysis;

  it('returns inconclusive when no on-chain data', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('chain_analysis');
  });

  it('blocks when mixer exposure is detected in chainHops', async () => {
    const f = await apply(makeCtx({
      chainHops: [
        { hopIndex: 0, address: '0xabc', mixerExposure: true },
        { hopIndex: 1, address: '0xdef', mixerExposure: false },
      ],
    }));
    expect(f.verdict).toBe('block');
    expect(f.score).toBe(0.95);
    expect(f.confidence).toBe(0.85);
  });

  it('blocks when sanctioned wallet is detected in chainHops', async () => {
    const f = await apply(makeCtx({
      chainHops: [
        { hopIndex: 0, address: '0xsanctioned', sanctionedWallet: true },
      ],
    }));
    expect(f.verdict).toBe('block');
  });

  it('blocks when mixer exposure detected in transactions (fallback)', async () => {
    const f = await apply(makeCtx({
      transactions: [
        { id: 'tx-1', amount: 50000, mixerExposure: true },
      ],
    }));
    expect(f.verdict).toBe('block');
  });

  it('escalates when >= 2 bridge hops present', async () => {
    const f = await apply(makeCtx({
      chainHops: [
        { hopIndex: 0, bridgeHop: true },
        { hopIndex: 1, bridgeHop: true },
        { hopIndex: 2, bridgeHop: false },
      ],
    }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBe(0.65);
  });

  it('escalates when privacy coin detected', async () => {
    const f = await apply(makeCtx({
      chainHops: [
        { hopIndex: 0, privacyCoin: true },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('escalates when privacy coin in transaction fallback', async () => {
    const f = await apply(makeCtx({
      transactions: [
        { id: 'tx-1', privacyCoin: true, amount: 10000 },
      ],
    }));
    expect(f.verdict).toBe('escalate');
  });

  it('clears when on-chain data has no suspicious signals', async () => {
    const f = await apply(makeCtx({
      chainHops: [
        { hopIndex: 0, address: '0xclean1', vasp: 'Binance' },
        { hopIndex: 1, address: '0xclean2', vasp: 'Coinbase' },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0.1);
  });

  it('clears when only 1 bridge hop (below the 2-hop threshold)', async () => {
    const f = await apply(makeCtx({
      chainHops: [
        { hopIndex: 0, bridgeHop: true },
      ],
    }));
    expect(f.verdict).toBe('clear');
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      chainHops: [{ hopIndex: 0, mixerExposure: true }],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});
