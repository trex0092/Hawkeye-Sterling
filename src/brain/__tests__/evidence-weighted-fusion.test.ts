import { describe, expect, it } from 'vitest';
import { adjustForEvidence, indexEvidence } from '../evidence-weighted-fusion.js';
import type { Finding, FusionResult } from '../types.js';
import type { EvidenceItem } from '../evidence.js';

function baseFusion(score: number, conf: number): FusionResult {
  return {
    outcome: 'flag',
    score,
    confidence: conf,
    weightedScore: score,
    prior: 0.2,
    posterior: 0.5,
    primaryHypothesis: 'illicit_risk',
    posteriorsByHypothesis: { illicit_risk: 0.5 },
    conflicts: [],
    consensus: 'weak',
    contributorCount: 3,
    methodology: 'base fusion',
    firepower: {
      activations: [],
      modesFired: 3,
      facultiesEngaged: 2,
      categoriesSpanned: 2,
      independentEvidenceCount: 2,
      firepowerScore: 0.4,
    },
  };
}

function finding(modeId: string, score: number, conf: number, evidence: string[]): Finding {
  return {
    modeId,
    category: 'compliance_framework',
    faculties: ['reasoning'],
    score,
    confidence: conf,
    verdict: 'flag',
    rationale: 'test',
    evidence,
    producedAt: Date.now(),
  };
}

function ev(id: string, credibility: EvidenceItem['credibility'], observed: string, kind: EvidenceItem['kind'] = 'news_article'): EvidenceItem {
  return { id, kind, title: id, observedAt: observed, languageIso: 'en', credibility };
}

describe('evidence-weighted-fusion', () => {
  it('is a no-op when no evidence is cited', () => {
    const base = baseFusion(0.5, 0.7);
    const result = adjustForEvidence(base, [finding('m1', 0.5, 0.7, [])], new Map());
    expect(result.score).toBe(base.score);
    expect(result.cited).toEqual([]);
  });

  it('pulls score up when evidence is authoritative and fresh', () => {
    const base = baseFusion(0.4, 0.6);
    const findings = [
      finding('m1', 0.8, 0.8, ['ev1']),
      finding('m2', 0.8, 0.8, ['ev1']),
    ];
    const ix = indexEvidence([ev('ev1', 'authoritative', new Date().toISOString(), 'regulator_press_release')]);
    const r = adjustForEvidence(base, findings, ix, { evidenceWeight: 0.7 });
    expect(r.score).toBeGreaterThan(base.score);
    expect(r.cited[0]!.credibility).toBeGreaterThan(0.9);
    expect(r.cited[0]!.freshness).toBeGreaterThan(0.9);
  });

  it('caps to P8 when training-data evidence is cited', () => {
    const base = baseFusion(0.8, 0.9);
    const findings = [finding('m1', 0.9, 0.9, ['ev1'])];
    const ix = indexEvidence([ev('ev1', 'primary', new Date().toISOString(), 'training_data')]);
    const r = adjustForEvidence(base, findings, ix);
    expect(r.score).toBeLessThanOrEqual(0.6);
    expect(r.confidence).toBeLessThanOrEqual(0.5);
    expect(r.notes.join(' ')).toContain('P8');
  });

  it('pulls posterior toward prior when cited evidence is stale', () => {
    const base = baseFusion(0.5, 0.8);
    const veryOld = '2015-01-01T00:00:00Z';
    const findings = [finding('m1', 0.7, 0.6, ['ev1'])];
    const ix = indexEvidence([ev('ev1', 'reputable', veryOld)]);
    const r = adjustForEvidence(base, findings, ix);
    // posterior should move closer to prior (0.2) than base posterior (0.5).
    expect(Math.abs(r.posterior - base.prior)).toBeLessThan(Math.abs(base.posterior - base.prior));
  });
});
