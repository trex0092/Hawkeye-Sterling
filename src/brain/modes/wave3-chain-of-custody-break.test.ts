import { describe, expect, it } from 'vitest';
import chainOfCustodyBreakApply from './wave3-chain-of-custody-break.js';
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

describe('wave3-chain-of-custody-break', () => {
  it('returns inconclusive when no chainOfCustodyBatches supplied', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('chain_of_custody_break');
  });

  it('returns inconclusive when chainOfCustodyBatches is empty', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({ chainOfCustodyBatches: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire (clean batch)', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B001',
        events: [
          { custodianName: 'Custodian A', releasedAt: '2024-01-01T00:00:00Z', receivedMassGrams: 1000, releasedMassGrams: 1000, sealIntact: true },
          { custodianName: 'Custodian B', receivedAt: '2024-01-01T12:00:00Z', receivedMassGrams: 1000, releasedMassGrams: 1000, sealIntact: true },
        ],
        declaredMassGrams: 1000,
        finalRefinedMassGrams: 1000,
      }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags temporal_gap when gap between release and next receipt > 48h', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B002',
        events: [
          { custodianName: 'Custodian A', releasedAt: '2024-01-01T00:00:00Z' },
          { custodianName: 'Custodian B', receivedAt: '2024-01-03T01:00:00Z' }, // 49h gap
        ],
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.verdict).toBe('flag');
  });

  it('does not flag temporal_gap when gap <= 48h', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B003',
        events: [
          { custodianName: 'Custodian A', releasedAt: '2024-01-01T00:00:00Z' },
          { custodianName: 'Custodian B', receivedAt: '2024-01-02T23:00:00Z' }, // 47h
        ],
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('skips temporal_gap when releasedAt or receivedAt is missing', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B004',
        events: [
          { custodianName: 'Custodian A' }, // no releasedAt
          { custodianName: 'Custodian B', receivedAt: '2024-01-10T00:00:00Z' },
        ],
      }],
    }));
    // released is NaN → skip
    expect(r.score).toBe(0);
  });

  it('escalates when broken seal detected', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B005',
        events: [
          { custodianName: 'Custodian A', sealIntact: false },
        ],
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag broken seal when sealIntact is true', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B006',
        events: [
          { custodianName: 'Custodian A', sealIntact: true },
        ],
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when per-handoff mass loss >= 2%', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B007',
        events: [
          { custodianName: 'A', releasedMassGrams: 1000 },
          { custodianName: 'B', receivedMassGrams: 979 }, // 2.1% loss
        ],
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags per-handoff mass loss when >= 0.5% but < 2%', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B008',
        events: [
          { custodianName: 'A', releasedMassGrams: 1000 },
          { custodianName: 'B', receivedMassGrams: 994 }, // 0.6% loss
        ],
      }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag per-handoff mass loss when < 0.5%', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B009',
        events: [
          { custodianName: 'A', releasedMassGrams: 1000 },
          { custodianName: 'B', receivedMassGrams: 996 }, // 0.4% loss
        ],
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('skips per-handoff mass check when releasedMassGrams = 0', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B010',
        events: [
          { custodianName: 'A', releasedMassGrams: 0 },
          { custodianName: 'B', receivedMassGrams: 100 },
        ],
      }],
    }));
    // released = 0 → condition fails
    expect(r.score).toBe(0);
  });

  it('skips per-handoff mass check when nextReceived = 0', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B011',
        events: [
          { custodianName: 'A', releasedMassGrams: 1000 },
          { custodianName: 'B', receivedMassGrams: 0 },
        ],
      }],
    }));
    // nextReceived = 0 → condition fails
    expect(r.score).toBe(0);
  });

  it('escalates when end-to-end mass loss >= 2%', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B012',
        events: [],
        declaredMassGrams: 1000,
        finalRefinedMassGrams: 979, // 2.1% loss
      }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('does not flag end-to-end when loss < 2%', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B013',
        events: [],
        declaredMassGrams: 1000,
        finalRefinedMassGrams: 990, // 1% loss
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('skips end-to-end check when declaredMassGrams is 0', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        batchId: 'B014',
        events: [],
        declaredMassGrams: 0,
        finalRefinedMassGrams: 500,
      }],
    }));
    expect(r.score).toBe(0);
  });

  it('skips end-to-end check when declaredMassGrams or finalRefinedMassGrams is undefined', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{ batchId: 'B015', events: [] }],
    }));
    expect(r.score).toBe(0);
  });

  it('uses (unidentified) when batchId is missing', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{
        events: [{ sealIntact: false }],
      }],
    }));
    expect(r.evidence).toContain('(unidentified)');
  });

  it('handles empty events array gracefully', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [{ batchId: 'B016', events: [] }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('accumulates multiple signals across multiple batches', async () => {
    const r = await chainOfCustodyBreakApply(makeCtx({
      chainOfCustodyBatches: [
        {
          batchId: 'B017',
          events: [{ sealIntact: false }],
        },
        {
          batchId: 'B018',
          events: [
            { custodianName: 'A', releasedMassGrams: 1000 },
            { custodianName: 'B', receivedMassGrams: 950 }, // 5% → escalate
          ],
        },
      ],
    }));
    expect(r.verdict).toBe('escalate');
    expect(r.score).toBeGreaterThan(0.5);
  });
});
