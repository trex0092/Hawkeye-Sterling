// Hawkeye Sterling — self-consistency check.
//
// Re-runs the consensus calculation N times with shuffled evidence
// order. If the unified score drifts by more than a threshold, the
// rating is "fragile" — meaning small ordering changes flip the
// result. World-Check / Dow Jones don't expose this; we do, so
// operators can see when their conclusion is brittle.

import { multiSourceConsensus, type ConsensusInput, type ConsensusOutput } from "./screeningReasoning";

export interface SelfConsistencyResult {
  baselineScore: number;
  meanScore: number;
  stdDevScore: number;
  minScore: number;
  maxScore: number;
  drift: number;                          // max - min, expressed in points
  consistencyBand: "stable" | "moderate" | "drifting" | "unstable";
  iterations: number;
  signal: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function selfConsistencyCheck(
  inputs: ConsensusInput[],
  baseline: ConsensusOutput,
  iterations: number = 5,
): SelfConsistencyResult {
  if (inputs.length === 0) {
    return {
      baselineScore: 0, meanScore: 0, stdDevScore: 0, minScore: 0, maxScore: 0,
      drift: 0, consistencyBand: "stable", iterations: 0,
      signal: "No evidence to check consistency on.",
    };
  }

  const scores: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const c = multiSourceConsensus(shuffle(inputs));
    scores.push(c.unified);
  }
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const drift = maxScore - minScore;
  const meanScore = scores.reduce((s, x) => s + x, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + Math.pow(x - meanScore, 2), 0) / scores.length;
  const stdDevScore = Math.sqrt(variance);

  let consistencyBand: SelfConsistencyResult["consistencyBand"];
  if (drift <= 5) consistencyBand = "stable";
  else if (drift <= 15) consistencyBand = "moderate";
  else if (drift <= 30) consistencyBand = "drifting";
  else consistencyBand = "unstable";

  let signal: string;
  if (consistencyBand === "stable") {
    signal = `Rating is stable: ${iterations} re-runs with shuffled evidence produced near-identical scores (drift ${drift.toFixed(1)} pts).`;
  } else if (consistencyBand === "moderate") {
    signal = `Moderate sensitivity to evidence ordering (drift ${drift.toFixed(1)} pts); rating is reliable but document the variability.`;
  } else if (consistencyBand === "drifting") {
    signal = `Rating drifts under permutation (range ${minScore}-${maxScore}, σ=${stdDevScore.toFixed(1)}). Fragile to evidence ordering — manual MLRO review recommended.`;
  } else {
    signal = `Unstable rating: scores swing ${drift} pts under shuffled evidence. Do NOT auto-dispose — escalate to MLRO with the full evidence trail.`;
  }

  return {
    baselineScore: baseline.unified,
    meanScore: Math.round(meanScore),
    stdDevScore: Math.round(stdDevScore * 10) / 10,
    minScore, maxScore, drift,
    consistencyBand, iterations,
    signal,
  };
}
