// Hawkeye Sterling — subject-trajectory anomaly detector (audit follow-up #26).
//
// Given a subject's screening history (ordered list of verdicts over
// time), detects inflection points where the subject's risk posture
// changed materially. Used for ongoing-monitoring escalation alerts:
// a subject who went from CLEAR to FLAG to ESCALATE over three months
// is fundamentally different from one who has been ESCALATE all along.
//
// Pure function; no IO.

export interface SubjectScreen {
  runId: string;
  at: string;                        // ISO 8601
  outcome: "clear" | "flag" | "escalate" | "inconclusive" | "block";
  aggregateScore: number;
  posterior?: number;
  modeIds?: string[];
}

export type Inflection = {
  id: string;
  kind: "first_escalation" | "score_spike" | "regression_to_clear" | "sustained_drift" | "flap_pattern";
  fromIndex: number;
  toIndex: number;
  description: string;
  delta: number;
};

export interface TrajectoryReport {
  subjectId: string;
  totalScreens: number;
  spanDays: number;
  outcomeStreak: { outcome: SubjectScreen["outcome"]; count: number };
  scoreTrend: "rising" | "falling" | "stable";
  inflections: Inflection[];
  flagBlockRatio: number;            // (flag + escalate + block) / total
}

const OUTCOME_RANK: Record<SubjectScreen["outcome"], number> = {
  clear: 0, inconclusive: 1, flag: 2, escalate: 3, block: 4,
};

export function analyseTrajectory(subjectId: string, screens: readonly SubjectScreen[]): TrajectoryReport {
  if (screens.length === 0) {
    return {
      subjectId, totalScreens: 0, spanDays: 0,
      outcomeStreak: { outcome: "inconclusive", count: 0 },
      scoreTrend: "stable", inflections: [], flagBlockRatio: 0,
    };
  }

  const sorted = [...screens].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const spanDays = Math.max(0, Math.floor((Date.parse(last.at) - Date.parse(first.at)) / 86_400_000));

  // Score trend — simple linear OLS on (i, score).
  const n = sorted.length;
  const meanX = (n - 1) / 2;
  const meanY = sorted.reduce((a, s) => a + s.aggregateScore, 0) / n;
  let cov = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    const s = sorted[i]!;
    cov += (i - meanX) * (s.aggregateScore - meanY);
    varX += (i - meanX) ** 2;
  }
  const slope = varX > 0 ? cov / varX : 0;
  const scoreTrend: TrajectoryReport["scoreTrend"] =
    slope > 0.02 ? "rising" : slope < -0.02 ? "falling" : "stable";

  // Outcome streak — last contiguous run of identical outcomes.
  const streakOut = last.outcome;
  let streakCount = 1;
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i]!.outcome === streakOut) streakCount++;
    else break;
  }

  // Inflections.
  const inflections: Inflection[] = [];

  // First escalation — first index where outcome rank ≥ 3.
  const firstEscIdx = sorted.findIndex((s) => OUTCOME_RANK[s.outcome] >= 3);
  if (firstEscIdx > 0) {
    inflections.push({
      id: "first_escalation",
      kind: "first_escalation",
      fromIndex: firstEscIdx - 1,
      toIndex: firstEscIdx,
      description: `Subject crossed into escalate/block at screen ${firstEscIdx + 1} of ${n} (${sorted[firstEscIdx]!.at}).`,
      delta: OUTCOME_RANK[sorted[firstEscIdx]!.outcome] - OUTCOME_RANK[sorted[firstEscIdx - 1]!.outcome],
    });
  }

  // Score spike — single jump ≥ 0.3.
  for (let i = 1; i < n; i++) {
    const dS = sorted[i]!.aggregateScore - sorted[i - 1]!.aggregateScore;
    if (dS >= 0.3) {
      inflections.push({
        id: `score_spike_${i}`,
        kind: "score_spike",
        fromIndex: i - 1,
        toIndex: i,
        description: `Score jumped ${dS.toFixed(2)} from screen ${i} to ${i + 1}.`,
        delta: dS,
      });
    }
  }

  // Regression to clear — was escalate/block, now clear at the tail.
  if (sorted.length >= 3 && last.outcome === "clear") {
    const middle = sorted[Math.floor(n / 2)];
    if (middle && OUTCOME_RANK[middle.outcome] >= 3) {
      inflections.push({
        id: "regression_to_clear",
        kind: "regression_to_clear",
        fromIndex: Math.floor(n / 2),
        toIndex: n - 1,
        description: `Subject was at '${middle.outcome}' mid-history but is now 'clear' — verify what changed.`,
        delta: OUTCOME_RANK[last.outcome] - OUTCOME_RANK[middle.outcome],
      });
    }
  }

  // Flap pattern — three or more outcome flips back and forth.
  let flips = 0;
  for (let i = 1; i < n; i++) {
    if (sorted[i]!.outcome !== sorted[i - 1]!.outcome) flips++;
  }
  if (flips >= 3 && n >= 4) {
    inflections.push({
      id: "flap_pattern",
      kind: "flap_pattern",
      fromIndex: 0,
      toIndex: n - 1,
      description: `${flips} outcome flips across ${n} screens — flap pattern; investigate evidence-volatility cause.`,
      delta: flips,
    });
  }

  // Sustained drift — slope ≥ 0.04 over ≥ 4 screens.
  if (n >= 4 && Math.abs(slope) >= 0.04) {
    inflections.push({
      id: "sustained_drift",
      kind: "sustained_drift",
      fromIndex: 0,
      toIndex: n - 1,
      description: `Score ${scoreTrend} at slope ${slope.toFixed(3)} over ${n} screens.`,
      delta: slope,
    });
  }

  const heightenedCount = sorted.filter((s) => OUTCOME_RANK[s.outcome] >= 2).length;
  const flagBlockRatio = heightenedCount / n;

  return {
    subjectId,
    totalScreens: n,
    spanDays,
    outcomeStreak: { outcome: streakOut, count: streakCount },
    scoreTrend,
    inflections,
    flagBlockRatio,
  };
}
