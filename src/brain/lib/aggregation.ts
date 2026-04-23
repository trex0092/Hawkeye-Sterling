// Hawkeye Sterling — probabilistic aggregation.
// Bayesian update, Dempster-Shafer combination, multi-source consistency,
// counter-evidence weighting. Used by the statistical / aggregation modes
// and by the engine when it has to fuse heterogeneous evidence.

// ── Bayesian cascade ─────────────────────────────────────────────────────
// Given a prior P(H) and a sequence of likelihood ratios LR_i = P(E_i|H)/P(E_i|¬H),
// update the posterior iteratively. Likelihood ratios are supplied by modes
// (each mode maps its finding.score → LR via a calibrated curve).
export interface BayesianStep { label: string; likelihoodRatio: number; }
export interface BayesianResult {
  prior: number;
  posterior: number;
  bayesFactor: number;
  trajectory: Array<{ label: string; posterior: number }>;
}
export function bayesianCascade(prior: number, steps: ReadonlyArray<BayesianStep>): BayesianResult {
  const p0 = clamp01(prior);
  let odds = p0 / Math.max(1e-9, 1 - p0);
  let bf = 1;
  const trajectory: BayesianResult['trajectory'] = [];
  for (const step of steps) {
    const lr = Math.max(1e-6, step.likelihoodRatio);
    odds *= lr; bf *= lr;
    const post = odds / (1 + odds);
    trajectory.push({ label: step.label, posterior: post });
  }
  const posterior = odds / (1 + odds);
  return { prior: p0, posterior, bayesFactor: bf, trajectory };
}

// ── Dempster-Shafer combination over {H, ¬H, Θ} ──────────────────────────
// Each mass structure assigns belief to H, ¬H, or the uncertain frame Θ.
// The combination rule fuses two independent masses, normalising by (1 − K)
// where K is the conflict (mass on ∅). Returns conflict-aware fused beliefs.
export interface DSMass {
  h: number;      // belief in H
  notH: number;   // belief in ¬H
  theta: number;  // ignorance mass on frame
}
export function dsNormalise(m: DSMass): DSMass {
  const total = m.h + m.notH + m.theta;
  if (total === 0) return { h: 0, notH: 0, theta: 1 };
  return { h: m.h / total, notH: m.notH / total, theta: m.theta / total };
}
export function dsCombine(a: DSMass, b: DSMass): { fused: DSMass; conflict: number } {
  const na = dsNormalise(a), nb = dsNormalise(b);
  const k = na.h * nb.notH + na.notH * nb.h;               // conflict
  const denom = 1 - k;
  if (denom <= 0) {
    return { fused: { h: 0, notH: 0, theta: 1 }, conflict: 1 };
  }
  const h = (na.h * nb.h + na.h * nb.theta + na.theta * nb.h) / denom;
  const notH = (na.notH * nb.notH + na.notH * nb.theta + na.theta * nb.notH) / denom;
  const theta = (na.theta * nb.theta) / denom;
  return { fused: { h, notH, theta }, conflict: k };
}
export function dsCombineAll(masses: ReadonlyArray<DSMass>): { fused: DSMass; conflict: number } {
  if (masses.length === 0) return { fused: { h: 0, notH: 0, theta: 1 }, conflict: 0 };
  let current: DSMass = masses[0]!;
  let conflict = 0;
  for (let i = 1; i < masses.length; i++) {
    const next = masses[i]!;
    const r = dsCombine(current, next);
    current = r.fused;
    conflict = 1 - (1 - conflict) * (1 - r.conflict);
  }
  return { fused: current, conflict };
}

// ── Multi-source consistency ─────────────────────────────────────────────
// How much do independent sources agree? 1.0 = perfect agreement, 0 = half
// claim yes and half no. Uses entropy of the empirical vote distribution.
export function multiSourceConsistency(verdicts: ReadonlyArray<'yes' | 'no' | 'unknown'>): {
  agreement: number; dominant: 'yes' | 'no' | 'unknown' | 'split'; yes: number; no: number; unknown: number;
} {
  if (verdicts.length === 0) {
    return { agreement: 0, dominant: 'unknown', yes: 0, no: 0, unknown: 0 };
  }
  let yes = 0, no = 0, unk = 0;
  for (const v of verdicts) {
    if (v === 'yes') yes++;
    else if (v === 'no') no++;
    else unk++;
  }
  const total = verdicts.length;
  const py = yes / total, pn = no / total, pu = unk / total;
  const H = -(safeXlogx(py) + safeXlogx(pn) + safeXlogx(pu));
  const maxH = Math.log2(3);
  const agreement = 1 - (maxH > 0 ? H / maxH : 0);
  let dominant: 'yes' | 'no' | 'unknown' | 'split' = 'split';
  const maxCount = Math.max(yes, no, unk);
  if (yes === maxCount && yes > no && yes > unk) dominant = 'yes';
  else if (no === maxCount && no > yes && no > unk) dominant = 'no';
  else if (unk === maxCount && unk > yes && unk > no) dominant = 'unknown';
  return { agreement, dominant, yes, no, unknown: unk };
}

// ── Counter-evidence weighting ───────────────────────────────────────────
// Up-weight disconfirming evidence to resist confirmation bias. Returns a
// balanced belief ∈ [0,1] with a confidence anchored by coverage.
export interface WeightedEvidence { supporting: number[]; opposing: number[]; }
export interface CounterEvidenceResult {
  belief: number;
  confidence: number;
  supportMean: number;
  opposeMean: number;
  imbalance: number;
}
export function counterEvidence(ev: WeightedEvidence): CounterEvidenceResult {
  const support = ev.supporting.filter((x) => Number.isFinite(x) && x > 0);
  const oppose = ev.opposing.filter((x) => Number.isFinite(x) && x > 0);
  const sMean = support.length === 0 ? 0 : support.reduce((a, b) => a + b, 0) / support.length;
  const oMean = oppose.length === 0 ? 0 : oppose.reduce((a, b) => a + b, 0) / oppose.length;
  // Counter-evidence receives a 1.5× prior weighting — the "devil's advocate" uplift.
  const belief = clamp01(sMean / (sMean + 1.5 * oMean + 1e-9));
  const coverage = Math.min(1, (support.length + oppose.length) / 10);
  const imbalance = support.length + oppose.length === 0
    ? 0
    : Math.abs(support.length - oppose.length) / (support.length + oppose.length);
  const confidence = Math.max(0.25, 0.4 + 0.4 * coverage - 0.2 * imbalance);
  return { belief, confidence, supportMean: sMean, opposeMean: oMean, imbalance };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function safeXlogx(p: number): number { return p > 0 ? p * Math.log2(p) : 0; }
