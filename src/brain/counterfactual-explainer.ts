// Hawkeye Sterling — Adversarial Counterfactual Explainer (Wave 14 Feature 2).
// Generates regulator-facing explanations: "what factual change to the evidence
// record would make this decision not triggerable?"
// Distinct from evader-simulator.ts (criminal evasion) — this is a compliance
// transparency and defensibility tool.

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

export interface CounterfactualItem {
  driverId: string;
  currentValue: number;
  deltaRequired: number;
  counterfactualValue: number;
  description: string;
  wouldFlipTo: 'clear' | 'flag' | 'escalate';
  plausibility: 'high' | 'medium' | 'low';
  regulatoryDefence: string;
}

export interface CounterfactualExplanation {
  originalVerdict: string;
  originalScore: number;
  escalationThreshold: number;
  counterfactuals: CounterfactualItem[];
  immovableFactors: string[];
  regulatoryStatement: string;
  methodology: string;
}

const ESCALATION_THRESHOLD = 60;
const FLAG_THRESHOLD = 30;

const REGULATORY_DEFENCES: Record<string, string> = {
  pepPenalty: 'PEP status triggers mandatory EDD under UAE FDL 10/2025 Art.6(3) and FATF R.12. ' +
    'This factor cannot be reduced below the statutory EDD threshold by any evidence change.',
  redlinesPenalty: 'Redline conditions (confirmed sanctions, court orders) are non-negotiable ' +
    'under UAE FDL 10/2025 Art.14 and Cabinet Decision 74/2020. ' +
    'No counterfactual can clear a confirmed designation.',
  adverseMediaPenalty: 'Adverse media is a mandatory consideration under UAE FDL 10/2025 Art.5. ' +
    'Score would change if adverse media were resolved, retracted, or shown to involve a ' +
    'different individual with full documentary evidence.',
  jurisdictionPenalty: 'Jurisdiction risk is assessed against the FATF grey/black list and ' +
    'CBUAE high-risk-country directive. Score would change if the subject relocated ' +
    'to a FATF-compliant jurisdiction with documentary evidence of residency.',
  regimesPenalty: 'Sanctions regime exposure requires full de-listing from the applicable ' +
    'designating authority. Partial mitigation is not available under UAE Cabinet Decision 74/2020.',
  quickScreen: 'Sanctions-list proximity is determined by the authoritative list at the time ' +
    'of screening. Score changes only on confirmed negative disambiguation by the MLRO.',
  adverseKeywordPenalty: 'Adverse keyword signals require documentary rebuttal from an ' +
    'independent authoritative source to reduce this score component.',
};

function humaniseDriver(driverId: string): string {
  const map: Record<string, string> = {
    pepPenalty: 'PEP salience',
    redlinesPenalty: 'Redline conditions (sanctions/court orders)',
    adverseMediaPenalty: 'Adverse media severity',
    jurisdictionPenalty: 'Jurisdiction risk tier',
    regimesPenalty: 'Sanctions regime exposure',
    quickScreen: 'Sanctions-list proximity score',
    adverseKeywordPenalty: 'Adverse keyword signal',
  };
  return map[driverId] ?? driverId;
}

function plausibilityFor(driverId: string, delta: number): 'high' | 'medium' | 'low' {
  if (driverId === 'redlinesPenalty') return 'low';
  if (driverId === 'pepPenalty') return 'low';
  if (delta > 20) return 'low';
  if (delta > 10) return 'medium';
  return 'high';
}

function verdictAt(score: number): 'clear' | 'flag' | 'escalate' {
  if (score >= ESCALATION_THRESHOLD) return 'escalate';
  if (score >= FLAG_THRESHOLD) return 'flag';
  return 'clear';
}

const IMMOVABLE_DRIVER_IDS = new Set(['redlinesPenalty']);

export function explainDecision(
  verdict: string,
  score: number,
  breakdown: ScoreBreakdown,
): CounterfactualExplanation {
  const sortedDrivers = (Object.entries(breakdown) as Array<[string, number | undefined]>)
    .filter(([, v]) => v !== undefined && v > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0)) as Array<[string, number]>;

  const immovableFactors: string[] = [];
  const counterfactuals: CounterfactualItem[] = [];

  for (const [driverId, contribution] of sortedDrivers) {
    if (IMMOVABLE_DRIVER_IDS.has(driverId)) {
      immovableFactors.push(
        `${humaniseDriver(driverId)}: ${REGULATORY_DEFENCES[driverId] ?? 'Cannot be changed by evidence.'}`,
      );
      continue;
    }

    // Compute the delta needed to drop below the next tier threshold
    const target = verdict === 'escalate' ? ESCALATION_THRESHOLD - 1 : FLAG_THRESHOLD - 1;
    const delta = Math.max(0, score - target);
    const deltaFromDriver = Math.min(contribution, delta);
    const counterfactualScore = score - deltaFromDriver;
    const counterfactualValue = Math.max(0, contribution - deltaFromDriver);

    counterfactuals.push({
      driverId,
      currentValue: contribution,
      deltaRequired: deltaFromDriver,
      counterfactualValue,
      description: `If ${humaniseDriver(driverId)} were reduced by ${deltaFromDriver.toFixed(1)} points ` +
        `(from ${contribution.toFixed(1)} to ${counterfactualValue.toFixed(1)}), ` +
        `composite score would fall to ${counterfactualScore.toFixed(0)} (${verdictAt(counterfactualScore)}).`,
      wouldFlipTo: verdictAt(counterfactualScore),
      plausibility: plausibilityFor(driverId, deltaFromDriver),
      regulatoryDefence: REGULATORY_DEFENCES[driverId] ?? `${humaniseDriver(driverId)} can be reduced with sufficient documentary evidence presented to the MLRO.`,
    });
  }

  const flippable = counterfactuals.filter((c) => c.wouldFlipTo !== verdict);
  const regulatoryStatement = flippable.length
    ? `This decision is defensible under UAE FDL 10/2025 Art.16. The primary driver is ` +
      `${humaniseDriver(sortedDrivers[0]?.[0] ?? 'unknown')}. The decision would change only if: ` +
      flippable.slice(0, 2).map((c) => c.description).join(' OR ') +
      ` Immovable factors (${immovableFactors.length}): ${immovableFactors.map((f) => f.split(':')[0]).join(', ') || 'none'}.`
    : `This decision is not reversible by any single evidence change. All primary drivers are ` +
      `either immovable (regulatory designations) or collectively require simultaneous rebuttal.`;

  return {
    originalVerdict: verdict,
    originalScore: score,
    escalationThreshold: ESCALATION_THRESHOLD,
    counterfactuals,
    immovableFactors,
    regulatoryStatement,
    methodology: 'Linear causal decomposition over composite score breakdown. ' +
      'Minimal-flip-set algorithm. UAE FDL 10/2025 Art.16 / FATF IO.6.',
  };
}
