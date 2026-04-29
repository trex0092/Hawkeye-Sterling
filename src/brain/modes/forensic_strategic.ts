// Hawkeye Sterling — forensic / strategic / statistical / graph / threat modes (batch 8).
//
// Fourteen stubs promoted to real algorithms:
//
//   Forensic
//   - swiss_cheese       — layered-defence hole alignment check
//
//   Strategic
//   - porter_adapted     — Five Forces compliance scan
//
//   Statistical
//   - regression         — linear/logistic residual anomaly check
//   - time_series        — ARIMA-proxy trend + changepoint detection
//   - markov_chain       — state-transition plausibility check
//   - survival           — Kaplan-Meier-proxy time-to-event analysis
//   - mdl                — minimum description length model complexity
//   - occam              — Occam's razor simplicity preference
//
//   Graph analysis
//   - motif_detection    — recurring sub-graph pattern check
//   - shortest_path      — minimum-hop path to high-risk node
//
//   Threat modeling
//   - stride             — Spoofing/Tampering/Repudiation/InfoDisc/DoS/EoP
//   - pasta              — 7-stage attack simulation
//   - mitre_attack       — ATT&CK tactic/technique mapping
//   - tabletop_exercise  — walked-through incident simulation scoring
//
// Charter: inconclusive without evidence (P1). No external recall (P3). No legal conclusions (P5).

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function mkFinding(
  modeId: string, category: ReasoningCategory, faculties: FacultyId[],
  verdict: Verdict, score: number, confidence: number, rationale: string,
  evidence: string[] = [],
): Finding {
  return {
    modeId, category, faculties,
    score: clamp01(score), confidence: clamp01(confidence),
    verdict, rationale, evidence, producedAt: Date.now(),
  };
}

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function singleEvidence<T>(ctx: BrainContext, key: string): T | undefined {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return v == null ? undefined : (v as T);
}

// ──────────────────────────────────────────────────────────────────────
// swiss_cheese — layered-defence hole alignment.
// evidence.defenceLayers: { name, holesPresent: boolean, holeSeverity? }[]
// Risk rises when multiple layers simultaneously have holes (holes align).
// ──────────────────────────────────────────────────────────────────────
interface DefenceLayer { name: string; holesPresent: boolean; holeSeverity?: number }

export const swiss_cheeseApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'forensic';
  const FAC: FacultyId[] = ['strong_brain'];
  const ID = 'swiss_cheese';

  const layers = typedEvidence<DefenceLayer>(ctx, 'defenceLayers');
  if (layers.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No defence-layer data supplied; Swiss Cheese assessment cannot proceed.');
  }

  const holed = layers.filter(l => l.holesPresent);
  const alignRatio = holed.length / layers.length;
  const avgSeverity = holed.length === 0 ? 0
    : holed.reduce((s, l) => s + (typeof l.holeSeverity === 'number' ? l.holeSeverity : 0.5), 0) / holed.length;

  // Risk multiplies when both ratio and severity are high.
  const score = clamp01(alignRatio * avgSeverity * 1.5);
  const holeNames = holed.map(l => l.name).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (alignRatio >= 0.5 && avgSeverity >= 0.5) verdict = 'escalate';
  else if (alignRatio >= 0.25 || avgSeverity >= 0.5) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.75,
    `Swiss Cheese: ${holed.length}/${layers.length} layers have holes (alignment ratio ${(alignRatio * 100).toFixed(0)}%, avg severity ${avgSeverity.toFixed(2)}). ` +
    (holeNames ? `Vulnerable layers: ${holeNames}.` : 'All defence layers intact.'));
};

// ──────────────────────────────────────────────────────────────────────
// porter_adapted — Five Forces compliance scan.
// evidence.fiveForces: { force, riskLevel }[]
// forces: supplier_power|buyer_power|substitutes|new_entrants|rivalry
// riskLevel: 0..1
// ──────────────────────────────────────────────────────────────────────
interface PorterForce { force: string; riskLevel: number }

export const porter_adaptedApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'strategic';
  const FAC: FacultyId[] = ['intelligence'];
  const ID = 'porter_adapted';

  const forces = typedEvidence<PorterForce>(ctx, 'fiveForces');
  if (forces.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No Five Forces data supplied; Porter compliance scan cannot proceed.');
  }

  const avgRisk = forces.reduce((s, f) => s + clamp01(f.riskLevel), 0) / forces.length;
  const highCount = forces.filter(f => f.riskLevel >= 0.6).length;
  const topForces = forces.filter(f => f.riskLevel >= 0.5).map(f => f.force).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (avgRisk >= 0.6) verdict = 'escalate';
  else if (avgRisk >= 0.35) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, avgRisk, 0.68,
    `Porter Five Forces (compliance-adapted): avg risk ${(avgRisk * 100).toFixed(0)}%, ${highCount}/${forces.length} forces elevated. ` +
    (topForces ? `High-risk forces: ${topForces}.` : 'No forces at elevated risk.'));
};

// ──────────────────────────────────────────────────────────────────────
// regression — linear residual anomaly check.
// evidence.regressionResiduals: { observation, residual, leverage? }[]
// High absolute residuals or high-leverage outliers flag anomalies.
// ──────────────────────────────────────────────────────────────────────
interface RegressionResidual { observation: string; residual: number; leverage?: number }

export const regressionApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'statistical';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'regression';

  const residuals = typedEvidence<RegressionResidual>(ctx, 'regressionResiduals');
  if (residuals.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No regression residuals supplied; anomaly detection cannot proceed.');
  }

  const absResiduals = residuals.map(r => Math.abs(r.residual));
  const mean = absResiduals.reduce((s, v) => s + v, 0) / absResiduals.length;
  const variance = absResiduals.reduce((s, v) => s + (v - mean) ** 2, 0) / absResiduals.length;
  const stdDev = Math.sqrt(variance);

  // Outliers: |residual| > mean + 2*std
  const threshold = mean + 2 * stdDev;
  const outliers = residuals.filter(r => Math.abs(r.residual) > threshold);
  const highLeverage = residuals.filter(r => typeof r.leverage === 'number' && r.leverage > 0.5);

  const outlierRatio = outliers.length / residuals.length;
  const score = clamp01(outlierRatio * 2 + highLeverage.length * 0.1);
  const outlierNames = outliers.map(r => r.observation).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (outlierRatio >= 0.15 || highLeverage.length >= 2) verdict = 'escalate';
  else if (outlierRatio >= 0.05 || highLeverage.length >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Regression anomaly check: ${outliers.length} outlier(s) beyond 2σ (${(outlierRatio * 100).toFixed(0)}%), ` +
    `${highLeverage.length} high-leverage point(s). ` +
    (outlierNames ? `Outlier observations: ${outlierNames}.` : 'No significant outliers.'));
};

// ──────────────────────────────────────────────────────────────────────
// time_series — trend + changepoint detection.
// evidence.timeSeries: { t: number, value: number }[]
// Detects structural breaks (changepoints) and persistent upward trend.
// ──────────────────────────────────────────────────────────────────────
interface TimeSeriesPoint { t: number; value: number }

export const time_seriesApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'statistical';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'time_series';

  const series = typedEvidence<TimeSeriesPoint>(ctx, 'timeSeries');
  if (series.length < 3) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'Fewer than 3 time-series points supplied; trend analysis cannot proceed.');
  }

  const sorted = [...series].sort((a, b) => a.t - b.t);
  const values = sorted.map(p => p.value);
  const n = values.length;

  // Simple linear trend via least squares.
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const slopeNorm = yMean === 0 ? 0 : slope / Math.abs(yMean);

  // Detect changepoint: split at midpoint, compare means.
  const mid = Math.floor(n / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const mean1 = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const mean2 = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  const changepointRatio = mean1 === 0 ? 0 : Math.abs(mean2 - mean1) / Math.abs(mean1);

  const score = clamp01(Math.max(Math.abs(slopeNorm) * 0.5, changepointRatio * 0.4));

  let verdict: Verdict = 'clear';
  if (score >= 0.5) verdict = 'escalate';
  else if (score >= 0.2) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.7,
    `Time-series analysis: normalised slope ${slopeNorm.toFixed(3)}, ` +
    `midpoint changepoint ratio ${(changepointRatio * 100).toFixed(0)}% over ${n} observations. ` +
    (score >= 0.2 ? 'Structural shift or persistent trend detected.' : 'No significant trend or changepoint.'));
};

// ──────────────────────────────────────────────────────────────────────
// markov_chain — state-transition plausibility check.
// evidence.stateTransitions: { from, to, observed, expected }[]
// Flags transitions that deviate significantly from expected probabilities.
// ──────────────────────────────────────────────────────────────────────
interface StateTransition { from: string; to: string; observed: number; expected: number }

export const markov_chainApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'statistical';
  const FAC: FacultyId[] = ['inference'];
  const ID = 'markov_chain';

  const transitions = typedEvidence<StateTransition>(ctx, 'stateTransitions');
  if (transitions.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No state-transition data supplied; Markov plausibility check cannot proceed.');
  }

  const anomalous = transitions.filter(t => {
    const ratio = t.expected === 0 ? (t.observed > 0 ? 10 : 0) : t.observed / t.expected;
    return ratio > 3 || ratio < 0.1;
  });

  const anomalyRatio = anomalous.length / transitions.length;
  const topAnomalies = anomalous.slice(0, 3).map(t => `${t.from}→${t.to}`).join(', ');

  let verdict: Verdict = 'clear';
  if (anomalyRatio >= 0.3) verdict = 'escalate';
  else if (anomalyRatio >= 0.1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, clamp01(anomalyRatio * 2), 0.72,
    `Markov chain: ${anomalous.length}/${transitions.length} transitions anomalous (>3× or <10% of expected). ` +
    (topAnomalies ? `Anomalous transitions: ${topAnomalies}.` : 'All transitions within expected bounds.'));
};

// ──────────────────────────────────────────────────────────────────────
// survival — time-to-event analysis (Kaplan-Meier proxy).
// evidence.survivalEvents: { id, duration, event: boolean }[]
// Short survival (high early-event rate) with many events flags accelerated risk.
// ──────────────────────────────────────────────────────────────────────
interface SurvivalEvent { id: string; duration: number; event: boolean }

export const survivalApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'statistical';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'survival';

  const events = typedEvidence<SurvivalEvent>(ctx, 'survivalEvents');
  if (events.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No survival-event data supplied; time-to-event analysis cannot proceed.');
  }

  const occurred = events.filter(e => e.event);
  const eventRate = occurred.length / events.length;

  if (occurred.length === 0) {
    return mkFinding(ID, CAT, FAC, 'clear', 0, 0.7,
      `Survival analysis: 0 events across ${events.length} subjects — no risk events detected.`);
  }

  const avgDuration = events.reduce((s, e) => s + e.duration, 0) / events.length;
  const avgEventDuration = occurred.reduce((s, e) => s + e.duration, 0) / occurred.length;
  // Short time to event relative to observation window → higher risk.
  const speedRatio = avgDuration === 0 ? 0 : clamp01(1 - avgEventDuration / avgDuration);
  const score = clamp01(eventRate * 0.7 + speedRatio * 0.3);

  let verdict: Verdict = 'clear';
  if (score >= 0.55) verdict = 'escalate';
  else if (score >= 0.25) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.7,
    `Survival analysis: event rate ${(eventRate * 100).toFixed(0)}% (${occurred.length}/${events.length}), ` +
    `avg time-to-event ${avgEventDuration.toFixed(1)} vs avg observation ${avgDuration.toFixed(1)}. ` +
    (speedRatio >= 0.3 ? 'Events occurring early in observation window — accelerated-risk pattern.' : ''));
};

// ──────────────────────────────────────────────────────────────────────
// mdl — Minimum Description Length model-complexity check.
// evidence.mdlCandidates: { modelId, modelBits, dataBits }[]
// Selects the best model (min total bits); flags when best model is still complex.
// ──────────────────────────────────────────────────────────────────────
interface MdlCandidate { modelId: string; modelBits: number; dataBits: number }

export const mdlApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'statistical';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'mdl';

  const candidates = typedEvidence<MdlCandidate>(ctx, 'mdlCandidates');
  if (candidates.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No MDL candidate models supplied; model-selection analysis cannot proceed.');
  }

  const withTotal = candidates.map(c => ({ ...c, total: c.modelBits + c.dataBits }));
  const best = withTotal.reduce((a, b) => b.total < a.total ? b : a);
  const worst = withTotal.reduce((a, b) => b.total > a.total ? b : a);

  // Relative complexity: if best model description length is a large fraction of total, data is hard to compress.
  const complexity = worst.total === 0 ? 0 : best.total / worst.total;
  const score = clamp01(complexity);

  let verdict: Verdict = 'clear';
  if (complexity >= 0.85) verdict = 'flag'; // best model still nearly as complex as worst
  if (best.modelBits > best.dataBits * 2) verdict = 'escalate'; // model dominates — overfitting risk

  return mkFinding(ID, CAT, FAC, verdict, score, 0.65,
    `MDL: best model "${best.modelId}" (total ${best.total} bits = ${best.modelBits} model + ${best.dataBits} data). ` +
    `Relative complexity vs worst: ${(complexity * 100).toFixed(0)}%. ` +
    (verdict !== 'clear' ? 'High model complexity may indicate overfitting or noise exploitation.' : 'Model complexity within reasonable bounds.'));
};

// ──────────────────────────────────────────────────────────────────────
// occam — Occam's Razor simplicity preference.
// evidence.hypotheses: { id, explanatoryPower, complexity }[]
// Flags when the preferred (selected) hypothesis is unnecessarily complex.
// ──────────────────────────────────────────────────────────────────────
interface Hypothesis { id: string; explanatoryPower: number; complexity: number; selected?: boolean }

export const occamApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'statistical';
  const FAC: FacultyId[] = ['reasoning'];
  const ID = 'occam';

  const hyps = typedEvidence<Hypothesis>(ctx, 'hypotheses');
  if (hyps.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No competing hypotheses supplied; Occam\'s Razor analysis cannot proceed.');
  }

  // Score each hypothesis: higher is better = high explanatory power, low complexity.
  const scored = hyps.map(h => ({
    ...h,
    occamScore: h.explanatoryPower / Math.max(h.complexity, 0.01),
  }));

  const best = scored.reduce((a, b) => b.occamScore > a.occamScore ? b : a);
  const selected = scored.find(h => h.selected) ?? best;

  // If selected hypothesis is not the simplest-adequate one, flag the violation.
  const violation = selected.id !== best.id && selected.occamScore < best.occamScore * 0.7;
  const ratio = best.occamScore === 0 ? 1 : selected.occamScore / best.occamScore;

  const score = clamp01(1 - ratio);
  let verdict: Verdict = 'clear';
  if (violation && score >= 0.4) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.65,
    `Occam's Razor: preferred hypothesis "${selected.id}" (score ${selected.occamScore.toFixed(2)}); ` +
    `simplest-adequate hypothesis "${best.id}" (score ${best.occamScore.toFixed(2)}). ` +
    (violation ? 'Selected explanation is unnecessarily complex — simpler adequate hypothesis exists.' : 'Selected hypothesis satisfies parsimony.'));
};

// ──────────────────────────────────────────────────────────────────────
// motif_detection — recurring sub-graph pattern check.
// evidence.graphMotifs: { motifType, count, expectedCount, entities?: string[] }[]
// Star/funnel/cycle motifs with counts > expected flag layering patterns.
// ──────────────────────────────────────────────────────────────────────
interface GraphMotif { motifType: string; count: number; expectedCount: number; entities?: string[] }

export const motif_detectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'graph_analysis';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'motif_detection';

  const motifs = typedEvidence<GraphMotif>(ctx, 'graphMotifs');
  if (motifs.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No graph-motif data supplied; sub-graph pattern detection cannot proceed.');
  }

  const anomalous = motifs.filter(m => m.expectedCount > 0 && m.count / m.expectedCount > 2);
  const topMotifs = anomalous.slice(0, 3).map(m => `${m.motifType}(×${m.count})`).join(', ');
  const anomalyRatio = anomalous.length / motifs.length;
  const maxExcess = motifs.reduce((best, m) => {
    const excess = m.expectedCount === 0 ? 0 : (m.count - m.expectedCount) / m.expectedCount;
    return excess > best ? excess : best;
  }, 0);

  const score = clamp01(anomalyRatio * 0.5 + Math.min(maxExcess / 10, 0.5));

  let verdict: Verdict = 'clear';
  if (score >= 0.5) verdict = 'escalate';
  else if (score >= 0.2) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Motif detection: ${anomalous.length}/${motifs.length} motif types exceed 2× expected frequency. ` +
    (topMotifs ? `Anomalous motifs: ${topMotifs}.` : 'All motif frequencies within expected range.'));
};

// ──────────────────────────────────────────────────────────────────────
// shortest_path — minimum-hop path to high-risk node.
// evidence.shortestPath: { hops, targetNodeRisk, pathNodes?: string[] }
// Fewer hops to a high-risk node = higher concern.
// ──────────────────────────────────────────────────────────────────────
interface ShortestPathData { hops: number; targetNodeRisk: number; pathNodes?: string[] }

export const shortest_pathApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'graph_analysis';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'shortest_path';

  const sp = singleEvidence<ShortestPathData>(ctx, 'shortestPath');
  if (!sp) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No shortestPath evidence supplied; network proximity analysis cannot proceed.');
  }

  if (sp.hops <= 0) {
    return mkFinding(ID, CAT, FAC, 'escalate', 0.9, 0.85,
      'Subject is directly the high-risk node (0 hops) — immediate escalation.');
  }

  // Proximity risk: 1 hop = very high, decays with distance.
  const proximityRisk = sp.targetNodeRisk * (1 / sp.hops);
  const score = clamp01(proximityRisk);
  const pathDesc = sp.pathNodes ? sp.pathNodes.slice(0, 5).join(' → ') : `${sp.hops} hops`;

  let verdict: Verdict = 'clear';
  if (score >= 0.5) verdict = 'escalate';
  else if (score >= 0.2) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.75,
    `Shortest path: ${sp.hops} hop(s) to high-risk node (risk ${sp.targetNodeRisk.toFixed(2)}). ` +
    `Path: ${pathDesc}. Proximity risk score: ${score.toFixed(2)}.`);
};

// ──────────────────────────────────────────────────────────────────────
// stride — STRIDE threat model.
// evidence.strideThreats: { category, present: boolean, severity? }[]
// categories: spoofing|tampering|repudiation|info_disclosure|dos|elevation
// ──────────────────────────────────────────────────────────────────────
interface StrideThreat { category: string; present: boolean; severity?: number }

export const strideApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'threat_modeling';
  const FAC: FacultyId[] = ['intelligence'];
  const ID = 'stride';

  const threats = typedEvidence<StrideThreat>(ctx, 'strideThreats');
  if (threats.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No STRIDE threat data supplied; threat modeling cannot proceed.');
  }

  const active = threats.filter(t => t.present);
  const avgSeverity = active.length === 0 ? 0
    : active.reduce((s, t) => s + (typeof t.severity === 'number' ? t.severity : 0.5), 0) / active.length;

  const coverage = active.length / Math.max(threats.length, 6);
  const score = clamp01(coverage * 0.6 + avgSeverity * 0.4);
  const activeCats = active.map(t => t.category).slice(0, 4).join(', ');

  let verdict: Verdict = 'clear';
  if (score >= 0.55) verdict = 'escalate';
  else if (score >= 0.25) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.75,
    `STRIDE: ${active.length}/${threats.length} threat categories present (avg severity ${avgSeverity.toFixed(2)}). ` +
    (activeCats ? `Active threats: ${activeCats}.` : 'No STRIDE threats detected.'));
};

// ──────────────────────────────────────────────────────────────────────
// pasta — 7-stage Process for Attack Simulation and Threat Analysis.
// evidence.pastaStages: { stage: 1..7, riskScore: number, notes?: string }[]
// Aggregates per-stage scores; late-stage presence (stages 5-7) is more severe.
// ──────────────────────────────────────────────────────────────────────
interface PastaStage { stage: number; riskScore: number; notes?: string }

export const pastaApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'threat_modeling';
  const FAC: FacultyId[] = ['intelligence'];
  const ID = 'pasta';

  const stages = typedEvidence<PastaStage>(ctx, 'pastaStages');
  if (stages.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No PASTA stage data supplied; attack simulation assessment cannot proceed.');
  }

  // Stages 5-7 (exploitation, impact, countermeasure gaps) carry higher weight.
  const weighted = stages.reduce((s, st) => {
    const w = st.stage >= 5 ? 1.5 : 1.0;
    return s + clamp01(st.riskScore) * w;
  }, 0);
  const maxWeight = stages.reduce((s, st) => s + (st.stage >= 5 ? 1.5 : 1.0), 0);
  const score = maxWeight === 0 ? 0 : clamp01(weighted / maxWeight);

  const lateStageHits = stages.filter(s => s.stage >= 5 && s.riskScore >= 0.5);

  let verdict: Verdict = 'clear';
  if (score >= 0.55 || lateStageHits.length >= 2) verdict = 'escalate';
  else if (score >= 0.25 || lateStageHits.length >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `PASTA (${stages.length}/7 stages assessed): weighted risk ${score.toFixed(2)}, ` +
    `${lateStageHits.length} late-stage (5-7) high-risk stage(s). ` +
    (verdict !== 'clear' ? 'Attack simulation indicates elevated exploitation risk.' : 'No significant attack path identified.'));
};

// ──────────────────────────────────────────────────────────────────────
// mitre_attack — ATT&CK tactic/technique mapping.
// evidence.mitreFindings: { tactic, technique, confidence: 0..1 }[]
// Flags when recognised tactics/techniques map to observed behaviour.
// ──────────────────────────────────────────────────────────────────────
interface MitreFinding { tactic: string; technique: string; confidence: number }

export const mitre_attackApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'threat_modeling';
  const FAC: FacultyId[] = ['intelligence'];
  const ID = 'mitre_attack';

  const findings = typedEvidence<MitreFinding>(ctx, 'mitreFindings');
  if (findings.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No MITRE ATT&CK findings supplied; tactic/technique mapping cannot proceed.');
  }

  const highConf = findings.filter(f => f.confidence >= 0.6);
  const avgConf = findings.reduce((s, f) => s + f.confidence, 0) / findings.length;
  const distinctTactics = new Set(findings.map(f => f.tactic)).size;
  const topTactics = [...new Set(highConf.map(f => f.tactic))].slice(0, 3).join(', ');

  const score = clamp01(avgConf * 0.5 + (distinctTactics / 14) * 0.5); // 14 MITRE tactics

  let verdict: Verdict = 'clear';
  if (highConf.length >= 3 || distinctTactics >= 4) verdict = 'escalate';
  else if (highConf.length >= 1 || distinctTactics >= 2) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.75,
    `MITRE ATT&CK: ${findings.length} technique(s) mapped across ${distinctTactics} tactic(s) ` +
    `(${highConf.length} high-confidence). ` +
    (topTactics ? `Key tactics: ${topTactics}.` : 'No high-confidence tactic matches.'));
};

// ──────────────────────────────────────────────────────────────────────
// tabletop_exercise — incident simulation scoring.
// evidence.tabletopResults: { scenario, detected: boolean, responseTimeMin: number, gapsIdentified: string[] }[]
// Low detection rate and long response times flag preparedness gaps.
// ──────────────────────────────────────────────────────────────────────
interface TabletopResult {
  scenario: string; detected: boolean;
  responseTimeMin: number; gapsIdentified: string[];
}

export const tabletop_exerciseApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'threat_modeling';
  const FAC: FacultyId[] = ['deep_thinking'];
  const ID = 'tabletop_exercise';

  const results = typedEvidence<TabletopResult>(ctx, 'tabletopResults');
  if (results.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No tabletop exercise results supplied; preparedness assessment cannot proceed.');
  }

  const detectionRate = results.filter(r => r.detected).length / results.length;
  const avgResponseMin = results.reduce((s, r) => s + r.responseTimeMin, 0) / results.length;
  const totalGaps = results.reduce((s, r) => s + r.gapsIdentified.length, 0);
  const allGaps = results.flatMap(r => r.gapsIdentified).slice(0, 3).join(', ');

  // Low detection + slow response = high preparedness gap.
  const preparednessGap = clamp01((1 - detectionRate) * 0.5 + Math.min(avgResponseMin / 120, 0.5));
  const score = clamp01(preparednessGap + totalGaps * 0.05);

  let verdict: Verdict = 'clear';
  if (detectionRate < 0.5 || avgResponseMin > 60) verdict = 'escalate';
  else if (detectionRate < 0.8 || avgResponseMin > 30 || totalGaps > 3) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Tabletop exercise: detection rate ${(detectionRate * 100).toFixed(0)}%, ` +
    `avg response ${avgResponseMin.toFixed(0)} min, ${totalGaps} gap(s) identified. ` +
    (allGaps ? `Key gaps: ${allGaps}.` : 'No critical gaps identified.'));
};

// ──────────────────────────────────────────────────────────────────────
// Export bundle
// ──────────────────────────────────────────────────────────────────────
export const FORENSIC_STRATEGIC_MODE_APPLIES = {
  swiss_cheese: swiss_cheeseApply,
  porter_adapted: porter_adaptedApply,
  regression: regressionApply,
  time_series: time_seriesApply,
  markov_chain: markov_chainApply,
  survival: survivalApply,
  mdl: mdlApply,
  occam: occamApply,
  motif_detection: motif_detectionApply,
  shortest_path: shortest_pathApply,
  stride: strideApply,
  pasta: pastaApply,
  mitre_attack: mitre_attackApply,
  tabletop_exercise: tabletop_exerciseApply,
};
