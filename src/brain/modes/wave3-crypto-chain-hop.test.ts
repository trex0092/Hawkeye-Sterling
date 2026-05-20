import { describe, expect, it } from 'vitest';
import cryptoChainHopApply from './wave3-crypto-chain-hop.js';
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

describe('wave3-crypto-chain-hop', () => {
  it('returns inconclusive when no chainHops supplied', async () => {
    const r = await cryptoChainHopApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('crypto_chain_hop_layering');
  });

  it('returns inconclusive when chainHops is empty', async () => {
    const r = await cryptoChainHopApply(makeCtx({ chainHops: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', fromAsset: 'BTC', toAsset: 'ETH', fromChain: 'bitcoin', toChain: 'ethereum' },
        { hopId: 'h2', fromAsset: 'ETH', toAsset: 'USDT', fromChain: 'ethereum', toChain: 'ethereum' },
      ],
    }));
    // 2 chains, 3 assets, no mixer, no bridge, no swap → clear
    expect(r.verdict).toBe('clear');
  });

  it('flags multi_chain_hop when distinct chains >= 3', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', fromChain: 'ethereum', toChain: 'bsc' },
        { hopId: 'h2', fromChain: 'bsc', toChain: 'avalanche' },
      ],
    }));
    // ethereum, bsc, avalanche → 3 chains
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag multi_chain_hop when distinct chains < 3', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', fromChain: 'ethereum', toChain: 'bsc' },
      ],
    }));
    // 2 chains → no flag
    expect(r.score).toBe(0);
  });

  it('flags multi_asset_hop when distinct assets >= 4', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', fromAsset: 'BTC', toAsset: 'ETH' },
        { hopId: 'h2', fromAsset: 'ETH', toAsset: 'USDT' },
        { hopId: 'h3', fromAsset: 'USDT', toAsset: 'DAI' },
      ],
    }));
    // BTC, ETH, USDT, DAI → 4 assets
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag multi_asset_hop when distinct assets < 4', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', fromAsset: 'BTC', toAsset: 'ETH' },
        { hopId: 'h2', fromAsset: 'ETH', toAsset: 'USDT' },
      ],
    }));
    // BTC, ETH, USDT → 3 assets
    expect(r.score).toBe(0);
  });

  it('flags mixer_in_chain when isMixerInvolved >= 1', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [{ hopId: 'h1', isMixerInvolved: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag mixer when no hops have isMixerInvolved = true', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [{ hopId: 'h1', isMixerInvolved: false }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags multi_bridge when bridgeHops >= 2', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', bridgeProtocol: 'Wormhole' },
        { hopId: 'h2', bridgeProtocol: 'Stargate' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag multi_bridge when bridgeHops < 2', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [{ hopId: 'h1', bridgeProtocol: 'Wormhole' }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags rapid_swaps when swapHops >= 3', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', swapProtocol: 'Uniswap' },
        { hopId: 'h2', swapProtocol: 'SushiSwap' },
        { hopId: 'h3', swapProtocol: 'Curve' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag rapid_swaps when swapHops < 3', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', swapProtocol: 'Uniswap' },
        { hopId: 'h2', swapProtocol: 'SushiSwap' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('counts undefined chains/assets but filters via filter(Boolean)', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1' }, // no chain or asset
        { hopId: 'h2' },
      ],
    }));
    // all undefined → filter(Boolean) removes them → 0 distinct chains/assets
    expect(r.score).toBe(0);
  });

  it('escalates when multiple signals fire', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', fromChain: 'ethereum', toChain: 'bsc', fromAsset: 'BTC', toAsset: 'ETH', bridgeProtocol: 'Wormhole', isMixerInvolved: true },
        { hopId: 'h2', fromChain: 'bsc', toChain: 'avalanche', fromAsset: 'ETH', toAsset: 'USDT', bridgeProtocol: 'Stargate', swapProtocol: 'Uniswap' },
        { hopId: 'h3', fromChain: 'avalanche', toChain: 'solana', fromAsset: 'USDT', toAsset: 'DAI', swapProtocol: 'SushiSwap' },
        { hopId: 'h4', fromChain: 'solana', toChain: 'polygon', fromAsset: 'DAI', toAsset: 'MATIC', swapProtocol: 'Curve' },
      ],
    }));
    // multi_chain: 5 chains, multi_asset: 6 assets, mixer: 1, bridges: 2, swaps: 3
    expect(r.verdict).toBe('escalate');
  });

  it('clamps score to 1', async () => {
    const r = await cryptoChainHopApply(makeCtx({
      chainHops: [
        { hopId: 'h1', fromChain: 'c1', toChain: 'c2', fromAsset: 'a1', toAsset: 'a2', bridgeProtocol: 'B1', swapProtocol: 'S1', isMixerInvolved: true },
        { hopId: 'h2', fromChain: 'c3', toChain: 'c4', fromAsset: 'a3', toAsset: 'a4', bridgeProtocol: 'B2', swapProtocol: 'S2' },
        { hopId: 'h3', fromChain: 'c5', toChain: 'c6', fromAsset: 'a5', toAsset: 'a6', swapProtocol: 'S3' },
      ],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
