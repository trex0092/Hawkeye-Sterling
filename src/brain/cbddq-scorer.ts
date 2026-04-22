// Hawkeye Sterling — CBDDQ scorer.
// Turns Wolfsberg-CBDDQ responses into an overall control-maturity tier
// (initial / developing / defined / managed / optimising) with section-level
// weightings. All inputs + weights are explicit (charter P9).

import { CBDDQ, type CbddqSection } from './wolfsberg-cbddq.js';

export type ResponseScore = 0 | 25 | 50 | 75 | 100;

export interface CbddqResponse {
  questionId: string;
  score: ResponseScore;
  evidenceIds?: string[];
  note?: string;
}

export interface CbddqScorecard {
  overall: number;  // 0..100
  tier: 'initial' | 'developing' | 'defined' | 'managed' | 'optimising';
  sectionScores: Record<CbddqSection, number>;
  missingAnswers: string[];
  weightsUsed: Record<CbddqSection, number>;
  caveats: string[];
}

// Default section weights. Must sum to 1.0.
export const CBDDQ_SECTION_WEIGHTS: Record<CbddqSection, number> = {
  entity_overview: 0.04,
  ownership_management: 0.08,
  products_services: 0.08,
  aml_cft_programme: 0.12,
  kyc_cdd_edd: 0.14,
  pep_screening: 0.08,
  sanctions: 0.14,
  transaction_monitoring: 0.12,
  risk_assessment: 0.08,
  training_awareness: 0.04,
  audit: 0.04,
  reporting_recordkeeping: 0.04,
};

function tierFor(score: number): CbddqScorecard['tier'] {
  if (score >= 85) return 'optimising';
  if (score >= 70) return 'managed';
  if (score >= 55) return 'defined';
  if (score >= 35) return 'developing';
  return 'initial';
}

export function scoreCbddq(
  responses: CbddqResponse[],
  weights: Record<CbddqSection, number> = CBDDQ_SECTION_WEIGHTS,
): CbddqScorecard {
  const byId = new Map(responses.map((r) => [r.questionId, r]));
  const sectionSums: Record<string, { sum: number; n: number }> = {};
  const missing: string[] = [];
  for (const q of CBDDQ) {
    const r = byId.get(q.id);
    const s = (sectionSums[q.section] ||= { sum: 0, n: 0 });
    if (!r) { missing.push(q.id); continue; }
    s.sum += r.score; s.n += 1;
  }
  const sectionScores: Partial<Record<CbddqSection, number>> = {};
  for (const key of Object.keys(sectionSums)) {
    const v = sectionSums[key]!;
    sectionScores[key as CbddqSection] = v.n === 0 ? 0 : v.sum / v.n;
  }
  let overall = 0;
  for (const [section, w] of Object.entries(weights) as Array<[CbddqSection, number]>) {
    overall += (sectionScores[section] ?? 0) * w;
  }
  const caveats: string[] = [];
  if (missing.length > 0) caveats.push(`${missing.length} CBDDQ questions unanswered; score is provisional.`);
  return {
    overall: Math.round(overall * 100) / 100,
    tier: tierFor(overall),
    sectionScores: sectionScores as Record<CbddqSection, number>,
    missingAnswers: missing,
    weightsUsed: weights,
    caveats,
  };
}
