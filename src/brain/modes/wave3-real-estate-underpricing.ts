// Hawkeye Sterling — wave-3 mode: real_estate_underpricing
// Detects UAE real-estate transactions priced significantly below
// market — a placement / value-transfer typology. Anchors: UAE Cabinet
// Res 16/2021 (RE sector AML) · FATF R.22 (DNFBPs) · MoE Circular 6/2025.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface RealEstateDeal {
  dealId: string;
  unitId: string;
  declaredPriceAed?: number;
  marketComparablePriceAed?: number;
  buyerJurisdictionIso2?: string;
  paymentMethod?: 'cash' | 'wire' | 'mortgage' | 'crypto';
  closingTimeDays?: number;
  agentLicensed?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const realEstateUnderpricingApply = async (ctx: BrainContext): Promise<Finding> => {
  const deals = typedEvidence<RealEstateDeal>(ctx, 'realEstateDeals');
  if (deals.length === 0) {
    return {
      modeId: 'real_estate_underpricing',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No realEstateDeals evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const d of deals) {
    if (d.declaredPriceAed !== undefined && d.marketComparablePriceAed !== undefined && d.marketComparablePriceAed > 0) {
      const ratio = d.declaredPriceAed / d.marketComparablePriceAed;
      if (ratio <= 0.7) {
        hits.push({ id: 'under_market', label: `Declared ${(ratio * 100).toFixed(0)}% of market`, weight: Math.min(0.4, 0.15 + (0.7 - ratio) * 0.5), evidence: `${d.dealId}: ${d.declaredPriceAed} vs market ${d.marketComparablePriceAed}` });
      } else if (ratio >= 1.3) {
        hits.push({ id: 'over_market', label: `Declared ${(ratio * 100).toFixed(0)}% of market`, weight: 0.25, evidence: `${d.dealId}: ${d.declaredPriceAed} vs market ${d.marketComparablePriceAed}` });
      }
    }
    if (d.paymentMethod === 'cash' && (d.declaredPriceAed ?? 0) >= 1_000_000) {
      hits.push({ id: 'high_value_cash', label: `Cash payment AED${(d.declaredPriceAed ?? 0).toLocaleString()}`, weight: 0.35, evidence: d.dealId });
    }
    if (d.paymentMethod === 'crypto') {
      hits.push({ id: 'crypto_settled', label: 'Crypto-settled real-estate deal', weight: 0.25, evidence: d.dealId });
    }
    if ((d.closingTimeDays ?? Infinity) <= 3) {
      hits.push({ id: 'rapid_closing', label: `Closing in ${d.closingTimeDays}d`, weight: 0.15, evidence: d.dealId });
    }
    if (d.agentLicensed === false) {
      hits.push({ id: 'unlicensed_agent', label: 'Unlicensed broker', weight: 0.2, evidence: d.dealId });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'real_estate_underpricing',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} RE-pricing signal(s) over ${deals.length} deal(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: UAE Cabinet Res 16/2021 · FATF R.22 · MoE Circular 6/2025.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default realEstateUnderpricingApply;
