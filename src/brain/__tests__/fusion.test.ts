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
