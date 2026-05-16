import { describe, expect, it } from 'vitest';
import { run } from '../engine.js';
import { FACULTIES } from '../faculties.js';
import type { EvidenceItem } from '../evidence.js';

describe('engine — end-to-end fusion + introspection pipeline', () => {
  it('produces a verdict with posterior, firepower, introspection, and methodology', async () => {
    const verdict = await run({
      subject: { name: 'Acme Holdings LLC', type: 'entity' },
      evidence: {
        sanctionsHits: [{ list: 'OFAC_SDN', score: 0.99 }],
        adverseMedia: [{ source: 'Reuters', date: '2025-01-15' }],
      },
    });
    expect(verdict.runId).toMatch(/^[0-9a-f]{16}$/);
    expect(verdict.findings.length).toBeGreaterThan(0);
    expect(verdict.chain.length).toBeGreaterThan(0);
    expect(verdict.posterior).toBeDefined();
    expect(verdict.posterior!).toBeGreaterThan(0);
    expect(verdict.firepower).toBeDefined();
    expect(verdict.firepower!.activations.length).toBe(FACULTIES.length);
    expect(verdict.introspection).toBeDefined();
    expect(verdict.methodology).toMatch(/Fusion methodology/);
  });

  it('runs the six always-on meta modes LAST in the chain', async () => {
    const verdict = await run({
      subject: { name: 'X', type: 'individual' },
    });
    const metaIds = [
      'cognitive_bias_audit', 'confidence_calibration', 'popper_falsification',
      'source_triangulation', 'triangulation', 'occam_vs_conspiracy',
    ];
    const chainModeOrder = verdict.findings.map((f) => f.modeId);
    const indices = metaIds
      .map((id) => chainModeOrder.indexOf(id))
      .filter((i) => i >= 0);
    // All meta modes that fired should appear after all non-meta modes.
    const nonMetaMaxIdx = chainModeOrder
      .map((id, i) => (metaIds.includes(id) ? -1 : i))
      .reduce((a, b) => (b > a ? b : a), -1);
    for (const idx of indices) expect(idx).toBeGreaterThan(nonMetaMaxIdx);
  });

  it('attenuates posterior when evidenceIndex reports weak sources', async () => {
    const weakIdx = new Map<string, EvidenceItem>([
      ['adverse_media', {
        id: 'adverse_media', kind: 'social_media',
        title: 'anonymous blog post', observedAt: new Date().toISOString(),
        languageIso: 'en', credibility: 'weak',
      }],
    ]);
    const strongIdx = new Map<string, EvidenceItem>([
      ['adverse_media', {
        id: 'adverse_media', kind: 'regulator_press_release',
        title: 'regulator release', observedAt: new Date().toISOString(),
        languageIso: 'en', credibility: 'authoritative',
      }],
    ]);
    const weak = await run({
      subject: { name: 'X', type: 'individual' },
      evidence: { adverseMedia: [{}] },
      evidenceIndex: weakIdx,
    });
    const strong = await run({
      subject: { name: 'X', type: 'individual' },
      evidence: { adverseMedia: [{}] },
      evidenceIndex: strongIdx,
    });
    // Authoritative evidence displaces the posterior further from the prior
    // than weak/anonymous evidence, regardless of whether the brain's base
    // assessment is higher or lower than the prior.
    const priorVal = strong.prior ?? 0.1;
    const strongDisp = Math.abs((strong.posterior ?? 0) - priorVal);
    const weakDisp = Math.abs((weak.posterior ?? 0) - priorVal);
    expect(strongDisp).toBeGreaterThan(weakDisp);
  });
});
