// Hawkeye Sterling — analytical-methods reasoning modes (PR #225 batch 3).
//
// Fifteen more stubs promoted to real algorithms across risk methodology,
// decision theory, graph / statistical analysis, and sectoral compliance:
//
//   Risk methodology
//   - attack_tree           — adversary attack-tree branch scoring
//   - bowtie                — threat / consequence bowtie analysis
//   - fmea                  — Failure Modes and Effects (RPN scoring)
//   - fair                  — FAIR LEF × LM quantitative loss exposure
//   - defence_in_depth      — control-layer overlap test
//
//   Decision theory
//   - expected_utility      — probability × utility maximisation
//   - maximin               — worst-case maximisation
//   - cost_benefit          — net present cost-benefit comparison
//   - fermi                 — order-of-magnitude sanity check
//
//   Graph / statistical
//   - centrality            — node-centrality flagging in a network
//   - hmm                   — hidden-Markov state-transition anomaly
//   - kl_divergence         — distribution drift between observed and reference
//
//   Sectoral compliance
//   - lbma_rgg_five_step    — LBMA RGG 5-step audit roll-up
//   - mev_scan              — MEV exposure (sandwich / front-run on-chain)
//   - article_by_article    — explicit article-level regulatory walk
//
// Charter: every mode returns inconclusive when its evidence key is empty
// (P1). No external recall (P3). No legal conclusions (P5).

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mkFinding(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
  evidence: string[] = [],
): Finding {
  return {
    modeId,
    category,
    faculties,
    score: clamp01(score),
    confidence: clamp01(confidence),
    verdict,
    rationale,
    evidence,
    producedAt: Date.now(),
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
// attack_tree — given a list of attack-tree leaves with success probability,
// score the path of least resistance.
// ──────────────────────────────────────────────────────────────────────
interface AttackLeaf {
  branch: string;
  successP: number;     // 0..1 attacker success probability
  detectionP: number;   // 0..1 our probability of detecting
  impact: number;       // 0..1 impact magnitude
  sourceRef: string;
}

const attackTreeApply = async (ctx: BrainContext): Promise<Finding> => {
  const leaves = typedEvidence<AttackLeaf>(ctx, 'attackLeaves');
  if (leaves.length === 0) {
    return mkFinding('attack_tree', 'threat_modeling', ['intelligence', 'strong_brain'],
      'inconclusive', 0, 0.2, 'No attack-tree leaves supplied. Mode requires attackLeaves[].');
  }
  // path of least resistance: max( successP * (1 - detectionP) * impact )
  let worst = leaves[0]!;
  let worstScore = worst.successP * (1 - worst.detectionP) * worst.impact;
  for (const l of leaves) {
    const s = l.successP * (1 - l.detectionP) * l.impact;
    if (s > worstScore) { worst = l; worstScore = s; }
  }
  const verdict: Verdict = worstScore >= 0.5 ? 'escalate' : worstScore >= 0.25 ? 'flag' : 'clear';
  const rationale = worstScore >= 0.25
    ? `Path of least resistance: "${worst.branch}" (success ${worst.successP.toFixed(2)}, detection ${worst.detectionP.toFixed(2)}, impact ${worst.impact.toFixed(2)}, residual ${worstScore.toFixed(2)}). Harden control layer or raise detection.`
    : `${leaves.length} attack-tree leaves reviewed; worst residual ${worstScore.toFixed(2)} below action threshold.`;
  return mkFinding('attack_tree', 'threat_modeling', ['intelligence', 'strong_brain'],
    verdict, clamp01(worstScore), 0.75, rationale, leaves.map((l) => l.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// bowtie — threat → preventive controls → top event → mitigative controls →
// consequence. A "thin" left or right side is a flag.
// ──────────────────────────────────────────────────────────────────────
interface BowtieAssembly {
  topEvent: string;
  preventiveControls: number;
  preventiveEffectiveness: number;  // 0..1
  mitigativeControls: number;
  mitigativeEffectiveness: number;
  worstConsequenceImpact: number;   // 0..1
  sourceRef: string;
}

const bowtieApply = async (ctx: BrainContext): Promise<Finding> => {
  const b = singleEvidence<BowtieAssembly>(ctx, 'bowtie');
  if (!b) {
    return mkFinding('bowtie', 'forensic', ['strong_brain', 'reasoning'],
      'inconclusive', 0, 0.2, 'No bowtie assembly supplied. Mode requires bowtie.');
  }
  const leftThin = b.preventiveControls < 2 || b.preventiveEffectiveness < 0.4;
  const rightThin = b.mitigativeControls < 2 || b.mitigativeEffectiveness < 0.4;
  const residual = b.worstConsequenceImpact * (1 - b.preventiveEffectiveness) * (1 - b.mitigativeEffectiveness);
  const reasons: string[] = [];
  if (leftThin) reasons.push(`thin preventive side (${b.preventiveControls} ctrls, eff ${b.preventiveEffectiveness.toFixed(2)})`);
  if (rightThin) reasons.push(`thin mitigative side (${b.mitigativeControls} ctrls, eff ${b.mitigativeEffectiveness.toFixed(2)})`);
  const verdict: Verdict = residual >= 0.4 ? 'escalate' : residual >= 0.2 || reasons.length > 0 ? 'flag' : 'clear';
  const rationale = reasons.length === 0 && residual < 0.2
    ? `Bowtie ${b.topEvent}: preventive + mitigative both adequate; residual ${residual.toFixed(2)}.`
    : `Bowtie ${b.topEvent}: ${reasons.join('; ') || ''}${reasons.length ? '. ' : ''}Residual impact ${residual.toFixed(2)}.`;
  return mkFinding('bowtie', 'forensic', ['strong_brain', 'reasoning'],
    verdict, clamp01(residual), 0.8, rationale, [b.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// fmea — Failure Mode + Effects Analysis. RPN = Severity × Occurrence × Detection.
// RPN >= 100 (max 1000) is the standard escalation threshold.
// ──────────────────────────────────────────────────────────────────────
interface FmeaItem {
  failureMode: string;
  severity: number;      // 1..10
  occurrence: number;    // 1..10
  detection: number;     // 1..10 (high = hard to detect)
  sourceRef: string;
}

const fmeaApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<FmeaItem>(ctx, 'fmeaItems');
  if (items.length === 0) {
    return mkFinding('fmea', 'forensic', ['strong_brain', 'reasoning'],
      'inconclusive', 0, 0.2, 'No FMEA items supplied. Mode requires fmeaItems[].');
  }
  const ranked = items.map((i) => ({ ...i, rpn: i.severity * i.occurrence * i.detection }))
    .sort((a, b) => b.rpn - a.rpn);
  const high = ranked.filter((r) => r.rpn >= 100);
  const veryHigh = ranked.filter((r) => r.rpn >= 200);
  const score = clamp01(veryHigh.length * 0.4 + high.length * 0.15);
  const verdict: Verdict = veryHigh.length > 0 ? 'escalate' : high.length > 0 ? 'flag' : 'clear';
  const top = ranked[0]!;
  const rationale = high.length > 0
    ? `${high.length} failure mode(s) with RPN >=100 (top: "${top.failureMode}" RPN=${top.rpn}). ${veryHigh.length > 0 ? 'Critical — apply preventive + detective controls.' : 'Plan corrective action.'}`
    : `${items.length} failure mode(s) reviewed; top RPN=${top.rpn} below action threshold.`;
  return mkFinding('fmea', 'forensic', ['strong_brain', 'reasoning'],
    verdict, score, 0.8, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// fair — FAIR LEF (Loss Event Frequency) × LM (Loss Magnitude) → Annual
// Loss Expectancy in USD. Compares to risk-appetite threshold.
// ──────────────────────────────────────────────────────────────────────
interface FairAssembly {
  lossEventFrequency: number;  // events / year
  lossMagnitudeMin: number;    // USD
  lossMagnitudeMostLikely: number;
  lossMagnitudeMax: number;
  appetiteAleUsd: number;      // organisation's annual-loss appetite
  sourceRef: string;
}

const fairApply = async (ctx: BrainContext): Promise<Finding> => {
  const f = singleEvidence<FairAssembly>(ctx, 'fairAssembly');
  if (!f) {
    return mkFinding('fair', 'threat_modeling', ['strong_brain', 'reasoning'],
      'inconclusive', 0, 0.2, 'No FAIR assembly supplied. Mode requires fairAssembly.');
  }
  const lmEstimate = (f.lossMagnitudeMin + 4 * f.lossMagnitudeMostLikely + f.lossMagnitudeMax) / 6; // PERT
  const ale = f.lossEventFrequency * lmEstimate;
  const ratio = f.appetiteAleUsd > 0 ? ale / f.appetiteAleUsd : 99;
  const score = clamp01(Math.log10(Math.max(1, ratio)) / 2);
  const verdict: Verdict = ratio >= 2 ? 'escalate' : ratio >= 1 ? 'flag' : 'clear';
  const rationale = ratio >= 1
    ? `FAIR ALE = USD ${ale.toLocaleString(undefined, { maximumFractionDigits: 0 })} (LEF ${f.lossEventFrequency} × LM-PERT ${lmEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}); ${(ratio * 100).toFixed(0)}% of appetite USD ${f.appetiteAleUsd.toLocaleString()}.`
    : `FAIR ALE within appetite (${(ratio * 100).toFixed(0)}%).`;
  return mkFinding('fair', 'threat_modeling', ['strong_brain', 'reasoning'],
    verdict, score, 0.75, rationale, [f.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// defence_in_depth — counts independent control layers; flags single-layer
// reliance on any threat path.
// ──────────────────────────────────────────────────────────────────────
interface DefenceLayer {
  threatPath: string;
  layerCount: number;        // independent control layers covering this path
  layerEffectiveness: number; // 0..1 average effectiveness
  sourceRef: string;
}

const defenceInDepthApply = async (ctx: BrainContext): Promise<Finding> => {
  const layers = typedEvidence<DefenceLayer>(ctx, 'defenceLayers');
  if (layers.length === 0) {
    return mkFinding('defence_in_depth', 'strategic', ['strong_brain', 'reasoning'],
      'inconclusive', 0, 0.2, 'No defence layers supplied. Mode requires defenceLayers[].');
  }
  const single = layers.filter((l) => l.layerCount <= 1);
  const weak = layers.filter((l) => l.layerCount >= 2 && l.layerEffectiveness < 0.5);
  const score = clamp01(single.length * 0.4 + weak.length * 0.15);
  const verdict: Verdict = single.length > 0 ? 'escalate' : weak.length > 0 ? 'flag' : 'clear';
  const rationale = single.length > 0
    ? `${single.length} threat path(s) covered by ONLY ONE layer (${single.map((l) => l.threatPath).join(', ')}). Add an independent control before next review.`
    : weak.length > 0
      ? `${weak.length} threat path(s) have multiple layers but average effectiveness < 0.5; layered ≠ effective.`
      : `${layers.length} threat path(s) covered by ≥2 effective layers each.`;
  return mkFinding('defence_in_depth', 'strategic', ['strong_brain', 'reasoning'],
    verdict, score, 0.8, rationale, layers.map((l) => l.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// expected_utility — picks the action with the highest probability-weighted
// utility; flags when chosen action ≠ EU-optimal.
// ──────────────────────────────────────────────────────────────────────
interface EUAlternative {
  action: string;
  scenarios: Array<{ probability: number; utility: number }>;
}

interface EuProbe {
  alternatives: EUAlternative[];
  chosen: string;
  sourceRef: string;
}

const expectedUtilityApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<EuProbe>(ctx, 'euProbe');
  if (!p || p.alternatives.length === 0) {
    return mkFinding('expected_utility', 'decision_theory', ['reasoning', 'inference'],
      'inconclusive', 0, 0.2, 'No expected-utility probe supplied. Mode requires euProbe with alternatives[].');
  }
  const eu = p.alternatives.map((a) => ({
    action: a.action,
    eu: a.scenarios.reduce((s, sc) => s + sc.probability * sc.utility, 0),
  }));
  eu.sort((a, b) => b.eu - a.eu);
  const optimal = eu[0]!;
  const chosen = eu.find((x) => x.action === p.chosen);
  const aligned = chosen?.action === optimal.action;
  const gap = chosen ? optimal.eu - chosen.eu : optimal.eu;
  const score = aligned ? 0.05 : clamp01(gap / Math.max(Math.abs(optimal.eu), 1));
  const verdict: Verdict = aligned ? 'clear' : gap > Math.abs(optimal.eu) * 0.2 ? 'flag' : 'clear';
  const rationale = aligned
    ? `Chosen "${p.chosen}" is EU-optimal (EU ${optimal.eu.toFixed(2)}).`
    : `Chosen "${p.chosen}" EU=${chosen?.eu.toFixed(2) ?? 'n/a'} vs optimal "${optimal.action}" EU=${optimal.eu.toFixed(2)} (gap ${gap.toFixed(2)}).`;
  return mkFinding('expected_utility', 'decision_theory', ['reasoning', 'inference'],
    verdict, score, 0.8, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// maximin — picks the action whose worst-case payoff is highest.
// ──────────────────────────────────────────────────────────────────────
interface MaximinProbe {
  alternatives: Array<{ action: string; worstCasePayoff: number }>;
  chosen: string;
  sourceRef: string;
}

const maximinApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<MaximinProbe>(ctx, 'maximinProbe');
  if (!p || p.alternatives.length === 0) {
    return mkFinding('maximin', 'decision_theory', ['reasoning'],
      'inconclusive', 0, 0.2, 'No maximin probe supplied. Mode requires maximinProbe with alternatives[].');
  }
  const sorted = [...p.alternatives].sort((a, b) => b.worstCasePayoff - a.worstCasePayoff);
  const optimal = sorted[0]!;
  const aligned = optimal.action === p.chosen;
  const score = aligned ? 0.05 : 0.4;
  const verdict: Verdict = aligned ? 'clear' : 'flag';
  const rationale = aligned
    ? `Chosen "${p.chosen}" is maximin-optimal (worst-case ${optimal.worstCasePayoff}).`
    : `Chosen "${p.chosen}" is not maximin-optimal — "${optimal.action}" guarantees worst-case ${optimal.worstCasePayoff}.`;
  return mkFinding('maximin', 'decision_theory', ['reasoning'],
    verdict, score, 0.8, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// cost_benefit — net present value over horizon; flags when chosen
// programme is dominated.
// ──────────────────────────────────────────────────────────────────────
interface CostBenefitProgramme {
  name: string;
  oneTimeCostUsd: number;
  recurringCostUsdPerYear: number;
  benefitUsdPerYear: number;
  horizonYears: number;
  discountRate?: number | undefined;
  sourceRef: string;
}

interface CostBenefitProbe {
  programmes: CostBenefitProgramme[];
  chosen: string;
  sourceRef: string;
}

const costBenefitApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<CostBenefitProbe>(ctx, 'costBenefitProbe');
  if (!p || p.programmes.length === 0) {
    return mkFinding('cost_benefit', 'decision_theory', ['reasoning'],
      'inconclusive', 0, 0.2, 'No cost-benefit probe supplied. Mode requires costBenefitProbe.');
  }
  const npv = (g: CostBenefitProgramme): number => {
    const r = g.discountRate ?? 0.05;
    let total = -g.oneTimeCostUsd;
    for (let t = 1; t <= g.horizonYears; t++) {
      total += (g.benefitUsdPerYear - g.recurringCostUsdPerYear) / Math.pow(1 + r, t);
    }
    return total;
  };
  const ranked = p.programmes.map((g) => ({ name: g.name, npv: npv(g) }))
    .sort((a, b) => b.npv - a.npv);
  const optimal = ranked[0]!;
  const chosenNpv = ranked.find((x) => x.name === p.chosen);
  const aligned = chosenNpv?.name === optimal.name;
  const score = aligned ? 0.05 : 0.4;
  const verdict: Verdict = aligned ? 'clear' : 'flag';
  const rationale = aligned
    ? `Chosen "${p.chosen}" has highest NPV (USD ${optimal.npv.toLocaleString(undefined, { maximumFractionDigits: 0 })}).`
    : `Chosen "${p.chosen}" NPV ${chosenNpv?.npv.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? 'n/a'} vs optimal "${optimal.name}" NPV ${optimal.npv.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`;
  return mkFinding('cost_benefit', 'decision_theory', ['reasoning'],
    verdict, score, 0.8, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// fermi — order-of-magnitude sanity check: flags when an analyst's
// estimate differs by >1 order of magnitude from a Fermi roll-up.
// ──────────────────────────────────────────────────────────────────────
interface FermiProbe {
  question: string;
  factors: number[];   // multiplied to get the Fermi estimate
  analystEstimate: number;
  sourceRef: string;
}

const fermiApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<FermiProbe>(ctx, 'fermiProbe');
  if (!p || p.factors.length === 0) {
    return mkFinding('fermi', 'decision_theory', ['data_analysis', 'smartness'],
      'inconclusive', 0, 0.2, 'No Fermi probe supplied. Mode requires fermiProbe with factors[].');
  }
  const fermi = p.factors.reduce((a, b) => a * b, 1);
  const ratio = fermi > 0 && p.analystEstimate > 0 ? Math.log10(p.analystEstimate / fermi) : 0;
  const absRatio = Math.abs(ratio);
  const verdict: Verdict = absRatio >= 1 ? 'flag' : 'clear';
  const score = clamp01(absRatio / 2);
  const rationale = absRatio >= 1
    ? `Fermi estimate ${fermi.toExponential(2)}; analyst ${p.analystEstimate.toExponential(2)}; ratio 10^${ratio.toFixed(2)}. Sanity-check inputs.`
    : `Fermi ${fermi.toExponential(2)} and analyst ${p.analystEstimate.toExponential(2)} agree to within an order of magnitude.`;
  return mkFinding('fermi', 'decision_theory', ['data_analysis', 'smartness'],
    verdict, score, 0.7, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// centrality — flags nodes with abnormally high degree / betweenness in
// a counterparty graph.
// ──────────────────────────────────────────────────────────────────────
interface NodeCentrality {
  nodeId: string;
  degree: number;
  betweennessNormalised: number; // 0..1
  isExpected: boolean;            // true for known regulators / utilities
  sourceRef: string;
}

const centralityApply = async (ctx: BrainContext): Promise<Finding> => {
  const nodes = typedEvidence<NodeCentrality>(ctx, 'nodeCentralities');
  if (nodes.length === 0) {
    return mkFinding('centrality', 'graph_analysis', ['data_analysis', 'intelligence'],
      'inconclusive', 0, 0.2, 'No centrality nodes supplied. Mode requires nodeCentralities[].');
  }
  const surprising = nodes.filter((n) => !n.isExpected && n.betweennessNormalised >= 0.5);
  const veryHigh = nodes.filter((n) => !n.isExpected && n.betweennessNormalised >= 0.8);
  const score = clamp01(veryHigh.length * 0.5 + surprising.length * 0.2);
  const verdict: Verdict = veryHigh.length > 0 ? 'escalate' : surprising.length > 0 ? 'flag' : 'clear';
  const rationale = surprising.length > 0
    ? `${surprising.length} unexpected high-centrality node(s) (top: ${surprising[0]?.nodeId} betweenness ${surprising[0]?.betweennessNormalised.toFixed(2)}). Possible hub of laundering / concealment.`
    : `${nodes.length} node(s) reviewed; high-centrality nodes match expected utilities.`;
  return mkFinding('centrality', 'graph_analysis', ['data_analysis', 'intelligence'],
    verdict, score, 0.75, rationale, nodes.map((n) => n.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// hmm — hidden-Markov state-transition: flags rare transitions or
// stuck-state behaviour.
// ──────────────────────────────────────────────────────────────────────
interface HmmObservation {
  fromState: string;
  toState: string;
  transitionProb: number;       // baseline probability of this transition
  observedThisCase: boolean;
  sourceRef: string;
}

const hmmApply = async (ctx: BrainContext): Promise<Finding> => {
  const obs = typedEvidence<HmmObservation>(ctx, 'hmmObservations');
  if (obs.length === 0) {
    return mkFinding('hmm', 'statistical', ['inference'],
      'inconclusive', 0, 0.2, 'No HMM observations supplied. Mode requires hmmObservations[].');
  }
  const observed = obs.filter((o) => o.observedThisCase);
  const rare = observed.filter((o) => o.transitionProb <= 0.05);
  const veryRare = observed.filter((o) => o.transitionProb <= 0.01);
  const score = clamp01(veryRare.length * 0.4 + rare.length * 0.15);
  const verdict: Verdict = veryRare.length > 0 ? 'escalate' : rare.length > 0 ? 'flag' : 'clear';
  const rationale = rare.length > 0
    ? `${rare.length} rare transition(s) observed (${rare.map((r) => `${r.fromState}->${r.toState} p=${r.transitionProb}`).join(', ')}). Investigate state-anomaly.`
    : `${observed.length} transition(s) observed; all within baseline distribution.`;
  return mkFinding('hmm', 'statistical', ['inference'],
    verdict, score, 0.75, rationale, obs.map((o) => o.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// kl_divergence — distribution drift between observed and reference
// (e.g. monthly transaction-amount distribution).
// ──────────────────────────────────────────────────────────────────────
interface KlProbe {
  metric: string;
  bins: Array<{ label: string; reference: number; observed: number }>;
  thresholdNats?: number | undefined;
  sourceRef: string;
}

const klDivergenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<KlProbe>(ctx, 'klProbe');
  if (!p || p.bins.length === 0) {
    return mkFinding('kl_divergence', 'statistical', ['data_analysis'],
      'inconclusive', 0, 0.2, 'No KL probe supplied. Mode requires klProbe with bins[].');
  }
  const refSum = p.bins.reduce((s, b) => s + b.reference, 0) || 1;
  const obsSum = p.bins.reduce((s, b) => s + b.observed, 0) || 1;
  let kl = 0;
  for (const b of p.bins) {
    const q = (b.reference / refSum) || 1e-9;
    const r = (b.observed / obsSum) || 1e-9;
    kl += r * Math.log(r / q);
  }
  const threshold = p.thresholdNats ?? 0.1;
  const verdict: Verdict = kl >= threshold * 3 ? 'escalate' : kl >= threshold ? 'flag' : 'clear';
  const score = clamp01(kl / Math.max(threshold * 3, 0.001));
  const rationale = kl >= threshold
    ? `${p.metric}: KL=${kl.toFixed(4)} nats vs threshold ${threshold} — significant drift from reference.`
    : `${p.metric}: KL=${kl.toFixed(4)} nats below threshold; distribution stable.`;
  return mkFinding('kl_divergence', 'statistical', ['data_analysis'],
    verdict, score, 0.8, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// lbma_rgg_five_step — roll-up of LBMA RGG Steps 1..5 status.
// ──────────────────────────────────────────────────────────────────────
interface RggStepStatus {
  step: 1 | 2 | 3 | 4 | 5;
  status: 'complete' | 'partial' | 'missing';
  evidenceCount: number;
  sourceRef: string;
}

const lbmaRggFiveStepApply = async (ctx: BrainContext): Promise<Finding> => {
  const steps = typedEvidence<RggStepStatus>(ctx, 'rggSteps');
  if (steps.length === 0) {
    return mkFinding('lbma_rgg_five_step', 'compliance_framework', ['intelligence', 'reasoning'],
      'inconclusive', 0, 0.2, 'No RGG steps supplied. Mode requires rggSteps[].');
  }
  const missing = steps.filter((s) => s.status === 'missing');
  const partial = steps.filter((s) => s.status === 'partial');
  const score = clamp01(missing.length * 0.3 + partial.length * 0.1);
  const verdict: Verdict = missing.length > 0 ? 'escalate' : partial.length >= 2 ? 'flag' : 'clear';
  const rationale = missing.length > 0
    ? `RGG Step(s) missing: ${missing.map((s) => `Step ${s.step}`).join(', ')}. LBMA Good-Delivery status at risk.`
    : partial.length > 0
      ? `RGG progress: ${partial.length} step(s) partial; complete remediation before annual report.`
      : `All 5 RGG steps complete; LBMA RGG annual cycle on track.`;
  return mkFinding('lbma_rgg_five_step', 'compliance_framework', ['intelligence', 'reasoning'],
    verdict, score, 0.8, rationale, steps.map((s) => s.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// mev_scan — Maximal Extractable Value exposure: sandwich attacks,
// front-running, JIT liquidity siphons against customer transactions.
// ──────────────────────────────────────────────────────────────────────
interface MevEvent {
  txHash: string;
  pattern: 'sandwich' | 'frontrun' | 'jit_liquidity' | 'backrun' | 'other';
  victimLossUsd: number;
  attackerProfitUsd: number;
  sourceRef: string;
}

const mevScanApply = async (ctx: BrainContext): Promise<Finding> => {
  const events = typedEvidence<MevEvent>(ctx, 'mevEvents');
  if (events.length === 0) {
    return mkFinding('mev_scan', 'crypto_defi', ['data_analysis', 'reasoning'],
      'inconclusive', 0, 0.2, 'No MEV events supplied. Mode requires mevEvents[].');
  }
  const sandwich = events.filter((e) => e.pattern === 'sandwich');
  const totalLoss = events.reduce((s, e) => s + e.victimLossUsd, 0);
  const score = clamp01(totalLoss / 100_000);
  const verdict: Verdict = totalLoss >= 50_000 ? 'escalate' : sandwich.length >= 3 ? 'flag' : 'clear';
  const rationale = totalLoss >= 50_000
    ? `MEV exposure: ${events.length} attack(s), ${sandwich.length} sandwich, USD ${totalLoss.toLocaleString()} aggregate victim loss. Apply private-pool routing.`
    : `${events.length} MEV event(s) detected; loss USD ${totalLoss.toLocaleString()} within tolerance.`;
  return mkFinding('mev_scan', 'crypto_defi', ['data_analysis', 'reasoning'],
    verdict, score, 0.8, rationale, events.map((e) => e.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// article_by_article — explicit walk through each cited regulatory
// article checking applicability + satisfaction.
// ──────────────────────────────────────────────────────────────────────
interface ArticleWalk {
  framework: string;          // 'FATF Recs' | 'FDL 10/2025' | etc.
  article: string;
  applicable: boolean;
  satisfied: boolean | null;  // null when applicable but unverified
  sourceRef: string;
}

const articleByArticleApply = async (ctx: BrainContext): Promise<Finding> => {
  const walks = typedEvidence<ArticleWalk>(ctx, 'articleWalks');
  if (walks.length === 0) {
    return mkFinding('article_by_article', 'compliance_framework', ['ratiocination', 'reasoning'],
      'inconclusive', 0, 0.2, 'No article walks supplied. Mode requires articleWalks[].');
  }
  const applicable = walks.filter((w) => w.applicable);
  const unsatisfied = applicable.filter((w) => w.satisfied === false);
  const unverified = applicable.filter((w) => w.satisfied === null);
  const score = clamp01(unsatisfied.length * 0.35 + unverified.length * 0.1);
  const verdict: Verdict = unsatisfied.length > 0 ? 'escalate' : unverified.length > 0 ? 'flag' : 'clear';
  const rationale = unsatisfied.length > 0
    ? `${unsatisfied.length}/${applicable.length} applicable article(s) NOT satisfied (${unsatisfied.slice(0, 5).map((w) => `${w.framework} ${w.article}`).join(', ')}${unsatisfied.length > 5 ? '...' : ''}).`
    : unverified.length > 0
      ? `${unverified.length}/${applicable.length} applicable article(s) unverified — close evidence gap.`
      : `All ${applicable.length} applicable article(s) confirmed satisfied across ${walks.length} walked.`;
  return mkFinding('article_by_article', 'compliance_framework', ['ratiocination', 'reasoning'],
    verdict, score, 0.85, rationale, walks.map((w) => w.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// Bundle export
// ──────────────────────────────────────────────────────────────────────
export const ANALYTICAL_METHODS_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  attack_tree:        attackTreeApply,
  bowtie:             bowtieApply,
  fmea:               fmeaApply,
  fair:               fairApply,
  defence_in_depth:   defenceInDepthApply,
  expected_utility:   expectedUtilityApply,
  maximin:            maximinApply,
  cost_benefit:       costBenefitApply,
  fermi:              fermiApply,
  centrality:         centralityApply,
  hmm:                hmmApply,
  kl_divergence:      klDivergenceApply,
  lbma_rgg_five_step: lbmaRggFiveStepApply,
  mev_scan:           mevScanApply,
  article_by_article: articleByArticleApply,
};
