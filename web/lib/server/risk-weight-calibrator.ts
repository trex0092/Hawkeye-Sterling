// Dynamic risk weight calibration.
//
// Reads MLRO feedback (confirmed SARs vs dismissed alerts) and adjusts
// the DPMS_UAE scoring weights so signals that actually correlated with
// confirmed suspicion are weighted higher over time.
//
// Default weights are frozen at build time. Calibrated weights override
// them and are stored in Netlify Blobs under "risk-weights/current".

import { getJson, setJson } from "./store";
import { stats as feedbackStats } from "./feedback";

const WEIGHTS_KEY = "risk-weights/current";
const HISTORY_KEY = "risk-weights/history";

export interface RiskWeights {
  sanctionsHit: number;
  pepStatus: number;
  jurisdictionTier: number;
  uboTransparency: number;
  adverseMedia: number;
  cashIntensity: number;
  industryRisk: number;
  productRisk: number;
  channelRisk: number;
  transactionVolume: number;
  customerType: number;
  relationshipAge: number;
  screeningFreshness: number;
}

export interface WeightHistory {
  capturedAt: string;
  weights: RiskWeights;
  totalFeedbackSignals: number;
  note: string;
}

// Baseline weights (FDL 10/2025 / FATF DPMS guidance)
export const DEFAULT_WEIGHTS: RiskWeights = {
  sanctionsHit:       0.25,
  pepStatus:          0.15,
  jurisdictionTier:   0.12,
  uboTransparency:    0.10,
  adverseMedia:       0.08,
  cashIntensity:      0.08,
  industryRisk:       0.06,
  productRisk:        0.05,
  channelRisk:        0.04,
  transactionVolume:  0.03,
  customerType:       0.02,
  relationshipAge:    0.01,
  screeningFreshness: 0.01,
};

export async function getCurrentWeights(): Promise<RiskWeights> {
  return (await getJson<RiskWeights>(WEIGHTS_KEY)) ?? DEFAULT_WEIGHTS;
}

export async function getWeightHistory(): Promise<WeightHistory[]> {
  return (await getJson<WeightHistory[]>(HISTORY_KEY)) ?? [];
}

/**
 * Calibrate weights from feedback stats.
 *
 * Logic:
 * - If false-positive rate for a signal pair is high → slightly reduce the
 *   weight of the contributing dimension (sanctions hits that keep being FP
 *   get a small penalty)
 * - True-match confirmations boost the weight slightly
 * - All adjustments are capped at ±15% of the baseline to prevent drift
 * - Weights are re-normalised to sum to 1.0 after adjustment
 */
export async function calibrateWeights(): Promise<{ current: RiskWeights; proposed: RiskWeights; changed: boolean; note: string }> {
  const current = await getCurrentWeights();
  const fb = await feedbackStats();

  if (fb.totalVerdicts < 10) {
    return { current, proposed: current, changed: false, note: `Insufficient feedback (${fb.totalVerdicts} verdicts, need ≥10)` };
  }

  const fpPairs = Object.keys(fb.falsePositiveByPair);
  const tmPairs = Object.keys(fb.trueMatchByPair);
  const totalFP = fpPairs.reduce((s, k) => s + (fb.falsePositiveByPair[k] ?? 0), 0);
  const totalTM = tmPairs.reduce((s, k) => s + (fb.trueMatchByPair[k] ?? 0), 0);

  // Sanctions-related pairs are keyed with list IDs like "OFAC|...|..."
  const sanctionsFP = fpPairs.filter((k) => k.startsWith("OFAC") || k.startsWith("UN") || k.startsWith("EU") || k.startsWith("UAE")).reduce((s, k) => s + (fb.falsePositiveByPair[k] ?? 0), 0);
  const sanctionsTM = tmPairs.filter((k) => k.startsWith("OFAC") || k.startsWith("UN") || k.startsWith("EU") || k.startsWith("UAE")).reduce((s, k) => s + (fb.trueMatchByPair[k] ?? 0), 0);

  const proposed: RiskWeights = { ...current };
  const MAX_DELTA = 0.15; // max 15% of baseline per dimension

  // Sanctions weight adjustment based on precision
  if (sanctionsFP + sanctionsTM > 0) {
    const precision = sanctionsTM / (sanctionsFP + sanctionsTM);
    const adjustment = (precision - 0.5) * 0.05; // ±0.025 max
    const delta = Math.max(-MAX_DELTA * DEFAULT_WEIGHTS.sanctionsHit, Math.min(MAX_DELTA * DEFAULT_WEIGHTS.sanctionsHit, adjustment));
    proposed.sanctionsHit = Math.max(0.10, Math.min(0.40, current.sanctionsHit + delta));
  }

  // General false-positive rate → reduce adverseMedia weight slightly if noisy
  const overallFPRate = fb.totalVerdicts > 0 ? totalFP / fb.totalVerdicts : 0;
  if (overallFPRate > 0.6) {
    proposed.adverseMedia = Math.max(0.03, current.adverseMedia - 0.01);
  } else if (overallFPRate < 0.2 && totalTM > 5) {
    proposed.adverseMedia = Math.min(0.15, current.adverseMedia + 0.01);
  }

  // Re-normalise to sum=1
  const total = Object.values(proposed).reduce((s, v) => s + v, 0);
  const keys = Object.keys(proposed) as (keyof RiskWeights)[];
  keys.forEach((k) => { proposed[k] = +(proposed[k]! / total).toFixed(4); });

  // Check if meaningfully different
  const maxDiff = Math.max(...keys.map((k) => Math.abs((proposed[k] ?? 0) - (current[k] ?? 0))));
  if (maxDiff < 0.001) {
    return { current, proposed, changed: false, note: "Weights stable — no meaningful change required" };
  }

  // Persist calibrated weights + append to history
  await setJson(WEIGHTS_KEY, proposed);
  const history = await getWeightHistory();
  history.unshift({
    capturedAt: new Date().toISOString(),
    weights: proposed,
    totalFeedbackSignals: fb.totalVerdicts,
    note: `Calibrated from ${fb.totalVerdicts} verdicts (FP rate ${(overallFPRate * 100).toFixed(1)}%)`,
  });
  await setJson(HISTORY_KEY, history.slice(0, 50));

  return {
    current,
    proposed,
    changed: true,
    note: `Weights updated from ${fb.totalVerdicts} feedback verdicts. Max dimension shift: ${(maxDiff * 100).toFixed(2)}%.`,
  };
}
