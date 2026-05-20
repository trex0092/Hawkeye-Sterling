import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import mixerForensicsApply from './wave3-mixer-forensics.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('mixer_forensics', () => {
  it('returns inconclusive when no transactions provided', async () => {
    const result = await mixerForensicsApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('mixer_forensics');
  });

  it('returns inconclusive when transactions is empty array', async () => {
    const result = await mixerForensicsApply(makeCtx({ transactions: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', fromAddress: '0x1234', toAddress: '0x5678', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  // Known mixer detection
  it('fires known_mixer for Tornado Cash address', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        {
          hash: '0xabc123',
          toAddress: '0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF',
          amount: 1,
          asset: 'ETH',
          timestamp: '2024-01-01T10:00:00Z',
        },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.rationale).toContain('known_mixer');
  });

  it('fires known_mixer using fromAddress when toAddress is missing', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        {
          hash: '0xabc123',
          fromAddress: '0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF',
          amount: 1,
          asset: 'ETH',
          timestamp: '2024-01-01T10:00:00Z',
        },
      ],
    }));
    expect(result.rationale).toContain('known_mixer');
  });

  it('skips transactions with empty addresses', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', amount: 1, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.rationale).not.toContain('known_mixer');
  });

  // Round amount detection
  it('fires round_amount for canonical ETH mixer denomination', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: '0x1234', amount: 0.1, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.rationale).toContain('round_amount');
  });

  it('fires round_amount for 1 BTC', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: 'bc1qabc', amount: 1, asset: 'BTC', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.rationale).toContain('round_amount');
  });

  it('fires round_amount for USDT canonical amount', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: '0x1234', amount: 10000, asset: 'USDT', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.rationale).toContain('round_amount');
  });

  it('does NOT fire round_amount for non-canonical denomination', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: '0x1234', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.rationale).not.toContain('round_amount');
  });

  it('does NOT fire round_amount when amount is undefined', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: '0x1234', asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.rationale).not.toContain('round_amount');
  });

  it('does NOT fire round_amount when asset is unknown', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: '0x1234', amount: 1, asset: 'XMR', timestamp: '2024-01-01T10:00:00Z' },
      ],
    }));
    expect(result.rationale).not.toContain('round_amount');
  });

  // Time burst detection
  it('does NOT fire time_burst when fewer than 3 transactions', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xa', toAddress: '0x1', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
        { hash: '0xb', toAddress: '0x2', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:01Z' },
      ],
    }));
    expect(result.rationale).not.toContain('time_burst');
  });

  it('fires time_burst when 3+ transactions within 60 seconds', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xa', toAddress: '0x1', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
        { hash: '0xb', toAddress: '0x2', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:30Z' },
        { hash: '0xc', toAddress: '0x3', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:59Z' },
      ],
    }));
    expect(result.rationale).toContain('time_burst');
  });

  it('does NOT fire time_burst when transactions span more than 60 seconds', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xa', toAddress: '0x1', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
        { hash: '0xb', toAddress: '0x2', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:01:01Z' },
        { hash: '0xc', toAddress: '0x3', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:02:00Z' },
      ],
    }));
    expect(result.rationale).not.toContain('time_burst');
  });

  it('skips transactions without timestamps in time burst detection', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xa', toAddress: '0x1', amount: 2.5, asset: 'ETH' },
        { hash: '0xb', toAddress: '0x2', amount: 2.5, asset: 'ETH' },
        { hash: '0xc', toAddress: '0x3', amount: 2.5, asset: 'ETH' },
      ],
    }));
    expect(result.rationale).not.toContain('time_burst');
  });

  // Peeling chain detection
  it('fires peeling_chain when splitGroupId group has >= 4 transactions', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xa', toAddress: '0x1', splitGroupId: 'G1', splitIndex: 0 },
        { hash: '0xb', toAddress: '0x2', splitGroupId: 'G1', splitIndex: 1 },
        { hash: '0xc', toAddress: '0x3', splitGroupId: 'G1', splitIndex: 2 },
        { hash: '0xd', toAddress: '0x4', splitGroupId: 'G1', splitIndex: 3 },
      ],
    }));
    expect(result.rationale).toContain('peeling_chain');
  });

  it('does NOT fire peeling_chain when group has < 4 transactions', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xa', toAddress: '0x1', splitGroupId: 'G1' },
        { hash: '0xb', toAddress: '0x2', splitGroupId: 'G1' },
        { hash: '0xc', toAddress: '0x3', splitGroupId: 'G1' },
      ],
    }));
    expect(result.rationale).not.toContain('peeling_chain');
  });

  it('does NOT fire peeling_chain when no splitGroupId', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xa', toAddress: '0x1' },
        { hash: '0xb', toAddress: '0x2' },
        { hash: '0xc', toAddress: '0x3' },
        { hash: '0xd', toAddress: '0x4' },
      ],
    }));
    expect(result.rationale).not.toContain('peeling_chain');
  });

  // Anonymity hops detection
  it('fires anonymity_hops when hopsToVASP >= 5', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc123456789', toAddress: '0x1234', hopsToVASP: 5 },
      ],
    }));
    expect(result.rationale).toContain('anonymity_hops');
  });

  it('does NOT fire anonymity_hops when hopsToVASP < 5', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: '0x1234', hopsToVASP: 4 },
      ],
    }));
    expect(result.rationale).not.toContain('anonymity_hops');
  });

  it('does NOT fire anonymity_hops when hopsToVASP is undefined', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc', toAddress: '0x1234' },
      ],
    }));
    expect(result.rationale).not.toContain('anonymity_hops');
  });

  it('escalates when multiple signals fire', async () => {
    // known_mixer(0.4) + round_amount(0.15) + anonymity_hops(0.15) = 0.7 => borderline escalate
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        {
          hash: '0xabc123',
          toAddress: '0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF',
          amount: 1,
          asset: 'ETH',
          hopsToVASP: 6,
          timestamp: '2024-01-01T10:00:00Z',
        },
      ],
    }));
    expect(result.score).toBeGreaterThanOrEqual(0.3);
  });

  it('applies diminishing returns for rawScore > 0.7', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc123', toAddress: '0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF', amount: 1, asset: 'ETH', hopsToVASP: 8, timestamp: '2024-01-01T10:00:00Z' },
        { hash: '0xdef456', toAddress: '0xd96f2B1c14Db8458374d9Aca76E26c3D18364307', amount: 10, asset: 'ETH', hopsToVASP: 6, timestamp: '2024-01-01T10:00:10Z' },
        { hash: '0xghi789', splitGroupId: 'G1' },
        { hash: '0xjkl012', splitGroupId: 'G1' },
        { hash: '0xmno345', splitGroupId: 'G1' },
        { hash: '0xpqr678', splitGroupId: 'G1' },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('only includes known_mixer addresses in evidence', async () => {
    const result = await mixerForensicsApply(makeCtx({
      transactions: [
        { hash: '0xabc123', toAddress: '0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF', amount: 1, asset: 'ETH', timestamp: '2024-01-01T10:00:00Z' },
        { hash: '0xdef456', toAddress: '0x1234567890', amount: 2.5, asset: 'ETH', timestamp: '2024-01-01T10:01:00Z' },
      ],
    }));
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0]).toContain('0x910Cbd52');
  });
});
