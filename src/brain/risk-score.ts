// Hawkeye Sterling — risk-score engine.
// Charter P9 forbids opaque scoring. Every score produced here returns (a) the
// named methodology, (b) every input variable used, (c) the weight applied,
// and (d) the gaps that would change the score. If a required input is
// missing, the score is clamped and the gap is surfaced.

export type RiskInputKind =
  | 'customer_type'
  | 'jurisdiction_tier'
  | 'product_risk'
  | 'channel_risk'
  | 'pep_status'
  | 'sanctions_hit'
  | 'adverse_media_hits'
  | 'cash_intensity'
  | 'ubo_transparency'
  | 'industry_risk'
  | 'transaction_volume'
  | 'relationship_age'
  | 'screening_freshness';

export interface RiskInput {
  kind: RiskInputKind;
  value: number;   // 0..1 normalised
  source: string;  // traceability (evidence-id or named system)
  confidence: number; // 0..1
}

export interface RiskWeightProfile {
  name: string;
  version: string;
  weights: Partial<Record<RiskInputKind, number>>;
  description: string;
}

// Default UAE-DPMS profile. Weights sum to 1.0.
export const DPMS_UAE_WEIGHTS: RiskWeightProfile = {
  name: 'dpms_uae_default',
  version: '2025.1',
  description:
    'UAE DPMS baseline weighting. Calibrated against MoE DNFBP circulars, ' +
    'FATF RBA, and internal KPI observations. Must be re-tuned against post-' +
    'implementation performance before relying on for production dispositions.',
  weights: {
    sanctions_hit: 0.25,
    pep_status: 0.15,
    jurisdiction_tier: 0.12,
    ubo_transparency: 0.10,
    adverse_media_hits: 0.08,
    cash_intensity: 0.08,
    industry_risk: 0.06,
    product_risk: 0.05,
    channel_risk: 0.04,
    transaction_volume: 0.03,
    customer_type: 0.02,
    relationship_age: 0.01,
    screening_freshness: 0.01,
  },
};

export interface RiskScoreResult {
  methodology: string;
  profile: RiskWeightProfile;
  score: number;            // 0..1
  tier: 'low' | 'medium' | 'high' | 'very_high';
  inputs: Array<RiskInput & { weight: number; contribution: number }>;
  missingInputs: RiskInputKind[];
  caveats: string[];
  gapsThatWouldChangeScore: Array<{
    missing: RiskInputKind;
    maxImpact: number;
  }>;
  generatedAt: string;
}

function tierFromScore(s: number): RiskScoreResult['tier'] {
  if (s >= 0.75) return 'very_high';
  if (s >= 0.5) return 'high';
  if (s >= 0.25) return 'medium';
  return 'low';
}

export function scoreRisk(
  inputs: RiskInput[],
  profile: RiskWeightProfile = DPMS_UAE_WEIGHTS,
): RiskScoreResult {
  const byKind = new Map(inputs.map((i) => [i.kind, i]));
  const caveats: string[] = [];

  // Methodology: weighted mean clamped to [0,1], attenuated by confidence.
  let sum = 0;
  let weightSum = 0;
  const enriched: RiskScoreResult['inputs'] = [];
  for (const [kind, weight] of Object.entries(profile.weights) as Array<[RiskInputKind, number]>) {
    const i = byKind.get(kind);
    if (!i) continue;
    const clamped = Math.min(1, Math.max(0, i.value));
    const confidence = Math.min(1, Math.max(0, i.confidence));
    const contribution = clamped * weight * confidence;
    sum += contribution;
    weightSum += weight * confidence;
    enriched.push({ ...i, weight, contribution });
  }

  const rawScore = weightSum === 0 ? 0 : sum / weightSum;
  const score = Math.min(1, Math.max(0, rawScore));

  const missing: RiskInputKind[] = [];
  const gapsThatWouldChangeScore: RiskScoreResult['gapsThatWouldChangeScore'] = [];
  for (const [kind, weight] of Object.entries(profile.weights) as Array<[RiskInputKind, number]>) {
    if (!byKind.has(kind)) {
      missing.push(kind);
      gapsThatWouldChangeScore.push({ missing: kind, maxImpact: weight });
    }
  }

  if (missing.length > 0) {
    caveats.push(
      `score computed with ${missing.length} missing input(s); see gapsThatWouldChangeScore.`,
    );
  }
  if (weightSum < 0.5) {
    caveats.push(
      'less than 50% of profile weight covered by supplied inputs; score is provisional and must not be relied upon for final disposition.',
    );
  }
  const lowConf = enriched.filter((i) => i.confidence < 0.5);
  if (lowConf.length > 0) {
    caveats.push(
      `${lowConf.length} input(s) carried confidence < 0.5 and were attenuated.`,
    );
  }

  return {
    methodology:
      'Weighted mean over normalised input values, attenuated per-input by source confidence. ' +
      'Missing inputs reduce weight coverage and are surfaced as gaps. ' +
      'Score ∈ [0,1], tier thresholds 0.25 / 0.50 / 0.75.',
    profile,
    score,
    tier: tierFromScore(score),
    inputs: enriched,
    missingInputs: missing,
    caveats,
    gapsThatWouldChangeScore,
    generatedAt: new Date().toISOString(),
  };
}
