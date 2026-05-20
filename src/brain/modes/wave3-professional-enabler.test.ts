import { describe, expect, it } from 'vitest';
import professionalEnablerApply from './wave3-professional-enabler.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Firm', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

const MS_48H = 48 * 60 * 60 * 1000;

describe('wave3-professional-enabler', () => {
  it('returns inconclusive when no professionalAccountFlows', async () => {
    const r = await professionalEnablerApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('professional_enabler_pattern');
  });

  it('returns inconclusive when flows is empty', async () => {
    const r = await professionalEnablerApply(makeCtx({ professionalAccountFlows: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals triggered', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', clientAccountTransitMs: MS_48H + 1, matterFileReferenced: true, multiClientSharedDestination: false, jurisdiction: 'AE' },
      ],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags rapid_transit when >= 3 flows with clientAccountTransitMs <= 48h', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', clientAccountTransitMs: MS_48H },
        { firmId: 'f1', clientAccountTransitMs: MS_48H - 1 },
        { firmId: 'f1', clientAccountTransitMs: 0 },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.rationale).toContain('rapid_transit');
  });

  it('does not flag rapid_transit when < 3', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', clientAccountTransitMs: MS_48H },
        { firmId: 'f1', clientAccountTransitMs: MS_48H },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags no_matter_file when >= 2 flows with matterFileReferenced=false', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', matterFileReferenced: false },
        { firmId: 'f1', matterFileReferenced: false },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag no_matter_file when only 1', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', matterFileReferenced: false },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags multi_client_shared_destination when >= 2 flows with multiClientSharedDestination=true', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', multiClientSharedDestination: true },
        { firmId: 'f1', multiClientSharedDestination: true },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag multi_client_shared when only 1', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', multiClientSharedDestination: true },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags secrecy_jurisdiction when >= 1 flow from secrecy haven', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', jurisdiction: 'CH' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags secrecy for BVI (case-insensitive)', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', jurisdiction: 'bvi' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag secrecy for non-haven jurisdictions', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', jurisdiction: 'AE' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag secrecy when jurisdiction is missing', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('escalates when combined signals >= 0.6', async () => {
    // rapid_transit(0.3) + no_matter_file(0.25) + multi_client(0.3) = 0.85
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1', clientAccountTransitMs: 0, matterFileReferenced: false, multiClientSharedDestination: true },
        { firmId: 'f1', clientAccountTransitMs: 0, matterFileReferenced: false, multiClientSharedDestination: true },
        { firmId: 'f1', clientAccountTransitMs: 0, matterFileReferenced: true },
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('flags when score 0.3-0.59', async () => {
    // rapid_transit(0.3) only
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { clientAccountTransitMs: 0 },
        { clientAccountTransitMs: 0 },
        { clientAccountTransitMs: 0 },
      ],
    }));
    expect(r.verdict).toBe('flag');
    expect(r.score).toBe(0.3);
  });

  it('skips clientAccountTransitMs check when undefined', async () => {
    const r = await professionalEnablerApply(makeCtx({
      professionalAccountFlows: [
        { firmId: 'f1' },
        { firmId: 'f1' },
        { firmId: 'f1' },
      ],
    }));
    expect(r.verdict).toBe('clear');
  });
});
