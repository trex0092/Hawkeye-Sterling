import { describe, expect, it } from 'vitest';
import {
  modusPonensApply, modusTollensApply, reductioApply,
  bayesTheoremApply, steelmanApply, preMortemApply, contradictionDetectionApply,
} from '../modes/logic.js';
import type { BrainContext, Finding } from '../types.js';

function makeCtx(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    run: { id: 'r1', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence: {},
    priorFindings: [],
    domains: ['cdd', 'sanctions'],
    ...overrides,
  };
}

function pf(modeId: string, overrides: Partial<Finding> = {}): Finding {
  return {
    modeId,
    category: overrides.category ?? 'logic',
    faculties: overrides.faculties ?? ['reasoning'],
    score: overrides.score ?? 0.5,
    confidence: overrides.confidence ?? 0.7,
    verdict: overrides.verdict ?? 'flag',
    rationale: overrides.rationale ?? 't',
    evidence: overrides.evidence ?? [],
    producedAt: Date.now(),
    tags: overrides.tags,
  };
}

describe('logic — modus_ponens', () => {
  it('fires sanctioned LR when sanctions hits present', async () => {
    const out = await modusPonensApply(makeCtx({ evidence: { sanctionsHits: [{ id: 1 }] } }));
    expect(out.hypothesis).toBe('sanctioned');
    expect(out.likelihoodRatios?.length).toBeGreaterThan(0);
    expect(out.score).toBeGreaterThanOrEqual(0.9);
  });

  it('inconclusive when no evidence', async () => {
    const out = await modusPonensApply(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
});

describe('logic — modus_tollens', () => {
  it('flags missing CDD documentation', async () => {
    const out = await modusTollensApply(makeCtx({
      domains: ['cdd', 'ubo'],
      evidence: { documents: [] as unknown[] },
    }));
    expect(out.verdict).toBe('flag');
    expect(out.rationale).toMatch(/CDD|UBO/);
  });
});

describe('logic — bayes_theorem', () => {
  it('emits likelihood ratios for each evidence signal', async () => {
    const out = await bayesTheoremApply(makeCtx({
      evidence: {
        sanctionsHits: [{}],
        adverseMedia: [{}],
      },
    }));
    expect(out.likelihoodRatios?.length).toBeGreaterThanOrEqual(2);
    expect(out.hypothesis).toBe('illicit_risk');
  });
});

describe('logic — steelman', () => {
  it('emits counterexample tag when adversarial priors dominate', async () => {
    const ctx = makeCtx({
      priorFindings: [
        pf('a', { score: 0.8 }),
        pf('b', { score: 0.7 }),
      ],
    });
    const out = await steelmanApply(ctx);
    expect(out.tags).toContain('counterexample');
    expect(out.rationale).toMatch(/name-only|training-data|legitimate/);
  });
});

describe('logic — pre_mortem', () => {
  it('always emits failure modes', async () => {
    const out = await preMortemApply(makeCtx({ priorFindings: [pf('a')] }));
    expect(out.rationale).toMatch(/false positive|false negative|tipping-off/);
    expect(out.tags).toContain('counterexample');
  });
});

describe('logic — reductio', () => {
  it('flags clear-verdict assumption refuted by high-severity spike', async () => {
    const priors = [
      pf('a', { score: 0.1 }),
      pf('b', { score: 0.1 }),
      pf('spike', { score: 0.85 }),
    ];
    const out = await reductioApply(makeCtx({ priorFindings: priors }));
    expect(out.verdict).toBe('flag');
  });
});

describe('logic — contradiction_detection (paraconsistent)', () => {
  it('flags hard block-vs-clear contradiction', async () => {
    const priors = [
      pf('a', { verdict: 'block', score: 0.95 }),
      pf('b', { verdict: 'clear', score: 0.1 }),
    ];
    const out = await contradictionDetectionApply(makeCtx({ priorFindings: priors }));
    expect(out.verdict).toBe('flag');
  });
});
