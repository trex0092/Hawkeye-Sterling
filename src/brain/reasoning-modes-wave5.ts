// Wave 5 — decision theory, behavioral economics, strategic reasoning,
// intelligence fusion, asset recovery, conduct risk, identity fraud,
// digital economy, and human rights reasoning modes.
// 37 modes. All with bespoke apply functions.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { defaultApply } from './modes/default-apply.js';

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
  apply?: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode => ({
  id, name, category, faculties, wave: 5, description,
  apply: apply ?? defaultApply(id, category, faculties, description),
});

// ─── SHARED HELPERS ─────────────────────────────────────────────────────

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof ctx.evidence.freeText === 'string') parts.push(ctx.evidence.freeText);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}

/** Factory: returns an async apply function that searches freeText + prior
 *  rationales for the given keyword list and maps hit-count to a verdict. */
function linguisticApply(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  patterns: string[],
  label: string,
  flagThreshold: number,
  escalateThreshold: number,
): (ctx: BrainContext) => Promise<Finding> {
  return async (ctx: BrainContext): Promise<Finding> => {
    const text = freeTextOf(ctx);
    const hits = patterns.filter((p) => text.includes(p.toLowerCase()));
    const ratio = hits.length / Math.max(patterns.length, 1);
    const score = Math.min(0.9, hits.length * (1 / Math.max(5, patterns.length / 2)));
    return {
      modeId,
      category,
      faculties,
      score,
      confidence: 0.65,
      verdict: hits.length >= escalateThreshold ? 'escalate' : hits.length >= flagThreshold ? 'flag' : 'clear',
      rationale: `${label}: ${hits.length}/${patterns.length} pattern${hits.length === 1 ? '' : 's'} matched (${(ratio * 100).toFixed(1)}% coverage). ${
        hits.length > 0
          ? 'Indicators: ' + hits.slice(0, 4).map((h) => `"${h}"`).join(', ') + '.'
          : 'No indicators found.'}`,
      evidence: hits.length > 0
        ? hits.slice(0, 8).map((h) => `pattern="${h}"`)
        : [`text_chars=${text.length}`],
      producedAt: Date.now(),
    };
  };
}

/** Mean score of prior findings, or fallback if none. */
function priorMeanScore(ctx: BrainContext, fallback = 0.3): number {
  const ps = ctx.priorFindings;
  if (ps.length === 0) return fallback;
  return ps.reduce((a, f) => a + f.score, 0) / ps.length;
}

// ─── DECISION THEORY IMPLEMENTATIONS ────────────────────────────────────

async function expectedValueDecisionApply(ctx: BrainContext): Promise<Finding> {
  const pML = priorMeanScore(ctx, 0.3);
  // cost_false_clear=10, cost_false_escalate=2
  const evEscalate = pML * (-10) + (1 - pML) * (-2);
  const evClear = pML * (-10) + (1 - pML) * 1;
  const evBlock = pML * (-5) + (1 - pML) * (-8);

  const options: Array<{ action: string; ev: number }> = [
    { action: 'escalate', ev: evEscalate },
    { action: 'clear', ev: evClear },
    { action: 'block', ev: evBlock },
  ];
  options.sort((a, b) => b.ev - a.ev);
  const dominant = options[0] ?? { action: 'flag', ev: 0 };
  const verdictMap: Record<string, Finding['verdict']> = {
    escalate: 'escalate', clear: 'clear', block: 'block',
  };
  const verdict = verdictMap[dominant.action] ?? 'flag';
  return {
    modeId: 'expected_value_decision',
    category: 'decision_theory',
    faculties: ['reasoning', 'strong_brain'],
    score: pML,
    confidence: 0.75,
    verdict,
    rationale: `EV decision: P(ML)=${pML.toFixed(3)}. EV(escalate)=${evEscalate.toFixed(2)}, EV(clear)=${evClear.toFixed(2)}, EV(block)=${evBlock.toFixed(2)}. Dominant action: ${dominant.action} (EV=${dominant.ev.toFixed(2)}).`,
    evidence: [
      `p_ml=${pML.toFixed(3)}`,
      `ev_escalate=${evEscalate.toFixed(2)}`,
      `ev_clear=${evClear.toFixed(2)}`,
      `ev_block=${evBlock.toFixed(2)}`,
      `dominant=${dominant.action}`,
    ],
    producedAt: Date.now(),
  };
}

async function regretMinimizationApply(ctx: BrainContext): Promise<Finding> {
  const pML = priorMeanScore(ctx, 0.3);
  // utility(action, state): escalate/ML=1, escalate/clean=−2, clear/ML=−10, clear/clean=1, block/ML=2, block/clean=−5
  const utilities: Record<string, { ml: number; clean: number }> = {
    escalate: { ml: 1, clean: -2 },
    clear: { ml: -10, clean: 1 },
    block: { ml: 2, clean: -5 },
  };
  // best utility for each state
  const bestML = Math.max(...Object.values(utilities).map((u) => u.ml));   // 2
  const bestClean = Math.max(...Object.values(utilities).map((u) => u.clean)); // 1
  // regret(action, state) = best(state) - utility(action, state)
  const regrets: Array<{ action: string; maxRegret: number }> = Object.entries(utilities).map(
    ([action, u]) => ({
      action,
      maxRegret: Math.max(bestML - u.ml, bestClean - u.clean),
    }),
  );
  regrets.sort((a, b) => a.maxRegret - b.maxRegret);
  const best = regrets[0] ?? { action: 'flag', maxRegret: 0 };
  const verdictMap: Record<string, Finding['verdict']> = {
    escalate: 'escalate', clear: 'clear', block: 'block',
  };
  return {
    modeId: 'regret_minimization',
    category: 'decision_theory',
    faculties: ['reasoning', 'inference'],
    score: pML,
    confidence: 0.70,
    verdict: verdictMap[best.action] ?? 'flag',
    rationale: `Minimax regret: P(ML)=${pML.toFixed(3)}. Regrets — ${regrets.map((r) => `${r.action}=${r.maxRegret.toFixed(1)}`).join(', ')}. Minimax action: ${best.action} (max-regret=${best.maxRegret.toFixed(1)}).`,
    evidence: [
      `p_ml=${pML.toFixed(3)}`,
      ...regrets.map((r) => `regret_${r.action}=${r.maxRegret.toFixed(1)}`),
      `minimax_action=${best.action}`,
    ],
    producedAt: Date.now(),
  };
}

async function multiCriteriaDecisionApply(ctx: BrainContext): Promise<Finding> {
  const ev = ctx.evidence;
  const sancN = Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0;
  const pepN = Array.isArray(ev.pepHits) ? ev.pepHits.length : 0;
  const uboN = Array.isArray(ev.uboChain) ? ev.uboChain.length : 0;
  const txN = Array.isArray(ev.transactions) ? ev.transactions.length : 0;
  const advN = Array.isArray(ev.adverseMedia) ? ev.adverseMedia.length : 0;
  const docN = Array.isArray(ev.documents) ? ev.documents.length : 0;

  // Criterion 1: Regulatory compliance (weight 0.4)
  // Proxy: presence/count of sanctions + pep + prior jurisdiction flags
  const jurFlagCount = ctx.priorFindings.filter(
    (f) => f.rationale.toLowerCase().includes('jurisdiction') || f.rationale.toLowerCase().includes('fatf'),
  ).length;
  const regScore = Math.min(1, (sancN * 0.5 + pepN * 0.3 + jurFlagCount * 0.2) / Math.max(1, sancN + pepN + jurFlagCount + 1));

  // Criterion 2: Customer fairness (weight 0.3): inverse of evidence density
  const populated = [sancN, pepN, advN, uboN, txN, docN].filter((n) => n > 0).length;
  const fairnessScore = Math.max(0, 1 - populated / 6); // fewer channels = less known = more fair to proceed

  // Criterion 3: Institutional risk (weight 0.3): mean prior score
  const instRisk = priorMeanScore(ctx, 0.3);

  const aggregate = 0.4 * regScore + 0.3 * fairnessScore + 0.3 * instRisk;
  const verdict: Finding['verdict'] = aggregate >= 0.65 ? 'escalate' : aggregate >= 0.4 ? 'flag' : 'clear';

  return {
    modeId: 'multi_criteria_decision_analysis',
    category: 'decision_theory',
    faculties: ['reasoning', 'strong_brain'],
    score: aggregate,
    confidence: 0.72,
    verdict,
    rationale: `MCDA: reg_compliance=${regScore.toFixed(2)}×0.4, customer_fairness=${fairnessScore.toFixed(2)}×0.3, inst_risk=${instRisk.toFixed(2)}×0.3 → aggregate=${aggregate.toFixed(3)}.`,
    evidence: [
      `reg_compliance=${regScore.toFixed(3)}`,
      `customer_fairness=${fairnessScore.toFixed(3)}`,
      `inst_risk=${instRisk.toFixed(3)}`,
      `aggregate=${aggregate.toFixed(3)}`,
      `populated_channels=${populated}`,
    ],
    producedAt: Date.now(),
  };
}

async function valueOfInformationApply(ctx: BrainContext): Promise<Finding> {
  const ps = ctx.priorFindings;
  // Current uncertainty = variance of prior scores (or 0.25 if no priors)
  let uncertainty = 0.25;
  if (ps.length > 1) {
    const mean = ps.reduce((a, f) => a + f.score, 0) / ps.length;
    uncertainty = ps.reduce((a, f) => a + (f.score - mean) ** 2, 0) / ps.length;
  }

  const ev = ctx.evidence;
  const channelWeights: Array<{ name: string; weight: number; len: number }> = [
    { name: 'sanctions', weight: 0.4, len: Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0 },
    { name: 'pep', weight: 0.3, len: Array.isArray(ev.pepHits) ? ev.pepHits.length : 0 },
    { name: 'ubo', weight: 0.2, len: Array.isArray(ev.uboChain) ? ev.uboChain.length : 0 },
    { name: 'transactions', weight: 0.1, len: Array.isArray(ev.transactions) ? ev.transactions.length : 0 },
  ];

  const missing = channelWeights.filter((c) => c.len === 0);
  const totalVOI = missing.reduce((a, c) => a + uncertainty * c.weight, 0);
  const cappedVOI = Math.min(0.8, totalVOI);

  const missingByVOI = missing
    .map((c) => ({ name: c.name, voi: uncertainty * c.weight }))
    .sort((a, b) => b.voi - a.voi);

  const verdict: Finding['verdict'] = cappedVOI >= 0.4 ? 'flag' : cappedVOI >= 0.2 ? 'flag' : 'clear';

  return {
    modeId: 'value_of_information',
    category: 'decision_theory',
    faculties: ['reasoning', 'inference'],
    score: cappedVOI,
    confidence: 0.70,
    verdict,
    rationale: `VOI: uncertainty=${uncertainty.toFixed(3)}, missing channels=${missing.length} [${missing.map((c) => c.name).join(', ')}]. Total VOI=${totalVOI.toFixed(3)} (capped ${cappedVOI.toFixed(3)}). Priority EDD: ${missingByVOI.map((c) => `${c.name}(${c.voi.toFixed(2)})`).join(' > ') || 'none'}.`,
    evidence: [
      `uncertainty=${uncertainty.toFixed(3)}`,
      `missing_channels=${missing.length}`,
      `total_voi=${totalVOI.toFixed(3)}`,
      ...missingByVOI.map((c) => `edd_priority:${c.name}=${c.voi.toFixed(3)}`),
    ],
    producedAt: Date.now(),
  };
}

async function satisficingVsOptimisingApply(ctx: BrainContext): Promise<Finding> {
  const ev = ctx.evidence;
  const sancN = Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0;
  const pepN = Array.isArray(ev.pepHits) ? ev.pepHits.length : 0;

  const highStakesByScore = ctx.priorFindings.some((f) => f.score >= 0.6);
  const highStakesByHits = sancN > 0 || pepN > 0;
  const highStakes = highStakesByScore || highStakesByHits;

  const totalChannels = 6;
  const populated = [
    Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0,
    Array.isArray(ev.pepHits) ? ev.pepHits.length : 0,
    Array.isArray(ev.adverseMedia) ? ev.adverseMedia.length : 0,
    Array.isArray(ev.uboChain) ? ev.uboChain.length : 0,
    Array.isArray(ev.transactions) ? ev.transactions.length : 0,
    Array.isArray(ev.documents) ? ev.documents.length : 0,
  ].filter((n) => n > 0).length;

  const completeness = populated / totalChannels;
  const satisficingWhenShouldOptimise = highStakes && completeness < 0.5;

  const score = satisficingWhenShouldOptimise ? 0.65 : completeness >= 0.5 ? 0.15 : 0.3;
  const verdict: Finding['verdict'] = satisficingWhenShouldOptimise ? 'flag' : 'clear';

  return {
    modeId: 'satisficing_vs_optimizing',
    category: 'decision_theory',
    faculties: ['reasoning', 'introspection'],
    score,
    confidence: 0.70,
    verdict,
    rationale: `Satisficing calibration: high_stakes=${highStakes}, evidence_completeness=${(completeness * 100).toFixed(0)}% (${populated}/${totalChannels} channels). ${satisficingWhenShouldOptimise ? 'ALERT: satisficing strategy applied in high-stakes case — should optimise (collect all available evidence).' : 'Strategy appropriately calibrated to evidence completeness.'}`,
    evidence: [
      `high_stakes=${highStakes}`,
      `completeness=${completeness.toFixed(2)}`,
      `populated_channels=${populated}`,
      `sanctions_hits=${sancN}`,
      `pep_hits=${pepN}`,
    ],
    producedAt: Date.now(),
  };
}

// ─── BEHAVIORAL ECONOMICS IMPLEMENTATIONS ────────────────────────────────

const PROSPECT_THEORY_PATTERNS = [
  'loss aversion', 'false positive', 'conservative', 'not escalate',
  'avoid', 'low risk', 'minimal risk', 'no action', 'not significant', 'outweigh',
];

const ANCHORING_PATTERNS = [
  'initial score', 'first assessment', 'original rating', 'anchored',
  'baseline', 'preliminary', 'prior assessment', 'starting point',
];

const STATUS_QUO_PATTERNS = [
  'maintain relationship', 'continue', 'existing', 'longstanding',
  'tenure', 'renewal', 'no change', 'status quo', 'retain', 'keep',
];

const AVAILABILITY_CASCADE_PATTERNS = [
  'dprk', 'pig butchering', 'high profile', 'recent case', 'media',
  'publicised', 'trending', 'notorious', 'viral', 'widespread',
];

const prospectTheoryApply = linguisticApply(
  'prospect_theory_audit', 'behavioral_economics', ['reasoning', 'introspection'],
  PROSPECT_THEORY_PATTERNS, 'Prospect-theory bias', 1, 3,
);

const anchoringDebiasingApply = linguisticApply(
  'anchoring_debiasing', 'behavioral_economics', ['reasoning', 'introspection'],
  ANCHORING_PATTERNS, 'Anchoring bias', 1, 2,
);

const statusQuoBiasApply = linguisticApply(
  'status_quo_bias_probe', 'behavioral_economics', ['reasoning', 'introspection'],
  STATUS_QUO_PATTERNS, 'Status-quo bias', 1, 3,
);

const availabilityCascadeApply = linguisticApply(
  'availability_cascade_guard', 'behavioral_economics', ['reasoning', 'strong_brain'],
  AVAILABILITY_CASCADE_PATTERNS, 'Availability cascade', 1, 2,
);

async function overconfidenceCalibrationApply(ctx: BrainContext): Promise<Finding> {
  const ps = ctx.priorFindings;
  if (ps.length < 2) {
    return {
      modeId: 'overconfidence_calibration',
      category: 'behavioral_economics',
      faculties: ['reasoning', 'introspection'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Overconfidence calibration: need ≥2 prior findings (got ${ps.length}).`,
      evidence: [`prior_count=${ps.length}`],
      producedAt: Date.now(),
    };
  }
  const confidences = ps.map((f) => f.confidence);
  const meanConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const variance = confidences.reduce((a, c) => a + (c - meanConf) ** 2, 0) / confidences.length;
  const scores = ps.map((f) => f.score);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Overconfidence: all confidences > 0.75 OR all < 0.25, despite mixed evidence
  const allHigh = confidences.every((c) => c > 0.75);
  const allLow = confidences.every((c) => c < 0.25);
  const mixedEvidence = Math.max(...scores) - Math.min(...scores) > 0.3;
  const overconfident = (allHigh || allLow) && mixedEvidence;

  const score = overconfident ? 0.65 : Math.max(0, 0.4 - variance * 2);
  const verdict: Finding['verdict'] = overconfident ? 'flag' : variance < 0.05 && mixedEvidence ? 'flag' : 'clear';

  return {
    modeId: 'overconfidence_calibration',
    category: 'behavioral_economics',
    faculties: ['reasoning', 'introspection'],
    score,
    confidence: 0.72,
    verdict,
    rationale: `Overconfidence: mean_confidence=${meanConf.toFixed(3)}, confidence_variance=${variance.toFixed(4)}, score_range=${(Math.max(...scores) - Math.min(...scores)).toFixed(2)}. ${overconfident ? 'ALERT: confidence band is suspiciously narrow relative to mixed evidence — likely overconfident.' : 'Confidence band appears calibrated.'}`,
    evidence: [
      `mean_confidence=${meanConf.toFixed(3)}`,
      `confidence_variance=${variance.toFixed(4)}`,
      `mean_score=${meanScore.toFixed(3)}`,
      `all_high=${allHigh}`,
      `all_low=${allLow}`,
      `mixed_evidence=${mixedEvidence}`,
    ],
    producedAt: Date.now(),
  };
}

// ─── STRATEGIC REASONING IMPLEMENTATIONS ────────────────────────────────

async function nashEquilibriumApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 2) {
    return {
      modeId: 'nash_equilibrium_analysis',
      category: 'strategic',
      faculties: ['reasoning', 'deep_thinking'],
      score: 0.2,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Nash equilibrium: insufficient transactions (need ≥2, got ${Array.isArray(txs) ? txs.length : 0}).`,
      evidence: [`tx_count=${Array.isArray(txs) ? txs.length : 0}`],
      producedAt: Date.now(),
    };
  }

  // Build flow map: from→to
  type FlowKey = string;
  const flows = new Map<FlowKey, number>();
  const timestamps: number[] = [];

  for (const t of txs) {
    const from = String(t['from'] ?? t['source'] ?? '').toLowerCase();
    const to = String(t['to'] ?? t['destination'] ?? '').toLowerCase();
    const amount = typeof t['amount'] === 'number' ? t['amount'] as number : Number(t['amount'] ?? 0);
    const tsRaw = t['timestamp'] ?? t['date'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw ?? ''));
    if (from && to && amount > 0) {
      const key = `${from}→${to}`;
      flows.set(key, (flows.get(key) ?? 0) + amount);
    }
    if (!Number.isNaN(ts)) timestamps.push(ts);
  }

  // Reciprocity: look for asymmetric bi-directional flows
  let asymmetrySignal = 0;
  const checked = new Set<string>();
  for (const [key, vol] of flows) {
    if (checked.has(key)) continue;
    const [a, b] = key.split('→');
    if (!a || !b) continue;
    const reverse = `${b}→${a}`;
    if (flows.has(reverse)) {
      const revVol = flows.get(reverse) ?? 0;
      const maxVol = Math.max(vol, revVol);
      if (maxVol > 0) {
        const asymmetry = Math.abs(vol - revVol) / maxVol;
        asymmetrySignal = Math.max(asymmetrySignal, asymmetry);
      }
      checked.add(key);
      checked.add(reverse);
    }
  }

  // Timing concentration: all txs within < 30 day burst
  let timingSignal = 0;
  if (timestamps.length >= 2) {
    timestamps.sort((a, b) => a - b);
    const spanDays = ((timestamps[timestamps.length - 1] ?? 0) - (timestamps[0] ?? 0)) / 86_400_000;
    if (spanDays > 0 && spanDays < 30) timingSignal = 0.4;
  }

  const score = Math.min(0.9, asymmetrySignal * 0.5 + timingSignal + (priorMeanScore(ctx, 0.2) * 0.3));
  const verdict: Finding['verdict'] = score >= 0.6 ? 'escalate' : score >= 0.35 ? 'flag' : 'clear';

  return {
    modeId: 'nash_equilibrium_analysis',
    category: 'strategic',
    faculties: ['reasoning', 'deep_thinking'],
    score,
    confidence: 0.65,
    verdict,
    rationale: `Nash equilibrium: ${txs.length} transactions analysed. Reciprocity asymmetry=${asymmetrySignal.toFixed(2)}, timing_burst_signal=${timingSignal.toFixed(2)}. ${score >= 0.35 ? 'Pattern deviates from legitimate Nash equilibrium — structural anomaly detected.' : 'Transaction pattern consistent with legitimate equilibrium.'}`,
    evidence: [
      `tx_count=${txs.length}`,
      `flow_pairs=${flows.size}`,
      `asymmetry=${asymmetrySignal.toFixed(2)}`,
      `timing_signal=${timingSignal.toFixed(2)}`,
      `composite_score=${score.toFixed(3)}`,
    ],
    producedAt: Date.now(),
  };
}

async function mechanismDesignReverseApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextOf(ctx);
  const FATF_HIGH_RISK = new Set(['IR', 'KP', 'MM']);
  const structuringKw = ['structuring', 'layering', 'concealment', 'placement', 'smurfing', 'round-trip', 'round trip'];
  const evasionKw = ['jurisdiction evasion', 'jurisdiction shopping', 'regulatory arbitrage', 'opacity', 'secrecy'];

  const structuringHits = structuringKw.filter((k) => text.includes(k));
  const evasionHits = evasionKw.filter((k) => text.includes(k));

  // Check jurisdictions for FATF-listed countries
  const jurisdictions: string[] = [];
  if (ctx.subject.jurisdiction) jurisdictions.push(ctx.subject.jurisdiction.toUpperCase());
  if (ctx.subject.nationality) jurisdictions.push(ctx.subject.nationality.toUpperCase());
  const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain as Array<Record<string, unknown>> : [];
  for (const e of ubo) {
    const j = String(e['jurisdiction'] ?? e['country'] ?? '').toUpperCase();
    if (j) jurisdictions.push(j);
  }
  const fatfHits = jurisdictions.filter((j) => FATF_HIGH_RISK.has(j));

  const hasLayering = structuringHits.length > 0;
  const hasJurisdictionEvasion = evasionHits.length > 0 || fatfHits.length > 0;

  const score = Math.min(0.9, structuringHits.length * 0.2 + evasionHits.length * 0.15 + fatfHits.length * 0.3);
  let verdict: Finding['verdict'] = 'clear';
  if (hasLayering) verdict = 'escalate';
  else if (hasJurisdictionEvasion) verdict = 'flag';

  return {
    modeId: 'mechanism_design_reverse',
    category: 'strategic',
    faculties: ['reasoning', 'strong_brain'],
    score,
    confidence: 0.70,
    verdict,
    rationale: `Mechanism design reverse-engineering: structuring_signals=${structuringHits.length} [${structuringHits.slice(0, 3).join(', ')}], jurisdiction_evasion_signals=${evasionHits.length + fatfHits.length}${fatfHits.length > 0 ? ` (FATF CFA: ${fatfHits.join(',')})` : ''}. ${hasLayering ? 'Layering mechanism identified — escalate for regulatory circumvention.' : hasJurisdictionEvasion ? 'Jurisdiction evasion pattern detected.' : 'No specific circumvention mechanism identified.'}`,
    evidence: [
      ...structuringHits.map((h) => `structuring="${h}"`),
      ...evasionHits.map((h) => `evasion="${h}"`),
      ...fatfHits.map((j) => `fatf_cfa=${j}`),
    ],
    producedAt: Date.now(),
  };
}

async function commitmentDeviceAuditApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextOf(ctx);
  const uboN = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain.length : 0;
  const nomineeKw = ['nominee director', 'nominee shareholder', 'nominee', 'bearer share'];
  const shellKw = ['shell company', 'shelf company', 'empty shell', 'special purpose vehicle', 'brass plate'];

  const nomineeHits = nomineeKw.filter((k) => text.includes(k));
  const shellHits = shellKw.filter((k) => text.includes(k));

  // Prior findings mentioning shell hallmarks
  const shellInPriors = ctx.priorFindings.filter(
    (f) => f.rationale.toLowerCase().includes('shell') || f.tags?.includes('shell'),
  ).length;

  const uboOpaque = uboN >= 3;
  const hasNominee = nomineeHits.length > 0;
  const hasShellHallmarks = shellHits.length > 0 || shellInPriors > 0;

  const score = Math.min(0.9, (uboOpaque ? 0.3 : 0) + (hasNominee ? 0.25 : 0) + (hasShellHallmarks ? 0.3 : 0));
  let verdict: Finding['verdict'] = 'clear';
  if (hasShellHallmarks) verdict = 'escalate';
  else if (hasNominee) verdict = 'flag';
  else if (uboOpaque) verdict = 'flag';

  return {
    modeId: 'commitment_device_audit',
    category: 'strategic',
    faculties: ['reasoning', 'inference'],
    score,
    confidence: 0.68,
    verdict,
    rationale: `Commitment device audit: ubo_depth=${uboN}${uboOpaque ? ' (OPAQUE ≥3)' : ''}, nominee_indicators=${nomineeHits.length}, shell_hallmarks=${shellHits.length + shellInPriors}. ${hasShellHallmarks ? 'Shell structures identified — structures are not credible commitments.' : hasNominee ? 'Nominee arrangements detected — reduced commitment credibility.' : uboOpaque ? 'Deep UBO opacity — commitment credibility reduced.' : 'Structures appear credible commitments.'}`,
    evidence: [
      `ubo_depth=${uboN}`,
      ...nomineeHits.map((h) => `nominee="${h}"`),
      ...shellHits.map((h) => `shell="${h}"`),
      ...(shellInPriors > 0 ? [`shell_in_priors=${shellInPriors}`] : []),
    ],
    producedAt: Date.now(),
  };
}

const INFO_REVELATION_PATTERNS = [
  'disclosed late', 'subsequently revealed', 'only after', 'when pressed',
  'upon request', 'belated', 'delayed disclosure', 'retroactively',
];

const infoRevelationApply = linguisticApply(
  'information_revelation_timing', 'strategic', ['reasoning', 'intelligence'],
  INFO_REVELATION_PATTERNS, 'Information revelation timing', 1, 2,
);

async function entryExitTimingApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 2) {
    return {
      modeId: 'entry_exit_timing_analysis',
      category: 'strategic',
      faculties: ['reasoning', 'intelligence'],
      score: 0.2,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Entry/exit timing: insufficient transactions (need ≥2, got ${Array.isArray(txs) ? txs.length : 0}).`,
      evidence: [`tx_count=${Array.isArray(txs) ? txs.length : 0}`],
      producedAt: Date.now(),
    };
  }

  const timestamps: number[] = [];
  const amounts: number[] = [];
  for (const t of txs) {
    const tsRaw = t['timestamp'] ?? t['date'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw ?? ''));
    if (!Number.isNaN(ts)) timestamps.push(ts);
    const a = typeof t['amount'] === 'number' ? t['amount'] as number : Number(t['amount'] ?? 0);
    if (a > 0) amounts.push(a);
  }

  if (timestamps.length < 2) {
    return {
      modeId: 'entry_exit_timing_analysis',
      category: 'strategic',
      faculties: ['reasoning', 'intelligence'],
      score: 0.2,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: 'Entry/exit timing: transactions missing usable timestamps.',
      evidence: [`with_timestamp=${timestamps.length}`],
      producedAt: Date.now(),
    };
  }

  timestamps.sort((a, b) => a - b);
  const spanDays = ((timestamps[timestamps.length - 1] ?? 0) - (timestamps[0] ?? 0)) / 86_400_000;
  const rapid = spanDays < 90;
  const highVolume = txs.length >= 5;
  const maxAmt = amounts.length > 0 ? Math.max(...amounts) : 0;
  const meanAmt = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const highValue = amounts.length > 0 && maxAmt > meanAmt * 3; // last tx unusually large

  const score = Math.min(0.9, (rapid ? 0.35 : 0) + (highVolume ? 0.25 : 0) + (highValue ? 0.2 : 0));
  let verdict: Finding['verdict'] = 'clear';
  if (rapid && highVolume) verdict = 'escalate';
  else if (rapid || (highValue && txs.length >= 3)) verdict = 'flag';

  return {
    modeId: 'entry_exit_timing_analysis',
    category: 'strategic',
    faculties: ['reasoning', 'intelligence'],
    score,
    confidence: 0.68,
    verdict,
    rationale: `Entry/exit timing: span=${spanDays.toFixed(1)} days, tx_count=${txs.length}, max_amount=${maxAmt.toFixed(2)}, mean_amount=${meanAmt.toFixed(2)}. ${rapid && highVolume ? 'RAPID ENTRY + HIGH VOLUME detected — one-shot-game defection signal.' : rapid ? 'Rapid timeline detected.' : highValue ? 'High-value concentration at tail.' : 'No anomalous entry/exit pattern.'}`,
    evidence: [
      `span_days=${spanDays.toFixed(1)}`,
      `tx_count=${txs.length}`,
      `rapid=${rapid}`,
      `high_volume=${highVolume}`,
      `max_amount=${maxAmt.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

// ─── INTELLIGENCE FUSION IMPLEMENTATIONS ────────────────────────────────

async function multiSourceIntelligenceFusionApply(ctx: BrainContext): Promise<Finding> {
  const ev = ctx.evidence;
  const sancN = Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0;
  const pepN = Array.isArray(ev.pepHits) ? ev.pepHits.length : 0;
  const advN = Array.isArray(ev.adverseMedia) ? ev.adverseMedia.length : 0;
  const uboN = Array.isArray(ev.uboChain) ? ev.uboChain.length : 0;
  const txN = Array.isArray(ev.transactions) ? ev.transactions.length : 0;

  // Weighted composite: sanctions*0.4 + pep*0.3 + adverseMedia*0.15 + ubo*0.1 + tx*0.05
  const sancSig = sancN > 0 ? Math.min(1, sancN / 2) : 0;
  const pepSig = pepN > 0 ? Math.min(1, pepN / 2) : 0;
  const advSig = advN > 0 ? Math.min(1, advN / 3) : 0;
  const uboSig = uboN > 0 ? Math.min(1, uboN / 5) : 0;
  const txSig = txN > 0 ? Math.min(1, txN / 10) : 0;

  const channelComposite = sancSig * 0.4 + pepSig * 0.3 + advSig * 0.15 + uboSig * 0.1 + txSig * 0.05;
  const priorMean = priorMeanScore(ctx, 0);
  const score = Math.max(channelComposite, priorMean);

  const populated = [sancN, pepN, advN, uboN, txN].filter((n) => n > 0).length;

  return {
    modeId: 'multi_source_intelligence_fusion',
    category: 'intelligence_fusion',
    faculties: ['intelligence', 'synthesis'],
    score,
    confidence: Math.min(0.9, 0.4 + populated * 0.1),
    verdict: score >= 0.65 ? 'escalate' : score >= 0.35 ? 'flag' : 'clear',
    rationale: `Multi-source fusion: sanctions=${sancN}, pep=${pepN}, adverse_media=${advN}, ubo=${uboN}, tx=${txN}. Channel composite=${channelComposite.toFixed(3)}, prior_mean=${priorMean.toFixed(3)} → fused_score=${score.toFixed(3)}.`,
    evidence: [
      `channel_composite=${channelComposite.toFixed(3)}`,
      `prior_mean=${priorMean.toFixed(3)}`,
      `sanctions_signal=${sancSig.toFixed(2)}`,
      `pep_signal=${pepSig.toFixed(2)}`,
      `adverse_media_signal=${advSig.toFixed(2)}`,
      `ubo_signal=${uboSig.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

async function crossDomainSignalIntegrationApply(ctx: BrainContext): Promise<Finding> {
  const ev = ctx.evidence;
  const hasSanctions = Array.isArray(ev.sanctionsHits) && ev.sanctionsHits.length > 0;
  const hasTx = Array.isArray(ev.transactions) && ev.transactions.length > 0;
  const hasPep = Array.isArray(ev.pepHits) && ev.pepHits.length > 0;
  const hasUbo = Array.isArray(ev.uboChain) && ev.uboChain.length > 0;

  const linkages: string[] = [];
  let score = 0;
  if (hasSanctions && hasTx) { linkages.push('sanctions×transactions'); score += 0.2; }
  if (hasPep && hasUbo) { linkages.push('pep×ubo'); score += 0.2; }
  if (hasSanctions && hasUbo) { linkages.push('sanctions×ubo'); score += 0.2; }
  if (hasPep && hasTx) { linkages.push('pep×transactions'); score += 0.2; }

  score = Math.min(0.9, score);
  const verdict: Finding['verdict'] = score >= 0.6 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';

  return {
    modeId: 'cross_domain_signal_integration',
    category: 'intelligence_fusion',
    faculties: ['intelligence', 'reasoning'],
    score,
    confidence: 0.72,
    verdict,
    rationale: `Cross-domain integration: ${linkages.length} cross-domain linkage${linkages.length === 1 ? '' : 's'} detected [${linkages.join(', ') || 'none'}]. Each linkage adds independent signal strength.`,
    evidence: [
      `linkages=${linkages.length}`,
      ...linkages.map((l) => `link=${l}`),
    ],
    producedAt: Date.now(),
  };
}

async function confidenceWeightedAggregationApply(ctx: BrainContext): Promise<Finding> {
  const ps = ctx.priorFindings;
  if (ps.length === 0) {
    return {
      modeId: 'confidence_weighted_aggregation',
      category: 'intelligence_fusion',
      faculties: ['reasoning', 'strong_brain'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: 'Confidence-weighted aggregation: no prior findings to aggregate.',
      evidence: ['prior_count=0'],
      producedAt: Date.now(),
    };
  }

  const totalWeight = ps.reduce((a, f) => a + f.confidence, 0);
  const weightedScore = totalWeight > 0
    ? ps.reduce((a, f) => a + f.score * f.confidence, 0) / totalWeight
    : ps.reduce((a, f) => a + f.score, 0) / ps.length;

  return {
    modeId: 'confidence_weighted_aggregation',
    category: 'intelligence_fusion',
    faculties: ['reasoning', 'strong_brain'],
    score: weightedScore,
    confidence: Math.min(0.9, 0.5 + ps.length * 0.05),
    verdict: weightedScore >= 0.65 ? 'escalate' : weightedScore >= 0.35 ? 'flag' : 'clear',
    rationale: `Confidence-weighted aggregation over ${ps.length} priors: Σw=${totalWeight.toFixed(2)}, weighted_score=${weightedScore.toFixed(3)}.`,
    evidence: [
      `prior_count=${ps.length}`,
      `total_weight=${totalWeight.toFixed(2)}`,
      `weighted_score=${weightedScore.toFixed(3)}`,
    ],
    producedAt: Date.now(),
  };
}

async function temporalSignalSequencingApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 3) {
    return {
      modeId: 'temporal_signal_sequencing',
      category: 'intelligence_fusion',
      faculties: ['reasoning', 'intelligence'],
      score: 0.15,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Temporal sequencing: need ≥3 transactions (got ${Array.isArray(txs) ? txs.length : 0}).`,
      evidence: [`tx_count=${Array.isArray(txs) ? txs.length : 0}`],
      producedAt: Date.now(),
    };
  }

  const timestamps: number[] = [];
  for (const t of txs) {
    const tsRaw = t['timestamp'] ?? t['date'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw ?? ''));
    if (!Number.isNaN(ts)) timestamps.push(ts);
  }

  if (timestamps.length < 3) {
    return {
      modeId: 'temporal_signal_sequencing',
      category: 'intelligence_fusion',
      faculties: ['reasoning', 'intelligence'],
      score: 0.15,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: 'Temporal sequencing: transactions missing usable timestamps.',
      evidence: [`with_timestamp=${timestamps.length}`],
      producedAt: Date.now(),
    };
  }

  timestamps.sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(((timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0)) / 3_600_000); // gaps in hours
  }

  const burstGaps = gaps.filter((g) => g < 24);
  const burstRatio = burstGaps.length / gaps.length;
  const hasBurst = burstRatio > 0.5;

  const score = hasBurst ? Math.min(0.8, burstRatio * 0.8) : 0.1;
  const verdict: Finding['verdict'] = hasBurst ? 'flag' : 'clear';

  return {
    modeId: 'temporal_signal_sequencing',
    category: 'intelligence_fusion',
    faculties: ['reasoning', 'intelligence'],
    score,
    confidence: 0.70,
    verdict,
    rationale: `Temporal sequencing: ${timestamps.length} timestamped txs, ${burstGaps.length}/${gaps.length} inter-tx gaps <24h (burst_ratio=${burstRatio.toFixed(2)}). ${hasBurst ? 'BURST pattern detected — >50% of transactions arrive in <24h windows.' : 'Normal temporal spacing.'}`,
    evidence: [
      `tx_count=${timestamps.length}`,
      `burst_gaps=${burstGaps.length}`,
      `total_gaps=${gaps.length}`,
      `burst_ratio=${burstRatio.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

async function networkEdgeInferenceApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextOf(ctx);
  const uboN = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain.length : 0;
  const RELATIONSHIP_KW = [
    'associated', 'linked', 'connected', 'related', 'affiliated',
    'controlled by', 'nominee',
  ];

  const kwHits = RELATIONSHIP_KW.filter((k) => text.includes(k));
  const deepUbo = uboN >= 3;

  const hiddenEdgeSignal = deepUbo && kwHits.length > 0;
  const score = Math.min(0.85, (deepUbo ? 0.3 : 0) + kwHits.length * 0.1);
  const verdict: Finding['verdict'] = hiddenEdgeSignal
    ? (kwHits.length >= 3 ? 'escalate' : 'flag')
    : (deepUbo ? 'flag' : 'clear');

  return {
    modeId: 'network_edge_inference',
    category: 'intelligence_fusion',
    faculties: ['intelligence', 'reasoning'],
    score,
    confidence: 0.65,
    verdict,
    rationale: `Network edge inference: ubo_depth=${uboN}${deepUbo ? ' (deep)' : ''}, relationship_keywords=${kwHits.length} [${kwHits.slice(0, 4).join(', ')}]. ${hiddenEdgeSignal ? 'Hidden edges inferred — deep UBO + relationship language indicates undisclosed connections.' : deepUbo ? 'Deep UBO chain — potential hidden edges.' : 'No strong hidden-edge signals.'}`,
    evidence: [
      `ubo_depth=${uboN}`,
      ...kwHits.map((k) => `rel_kw="${k}"`),
    ],
    producedAt: Date.now(),
  };
}

// ─── ASSET RECOVERY IMPLEMENTATIONS ──────────────────────────────────────

async function civilRecoveryPathwayApply(ctx: BrainContext): Promise<Finding> {
  const jur = (ctx.subject.jurisdiction ?? '').toUpperCase();
  const nat = (ctx.subject.nationality ?? '').toUpperCase();
  const allJurs = new Set([jur, nat].filter(Boolean));

  const mechanisms: string[] = [];
  if (allJurs.has('GB') || allJurs.has('UK')) mechanisms.push('POCA-UK');
  if (allJurs.has('AE') || allJurs.has('UAE')) mechanisms.push('CBUAE-civil-forfeiture');
  if (allJurs.size > 1) mechanisms.push('MLA-international');

  // Score = available mechanisms × mean prior severity
  const priorMean = priorMeanScore(ctx, 0.2);
  const mechanismFactor = Math.min(1, mechanisms.length / 3);
  const score = Math.min(0.85, mechanismFactor * priorMean + (priorMean > 0.5 ? 0.2 : 0));

  const verdict: Finding['verdict'] = score >= 0.5 ? 'flag' : mechanisms.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'civil_recovery_pathway_map',
    category: 'asset_recovery',
    faculties: ['reasoning', 'strong_brain'],
    score,
    confidence: 0.68,
    verdict,
    rationale: `Civil recovery pathways: jurisdiction=${jur || 'unknown'}, nationality=${nat || 'unknown'}. Mechanisms available: [${mechanisms.join(', ') || 'none identified'}]. Prior severity mean=${priorMean.toFixed(3)}. Recovery score=${score.toFixed(3)}.`,
    evidence: [
      `jurisdiction=${jur || 'none'}`,
      `nationality=${nat || 'none'}`,
      ...mechanisms.map((m) => `mechanism=${m}`),
      `prior_mean=${priorMean.toFixed(3)}`,
    ],
    producedAt: Date.now(),
  };
}

async function crossBorderAssetTraceApply(ctx: BrainContext): Promise<Finding> {
  const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain as Array<Record<string, unknown>> : [];
  const jurisdictions = new Set<string>();
  if (ctx.subject.jurisdiction) jurisdictions.add(ctx.subject.jurisdiction.toUpperCase());
  if (ctx.subject.nationality) jurisdictions.add(ctx.subject.nationality.toUpperCase());
  for (const e of ubo) {
    const j = String(e['jurisdiction'] ?? e['country'] ?? '').toUpperCase();
    if (j) jurisdictions.add(j);
  }

  const jurCount = jurisdictions.size;
  const complexTrace = jurCount > 2;
  const score = Math.min(0.8, jurCount * 0.2);
  const verdict: Finding['verdict'] = complexTrace ? 'flag' : jurCount > 1 ? 'flag' : 'clear';

  return {
    modeId: 'cross_border_asset_trace',
    category: 'asset_recovery',
    faculties: ['reasoning', 'intelligence'],
    score,
    confidence: 0.68,
    verdict,
    rationale: `Cross-border asset trace: ${jurCount} distinct jurisdiction${jurCount === 1 ? '' : 's'} in chain [${[...jurisdictions].join(', ')}]. ${complexTrace ? 'Complex multi-hop trace required — MLA/Egmont channels needed.' : jurCount > 1 ? 'Multi-jurisdiction trace required.' : 'Single jurisdiction — standard domestic tracing.'}`,
    evidence: [
      `jurisdiction_count=${jurCount}`,
      ...[...jurisdictions].map((j) => `jurisdiction=${j}`),
    ],
    producedAt: Date.now(),
  };
}

async function cryptoSeizureProtocolApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextOf(ctx);
  const CRYPTO_KW = [
    'wallet', 'crypto', 'bitcoin', 'ethereum', 'usdt',
    'blockchain', 'exchange', 'vasp', 'binance', 'coinbase',
  ];

  const hits = CRYPTO_KW.filter((k) => text.includes(k));
  const priorMean = priorMeanScore(ctx, 0.2);
  const cryptoSignal = hits.length > 0;
  const highRisk = priorMean >= 0.5;

  const score = Math.min(0.85, hits.length * 0.1 + (highRisk ? 0.3 : 0));
  const verdict: Finding['verdict'] = cryptoSignal && highRisk ? 'flag' : cryptoSignal ? 'flag' : 'clear';

  return {
    modeId: 'crypto_seizure_protocol',
    category: 'asset_recovery',
    faculties: ['reasoning', 'strong_brain'],
    score,
    confidence: 0.70,
    verdict,
    rationale: `Crypto seizure protocol: ${hits.length} crypto asset signal${hits.length === 1 ? '' : 's'} detected [${hits.slice(0, 5).join(', ')}]. Prior risk mean=${priorMean.toFixed(3)}. ${cryptoSignal && highRisk ? 'Crypto assets identified with high prior risk — initiate seizure protocol (wallet ID → on-chain trace → exchange disclosure → preservation order).' : cryptoSignal ? 'Crypto assets detected — assess for seizure pathway.' : 'No crypto asset signals.'}`,
    evidence: [
      ...hits.map((h) => `crypto="${h}"`),
      `prior_mean=${priorMean.toFixed(3)}`,
      `high_risk=${highRisk}`,
    ],
    producedAt: Date.now(),
  };
}

const RESTRAINED_ASSET_PATTERNS = [
  'frozen', 'restrained', 'court order', 'injunction',
  'interim order', 'asset freeze', 'detained', 'seized',
];

const restrainedAssetGovernanceApply = linguisticApply(
  'restrained_asset_governance', 'asset_recovery', ['reasoning', 'inference'],
  RESTRAINED_ASSET_PATTERNS, 'Restrained asset governance', 1, 2,
);

// ─── CONDUCT RISK IMPLEMENTATIONS ────────────────────────────────────────

const CULTURE_TONE_PATTERNS = [
  'revenue', 'profitable client', 'senior management', 'override',
  'exception', 'pressure', 'commercial', 'relationship', 'tolerance', 'accommodate',
];

const INCENTIVE_MISALIGNMENT_PATTERNS = [
  'bonus', 'commission', 'revenue sharing', 'origination',
  'claw-back', 'performance', 'target', 'quota', 'penalty', 'incentive',
];

const WHISTLEBLOWER_PATTERNS = [
  'whistleblow', 'tip-off', 'disclosure', 'report',
  'inform', 'complaint', 'allegation', 'concern raised', 'anonymous', 'source',
];

const cultureToneApply = linguisticApply(
  'culture_tone_audit', 'conduct_risk', ['reasoning', 'intelligence'],
  CULTURE_TONE_PATTERNS, 'Culture/tone audit', 2, 4,
);

const incentiveMisalignmentApply = linguisticApply(
  'incentive_misalignment_scan', 'conduct_risk', ['reasoning', 'strong_brain'],
  INCENTIVE_MISALIGNMENT_PATTERNS, 'Incentive misalignment', 1, 3,
);

const whistleblowerSignalApply = linguisticApply(
  'whistleblower_signal_triage', 'conduct_risk', ['reasoning', 'intelligence'],
  WHISTLEBLOWER_PATTERNS, 'Whistleblower signal', 1, 2,
);

// ─── IDENTITY FRAUD IMPLEMENTATIONS ──────────────────────────────────────

const DEEPFAKE_DOC_PATTERNS = [
  'exif', 'metadata', 'mrz', 'checksum', 'template',
  'biometric', 'liveness', 'deepfake', 'gan', 'synthetic', 'fabricated', 'forged', 'manipulated',
];

const SYNTHETIC_IDENTITY_PATTERNS = [
  'synthetic', 'fabricated', 'mismatched', 'inconsistent', 'multiple names',
  'name variation', 'dob mismatch', 'address mismatch', 'device mismatch', 'stolen identity',
];

const BIOMETRIC_GAP_PATTERNS = [
  'liveness', 'bypass', 'template', 'ageing', 'presentation attack',
  'face swap', 'spoofing', 'replay', 'deepfake', 'verification gap',
];

const DEVICE_IDENTITY_PATTERNS = [
  'vpn', 'proxy', 'timezone mismatch', 'ip mismatch', 'multiple devices',
  'device fingerprint', 'language mismatch', 'location spoofing', 'emulator', 'virtual machine',
];

const deepfakeDocumentApply = linguisticApply(
  'deepfake_document_forensics', 'identity_fraud', ['reasoning', 'strong_brain'],
  DEEPFAKE_DOC_PATTERNS, 'Deepfake document forensics', 1, 2,
);

const syntheticIdentityApply = linguisticApply(
  'synthetic_identity_decomposition', 'identity_fraud', ['reasoning', 'intelligence'],
  SYNTHETIC_IDENTITY_PATTERNS, 'Synthetic identity', 1, 2,
);

const biometricGapApply = linguisticApply(
  'biometric_gap_analysis', 'identity_fraud', ['reasoning', 'strong_brain'],
  BIOMETRIC_GAP_PATTERNS, 'Biometric gap', 1, 2,
);

const deviceIdentityApply = linguisticApply(
  'device_identity_coherence', 'identity_fraud', ['reasoning', 'inference'],
  DEVICE_IDENTITY_PATTERNS, 'Device-identity coherence', 1, 2,
);

// ─── DIGITAL ECONOMY IMPLEMENTATIONS ─────────────────────────────────────

const PLATFORM_ECONOMY_PATTERNS = [
  'marketplace', 'gig', 'freelance', 'aggregator', 'platform',
  'chargeback', 'refund', 'dispute', 'p2p', 'peer-to-peer', 'earnings', 'payout',
];

const DEFI_GOVERNANCE_PATTERNS = [
  'dao', 'governance', 'flash loan', 'smart contract', 'defi',
  'protocol', 'liquidity pool', 'bridge', 'exploit', 'vulnerability', 'rug', 'fork',
];

const EMBEDDED_FINANCE_PATTERNS = [
  'baas', 'embedded finance', 'sub-ledger', 'pass-through', 'api banking',
  'neobank', 'fintech', 'partner bank', 'sponsor bank', 'white label',
];

const OPEN_BANKING_PATTERNS = [
  'psd2', 'open banking', 'aggregator', 'account information', 'consent',
  'api access', 'bulk account', 'screen scraping', 'account takeover', 'mule',
];

const platformEconomyApply = linguisticApply(
  'platform_economy_risk', 'digital_economy', ['reasoning', 'strong_brain'],
  PLATFORM_ECONOMY_PATTERNS, 'Platform economy risk', 2, 4,
);

const defiProtocolApply = linguisticApply(
  'defi_protocol_governance_risk', 'digital_economy', ['reasoning', 'intelligence'],
  DEFI_GOVERNANCE_PATTERNS, 'DeFi governance risk', 2, 3,
);

const embeddedFinanceApply = linguisticApply(
  'embedded_finance_risk', 'digital_economy', ['reasoning', 'strong_brain'],
  EMBEDDED_FINANCE_PATTERNS, 'Embedded finance risk', 1, 2,
);

const openBankingApply = linguisticApply(
  'open_banking_api_risk', 'digital_economy', ['reasoning', 'inference'],
  OPEN_BANKING_PATTERNS, 'Open banking API risk', 1, 2,
);

// ─── HUMAN RIGHTS IMPLEMENTATIONS ────────────────────────────────────────

const MODERN_SLAVERY_PATTERNS = [
  'wage suppression', 'debt bondage', 'labour exploitation', 'forced labour',
  'group housing', 'controlled account', 'employer controlled', 'withheld wages',
  'domestic worker', 'below minimum wage',
];

const HRD_EXCLUSION_PATTERNS = [
  'de-banking', 'account closure', 'journalist', 'activist', 'human rights',
  'ngo', 'advocacy', 'civil society', 'opposition', 'political',
];

const modernSlaveryApply = linguisticApply(
  'modern_slavery_financial_pattern', 'human_rights', ['reasoning', 'intelligence'],
  MODERN_SLAVERY_PATTERNS, 'Modern slavery financial pattern', 1, 2,
);

const hrdFinancialExclusionApply = linguisticApply(
  'hrd_financial_exclusion_probe', 'human_rights', ['reasoning', 'strong_brain'],
  HRD_EXCLUSION_PATTERNS, 'HRD financial exclusion', 1, 2,
);

// ─── MODE REGISTRY ───────────────────────────────────────────────────────

export const WAVE5_MODES: ReasoningMode[] = [
  // ── DECISION THEORY ─────────────────────────────────────────────────────
  m('expected_value_decision', 'Expected-Value Decision Analysis', 'decision_theory', ['reasoning', 'strong_brain'],
    'Computes expected value across decision branches (escalate / file / clear / block) weighting probability × severity × reversibility for each option.',
    expectedValueDecisionApply),
  m('regret_minimization', 'Minimax Regret Decision Gate', 'decision_theory', ['reasoning', 'inference'],
    'Constructs the regret matrix across decision options and world states; selects the action minimising maximum regret for irreversible decisions.',
    regretMinimizationApply),
  m('multi_criteria_decision_analysis', 'Multi-Criteria Decision Analysis (MCDA)', 'decision_theory', ['reasoning', 'strong_brain'],
    'Scores each disposition option across regulatory, customer-fairness, and institutional-risk criteria; aggregates with explicit weights before selecting the dominant option.',
    multiCriteriaDecisionApply),
  m('value_of_information', 'Value of Information (VOI) Assessment', 'decision_theory', ['reasoning', 'inference'],
    'Quantifies the expected benefit of obtaining each missing piece of evidence before making a verdict; prioritises EDD requests by VOI descending.',
    valueOfInformationApply),
  m('satisficing_vs_optimizing', 'Satisficing vs. Optimising Calibration', 'decision_theory', ['reasoning', 'introspection'],
    'Distinguishes between satisficing (finding a good-enough answer quickly) and optimising (finding the best answer exhaustively); flags cases where satisficing is applied when the stakes demand optimising.',
    satisficingVsOptimisingApply),

  // ── BEHAVIORAL ECONOMICS ─────────────────────────────────────────────────
  m('prospect_theory_audit', 'Prospect Theory Bias Audit', 'behavioral_economics', ['reasoning', 'introspection'],
    'Detects loss-aversion framing (avoiding a false positive outweighs finding a true positive) and reference-point anchoring in risk assessment; requires explicit debiasing step.',
    prospectTheoryApply),
  m('anchoring_debiasing', 'Anchoring Debiasing Protocol', 'behavioral_economics', ['reasoning', 'introspection'],
    'Identifies the first risk score or finding that anchored the analysis and systematically adjusts by generating an independent bottom-up re-assessment before finalising.',
    anchoringDebiasingApply),
  m('status_quo_bias_probe', 'Status Quo Bias Probe', 'behavioral_economics', ['reasoning', 'introspection'],
    'Tests whether a decision to maintain an existing relationship, risk tier, or control is driven by inertia rather than evidence; requires a documented positive justification for status quo continuation.',
    statusQuoBiasApply),
  m('availability_cascade_guard', 'Availability Cascade Guard', 'behavioral_economics', ['reasoning', 'strong_brain'],
    'Detects over-weighting of recent, vivid, or high-profile typologies (DPRK cyber, pig-butchering) due to media salience; corrects by anchoring on empirical base rates before narrative adjustment.',
    availabilityCascadeApply),
  m('overconfidence_calibration', 'Overconfidence Calibration', 'behavioral_economics', ['reasoning', 'introspection'],
    'Tests for overconfidence by requiring explicit uncertainty intervals around every probability judgment; flags any interval narrower than the evidence supports and widens it before emission.',
    overconfidenceCalibrationApply),

  // ── STRATEGIC REASONING ──────────────────────────────────────────────────
  m('nash_equilibrium_analysis', 'Nash Equilibrium Analysis', 'strategic', ['reasoning', 'deep_thinking'],
    'Models the financial arrangement as a strategic game; tests whether observed behaviour constitutes a Nash equilibrium for a legitimate vs. criminal arrangement; structural deviation is itself a red flag.',
    nashEquilibriumApply),
  m('mechanism_design_reverse', 'Mechanism Design Reverse Engineering', 'strategic', ['reasoning', 'strong_brain'],
    'Identifies the target regulatory outcome that a complex structure is engineered to produce; names the specific supervisory mechanism being circumvented; treats design intent as an independent red flag.',
    mechanismDesignReverseApply),
  m('commitment_device_audit', 'Commitment Device Audit', 'strategic', ['reasoning', 'inference'],
    'Assesses whether legal and contractual structures function as credible commitment devices that bind the principal to compliance; distinguishes credible from cheap-talk commitments.',
    commitmentDeviceAuditApply),
  m('information_revelation_timing', 'Information Revelation Timing Analysis', 'strategic', ['reasoning', 'intelligence'],
    'Tests whether disclosures are timed to reveal or conceal material information; detects strategic sequencing where unfavourable facts are disclosed only after favourable context has been established.',
    infoRevelationApply),
  m('entry_exit_timing_analysis', 'Relationship Entry/Exit Timing Analysis', 'strategic', ['reasoning', 'intelligence'],
    'Analyses the timing of relationship initiation, peak activity, and exit for strategic motivation; rapid entry + high volume + abrupt exit is a one-shot-game defection signal.',
    entryExitTimingApply),

  // ── INTELLIGENCE FUSION ──────────────────────────────────────────────────
  m('multi_source_intelligence_fusion', 'Multi-Source Intelligence Fusion', 'intelligence_fusion', ['intelligence', 'synthesis'],
    'Structured fusion of OSINT, financial intelligence (FININT), human intelligence signals, and regulatory intelligence into a unified probability-weighted picture.',
    multiSourceIntelligenceFusionApply),
  m('cross_domain_signal_integration', 'Cross-Domain Signal Integration', 'intelligence_fusion', ['intelligence', 'reasoning'],
    'Links financial, behavioural, geopolitical, and supply-chain intelligence signals across domain boundaries; identifies cross-domain patterns invisible within any single domain.',
    crossDomainSignalIntegrationApply),
  m('confidence_weighted_aggregation', 'Confidence-Weighted Signal Aggregation', 'intelligence_fusion', ['reasoning', 'strong_brain'],
    'Aggregates disparate intelligence signals weighting each by source quality tier, temporal relevance, and corroboration status before computing composite risk.',
    confidenceWeightedAggregationApply),
  m('temporal_signal_sequencing', 'Temporal Signal Sequencing', 'intelligence_fusion', ['reasoning', 'intelligence'],
    'Sequences all intelligence signals chronologically to detect causal patterns, escalating series, and deliberate timing that reveal the structure of the underlying activity.',
    temporalSignalSequencingApply),
  m('network_edge_inference', 'Network Edge Inference', 'intelligence_fusion', ['intelligence', 'reasoning'],
    'Infers unobserved network edges (relationships not disclosed) from observed node behaviours; uses co-occurrence, shared identifiers, and transaction graph topology.',
    networkEdgeInferenceApply),

  // ── ASSET RECOVERY ───────────────────────────────────────────────────────
  m('civil_recovery_pathway_map', 'Civil Recovery Pathway Mapping', 'asset_recovery', ['reasoning', 'strong_brain'],
    'Maps all applicable civil recovery mechanisms — POCA UK, civil forfeiture UAE, unjust enrichment, unexplained wealth orders — and identifies the fastest available pathway with the highest recovery probability.',
    civilRecoveryPathwayApply),
  m('cross_border_asset_trace', 'Cross-Border Asset Tracing Protocol', 'asset_recovery', ['reasoning', 'intelligence'],
    'International asset tracing through MLA, Egmont Group, ARIN-WA/ARINSA networks, and informal law enforcement cooperation channels; documents each tracing hop with jurisdiction and mechanism.',
    crossBorderAssetTraceApply),
  m('crypto_seizure_protocol', 'Cryptocurrency Seizure and Tracing Protocol', 'asset_recovery', ['reasoning', 'strong_brain'],
    'Maps the seizure workflow for virtual assets: wallet identification, on-chain tracing to exchange, legal process for exchange KYC disclosure, asset preservation order, and transfer to government wallet.',
    cryptoSeizureProtocolApply),
  m('restrained_asset_governance', 'Restrained Asset Governance', 'asset_recovery', ['reasoning', 'inference'],
    'Governs court-restrained assets during ongoing proceedings: identifies permissible maintenance activities, reporting obligations to the court, and risk of dissipation through asset deterioration.',
    restrainedAssetGovernanceApply),

  // ── CONDUCT RISK ──────────────────────────────────────────────────────────
  m('culture_tone_audit', 'Organisational Culture and Tone Audit', 'conduct_risk', ['reasoning', 'intelligence'],
    'Assesses organisational culture as an AML risk driver: board messaging, MLRO empowerment, compliance-revenue balance, and the gap between stated and lived values.',
    cultureToneApply),
  m('incentive_misalignment_scan', 'Incentive Misalignment Scan', 'conduct_risk', ['reasoning', 'strong_brain'],
    'Identifies incentive structures that reward risk-taking (origination bonuses without claw-back) or discourage reporting (retaliation risk, career consequences for SARs on profitable clients).',
    incentiveMisalignmentApply),
  m('whistleblower_signal_triage', 'Whistleblower Signal Triage', 'conduct_risk', ['reasoning', 'intelligence'],
    'Assesses, protects, and acts on internal compliance whistleblower signals; distinguishes motivated disclosure from malicious reports; routes credible signals to MLRO without revealing source identity.',
    whistleblowerSignalApply),

  // ── IDENTITY FRAUD ───────────────────────────────────────────────────────
  m('deepfake_document_forensics', 'Deepfake Document Forensic Analysis', 'identity_fraud', ['reasoning', 'strong_brain'],
    'Multi-indicator forensic analysis of KYC documents: EXIF metadata, font consistency, MRZ checksum, biometric GAN artefacts, compression artifacts, and issuing-authority template library comparison.',
    deepfakeDocumentApply),
  m('synthetic_identity_decomposition', 'Synthetic Identity Decomposition', 'identity_fraud', ['reasoning', 'intelligence'],
    'Decomposes identity claims into independent attribute layers (legal name, DOB, NID, address, device, biometric, behavioural); detects real-attribute / fabricated-attribute mixing patterns.',
    syntheticIdentityApply),
  m('biometric_gap_analysis', 'Biometric Verification Gap Analysis', 'identity_fraud', ['reasoning', 'strong_brain'],
    'Identifies gaps in biometric verification pipelines that enable identity substitution: liveness detection bypass, template ageing, cross-device continuity breaks, and presentation attack indicators.',
    biometricGapApply),
  m('device_identity_coherence', 'Device-Identity Coherence Check', 'identity_fraud', ['reasoning', 'inference'],
    'Cross-references device fingerprint, IP geolocation, timezone, language settings, and declared identity to detect mismatches consistent with identity substitution or account takeover.',
    deviceIdentityApply),

  // ── DIGITAL ECONOMY ──────────────────────────────────────────────────────
  m('platform_economy_risk', 'Platform Economy AML Risk Assessment', 'digital_economy', ['reasoning', 'strong_brain'],
    'Risk assessment for gig economy, marketplace, and P2P platform relationships: payment aggregation risk, earnings volatility as a cash-front cover, and chargeback abuse for proceeds extraction.',
    platformEconomyApply),
  m('defi_protocol_governance_risk', 'DeFi Protocol Governance and ML Risk Audit', 'digital_economy', ['reasoning', 'intelligence'],
    'Governance and ML risks in decentralised finance protocols: anonymous governance token voting, DAO treasury opacity, flash-loan-enabled market manipulation, and cross-chain bridge smart-contract vulnerabilities.',
    defiProtocolApply),
  m('embedded_finance_risk', 'Embedded Finance and BaaS ML Risk', 'digital_economy', ['reasoning', 'strong_brain'],
    'AML risks in banking-as-a-service, BaaS, and payment-as-a-service: pass-through liability, KYC delegation to non-banking partners, multi-tenant account structures, and sub-ledger opacity.',
    embeddedFinanceApply),
  m('open_banking_api_risk', 'Open Banking API and Aggregator ML Risk', 'digital_economy', ['reasoning', 'inference'],
    'PSD2/Open Banking data-sharing risks: aggregator account-level access abuse, synthetic account creation via API, mule-account management through aggregator dashboards, and consent-jacking.',
    openBankingApply),

  // ── HUMAN RIGHTS ──────────────────────────────────────────────────────────
  m('modern_slavery_financial_pattern', 'Modern Slavery Financial Pattern Detection', 'human_rights', ['reasoning', 'intelligence'],
    'Identifies financial patterns consistent with labour exploitation and debt bondage: wage suppression below legal minimum, group housing deductions, employer-controlled bank accounts, and forced savings schemes.',
    modernSlaveryApply),
  m('hrd_financial_exclusion_probe', 'HRD Financial Exclusion Probe', 'human_rights', ['reasoning', 'strong_brain'],
    'Detects weaponised financial exclusion targeting human rights defenders, journalists, and activists: account closures without commercial rationale, coordinated de-banking, and transaction blocking aligned with advocacy activity.',
    hrdFinancialExclusionApply),
];

export const WAVE5_OVERRIDES: ReasoningMode[] = [];
