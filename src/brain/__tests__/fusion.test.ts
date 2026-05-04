import { describe, expect, it } from 'vitest';
import { fuseFindings } from '../fusion.js';
import { FACULTIES } from '../faculties.js';
import type { EvidenceItem } from '../evidence.js';
import type { Finding } from '../types.js';

function f(partial: Partial<Finding> & { modeId: string }): Finding {
  return {
    modeId: partial.modeId,
    category: partial.category ?? 'logic',
    faculties: partial.faculties ?? ['reasoning'],
    score: partial.score ?? 0.5,
    confidence: partial.confidence ?? 0.7,
    verdict: partial.verdict ?? 'flag',
    rationale: partial.rationale ?? 'test',
    evidence: partial.evidence ?? [],
    producedAt: Date.now(),
    hypothesis: partial.hypothesis,
    likelihoodRatios: partial.likelihoodRatios,
    weight: partial.weight,
    tags: partial.tags,
  };
}

describe('fusion — Bayesian posterior composition', () => {
  it('updates posterior above prior when findings emit positive LRs', () => {
    const findings: Finding[] = [
      f({
        modeId: 'bayes_theorem',
        score: 0.6,
        confidence: 0.9,
        likelihoodRatios: [
          { evidenceId: 'e1', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 },
        ],
      }),
      f({
        modeId: 'modus_ponens',
        score: 0.8,
        confidence: 0.9,
        likelihoodRatios: [
          { evidenceId: 'e2', positiveGivenHypothesis: 0.85, positiveGivenNot: 0.2 },
        ],
      }),
    ];
    const r = fuseFindings(findings, { prior: 0.1 });
    expect(r.posterior).toBeGreaterThan(0.1);
    expect(r.bayesTrace).toBeDefined();
    expect(r.bayesTrace!.steps.length).toBe(2);
    expect(r.methodology).toMatch(/Bayesian update/);
  });

  it('meta-tagged findings do NOT contribute to posterior', () => {
    const findings: Finding[] = [
      f({ modeId: 'a', score: 0.9, confidence: 0.9 }),
      f({ modeId: 'b', score: 0.9, confidence: 0.9, tags: ['meta'] }),
    ];
    const r = fuseFindings(findings);
    expect(r.contributorCount).toBe(1);
  });

  it('stub findings do NOT contribute', () => {
    const findings: Finding[] = [
      f({ modeId: 'stub1', rationale: '[stub] pending', score: 0, confidence: 0, verdict: 'inconclusive' }),
      f({ modeId: 'real', score: 0.5, confidence: 0.7 }),
    ];
    const r = fuseFindings(findings);
    expect(r.contributorCount).toBe(1);
  });
});

describe('fusion — weighted aggregation and evidence credibility', () => {
  it('attenuates LR by evidence credibility when index supplied', () => {
    const idx = new Map<string, EvidenceItem>([
      ['weak:1', {
        id: 'weak:1', kind: 'social_media', title: 't',
        observedAt: new Date().toISOString(), languageIso: 'en',
        credibility: 'weak',
      }],
      ['auth:1', {
        id: 'auth:1', kind: 'sanctions_list', title: 't',
        observedAt: new Date().toISOString(), languageIso: 'en',
        credibility: 'authoritative',
      }],
    ]);
    const findings: Finding[] = [
      f({ modeId: 'weakf', score: 0.9, confidence: 0.9, evidence: ['weak:1'] }),
    ];
    const rWeak = fuseFindings(findings, { evidenceIndex: idx, prior: 0.1 });
    const rAuth = fuseFindings(
      [f({ modeId: 'authf', score: 0.9, confidence: 0.9, evidence: ['auth:1'] })],
      { evidenceIndex: idx, prior: 0.1 },
    );
    // Authoritative evidence should push posterior higher than weak evidence.
    expect(rAuth.posterior).toBeGreaterThan(rWeak.posterior);
  });
});

describe('fusion — conflict detection + outcome', () => {
  it('escalates on material conflict between high-score findings', () => {
    const findings: Finding[] = [
      f({ modeId: 'a', score: 0.9, confidence: 0.9, verdict: 'escalate' }),
      f({ modeId: 'b', score: 0.9, confidence: 0.9, verdict: 'escalate' }),
      f({ modeId: 'c', score: 0.9, confidence: 0.9, verdict: 'escalate' }),
      f({ modeId: 'd', score: 0.1, confidence: 0.9, verdict: 'clear' }),
    ];
    const r = fuseFindings(findings);
    expect(r.conflicts.length).toBeGreaterThan(0);
    expect(['escalate', 'flag', 'block']).toContain(r.outcome);
  });

  it('sparse findings yield sparse consensus and inconclusive outcome when no LR signal', () => {
    const findings: Finding[] = [
      f({ modeId: 'a', score: 0.2, confidence: 0.5, verdict: 'clear' }),
    ];
    const r = fuseFindings(findings);
    expect(r.consensus).toBe('sparse');
  });

  it('block verdict short-circuits the outcome', () => {
    const findings: Finding[] = [
      f({ modeId: 'a', score: 0.3, confidence: 0.4, verdict: 'clear' }),
      f({ modeId: 'b', score: 0.99, confidence: 0.99, verdict: 'block' }),
    ];
    const r = fuseFindings(findings);
    expect(r.outcome).toBe('block');
  });
});

describe('fusion — log-linear LR pooling (LR^q) + per-LR per-evidence weighting', () => {
  it('damps a strong raw LR more aggressively for low-quality evidence than for high-quality', () => {
    const idx = new Map<string, EvidenceItem>([
      ['weak:e', {
        id: 'weak:e', kind: 'social_media', title: 't',
        observedAt: new Date().toISOString(), languageIso: 'en',
        credibility: 'weak',
      }],
      ['auth:e', {
        id: 'auth:e', kind: 'sanctions_list', title: 't',
        observedAt: new Date().toISOString(), languageIso: 'en',
        credibility: 'authoritative',
      }],
    ]);
    const sameRawLR = { positiveGivenHypothesis: 0.95, positiveGivenNot: 0.05 };
    const weak = fuseFindings(
      [f({ modeId: 'w', score: 0.9, confidence: 0.9, evidence: ['weak:e'],
        likelihoodRatios: [{ evidenceId: 'weak:e', ...sameRawLR }] })],
      { evidenceIndex: idx, prior: 0.1 },
    );
    const auth = fuseFindings(
      [f({ modeId: 'a', score: 0.9, confidence: 0.9, evidence: ['auth:e'],
        likelihoodRatios: [{ evidenceId: 'auth:e', ...sameRawLR }] })],
      { evidenceIndex: idx, prior: 0.1 },
    );
    expect(auth.posterior).toBeGreaterThan(weak.posterior);
    // Log-linear pooling implies at q=0 the LR collapses to ~1, neutral.
    // Weak credibility ('weak' → 0.3) yields meaningfully smaller posterior.
    const authStep = auth.bayesTrace?.steps[0];
    const weakStep = weak.bayesTrace?.steps[0];
    expect(authStep?.weightedLR).toBeGreaterThan(weakStep?.weightedLR ?? 0);
  });

  it('surfaces rawLR, effectiveWeight, and weightedLR per BayesTrace step (Charter P6)', () => {
    const idx = new Map<string, EvidenceItem>([
      ['ev1', {
        id: 'ev1', kind: 'regulator_press_release', title: 't',
        observedAt: new Date().toISOString(), languageIso: 'en',
        credibility: 'authoritative',
      }],
    ]);
    const r = fuseFindings(
      [f({ modeId: 'm', score: 0.8, confidence: 0.9, evidence: ['ev1'],
        likelihoodRatios: [{ evidenceId: 'ev1', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 }] })],
      { evidenceIndex: idx, prior: 0.1 },
    );
    const step = r.bayesTrace?.steps[0];
    expect(step).toBeDefined();
    expect(step!.rawLR).toBeGreaterThan(1);
    expect(step!.effectiveWeight).toBeGreaterThan(0);
    expect(step!.effectiveWeight).toBeLessThanOrEqual(1);
    expect(step!.weightedLR).toBeDefined();
    // weightedLR = rawLR ^ effectiveWeight (within float tolerance).
    const expected = Math.pow(step!.rawLR!, step!.effectiveWeight!);
    expect(Math.abs(step!.weightedLR! - expected)).toBeLessThan(1e-6);
  });

  it('weight=0 evidence collapses LR to neutral (does not move posterior)', () => {
    // training_data has freshnessFactor === 0 by Charter P8, so weight === 0.
    const idx = new Map<string, EvidenceItem>([
      ['td:1', {
        id: 'td:1', kind: 'training_data', title: 't',
        observedAt: new Date().toISOString(), languageIso: 'en',
        credibility: 'authoritative',
      }],
    ]);
    const r = fuseFindings(
      [f({ modeId: 'm', score: 0.99, confidence: 0.99, evidence: ['td:1'],
        likelihoodRatios: [{ evidenceId: 'td:1', positiveGivenHypothesis: 0.99, positiveGivenNot: 0.01 }] })],
      { evidenceIndex: idx, prior: 0.1 },
    );
    // Posterior should remain near the prior because the LR was driven to 1.0.
    expect(Math.abs(r.posterior - r.prior)).toBeLessThan(0.05);
    const step = r.bayesTrace?.steps[0];
    expect(step?.effectiveWeight).toBe(0);
    expect(step?.weightedLR).toBe(1);
  });
});

describe('fusion — cognitive firepower', () => {
  it('reports per-faculty activation across every registered faculty', () => {
    const findings: Finding[] = [
      f({ modeId: 'a', faculties: ['reasoning'], score: 0.6, confidence: 0.9 }),
      f({ modeId: 'b', faculties: ['data_analysis'], score: 0.5, confidence: 0.8 }),
      f({ modeId: 'c', faculties: ['intelligence'], score: 0.7, confidence: 0.8 }),
    ];
    const r = fuseFindings(findings);
    expect(r.firepower.activations.length).toBe(FACULTIES.length);
    const engaged = r.firepower.activations.filter((a) => a.status !== 'silent');
    expect(engaged.length).toBeGreaterThanOrEqual(3);
    expect(r.firepower.firepowerScore).toBeGreaterThan(0);
  });
});
