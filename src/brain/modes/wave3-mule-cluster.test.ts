import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import muleClusterApply from './wave3-mule-cluster.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('mule_cluster_detection', () => {
  it('returns inconclusive when no muleAccounts provided', async () => {
    const result = await muleClusterApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('mule_cluster_detection');
  });

  it('returns inconclusive when muleAccounts is empty', async () => {
    const result = await muleClusterApply(makeCtx({ muleAccounts: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'employed', netHoldingDays: 30, totalInflow: 10000, totalOutflow: 9000, openedAt: '2020-01-01' },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires common_source when single source appears in >= 4 accounts', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', inflowsFromIds: ['SRC001'] },
        { accountId: 'A2', inflowsFromIds: ['SRC001'] },
        { accountId: 'A3', inflowsFromIds: ['SRC001'] },
        { accountId: 'A4', inflowsFromIds: ['SRC001'] },
      ],
    }));
    expect(result.rationale).toContain('common_source');
    expect(result.verdict).toBe('clear'); // 0.25 < 0.3
  });

  it('does NOT fire common_source when source appears in < 4 accounts', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', inflowsFromIds: ['SRC001'] },
        { accountId: 'A2', inflowsFromIds: ['SRC001'] },
        { accountId: 'A3', inflowsFromIds: ['SRC001'] },
      ],
    }));
    expect(result.rationale).not.toContain('common_source');
  });

  it('fires common_destination when single destination appears in >= 4 accounts', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', outflowsToIds: ['DST001'] },
        { accountId: 'A2', outflowsToIds: ['DST001'] },
        { accountId: 'A3', outflowsToIds: ['DST001'] },
        { accountId: 'A4', outflowsToIds: ['DST001'] },
      ],
    }));
    expect(result.rationale).toContain('common_destination');
  });

  it('does NOT fire common_destination when < 4 accounts', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', outflowsToIds: ['DST001'] },
        { accountId: 'A2', outflowsToIds: ['DST001'] },
        { accountId: 'A3', outflowsToIds: ['DST001'] },
      ],
    }));
    expect(result.rationale).not.toContain('common_destination');
  });

  it('fires transit_only_cluster when >= 2 low-substance transit accounts', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'unemployed', netHoldingDays: 1, totalInflow: 10000, totalOutflow: 9900 },
        { accountId: 'A2', employmentStatus: 'student', netHoldingDays: 2, totalInflow: 5000, totalOutflow: 4950 },
      ],
    }));
    expect(result.rationale).toContain('transit_only_cluster');
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire transit_only_cluster when < 2 matching accounts', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'unemployed', netHoldingDays: 1, totalInflow: 10000, totalOutflow: 9900 },
        { accountId: 'A2', employmentStatus: 'employed', netHoldingDays: 1, totalInflow: 5000, totalOutflow: 4950 },
      ],
    }));
    expect(result.rationale).not.toContain('transit_only_cluster');
  });

  it('does NOT fire transit_only_cluster when netHoldingDays > 3', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'unemployed', netHoldingDays: 4, totalInflow: 10000, totalOutflow: 9900 },
        { accountId: 'A2', employmentStatus: 'student', netHoldingDays: 5, totalInflow: 5000, totalOutflow: 4950 },
      ],
    }));
    expect(result.rationale).not.toContain('transit_only_cluster');
  });

  it('does NOT fire transit_only_cluster when churn ratio >= 5%', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'unemployed', netHoldingDays: 1, totalInflow: 10000, totalOutflow: 9000 }, // 10% diff
        { accountId: 'A2', employmentStatus: 'student', netHoldingDays: 1, totalInflow: 5000, totalOutflow: 4500 },
      ],
    }));
    expect(result.rationale).not.toContain('transit_only_cluster');
  });

  it('fires transit_only_cluster for unknown employment status', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'unknown', netHoldingDays: 1, totalInflow: 10000, totalOutflow: 9980 },
        { accountId: 'A2', employmentStatus: 'unknown', netHoldingDays: 2, totalInflow: 5000, totalOutflow: 4990 },
      ],
    }));
    expect(result.rationale).toContain('transit_only_cluster');
  });

  it('does NOT fire transit_only_cluster when totalInflow is 0', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'unemployed', netHoldingDays: 1, totalInflow: 0, totalOutflow: 0 },
        { accountId: 'A2', employmentStatus: 'student', netHoldingDays: 1, totalInflow: 0, totalOutflow: 0 },
      ],
    }));
    expect(result.rationale).not.toContain('transit_only_cluster');
  });

  it('fires young_accounts when >= 3 accounts opened in last 90 days', async () => {
    const recentDate = new Date(Date.now() - 30 * 86400000).toISOString();
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', openedAt: recentDate, employmentStatus: 'employed' },
        { accountId: 'A2', openedAt: recentDate, employmentStatus: 'employed' },
        { accountId: 'A3', openedAt: recentDate, employmentStatus: 'employed' },
      ],
    }));
    expect(result.rationale).toContain('young_accounts');
  });

  it('does NOT fire young_accounts when < 3 accounts recently opened', async () => {
    const recentDate = new Date(Date.now() - 30 * 86400000).toISOString();
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', openedAt: recentDate, employmentStatus: 'employed' },
        { accountId: 'A2', openedAt: recentDate, employmentStatus: 'employed' },
        { accountId: 'A3', openedAt: '2020-01-01', employmentStatus: 'employed' },
      ],
    }));
    expect(result.rationale).not.toContain('young_accounts');
  });

  it('does NOT fire young_accounts when openedAt is undefined', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', employmentStatus: 'employed' },
        { accountId: 'A2', employmentStatus: 'employed' },
        { accountId: 'A3', employmentStatus: 'employed' },
      ],
    }));
    expect(result.rationale).not.toContain('young_accounts');
  });

  it('escalates when score >= 0.6 with multiple signals', async () => {
    // common_source(0.25) + transit_only(0.3) + young_accounts(0.15) = 0.7 => escalate
    const recentDate = new Date(Date.now() - 10 * 86400000).toISOString();
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1', inflowsFromIds: ['SRC001'], outflowsToIds: ['DST001'], employmentStatus: 'unemployed', netHoldingDays: 1, totalInflow: 10000, totalOutflow: 9980, openedAt: recentDate },
        { accountId: 'A2', inflowsFromIds: ['SRC001'], outflowsToIds: ['DST001'], employmentStatus: 'student', netHoldingDays: 2, totalInflow: 5000, totalOutflow: 4990, openedAt: recentDate },
        { accountId: 'A3', inflowsFromIds: ['SRC001'], outflowsToIds: ['DST001'], openedAt: recentDate },
        { accountId: 'A4', inflowsFromIds: ['SRC001'], outflowsToIds: ['DST001'] },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('handles accounts with undefined inflowsFromIds and outflowsToIds', async () => {
    const result = await muleClusterApply(makeCtx({
      muleAccounts: [
        { accountId: 'A1' },
        { accountId: 'A2' },
      ],
    }));
    expect(result.modeId).toBe('mule_cluster_detection');
  });
});
