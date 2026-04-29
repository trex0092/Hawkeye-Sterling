// Hawkeye Sterling — governance / behavioral / data-quality / crypto / sectoral modes (batch 9).
//
// Thirteen stubs promoted to real algorithms:
//
//   Threat modeling
//   - octave             — OCTAVE asset/vulnerability/threat evaluation
//
//   Behavioral signals
//   - seasonality        — periodic pattern detection
//   - sentiment_analysis — affective polarity scoring
//
//   Data quality
//   - ethical_matrix     — stakeholder × principle ethical review
//   - lineage            — upstream/downstream transformation chain
//   - reconciliation     — two-source match and discrepancy check
//
//   Governance
//   - conflict_interest  — decision-maker interest conflict detection
//   - sla_check          — timeliness vs agreed SLA
//   - training_inadequacy — staff training coverage/recency check
//   - staff_workload     — compliance per-head capacity check
//   - verdict_replay     — re-run past decisions against current rules
//
//   Crypto/DeFi
//   - taint_propagation  — illicit-source risk through transaction graph
//
//   Sectoral typology
//   - yacht_jet          — high-value moveable asset concealment
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
// octave — OCTAVE asset/vulnerability/threat evaluation.
// evidence.octaveAssets: { asset, threatLevel, vulnerability, mitigated: boolean }[]
// Unmitigated high-threat high-vulnerability assets escalate.
// ──────────────────────────────────────────────────────────────────────
interface OctaveAsset {
  asset: string; threatLevel: number; vulnerability: number; mitigated: boolean;
}

export const octaveApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'threat_modeling';
  const FAC: FacultyId[] = ['strong_brain'];
  const ID = 'octave';

  const assets = typedEvidence<OctaveAsset>(ctx, 'octaveAssets');
  if (assets.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No OCTAVE asset data supplied; asset-risk evaluation cannot proceed.');
  }

  const riskScores = assets.map(a => ({
    asset: a.asset,
    risk: clamp01(a.threatLevel * a.vulnerability * (a.mitigated ? 0.3 : 1.0)),
  }));

  const avgRisk = riskScores.reduce((s, r) => s + r.risk, 0) / riskScores.length;
  const criticalUnmitigated = assets.filter(
    a => !a.mitigated && a.threatLevel >= 0.6 && a.vulnerability >= 0.6,
  );
  const topAssets = criticalUnmitigated.map(a => a.asset).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (criticalUnmitigated.length >= 2 || avgRisk >= 0.5) verdict = 'escalate';
  else if (criticalUnmitigated.length >= 1 || avgRisk >= 0.3) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, avgRisk, 0.74,
    `OCTAVE: ${assets.length} asset(s) evaluated, avg risk ${avgRisk.toFixed(2)}, ` +
    `${criticalUnmitigated.length} unmitigated critical asset(s). ` +
    (topAssets ? `Critical assets: ${topAssets}.` : 'No unmitigated critical assets.'));
};

// ──────────────────────────────────────────────────────────────────────
// seasonality — periodic pattern detection.
// evidence.activityBuckets: { period: string, value: number }[]
// Detects spikes relative to seasonal baseline (coefficient of variation).
// ──────────────────────────────────────────────────────────────────────
interface ActivityBucket { period: string; value: number }

export const seasonalityApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'behavioral_signals';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'seasonality';

  const buckets = typedEvidence<ActivityBucket>(ctx, 'activityBuckets');
  if (buckets.length < 3) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'Fewer than 3 activity buckets supplied; seasonality analysis cannot proceed.');
  }

  const values = buckets.map(b => b.value);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean === 0 ? 0 : stdDev / mean; // coefficient of variation

  // Spikes: periods more than 2σ above mean.
  const spikes = buckets.filter(b => b.value > mean + 2 * stdDev);
  const spikeLabels = spikes.map(b => b.period).slice(0, 3).join(', ');

  const score = clamp01(cv * 0.5 + (spikes.length / buckets.length) * 0.5);

  let verdict: Verdict = 'clear';
  if (spikes.length >= 2 || cv >= 1.0) verdict = 'escalate';
  else if (spikes.length >= 1 || cv >= 0.5) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.7,
    `Seasonality: CV=${cv.toFixed(2)}, ${spikes.length} spike(s) >2σ across ${buckets.length} period(s). ` +
    (spikeLabels ? `Spike periods: ${spikeLabels}.` : 'No significant spikes detected.'));
};

// ──────────────────────────────────────────────────────────────────────
// sentiment_analysis — affective polarity scoring.
// evidence.sentimentScores: { source, score: -1..1, magnitude?: number }[]
// Aggregates polarity; strongly negative sentiment flags reputational risk.
// ──────────────────────────────────────────────────────────────────────
interface SentimentScore { source: string; score: number; magnitude?: number }

export const sentiment_analysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'behavioral_signals';
  const FAC: FacultyId[] = ['data_analysis', 'intelligence'];
  const ID = 'sentiment_analysis';

  const scores = typedEvidence<SentimentScore>(ctx, 'sentimentScores');
  if (scores.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No sentiment scores supplied; sentiment analysis cannot proceed.');
  }

  const weightedSum = scores.reduce((s, sc) => {
    const w = typeof sc.magnitude === 'number' ? sc.magnitude : 1;
    return s + sc.score * w;
  }, 0);
  const totalWeight = scores.reduce((s, sc) =>
    s + (typeof sc.magnitude === 'number' ? sc.magnitude : 1), 0);
  const avgSentiment = totalWeight === 0 ? 0 : weightedSum / totalWeight;

  // Negative sentiment (< -0.3) = adverse media risk.
  const negativeSources = scores.filter(s => s.score <= -0.3).length;
  const riskScore = clamp01(Math.max(0, -avgSentiment)); // 0 if neutral/positive

  let verdict: Verdict = 'clear';
  if (avgSentiment <= -0.5 || negativeSources >= Math.ceil(scores.length * 0.5)) verdict = 'escalate';
  else if (avgSentiment <= -0.2 || negativeSources >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, riskScore, 0.68,
    `Sentiment analysis: avg polarity ${avgSentiment.toFixed(2)} across ${scores.length} source(s), ` +
    `${negativeSources} negative source(s). ` +
    (verdict !== 'clear' ? 'Adverse sentiment detected in source corpus.' : 'Sentiment broadly neutral or positive.'));
};

// ──────────────────────────────────────────────────────────────────────
// ethical_matrix — stakeholder × principle ethical review.
// evidence.ethicalMatrix: { stakeholder, principle, impact: -1..1 }[]
// Aggregates negative impacts; systemic harm across stakeholders flags concern.
// ──────────────────────────────────────────────────────────────────────
interface EthicalCell { stakeholder: string; principle: string; impact: number }

export const ethical_matrixApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'data_quality';
  const FAC: FacultyId[] = ['introspection'];
  const ID = 'ethical_matrix';

  const cells = typedEvidence<EthicalCell>(ctx, 'ethicalMatrix');
  if (cells.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No ethical-matrix data supplied; stakeholder impact analysis cannot proceed.');
  }

  const negCells = cells.filter(c => c.impact < -0.2);
  const avgImpact = cells.reduce((s, c) => s + c.impact, 0) / cells.length;
  const distinctNegStakeholders = new Set(negCells.map(c => c.stakeholder)).size;
  const negPrinciples = [...new Set(negCells.map(c => c.principle))].slice(0, 3).join(', ');

  const score = clamp01(Math.max(0, -avgImpact) + negCells.length / cells.length * 0.5);

  let verdict: Verdict = 'clear';
  if (avgImpact <= -0.4 || distinctNegStakeholders >= 3) verdict = 'escalate';
  else if (avgImpact <= -0.1 || distinctNegStakeholders >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.68,
    `Ethical matrix: avg impact ${avgImpact.toFixed(2)}, ${negCells.length} negative cells, ` +
    `${distinctNegStakeholders} stakeholder group(s) negatively affected. ` +
    (negPrinciples ? `Violated principles: ${negPrinciples}.` : 'No principle violations detected.'));
};

// ──────────────────────────────────────────────────────────────────────
// lineage — upstream/downstream data transformation chain.
// evidence.lineageNodes: { nodeId, transformations: string[], trustScore: number }[]
// Low-trust nodes in the chain or excessive transformations flag data integrity risk.
// ──────────────────────────────────────────────────────────────────────
interface LineageNode { nodeId: string; transformations: string[]; trustScore: number }

export const lineageApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'data_quality';
  const FAC: FacultyId[] = ['ratiocination'];
  const ID = 'lineage';

  const nodes = typedEvidence<LineageNode>(ctx, 'lineageNodes');
  if (nodes.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No lineage nodes supplied; data-lineage analysis cannot proceed.');
  }

  const lowTrust = nodes.filter(n => n.trustScore < 0.4);
  const totalTransformations = nodes.reduce((s, n) => s + n.transformations.length, 0);
  const avgTrust = nodes.reduce((s, n) => s + n.trustScore, 0) / nodes.length;

  const score = clamp01((1 - avgTrust) * 0.6 + Math.min(totalTransformations / 20, 0.4));
  const lowTrustIds = lowTrust.map(n => n.nodeId).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (lowTrust.length >= 2 || avgTrust < 0.3) verdict = 'escalate';
  else if (lowTrust.length >= 1 || totalTransformations > 10) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Lineage: ${nodes.length} node(s), avg trust ${avgTrust.toFixed(2)}, ` +
    `${totalTransformations} transformation(s) total, ${lowTrust.length} low-trust node(s). ` +
    (lowTrustIds ? `Low-trust nodes: ${lowTrustIds}.` : 'All lineage nodes within acceptable trust range.'));
};

// ──────────────────────────────────────────────────────────────────────
// reconciliation — two-source match and discrepancy check.
// evidence.reconciliationItems: { id, sourceA, sourceB, matched: boolean, discrepancy?: number }[]
// High discrepancy rate or large absolute discrepancies flag data integrity issues.
// ──────────────────────────────────────────────────────────────────────
interface ReconciliationItem {
  id: string; sourceA: number; sourceB: number;
  matched: boolean; discrepancy?: number;
}

export const reconciliationApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'data_quality';
  const FAC: FacultyId[] = ['ratiocination'];
  const ID = 'reconciliation';

  const items = typedEvidence<ReconciliationItem>(ctx, 'reconciliationItems');
  if (items.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No reconciliation items supplied; data matching cannot proceed.');
  }

  const unmatched = items.filter(i => !i.matched);
  const mismatchRate = unmatched.length / items.length;
  const avgDiscrepancy = items.reduce((s, i) => {
    const disc = typeof i.discrepancy === 'number' ? Math.abs(i.discrepancy)
      : Math.abs(i.sourceA - i.sourceB);
    const base = Math.max(Math.abs(i.sourceA), Math.abs(i.sourceB), 1);
    return s + disc / base;
  }, 0) / items.length;

  const score = clamp01(mismatchRate * 0.6 + avgDiscrepancy * 0.4);
  const topMismatches = unmatched.map(i => i.id).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (mismatchRate >= 0.3 || avgDiscrepancy >= 0.2) verdict = 'escalate';
  else if (mismatchRate >= 0.1 || avgDiscrepancy >= 0.05) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.75,
    `Reconciliation: ${unmatched.length}/${items.length} items unmatched (${(mismatchRate * 100).toFixed(0)}%), ` +
    `avg relative discrepancy ${(avgDiscrepancy * 100).toFixed(1)}%. ` +
    (topMismatches ? `Unmatched items: ${topMismatches}.` : 'All items reconciled successfully.'));
};

// ──────────────────────────────────────────────────────────────────────
// conflict_interest — decision-maker interest conflict detection.
// evidence.conflictChecks: { decisionMaker, interest, conflictPresent: boolean, severity? }[]
// ──────────────────────────────────────────────────────────────────────
interface ConflictCheck {
  decisionMaker: string; interest: string; conflictPresent: boolean; severity?: number;
}

export const conflict_interestApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'governance';
  const FAC: FacultyId[] = ['introspection'];
  const ID = 'conflict_interest';

  const checks = typedEvidence<ConflictCheck>(ctx, 'conflictChecks');
  if (checks.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No conflict-of-interest checks supplied; bias detection cannot proceed.');
  }

  const conflicts = checks.filter(c => c.conflictPresent);
  const avgSeverity = conflicts.length === 0 ? 0
    : conflicts.reduce((s, c) => s + (typeof c.severity === 'number' ? c.severity : 0.5), 0) / conflicts.length;

  const conflictRate = conflicts.length / checks.length;
  const score = clamp01(conflictRate * 0.5 + avgSeverity * 0.5);
  const actors = conflicts.map(c => c.decisionMaker).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (conflicts.length >= 2 || avgSeverity >= 0.7) verdict = 'escalate';
  else if (conflicts.length >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.75,
    `Conflict of interest: ${conflicts.length}/${checks.length} check(s) flagged ` +
    `(avg severity ${avgSeverity.toFixed(2)}). ` +
    (actors ? `Conflicted decision-makers: ${actors}.` : 'No conflicts of interest detected.'));
};

// ──────────────────────────────────────────────────────────────────────
// sla_check — timeliness vs agreed SLA.
// evidence.slaItems: { action, dueAt: number, completedAt?: number, breached: boolean }[]
// SLA breach rate and average overdue days drive the score.
// ──────────────────────────────────────────────────────────────────────
interface SlaItem {
  action: string; dueAt: number; completedAt?: number; breached: boolean;
}

export const sla_checkApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'governance';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'sla_check';

  const items = typedEvidence<SlaItem>(ctx, 'slaItems');
  if (items.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No SLA items supplied; timeliness check cannot proceed.');
  }

  const breached = items.filter(i => i.breached);
  const breachRate = breached.length / items.length;

  // Average overdue: (completedAt - dueAt) or (now - dueAt) for open items, in days.
  const now = Date.now();
  const overdueMs = breached.reduce((s, i) => {
    const resolved = i.completedAt ?? now;
    return s + Math.max(0, resolved - i.dueAt);
  }, 0);
  const avgOverdueDays = breached.length === 0 ? 0 : overdueMs / breached.length / 86400000;

  const score = clamp01(breachRate * 0.6 + Math.min(avgOverdueDays / 30, 0.4));
  const breachedActions = breached.map(i => i.action).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (breachRate >= 0.3 || avgOverdueDays >= 14) verdict = 'escalate';
  else if (breachRate >= 0.1 || avgOverdueDays >= 3) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.78,
    `SLA check: ${breached.length}/${items.length} breaches (${(breachRate * 100).toFixed(0)}%), ` +
    `avg overdue ${avgOverdueDays.toFixed(1)} day(s). ` +
    (breachedActions ? `Breached actions: ${breachedActions}.` : 'All actions within SLA.'));
};

// ──────────────────────────────────────────────────────────────────────
// training_inadequacy — staff training coverage/recency check.
// evidence.trainingRecords: { staffId, courseId, completedAt: number, passScore: number, required: boolean }[]
// Flags when required training is incomplete, stale (>12m), or failed.
// ──────────────────────────────────────────────────────────────────────
interface TrainingRecord {
  staffId: string; courseId: string;
  completedAt: number; passScore: number; required: boolean;
}

export const training_inadequacyApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'governance';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'training_inadequacy';

  const records = typedEvidence<TrainingRecord>(ctx, 'trainingRecords');
  if (records.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No training records supplied; training adequacy check cannot proceed.');
  }

  const now = Date.now();
  const STALE_MS = 365 * 24 * 3600 * 1000; // 12 months

  const required = records.filter(r => r.required);
  const staleOrFailed = required.filter(r =>
    r.passScore < 0.7 || (now - r.completedAt) > STALE_MS,
  );
  const inadequacyRate = required.length === 0 ? 0 : staleOrFailed.length / required.length;

  const distinctStaff = new Set(staleOrFailed.map(r => r.staffId)).size;
  const score = clamp01(inadequacyRate * 0.7 + (distinctStaff / Math.max(records.length, 1)) * 0.3);

  let verdict: Verdict = 'clear';
  if (inadequacyRate >= 0.3 || distinctStaff >= 3) verdict = 'escalate';
  else if (inadequacyRate >= 0.1 || distinctStaff >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Training adequacy: ${staleOrFailed.length}/${required.length} required course(s) stale or failed, ` +
    `affecting ${distinctStaff} staff member(s). ` +
    (verdict !== 'clear' ? 'Training gaps create compliance exposure.' : 'Training records current and adequate.'));
};

// ──────────────────────────────────────────────────────────────────────
// staff_workload — compliance per-head capacity check.
// evidence.workloadData: { role, casesAssigned, capacityPerMonth, avgResolutionDays }
// Overloaded teams produce lower-quality decisions.
// ──────────────────────────────────────────────────────────────────────
interface WorkloadData {
  role: string; casesAssigned: number;
  capacityPerMonth: number; avgResolutionDays: number;
}

export const staff_workloadApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'governance';
  const FAC: FacultyId[] = ['data_analysis'];
  const ID = 'staff_workload';

  const data = singleEvidence<WorkloadData>(ctx, 'workloadData');
  if (!data) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No workload data supplied; staff-capacity check cannot proceed.');
  }

  const { casesAssigned: ca, capacityPerMonth: cap, avgResolutionDays: ard } = data;

  if (cap <= 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.4,
      'Capacity is zero or negative; workload calculation invalid.');
  }

  const utilisation = ca / cap;
  // If resolution days > 20 working days, flag backlog pressure.
  const resolutionPressure = clamp01(Math.max(0, ard - 5) / 20);
  const score = clamp01((utilisation - 1) * 0.6 + resolutionPressure * 0.4);

  let verdict: Verdict = 'clear';
  if (utilisation >= 1.5 || ard >= 20) verdict = 'escalate';
  else if (utilisation >= 1.1 || ard >= 10) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Staff workload (${data.role}): ${ca} cases vs capacity ${cap}/month ` +
    `(utilisation ${(utilisation * 100).toFixed(0)}%), avg resolution ${ard.toFixed(1)} day(s). ` +
    (utilisation >= 1.1 ? 'Team over-capacity — decision quality risk elevated.' : 'Workload within sustainable range.'));
};

// ──────────────────────────────────────────────────────────────────────
// verdict_replay — re-run past decisions against current rules.
// evidence.verdictReplays: { caseId, originalVerdict, replayVerdict, deltaScore: number }[]
// High rate of changed verdicts signals rule drift.
// ──────────────────────────────────────────────────────────────────────
interface VerdictReplay {
  caseId: string; originalVerdict: string;
  replayVerdict: string; deltaScore: number;
}

export const verdict_replayApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'governance';
  const FAC: FacultyId[] = ['introspection', 'deep_thinking'];
  const ID = 'verdict_replay';

  const replays = typedEvidence<VerdictReplay>(ctx, 'verdictReplays');
  if (replays.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No verdict replay data supplied; policy-drift analysis cannot proceed.');
  }

  const changed = replays.filter(r => r.originalVerdict !== r.replayVerdict);
  const changeRate = changed.length / replays.length;
  const avgDelta = replays.reduce((s, r) => s + Math.abs(r.deltaScore), 0) / replays.length;
  const escalations = changed.filter(
    r => r.originalVerdict === 'clear' && (r.replayVerdict === 'flag' || r.replayVerdict === 'escalate'),
  ).length;

  const score = clamp01(changeRate * 0.5 + avgDelta * 0.3 + escalations / replays.length * 0.2);
  const changedIds = changed.map(r => r.caseId).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (changeRate >= 0.3 || escalations >= 2) verdict = 'escalate';
  else if (changeRate >= 0.1 || escalations >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Verdict replay: ${changed.length}/${replays.length} verdicts changed under current rules ` +
    `(${escalations} clear→flag/escalate upgrades), avg score delta ${avgDelta.toFixed(2)}. ` +
    (changedIds ? `Changed cases: ${changedIds}.` : 'All past verdicts consistent with current rules.'));
};

// ──────────────────────────────────────────────────────────────────────
// taint_propagation — illicit-source risk through transaction graph.
// evidence.taintGraph: { txId, taintIn: number, value: number, mixingHops?: number }[]
// Taint propagates proportionally through inputs; mixing hops decay it.
// ──────────────────────────────────────────────────────────────────────
interface TaintNode { txId: string; taintIn: number; value: number; mixingHops?: number }

export const taint_propagationApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'crypto_defi';
  const FAC: FacultyId[] = ['inference'];
  const ID = 'taint_propagation';

  const nodes = typedEvidence<TaintNode>(ctx, 'taintGraph');
  if (nodes.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No taint-graph data supplied; taint propagation analysis cannot proceed.');
  }

  const taintScores = nodes.map(n => {
    const decay = typeof n.mixingHops === 'number' ? Math.max(0, 1 - n.mixingHops * 0.15) : 1;
    return clamp01(n.taintIn * decay);
  });

  const totalValue = nodes.reduce((s, n) => s + Math.max(n.value, 0), 0);
  const weightedTaint = totalValue === 0 ? 0
    : nodes.reduce((s, n, i) => s + (taintScores[i] ?? 0) * Math.max(n.value, 0), 0) / totalValue;

  const highTaintNodes = nodes.filter((_, i) => (taintScores[i] ?? 0) >= 0.5);
  const topTxIds = highTaintNodes.map(n => n.txId).slice(0, 3).join(', ');

  let verdict: Verdict = 'clear';
  if (weightedTaint >= 0.5) verdict = 'escalate';
  else if (weightedTaint >= 0.2) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, weightedTaint, 0.78,
    `Taint propagation: value-weighted taint ${(weightedTaint * 100).toFixed(0)}%, ` +
    `${highTaintNodes.length}/${nodes.length} node(s) ≥50% tainted. ` +
    (topTxIds ? `High-taint transactions: ${topTxIds}.` : 'Taint below threshold across all nodes.'));
};

// ──────────────────────────────────────────────────────────────────────
// yacht_jet — high-value moveable asset concealment.
// evidence.movableAssets: { assetType, value, flagState?, registrations: string[], riskIndicators: string[] }[]
// Multi-jurisdiction registration, opaque ownership, flag-shopping flag asset concealment.
// ──────────────────────────────────────────────────────────────────────
interface MovableAsset {
  assetType: string; value: number;
  flagState?: string; registrations: string[];
  riskIndicators: string[];
}

export const yacht_jetApply = async (ctx: BrainContext): Promise<Finding> => {
  const CAT: ReasoningCategory = 'sectoral_typology';
  const FAC: FacultyId[] = ['intelligence'];
  const ID = 'yacht_jet';

  const assets = typedEvidence<MovableAsset>(ctx, 'movableAssets');
  if (assets.length === 0) {
    return mkFinding(ID, CAT, FAC, 'inconclusive', 0, 0.5,
      'No movable-asset data supplied; yacht/jet typology analysis cannot proceed.');
  }

  const HIGH_VALUE_THRESHOLD = 1_000_000;
  const highValue = assets.filter(a => a.value >= HIGH_VALUE_THRESHOLD);
  const multiRegAssets = assets.filter(a => a.registrations.length >= 2);
  const totalIndicators = assets.reduce((s, a) => s + a.riskIndicators.length, 0);
  const topIndicators = assets.flatMap(a => a.riskIndicators).slice(0, 4).join(', ');

  const score = clamp01(
    (highValue.length / Math.max(assets.length, 1)) * 0.3 +
    (multiRegAssets.length / Math.max(assets.length, 1)) * 0.3 +
    Math.min(totalIndicators * 0.1, 0.4),
  );

  let verdict: Verdict = 'clear';
  if (score >= 0.5 || (highValue.length >= 1 && totalIndicators >= 3)) verdict = 'escalate';
  else if (score >= 0.2 || totalIndicators >= 1) verdict = 'flag';

  return mkFinding(ID, CAT, FAC, verdict, score, 0.72,
    `Yacht/jet typology: ${assets.length} asset(s), ${highValue.length} high-value (≥$1M), ` +
    `${multiRegAssets.length} multi-registration, ${totalIndicators} risk indicator(s). ` +
    (topIndicators ? `Indicators: ${topIndicators}.` : 'No typology indicators detected.'));
};

// ──────────────────────────────────────────────────────────────────────
// Export bundle
// ──────────────────────────────────────────────────────────────────────
export const GOVERNANCE_CRYPTO_MODE_APPLIES = {
  octave: octaveApply,
  seasonality: seasonalityApply,
  sentiment_analysis: sentiment_analysisApply,
  ethical_matrix: ethical_matrixApply,
  lineage: lineageApply,
  reconciliation: reconciliationApply,
  conflict_interest: conflict_interestApply,
  sla_check: sla_checkApply,
  training_inadequacy: training_inadequacyApply,
  staff_workload: staff_workloadApply,
  verdict_replay: verdict_replayApply,
  taint_propagation: taint_propagationApply,
  yacht_jet: yacht_jetApply,
};
