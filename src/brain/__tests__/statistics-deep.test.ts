// Deep tests for lib/statistics.ts — all exported functions
import { describe, it, expect } from 'vitest';
import {
  mean, stdev, zScores, zScoreAgainstCohort,
  chiSquareGoF, klDivergence,
  ema, spikeDetection,
  changePoint, chiSquarePValueDf1,
} from '../lib/statistics.js';

// ─── mean ────────────────────────────────────────────────────────────────────

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the sole element for single-element array', () => {
    expect(mean([42])).toBe(42);
  });

  it('computes correct mean', () => {
    expect(mean([1, 2, 3, 4, 5])).toBeCloseTo(3);
  });

  it('handles negative numbers', () => {
    expect(mean([-5, 5])).toBeCloseTo(0);
  });

  it('handles all zeros', () => {
    expect(mean([0, 0, 0])).toBe(0);
  });
});

// ─── stdev ───────────────────────────────────────────────────────────────────

describe('stdev', () => {
  it('returns 0 for empty array', () => {
    expect(stdev([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(stdev([100])).toBe(0);
  });

  it('returns 0 for all identical values', () => {
    expect(stdev([5, 5, 5, 5])).toBe(0);
  });

  it('population stdev for [2,4,4,4,5,5,7,9] ≈ 2', () => {
    // population stdev = 2
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 4);
  });

  it('is always non-negative', () => {
    expect(stdev([1, 3, 5, 7, 9])).toBeGreaterThanOrEqual(0);
  });
});

// ─── zScores ─────────────────────────────────────────────────────────────────

describe('zScores', () => {
  it('returns all zeros for empty array', () => {
    expect(zScores([])).toEqual([]);
  });

  it('returns all zeros when stdev = 0', () => {
    expect(zScores([7, 7, 7])).toEqual([0, 0, 0]);
  });

  it('mean of z-scores is ~0', () => {
    const zs = zScores([1, 2, 3, 4, 5]);
    const m = zs.reduce((a, b) => a + b, 0) / zs.length;
    expect(m).toBeCloseTo(0, 10);
  });

  it('max absolute z-score is positive and finite', () => {
    const zs = zScores([10, 10, 10, 10, 100]);
    expect(Math.max(...zs.map(Math.abs))).toBeGreaterThan(0);
  });
});

// ─── zScoreAgainstCohort ─────────────────────────────────────────────────────

describe('zScoreAgainstCohort', () => {
  it('value equal to cohort mean → z=0, not anomalous', () => {
    const cohort = [10, 10, 10, 10];
    const r = zScoreAgainstCohort(10, cohort);
    expect(r.z).toBe(0);
    expect(r.anomalous).toBe(false);
  });

  it('value far above mean → anomalous', () => {
    const cohort = [1, 2, 3, 4, 5];
    const r = zScoreAgainstCohort(100, cohort);
    expect(r.anomalous).toBe(true);
    expect(r.z).toBeGreaterThan(2.5);
  });

  it('returns correct mean and stdev', () => {
    const cohort = [0, 10];
    const r = zScoreAgainstCohort(5, cohort);
    expect(r.mean).toBe(5);
    expect(r.stdev).toBeCloseTo(5, 5);
  });

  it('zero-stdev cohort → z=0', () => {
    const r = zScoreAgainstCohort(99, [5, 5, 5]);
    expect(r.z).toBe(0);
  });

  it('anomalous threshold is |z| >= 2.5', () => {
    const cohort = [0, 1, 2, 3, 4];
    const r1 = zScoreAgainstCohort(100, cohort);   // definitely anomalous
    const r2 = zScoreAgainstCohort(2, cohort);     // within range
    expect(r1.anomalous).toBe(true);
    expect(r2.anomalous).toBe(false);
  });
});

// ─── chiSquareGoF ────────────────────────────────────────────────────────────

describe('chiSquareGoF', () => {
  it('chi2=0 when observed = expected', () => {
    const { chi2 } = chiSquareGoF([10, 20, 30], [10, 20, 30]);
    expect(chi2).toBe(0);
  });

  it('chi2 > 0 when observed differs from expected', () => {
    const { chi2 } = chiSquareGoF([5, 20, 30], [10, 20, 30]);
    expect(chi2).toBeGreaterThan(0);
  });

  it('df = n - 1 for equal-length arrays', () => {
    const { df } = chiSquareGoF([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(df).toBe(3);
  });

  it('ignores zero expected (no division by zero)', () => {
    const { chi2 } = chiSquareGoF([5, 0], [0, 10]);
    expect(Number.isFinite(chi2)).toBe(true);
  });

  it('empty arrays → chi2=0, df=1', () => {
    const { chi2, df } = chiSquareGoF([], []);
    expect(chi2).toBe(0);
    expect(df).toBe(1);
  });

  it('uses shorter array length when mismatched', () => {
    const { chi2, df } = chiSquareGoF([10, 20], [10, 20, 30]);
    expect(df).toBe(1); // min(2,3)-1=1
    expect(chi2).toBe(0);
  });
});

// ─── klDivergence ────────────────────────────────────────────────────────────

describe('klDivergence', () => {
  it('KL(P||P) ≈ 0 for identical distributions', () => {
    const p = [0.2, 0.3, 0.5];
    expect(klDivergence(p, p)).toBeCloseTo(0, 3);
  });

  it('KL > 0 when distributions differ', () => {
    expect(klDivergence([1, 0], [0, 1])).toBeGreaterThan(0);
  });

  it('returns finite number even for very different distributions', () => {
    const kl = klDivergence([0, 1], [1, 0]);
    expect(Number.isFinite(kl)).toBe(true);
  });

  it('handles different-length arrays via Laplace smoothing', () => {
    const kl = klDivergence([0.5, 0.5], [0.3, 0.3, 0.4]);
    expect(Number.isFinite(kl)).toBe(true);
  });

  it('eps parameter reduces smoothing effect when lowered', () => {
    const p = [0.5, 0.5];
    const q = [0.5, 0.5];
    const kl = klDivergence(p, q, 1e-12);
    expect(kl).toBeCloseTo(0, 5);
  });
});

// ─── ema ─────────────────────────────────────────────────────────────────────

describe('ema', () => {
  it('empty input → empty output', () => {
    expect(ema([])).toEqual([]);
  });

  it('single element → returns that element', () => {
    expect(ema([42])).toEqual([42]);
  });

  it('first element equals first input', () => {
    const out = ema([5, 10, 15]);
    expect(out[0]).toBe(5);
  });

  it('EMA with alpha=1 equals the raw series', () => {
    const xs = [1, 2, 3, 4, 5];
    const out = ema(xs, 1);
    // alpha=1: prev is always replaced by current
    expect(out).toEqual(xs);
  });

  it('EMA with alpha=0 returns constant first value', () => {
    const xs = [10, 20, 30, 40, 50];
    const out = ema(xs, 0);
    for (const v of out) expect(v).toBeCloseTo(10, 5);
  });

  it('output length equals input length', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    expect(ema(xs).length).toBe(xs.length);
  });

  it('default alpha=0.3 smooths series', () => {
    const xs = [0, 100, 0, 100, 0];
    const out = ema(xs);
    // Smoothed — not exactly 0 or 100 for middle elements
    expect(out[2]).toBeGreaterThan(0);
    expect(out[2]).toBeLessThan(100);
  });
});

// ─── spikeDetection ──────────────────────────────────────────────────────────

describe('spikeDetection', () => {
  it('all identical values → no spikes', () => {
    const result = spikeDetection(new Array(20).fill(50));
    expect(result.indices).toHaveLength(0);
    expect(result.aboveThreshold).toBe(0);
  });

  it('detects a clear spike', () => {
    const xs = [...new Array(19).fill(10), 1000];
    const result = spikeDetection(xs, 2);
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.indices).toContain(19);
  });

  it('maxDeviation is the highest absolute z-deviation', () => {
    const xs = [...new Array(10).fill(5), 500];
    const result = spikeDetection(xs);
    expect(Math.abs(result.maxDeviation)).toBeGreaterThan(0);
  });

  it('aboveThreshold equals indices.length', () => {
    const xs = [...new Array(19).fill(10), 1000];
    const result = spikeDetection(xs, 2);
    expect(result.aboveThreshold).toBe(result.indices.length);
  });

  it('empty array → no spikes', () => {
    const result = spikeDetection([]);
    expect(result.indices).toHaveLength(0);
    expect(result.aboveThreshold).toBe(0);
  });

  it('single element → no spikes', () => {
    const result = spikeDetection([99]);
    expect(result.indices).toHaveLength(0);
  });

  it('higher threshold misses moderate spikes', () => {
    const xs = [...new Array(10).fill(100), 200]; // moderate deviation
    const strict = spikeDetection(xs, 10);
    expect(strict.aboveThreshold).toBe(0);
  });
});

// ─── changePoint ─────────────────────────────────────────────────────────────

describe('changePoint', () => {
  it('returns null for short series (< 10)', () => {
    expect(changePoint([1, 2, 3, 4, 5])).toBeNull();
  });

  it('returns null for exactly 9 elements', () => {
    expect(changePoint([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
  });

  it('returns null for all-identical series', () => {
    const xs = new Array(20).fill(100);
    expect(changePoint(xs)).toBeNull();
  });

  it('detects a clear level shift', () => {
    // 10 zeros then 10 ones
    const xs = [...new Array(10).fill(0), ...new Array(10).fill(100)];
    const cp = changePoint(xs);
    expect(cp).not.toBeNull();
    expect(cp!.index).toBeGreaterThanOrEqual(3);
    expect(cp!.index).toBeLessThanOrEqual(17);
  });

  it('ratio is in [0, 1]', () => {
    const xs = [...new Array(10).fill(0), ...new Array(10).fill(100)];
    const cp = changePoint(xs);
    expect(cp!.ratio).toBeGreaterThan(0);
    expect(cp!.ratio).toBeLessThanOrEqual(1);
  });

  it('finds split point near actual change', () => {
    // Change at index 10
    const xs = [...new Array(10).fill(0), ...new Array(10).fill(1000)];
    const cp = changePoint(xs);
    // Should be near 10 (within margin of the guard range 3..n-3)
    expect(cp!.index).toBeGreaterThanOrEqual(7);
    expect(cp!.index).toBeLessThanOrEqual(13);
  });

  it('high ratio for sharp level shift', () => {
    const xs = [...new Array(10).fill(1), ...new Array(10).fill(10000)];
    const cp = changePoint(xs);
    expect(cp!.ratio).toBeGreaterThan(0.5);
  });
});

// ─── chiSquarePValueDf1 ───────────────────────────────────────────────────────

describe('chiSquarePValueDf1', () => {
  it('chi2=0 → p=1', () => {
    expect(chiSquarePValueDf1(0)).toBe(1);
  });

  it('chi2 negative → p=1', () => {
    expect(chiSquarePValueDf1(-5)).toBe(1);
  });

  it('very large chi2 → p≈0', () => {
    const p = chiSquarePValueDf1(1000);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(0.001);
  });

  it('chi2=3.84 → p≈0.05 (classic 95th percentile)', () => {
    const p = chiSquarePValueDf1(3.84);
    expect(p).toBeCloseTo(0.05, 1);
  });

  it('p is always in [0, 1]', () => {
    for (const chi2 of [0.1, 1, 3.84, 6.63, 10, 100]) {
      const p = chiSquarePValueDf1(chi2);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('monotonically decreasing with chi2', () => {
    const chi2s = [1, 2, 4, 8, 16];
    const ps = chi2s.map(chiSquarePValueDf1);
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i]!).toBeLessThan(ps[i - 1]!);
    }
  });
});
