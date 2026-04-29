// Hawkeye Sterling — strategic / legal / governance reasoning modes (PR #226 batch 4).
//
// Fifteen stubs promoted to real algorithms:
//
//   Causal / epistemic
//   - adversarial_collaboration  — opponents jointly design a discriminating test
//   - counterexample_search      — actively hunt cases that break the hypothesis
//
//   Legal reasoning
//   - analogical_precedent       — reason by similarity to adjudicated cases
//   - policy_vs_rule             — bright-line rule vs purposive policy reasoning
//   - burden_of_proof            — who must prove what, to what standard
//
//   Sectoral typology
//   - art_dealer                 — private sales, free-port storage, anonymous buyers
//
//   Strategic
//   - minimum_viable_compliance  — smallest control set that satisfies the rule
//
//   Compliance framework
//   - retention_audit            — are records retained per statutory period?
//   - peer_benchmark             — compare controls against published peer practice
//   - risk_based_approach        — match control intensity to assessed risk
//   - five_pillars               — policies / CO / training / testing / CDD
//
//   Decision theory
//   - portfolio_view             — evaluate risks at aggregate, not case-by-case
//
//   Governance
//   - risk_appetite_check        — verify exposure stays inside board appetite
//   - exception_log              — named, justified, time-bound exceptions to policy
//
//   Cognitive science
//   - ooda                       — Observe → Orient → Decide → Act loop completeness
//
// Charter: every mode returns inconclusive when its evidence key is empty (P1).
// No external recall (P3). No legal conclusions (P5).

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
// adversarial_collaboration — opponents jointly propose and agree on a
// discriminating test that could falsify one of the competing hypotheses.
// ──────────────────────────────────────────────────────────────────────
interface AcTest {
  proposedBy: 'proponent' | 'opponent' | 'joint';
  test: string;
  discriminates: boolean;    // would this test distinguish H1 from H2?
  agreedBy: string[];        // parties who accepted this test
  sourceRef: string;
}

const adversarialCollaborationApply = async (ctx: BrainContext): Promise<Finding> => {
  const tests = typedEvidence<AcTest>(ctx, 'acTests');
  if (tests.length === 0) {
    return mkFinding('adversarial_collaboration', 'causal', ['argumentation', 'introspection'],
      'inconclusive', 0, 0.2,
      'No adversarial-collaboration tests supplied. Mode requires acTests[] (charter P1).');
  }
  const agreed = tests.filter((t) => t.agreedBy.length >= 2 && t.discriminates);
  const proposed = tests.filter((t) => t.discriminates && t.agreedBy.length < 2);
  const score = agreed.length === 0
    ? clamp01(0.5 + proposed.length * 0.1)
    : clamp01(0.1 / agreed.length);
  const verdict: Verdict = agreed.length === 0
    ? proposed.length > 0 ? 'flag' : 'escalate'
    : 'clear';
  const rationale = agreed.length > 0
    ? `${agreed.length} jointly-agreed discriminating test(s): "${agreed[0]!.test}"${agreed.length > 1 ? ` +${agreed.length - 1} more` : ''}. Collaboration converged.`
    : proposed.length > 0
      ? `${proposed.length} discriminating test(s) proposed but not yet agreed by both parties. Convene to reach agreement.`
      : `No discriminating test proposed or agreed. Disagreement cannot be settled without one.`;
  return mkFinding('adversarial_collaboration', 'causal', ['argumentation', 'introspection'],
    verdict, score, 0.75, rationale, tests.map((t) => t.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// counterexample_search — actively hunts instances that would falsify
// the working hypothesis. Flags any unrefuted strong counterexample.
// ──────────────────────────────────────────────────────────────────────
interface Counterexample {
  description: string;
  strength: 'strong' | 'moderate' | 'weak';
  refuted: boolean;
  refutationNote?: string | undefined;
  sourceRef: string;
}

const counterexampleSearchApply = async (ctx: BrainContext): Promise<Finding> => {
  const examples = typedEvidence<Counterexample>(ctx, 'counterexamples');
  if (examples.length === 0) {
    return mkFinding('counterexample_search', 'causal', ['reasoning', 'introspection'],
      'inconclusive', 0, 0.2,
      'No counterexamples supplied. Mode requires counterexamples[] (charter P1).');
  }
  const unrefuted = examples.filter((e) => !e.refuted);
  const strongUnrefuted = unrefuted.filter((e) => e.strength === 'strong');
  const moderateUnrefuted = unrefuted.filter((e) => e.strength === 'moderate');
  const score = clamp01(strongUnrefuted.length * 0.5 + moderateUnrefuted.length * 0.2);
  const verdict: Verdict = strongUnrefuted.length > 0
    ? 'escalate'
    : moderateUnrefuted.length > 0 ? 'flag' : 'clear';
  const rationale = strongUnrefuted.length > 0
    ? `${strongUnrefuted.length} strong unrefuted counterexample(s): "${strongUnrefuted[0]!.description}". Hypothesis requires revision.`
    : moderateUnrefuted.length > 0
      ? `${moderateUnrefuted.length} moderate unrefuted counterexample(s). Strengthen or narrow the hypothesis.`
      : `${examples.length} candidate counterexample(s) examined; all refuted or weak. Hypothesis stands.`;
  return mkFinding('counterexample_search', 'causal', ['reasoning', 'introspection'],
    verdict, score, 0.8, rationale, examples.map((e) => e.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// analogical_precedent — scores the strength of legal or regulatory
// analogy to adjudicated cases.
// ──────────────────────────────────────────────────────────────────────
interface Precedent {
  caseRef: string;
  similarity: number;         // 0..1 factual/legal similarity to current case
  supportsClaim: boolean;     // true = analogical support; false = distinguishes
  binding: boolean;           // binding precedent?
  sourceRef: string;
}

const analogicalPrecedentApply = async (ctx: BrainContext): Promise<Finding> => {
  const precedents = typedEvidence<Precedent>(ctx, 'precedents');
  if (precedents.length === 0) {
    return mkFinding('analogical_precedent', 'legal_reasoning', ['argumentation'],
      'inconclusive', 0, 0.2,
      'No precedents supplied. Mode requires precedents[] (charter P1, P5 — no legal conclusions).');
  }
  const supporting = precedents.filter((p) => p.supportsClaim && p.similarity >= 0.6);
  const binding = supporting.filter((p) => p.binding);
  const distinguishing = precedents.filter((p) => !p.supportsClaim && p.similarity >= 0.6);
  const score = clamp01(
    binding.length * 0.4 + supporting.length * 0.2 - distinguishing.length * 0.15,
  );
  const verdict: Verdict = binding.length > 0 && distinguishing.length === 0
    ? 'flag'
    : distinguishing.length > 0 && supporting.length === 0
      ? 'clear'
      : 'flag';
  const rationale = [
    `${precedents.length} precedent(s) reviewed.`,
    binding.length > 0 ? `${binding.length} binding analogous case(s) supporting claim.` : '',
    distinguishing.length > 0 ? `${distinguishing.length} case(s) materially distinguish current facts.` : '',
    'No legal conclusion drawn — refer to qualified counsel (charter P5).',
  ].filter(Boolean).join(' ');
  return mkFinding('analogical_precedent', 'legal_reasoning', ['argumentation'],
    verdict, score, 0.7, rationale, precedents.map((p) => p.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// policy_vs_rule — identifies whether interpretation is aligned with the
// reasoning type required (bright-line rule vs purposive policy).
// ──────────────────────────────────────────────────────────────────────
interface LegalQuestion {
  question: string;
  isRuleBased: boolean;                                           // true = bright-line rule
  interpretationApplied: 'literal' | 'purposive' | 'teleological';
  sourceRef: string;
}

const policyVsRuleApply = async (ctx: BrainContext): Promise<Finding> => {
  const q = singleEvidence<LegalQuestion>(ctx, 'legalQuestion');
  if (!q) {
    return mkFinding('policy_vs_rule', 'legal_reasoning', ['argumentation'],
      'inconclusive', 0, 0.2,
      'No legal question supplied. Mode requires legalQuestion (charter P1).');
  }
  const mismatch = q.isRuleBased && q.interpretationApplied !== 'literal';
  const purposed = !q.isRuleBased && q.interpretationApplied === 'literal';
  const score = mismatch || purposed ? 0.5 : 0.05;
  const verdict: Verdict = mismatch || purposed ? 'flag' : 'clear';
  const rationale = mismatch
    ? `Rule-based instrument ("${q.question}") interpreted ${q.interpretationApplied}. Bright-line rules demand literal application to prevent manipulation (charter P5).`
    : purposed
      ? `Policy objective ("${q.question}") interpreted literally. Purposive / teleological reading avoids technical evasion.`
      : `Interpretation method (${q.interpretationApplied}) is appropriate for this ${q.isRuleBased ? 'rule-based' : 'policy-based'} instrument.`;
  return mkFinding('policy_vs_rule', 'legal_reasoning', ['argumentation'],
    verdict, score, 0.8, rationale, [q.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// burden_of_proof — maps each claim to its bearer, standard, and
// whether the evidential burden is currently met.
// ──────────────────────────────────────────────────────────────────────
interface BurdenItem {
  claim: string;
  bearerRole: string;           // e.g. 'compliance officer', 'customer', 'regulator'
  standard: 'reasonable_suspicion' | 'balance' | 'clear_convincing' | 'beyond_doubt';
  evidenceMet: boolean | null;  // null = unassessed
  sourceRef: string;
}

const STANDARD_WEIGHT: Record<BurdenItem['standard'], number> = {
  reasonable_suspicion: 0.2,
  balance:              0.4,
  clear_convincing:     0.6,
  beyond_doubt:         0.8,
};

const burdenOfProofApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<BurdenItem>(ctx, 'burdenItems');
  if (items.length === 0) {
    return mkFinding('burden_of_proof', 'logic', ['argumentation'],
      'inconclusive', 0, 0.2,
      'No burden items supplied. Mode requires burdenItems[] (charter P1).');
  }
  const unmet = items.filter((i) => i.evidenceMet === false);
  const unassessed = items.filter((i) => i.evidenceMet === null);
  const worstUnmet = unmet.sort((a, b) => STANDARD_WEIGHT[b.standard] - STANDARD_WEIGHT[a.standard])[0];
  const score = clamp01(
    unmet.reduce((s, i) => s + STANDARD_WEIGHT[i.standard] * 0.5, 0) +
    unassessed.length * 0.1,
  );
  const verdict: Verdict = unmet.length > 0 ? 'flag' : unassessed.length > 0 ? 'flag' : 'clear';
  const rationale = unmet.length > 0
    ? `${unmet.length} claim(s) where burden not met (worst: "${worstUnmet?.claim}" — ${worstUnmet?.standard} standard, bearer: ${worstUnmet?.bearerRole}).`
    : unassessed.length > 0
      ? `${unassessed.length} claim(s) with unassessed burden — obtain evidence before concluding.`
      : `Evidential burden met on all ${items.length} claim(s).`;
  return mkFinding('burden_of_proof', 'logic', ['argumentation'],
    verdict, score, 0.8, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// art_dealer — AML typology: private art-market sales, free-port
// storage, anonymous buyers, valuation gaps, third-party payments.
// ──────────────────────────────────────────────────────────────────────
interface ArtTransaction {
  transactionType: 'private_sale' | 'auction' | 'consignment' | 'loan' | 'donation';
  buyerKnown: boolean;         // true = verified identity
  freePorted: boolean;         // stored in free-port / bonded warehouse
  valuationGapRatio: number;   // 1.0 = fair value; >2 = significant gap
  thirdPartyPayment: boolean;
  sourceRef: string;
}

const artDealerApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<ArtTransaction>(ctx, 'artTransactions');
  if (txns.length === 0) {
    return mkFinding('art_dealer', 'sectoral_typology', ['intelligence'],
      'inconclusive', 0, 0.2,
      'No art transactions supplied. Mode requires artTransactions[] (charter P1).');
  }
  let flags = 0;
  const reasons: string[] = [];
  const unknownBuyers = txns.filter((t) => !t.buyerKnown);
  if (unknownBuyers.length > 0) {
    flags += unknownBuyers.length * 2;
    reasons.push(`${unknownBuyers.length} transaction(s) with unverified buyer identity`);
  }
  const freePorted = txns.filter((t) => t.freePorted);
  if (freePorted.length > 0) {
    flags += freePorted.length;
    reasons.push(`${freePorted.length} item(s) in free-port / bonded storage`);
  }
  const gapped = txns.filter((t) => t.valuationGapRatio >= 2);
  if (gapped.length > 0) {
    flags += gapped.length * 2;
    reasons.push(`${gapped.length} transaction(s) with valuation gap ≥2×`);
  }
  const thirdParty = txns.filter((t) => t.thirdPartyPayment);
  if (thirdParty.length > 0) {
    flags += thirdParty.length * 2;
    reasons.push(`${thirdParty.length} third-party payment(s)`);
  }
  const privateSale = txns.filter((t) => t.transactionType === 'private_sale');
  if (privateSale.length > 0) {
    flags += privateSale.length;
    reasons.push(`${privateSale.length} private-sale transaction(s) (no public price discovery)`);
  }
  const score = clamp01(flags / 10);
  const verdict: Verdict = flags >= 6 ? 'escalate' : flags >= 3 ? 'flag' : 'clear';
  const rationale = reasons.length > 0
    ? `Art-dealer typology: ${reasons.join('; ')}. Total risk flags: ${flags}.`
    : `${txns.length} art transaction(s) reviewed — no significant typology indicators.`;
  return mkFinding('art_dealer', 'sectoral_typology', ['intelligence'],
    verdict, score, 0.8, rationale, txns.map((t) => t.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// minimum_viable_compliance — identifies the smallest control set that
// satisfies the applicable regulatory coverage threshold.
// ──────────────────────────────────────────────────────────────────────
interface ControlSet {
  id: string;
  controlCount: number;
  coveragePercent: number;   // 0..100
  gapRisks: string[];        // residual uncovered risks
  chosen: boolean;
  sourceRef: string;
}

const minimumViableComplianceApply = async (ctx: BrainContext): Promise<Finding> => {
  const sets = typedEvidence<ControlSet>(ctx, 'controlSets');
  if (sets.length === 0) {
    return mkFinding('minimum_viable_compliance', 'strategic', ['strong_brain'],
      'inconclusive', 0, 0.2,
      'No control sets supplied. Mode requires controlSets[] (charter P1).');
  }
  const THRESHOLD = 80; // % coverage required
  const viable = sets.filter((s) => s.coveragePercent >= THRESHOLD)
    .sort((a, b) => a.controlCount - b.controlCount);
  const chosen = sets.find((s) => s.chosen);
  const mvc = viable[0];
  if (!mvc) {
    return mkFinding('minimum_viable_compliance', 'strategic', ['strong_brain'],
      'escalate', 0.9, 0.75,
      `No control set reaches the ${THRESHOLD}% coverage threshold. Gap risks: ${sets.flatMap((s) => s.gapRisks).slice(0, 5).join(', ')}.`,
      sets.map((s) => s.sourceRef));
  }
  const chosenIsViable = chosen ? chosen.coveragePercent >= THRESHOLD : false;
  const chosenIsLeaner = chosen && mvc ? chosen.controlCount <= mvc.controlCount : false;
  const score = chosenIsViable && chosenIsLeaner ? 0.05 : 0.4;
  const verdict: Verdict = !chosenIsViable ? 'escalate' : !chosenIsLeaner ? 'flag' : 'clear';
  const rationale = !chosen
    ? `MVC identified: set "${mvc.id}" (${mvc.controlCount} controls, ${mvc.coveragePercent}% coverage). No chosen set flagged.`
    : !chosenIsViable
      ? `Chosen set "${chosen.id}" coverage ${chosen.coveragePercent}% < ${THRESHOLD}% threshold. Switch to MVC "${mvc.id}".`
      : !chosenIsLeaner
        ? `Chosen set "${chosen.id}" (${chosen.controlCount} controls) exceeds MVC "${mvc.id}" (${mvc.controlCount} controls) — over-engineered.`
        : `Chosen set "${chosen.id}" is minimum-viable (${mvc.controlCount} controls, ${mvc.coveragePercent}% coverage).`;
  return mkFinding('minimum_viable_compliance', 'strategic', ['strong_brain'],
    verdict, score, 0.8, rationale, sets.map((s) => s.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// retention_audit — checks whether required records are retained for
// the full statutory period and have not been prematurely destroyed.
// ──────────────────────────────────────────────────────────────────────
interface RetentionItem {
  recordType: string;
  requiredYears: number;
  actualAgeYears: number | null;  // null = record not found
  destroyed: boolean;
  sourceRef: string;
}

const retentionAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<RetentionItem>(ctx, 'retentionItems');
  if (items.length === 0) {
    return mkFinding('retention_audit', 'compliance_framework', ['strong_brain', 'introspection'],
      'inconclusive', 0, 0.2,
      'No retention items supplied. Mode requires retentionItems[] (charter P1).');
  }
  const prematurelyDestroyed = items.filter(
    (i) => i.destroyed && i.actualAgeYears !== null && i.actualAgeYears < i.requiredYears,
  );
  const missing = items.filter((i) => !i.destroyed && i.actualAgeYears === null);
  const expired = items.filter(
    (i) => !i.destroyed && i.actualAgeYears !== null && i.actualAgeYears > i.requiredYears * 1.5,
  );
  const score = clamp01(prematurelyDestroyed.length * 0.5 + missing.length * 0.3);
  const verdict: Verdict = prematurelyDestroyed.length > 0
    ? 'escalate'
    : missing.length > 0 ? 'flag' : 'clear';
  const rationale = prematurelyDestroyed.length > 0
    ? `${prematurelyDestroyed.length} record type(s) destroyed before statutory period: ${prematurelyDestroyed.map((i) => `"${i.recordType}" (${i.actualAgeYears}yr < ${i.requiredYears}yr required)`).join(', ')}.`
    : missing.length > 0
      ? `${missing.length} record type(s) not located: ${missing.map((i) => `"${i.recordType}"`).join(', ')}.`
      : expired.length > 0
        ? `${items.length} record type(s) within retention — ${expired.length} eligible for safe disposal.`
        : `All ${items.length} record type(s) retained within statutory periods.`;
  return mkFinding('retention_audit', 'compliance_framework', ['strong_brain', 'introspection'],
    verdict, score, 0.85, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// peer_benchmark — compares own control scores against published peer
// medians; flags significant underperformance.
// ──────────────────────────────────────────────────────────────────────
interface BenchmarkItem {
  control: string;
  peerMedianScore: number;  // 0..100
  ownScore: number;         // 0..100
  sourceRef: string;
}

const peerBenchmarkApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<BenchmarkItem>(ctx, 'benchmarkItems');
  if (items.length === 0) {
    return mkFinding('peer_benchmark', 'compliance_framework', ['data_analysis'],
      'inconclusive', 0, 0.2,
      'No benchmark items supplied. Mode requires benchmarkItems[] (charter P1).');
  }
  const lagging = items.filter((i) => i.ownScore < i.peerMedianScore - 15);
  const significantly = items.filter((i) => i.ownScore < i.peerMedianScore - 30);
  const avgGap = items.reduce((s, i) => s + (i.peerMedianScore - i.ownScore), 0) / items.length;
  const score = clamp01(avgGap / 50);
  const verdict: Verdict = significantly.length > 0
    ? 'escalate'
    : lagging.length > 0 ? 'flag' : 'clear';
  const rationale = significantly.length > 0
    ? `${significantly.length} control(s) >30 pts below peer median: ${significantly.slice(0, 3).map((i) => `"${i.control}" (own ${i.ownScore}, peer ${i.peerMedianScore})`).join(', ')}.`
    : lagging.length > 0
      ? `${lagging.length} control(s) 15–30 pts below peer median. Avg gap: ${avgGap.toFixed(1)} pts.`
      : `All ${items.length} control(s) at or above peer median (avg gap ${avgGap.toFixed(1)} pts).`;
  return mkFinding('peer_benchmark', 'compliance_framework', ['data_analysis'],
    verdict, score, 0.8, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// portfolio_view — aggregates risk scores across portfolio positions
// weighted by exposure; flags concentration and aggregate breach.
// ──────────────────────────────────────────────────────────────────────
interface PortfolioPosition {
  entityId: string;
  riskScore: number;    // 0..1
  exposure: number;     // weight (does not need to sum to 1; normalised internally)
  sourceRef: string;
}

const portfolioViewApply = async (ctx: BrainContext): Promise<Finding> => {
  const positions = typedEvidence<PortfolioPosition>(ctx, 'portfolioPositions');
  if (positions.length === 0) {
    return mkFinding('portfolio_view', 'decision_theory', ['strong_brain'],
      'inconclusive', 0, 0.2,
      'No portfolio positions supplied. Mode requires portfolioPositions[] (charter P1).');
  }
  const totalExposure = positions.reduce((s, p) => s + p.exposure, 0) || 1;
  const weightedRisk = positions.reduce((s, p) => s + (p.exposure / totalExposure) * p.riskScore, 0);
  const highRisk = positions.filter((p) => p.riskScore >= 0.7);
  const highRiskExposure = highRisk.reduce((s, p) => s + p.exposure, 0) / totalExposure;
  const score = clamp01(weightedRisk * 0.6 + highRiskExposure * 0.4);
  const verdict: Verdict = weightedRisk >= 0.6 || highRiskExposure >= 0.4
    ? 'escalate'
    : weightedRisk >= 0.4 || highRiskExposure >= 0.2 ? 'flag' : 'clear';
  const rationale = verdict !== 'clear'
    ? `Portfolio weighted risk: ${(weightedRisk * 100).toFixed(1)}%; high-risk exposure: ${(highRiskExposure * 100).toFixed(1)}% (${highRisk.length} position(s)). Aggregate view exceeds single-case assessment.`
    : `Portfolio weighted risk ${(weightedRisk * 100).toFixed(1)}%; high-risk exposure ${(highRiskExposure * 100).toFixed(1)}% — within tolerance.`;
  return mkFinding('portfolio_view', 'decision_theory', ['strong_brain'],
    verdict, score, 0.8, rationale, positions.map((p) => p.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// risk_appetite_check — verifies that a measured exposure is inside
// the board-approved appetite and escalation limits.
// ──────────────────────────────────────────────────────────────────────
interface RiskExposure {
  metricName: string;
  currentValue: number;
  appetiteLimit: number;
  escalationLimit: number;
  sourceRef: string;
}

const riskAppetiteCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const exp = singleEvidence<RiskExposure>(ctx, 'riskExposure');
  if (!exp) {
    return mkFinding('risk_appetite_check', 'governance', ['strong_brain'],
      'inconclusive', 0, 0.2,
      'No risk exposure supplied. Mode requires riskExposure (charter P1).');
  }
  const atEscalation = exp.currentValue >= exp.escalationLimit;
  const atAppetite = exp.currentValue >= exp.appetiteLimit;
  const ratio = exp.appetiteLimit > 0 ? exp.currentValue / exp.appetiteLimit : 0;
  const score = clamp01(ratio - 0.5);
  const verdict: Verdict = atEscalation ? 'escalate' : atAppetite ? 'flag' : 'clear';
  const rationale = atEscalation
    ? `"${exp.metricName}" = ${exp.currentValue} exceeds escalation limit ${exp.escalationLimit} (${(ratio * 100).toFixed(0)}% of appetite). Board notification required.`
    : atAppetite
      ? `"${exp.metricName}" = ${exp.currentValue} exceeds appetite limit ${exp.appetiteLimit} (${(ratio * 100).toFixed(0)}%). Remediation plan required.`
      : `"${exp.metricName}" = ${exp.currentValue} inside appetite ${exp.appetiteLimit} (${(ratio * 100).toFixed(0)}%).`;
  return mkFinding('risk_appetite_check', 'governance', ['strong_brain'],
    verdict, score, 0.9, rationale, [exp.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// risk_based_approach — checks that control intensity is proportionate
// to the assigned risk rating for each customer/segment.
// ──────────────────────────────────────────────────────────────────────
interface RbaMapping {
  segment: string;
  riskRating: 'low' | 'medium' | 'high' | 'very_high';
  assignedControlTier: 'simplified' | 'standard' | 'enhanced';
  sourceRef: string;
}

const ACCEPTABLE_TIERS: Record<RbaMapping['riskRating'], RbaMapping['assignedControlTier'][]> = {
  low:       ['simplified', 'standard'],
  medium:    ['standard', 'enhanced'],
  high:      ['enhanced'],
  very_high: ['enhanced'],
};

const riskBasedApproachApply = async (ctx: BrainContext): Promise<Finding> => {
  const mappings = typedEvidence<RbaMapping>(ctx, 'rbaMappings');
  if (mappings.length === 0) {
    return mkFinding('risk_based_approach', 'compliance_framework', ['strong_brain'],
      'inconclusive', 0, 0.2,
      'No RBA mappings supplied. Mode requires rbaMappings[] (charter P1).');
  }
  const miscategorised = mappings.filter(
    (m) => !ACCEPTABLE_TIERS[m.riskRating].includes(m.assignedControlTier),
  );
  const underControlled = miscategorised.filter(
    (m) => (m.riskRating === 'high' || m.riskRating === 'very_high') &&
            m.assignedControlTier !== 'enhanced',
  );
  const score = clamp01(underControlled.length * 0.5 + miscategorised.length * 0.2);
  const verdict: Verdict = underControlled.length > 0
    ? 'escalate'
    : miscategorised.length > 0 ? 'flag' : 'clear';
  const rationale = underControlled.length > 0
    ? `${underControlled.length} high/very-high risk segment(s) on insufficient controls: ${underControlled.slice(0, 3).map((m) => `"${m.segment}" (${m.riskRating} → ${m.assignedControlTier})`).join(', ')}.`
    : miscategorised.length > 0
      ? `${miscategorised.length} segment(s) with control/risk mismatch — review and regrade.`
      : `All ${mappings.length} segment(s) appropriately controlled for their risk rating.`;
  return mkFinding('risk_based_approach', 'compliance_framework', ['strong_brain'],
    verdict, score, 0.85, rationale, mappings.map((m) => m.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// exception_log — validates that policy exceptions are named, justified,
// approved, and time-bound; flags expired-open and unjustified exceptions.
// ──────────────────────────────────────────────────────────────────────
interface PolicyException {
  id: string;
  policy: string;
  justification: string | null;
  approvedBy: string | null;
  expiresAt: string | null;   // ISO date or null = perpetual
  status: 'open' | 'expired' | 'closed';
  sourceRef: string;
}

const exceptionLogApply = async (ctx: BrainContext): Promise<Finding> => {
  const exceptions = typedEvidence<PolicyException>(ctx, 'exceptions');
  if (exceptions.length === 0) {
    return mkFinding('exception_log', 'governance', ['ratiocination'],
      'inconclusive', 0, 0.2,
      'No exceptions supplied. Mode requires exceptions[] (charter P1).');
  }
  const expiredOpen = exceptions.filter((e) => e.status === 'expired' && e.expiresAt !== null);
  const unjustified = exceptions.filter((e) => !e.justification || !e.approvedBy);
  const perpetual = exceptions.filter(
    (e) => e.status === 'open' && e.expiresAt === null,
  );
  const score = clamp01(expiredOpen.length * 0.4 + unjustified.length * 0.3 + perpetual.length * 0.15);
  const verdict: Verdict = expiredOpen.length > 0 || unjustified.length > 0
    ? 'escalate'
    : perpetual.length > 0 ? 'flag' : 'clear';
  const rationale = expiredOpen.length > 0
    ? `${expiredOpen.length} exception(s) open past expiry date. Renew or close immediately.`
    : unjustified.length > 0
      ? `${unjustified.length} exception(s) lacking justification or approval signature.`
      : perpetual.length > 0
        ? `${perpetual.length} open exception(s) without an expiry date — add a sunset clause.`
        : `All ${exceptions.length} exception(s) are justified, approved, and within date.`;
  return mkFinding('exception_log', 'governance', ['ratiocination'],
    verdict, score, 0.85, rationale, exceptions.map((e) => e.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// five_pillars — AML programme five-pillar assessment.
// FATF R.18 / most national AML frameworks require: (1) policies,
// (2) designated compliance officer, (3) training, (4) independent
// testing, (5) CDD programme.
// ──────────────────────────────────────────────────────────────────────
interface PillarStatus {
  pillar: 'policies' | 'compliance_officer' | 'training' | 'independent_testing' | 'cdd';
  status: 'adequate' | 'partial' | 'absent';
  lastReviewDate: string | null;
  sourceRef: string;
}

const fivePillarsApply = async (ctx: BrainContext): Promise<Finding> => {
  const pillars = typedEvidence<PillarStatus>(ctx, 'pillars');
  if (pillars.length === 0) {
    return mkFinding('five_pillars', 'compliance_framework', ['strong_brain'],
      'inconclusive', 0, 0.2,
      'No pillar statuses supplied. Mode requires pillars[] (charter P1).');
  }
  const absent = pillars.filter((p) => p.status === 'absent');
  const partial = pillars.filter((p) => p.status === 'partial');
  const stale = pillars.filter(
    (p) => p.lastReviewDate === null && p.status !== 'absent',
  );
  const score = clamp01(absent.length * 0.4 + partial.length * 0.15 + stale.length * 0.05);
  const verdict: Verdict = absent.length > 0
    ? 'escalate'
    : partial.length >= 2 || stale.length >= 3 ? 'flag' : 'clear';
  const rationale = absent.length > 0
    ? `AML programme missing pillar(s): ${absent.map((p) => p.pillar).join(', ')}. Regulatory breach risk.`
    : partial.length > 0
      ? `${partial.length} pillar(s) partial: ${partial.map((p) => p.pillar).join(', ')}. ${stale.length > 0 ? `${stale.length} pillar(s) have no recorded review date.` : ''}`.trim()
      : `All ${pillars.length} AML programme pillars adequate.${stale.length > 0 ? ` ${stale.length} pillar(s) lack a recorded review date.` : ''}`;
  return mkFinding('five_pillars', 'compliance_framework', ['strong_brain'],
    verdict, score, 0.9, rationale, pillars.map((p) => p.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// ooda — Boyd's Observe → Orient → Decide → Act loop. Checks whether
// each phase is complete and identifies where decision lag occurs.
// ──────────────────────────────────────────────────────────────────────
interface OodaPhase {
  phase: 'observe' | 'orient' | 'decide' | 'act';
  complete: boolean;
  evidenceItems: number;   // pieces of information informing this phase
  lagDays: number;         // 0 = no lag
  sourceRef: string;
}

const OODA_ORDER: OodaPhase['phase'][] = ['observe', 'orient', 'decide', 'act'];

const oodaApply = async (ctx: BrainContext): Promise<Finding> => {
  const phases = typedEvidence<OodaPhase>(ctx, 'oodaPhases');
  if (phases.length === 0) {
    return mkFinding('ooda', 'cognitive_science', ['smartness'],
      'inconclusive', 0, 0.2,
      'No OODA phases supplied. Mode requires oodaPhases[] (charter P1).');
  }
  const phaseMap = new Map(phases.map((p) => [p.phase, p]));
  const missing = OODA_ORDER.filter((ph) => !phaseMap.has(ph));
  const incomplete = OODA_ORDER.filter((ph) => phaseMap.get(ph) && !phaseMap.get(ph)!.complete);
  const totalLag = phases.reduce((s, p) => s + p.lagDays, 0);
  const bottleneck = phases.sort((a, b) => b.lagDays - a.lagDays)[0];
  const score = clamp01(missing.length * 0.4 + incomplete.length * 0.25 + totalLag / 30 * 0.1);
  const verdict: Verdict = missing.length > 0
    ? 'escalate'
    : incomplete.length > 0 || totalLag >= 14 ? 'flag' : 'clear';
  const rationale = missing.length > 0
    ? `OODA loop missing phase(s): ${missing.join(', ')}. Loop cannot close without all four phases.`
    : incomplete.length > 0
      ? `Phase(s) incomplete: ${incomplete.join(', ')}. Total lag: ${totalLag} day(s). Bottleneck: ${bottleneck?.phase} (${bottleneck?.lagDays}d).`
      : `OODA loop complete (${OODA_ORDER.length} phases). Total lag: ${totalLag} day(s).${totalLag >= 7 ? ' Reduce orient-decide lag.' : ''}`;
  return mkFinding('ooda', 'cognitive_science', ['smartness'],
    verdict, score, 0.8, rationale, phases.map((p) => p.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// Bundle export
// ──────────────────────────────────────────────────────────────────────
export const STRATEGIC_LEGAL_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  adversarial_collaboration:  adversarialCollaborationApply,
  counterexample_search:      counterexampleSearchApply,
  analogical_precedent:       analogicalPrecedentApply,
  policy_vs_rule:             policyVsRuleApply,
  burden_of_proof:            burdenOfProofApply,
  art_dealer:                 artDealerApply,
  minimum_viable_compliance:  minimumViableComplianceApply,
  retention_audit:            retentionAuditApply,
  peer_benchmark:             peerBenchmarkApply,
  portfolio_view:             portfolioViewApply,
  risk_appetite_check:        riskAppetiteCheckApply,
  risk_based_approach:        riskBasedApproachApply,
  exception_log:              exceptionLogApply,
  five_pillars:               fivePillarsApply,
  ooda:                       oodaApply,
};
