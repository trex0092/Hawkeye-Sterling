// Hawkeye Sterling — real behavioral-signal modes.
//
// Rolls over `ctx.evidence.transactions` (and related event arrays) to detect:
//   velocity_analysis    — rate over rolling windows; spike relative to baseline
//   spike_detection      — z-score / MAD-based anomaly hit (delegates to time-series-anomaly)
//   pattern_of_life      — inter-event interval regularity; flags sudden deviations
//   peer_group_anomaly   — compare subject's amounts against peer-group distribution
//                          from ctx.evidence.peerGroup (if provided)
//   regime_change        — structural break detection via mean shift across halves

import type {
  BrainContext, FacultyId, Finding, LikelihoodRatio, ReasoningCategory, Verdict,
} from '../types.js';
import { detectAnomalies, type TimePoint } from '../time-series-anomaly.js';

function mk(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
  opts: {
    evidence?: string[];
    hypothesis?: Finding['hypothesis'];
    likelihoodRatios?: LikelihoodRatio[];
    tags?: string[];
  } = {},
): Finding {
  const f: Finding = {
    modeId, category, faculties, verdict,
    score: Math.min(1, Math.max(0, score)),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale,
    evidence: opts.evidence ?? [],
    producedAt: Date.now(),
  };
  if (opts.hypothesis !== undefined) f.hypothesis = opts.hypothesis;
  if (opts.likelihoodRatios !== undefined) f.likelihoodRatios = opts.likelihoodRatios;
  if (opts.tags !== undefined) f.tags = opts.tags;
  return f;
}

function numsBy(items: unknown, field: string): number[] {
  if (!Array.isArray(items)) return [];
  const out: number[] = [];
  for (const x of items) {
    if (x && typeof x === 'object') {
      const v = (x as Record<string, unknown>)[field];
      if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

function timestamps(items: unknown): number[] {
  if (!Array.isArray(items)) return [];
  const out: number[] = [];
  for (const x of items) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const t = r.timestamp ?? r.date ?? r.observedAt ?? r.ts;
    if (typeof t === 'number' && Number.isFinite(t)) out.push(t);
    else if (typeof t === 'string') {
      const n = Date.parse(t);
      if (!Number.isNaN(n)) out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0; for (const x of xs) s += x; return s / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0; for (const x of xs) s += (x - m) * (x - m);
  return s / (xs.length - 1);
}

// ── velocity_analysis ──────────────────────────────────────────────────
// Compare the second half's event rate to the first half's rate. Huge
// uplift = "velocity spike" (the 200%+ class of red flag).
export const velocityAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ts = timestamps(ctx.evidence.transactions);
  if (ts.length < 10) {
    return mk('velocity_analysis', 'behavioral_signals', ['data_analysis', 'smartness'],
      'inconclusive', 0, 0.4,
      `Velocity: n=${ts.length} timestamped events < 10.`);
  }
  const mid = Math.floor(ts.length / 2);
  const first = ts.slice(0, mid);
  const second = ts.slice(mid);
  const spanA = (first.at(-1)! - first[0]!) / 86_400_000 || 1;
  const spanB = (second.at(-1)! - second[0]!) / 86_400_000 || 1;
  const rateA = first.length / spanA;
  const rateB = second.length / spanB;
  const uplift = rateA > 0 ? rateB / rateA : rateB > 0 ? Infinity : 1;
  const isSpike = uplift >= 2;
  const severity = Math.min(1, Math.max(0, (uplift - 1.5) / 3));
  const verdict: Verdict = uplift >= 3 ? 'escalate' : isSpike ? 'flag' : 'clear';
  const lrs: LikelihoodRatio[] = isSpike
    ? [{ evidenceId: 'velocity:spike', positiveGivenHypothesis: Math.min(0.9, 0.5 + severity), positiveGivenNot: 0.1 }]
    : [];
  return mk('velocity_analysis', 'behavioral_signals', ['data_analysis', 'smartness'],
    verdict, severity, 0.85,
    `Velocity: first-half ${rateA.toFixed(2)}/day vs second-half ${rateB.toFixed(2)}/day (uplift ×${uplift.toFixed(2)}). ${isSpike ? 'Velocity spike red flag fired.' : 'No velocity spike.'}`,
    { hypothesis: 'illicit_risk', likelihoodRatios: lrs });
};

// ── spike_detection ────────────────────────────────────────────────────
// Use rolling MAD anomaly detector on transaction amounts.
export const spikeDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const amounts = numsBy(ctx.evidence.transactions, 'amount');
  if (amounts.length < 10) {
    return mk('spike_detection', 'behavioral_signals', ['data_analysis', 'smartness'],
      'inconclusive', 0, 0.4,
      `Spike: n=${amounts.length} < 10.`);
  }
  const series: TimePoint[] = amounts.map((v, i) => ({ t: i, v }));
  const flagged = detectAnomalies(series, { window: 7, madThreshold: 3.5 }).filter((a) => a.anomaly);
  const hitCount = flagged.length;
  const hitRate = hitCount / amounts.length;
  const verdict: Verdict = hitRate > 0.15 ? 'escalate' : hitRate > 0.05 ? 'flag' : 'clear';
  const severity = Math.min(1, hitRate * 4);
  return mk('spike_detection', 'behavioral_signals', ['data_analysis', 'smartness'],
    verdict, severity, 0.85,
    `Spike: ${hitCount}/${amounts.length} amounts flagged as rolling-MAD anomalies (>3.5σ). hit rate ${(hitRate * 100).toFixed(1)}%.`,
    { hypothesis: 'illicit_risk' });
};

// ── pattern_of_life ────────────────────────────────────────────────────
// Inter-event interval regularity (coefficient of variation on gaps).
// Low CV on human-initiated activity is unusual (bot / scheduler).
export const patternOfLifeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ts = timestamps(ctx.evidence.transactions);
  if (ts.length < 6) {
    return mk('pattern_of_life', 'forensic', ['intelligence'],
      'inconclusive', 0, 0.4,
      `Pattern-of-life: n=${ts.length} < 6 events.`);
  }
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push((ts[i]! - ts[i - 1]!) / 60_000);
  const m = mean(gaps);
  const sd = Math.sqrt(variance(gaps));
  const cv = m > 0 ? sd / m : 0;
  const verdict: Verdict = cv < 0.2 ? 'flag' : 'clear';
  return mk('pattern_of_life', 'forensic', ['intelligence'],
    verdict, cv < 0.2 ? 0.55 : 0.1, 0.8,
    `Pattern-of-life: mean gap ${m.toFixed(1)} min, sd ${sd.toFixed(1)} min, CV=${cv.toFixed(2)}. ${cv < 0.2 ? 'Inter-event intervals are suspiciously regular (possible scripted / bot activity).' : 'Intervals show normal human irregularity.'}`);
};

// ── peer_group_anomaly ─────────────────────────────────────────────────
// Compare subject mean amount to a peer cohort mean + sd from evidence.peerGroup.
export const peerGroupAnomalyApply = async (ctx: BrainContext): Promise<Finding> => {
  const subject = numsBy(ctx.evidence.transactions, 'amount');
  const peerRaw = (ctx.evidence as Record<string, unknown>).peerGroup;
  const peers = numsBy(peerRaw, 'amount');
  if (subject.length < 3 || peers.length < 10) {
    return mk('peer_group_anomaly', 'forensic', ['data_analysis'],
      'inconclusive', 0, 0.4,
      `Peer-group: subject n=${subject.length}, peers n=${peers.length}; insufficient data.`);
  }
  const sm = mean(subject);
  const pm = mean(peers);
  const psd = Math.sqrt(variance(peers));
  if (psd === 0) {
    return mk('peer_group_anomaly', 'forensic', ['data_analysis'],
      'inconclusive', 0, 0.5, 'Peer-group: zero variance in peer amounts; cannot standardise.');
  }
  const z = (sm - pm) / psd;
  const verdict: Verdict = Math.abs(z) > 2.5 ? 'escalate' : Math.abs(z) > 1.5 ? 'flag' : 'clear';
  return mk('peer_group_anomaly', 'forensic', ['data_analysis'],
    verdict, Math.min(1, Math.abs(z) / 4), 0.85,
    `Peer-group: subject mean ${sm.toFixed(2)}, peer mean ${pm.toFixed(2)}, sd ${psd.toFixed(2)}. z=${z.toFixed(2)}.`,
    { hypothesis: 'illicit_risk' });
};

// ── regime_change ──────────────────────────────────────────────────────
// Detect a mean shift: compare first-half and second-half amount means.
export const regimeChangeApply = async (ctx: BrainContext): Promise<Finding> => {
  const amounts = numsBy(ctx.evidence.transactions, 'amount');
  if (amounts.length < 10) {
    return mk('regime_change', 'behavioral_signals', ['data_analysis'],
      'inconclusive', 0, 0.4,
      `Regime: n=${amounts.length} < 10.`);
  }
  const mid = Math.floor(amounts.length / 2);
  const a = amounts.slice(0, mid);
  const b = amounts.slice(mid);
  const ma = mean(a); const mb = mean(b);
  const va = variance(a); const vb = variance(b);
  const pooled = Math.sqrt((va * (a.length - 1) + vb * (b.length - 1)) / Math.max(1, a.length + b.length - 2));
  const se = pooled * Math.sqrt(1 / a.length + 1 / b.length);
  const t = se > 0 ? Math.abs(mb - ma) / se : 0;
  const verdict: Verdict = t > 2.5 ? 'flag' : 'clear';
  return mk('regime_change', 'behavioral_signals', ['data_analysis'],
    verdict, Math.min(1, t / 4), 0.85,
    `Regime change: first-half mean ${ma.toFixed(2)} vs second-half mean ${mb.toFixed(2)}; t=${t.toFixed(2)} ${t > 2.5 ? '(significant structural break)' : '(within noise)'}.`,
    { hypothesis: 'illicit_risk' });
};

export const BEHAVIORAL_MODE_APPLIES = {
  velocity_analysis: velocityAnalysisApply,
  spike_detection: spikeDetectionApply,
  pattern_of_life: patternOfLifeApply,
  peer_group_anomaly: peerGroupAnomalyApply,
  regime_change: regimeChangeApply,
} as const;
