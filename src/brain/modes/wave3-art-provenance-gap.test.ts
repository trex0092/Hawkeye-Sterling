import { describe, expect, it } from 'vitest';
import artProvenanceGapApply from './wave3-art-provenance-gap.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-art-provenance-gap', () => {
  it('returns inconclusive when no artTransactions supplied', async () => {
    const result = await artProvenanceGapApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.modeId).toBe('art_auction_provenance_gap');
  });

  it('returns inconclusive when artTransactions is empty array', async () => {
    const result = await artProvenanceGapApply(makeCtx({ artTransactions: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when transaction has full provenance chain and no red flags', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p1',
        title: 'Safe Art',
        saleAmountUsd: 500_000,
        provenanceChain: [
          { owner: 'Alice', from: '2000-01-01', to: '2005-01-01' },
          { owner: 'Bob', from: '2005-02-01', to: '2010-01-01' },
        ],
        catalogueRaisonneListed: true,
        buyerType: 'museum',
        freeportStorage: false,
      }],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.score).toBe(0);
  });

  it('flags no_provenance when provenanceChain is empty', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p1',
        title: 'Mystery Art',
        provenanceChain: [],
        saleAmountUsd: 500_000,
      }],
    }));
    expect(result.evidence).toContain('Mystery Art');
  });

  it('flags no_provenance when provenanceChain is missing', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{ pieceId: 'p-no-prov' }],
    }));
    expect(result.evidence).toContain('p-no-prov');
    expect(result.score).toBeGreaterThan(0);
  });

  it('detects provenance_time_gap when gap > 20 years', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p2',
        provenanceChain: [
          { owner: 'Alice', from: '1950-01-01', to: '1960-01-01' },
          { owner: 'Bob', from: '1985-01-01' },
        ],
      }],
    }));
    expect(result.score).toBeGreaterThan(0);
    // gap = 25 years > 20
  });

  it('does NOT flag provenance_time_gap when gap <= 20 years', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p3',
        provenanceChain: [
          { owner: 'Alice', from: '2000-01-01', to: '2010-01-01' },
          { owner: 'Bob', from: '2015-01-01' },
        ],
      }],
    }));
    // gap = 5 years — no gap signal
    const _gapHit = result.evidence.some(e => e.includes('Alice') || e.includes('Bob'));
    // Only gap signals would include owner names in evidence — no other reason
    // safe check: just verify score is 0 for this clean transaction
    expect(result.score).toBe(0);
  });

  it('skips chain entries that lack to/from fields', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p4',
        provenanceChain: [
          { owner: 'Alice', from: '2000-01-01' }, // no .to
          { owner: 'Bob', from: '2025-01-01' },   // would be 25y gap but prev.to is missing
        ],
      }],
    }));
    // Gap not computed because prev.to is missing
    expect(result.score).toBe(0);
  });

  it('flags no_catalogue_raisonne when catalogueRaisonneListed is false and artist present', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p5',
        artist: 'Famous Artist',
        catalogueRaisonneListed: false,
        provenanceChain: [{ owner: 'Alice', from: '2000-01-01', to: '2020-01-01' }],
      }],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does not flag catalogue_raisonne when artist missing', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p6',
        catalogueRaisonneListed: false,
        provenanceChain: [{ owner: 'Alice', from: '2000-01-01', to: '2020-01-01' }],
      }],
    }));
    expect(result.score).toBe(0);
  });

  it('flags shell_buyer when buyerType is shell', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p7',
        buyerType: 'shell',
        buyerEntity: 'ShellCo Ltd',
        provenanceChain: [{ owner: 'A', from: '2000-01-01', to: '2020-01-01' }],
      }],
    }));
    expect(result.evidence).toContain('ShellCo Ltd');
  });

  it('flags freeport_rapid_resale when freeportStorage and rapidResaleDays < 365', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p8',
        freeportStorage: true,
        rapidResaleDays: 30,
        provenanceChain: [{ owner: 'A', from: '2000-01-01', to: '2020-01-01' }],
      }],
    }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT flag freeport_rapid_resale when rapidResaleDays >= 365', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p9',
        freeportStorage: true,
        rapidResaleDays: 400,
        provenanceChain: [{ owner: 'A', from: '2000-01-01', to: '2020-01-01' }],
      }],
    }));
    expect(result.score).toBe(0);
  });

  it('flags freeport_rapid_resale with no rapidResaleDays = no flag', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p9b',
        freeportStorage: true,
        provenanceChain: [{ owner: 'A', from: '2000-01-01', to: '2020-01-01' }],
      }],
    }));
    expect(result.score).toBe(0);
  });

  it('flags self_dealing when sellerEntity === buyerEntity', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p10',
        sellerEntity: 'SameCo',
        buyerEntity: 'SameCo',
        provenanceChain: [{ owner: 'A', from: '2000-01-01', to: '2020-01-01' }],
      }],
    }));
    expect(result.evidence).toContain('SameCo');
  });

  it('flags high_value_no_provenance when saleAmountUsd >= 1M and no provenance', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p11',
        saleAmountUsd: 2_000_000,
        provenanceChain: [],
      }],
    }));
    // Should have both no_provenance (0.15) and high_value_no_provenance (0.3) = 0.45 → flag
    expect(result.verdict).toBe('flag');
  });

  it('escalates when multiple signals push score >= 0.6', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{
        pieceId: 'p12',
        saleAmountUsd: 2_000_000,
        sellerEntity: 'SameCo',
        buyerEntity: 'SameCo',
        provenanceChain: [],
        buyerType: 'shell',
        freeportStorage: true,
        rapidResaleDays: 10,
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('handles missing pieceId gracefully using ? fallback', async () => {
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [{ provenanceChain: [] }],
    }));
    expect(result.evidence).toContain('?');
  });

  it('clamps score above 0.7 with compression', async () => {
    // Create many overlapping signals
    const result = await artProvenanceGapApply(makeCtx({
      artTransactions: [
        {
          saleAmountUsd: 5_000_000,
          sellerEntity: 'X',
          buyerEntity: 'X',
          provenanceChain: [],
          buyerType: 'shell',
          freeportStorage: true,
          rapidResaleDays: 5,
          catalogueRaisonneListed: false,
          artist: 'Big Artist',
        },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.verdict).toBe('escalate');
  });
});
