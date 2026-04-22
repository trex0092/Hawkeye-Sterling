import { describe, it, expect } from 'vitest';
import {
  bayesianCascade, dsCombine, dsCombineAll,
  multiSourceConsistency, counterEvidence,
} from './aggregation.js';

describe('bayesianCascade', () => {
  it('raises posterior under positive LRs', () => {
    const r = bayesianCascade(0.2, [
      { label: 'sanctions', likelihoodRatio: 4 },
      { label: 'pep', likelihoodRatio: 3 },
    ]);
    expect(r.posterior).toBeGreaterThan(0.2);
  });
  it('posterior stays in [0,1]', () => {
    const r = bayesianCascade(0.5, Array(20).fill({ label: 'x', likelihoodRatio: 10 }));
    expect(r.posterior).toBeLessThanOrEqual(1);
  });
});

describe('Dempster-Shafer', () => {
  it('combines two supportive masses', () => {
    const a = { h: 0.6, notH: 0.1, theta: 0.3 };
    const b = { h: 0.5, notH: 0.1, theta: 0.4 };
    const r = dsCombine(a, b);
    expect(r.fused.h).toBeGreaterThan(a.h);
  });
  it('combineAll handles 3+', () => {
    const m = { h: 0.5, notH: 0.2, theta: 0.3 };
    const r = dsCombineAll([m, m, m]);
    expect(r.fused.h).toBeGreaterThan(0.5);
  });
});

describe('multiSourceConsistency', () => {
  it('measures agreement', () => {
    const r = multiSourceConsistency(['yes','yes','yes','yes']);
    expect(r.agreement).toBe(1);
    expect(r.dominant).toBe('yes');
  });
});

describe('counterEvidence', () => {
  it('weights opposing evidence higher', () => {
    const balanced = counterEvidence({ supporting: [0.6, 0.6], opposing: [0.6, 0.6] });
    // With 1.5x counter-evidence uplift, balanced support still falls below 0.5.
    expect(balanced.belief).toBeLessThan(0.5);
  });
});
