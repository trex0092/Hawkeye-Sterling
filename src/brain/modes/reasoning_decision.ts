// Hawkeye Sterling — reasoning logic & decision-theory modes (PR batch 7).
//
// Fifteen stubs promoted to real algorithms:
//
//   Extended logic
//   - predicate_logic      — first-order predicate consistency check
//   - fuzzy_logic          — fuzzy-membership scoring via t-norm aggregation
//   - default_reasoning    — closed-world default + defeater detection
//   - non_monotonic        — detects retraction of prior conclusions by new evidence
//   - temporal_logic       — temporal-ordering consistency of event sequences
//   - epistemic_logic      — known / believed / doubted knowledge-state analysis
//
//   Cognitive science
//   - planning_fallacy     — optimism-bias detection via estimated vs actual comparison
//   - overconfidence_check — confidence-calibration audit across predictions
//
//   Decision theory
//   - minimax              — worst-case scenario risk under adversarial conditions
//   - regret_min           — minimax-regret action selection
//   - marginal             — marginal benefit vs marginal cost compliance check
//   - break_even           — break-even volume analysis for business plausibility
//   - real_options         — option value assessment (defer / expand / abandon)
//   - risk_adjusted        — risk-adjusted return plausibility (Sharpe-like)
//
//   Forensic
//   - pareto               — 80/20 concentration of risk factors
//
// Charter: inconclusive when evidence key absent (P1). No external recall (P3).
// No legal conclusions (P5).

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
// predicate_logic — first-order predicate consistency check.
// evidence.predicates: { subject, predicate, object, negated? }[]
// Flags when a predicate and its negation both appear (contradiction).
// ──────────────────────────────────────────────────────────────────────
interface Predicate { subject: string; predicate: string; object: string; negated?: boolean }

export const predicate_logicApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'logic';
  const FAC: FacultyId[] = ['reasoning', 'ratiocination'];
  const ID = 'predicate_logic';

  const preds = typedEvidence<Predicate>(ctx, 'predicates');
  if (preds.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No predicate assertions supplied; cannot evaluate first-order consistency.');
  }

  const contradictions: string[] = [];
  const positives = preds.filter(p => !p.negated);
  const negatives = preds.filter(p => p.negated);

  for (const pos of positives) {
    const neg = negatives.find(
      n => n.subject === pos.subject && n.predicate === pos.predicate && n.object === pos.object,
    );
    if (neg) {
      contradictions.push(`${pos.subject} ${pos.predicate} ${pos.object}`);
    }
  }

  if (contradictions.length > 0) {
    const score = clamp01(contradictions.length / preds.length);
    return mkFinding(ID, CAT, FAC, 'flag', score, 0.75,
      `Predicate contradictions detected (${contradictions.length}): ${contradictions.slice(0, 3).join('; ')}.`);
  }

  return mkFinding(ID, CAT, FAC, 'clear', 0, 0.8,
    `${preds.length} predicate assertions checked; no contradictions detected.`);
};

// ──────────────────────────────────────────────────────────────────────
// fuzzy_logic — fuzzy-membership t-norm aggregation.
// evidence.fuzzyInputs: { variable, value, lowRisk, highRisk }[]
// Membership in "risk" set uses a sigmoidal ramp [lowRisk, highRisk].
// Combined via min t-norm across dimensions (conservatively).
// ──────────────────────────────────────────────────────────────────────
interface FuzzyInput { variable: string; value: number; lowRisk: number; highRisk: number }

function fuzzyRiskMembership(value: number, lo: number, hi: number): number {
  if (hi <= lo) return value >= hi ? 1 : 0;
  if (value <= lo) return 0;
  if (value >= hi) return 1;
  return (value - lo) / (hi - lo);
}

export const fuzzy_logicApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'logic';
  const FAC: FacultyId[] = ['reasoning', 'inference'];
  const ID = 'fuzzy_logic';

  const inputs = typedEvidence<FuzzyInput>(ctx, 'fuzzyInputs');
  if (inputs.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No fuzzy input variables supplied; fuzzy risk assessment cannot proceed.');
  }

  const memberships = inputs.map(i => ({
    variable: i.variable,
    mu: fuzzyRiskMembership(i.value, i.lowRisk, i.highRisk),
  }));

  // Aggregate via mean (Łukasiewicz-style) rather than strict min, to avoid
  // one zero dimension masking all others.
  const mean = memberships.reduce((s, m) => s + m.mu, 0) / memberships.length;
  const highCount = memberships.filter(m => m.mu >= 0.7).length;
  const topDims = memberships.filter(m => m.mu >= 0.5).map(m => m.variable).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (mean >= 0.6) verdict = 'escalate';
  else if (mean >= 0.35) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, mean, 0.7,
    `Fuzzy risk membership (mean μ=${mean.toFixed(2)}, ${highCount}/${inputs.length} dims ≥0.7). ` +
    (topDims ? `High-risk dimensions: ${topDims}.` : 'No dimensions in high-risk zone.'));
};

// ──────────────────────────────────────────────────────────────────────
// default_reasoning — closed-world default + defeater detection.
// evidence.defaultOverrides: { assumption, defeated: boolean, defeaterReason? }[]
// Innocent by default; each defeated assumption raises concern.
// ──────────────────────────────────────────────────────────────────────
interface DefaultOverride { assumption: string; defeated: boolean; defeaterReason?: string }

export const default_reasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'logic';
  const FAC: FacultyId[] = ['reasoning', 'inference'];
  const ID = 'default_reasoning';

  const overrides = typedEvidence<DefaultOverride>(ctx, 'defaultOverrides');
  if (overrides.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No default assumptions supplied; closed-world reasoning requires at least one assumption.');
  }

  const defeated = overrides.filter(o => o.defeated);
  const ratio = defeated.length / overrides.length;
  const reasons = defeated.map(d => d.defeaterReason ?? d.assumption).slice(0, 3).join('; ');

  let verdict: Verdict = 'clear';
  if (ratio >= 0.5) verdict = 'escalate';
  else if (ratio > 0) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, clamp01(ratio * 1.2), 0.72,
    defeated.length === 0
      ? `All ${overrides.length} default assumptions hold; no defeaters present.`
      : `${defeated.length}/${overrides.length} defaults defeated: ${reasons}.`);
};

// ──────────────────────────────────────────────────────────────────────
// non_monotonic — detects evidence that retracts prior conclusions.
// evidence.retractors: { retractedConclusion, severity? }[]
// More retractors = higher epistemic instability = higher risk score.
// ──────────────────────────────────────────────────────────────────────
interface Retractor { retractedConclusion: string; severity?: number }

export const non_monotonicApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'logic';
  const FAC: FacultyId[] = ['reasoning', 'inference'];
  const ID = 'non_monotonic';

  const retractors = typedEvidence<Retractor>(ctx, 'retractors');
  if (retractors.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No retractor evidence supplied; non-monotonic revision cannot be evaluated.');
  }

  const avgSeverity = retractors.reduce(
    (s, r) => s + (typeof r.severity === 'number' ? r.severity : 0.5), 0,
  ) / retractors.length;

  const score = clamp01(avgSeverity * (1 + retractors.length * 0.1));
  let verdict: Verdict = 'clear';
  if (score >= 0.6) verdict = 'escalate';
  else if (score >= 0.3) verdict = 'flag';

  const top = retractors.slice(0, 3).map(r => r.retractedConclusion).join('; ');
  return mkFinding(ID, CAT, FAC, verdict, score, 0.65,
    `${retractors.length} prior conclusion(s) retracted by new evidence (avg severity ${avgSeverity.toFixed(2)}). ` +
    `Retractions: ${top}.`);
};

// ──────────────────────────────────────────────────────────────────────
// temporal_logic — event-sequence ordering consistency.
// evidence.temporalEvents: { event, timestamp, requiredBefore?: string[] }[]
// Flags when an event whose preconditions haven't been met appears first.
// ──────────────────────────────────────────────────────────────────────
interface TemporalEvent { event: string; timestamp: number; requiredBefore?: string[] }

export const temporal_logicApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'logic';
  const FAC: FacultyId[] = ['reasoning'];
  const ID = 'temporal_logic';

  const events = typedEvidence<TemporalEvent>(ctx, 'temporalEvents');
  if (events.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No temporal events supplied; ordering consistency cannot be checked.');
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set<string>();
  const violations: string[] = [];

  for (const ev of sorted) {
    if (ev.requiredBefore) {
      for (const req of ev.requiredBefore) {
        if (!seen.has(req)) {
          violations.push(`"${ev.event}" appeared before required predecessor "${req}"`);
        }
      }
    }
    seen.add(ev.event);
  }

  if (violations.length > 0) {
    const score = clamp01(violations.length / events.length);
    return mkFinding(ID, CAT, FAC, 'flag', score, 0.78,
      `Temporal ordering violations (${violations.length}): ${violations.slice(0, 3).join('; ')}.`);
  }

  return mkFinding(ID, CAT, FAC, 'clear', 0, 0.82,
    `${events.length} temporal events checked; all ordering constraints satisfied.`);
};

// ──────────────────────────────────────────────────────────────────────
// epistemic_logic — knowledge-state analysis.
// evidence.knowledgeState: {
//   known: string[], unknown: string[],
//   believed: string[], doubted: string[]
// }
// Critical unknowns or doubted key facts raise epistemic risk.
// ──────────────────────────────────────────────────────────────────────
interface KnowledgeState {
  known?: string[]; unknown?: string[];
  believed?: string[]; doubted?: string[];
}

export const epistemic_logicApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'logic';
  const FAC: FacultyId[] = ['reasoning', 'introspection'];
  const ID = 'epistemic_logic';

  const ks = singleEvidence<KnowledgeState>(ctx, 'knowledgeState');
  if (!ks) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No knowledge-state evidence supplied; epistemic analysis cannot proceed.');
  }

  const known = ks.known?.length ?? 0;
  const unknown = ks.unknown?.length ?? 0;
  const doubted = ks.doubted?.length ?? 0;
  const total = known + unknown + (ks.believed?.length ?? 0) + doubted;

  if (total === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'Knowledge-state object is empty; epistemic analysis cannot proceed.');
  }

  const gapRatio = total === 0 ? 0 : (unknown + doubted) / total;
  let verdict: Verdict = 'clear';
  if (gapRatio >= 0.5) verdict = 'escalate';
  else if (gapRatio >= 0.25) verdict = 'flag';

  const topUnknown = (ks.unknown ?? []).slice(0, 3).join(', ');
  return mkFinding(ID, CAT, FAC, verdict, clamp01(gapRatio), 0.7,
    `Epistemic gap ratio: ${(gapRatio * 100).toFixed(0)}% (${unknown} unknown, ${doubted} doubted of ${total} propositions). ` +
    (topUnknown ? `Key unknowns: ${topUnknown}.` : ''));
};

// ──────────────────────────────────────────────────────────────────────
// planning_fallacy — optimism-bias detection via estimated vs actual comparison.
// evidence.projectEstimates: { label, estimated, actual }[]
// High systematic underestimation flags planning fallacy.
// ──────────────────────────────────────────────────────────────────────
interface ProjectEstimate { label: string; estimated: number; actual: number }

export const planning_fallacyApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'cognitive_science';
  const FAC: FacultyId[] = ['introspection'];
  const ID = 'planning_fallacy';

  const estimates = typedEvidence<ProjectEstimate>(ctx, 'projectEstimates');
  if (estimates.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No project estimates supplied; planning-fallacy detection requires estimated vs actual data.');
  }

  const ratios = estimates.map(e => (e.actual > 0 ? e.actual / e.estimated : 1));
  const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const overrunCount = ratios.filter(r => r > 1.2).length;

  // avgRatio >1 means actuals exceed estimates (underestimation bias).
  const bias = clamp01((avgRatio - 1) * 2); // 50% overrun → score 1.0

  let verdict: Verdict = 'clear';
  if (bias >= 0.5) verdict = 'flag';
  if (overrunCount >= Math.ceil(estimates.length * 0.6)) verdict = 'escalate';

  return mkFinding(ID, CAT, FAC, verdict, bias, 0.72,
    `Planning fallacy analysis: avg actual/estimated ratio ${avgRatio.toFixed(2)}, ` +
    `${overrunCount}/${estimates.length} items overran by >20%. ` +
    (bias >= 0.3 ? 'Systematic optimism bias detected.' : 'Estimates broadly calibrated.'));
};

// ──────────────────────────────────────────────────────────────────────
// overconfidence_check — confidence-calibration audit.
// evidence.predictions: { prediction, confidence, correct }[]
// Measures Brier-score and over-confidence gap.
// ──────────────────────────────────────────────────────────────────────
interface Prediction { prediction: string; confidence: number; correct: boolean }

export const overconfidence_checkApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'cognitive_science';
  const FAC: FacultyId[] = ['introspection'];
  const ID = 'overconfidence_check';

  const preds = typedEvidence<Prediction>(ctx, 'predictions');
  if (preds.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No prediction records supplied; confidence calibration audit cannot proceed.');
  }

  const brier = preds.reduce((s, p) => {
    const outcome = p.correct ? 1 : 0;
    return s + (p.confidence - outcome) ** 2;
  }, 0) / preds.length;

  // Perfect calibration → brier≈0.25 (50% base rate). Overconfidence → brier>0.25 with high conf.
  const avgConf = preds.reduce((s, p) => s + p.confidence, 0) / preds.length;
  const accuracy = preds.filter(p => p.correct).length / preds.length;
  const gap = clamp01(Math.max(0, avgConf - accuracy));

  let verdict: Verdict = 'clear';
  if (gap >= 0.3) verdict = 'escalate';
  else if (gap >= 0.15) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, gap, 0.75,
    `Confidence calibration: avg confidence ${(avgConf * 100).toFixed(0)}%, accuracy ${(accuracy * 100).toFixed(0)}%, ` +
    `gap ${(gap * 100).toFixed(0)}%, Brier score ${brier.toFixed(3)}. ` +
    (gap >= 0.15 ? 'Over-confidence bias detected.' : 'Calibration within acceptable bounds.'));
};

// ──────────────────────────────────────────────────────────────────────
// minimax — worst-case scenario risk under adversarial conditions.
// evidence.scenarios: { label, payoffs: number[] }[]
// Each payoff represents an outcome value; minimax selects the min across
// each scenario, then flags if the maximum of minima is still negative/risky.
// ──────────────────────────────────────────────────────────────────────
interface ScenarioPayoffs { label: string; payoffs: number[] }

export const minimaxApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'decision_theory';
  const FAC: FacultyId[] = ['reasoning'];
  const ID = 'minimax';

  const scenarios = typedEvidence<ScenarioPayoffs>(ctx, 'scenarios');
  if (scenarios.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No scenario payoff data supplied; minimax analysis cannot proceed.');
  }

  const minPayoffs = scenarios.map(s => ({
    label: s.label,
    minPayoff: s.payoffs.length > 0 ? Math.min(...s.payoffs) : 0,
  }));

  const maxMin = Math.max(...minPayoffs.map(m => m.minPayoff));
  const worstCase = minPayoffs.reduce((a, b) => (b.minPayoff < a.minPayoff ? b : a));

  // Normalise: if maxMin is negative, it signals material loss; score 0..1.
  const score = maxMin < 0 ? clamp01(Math.abs(maxMin) / (Math.abs(maxMin) + 1)) : 0;

  let verdict: Verdict = 'clear';
  if (score >= 0.5) verdict = 'escalate';
  else if (score >= 0.2) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.7,
    `Minimax analysis: worst-case scenario is "${worstCase.label}" (min payoff ${worstCase.minPayoff.toFixed(2)}). ` +
    `Best guaranteed outcome across ${scenarios.length} scenarios: ${maxMin.toFixed(2)}.`);
};

// ──────────────────────────────────────────────────────────────────────
// regret_min — minimax-regret action selection.
// evidence.payoffMatrix: {
//   actions: string[], states: string[], payoffs: number[][]
// }
// payoffs[action][state] = value. Computes regret table and reports on
// whether optimal action has low maximum regret.
// ──────────────────────────────────────────────────────────────────────
interface PayoffMatrix { actions: string[]; states: string[]; payoffs: number[][] }

export const regret_minApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'decision_theory';
  const FAC: FacultyId[] = ['reasoning'];
  const ID = 'regret_min';

  const matrix = singleEvidence<PayoffMatrix>(ctx, 'payoffMatrix');
  if (!matrix || matrix.actions.length === 0 || matrix.states.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No payoff matrix supplied; regret-minimisation analysis cannot proceed.');
  }

  const { actions, states, payoffs } = matrix;
  const nA = actions.length;
  const nS = states.length;

  // Max payoff per state.
  const stateMaxes = Array.from({ length: nS }, (_, s) =>
    Math.max(...Array.from({ length: nA }, (__, a) => payoffs[a]?.[s] ?? 0)),
  );

  // Regret[a][s] = stateMax[s] - payoff[a][s].
  const maxRegrets = Array.from({ length: nA }, (_, a) =>
    Math.max(...Array.from({ length: nS }, (__, s) =>
      (stateMaxes[s] ?? 0) - (payoffs[a]?.[s] ?? 0),
    )),
  );

  const minMaxRegret = Math.min(...maxRegrets);
  const bestAction = actions[maxRegrets.indexOf(minMaxRegret)] ?? 'unknown';
  const maxPossibleRegret = Math.max(...maxRegrets);

  // Normalise regret to 0..1.
  const regretRatio = maxPossibleRegret === 0 ? 0 : clamp01(minMaxRegret / maxPossibleRegret);

  let verdict: Verdict = 'clear';
  if (regretRatio >= 0.6) verdict = 'escalate';
  else if (regretRatio >= 0.3) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, regretRatio, 0.68,
    `Regret-minimisation: best action is "${bestAction}" with max-regret ${minMaxRegret.toFixed(2)} ` +
    `(normalised ${(regretRatio * 100).toFixed(0)}% of worst alternative). ` +
    `Matrix covers ${nA} actions × ${nS} states.`);
};

// ──────────────────────────────────────────────────────────────────────
// marginal — marginal benefit vs marginal cost compliance check.
// evidence.marginalAnalysis: { marginalBenefit, marginalCost, threshold? }
// If marginalCost > marginalBenefit by more than threshold, flags over-spend
// or under-benefit that may indicate disguised cash flow.
// ──────────────────────────────────────────────────────────────────────
interface MarginalAnalysis { marginalBenefit: number; marginalCost: number; threshold?: number }

export const marginalApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'decision_theory';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'marginal';

  const ma = singleEvidence<MarginalAnalysis>(ctx, 'marginalAnalysis');
  if (!ma) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No marginalAnalysis evidence supplied; marginal-analysis check cannot proceed.');
  }

  const { marginalBenefit: mb, marginalCost: mc } = ma;
  const threshold = typeof ma.threshold === 'number' ? ma.threshold : 0.1;

  if (mc <= 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.4,
      'Marginal cost is zero or negative; marginal analysis result unreliable.');
  }

  const ratio = mb / mc;   // >1 = benefit exceeds cost; <1 = cost exceeds benefit
  const excess = clamp01(Math.max(0, 1 - ratio) - threshold);

  let verdict: Verdict = 'clear';
  if (excess >= 0.4) verdict = 'escalate';
  else if (excess >= 0.1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, excess, 0.72,
    `Marginal analysis: benefit/cost ratio ${ratio.toFixed(2)} (threshold floor ${threshold.toFixed(2)}). ` +
    (ratio < 1 - threshold
      ? `Marginal cost significantly exceeds benefit — economically irrational without other explanation.`
      : `Marginal economics appear plausible.`));
};

// ──────────────────────────────────────────────────────────────────────
// break_even — break-even volume analysis for business plausibility.
// evidence.breakEven: { fixedCosts, variableMargin, actualVolume, revenuePerUnit }
// If actualVolume is far below break-even, the business model is suspect.
// ──────────────────────────────────────────────────────────────────────
interface BreakEvenData {
  fixedCosts: number; variableMargin: number;
  actualVolume: number; revenuePerUnit: number;
}

export const break_evenApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'decision_theory';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'break_even';

  const be = singleEvidence<BreakEvenData>(ctx, 'breakEven');
  if (!be) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No breakEven evidence supplied; break-even plausibility check cannot proceed.');
  }

  const { fixedCosts: fc, variableMargin: vm, actualVolume: av, revenuePerUnit: rpu } = be;

  if (vm <= 0 || rpu <= 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.4,
      'Variable margin or revenue per unit is zero/negative; break-even calculation invalid.');
  }

  const breakEvenVol = fc / vm;
  const coverageRatio = av / breakEvenVol;   // <1 = below break-even
  const deficit = clamp01(Math.max(0, 1 - coverageRatio));

  let verdict: Verdict = 'clear';
  if (deficit >= 0.5) verdict = 'escalate';
  else if (deficit >= 0.2) verdict = 'flag';

  const totalRevenue = av * rpu;
  return mkFinding(ID, CAT, FAC, verdict, deficit, 0.74,
    `Break-even volume: ${breakEvenVol.toFixed(0)} units; actual volume: ${av.toFixed(0)} ` +
    `(coverage ${(coverageRatio * 100).toFixed(0)}%, implied revenue ${totalRevenue.toFixed(0)}). ` +
    (deficit >= 0.2
      ? 'Business operating significantly below break-even — revenue source questionable.'
      : 'Business volume consistent with stated model.'));
};

// ──────────────────────────────────────────────────────────────────────
// real_options — option value assessment (defer / expand / abandon).
// evidence.realOptions: { optionType, underlyingValue, strikeValue, volatility }[]
// Uses Black-Scholes intrinsic-value proxy (no time-value for simplicity).
// High option value relative to stated underlying signals structuring risk.
// ──────────────────────────────────────────────────────────────────────
interface RealOption {
  optionType: 'defer' | 'expand' | 'abandon';
  underlyingValue: number;
  strikeValue: number;
  volatility: number;   // 0..1
}

export const real_optionsApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'decision_theory';
  const FAC: FacultyId[] = ['reasoning'];
  const ID = 'real_options';

  const opts = typedEvidence<RealOption>(ctx, 'realOptions');
  if (opts.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No real-options evidence supplied; option-value assessment cannot proceed.');
  }

  // Intrinsic value only: call = max(underlying - strike, 0); put/abandon = max(strike - underlying, 0).
  const values = opts.map(o => {
    const intrinsic = o.optionType === 'abandon'
      ? Math.max(o.strikeValue - o.underlyingValue, 0)
      : Math.max(o.underlyingValue - o.strikeValue, 0);
    // Volatility premium proxy.
    const premium = intrinsic * (1 + o.volatility);
    return { optionType: o.optionType, intrinsic, premium, ratio: o.underlyingValue > 0 ? premium / o.underlyingValue : 0 };
  });

  const avgRatio = values.reduce((s, v) => s + v.ratio, 0) / values.length;
  const score = clamp01(avgRatio * 0.6);   // ratio>1 = option worth more than underlying (suspicious)

  let verdict: Verdict = 'clear';
  if (avgRatio >= 1.5) verdict = 'escalate';
  else if (avgRatio >= 0.5) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.65,
    `Real-options analysis: ${opts.length} option(s), avg option/underlying ratio ${avgRatio.toFixed(2)}. ` +
    (avgRatio >= 0.5
      ? 'Option values disproportionate to underlying — potential structured-finance risk.'
      : 'Option values proportionate to underlying assets.'));
};

// ──────────────────────────────────────────────────────────────────────
// risk_adjusted — risk-adjusted return plausibility (Sharpe-like).
// evidence.riskAdjusted: { grossReturn, riskMeasure, benchmarkRatio? }
// Implausibly high Sharpe ratio signals fabricated or misrepresented returns.
// ──────────────────────────────────────────────────────────────────────
interface RiskAdjustedData { grossReturn: number; riskMeasure: number; benchmarkRatio?: number }

export const risk_adjustedApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'decision_theory';
  const FAC: FacultyId[] = ['reasoning', 'strong_brain'];
  const ID = 'risk_adjusted';

  const ra = singleEvidence<RiskAdjustedData>(ctx, 'riskAdjusted');
  if (!ra) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No riskAdjusted evidence supplied; risk-adjusted return analysis cannot proceed.');
  }

  const { grossReturn: gr, riskMeasure: rm } = ra;

  if (rm <= 0) {
    return mkFinding(ID, CAT, FAC, 'flag', 0.6, 0.6,
      'Risk measure is zero or negative — implies risk-free claim, which is implausible in AML context.');
  }

  const sharpe = gr / rm;
  const benchmark = typeof ra.benchmarkRatio === 'number' ? ra.benchmarkRatio : 3.0;
  const excess = sharpe - benchmark;

  let verdict: Verdict = 'clear';
  let score = 0;

  if (excess >= 2) { verdict = 'escalate'; score = clamp01(0.6 + excess * 0.1); }
  else if (excess >= 0.5) { verdict = 'flag'; score = clamp01(0.3 + excess * 0.2); }

  return mkFinding(ID, CAT, FAC, verdict, score, 0.75,
    `Risk-adjusted ratio: ${sharpe.toFixed(2)} (benchmark ${benchmark.toFixed(2)}). ` +
    (excess > 0
      ? `Excess over benchmark: ${excess.toFixed(2)} — return may be fabricated or misrepresented.`
      : `Return profile is within plausible range.`));
};

// ──────────────────────────────────────────────────────────────────────
// pareto — 80/20 concentration analysis of risk factors.
// evidence.riskFactors: { label, score }[]
// Computes cumulative share; flags if top-20% of factors carry >75% of risk.
// ──────────────────────────────────────────────────────────────────────
interface RiskFactor { label: string; score: number }

export const paretoApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'forensic';
  const FAC: FacultyId[] = ['data_analysis', 'ratiocination'];
  const ID = 'pareto';

  const factors = typedEvidence<RiskFactor>(ctx, 'riskFactors');
  if (factors.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No riskFactors evidence supplied; Pareto concentration analysis cannot proceed.');
  }

  const sorted = [...factors].sort((a, b) => b.score - a.score);
  const total = sorted.reduce((s, f) => s + f.score, 0);

  if (total <= 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.4,
      'All risk factor scores are zero; Pareto analysis is inconclusive.');
  }

  const top20Count = Math.max(1, Math.ceil(sorted.length * 0.2));
  const top20Sum = sorted.slice(0, top20Count).reduce((s, f) => s + f.score, 0);
  const top20Share = top20Sum / total;

  const topLabels = sorted.slice(0, Math.min(3, top20Count)).map(f => f.label).join(', ');

  // Classic Pareto: top 20% carrying >75% is expected but not itself suspicious.
  // What's suspicious is extreme concentration in 1-2 factors (>90%).
  const score = clamp01((top20Share - 0.6) * 2.5);   // 60% → 0, 100% → 1

  let verdict: Verdict = 'clear';
  if (top20Share >= 0.9) verdict = 'escalate';
  else if (top20Share >= 0.75) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.78,
    `Pareto analysis: top ${top20Count}/${factors.length} factors carry ${(top20Share * 100).toFixed(0)}% of risk. ` +
    `Dominant factors: ${topLabels}. ` +
    (top20Share >= 0.75
      ? 'Extreme concentration — a small number of factors dominate the risk profile.'
      : 'Risk distributed across multiple factors.'));
};

// ──────────────────────────────────────────────────────────────────────
// Export bundle
// ──────────────────────────────────────────────────────────────────────
export const REASONING_DECISION_MODE_APPLIES = {
  predicate_logic: predicate_logicApply,
  fuzzy_logic: fuzzy_logicApply,
  default_reasoning: default_reasoningApply,
  non_monotonic: non_monotonicApply,
  temporal_logic: temporal_logicApply,
  epistemic_logic: epistemic_logicApply,
  planning_fallacy: planning_fallacyApply,
  overconfidence_check: overconfidence_checkApply,
  minimax: minimaxApply,
  regret_min: regret_minApply,
  marginal: marginalApply,
  break_even: break_evenApply,
  real_options: real_optionsApply,
  risk_adjusted: risk_adjustedApply,
  pareto: paretoApply,
};
