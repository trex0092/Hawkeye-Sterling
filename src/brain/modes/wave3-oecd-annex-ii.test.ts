import { describe, it, expect } from 'vitest';
import { oecdAnnexIIDisciplineApply } from './wave3-oecd-annex-ii.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-oecd-annex-ii', () => {
  it('returns inconclusive when no goldSupplyChain evidence', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.modeId).toBe('oecd_annex_ii_discipline');
  });

  it('returns clear when clean shipment', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP1',
        originCountry: 'AU',
        transitCountries: ['SG'],
        refinery: 'CleanRefinery',
        refineryRmapStatus: 'conformant',
        isCahraOrigin: false,
        hasArtisanalOrigin: false,
        hasMilitaryControl: false,
      }],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.score).toBe(0);
  });

  it('blocks when hasMilitaryControl is true', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP2',
        hasMilitaryControl: true,
      }],
    }));
    expect(result.verdict).toBe('block');
  });

  it('escalates when CAHRA-origin with not_enrolled refinery', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP3',
        isCahraOrigin: true,
        refineryRmapStatus: 'not_enrolled',
        hasMilitaryControl: false,
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('flags when CAHRA-origin with expired rmap', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP4',
        isCahraOrigin: true,
        refineryRmapStatus: 'expired',
        hasMilitaryControl: false,
      }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('flags when artisanal origin without CAHRA flag', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP5',
        hasArtisanalOrigin: true,
        isCahraOrigin: false,
        hasMilitaryControl: false,
      }],
    }));
    expect(result.verdict).toBe('flag');
  });

  it('does not flag artisanal+CAHRA combination', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP5b',
        hasArtisanalOrigin: true,
        isCahraOrigin: true,
        refineryRmapStatus: 'conformant',
        hasMilitaryControl: false,
      }],
    }));
    // artisanal_no_cahra not triggered since isCahraOrigin=true
    // cahra_no_rmap not triggered since status is conformant
    expect(result.verdict).toBe('clear');
  });

  it('escalates when transit through sanctioned country', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP6',
        transitCountries: ['IR', 'SG'],
        hasMilitaryControl: false,
        isCahraOrigin: false,
        hasArtisanalOrigin: false,
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });

  it('handles missing transitCountries gracefully', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP7',
        hasMilitaryControl: false,
        isCahraOrigin: false,
      }],
    }));
    expect(result.verdict).toBe('clear');
  });

  it('handles missing shipmentId in ref', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{ hasMilitaryControl: true }],
    }));
    expect(result.verdict).toBe('block');
    expect(result.evidence[0]).toBe('(unidentified)');
  });

  it('handles multiple shipments with mixed signals', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [
        { shipmentId: 'A', hasMilitaryControl: false, isCahraOrigin: false },
        { shipmentId: 'B', hasMilitaryControl: true },
        { shipmentId: 'C', transitCountries: ['KP'] },
      ],
    }));
    expect(result.verdict).toBe('block');
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it('handles RU in transitCountries (uppercase normalization)', async () => {
    const result = await oecdAnnexIIDisciplineApply(makeCtx({
      goldSupplyChain: [{
        shipmentId: 'SHP8',
        transitCountries: ['ru'], // lowercase
        hasMilitaryControl: false,
      }],
    }));
    expect(result.verdict).toBe('escalate');
  });
});
