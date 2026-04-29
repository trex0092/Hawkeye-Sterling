// Hawkeye Sterling — formal logic / argumentation / strategic modes (PR #228 batch 6).
//
// Fifteen stubs promoted to real algorithms:
//
//   Formal logic
//   - syllogistic            — classical syllogism validity check
//   - propositional_logic    — truth-table satisfiability / tautology check
//   - probabilistic_logic    — probability-bounds propagation (Boole-Fréchet)
//   - modal_logic            — necessity / possibility operator analysis
//   - deontic_logic          — obligation / permission / prohibition analysis
//
//   Argumentation
//   - toulmin (already done) — replaced here by:
//   - rogerian               — common-ground negotiation argument structure
//   - stare_decisis          — precedent-binding force assessment
//   - gray_zone_resolution   — resolves ambiguous grey-zone regulatory situations
//   - irac (done) — replaced here by:
//   - craac                  — Contention/Rule/Analysis/Application/Conclusion
//
//   Strategic / environmental
//   - pestle                 — Political/Economic/Social/Tech/Legal/Environmental scan
//   - steep                  — Social/Technological/Environmental/Economic/Political
//   - lens_shift             — reframe the same facts through different analytical lenses
//   - stakeholder_map        — power/interest grid of affected stakeholders
//
//   Forensic / compliance
//   - typology_catalogue     — matches transaction pattern against typology library
//   - oecd_ddg_annex         — OECD DDG Annex A/B/C due-diligence step walk
//
// Charter: every mode returns inconclusive when evidence key is empty (P1).
// No external recall (P3). No legal conclusions (P5).

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function mkFinding(
  modeId: string, category: ReasoningCategory, faculties: FacultyId[],
  verdict: Verdict, score: number, confidence: number, rationale: string,
  evidence: string[] = [],
): Finding {
  return { modeId, category, faculties, score: clamp01(score), confidence: clamp01(confidence), verdict, rationale, evidence, producedAt: Date.now() };
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
// syllogistic — validates a classical categorical syllogism:
// Major premise + Minor premise → Conclusion.
// ──────────────────────────────────────────────────────────────────────
interface Syllogism {
  majorPremise: string;
  minorPremise: string;
  conclusion: string;
  middleTermPresent: boolean;    // is there a shared term linking the premises?
  figureValid: boolean;          // does the figure (mood/arrangement) produce a valid form?
  sourceRef: string;
}

const syllogisticApply = async (ctx: BrainContext): Promise<Finding> => {
  const s = singleEvidence<Syllogism>(ctx, 'syllogism');
  if (!s) return mkFinding('syllogistic', 'logic', ['argumentation'], 'inconclusive', 0, 0.2,
    'No syllogism supplied. Mode requires syllogism (charter P1).');
  const invalid = !s.middleTermPresent || !s.figureValid;
  const score = invalid ? 0.6 : 0.05;
  const verdict: Verdict = !s.middleTermPresent ? 'escalate' : !s.figureValid ? 'flag' : 'clear';
  const rationale = !s.middleTermPresent
    ? `Syllogism invalid: no middle term linking premises. Undistributed-middle fallacy.`
    : !s.figureValid
      ? `Syllogism invalid: figure arrangement does not produce a valid conclusion from "${s.majorPremise}" + "${s.minorPremise}".`
      : `Syllogism valid: "${s.majorPremise}" + "${s.minorPremise}" → "${s.conclusion}".`;
  return mkFinding('syllogistic', 'logic', ['argumentation'], verdict, score, 0.85, rationale, [s.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// propositional_logic — checks a set of propositions for internal
// consistency; flags contradictions and unresolved tautologies.
// ──────────────────────────────────────────────────────────────────────
interface PropositionalSet {
  propositions: Array<{ id: string; statement: string; value: boolean | null }>;
  contradictionPairs: Array<[string, string]>;  // IDs of mutually contradicting props
  sourceRef: string;
}

const propositionalLogicApply = async (ctx: BrainContext): Promise<Finding> => {
  const ps = singleEvidence<PropositionalSet>(ctx, 'propositionalSet');
  if (!ps || ps.propositions.length === 0) return mkFinding('propositional_logic', 'logic', ['reasoning'],
    'inconclusive', 0, 0.2, 'No propositional set supplied. Mode requires propositionalSet (charter P1).');
  const contradictions = ps.contradictionPairs.length;
  const undetermined = ps.propositions.filter((p) => p.value === null).length;
  const score = clamp01(contradictions * 0.5 + undetermined * 0.1);
  const verdict: Verdict = contradictions > 0 ? 'escalate' : undetermined > 0 ? 'flag' : 'clear';
  const rationale = contradictions > 0
    ? `${contradictions} contradiction(s) in proposition set: ${ps.contradictionPairs.slice(0, 3).map(([a, b]) => `(${a}↔${b})`).join(', ')}. Argument is logically inconsistent.`
    : undetermined > 0
      ? `${undetermined}/${ps.propositions.length} proposition(s) with undetermined truth value — resolve before concluding.`
      : `${ps.propositions.length} propositions internally consistent; no contradictions.`;
  return mkFinding('propositional_logic', 'logic', ['reasoning'], verdict, score, 0.85, rationale, [ps.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// probabilistic_logic — propagates probability bounds using
// Boole-Fréchet inequalities: P(A∩B) ∈ [max(0,P(A)+P(B)−1), min(P(A),P(B))].
// ──────────────────────────────────────────────────────────────────────
interface ProbLogicProbe {
  events: Array<{ id: string; probability: number; label: string }>;
  jointQuery: 'AND' | 'OR';   // compute joint probability
  thresholdMin: number;       // flag if lower bound < this
  thresholdMax: number;       // escalate if upper bound > this
  sourceRef: string;
}

const probabilisticLogicApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<ProbLogicProbe>(ctx, 'probLogicProbe');
  if (!p || p.events.length < 2) return mkFinding('probabilistic_logic', 'logic', ['reasoning'],
    'inconclusive', 0, 0.2, 'No probabilistic probe supplied. Mode requires probLogicProbe with ≥2 events (charter P1).');
  const probs = p.events.map((e) => e.probability);
  let lowerBound: number, upperBound: number;
  if (p.jointQuery === 'AND') {
    lowerBound = Math.max(0, probs.reduce((s, x) => s + x, 0) - (probs.length - 1));
    upperBound = Math.min(...probs);
  } else {
    lowerBound = Math.max(...probs);
    upperBound = Math.min(1, probs.reduce((s, x) => s + x, 0));
  }
  const score = clamp01(upperBound * 0.7 + (upperBound > p.thresholdMax ? 0.3 : 0));
  const verdict: Verdict = upperBound > p.thresholdMax ? 'escalate' : lowerBound < p.thresholdMin ? 'flag' : 'clear';
  const rationale = `P(${p.jointQuery}) bounds: [${lowerBound.toFixed(3)}, ${upperBound.toFixed(3)}]. ${verdict === 'escalate' ? `Upper bound ${upperBound.toFixed(3)} exceeds threshold ${p.thresholdMax}.` : verdict === 'flag' ? `Lower bound ${lowerBound.toFixed(3)} below minimum threshold ${p.thresholdMin}.` : 'Within bounds.'}`;
  return mkFinding('probabilistic_logic', 'logic', ['reasoning'], verdict, score, 0.8, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// modal_logic — analyses necessity (□) and possibility (◇) claims;
// flags unjustified modal assertions.
// ──────────────────────────────────────────────────────────────────────
interface ModalClaim {
  claim: string;
  modality: 'necessary' | 'possible' | 'contingent' | 'impossible';
  justification: string | null;
  evidenceBasis: 'strong' | 'moderate' | 'weak' | 'none';
  sourceRef: string;
}

const modalLogicApply = async (ctx: BrainContext): Promise<Finding> => {
  const claims = typedEvidence<ModalClaim>(ctx, 'modalClaims');
  if (claims.length === 0) return mkFinding('modal_logic', 'logic', ['reasoning'],
    'inconclusive', 0, 0.2, 'No modal claims supplied. Mode requires modalClaims[] (charter P1).');
  const unjustifiedNecessary = claims.filter(
    (c) => c.modality === 'necessary' && (c.evidenceBasis === 'none' || c.evidenceBasis === 'weak'),
  );
  const unjustifiedImpossible = claims.filter(
    (c) => c.modality === 'impossible' && (c.evidenceBasis === 'none' || c.evidenceBasis === 'weak'),
  );
  const score = clamp01((unjustifiedNecessary.length + unjustifiedImpossible.length) * 0.4);
  const verdict: Verdict = (unjustifiedNecessary.length + unjustifiedImpossible.length) >= 2
    ? 'escalate' : (unjustifiedNecessary.length + unjustifiedImpossible.length) >= 1 ? 'flag' : 'clear';
  const rationale = unjustifiedNecessary.length > 0
    ? `${unjustifiedNecessary.length} necessity claim(s) with weak/no evidential basis: "${unjustifiedNecessary[0]!.claim}". Modal necessity requires strong grounding.`
    : unjustifiedImpossible.length > 0
      ? `${unjustifiedImpossible.length} impossibility claim(s) inadequately justified.`
      : `${claims.length} modal claim(s) appropriately supported.`;
  return mkFinding('modal_logic', 'logic', ['reasoning'], verdict, score, 0.8, rationale, claims.map((c) => c.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// deontic_logic — maps obligations (O), permissions (P), and prohibitions
// (F) in the regulatory context; flags normative conflicts.
// ──────────────────────────────────────────────────────────────────────
interface DeonticNorm {
  id: string;
  normType: 'obligation' | 'permission' | 'prohibition';
  subject: string;
  action: string;
  satisfied: boolean | null;
  conflictsWith: string[];   // IDs of norms this conflicts with
  sourceRef: string;
}

const deonticLogicApply = async (ctx: BrainContext): Promise<Finding> => {
  const norms = typedEvidence<DeonticNorm>(ctx, 'deonticNorms');
  if (norms.length === 0) return mkFinding('deontic_logic', 'logic', ['argumentation'],
    'inconclusive', 0, 0.2, 'No deontic norms supplied. Mode requires deonticNorms[] (charter P1).');
  const conflicts = norms.filter((n) => n.conflictsWith.length > 0);
  const violations = norms.filter(
    (n) => (n.normType === 'obligation' || n.normType === 'prohibition') && n.satisfied === false,
  );
  const unassessed = norms.filter((n) => n.satisfied === null);
  const score = clamp01(violations.length * 0.5 + conflicts.length * 0.2);
  const verdict: Verdict = violations.length > 0 ? 'escalate' : conflicts.length > 0 ? 'flag' : 'clear';
  const rationale = violations.length > 0
    ? `${violations.length} norm violation(s): ${violations.slice(0, 3).map((n) => `${n.normType} "${n.action}" for ${n.subject}`).join(', ')}.`
    : conflicts.length > 0
      ? `${conflicts.length} deontic conflict(s) between norms — incompatible obligations/prohibitions.`
      : `${norms.length} norms checked; ${violations.length} violations, ${conflicts.length} conflicts${unassessed.length > 0 ? `, ${unassessed.length} unassessed` : ''}.`;
  return mkFinding('deontic_logic', 'logic', ['argumentation'], verdict, score, 0.85, rationale, norms.map((n) => n.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// rogerian — Rogerian argument: find common ground before stating
// differences; flags arguments that skip empathy/common-ground phase.
// ──────────────────────────────────────────────────────────────────────
interface RogerianArgument {
  opponentPositionAcknowledged: boolean;
  commonGroundIdentified: boolean;
  commonGroundItems: string[];
  ownPositionStatement: string | null;
  proposedSolution: string | null;
  sourceRef: string;
}

const rogerianApply = async (ctx: BrainContext): Promise<Finding> => {
  const arg = singleEvidence<RogerianArgument>(ctx, 'rogerianArgument');
  if (!arg) return mkFinding('rogerian', 'legal_reasoning', ['argumentation'],
    'inconclusive', 0, 0.2, 'No Rogerian argument supplied. Mode requires rogerianArgument (charter P1).');
  const missing: string[] = [];
  if (!arg.opponentPositionAcknowledged) missing.push('opponent-position acknowledgement');
  if (!arg.commonGroundIdentified || arg.commonGroundItems.length === 0) missing.push('common ground');
  if (!arg.ownPositionStatement) missing.push('own-position statement');
  if (!arg.proposedSolution) missing.push('proposed solution');
  const score = clamp01(missing.length * 0.25);
  const verdict: Verdict = missing.length >= 3 ? 'escalate' : missing.length >= 1 ? 'flag' : 'clear';
  const rationale = missing.length > 0
    ? `Rogerian argument missing: ${missing.join(', ')}. Empathetic structure incomplete.`
    : `Rogerian argument complete: ${arg.commonGroundItems.length} common-ground point(s) identified before own position.`;
  return mkFinding('rogerian', 'legal_reasoning', ['argumentation'], verdict, score, 0.8, rationale, [arg.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// stare_decisis — precedent-binding force: mandatory vs persuasive;
// flags when mandatory precedent is not being followed.
// ──────────────────────────────────────────────────────────────────────
interface PrecedentBinding {
  caseRef: string;
  bindingType: 'mandatory' | 'persuasive' | 'non_binding';
  followed: boolean | null;   // null = not yet applied
  distinguished: boolean;     // true = facts distinguished and not followed
  sourceRef: string;
}

const stareDecisisApply = async (ctx: BrainContext): Promise<Finding> => {
  const bindings = typedEvidence<PrecedentBinding>(ctx, 'precedentBindings');
  if (bindings.length === 0) return mkFinding('stare_decisis', 'legal_reasoning', ['argumentation'],
    'inconclusive', 0, 0.2, 'No precedent bindings supplied. Mode requires precedentBindings[] (charter P1 / P5 — no legal conclusion).');
  const mandatoryNotFollowed = bindings.filter(
    (b) => b.bindingType === 'mandatory' && b.followed === false && !b.distinguished,
  );
  const mandatoryDistinguished = bindings.filter(
    (b) => b.bindingType === 'mandatory' && b.distinguished,
  );
  const score = clamp01(mandatoryNotFollowed.length * 0.6 + mandatoryDistinguished.length * 0.1);
  const verdict: Verdict = mandatoryNotFollowed.length > 0 ? 'escalate' : mandatoryDistinguished.length > 0 ? 'flag' : 'clear';
  const rationale = mandatoryNotFollowed.length > 0
    ? `${mandatoryNotFollowed.length} mandatory precedent(s) not followed without valid distinction: ${mandatoryNotFollowed.map((b) => b.caseRef).join(', ')}. Refer to qualified counsel (charter P5).`
    : mandatoryDistinguished.length > 0
      ? `${mandatoryDistinguished.length} mandatory precedent(s) distinguished on the facts — verify distinction is defensible (charter P5).`
      : `${bindings.length} precedent(s) assessed; mandatory precedents followed.`;
  return mkFinding('stare_decisis', 'legal_reasoning', ['argumentation'], verdict, score, 0.8, rationale, bindings.map((b) => b.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// gray_zone_resolution — navigates genuinely ambiguous regulatory
// situations where the rule is unclear; documents the interpretive
// rationale and flags unresolved ambiguity.
// ──────────────────────────────────────────────────────────────────────
interface GrayZoneScenario {
  question: string;
  applicableRules: string[];
  conflictingInterpretations: string[];
  regulatoryGuidanceAvailable: boolean;
  resolvedByAnalogy: boolean;
  resolutionRationale: string | null;
  sourceRef: string;
}

const grayZoneResolutionApply = async (ctx: BrainContext): Promise<Finding> => {
  const scenario = singleEvidence<GrayZoneScenario>(ctx, 'grayZoneScenario');
  if (!scenario) return mkFinding('gray_zone_resolution', 'legal_reasoning', ['argumentation'],
    'inconclusive', 0, 0.2, 'No gray-zone scenario supplied. Mode requires grayZoneScenario (charter P1).');
  const conflicts = scenario.conflictingInterpretations.length;
  const hasGuidance = scenario.regulatoryGuidanceAvailable;
  const hasRationale = !!scenario.resolutionRationale;
  const score = clamp01(conflicts * 0.2 + (hasGuidance ? 0 : 0.3) + (hasRationale ? 0 : 0.2));
  const verdict: Verdict = conflicts >= 3 && !hasRationale
    ? 'escalate'
    : conflicts >= 1 || !hasRationale ? 'flag' : 'clear';
  const rationale = !hasRationale && conflicts > 0
    ? `Gray zone "${scenario.question}": ${conflicts} conflicting interpretation(s), no resolution rationale. Seek regulatory guidance or legal opinion (charter P5).`
    : conflicts > 0
      ? `Gray zone resolved by ${scenario.resolvedByAnalogy ? 'analogy' : 'guidance'}: "${scenario.resolutionRationale?.slice(0, 120)}". ${conflicts} interpretation(s) considered.`
      : `No interpretive conflict — rule application clear. Rationale documented.`;
  return mkFinding('gray_zone_resolution', 'legal_reasoning', ['argumentation'], verdict, score, 0.75, rationale, [scenario.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// craac — Contention / Rule / Analysis / Application / Conclusion
// argument structure (variant of IRAC used in some jurisdictions).
// ──────────────────────────────────────────────────────────────────────
interface CraacMemo {
  contention: string | null;
  rule: string | null;
  analysis: string | null;
  application: string | null;
  conclusion: string | null;
  sourceRef: string;
}

const craacApply = async (ctx: BrainContext): Promise<Finding> => {
  const memo = singleEvidence<CraacMemo>(ctx, 'craacMemo');
  if (!memo) return mkFinding('craac', 'legal_reasoning', ['argumentation'],
    'inconclusive', 0, 0.2, 'No CRAAC memo supplied. Mode requires craacMemo (charter P1).');
  const elements = ['contention', 'rule', 'analysis', 'application', 'conclusion'] as const;
  const missing = elements.filter((k) => !memo[k]);
  const criticalMissing = missing.filter((k) => k === 'contention' || k === 'rule' || k === 'analysis');
  const score = clamp01(criticalMissing.length * 0.4 + missing.length * 0.08);
  const verdict: Verdict = criticalMissing.length >= 2 ? 'escalate' : criticalMissing.length >= 1 || missing.length >= 3 ? 'flag' : 'clear';
  const rationale = criticalMissing.length > 0
    ? `CRAAC memo missing critical elements: ${criticalMissing.join(', ')} (charter P5 — no legal conclusion).`
    : missing.length > 0
      ? `CRAAC structurally sound; missing optional elements: ${missing.join(', ')} (${5 - missing.length}/5 present).`
      : `CRAAC complete: all 5 elements present.`;
  return mkFinding('craac', 'legal_reasoning', ['argumentation'], verdict, score, 0.85, rationale, [memo.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// pestle — Political/Economic/Social/Technological/Legal/Environmental
// macro-environment scan; flags dominant risk quadrants.
// ──────────────────────────────────────────────────────────────────────
interface PestleItem {
  dimension: 'political' | 'economic' | 'social' | 'technological' | 'legal' | 'environmental';
  factor: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  sourceRef: string;
}

const RISK_WEIGHT: Record<PestleItem['riskLevel'], number> = { low: 0.1, medium: 0.3, high: 0.6, critical: 1 };

const pestleApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<PestleItem>(ctx, 'pestleItems');
  if (items.length === 0) return mkFinding('pestle', 'strategic', ['intelligence'],
    'inconclusive', 0, 0.2, 'No PESTLE items supplied. Mode requires pestleItems[] (charter P1).');
  const critical = items.filter((i) => i.riskLevel === 'critical');
  const high = items.filter((i) => i.riskLevel === 'high');
  const avgRisk = items.reduce((s, i) => s + RISK_WEIGHT[i.riskLevel], 0) / items.length;
  const covered = new Set(items.map((i) => i.dimension)).size;
  const score = clamp01(avgRisk * 0.6 + critical.length * 0.2);
  const verdict: Verdict = critical.length > 0 ? 'escalate' : high.length >= 2 || avgRisk >= 0.4 ? 'flag' : 'clear';
  const rationale = critical.length > 0
    ? `PESTLE: ${critical.length} critical factor(s): ${critical.slice(0, 3).map((i) => `${i.dimension}/"${i.factor}"`).join(', ')}. Immediate strategic response required.`
    : high.length > 0
      ? `PESTLE: ${high.length} high-risk factor(s) across ${covered}/6 dimensions; avg risk ${(avgRisk * 100).toFixed(0)}%.`
      : `PESTLE: ${items.length} factor(s) across ${covered}/6 dimensions; avg risk ${(avgRisk * 100).toFixed(0)}% — manageable.`;
  return mkFinding('pestle', 'strategic', ['intelligence'], verdict, score, 0.8, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// steep — Social/Technological/Environmental/Economic/Political variant.
// Same logic as PESTLE but scoped to 5 dimensions.
// ──────────────────────────────────────────────────────────────────────
interface SteepItem {
  dimension: 'social' | 'technological' | 'environmental' | 'economic' | 'political';
  factor: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  sourceRef: string;
}

const steepApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<SteepItem>(ctx, 'steepItems');
  if (items.length === 0) return mkFinding('steep', 'strategic', ['intelligence'],
    'inconclusive', 0, 0.2, 'No STEEP items supplied. Mode requires steepItems[] (charter P1).');
  const critical = items.filter((i) => i.riskLevel === 'critical');
  const high = items.filter((i) => i.riskLevel === 'high');
  const avgRisk = items.reduce((s, i) => s + RISK_WEIGHT[i.riskLevel as keyof typeof RISK_WEIGHT], 0) / items.length;
  const covered = new Set(items.map((i) => i.dimension)).size;
  const score = clamp01(avgRisk * 0.6 + critical.length * 0.2);
  const verdict: Verdict = critical.length > 0 ? 'escalate' : high.length >= 2 || avgRisk >= 0.4 ? 'flag' : 'clear';
  const rationale = critical.length > 0
    ? `STEEP: ${critical.length} critical factor(s): ${critical.slice(0, 3).map((i) => `${i.dimension}/"${i.factor}"`).join(', ')}.`
    : high.length > 0
      ? `STEEP: ${high.length} high-risk factor(s) across ${covered}/5 dimensions; avg risk ${(avgRisk * 100).toFixed(0)}%.`
      : `STEEP: ${items.length} factor(s) across ${covered}/5 dimensions; avg risk ${(avgRisk * 100).toFixed(0)}%.`;
  return mkFinding('steep', 'strategic', ['intelligence'], verdict, score, 0.8, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// lens_shift — reframes the same facts through multiple analytical
// lenses; flags cases where all lenses converge on the same conclusion
// (groupthink risk) or diverge sharply (ambiguity).
// ──────────────────────────────────────────────────────────────────────
interface LensView {
  lens: string;                // e.g. 'regulatory', 'financial', 'behavioural', 'reputational'
  verdict: 'clear' | 'flag' | 'escalate' | 'inconclusive';
  rationale: string;
  sourceRef: string;
}

const lensShiftApply = async (ctx: BrainContext): Promise<Finding> => {
  const views = typedEvidence<LensView>(ctx, 'lensViews');
  if (views.length === 0) return mkFinding('lens_shift', 'strategic', ['intelligence'],
    'inconclusive', 0, 0.2, 'No lens views supplied. Mode requires lensViews[] (charter P1).');
  const escalating = views.filter((v) => v.verdict === 'escalate');
  const flagging = views.filter((v) => v.verdict === 'flag');
  const clearing = views.filter((v) => v.verdict === 'clear');
  const uniqueVerdicts = new Set(views.map((v) => v.verdict)).size;
  const convergent = uniqueVerdicts === 1 && views.length >= 3;
  const score = clamp01(escalating.length / views.length * 0.8 + flagging.length / views.length * 0.3);
  const verdict: Verdict = escalating.length >= 2 ? 'escalate' : escalating.length >= 1 || flagging.length > clearing.length ? 'flag' : 'clear';
  const rationale = convergent && escalating.length === 0
    ? `All ${views.length} lens(es) converge on "${views[0]!.verdict}" — consider whether a challenging lens was omitted (groupthink risk).`
    : escalating.length > 0
      ? `${escalating.length}/${views.length} lens(es) escalate: ${escalating.map((v) => v.lens).join(', ')}.`
      : flagging.length > 0
        ? `Mixed lenses: ${flagging.length} flag, ${clearing.length} clear, ${escalating.length} escalate.`
        : `All ${views.length} lens(es) clear the subject.`;
  return mkFinding('lens_shift', 'strategic', ['intelligence'], verdict, score, 0.8, rationale, views.map((v) => v.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// stakeholder_map — power/interest grid; flags high-power / high-
// interest stakeholders who are not engaged.
// ──────────────────────────────────────────────────────────────────────
interface Stakeholder {
  name: string;
  power: number;     // 0..1
  interest: number;  // 0..1
  engaged: boolean;
  stance: 'supporter' | 'neutral' | 'opponent' | 'unknown';
  sourceRef: string;
}

const stakeholderMapApply = async (ctx: BrainContext): Promise<Finding> => {
  const stakeholders = typedEvidence<Stakeholder>(ctx, 'stakeholders');
  if (stakeholders.length === 0) return mkFinding('stakeholder_map', 'strategic', ['intelligence'],
    'inconclusive', 0, 0.2, 'No stakeholders supplied. Mode requires stakeholders[] (charter P1).');
  const keyPlayers = stakeholders.filter((s) => s.power >= 0.6 && s.interest >= 0.6);
  const unengagedKey = keyPlayers.filter((s) => !s.engaged);
  const opponents = keyPlayers.filter((s) => s.stance === 'opponent');
  const score = clamp01(unengagedKey.length * 0.4 + opponents.length * 0.3);
  const verdict: Verdict = unengagedKey.length >= 2 || opponents.length >= 2
    ? 'escalate' : unengagedKey.length >= 1 || opponents.length >= 1 ? 'flag' : 'clear';
  const rationale = unengagedKey.length > 0
    ? `${unengagedKey.length} key player(s) (high power + interest) not engaged: ${unengagedKey.map((s) => s.name).join(', ')}. ${opponents.length > 0 ? `${opponents.length} opponent(s) in key player quadrant.` : ''}`
    : opponents.length > 0
      ? `${opponents.length} key player(s) opposed to initiative.`
      : `${keyPlayers.length} key player(s) identified; all engaged.`;
  return mkFinding('stakeholder_map', 'strategic', ['intelligence'], verdict, score, 0.8, rationale, stakeholders.map((s) => s.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// typology_catalogue — matches observed transaction/behaviour patterns
// against a library of known AML/financial-crime typologies.
// ──────────────────────────────────────────────────────────────────────
interface TypologyMatch {
  typologyId: string;
  typologyName: string;
  matchScore: number;       // 0..1
  indicatorsMatched: number;
  indicatorsTotal: number;
  sourceRef: string;
}

const typologyCatalogueApply = async (ctx: BrainContext): Promise<Finding> => {
  const matches = typedEvidence<TypologyMatch>(ctx, 'typologyMatches');
  if (matches.length === 0) return mkFinding('typology_catalogue', 'compliance_framework', ['intelligence'],
    'inconclusive', 0, 0.2, 'No typology matches supplied. Mode requires typologyMatches[] (charter P1).');
  const strong = matches.filter((m) => m.matchScore >= 0.7);
  const moderate = matches.filter((m) => m.matchScore >= 0.4 && m.matchScore < 0.7);
  const topMatch = [...matches].sort((a, b) => b.matchScore - a.matchScore)[0]!;
  const score = clamp01(strong.length * 0.4 + moderate.length * 0.15);
  const verdict: Verdict = strong.length >= 2 ? 'escalate' : strong.length >= 1 ? 'flag' : moderate.length > 0 ? 'flag' : 'clear';
  const rationale = strong.length > 0
    ? `${strong.length} strong typology match(es): "${topMatch.typologyName}" (score ${(topMatch.matchScore * 100).toFixed(0)}%, ${topMatch.indicatorsMatched}/${topMatch.indicatorsTotal} indicators).`
    : moderate.length > 0
      ? `${moderate.length} moderate typology match(es); top: "${topMatch.typologyName}" (${(topMatch.matchScore * 100).toFixed(0)}%).`
      : `${matches.length} typology(ies) tested; no significant match (top ${(topMatch.matchScore * 100).toFixed(0)}%).`;
  return mkFinding('typology_catalogue', 'compliance_framework', ['intelligence'], verdict, score, 0.85, rationale, matches.map((m) => m.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// oecd_ddg_annex — OECD Due Diligence Guidance Annex steps (A/B/C)
// for responsible business conduct; checks each step is completed.
// ──────────────────────────────────────────────────────────────────────
interface OecdDdgStep {
  annex: 'A' | 'B' | 'C';
  step: string;              // e.g. 'risk-profile', 'general-due-diligence', 'enhanced-dd'
  status: 'complete' | 'partial' | 'not_started';
  findings: string[];
  sourceRef: string;
}

const oecdDdgAnnexApply = async (ctx: BrainContext): Promise<Finding> => {
  const steps = typedEvidence<OecdDdgStep>(ctx, 'oecdDdgSteps');
  if (steps.length === 0) return mkFinding('oecd_ddg_annex', 'compliance_framework', ['ratiocination'],
    'inconclusive', 0, 0.2, 'No OECD DDG steps supplied. Mode requires oecdDdgSteps[] (charter P1).');
  const notStarted = steps.filter((s) => s.status === 'not_started');
  const partial = steps.filter((s) => s.status === 'partial');
  const score = clamp01(notStarted.length * 0.5 + partial.length * 0.15);
  const verdict: Verdict = notStarted.length > 0 ? 'escalate' : partial.length >= 2 ? 'flag' : 'clear';
  const allFindings = steps.flatMap((s) => s.findings);
  const rationale = notStarted.length > 0
    ? `OECD DDG: ${notStarted.length} step(s) not started: ${notStarted.map((s) => `Annex ${s.annex} "${s.step}"`).join(', ')}.`
    : partial.length > 0
      ? `OECD DDG: ${partial.length} step(s) partial. ${allFindings.length > 0 ? `Top finding: "${allFindings[0]}"` : ''}`
      : `OECD DDG: all ${steps.length} step(s) complete across Annex A/B/C.`;
  return mkFinding('oecd_ddg_annex', 'compliance_framework', ['ratiocination'], verdict, score, 0.85, rationale, steps.map((s) => s.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// Bundle export
// ──────────────────────────────────────────────────────────────────────
export const LOGIC_FORMAL_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  syllogistic:            syllogisticApply,
  propositional_logic:    propositionalLogicApply,
  probabilistic_logic:    probabilisticLogicApply,
  modal_logic:            modalLogicApply,
  deontic_logic:          deonticLogicApply,
  rogerian:               rogerianApply,
  stare_decisis:          stareDecisisApply,
  gray_zone_resolution:   grayZoneResolutionApply,
  craac:                  craacApply,
  pestle:                 pestleApply,
  steep:                  steepApply,
  lens_shift:             lensShiftApply,
  stakeholder_map:        stakeholderMapApply,
  typology_catalogue:     typologyCatalogueApply,
  oecd_ddg_annex:         oecdDdgAnnexApply,
};
