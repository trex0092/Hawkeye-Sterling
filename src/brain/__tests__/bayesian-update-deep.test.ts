// Deep tests for bayesian-update.ts — update formulas, clamping, scoring
import { describe, it, expect } from 'vitest';
import { bayesUpdate, brierScore, logScore } from '../bayesian-update.js';
import type { LikelihoodRatio } from '../bayesian-update.js';

// ─── bayesUpdate: basic mechanics ────────────────────────────────────────────

describe('bayesUpdate: basic mechanics', () => {
  it('returns prior as posterior when no evidence', () => {
    const r = bayesUpdate(0.5, []);
    expect(r.posterior).toBeCloseTo(0.5, 9);
    expect(r.prior).toBe(0.5);
    expect(r.steps).toHaveLength(0);
  });

  it('neutral LR=1 leaves posterior unchanged', () => {
    const lr: LikelihoodRatio = {
      evidenceId: 'e1',
      positiveGivenHypothesis: 0.5,
      positiveGivenNot: 0.5,
    };
    const r = bayesUpdate(0.3, [lr]);
    expect(r.posterior).toBeCloseTo(0.3, 5);
  });

  it('supporting evidence (LR > 1) increases posterior', () => {
    const lr: LikelihoodRatio = {
      evidenceId: 'e1',
      positiveGivenHypothesis: 0.9,
      positiveGivenNot: 0.1,
    };
    const r = bayesUpdate(0.3, [lr]);
    expect(r.posterior).toBeGreaterThan(0.3);
  });

  it('exculpatory evidence (LR < 1) decreases posterior', () => {
    const lr: LikelihoodRatio = {
      evidenceId: 'e1',
      positiveGivenHypothesis: 0.1,
      positiveGivenNot: 0.9,
    };
    const r = bayesUpdate(0.7, [lr]);
    expect(r.posterior).toBeLessThan(0.7);
  });

  it('posterior is always in (0, 1)', () => {
    const lrs: LikelihoodRatio[] = [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.99, positiveGivenNot: 0.01 },
      { evidenceId: 'e2', positiveGivenHypothesis: 0.95, positiveGivenNot: 0.05 },
      { evidenceId: 'e3', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 },
    ];
    const r = bayesUpdate(0.01, lrs);
    expect(r.posterior).toBeGreaterThan(0);
    expect(r.posterior).toBeLessThan(1);
  });

  it('chaining: each step uses prior step posterior as new prior', () => {
    const lrs: LikelihoodRatio[] = [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.8, positiveGivenNot: 0.2 },
      { evidenceId: 'e2', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 },
    ];
    const r = bayesUpdate(0.5, lrs);
    // Step 1 posterior should match step 2 prior
    expect(r.steps[1]!.priorOdds).toBeCloseTo(
      r.steps[0]!.posterior / (1 - r.steps[0]!.posterior), 5,
    );
  });

  it('returns all evidence ids in steps', () => {
    const lrs: LikelihoodRatio[] = [
      { evidenceId: 'alpha', positiveGivenHypothesis: 0.7, positiveGivenNot: 0.3 },
      { evidenceId: 'beta', positiveGivenHypothesis: 0.6, positiveGivenNot: 0.4 },
    ];
    const r = bayesUpdate(0.5, lrs);
    expect(r.steps[0]!.evidenceId).toBe('alpha');
    expect(r.steps[1]!.evidenceId).toBe('beta');
  });

  it('final posterior equals last step posterior', () => {
    const lrs: LikelihoodRatio[] = [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.8, positiveGivenNot: 0.2 },
      { evidenceId: 'e2', positiveGivenHypothesis: 0.7, positiveGivenNot: 0.3 },
    ];
    const r = bayesUpdate(0.5, lrs);
    const lastStep = r.steps[r.steps.length - 1]!;
    expect(r.posterior).toBeCloseTo(lastStep.posterior, 10);
  });

  it('prior is preserved in trace, not modified', () => {
    const r = bayesUpdate(0.42, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 },
    ]);
    expect(r.prior).toBe(0.42);
  });
});

// ─── bayesUpdate: clamping ────────────────────────────────────────────────────

describe('bayesUpdate: clamping', () => {
  it('prior=0 is clamped away from 0 (no infinity)', () => {
    const r = bayesUpdate(0, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 },
    ]);
    expect(Number.isFinite(r.posterior)).toBe(true);
    expect(r.posterior).toBeGreaterThan(0);
  });

  it('prior=1 is clamped away from 1 (no infinity)', () => {
    const r = bayesUpdate(1, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 },
    ]);
    expect(Number.isFinite(r.posterior)).toBe(true);
    expect(r.posterior).toBeLessThan(1);
  });

  it('LR inputs 0 and 1 are clamped (no division by zero)', () => {
    const r = bayesUpdate(0.5, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0, positiveGivenNot: 0 },
    ]);
    expect(Number.isFinite(r.posterior)).toBe(true);
  });

  it('extreme LR (very high) still produces posterior < 1', () => {
    const r = bayesUpdate(0.5, [
      { evidenceId: 'e1', positiveGivenHypothesis: 1, positiveGivenNot: 0 },
    ]);
    expect(r.posterior).toBeLessThan(1);
    expect(Number.isFinite(r.posterior)).toBe(true);
  });
});

// ─── bayesUpdate: trace fields ────────────────────────────────────────────────

describe('bayesUpdate: step fields', () => {
  it('step includes priorOdds, posteriorOdds, lr, posterior', () => {
    const r = bayesUpdate(0.5, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.8, positiveGivenNot: 0.4 },
    ]);
    const step = r.steps[0]!;
    expect(typeof step.lr).toBe('number');
    expect(typeof step.priorOdds).toBe('number');
    expect(typeof step.posteriorOdds).toBe('number');
    expect(typeof step.posterior).toBe('number');
  });

  it('priorOdds = prior/(1-prior)', () => {
    const prior = 0.25;
    const r = bayesUpdate(prior, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.6, positiveGivenNot: 0.4 },
    ]);
    expect(r.steps[0]!.priorOdds).toBeCloseTo(prior / (1 - prior), 5);
  });

  it('posteriorOdds = priorOdds * lr', () => {
    const r = bayesUpdate(0.5, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.8, positiveGivenNot: 0.4 },
    ]);
    const { priorOdds, lr, posteriorOdds } = r.steps[0]!;
    expect(posteriorOdds).toBeCloseTo(priorOdds * lr, 5);
  });
});

// ─── brierScore ───────────────────────────────────────────────────────────────

describe('brierScore', () => {
  it('brierScore(1, 1) = 0', () => {
    expect(brierScore(1, 1)).toBe(0);
  });

  it('brierScore(0, 0) = 0', () => {
    expect(brierScore(0, 0)).toBe(0);
  });

  it('brierScore(1, 0) = 1', () => {
    expect(brierScore(1, 0)).toBeCloseTo(1, 10);
  });

  it('brierScore(0, 1) = 1', () => {
    expect(brierScore(0, 1)).toBeCloseTo(1, 10);
  });

  it('brierScore is in [0, 1]', () => {
    for (const p of [0, 0.1, 0.5, 0.9, 1]) {
      expect(brierScore(p, 0)).toBeGreaterThanOrEqual(0);
      expect(brierScore(p, 0)).toBeLessThanOrEqual(1);
      expect(brierScore(p, 1)).toBeGreaterThanOrEqual(0);
      expect(brierScore(p, 1)).toBeLessThanOrEqual(1);
    }
  });

  it('brierScore(0.5, 1) = 0.25', () => {
    expect(brierScore(0.5, 1)).toBeCloseTo(0.25, 10);
  });

  it('brierScore(0.5, 0) = 0.25', () => {
    expect(brierScore(0.5, 0)).toBeCloseTo(0.25, 10);
  });

  it('lower Brier score for better calibrated prediction', () => {
    const good = brierScore(0.9, 1);  // predicted 0.9, actual 1
    const bad = brierScore(0.1, 1);   // predicted 0.1, actual 1
    expect(good).toBeLessThan(bad);
  });
});

// ─── logScore ────────────────────────────────────────────────────────────────

describe('logScore', () => {
  it('logScore(1, 1) ≈ 0 (perfect prediction)', () => {
    // -log(1 - eps) ≈ 0
    expect(logScore(1, 1)).toBeCloseTo(0, 5);
  });

  it('logScore(0, 0) ≈ 0 (perfect prediction)', () => {
    // -log(1 - 0 + eps) ≈ 0
    expect(logScore(0, 0)).toBeCloseTo(0, 5);
  });

  it('logScore is always non-negative', () => {
    for (const p of [0.01, 0.1, 0.5, 0.9, 0.99]) {
      expect(logScore(p, 0)).toBeGreaterThanOrEqual(0);
      expect(logScore(p, 1)).toBeGreaterThanOrEqual(0);
    }
  });

  it('lower logScore for better calibrated prediction', () => {
    const good = logScore(0.9, 1);  // confident and correct
    const bad = logScore(0.1, 1);   // confident and wrong
    expect(good).toBeLessThan(bad);
  });

  it('logScore is finite for all valid inputs', () => {
    expect(Number.isFinite(logScore(0, 1))).toBe(true);
    expect(Number.isFinite(logScore(1, 0))).toBe(true);
    expect(Number.isFinite(logScore(0.5, 1))).toBe(true);
  });
});

// ─── Bayes update: mathematical correctness ────────────────────────────────

describe('bayesUpdate: known results', () => {
  it('prior=0.5, LR=9 → posterior ≈ 0.9', () => {
    // Prior odds = 1, LR = 9, posterior odds = 9, posterior = 9/10 = 0.9
    const r = bayesUpdate(0.5, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.9, positiveGivenNot: 0.1 },
    ]);
    expect(r.posterior).toBeCloseTo(0.9, 3);
  });

  it('prior=0.1, LR=4 → posterior ≈ 0.308', () => {
    // Prior odds = 1/9, LR = 4, posterior odds = 4/9, posterior = (4/9)/(1 + 4/9) = 4/13 ≈ 0.308
    const r = bayesUpdate(0.1, [
      { evidenceId: 'e1', positiveGivenHypothesis: 0.8, positiveGivenNot: 0.2 },
    ]);
    expect(r.posterior).toBeCloseTo(4 / 13, 3);
  });
});
