// Hawkeye Sterling — statistics helpers.
// Chi-square, KL divergence, z-score peer anomaly, changepoint, EMA/spike.

export function mean(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
export function stdev(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}
export function zScores(xs: ReadonlyArray<number>): number[] {
  const m = mean(xs), s = stdev(xs);
  if (s === 0) return xs.map(() => 0);
  return xs.map((x) => (x - m) / s);
}
export function zScoreAgainstCohort(value: number, cohort: ReadonlyArray<number>): {
  z: number; mean: number; stdev: number; anomalous: boolean;
} {
  const m = mean(cohort), s = stdev(cohort);
  const z = s === 0 ? 0 : (value - m) / s;
  return { z, mean: m, stdev: s, anomalous: Math.abs(z) >= 2.5 };
}

// Chi-square goodness of fit against an expected discrete distribution.
export function chiSquareGoF(observed: ReadonlyArray<number>, expected: ReadonlyArray<number>): {
  chi2: number; df: number;
} {
  const n = Math.min(observed.length, expected.length);
  let chi = 0;
  for (let i = 0; i < n; i++) {
    const o = observed[i] ?? 0;
    const e = expected[i] ?? 0;
    if (e > 0) chi += ((o - e) ** 2) / e;
  }
  return { chi2: chi, df: Math.max(1, n - 1) };
}

// KL divergence D(P || Q) with Laplace smoothing.
// Iterates to the length of the longer array so unmatched tail elements are
// not silently dropped (smoothed with eps so log stays finite).
export function klDivergence(p: ReadonlyArray<number>, q: ReadonlyArray<number>, eps = 1e-6): number {
  const n = Math.max(p.length, q.length);
  let kl = 0;
  for (let i = 0; i < n; i++) {
    const pi = (p[i] ?? 0) + eps;
    const qi = (q[i] ?? 0) + eps;
    kl += pi * Math.log2(pi / qi);
  }
  return kl;
}

// Exponential moving average — used for spike detection and regime change.
export function ema(xs: ReadonlyArray<number>, alpha = 0.3): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] ?? 0;
    prev = i === 0 ? x : alpha * x + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

export interface SpikeReport {
  indices: number[];
  maxDeviation: number;
  aboveThreshold: number;
}
export function spikeDetection(xs: ReadonlyArray<number>, zThreshold = 3): SpikeReport {
  const base = ema(xs, 0.2);
  const deviations = xs.map((x, i) => x - (base[i] ?? 0));
  const z = zScores(deviations);
  const indices: number[] = [];
  let maxDev = 0;
  for (let i = 0; i < xs.length; i++) {
    if (Math.abs(z[i] ?? 0) >= zThreshold) indices.push(i);
    if (Math.abs(z[i] ?? 0) > Math.abs(maxDev)) maxDev = z[i] ?? 0;
  }
  return { indices, maxDeviation: maxDev, aboveThreshold: indices.length };
}

// Simple changepoint: split that minimises within-segment variance.
// Pre-computes prefix sums so the inner segment stats run in O(1) rather
// than the O(n) mean() call that made the naive version O(n³) overall.
export function changePoint(xs: ReadonlyArray<number>): { index: number; ratio: number } | null {
  const n = xs.length;
  if (n < 10) return null;

  // Build prefix sums for O(1) segment mean and variance.
  const sum = new Float64Array(n + 1);
  const sum2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sum[i + 1] = (sum[i] ?? 0) + (xs[i] ?? 0);
    sum2[i + 1] = (sum2[i] ?? 0) + (xs[i] ?? 0) ** 2;
  }

  // Segment variance using the identity Var = E[X²] - E[X]² (no subtraction loop needed).
  const segVar = (lo: number, hi: number): number => {
    const len = hi - lo;
    if (len <= 0) return 0;
    const s = (sum[hi] ?? 0) - (sum[lo] ?? 0);
    const s2 = (sum2[hi] ?? 0) - (sum2[lo] ?? 0);
    return s2 - (s * s) / len;
  };

  const overall = segVar(0, n);
  if (overall === 0) return null;

  let bestI = -1, bestReduction = 0;
  for (let i = 3; i < n - 3; i++) {
    const within = segVar(0, i) + segVar(i, n);
    const reduction = overall - within;
    if (reduction > bestReduction) { bestReduction = reduction; bestI = i; }
  }
  if (bestI < 0) return null;
  return { index: bestI, ratio: bestReduction / overall };
}

// Approximate p-value from chi-square (χ²(1)) via Wilson-Hilferty; used for
// quick "is the deviation significant" binary answers, not publication stats.
export function chiSquarePValueDf1(chi2: number): number {
  // χ²₁ ≈ Z² where Z ~ N(0,1). p = P(|Z| ≥ √χ²) = 2(1 − Φ(√χ²)).
  if (chi2 <= 0) return 1;
  const z = Math.sqrt(chi2);
  return 2 * (1 - normalCdf(z));
}
function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}
