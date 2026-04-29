// Hawkeye Sterling — market-integrity / governance / legal-reasoning modes (PR #227 batch 5).
//
// Fifteen stubs promoted to real algorithms:
//
//   Market-integrity typologies
//   - wash_trade              — matched self-trades inflating volume
//   - spoofing                — non-bona-fide orders placed then cancelled
//   - self_dealing            — benefit flows to controllers, not the entity
//   - circular_walk           — regulatory circular / guidance-note walk
//
//   Compliance frameworks
//   - three_lines_defence     — 1st / 2nd / 3rd line responsibilities
//   - wolfsberg_faq           — Wolfsberg AML / correspondent-banking FAQ walk
//
//   Legal / epistemic logic
//   - presumption_innocence   — default-deny hostile conclusions absent evidence
//   - saturation              — stop collecting when new evidence changes nothing
//   - toulmin                 — Claim → Ground → Warrant → Backing → Qualifier → Rebuttal
//   - irac                    — Issue → Rule → Application → Conclusion
//
//   Strategic
//   - swot                    — Strengths / Weaknesses / Opportunities / Threats
//   - war_game                — red-team vs blue-team adversarial simulation
//
//   Statistical / risk
//   - monte_carlo             — sample-based estimation under uncertainty
//   - cvar                    — Conditional Value-at-Risk (tail-loss expectation)
//
//   Cognitive / post-incident
//   - post_mortem             — reconstruct what actually went wrong after the fact
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
// wash_trade — detects matched self-trades: same beneficial owner on
// both sides, minimal economic risk transfer, volume inflation.
// ──────────────────────────────────────────────────────────────────────
interface WashLeg {
  tradeId: string;
  buySideEntityId: string;
  sellSideEntityId: string;
  sameBeneficialOwner: boolean;
  priceDiff: number;           // absolute price difference between legs
  timeDiffSeconds: number;     // seconds between matched legs
  notionalUsd: number;
  sourceRef: string;
}

const washTradeApply = async (ctx: BrainContext): Promise<Finding> => {
  const legs = typedEvidence<WashLeg>(ctx, 'washLegs');
  if (legs.length === 0) {
    return mkFinding('wash_trade', 'forensic', ['smartness'],
      'inconclusive', 0, 0.2,
      'No wash-trade legs supplied. Mode requires washLegs[] (charter P1).');
  }
  const matched = legs.filter(
    (l) => l.sameBeneficialOwner && l.priceDiff < 0.005 * (l.notionalUsd || 1) && l.timeDiffSeconds <= 300,
  );
  const totalNotional = matched.reduce((s, l) => s + l.notionalUsd, 0);
  const score = clamp01(matched.length * 0.4 + totalNotional / 1_000_000 * 0.2);
  const verdict: Verdict = matched.length >= 3 ? 'escalate' : matched.length >= 1 ? 'flag' : 'clear';
  const rationale = matched.length > 0
    ? `${matched.length} matched wash leg(s) detected: same beneficial owner on both sides, price diff <0.5%, within 5 min. Aggregate notional USD ${totalNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`
    : `${legs.length} trade leg(s) reviewed — no same-owner matched wash patterns found.`;
  return mkFinding('wash_trade', 'forensic', ['smartness'],
    verdict, score, 0.85, rationale, legs.map((l) => l.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// spoofing — non-bona-fide large orders placed to move price, then
// cancelled before execution (layering / quote-stuffing).
// ──────────────────────────────────────────────────────────────────────
interface SpooferOrder {
  orderId: string;
  side: 'buy' | 'sell';
  sizeUsd: number;
  cancelled: boolean;
  millisToCancel: number | null;   // null if not cancelled
  priceImpactBps: number;          // basis points market moved after placement
  executed: boolean;
  sourceRef: string;
}

const spoofingApply = async (ctx: BrainContext): Promise<Finding> => {
  const orders = typedEvidence<SpooferOrder>(ctx, 'spooferOrders');
  if (orders.length === 0) {
    return mkFinding('spoofing', 'forensic', ['smartness'],
      'inconclusive', 0, 0.2,
      'No spoofing orders supplied. Mode requires spooferOrders[] (charter P1).');
  }
  const rapidCancel = orders.filter(
    (o) => o.cancelled && o.millisToCancel !== null && o.millisToCancel <= 2000,
  );
  const impactful = rapidCancel.filter((o) => o.priceImpactBps >= 5);
  const score = clamp01(impactful.length * 0.35 + rapidCancel.length * 0.1);
  const verdict: Verdict = impactful.length >= 3 ? 'escalate' : impactful.length >= 1 ? 'flag' : 'clear';
  const rationale = impactful.length > 0
    ? `${impactful.length} rapid-cancel order(s) with ≥5bps price impact before cancellation (avg cancel ${Math.round(impactful.reduce((s, o) => s + (o.millisToCancel ?? 0), 0) / impactful.length)}ms). Layering / spoofing pattern.`
    : `${orders.length} order(s) reviewed — no spoofing pattern (rapid cancel + price impact) found.`;
  return mkFinding('spoofing', 'forensic', ['smartness'],
    verdict, score, 0.8, rationale, orders.map((o) => o.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// self_dealing — benefit flows to controllers, directors, or related
// parties rather than the entity itself; identifies undisclosed related-
// party transactions.
// ──────────────────────────────────────────────────────────────────────
interface SelfDealTxn {
  transactionId: string;
  counterpartyRole: 'director' | 'shareholder' | 'related_party' | 'employee' | 'third_party';
  disclosed: boolean;
  boardApproved: boolean | null;
  valueUsd: number;
  atMarketPrice: boolean | null;  // null = unknown
  sourceRef: string;
}

const selfDealingApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<SelfDealTxn>(ctx, 'selfDealTxns');
  if (txns.length === 0) {
    return mkFinding('self_dealing', 'forensic', ['smartness'],
      'inconclusive', 0, 0.2,
      'No related-party transactions supplied. Mode requires selfDealTxns[] (charter P1).');
  }
  const related = txns.filter(
    (t) => t.counterpartyRole !== 'third_party',
  );
  const undisclosed = related.filter((t) => !t.disclosed);
  const unapproved = related.filter((t) => t.boardApproved === false);
  const belowMarket = related.filter((t) => t.atMarketPrice === false);
  const totalValue = related.reduce((s, t) => s + t.valueUsd, 0);
  const score = clamp01(undisclosed.length * 0.5 + unapproved.length * 0.3 + belowMarket.length * 0.2);
  const verdict: Verdict = undisclosed.length > 0
    ? 'escalate'
    : unapproved.length > 0 || belowMarket.length > 0 ? 'flag' : 'clear';
  const rationale = undisclosed.length > 0
    ? `${undisclosed.length} undisclosed related-party transaction(s) totalling USD ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}. Breach of fiduciary / disclosure duty.`
    : unapproved.length > 0
      ? `${unapproved.length} related-party transaction(s) not board-approved; ${belowMarket.length} below-market pricing.`
      : `${related.length} related-party transaction(s) disclosed and approved at market price.`;
  return mkFinding('self_dealing', 'forensic', ['smartness'],
    verdict, score, 0.85, rationale, txns.map((t) => t.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// circular_walk — walks a sequence of supervisor circulars / guidance
// notes in issuance order; flags gaps and conflicting obligations.
// ──────────────────────────────────────────────────────────────────────
interface RegulatoryCircular {
  circularId: string;
  issuedAt: string;     // ISO date
  topic: string;
  supersedes: string[]; // IDs of circulars this one replaces
  obligationsMet: boolean | null;
  sourceRef: string;
}

const circularWalkApply = async (ctx: BrainContext): Promise<Finding> => {
  const circulars = typedEvidence<RegulatoryCircular>(ctx, 'regulatoryCirculars');
  if (circulars.length === 0) {
    return mkFinding('circular_walk', 'compliance_framework', ['ratiocination'],
      'inconclusive', 0, 0.2,
      'No regulatory circulars supplied. Mode requires regulatoryCirculars[] (charter P1).');
  }
  const sorted = [...circulars].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  const unmet = sorted.filter((c) => c.obligationsMet === false);
  const unassessed = sorted.filter((c) => c.obligationsMet === null);
  const supersededStillApplied = sorted.filter(
    (c) => sorted.some((later) => later.supersedes.includes(c.circularId)) && c.obligationsMet !== false,
  );
  const score = clamp01(unmet.length * 0.4 + supersededStillApplied.length * 0.2 + unassessed.length * 0.1);
  const verdict: Verdict = unmet.length > 0
    ? 'escalate'
    : supersededStillApplied.length > 0 || unassessed.length >= 2 ? 'flag' : 'clear';
  const rationale = unmet.length > 0
    ? `${unmet.length} circular(s) with unmet obligations: ${unmet.slice(0, 3).map((c) => `${c.circularId} (${c.topic})`).join(', ')}.`
    : supersededStillApplied.length > 0
      ? `${supersededStillApplied.length} circular(s) superseded but still being applied — update to current version.`
      : unassessed.length > 0
        ? `${unassessed.length} circular(s) not assessed for obligation compliance.`
        : `${sorted.length} circular(s) walked in issuance order — all obligations met.`;
  return mkFinding('circular_walk', 'compliance_framework', ['ratiocination'],
    verdict, score, 0.8, rationale, circulars.map((c) => c.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// three_lines_defence — assesses whether 1st line (business), 2nd line
// (compliance/risk), and 3rd line (internal audit) responsibilities are
// clearly assigned and functioning.
// ──────────────────────────────────────────────────────────────────────
interface LineAssessment {
  line: 1 | 2 | 3;
  responsibilitiesDefined: boolean;
  independenceAdequate: boolean;
  reportingLineClean: boolean;
  lastReviewDate: string | null;
  sourceRef: string;
}

const threeLinesDefenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const lines = typedEvidence<LineAssessment>(ctx, 'lineAssessments');
  if (lines.length === 0) {
    return mkFinding('three_lines_defence', 'compliance_framework', ['strong_brain'],
      'inconclusive', 0, 0.2,
      'No line assessments supplied. Mode requires lineAssessments[] (charter P1).');
  }
  const broken = lines.filter(
    (l) => !l.responsibilitiesDefined || !l.independenceAdequate || !l.reportingLineClean,
  );
  const undefined = lines.filter((l) => !l.responsibilitiesDefined);
  const score = clamp01(undefined.length * 0.5 + broken.length * 0.25);
  const verdict: Verdict = undefined.length > 0
    ? 'escalate'
    : broken.length > 0 ? 'flag' : 'clear';
  const rationale = undefined.length > 0
    ? `Line ${undefined.map((l) => l.line).join('/')} responsibilities not defined. Three-lines model non-functional.`
    : broken.length > 0
      ? `${broken.length} line(s) with independence or reporting-line weakness: ${broken.map((l) => `Line ${l.line}`).join(', ')}.`
      : `All three lines defined, independent, and reporting cleanly.`;
  return mkFinding('three_lines_defence', 'compliance_framework', ['strong_brain'],
    verdict, score, 0.85, rationale, lines.map((l) => l.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// wolfsberg_faq — walks Wolfsberg Group AML / correspondent-banking FAQ
// checklist items; flags gaps in the programme.
// ──────────────────────────────────────────────────────────────────────
interface WolfsbergItem {
  principle: string;      // e.g. 'CDD', 'EDD', 'PEP', 'Correspondent', 'STR'
  status: 'compliant' | 'gap' | 'not_assessed';
  gapDescription: string | null;
  sourceRef: string;
}

const wolfsbergFaqApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<WolfsbergItem>(ctx, 'wolfsbergItems');
  if (items.length === 0) {
    return mkFinding('wolfsberg_faq', 'compliance_framework', ['intelligence'],
      'inconclusive', 0, 0.2,
      'No Wolfsberg items supplied. Mode requires wolfsbergItems[] (charter P1).');
  }
  const gaps = items.filter((i) => i.status === 'gap');
  const unassessed = items.filter((i) => i.status === 'not_assessed');
  const score = clamp01(gaps.length * 0.4 + unassessed.length * 0.1);
  const verdict: Verdict = gaps.length >= 3 ? 'escalate' : gaps.length >= 1 ? 'flag' : 'clear';
  const rationale = gaps.length > 0
    ? `${gaps.length} Wolfsberg principle gap(s): ${gaps.slice(0, 4).map((i) => `"${i.principle}"${i.gapDescription ? ` (${i.gapDescription})` : ''}`).join(', ')}.`
    : unassessed.length > 0
      ? `${unassessed.length} Wolfsberg principle(s) not yet assessed.`
      : `All ${items.length} Wolfsberg principles assessed as compliant.`;
  return mkFinding('wolfsberg_faq', 'compliance_framework', ['intelligence'],
    verdict, score, 0.8, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// presumption_innocence — default-deny hostile conclusions absent
// affirmative evidence; flags conclusions that over-reach the evidence.
// ──────────────────────────────────────────────────────────────────────
interface PresumptionCheck {
  conclusion: string;
  supportingEvidenceCount: number;
  evidenceStrength: 'none' | 'weak' | 'moderate' | 'strong';
  rebuttalEvidenceCount: number;
  sourceRef: string;
}

const STRENGTH_SCORE: Record<PresumptionCheck['evidenceStrength'], number> = {
  none:     0,
  weak:     0.2,
  moderate: 0.5,
  strong:   0.8,
};

const presumptionInnocenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const checks = typedEvidence<PresumptionCheck>(ctx, 'presumptionChecks');
  if (checks.length === 0) {
    return mkFinding('presumption_innocence', 'logic', ['argumentation'],
      'inconclusive', 0, 0.2,
      'No presumption checks supplied. Mode requires presumptionChecks[] (charter P1).');
  }
  const overReach = checks.filter(
    (c) => c.evidenceStrength === 'none' || c.evidenceStrength === 'weak',
  );
  const balanced = checks.filter(
    (c) => c.evidenceStrength === 'moderate' || c.evidenceStrength === 'strong',
  );
  const avgStrength = checks.reduce((s, c) => s + STRENGTH_SCORE[c.evidenceStrength], 0) / checks.length;
  const score = clamp01(overReach.length * 0.5);
  const verdict: Verdict = overReach.some((c) => c.evidenceStrength === 'none')
    ? 'escalate'
    : overReach.length > 0 ? 'flag' : 'clear';
  const rationale = overReach.length > 0
    ? `${overReach.length} conclusion(s) reached without sufficient affirmative evidence: "${overReach[0]!.conclusion}"${overReach.length > 1 ? ` +${overReach.length - 1} more` : ''}. Presumption of innocence requires stronger basis.`
    : `All ${checks.length} conclusion(s) supported by ${balanced.length > 0 ? 'moderate or strong' : 'adequate'} evidence (avg strength ${(avgStrength * 100).toFixed(0)}%).`;
  return mkFinding('presumption_innocence', 'logic', ['argumentation'],
    verdict, score, 0.8, rationale, checks.map((c) => c.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// saturation — detects when incremental evidence stops meaningfully
// shifting the conclusion; flags premature or continued collection.
// ──────────────────────────────────────────────────────────────────────
interface EvidenceRound {
  round: number;
  conclusionScore: number;    // 0..1 composite score after this round
  newEvidenceItems: number;
  sourceRef: string;
}

const saturationApply = async (ctx: BrainContext): Promise<Finding> => {
  const rounds = typedEvidence<EvidenceRound>(ctx, 'evidenceRounds');
  if (rounds.length === 0) {
    return mkFinding('saturation', 'logic', ['reasoning', 'introspection'],
      'inconclusive', 0, 0.2,
      'No evidence rounds supplied. Mode requires evidenceRounds[] (charter P1).');
  }
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  const deltas = sorted.slice(1).map((r, i) => Math.abs(r.conclusionScore - sorted[i]!.conclusionScore));
  const avgDelta = deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 1;
  const lastDelta = deltas[deltas.length - 1] ?? 1;
  const saturated = lastDelta < 0.02 && sorted.length >= 3;
  const unstable = avgDelta > 0.15;
  const score = saturated ? 0.05 : clamp01(avgDelta);
  const verdict: Verdict = unstable ? 'flag' : 'clear';
  const rationale = saturated
    ? `Evidence saturated after ${sorted.length} round(s): last delta ${(lastDelta * 100).toFixed(1)}% — conclusion stable. No further collection needed.`
    : unstable
      ? `Evidence still shifting (avg delta ${(avgDelta * 100).toFixed(1)}% per round). ${sorted.length} round(s) collected; continue until stable.`
      : `${sorted.length} evidence round(s): average shift ${(avgDelta * 100).toFixed(1)}% — approaching saturation.`;
  return mkFinding('saturation', 'logic', ['reasoning', 'introspection'],
    verdict, score, 0.75, rationale, rounds.map((r) => r.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// toulmin — scores argument completeness against the Toulmin model:
// Claim / Ground / Warrant / Backing / Qualifier / Rebuttal.
// ──────────────────────────────────────────────────────────────────────
interface ToulminArgument {
  claim: string | null;
  ground: string | null;
  warrant: string | null;
  backing: string | null;
  qualifier: string | null;
  rebuttal: string | null;
  sourceRef: string;
}

const toulminApply = async (ctx: BrainContext): Promise<Finding> => {
  const arg = singleEvidence<ToulminArgument>(ctx, 'toulminArgument');
  if (!arg) {
    return mkFinding('toulmin', 'legal_reasoning', ['argumentation'],
      'inconclusive', 0, 0.2,
      'No Toulmin argument supplied. Mode requires toulminArgument (charter P1).');
  }
  const components: Array<[string, string | null]> = [
    ['claim',     arg.claim],
    ['ground',    arg.ground],
    ['warrant',   arg.warrant],
    ['backing',   arg.backing],
    ['qualifier', arg.qualifier],
    ['rebuttal',  arg.rebuttal],
  ];
  const missing = components.filter(([, v]) => !v).map(([k]) => k);
  const criticalMissing = missing.filter((k) => k === 'claim' || k === 'ground' || k === 'warrant');
  const score = clamp01(criticalMissing.length * 0.4 + missing.length * 0.08);
  const verdict: Verdict = criticalMissing.length >= 2
    ? 'escalate'
    : criticalMissing.length === 1 || missing.length >= 3 ? 'flag' : 'clear';
  const rationale = criticalMissing.length > 0
    ? `Toulmin argument missing critical element(s): ${criticalMissing.join(', ')}. Argument cannot stand without claim, ground, and warrant.`
    : missing.length > 0
      ? `Toulmin argument structurally sound but missing optional element(s): ${missing.join(', ')} (${6 - missing.length}/6 components present).`
      : `Toulmin argument complete: all 6 components present (claim, ground, warrant, backing, qualifier, rebuttal).`;
  return mkFinding('toulmin', 'legal_reasoning', ['argumentation'],
    verdict, score, 0.85, rationale, [arg.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// irac — Issue / Rule / Application / Conclusion legal memo structure.
// Flags incomplete or conclusion-first reasoning.
// ──────────────────────────────────────────────────────────────────────
interface IracMemo {
  issue: string | null;
  rule: string | null;
  application: string | null;
  conclusion: string | null;
  conclusionFirstFlag: boolean;  // true when conclusion was stated before rule/application
  sourceRef: string;
}

const iracApply = async (ctx: BrainContext): Promise<Finding> => {
  const memo = singleEvidence<IracMemo>(ctx, 'iracMemo');
  if (!memo) {
    return mkFinding('irac', 'legal_reasoning', ['argumentation'],
      'inconclusive', 0, 0.2,
      'No IRAC memo supplied. Mode requires iracMemo (charter P1).');
  }
  const missing = ['issue', 'rule', 'application', 'conclusion'].filter(
    (k) => !memo[k as keyof IracMemo],
  );
  const score = clamp01(missing.length * 0.3 + (memo.conclusionFirstFlag ? 0.3 : 0));
  const verdict: Verdict = missing.length >= 2 || (memo.conclusionFirstFlag && missing.length >= 1)
    ? 'escalate'
    : missing.length === 1 || memo.conclusionFirstFlag ? 'flag' : 'clear';
  const rationale = missing.length > 0
    ? `IRAC memo missing: ${missing.join(', ')}. Legal reasoning incomplete (P5 — no conclusion drawn).`
    : memo.conclusionFirstFlag
      ? `IRAC structure intact but conclusion stated before rule/application — reverse-engineered reasoning; verify logical chain.`
      : `IRAC complete: issue identified, rule stated, application reasoned, conclusion derived.`;
  return mkFinding('irac', 'legal_reasoning', ['argumentation'],
    verdict, score, 0.85, rationale, [memo.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// swot — Strengths / Weaknesses / Opportunities / Threats analysis.
// Flags imbalanced assessments or dominant threat profile.
// ──────────────────────────────────────────────────────────────────────
interface SwotItem {
  quadrant: 'strength' | 'weakness' | 'opportunity' | 'threat';
  description: string;
  severity: number;    // 0..1
  sourceRef: string;
}

const swotApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<SwotItem>(ctx, 'swotItems');
  if (items.length === 0) {
    return mkFinding('swot', 'strategic', ['intelligence'],
      'inconclusive', 0, 0.2,
      'No SWOT items supplied. Mode requires swotItems[] (charter P1).');
  }
  const byQ = {
    strength:    items.filter((i) => i.quadrant === 'strength'),
    weakness:    items.filter((i) => i.quadrant === 'weakness'),
    opportunity: items.filter((i) => i.quadrant === 'opportunity'),
    threat:      items.filter((i) => i.quadrant === 'threat'),
  };
  const missing = Object.entries(byQ).filter(([, v]) => v.length === 0).map(([k]) => k);
  const threatScore = byQ.threat.reduce((s, i) => s + i.severity, 0) / Math.max(byQ.threat.length, 1);
  const weakScore   = byQ.weakness.reduce((s, i) => s + i.severity, 0) / Math.max(byQ.weakness.length, 1);
  const netRisk = clamp01((threatScore + weakScore) / 2 - (byQ.strength.length > 0 ? 0.2 : 0));
  const verdict: Verdict = netRisk >= 0.6 || missing.length >= 2
    ? 'escalate'
    : netRisk >= 0.4 || missing.length === 1 ? 'flag' : 'clear';
  const rationale = missing.length >= 2
    ? `SWOT incomplete — missing quadrant(s): ${missing.join(', ')}. Analysis unbalanced.`
    : netRisk >= 0.4
      ? `SWOT net risk ${(netRisk * 100).toFixed(0)}%: threat severity ${(threatScore * 100).toFixed(0)}%, weakness severity ${(weakScore * 100).toFixed(0)}%. ${byQ.threat.length} threat(s), ${byQ.weakness.length} weakness(es).`
      : `SWOT balanced: ${items.length} items across all 4 quadrants; net risk ${(netRisk * 100).toFixed(0)}%.`;
  return mkFinding('swot', 'strategic', ['intelligence'],
    verdict, netRisk, 0.75, rationale, items.map((i) => i.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// war_game — red-team vs blue-team adversarial simulation; flags when
// red team consistently wins or blue team lacks counter-measures.
// ──────────────────────────────────────────────────────────────────────
interface WarGameRound {
  round: number;
  redAction: string;
  blueCounterMeasure: string | null;
  redSucceeded: boolean;
  sourceRef: string;
}

const warGameApply = async (ctx: BrainContext): Promise<Finding> => {
  const rounds = typedEvidence<WarGameRound>(ctx, 'warGameRounds');
  if (rounds.length === 0) {
    return mkFinding('war_game', 'strategic', ['deep_thinking'],
      'inconclusive', 0, 0.2,
      'No war-game rounds supplied. Mode requires warGameRounds[] (charter P1).');
  }
  const redWins = rounds.filter((r) => r.redSucceeded);
  const uncountered = rounds.filter((r) => !r.blueCounterMeasure);
  const winRate = redWins.length / rounds.length;
  const score = clamp01(winRate * 0.7 + uncountered.length / rounds.length * 0.3);
  const verdict: Verdict = winRate >= 0.6 ? 'escalate' : winRate >= 0.35 || uncountered.length > 0 ? 'flag' : 'clear';
  const rationale = winRate >= 0.6
    ? `Red team won ${redWins.length}/${rounds.length} rounds (${(winRate * 100).toFixed(0)}%). Blue team defences inadequate — escalate to remediation.`
    : winRate >= 0.35
      ? `Red team won ${redWins.length}/${rounds.length} rounds. ${uncountered.length} round(s) had no blue counter-measure.`
      : `Blue team held: red team won only ${redWins.length}/${rounds.length} rounds (${(winRate * 100).toFixed(0)}%). Defences adequate.`;
  return mkFinding('war_game', 'strategic', ['deep_thinking'],
    verdict, score, 0.8, rationale, rounds.map((r) => r.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// monte_carlo — sample-based estimation under uncertainty; flags when
// the 95th-percentile outcome exceeds a tolerance threshold.
// ──────────────────────────────────────────────────────────────────────
interface MonteCarloResult {
  metric: string;
  p5: number;
  p50: number;
  p95: number;
  tolerance: number;    // maximum acceptable p95 value
  unit: string;
  sourceRef: string;
}

const monteCarloApply = async (ctx: BrainContext): Promise<Finding> => {
  const results = typedEvidence<MonteCarloResult>(ctx, 'monteCarloResults');
  if (results.length === 0) {
    return mkFinding('monte_carlo', 'decision_theory', ['data_analysis', 'deep_thinking'],
      'inconclusive', 0, 0.2,
      'No Monte Carlo results supplied. Mode requires monteCarloResults[] (charter P1).');
  }
  const breaching = results.filter((r) => r.p95 > r.tolerance);
  const marginal = results.filter((r) => r.p95 > r.tolerance * 0.8 && r.p95 <= r.tolerance);
  const score = clamp01(breaching.length * 0.5 + marginal.length * 0.15);
  const verdict: Verdict = breaching.length > 0 ? 'escalate' : marginal.length > 0 ? 'flag' : 'clear';
  const rationale = breaching.length > 0
    ? `${breaching.length} metric(s) breach tolerance at p95: ${breaching.slice(0, 3).map((r) => `"${r.metric}" p95=${r.p95.toLocaleString()} vs tolerance ${r.tolerance.toLocaleString()} ${r.unit}`).join('; ')}.`
    : marginal.length > 0
      ? `${marginal.length} metric(s) within 20% of p95 tolerance — watch list.`
      : `All ${results.length} metric(s) within p95 tolerance.`;
  return mkFinding('monte_carlo', 'decision_theory', ['data_analysis', 'deep_thinking'],
    verdict, score, 0.8, rationale, results.map((r) => r.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// cvar — Conditional Value-at-Risk: expected loss in the worst (1-α)%
// of outcomes; flags when CVaR exceeds the risk budget.
// ──────────────────────────────────────────────────────────────────────
interface CVaRAssessment {
  portfolio: string;
  confidenceLevel: number;   // e.g. 0.95 for 95%
  var: number;               // Value-at-Risk at the confidence level
  cvar: number;              // expected loss beyond VaR (Conditional VaR)
  riskBudget: number;        // maximum acceptable CVaR
  currency: string;
  sourceRef: string;
}

const cvarApply = async (ctx: BrainContext): Promise<Finding> => {
  const assessments = typedEvidence<CVaRAssessment>(ctx, 'cvarAssessments');
  if (assessments.length === 0) {
    return mkFinding('cvar', 'decision_theory', ['data_analysis'],
      'inconclusive', 0, 0.2,
      'No CVaR assessments supplied. Mode requires cvarAssessments[] (charter P1).');
  }
  const breaching = assessments.filter((a) => a.cvar > a.riskBudget);
  const marginal = assessments.filter((a) => a.cvar > a.riskBudget * 0.85 && a.cvar <= a.riskBudget);
  const score = clamp01(breaching.reduce((s, a) => s + (a.cvar / a.riskBudget - 1) * 0.5, 0));
  const verdict: Verdict = breaching.length > 0 ? 'escalate' : marginal.length > 0 ? 'flag' : 'clear';
  const rationale = breaching.length > 0
    ? `${breaching.length} portfolio(s) exceed CVaR risk budget: ${breaching.slice(0, 2).map((a) => `"${a.portfolio}" CVaR ${a.cvar.toLocaleString()} ${a.currency} vs budget ${a.riskBudget.toLocaleString()} (${a.confidenceLevel * 100}% CI)`).join('; ')}.`
    : marginal.length > 0
      ? `${marginal.length} portfolio(s) within 15% of CVaR budget — monitor closely.`
      : `All ${assessments.length} portfolio(s) within CVaR risk budget.`;
  return mkFinding('cvar', 'decision_theory', ['data_analysis'],
    verdict, score, 0.85, rationale, assessments.map((a) => a.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// post_mortem — reconstructs what went wrong after an incident;
// identifies root causes, missed signals, and control failures.
// ──────────────────────────────────────────────────────────────────────
interface PostMortemFinding {
  incidentId: string;
  rootCauses: string[];
  missedSignals: string[];
  controlFailures: string[];
  timeToDetectDays: number | null;
  timeToContainDays: number | null;
  preventable: boolean;
  sourceRef: string;
}

const postMortemApply = async (ctx: BrainContext): Promise<Finding> => {
  const pm = singleEvidence<PostMortemFinding>(ctx, 'postMortem');
  if (!pm) {
    return mkFinding('post_mortem', 'cognitive_science', ['deep_thinking', 'introspection'],
      'inconclusive', 0, 0.2,
      'No post-mortem finding supplied. Mode requires postMortem (charter P1).');
  }
  const severityScore = clamp01(
    pm.rootCauses.length * 0.15 +
    pm.controlFailures.length * 0.2 +
    pm.missedSignals.length * 0.1 +
    (pm.preventable ? 0.3 : 0) +
    ((pm.timeToDetectDays ?? 0) > 30 ? 0.2 : 0),
  );
  const verdict: Verdict = pm.preventable && pm.controlFailures.length >= 2
    ? 'escalate'
    : pm.controlFailures.length >= 1 || pm.missedSignals.length >= 2 ? 'flag' : 'clear';
  const parts: string[] = [
    `Post-mortem for incident ${pm.incidentId}:`,
    `${pm.rootCauses.length} root cause(s), ${pm.controlFailures.length} control failure(s), ${pm.missedSignals.length} missed signal(s).`,
  ];
  if (pm.preventable) parts.push('Incident was preventable.');
  if (pm.timeToDetectDays != null) parts.push(`Time to detect: ${pm.timeToDetectDays}d.`);
  if (pm.timeToContainDays != null) parts.push(`Time to contain: ${pm.timeToContainDays}d.`);
  return mkFinding('post_mortem', 'cognitive_science', ['deep_thinking', 'introspection'],
    verdict, severityScore, 0.85, parts.join(' '), [pm.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// Bundle export
// ──────────────────────────────────────────────────────────────────────
export const MARKET_GOVERNANCE_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  wash_trade:             washTradeApply,
  spoofing:               spoofingApply,
  self_dealing:           selfDealingApply,
  circular_walk:          circularWalkApply,
  three_lines_defence:    threeLinesDefenceApply,
  wolfsberg_faq:          wolfsbergFaqApply,
  presumption_innocence:  presumptionInnocenceApply,
  saturation:             saturationApply,
  toulmin:                toulminApply,
  irac:                   iracApply,
  swot:                   swotApply,
  war_game:               warGameApply,
  monte_carlo:            monteCarloApply,
  cvar:                   cvarApply,
  post_mortem:            postMortemApply,
};
