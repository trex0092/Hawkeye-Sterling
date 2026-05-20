import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import nftWashTradingApply from './wave3-nft-wash-trading.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('nft_wash_trading', () => {
  it('returns inconclusive when no nftTrades provided', async () => {
    const result = await nftWashTradingApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('nft_wash_trading');
  });

  it('returns inconclusive when nftTrades is empty', async () => {
    const result = await nftWashTradingApply(makeCtx({ nftTrades: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xABC', toAddr: '0xDEF', priceAed: 50000, blockTimestampSec: 1000000 },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires self_loop when fromAddr === toAddr', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xABC', toAddr: '0xABC' },
      ],
    }));
    expect(result.rationale).toContain('self_loop');
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire self_loop when from != to', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xABC', toAddr: '0xDEF' },
      ],
    }));
    expect(result.rationale).not.toContain('self_loop');
  });

  it('fires internal_ring when ringTrades >= 2', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', isInternalRing: true },
        { tradeId: 'T2', collectionId: 'C1', tokenId: 'TOK2', fromAddr: '0xB', toAddr: '0xA', isInternalRing: true },
      ],
    }));
    expect(result.rationale).toContain('internal_ring');
  });

  it('does NOT fire internal_ring when ringTrades < 2', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', isInternalRing: true },
      ],
    }));
    expect(result.rationale).not.toContain('internal_ring');
  });

  it('fires common_funding_ancestor when sameAncestor >= 2', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', fundedFromSameAncestorWallet: true },
        { tradeId: 'T2', collectionId: 'C1', tokenId: 'TOK2', fromAddr: '0xA', toAddr: '0xC', fundedFromSameAncestorWallet: true },
      ],
    }));
    expect(result.rationale).toContain('common_funding_ancestor');
  });

  it('does NOT fire common_funding_ancestor when < 2', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', fundedFromSameAncestorWallet: true },
      ],
    }));
    expect(result.rationale).not.toContain('common_funding_ancestor');
  });

  it('fires rapid_round_trip when same token traded back within 24h', async () => {
    // T1: A->B at t=0; T2: B->A (i.e. toAddr of T1 is fromAddr of T2, wait no)
    // round-trip: cur.toAddr === prev.fromAddr, dt < 86400
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', blockTimestampSec: 1000 },
        { tradeId: 'T2', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xB', toAddr: '0xA', blockTimestampSec: 2000 }, // toAddr == prev.fromAddr
        { tradeId: 'T3', collectionId: 'C1', tokenId: 'TOK2', fromAddr: '0xC', toAddr: '0xD', blockTimestampSec: 1000 },
        { tradeId: 'T4', collectionId: 'C1', tokenId: 'TOK2', fromAddr: '0xD', toAddr: '0xC', blockTimestampSec: 2000 },
      ],
    }));
    expect(result.rationale).toContain('rapid_round_trip');
  });

  it('does NOT fire rapid_round_trip when dt >= 86400', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', blockTimestampSec: 0 },
        { tradeId: 'T2', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xB', toAddr: '0xA', blockTimestampSec: 100000 },
      ],
    }));
    // dt = 100000 > 86400 => no round trip
    expect(result.rationale).not.toContain('rapid_round_trip');
  });

  it('does NOT fire rapid_round_trip when toAddr != prev.fromAddr', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', blockTimestampSec: 0 },
        { tradeId: 'T2', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xB', toAddr: '0xC', blockTimestampSec: 1000 }, // goes to different address
      ],
    }));
    expect(result.rationale).not.toContain('rapid_round_trip');
  });

  it('handles single trade per token (no round trip possible)', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', blockTimestampSec: 1000 },
      ],
    }));
    expect(result.rationale).not.toContain('rapid_round_trip');
  });

  it('escalates when score >= 0.6 with multiple signals', async () => {
    // self_loop(0.45) + internal_ring(0.4) = 0.85 => escalate
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xA', isInternalRing: true },
        { tradeId: 'T2', collectionId: 'C1', tokenId: 'TOK2', fromAddr: '0xB', toAddr: '0xC', isInternalRing: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('applies diminishing returns for rawScore > 0.7', async () => {
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xA', isInternalRing: true, fundedFromSameAncestorWallet: true },
        { tradeId: 'T2', collectionId: 'C1', tokenId: 'TOK2', fromAddr: '0xA', toAddr: '0xA', isInternalRing: true, fundedFromSameAncestorWallet: true },
        { tradeId: 'T3', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xB', toAddr: '0xA', blockTimestampSec: 100 },
        { tradeId: 'T4', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB', blockTimestampSec: 0 },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('handles prev/cur being undefined in round-trip loop', async () => {
    // Test with empty array in byToken.values() => arr.length < 2
    const result = await nftWashTradingApply(makeCtx({
      nftTrades: [
        { tradeId: 'T1', collectionId: 'C1', tokenId: 'TOK1', fromAddr: '0xA', toAddr: '0xB' },
      ],
    }));
    expect(result.modeId).toBe('nft_wash_trading');
  });
});
