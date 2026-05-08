// Hawkeye Sterling — wave-3 mode: re_golden_visa_investment
// Detects real-estate purchases tied to UAE Golden Visa eligibility.
// The investor route requires AED 2M+ in property; below-threshold
// purchases marketed as visa-eligible are a structuring red flag.
// Anchors: UAE Cabinet Decision 56/2018 (long-term residence visas);
// UAE Cabinet Resolution 65/2022 (Golden Visa expansion);
// FATF R.10 + R.22 (CDD + DNFBPs).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface GoldenVisaPurchase {
  txnId?: string;
  buyerId?: string;
  propertyValueAed?: number;
  buyerNationality?: string;
  isMarketedAsGoldenVisa?: boolean;     // sales pitch / brochure flagged it
  buyerVisaApplicationOpened?: boolean; // ICA / ICP record exists
  paymentBreakdownAed?: { cash?: number; mortgage?: number; transfer?: number };
  at?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const GOLDEN_VISA_THRESHOLD_AED = 2_000_000; // CD 56/2018 + CR 65/2022 — investor route minimum

export const reGoldenVisaInvestmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<GoldenVisaPurchase>(ctx, 'realEstateGoldenVisaPurchases');
  if (txns.length === 0) {
    return {
      modeId: 're_golden_visa_investment',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No realEstateGoldenVisaPurchases evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const t of txns) {
    const ref = t.txnId ?? '(unidentified)';
    const value = t.propertyValueAed ?? 0;
    const cash = t.paymentBreakdownAed?.cash ?? 0;

    if (t.isMarketedAsGoldenVisa && value < GOLDEN_VISA_THRESHOLD_AED) {
      hits.push({ id: 'sub_threshold_marketed', label: `Marketed as Golden-Visa eligible but value AED ${value.toLocaleString()} < ${GOLDEN_VISA_THRESHOLD_AED.toLocaleString()}`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (t.buyerVisaApplicationOpened && value < GOLDEN_VISA_THRESHOLD_AED) {
      hits.push({ id: 'visa_app_sub_threshold', label: `Visa application opened with sub-threshold purchase (AED ${value.toLocaleString()})`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (value >= GOLDEN_VISA_THRESHOLD_AED && cash >= 0.5 * value) {
      hits.push({ id: 'high_cash_investor', label: `Golden-Visa-tier purchase paid ≥50% in cash (AED ${cash.toLocaleString()})`, weight: 0.35, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 're_golden_visa_investment',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${txns.length} purchase(s) reviewed; ${hits.length} Golden-Visa signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: UAE CD 56/2018 · UAE CR 65/2022 · FATF R.10 + R.22.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default reGoldenVisaInvestmentApply;
