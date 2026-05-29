// Hawkeye Sterling — SHAP-Style Score Decomposer (Wave 14 Feature 4).
// Decomposes composite risk scores into per-feature attributions using a
// linear additive SHAP approximation over the evidence-weighted-fusion breakdown.
// No external dependencies. UAE FDL 10/2025 Art.18 / EU AI Act Art.13.

export interface ScoreBreakdown {
  quickScreen?: number;
  jurisdictionPenalty?: number;
  regimesPenalty?: number;
  redlinesPenalty?: number;
  adverseMediaPenalty?: number;
  adverseKeywordPenalty?: number;
  pepPenalty?: number;
  [key: string]: number | undefined;
}

export interface ShapContribution {
  feature: string;
  displayName: string;
  shapValue: number;           // points contributed to total score
  shapPercent: number;         // percentage of total score
  counterfactualScore: number; // score if this feature were 0
  ci: { low: number; high: number };
  direction: 'increases_risk' | 'neutral';
  explanation: string;
}

export interface ShapDecomposition {
  totalScore: number;
  baseline: number;
  contributions: ShapContribution[];
  dominantFeature: string;
  methodology: string;
}

const DISPLAY_NAMES: Record<string, string> = {
  quickScreen: 'Sanctions-list proximity',
  jurisdictionPenalty: 'Jurisdiction risk tier',
  regimesPenalty: 'Sanctions regime exposure',
  redlinesPenalty: 'Redline conditions',
  adverseMediaPenalty: 'Adverse media severity',
  adverseKeywordPenalty: 'Adverse keyword signal',
  pepPenalty: 'PEP salience',
};

function displayName(feature: string): string {
  return DISPLAY_NAMES[feature] ?? feature.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function explain(feature: string, shapValue: number, counterfactualScore: number, totalScore: number): string {
  const pct = totalScore > 0 ? ((shapValue / totalScore) * 100).toFixed(0) : '0';
  return `${displayName(feature)} contributed ${shapValue.toFixed(1)} points (≈${pct}% of score). ` +
    `If this factor were absent, score would be ${counterfactualScore.toFixed(0)}.`;
}

export function decomposeScore(
  compositeScore: number,
  breakdown: ScoreBreakdown,
): ShapDecomposition {
  const baseline = 0;
  const features = Object.entries(breakdown).filter(([, v]) => v !== undefined && v > 0) as Array<[string, number]>;
  const totalPenalty = features.reduce((s, [, v]) => s + v, 0);

  const contributions: ShapContribution[] = features
    .map(([feature, value]) => {
      const shapValue = totalPenalty > 0 ? (value / totalPenalty) * (compositeScore - baseline) : 0;
      const counterfactualScore = compositeScore - shapValue;
      // Conservative CI: ±15% (would come from 30-day rolling variance in production)
      const ci = { low: shapValue * 0.85, high: shapValue * 1.15 };
      return {
        feature,
        displayName: displayName(feature),
        shapValue,
        shapPercent: compositeScore > 0 ? (shapValue / compositeScore) * 100 : 0,
        counterfactualScore,
        ci,
        direction: 'increases_risk' as const,
        explanation: explain(feature, shapValue, counterfactualScore, compositeScore),
      };
    })
    .sort((a, b) => b.shapValue - a.shapValue);

  const dominantFeature = contributions[0]?.feature ?? 'unknown';

  return {
    totalScore: compositeScore,
    baseline,
    contributions,
    dominantFeature,
    methodology: 'Linear additive SHAP approximation: φᵢ = (penaltyᵢ / Σpenalties) × (score − baseline). ' +
      'CI: ±15% conservative band. UAE FDL 10/2025 Art.18 / EU AI Act Art.13.',
  };
}
