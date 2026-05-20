import { describe, expect, it } from 'vitest';
import vesselAisGapApply from './wave3-vessel-ais-gap.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Vessel', type: 'vessel' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-vessel-ais-gap', () => {
  it('returns inconclusive when no aisReports and no vessel context', async () => {
    const r = await vesselAisGapApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('vessel_ais_gap');
  });

  it('returns clear when reports present but no gaps or signals', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { imo: '9999999', timestamp: '2024-01-01T00:00:00Z', reportedDestination: 'DUBAI' },
        { imo: '9999999', timestamp: '2024-01-01T06:00:00Z', reportedDestination: 'DUBAI' },
      ],
      vessel: { imo: '9999999', declaredArrivalPort: 'DUBAI' },
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags ais_dark_period when gap >= 12h (weight 0.1 for 12-24h)', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z' },
        { timestamp: '2024-01-01T13:00:00Z' }, // 13h gap
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag ais_dark_period when gap < 12h', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z' },
        { timestamp: '2024-01-01T11:00:00Z' }, // 11h
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('ais_dark_period weight 0.2 for 24-48h gap', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z' },
        { timestamp: '2024-01-02T06:00:00Z' }, // 30h
      ],
    }));
    expect(r.score).toBe(0.2);
  });

  it('ais_dark_period weight 0.3 for >= 48h gap', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z' },
        { timestamp: '2024-01-03T01:00:00Z' }, // 49h
      ],
    }));
    expect(r.score).toBe(0.3);
  });

  it('handles single report (no gap possible)', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [{ timestamp: '2024-01-01T00:00:00Z' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('handles reports without timestamps (filters them out)', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { imo: '111' },
        { imo: '222' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags sanctioned_port_destination when reportedDestination is sanctioned port', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z', reportedDestination: 'BANDAR ABBAS' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags declared_sanctioned_arrival when vessel declaredArrivalPort is sanctioned', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [],
      vessel: { declaredArrivalPort: 'TARTUS' },
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('handles empty reportedDestination (no sanctioned port flag)', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z' },
        { timestamp: '2024-01-01T02:00:00Z' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags unexpected_destination when AIS destination differs from declared arrival', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z', reportedDestination: 'SINGAPORE' },
      ],
      vessel: { declaredArrivalPort: 'DUBAI' },
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag unexpected_destination when AIS destination matches declared', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z', reportedDestination: 'DUBAI' },
      ],
      vessel: { declaredArrivalPort: 'DUBAI' },
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag unexpected_destination when no declaredArrivalPort', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z', reportedDestination: 'SOMEWHERE' },
      ],
      vessel: {},
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag unexpected_destination when no AIS reported destinations', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z' }, // no reportedDestination
      ],
      vessel: { declaredArrivalPort: 'DUBAI' },
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags flag_hopping when >= 2 flag changes in last 24 months', async () => {
    const now = Date.now();
    const recentDate = new Date(now - 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [],
      vessel: {
        flagHistory: [
          { flagState: 'PA', from: recentDate },
          { flagState: 'LR', from: recentDate },
          { flagState: 'MH', from: recentDate },
        ],
      },
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag_hopping when < 2 recent changes', async () => {
    const recentDate = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [],
      vessel: {
        flagHistory: [
          { flagState: 'PA', from: recentDate },
          { flagState: 'LR', from: recentDate },
        ],
        // Only 2 entries in history, threshold requires >= FLAG_HOP_THRESHOLD+1 = 3 entries
      },
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when no vessel context', async () => {
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z' },
        { timestamp: '2024-01-01T05:00:00Z' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates when score >= 0.6', async () => {
    const now = Date.now();
    const recentDate = new Date(now - 3 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await vesselAisGapApply(makeCtx({
      aisReports: [
        { timestamp: '2024-01-01T00:00:00Z', reportedDestination: 'BANDAR ABBAS' },
        { timestamp: '2024-01-05T00:00:00Z', reportedDestination: 'SINGAPORE' }, // 96h gap → 0.3 + sanctioned 0.3
      ],
      vessel: {
        declaredArrivalPort: 'DUBAI',
        flagHistory: [
          { flagState: 'PA', from: recentDate },
          { flagState: 'LR', from: recentDate },
          { flagState: 'MH', from: recentDate },
        ],
      },
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('produces correct modeId and category', async () => {
    const r = await vesselAisGapApply(makeCtx());
    expect(r.modeId).toBe('vessel_ais_gap');
    expect(r.category).toBe('sectoral_typology');
  });
});
