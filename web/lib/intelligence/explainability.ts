// Hawkeye Sterling — explainability pack (Layers 141-145).
//
// Pure-function helpers that turn a composite-score breakdown into a
// regulator-grade explanation: per-signal attribution, counterfactual
// ladder, calibrated confidence interval, saliency map, and SHAP-style
// feature importance.

export interface SignalContribution {
  signal: string;
  /** Points contributed to the composite score (signed). */
  contributionPts: number;
  /** Weight 0..1 within the composite. */
  weight: number;
  /** Human-readable reason. */
  rationale: string;
}

// 141. Decision attribution — order signals by absolute contribution
export function attributeDecision(contribs: SignalContribution[]): SignalContribution[] {
  return [...contribs].sort((a, b) => Math.abs(b.contributionPts) - Math.abs(a.contributionPts));
}

// 142. Counterfactual ladder — what change would move the verdict to each band
export interface CounterfactualStep {
  targetBand: "clear" | "low" | "medium" | "high" | "critical";
  pointsNeeded: number;
  signalsToFlip: string[];
  rationale: string;
}
const BAND_FLOOR: Record<CounterfactualStep["targetBand"], number> = {
  clear: 0, low: 20, medium: 40, high: 60, critical: 80,
};
export function counterfactualLadder(currentScore: number, contribs: SignalContribution[]): CounterfactualStep[] {
  const sorted = attributeDecision(contribs);
  return (Object.keys(BAND_FLOOR) as CounterfactualStep["targetBand"][]).map((band) => {
    const target = BAND_FLOOR[band];
    const diff = currentScore - target;
    if (diff <= 0) return { targetBand: band, pointsNeeded: 0, signalsToFlip: [], rationale: `Already at or below ${band.toUpperCase()}.` };
    let acc = 0;
    const flip: string[] = [];
    for (const c of sorted) {
      if (c.contributionPts <= 0) continue;
      flip.push(c.signal);
      acc += c.contributionPts;
      if (acc >= diff) break;
    }
    return { targetBand: band, pointsNeeded: Math.round(diff), signalsToFlip: flip, rationale: `Need to remove ~${Math.round(diff)} pts; flip ${flip.join(" + ")} to reach ${band.toUpperCase()}.` };
  });
}

// 143. Calibrated confidence interval — Wilson score on a binary outcome
export function wilsonInterval(successes: number, n: number, z = 1.96): { lo: number; hi: number; centre: number } {
  if (n === 0) return { lo: 0, hi: 1, centre: 0.5 };
  const p = successes / n;
  const denom = 1 + (z ** 2) / n;
  const centre = (p + (z ** 2) / (2 * n)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / n + (z ** 2) / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - margin), hi: Math.min(1, centre + margin), centre };
}

// 144. Saliency map of signals — normalise contributions for UI heatmap
export function saliencyMap(contribs: SignalContribution[]): Array<{ signal: string; saliency: number }> {
  const max = contribs.reduce((m, c) => Math.max(m, Math.abs(c.contributionPts)), 0);
  if (max === 0) return contribs.map((c) => ({ signal: c.signal, saliency: 0 }));
  return contribs.map((c) => ({ signal: c.signal, saliency: Number((Math.abs(c.contributionPts) / max).toFixed(2)) }));
}

// 145. SHAP-style feature importance (Shapley approximation across N permutations)
// Lightweight: averages marginal contribution across `samples` random orderings.
export interface ShapleySample { signal: string; marginal: number; }
export function shapleyApprox(
  baseScore: number,
  contribs: SignalContribution[],
  samples = 50,
  rng: () => number = Math.random,
): Array<{ signal: string; importance: number; rank: number }> {
  const importances = new Map<string, number>();
  for (const c of contribs) importances.set(c.signal, 0);
  for (let s = 0; s < samples; s += 1) {
    const order = [...contribs].sort(() => rng() - 0.5);
    let running = baseScore;
    for (const c of order) {
      const before = running;
      running += c.contributionPts;
      const marginal = running - before;
      importances.set(c.signal, (importances.get(c.signal) ?? 0) + marginal / samples);
    }
  }
  const ranked = [...importances.entries()]
    .map(([signal, importance]) => ({ signal, importance: Number(importance.toFixed(2)) }))
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .map((x, i) => ({ ...x, rank: i + 1 }));
  return ranked;
}
