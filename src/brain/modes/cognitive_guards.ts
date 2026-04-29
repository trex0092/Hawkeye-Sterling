// Hawkeye Sterling — cognitive-guard reasoning modes (PR #224 part 2).
//
// SIX cognitive-bias and hallucination countermeasures, promoted from
// stubs and new entries to real algorithms. The charter forbids bias and
// hallucinations (P1, P3, P5); these modes operationalise that policy by
// scanning rationales, evidence, and disposition trails for the named
// failure shapes.
//
//   - framing_check          — flags one-sided framing of risk indicators
//   - anchoring_avoidance    — flags decisions anchored on a salient prior
//   - availability_check     — flags reliance on memorable / recent cases
//   - loss_aversion_check    — flags disposition skew toward fear-of-loss
//   - hallucination_check    — every assertion in the rationale must trace to a supplied evidence id
//   - disparate_impact       — flags differential disposition across protected attributes
//
// Charter compliance
//   P1 (no assertion without basis): inconclusive when input is empty.
//   P3 (training-data ban): zero recall — only score what the caller hands.
//   P5 (legal-conclusion ban): rationales describe the failure shape, not
//     verdicts on individuals.

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
// framing_check — flags rationales that cite only RISK indicators while
// ignoring corroborating COUNTER-indicators (one-sided framing).
// ──────────────────────────────────────────────────────────────────────
interface FramingProbe {
  riskIndicators: number;          // count of pro-risk findings cited
  counterIndicators: number;       // count of mitigating findings cited
  totalAvailableIndicators: number;
  sourceRef: string;
}

const framingCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<FramingProbe>(ctx, 'framingProbe');
  if (!p) {
    return mkFinding('framing_check', 'cognitive_science', ['introspection', 'smartness'],
      'inconclusive', 0, 0.2,
      'No framing probe supplied. Mode requires framingProbe.');
  }
  const cited = p.riskIndicators + p.counterIndicators;
  if (cited === 0) {
    return mkFinding('framing_check', 'cognitive_science', ['introspection', 'smartness'],
      'inconclusive', 0, 0.2, 'Framing probe is empty — nothing to check.');
  }
  const counterShare = p.counterIndicators / cited;
  const ignoredRatio = p.totalAvailableIndicators > 0
    ? Math.max(0, (p.totalAvailableIndicators - cited) / p.totalAvailableIndicators)
    : 0;
  const oneSided = counterShare < 0.1 && p.riskIndicators >= 2;
  const ignoresMaterial = ignoredRatio >= 0.3;
  let score = 0;
  const reasons: string[] = [];
  if (oneSided) {
    score += 0.5; reasons.push(`one-sided framing: ${p.riskIndicators} risk vs ${p.counterIndicators} counter cited`);
  }
  if (ignoresMaterial) {
    score += 0.3; reasons.push(`ignores ${Math.round(ignoredRatio * 100)}% of available indicators`);
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = reasons.length === 0
    ? `Balanced framing: counter-indicators ${(counterShare * 100).toFixed(0)}% of cited; coverage of available indicators ${(100 - ignoredRatio * 100).toFixed(0)}%.`
    : `Framing bias: ${reasons.join('; ')}. Reframe with counter-evidence before disposition.`;
  return mkFinding('framing_check', 'epistemic_quality', ['reasoning', 'introspection'],
    verdict, score, 0.8, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// anchoring_avoidance — flags decisions where the disposition "anchors"
// on a salient prior (initial risk score, last-month KRI, an analyst's
// stated belief) without reweighting on new evidence.
// ──────────────────────────────────────────────────────────────────────
interface AnchorObservation {
  anchorValue: number;       // the initial / prior estimate (0..1)
  newEvidenceCount: number;  // number of new evidence items obtained AFTER the anchor was set
  finalDisposition: number;  // the operator's final score (0..1)
  newEvidenceMagnitude?: number | undefined; // qualitative magnitude (0..1) of how much new evidence should shift
  sourceRef: string;
}

const anchoringAvoidanceApply = async (ctx: BrainContext): Promise<Finding> => {
  const o = singleEvidence<AnchorObservation>(ctx, 'anchorObservation');
  if (!o) {
    return mkFinding('anchoring_avoidance', 'cognitive_science', ['introspection', 'smartness'],
      'inconclusive', 0, 0.2,
      'No anchor observation supplied. Mode requires anchorObservation.');
  }
  const drift = Math.abs(o.finalDisposition - o.anchorValue);
  const expectedDrift = (o.newEvidenceMagnitude ?? Math.min(1, o.newEvidenceCount * 0.1));
  const underUpdated = drift < expectedDrift * 0.3 && o.newEvidenceCount >= 3;
  const score = underUpdated ? clamp01(0.5 + (expectedDrift - drift)) : 0.05;
  const verdict: Verdict = underUpdated ? 'flag' : 'clear';
  const rationale = underUpdated
    ? `Anchoring suspected: ${o.newEvidenceCount} new evidence item(s) supplied (expected drift ~${expectedDrift.toFixed(2)}) but disposition only moved ${drift.toFixed(2)} from the anchor ${o.anchorValue.toFixed(2)}. Re-score from neutral prior.`
    : `Anchor at ${o.anchorValue.toFixed(2)}, final ${o.finalDisposition.toFixed(2)}: drift ${drift.toFixed(2)} consistent with new evidence.`;
  return mkFinding('anchoring_avoidance', 'cognitive_science', ['introspection', 'smartness'],
    verdict, score, 0.75, rationale, [o.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// availability_check — flags reliance on a recent / memorable case rather
// than the underlying base rate.
// ──────────────────────────────────────────────────────────────────────
interface AvailabilityProbe {
  recentCaseCited: boolean;
  recentCaseAgeDays: number;
  baseRateConsulted: boolean;
  baseRateValue?: number | undefined; // 0..1 prior probability
  decisionScore: number;              // 0..1 chosen by analyst
  sourceRef: string;
}

const availabilityCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<AvailabilityProbe>(ctx, 'availabilityProbe');
  if (!p) {
    return mkFinding('availability_check', 'cognitive_science', ['introspection', 'smartness'],
      'inconclusive', 0, 0.2,
      'No availability probe supplied. Mode requires availabilityProbe.');
  }
  const reasons: string[] = [];
  let score = 0;
  if (p.recentCaseCited && p.recentCaseAgeDays <= 30 && !p.baseRateConsulted) {
    score += 0.5; reasons.push('decision cites a single recent case without consulting base rate');
  }
  if (p.baseRateConsulted && p.baseRateValue != null) {
    const gap = Math.abs(p.decisionScore - p.baseRateValue);
    if (gap >= 0.4) {
      score += 0.25; reasons.push(`decision ${p.decisionScore.toFixed(2)} departs ${gap.toFixed(2)} from base rate ${p.baseRateValue.toFixed(2)}`);
    }
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = reasons.length === 0
    ? 'Availability heuristic not detected; decision consults base rate.'
    : `Availability heuristic: ${reasons.join('; ')}. Reanchor on the prior.`;
  return mkFinding('availability_check', 'cognitive_science', ['introspection', 'smartness'],
    verdict, score, 0.75, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// loss_aversion_check — flags disposition skew where the analyst escalates
// to avoid a small false-negative loss while ignoring a much larger
// false-positive operational cost (or vice versa).
// ──────────────────────────────────────────────────────────────────────
interface LossAversionProbe {
  estimatedFnCost: number;   // cost of false-negative (regulatory fine, reputational)
  estimatedFpCost: number;   // cost of false-positive (de-risking, lost client)
  chosenAction: 'escalate' | 'clear';
  baseRate: number;          // 0..1 prior of true positive
  sourceRef: string;
}

const lossAversionCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<LossAversionProbe>(ctx, 'lossAversionProbe');
  if (!p) {
    return mkFinding('loss_aversion_check', 'decision_theory', ['introspection', 'reasoning'],
      'inconclusive', 0, 0.2,
      'No loss-aversion probe supplied. Mode requires lossAversionProbe.');
  }
  // Expected utility threshold: escalate if  baseRate * fnCost > (1 - baseRate) * fpCost
  const expEscalate = p.baseRate * p.estimatedFnCost;
  const expClear    = (1 - p.baseRate) * p.estimatedFpCost;
  const optimal: 'escalate' | 'clear' = expEscalate > expClear ? 'escalate' : 'clear';
  const skewed = p.chosenAction !== optimal;
  const magnitude = Math.abs(expEscalate - expClear) / Math.max(expEscalate, expClear, 1);
  const score = skewed ? clamp01(0.3 + magnitude * 0.5) : 0.05;
  const verdict: Verdict = skewed && magnitude >= 0.5 ? 'flag' : 'clear';
  const rationale = skewed
    ? `Loss-aversion skew: optimal action under stated costs is "${optimal}" (expFN=${expEscalate.toFixed(0)}, expFP=${expClear.toFixed(0)}) but operator chose "${p.chosenAction}".`
    : `Decision aligned with expected-utility optimum (${optimal}).`;
  return mkFinding('loss_aversion_check', 'decision_theory', ['introspection', 'reasoning'],
    verdict, score, 0.7, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// hallucination_check — every claim in a rationale that names a specific
// fact, list, or article must cite a supplied evidence sourceRef. Claims
// without evidence backing are flagged as potential hallucinations
// (charter P1 + P3).
// ──────────────────────────────────────────────────────────────────────
interface RationaleClaim {
  claim: string;            // verbatim text segment
  claimType: 'fact' | 'list_match' | 'legal_article' | 'numeric' | 'other';
  citedEvidenceId?: string | undefined;
  sourceRef: string;
}

interface HallucinationProbe {
  rationaleId: string;
  claims: RationaleClaim[];
  suppliedEvidenceIds: string[];
  sourceRef: string;
}

const hallucinationCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<HallucinationProbe>(ctx, 'hallucinationProbe');
  if (!p) {
    return mkFinding('hallucination_check', 'epistemic_quality', ['reasoning', 'introspection'],
      'inconclusive', 0, 0.2,
      'No hallucination probe supplied. Mode requires hallucinationProbe.');
  }
  const supplied = new Set(p.suppliedEvidenceIds);
  // claims of these types MUST be cited
  const mustCite = new Set<RationaleClaim['claimType']>(['fact', 'list_match', 'legal_article', 'numeric']);
  const dangling: RationaleClaim[] = [];
  const danglingHigh: RationaleClaim[] = [];
  for (const c of p.claims) {
    const needsCite = mustCite.has(c.claimType);
    const cited = c.citedEvidenceId && supplied.has(c.citedEvidenceId);
    if (needsCite && !cited) {
      dangling.push(c);
      if (c.claimType === 'list_match' || c.claimType === 'legal_article') {
        danglingHigh.push(c);
      }
    }
  }
  const score = clamp01(danglingHigh.length * 0.4 + dangling.length * 0.1);
  const verdict: Verdict = danglingHigh.length > 0 ? 'escalate' : dangling.length > 0 ? 'flag' : 'clear';
  const rationale = danglingHigh.length > 0
    ? `${danglingHigh.length} HIGH-risk claim(s) lack evidence citation (${danglingHigh.map((c) => c.claimType).join(', ')}). Charter P1 + P3 violation — block disposition until grounded.`
    : dangling.length > 0
      ? `${dangling.length}/${p.claims.length} factual claim(s) lack a citable evidence id. Resupply or strike from rationale.`
      : `All ${p.claims.length} cite-required claim(s) trace to supplied evidence.`;
  return mkFinding('hallucination_check', 'epistemic_quality', ['reasoning', 'introspection'],
    verdict, score, 0.9, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// disparate_impact — flags differential disposition rates across protected
// attributes (nationality, gender, age band, etc). Implements a
// disparate-impact ratio test: ratio < 0.8 is the four-fifths rule trigger.
// ──────────────────────────────────────────────────────────────────────
interface AttributeBucket {
  attribute: string;          // e.g. "nationality:AE"
  total: number;
  flaggedOrEscalated: number;
}

interface DisparateImpactProbe {
  attributeFamily: string;    // e.g. "nationality"
  buckets: AttributeBucket[];
  sourceRef: string;
}

const disparateImpactApply = async (ctx: BrainContext): Promise<Finding> => {
  const probes = typedEvidence<DisparateImpactProbe>(ctx, 'disparateImpactProbes');
  if (probes.length === 0) {
    return mkFinding('disparate_impact', 'epistemic_quality', ['reasoning', 'introspection'],
      'inconclusive', 0, 0.2,
      'No disparate-impact probes supplied. Mode requires disparateImpactProbes[].');
  }
  const findings: string[] = [];
  let worstScore = 0;
  for (const probe of probes) {
    const rates = probe.buckets
      .filter((b) => b.total > 0)
      .map((b) => ({ key: b.attribute, rate: b.flaggedOrEscalated / b.total, total: b.total }));
    if (rates.length < 2) continue;
    const maxRate = Math.max(...rates.map((r) => r.rate));
    const minRate = Math.min(...rates.map((r) => r.rate));
    if (maxRate === 0) continue;
    const ratio = minRate / maxRate; // four-fifths rule: ratio >= 0.8 is the threshold
    if (ratio < 0.8) {
      const above = rates.filter((r) => r.rate >= maxRate * 0.95).map((r) => r.key);
      const below = rates.filter((r) => r.rate <= minRate * 1.05).map((r) => r.key);
      findings.push(`${probe.attributeFamily}: ratio ${ratio.toFixed(2)} (${below.join(',')} vs ${above.join(',')})`);
      worstScore = Math.max(worstScore, clamp01(0.5 + (0.8 - ratio) * 2));
    }
  }
  const verdict: Verdict = worstScore >= 0.5 ? 'escalate' : worstScore > 0 ? 'flag' : 'clear';
  const rationale = findings.length === 0
    ? `${probes.length} attribute family(s) checked; all within four-fifths rule (ratio >= 0.8).`
    : `Disparate-impact breach (four-fifths rule): ${findings.join('; ')}. Recalibrate model and audit training data.`;
  return mkFinding('disparate_impact', 'epistemic_quality', ['reasoning', 'introspection'],
    verdict, worstScore, 0.85, rationale, probes.map((p) => p.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// Bundle export
// ──────────────────────────────────────────────────────────────────────
export const COGNITIVE_GUARDS_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  framing_check:        framingCheckApply,
  anchoring_avoidance:  anchoringAvoidanceApply,
  availability_check:   availabilityCheckApply,
  loss_aversion_check:  lossAversionCheckApply,
  hallucination_check:  hallucinationCheckApply,
  disparate_impact:     disparateImpactApply,
};
