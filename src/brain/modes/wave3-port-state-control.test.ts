import { describe, expect, it } from 'vitest';
import portStateControlApply from './wave3-port-state-control.js';
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

describe('wave3-port-state-control', () => {
  it('returns inconclusive when no pscRecords', async () => {
    const r = await portStateControlApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('port_state_control');
  });

  it('returns inconclusive when pscRecords is empty array', async () => {
    const r = await portStateControlApply(makeCtx({ pscRecords: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no detentions or deficiencies', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', inspectionDate: '2024-01-01', portCountry: 'AE', mou: 'paris', detentions: 0, deficiencies: 0 }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags detention (non-tier1 mou)', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', inspectionDate: '2024-01-01', mou: 'caribbean', detentions: 1, deficiencies: 2 }],
    }));
    expect(r.verdict).toBe('flag');
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates on tier1 detention (paris mou)', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', inspectionDate: '2024-01-01', mou: 'paris', detentions: 1 }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('escalates on tier1 detention (tokyo mou)', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', inspectionDate: '2024-01-01', mou: 'tokyo', detentions: 1 }],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags high deficiencies >= 10 (no detention)', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', mou: 'mediterranean', detentions: 0, deficiencies: 10 }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('does not flag deficiencies < 10', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', detentions: 0, deficiencies: 9 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates on repeat_detentions for same IMO (>= 2)', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [
        { imo: '9999999', inspectionDate: '2024-01-01', mou: 'mediterranean', detentions: 1 },
        { imo: '9999999', inspectionDate: '2024-06-01', mou: 'mediterranean', detentions: 1 },
      ],
    }));
    expect(r.verdict).toBe('escalate');
    const evidences = r.evidence.join(' ');
    expect(evidences).toContain('9999999');
  });

  it('does not escalate for repeat_detentions when < 2 on same IMO', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [
        { imo: '1111111', inspectionDate: '2024-01-01', mou: 'caribbean', detentions: 1 },
        { imo: '2222222', inspectionDate: '2024-06-01', mou: 'caribbean', detentions: 1 },
      ],
    }));
    // different IMOs, no repeat
    expect(r.verdict).toBe('flag');
  });

  it('handles missing imo (no Map entry)', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ inspectionDate: '2024-01-01', mou: 'paris', detentions: 1 }],
    }));
    // No imo → not added to detentionsByImo map, still escalates due to tier1
    expect(r.verdict).toBe('escalate');
  });

  it('uses (unknown) fallback in ref when imo missing', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ mou: 'caribbean', detentions: 1 }],
    }));
    expect(r.evidence.some(e => e.includes('(unknown)'))).toBe(true);
  });

  it('uses us_uscg mou as non-tier1', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', mou: 'us_uscg', detentions: 1 }],
    }));
    // not in TIER1_MOUS → flag, not escalate (unless repeat)
    expect(r.verdict).toBe('flag');
  });

  it('tracks lastDetentionRef for rationale', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '7654321', inspectionDate: '2024-03-15', mou: 'paris', detentions: 2 }],
    }));
    expect(r.rationale).toContain('Last detention');
  });

  it('reports detentionsTotal and vessel count in rationale', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [
        { imo: '1111111', detentions: 2, mou: 'paris', inspectionDate: '2024-01-01' },
        { imo: '2222222', detentions: 1, mou: 'caribbean', inspectionDate: '2024-02-01' },
      ],
    }));
    expect(r.rationale).toContain('3 total detention(s)');
    expect(r.rationale).toContain('2 vessel(s)');
  });

  it('handles missing detentions field (defaults to 0 via ?? 0)', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', mou: 'paris', deficiencies: 10 }],
    }));
    // detentions ?? 0 → 0 (no detention signal), deficiencies=10 → flag
    expect(r.verdict).toBe('flag');
  });

  it('uses ? for missing portCountry and mou? for missing mou in label', async () => {
    const r = await portStateControlApply(makeCtx({
      pscRecords: [{ imo: '1234567', detentions: 1 }],
    }));
    // portCountry ?? '?' and mou ?? 'mou?' → evidence includes (unknown) but label in rationale has ? marks
    expect(r.score).toBeGreaterThan(0);
  });
});
