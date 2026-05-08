// Hawkeye Sterling — wave-3 mode: ins_single_premium_scrutiny
// Detects high-value single-premium life-insurance products that are
// the textbook placement-stage vehicle. Anchors: FATF Risk-Based
// Approach for Life Insurance (Oct 2018) §3.4 (single-premium policies
// listed as elevated-risk product), IAIS ICP 22, UAE CBUAE Insurance
// Authority Regulation 26/2014.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SinglePremiumPolicy {
  policyId?: string;
  customerId?: string;
  premiumAmountAed?: number;
  premiumPaymentMethod?: 'wire' | 'cheque' | 'cash' | 'crypto' | 'multiple_smaller_payments';
  isSinglePremium?: boolean;
  productType?: 'whole_life' | 'universal_life' | 'unit_linked' | 'annuity' | 'investment_bond';
  customerSourceOfFundsDocumented?: boolean;
  customerIsPep?: boolean;
  customerJurisdictionFatfHighRisk?: boolean;
  edDdPerformed?: boolean;                  // Enhanced Due Diligence per FATF R.10 + R.12
  paidInMultipleTranches?: boolean;          // structuring red flag
  trancheCount?: number;
  issuedAt?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FATF §3.4: single-premium ≥ USD 50,000 (≈ AED 184k) is a baseline
// scrutiny trigger across most jurisdictions. UAE CBUAE Reg 26/2014
// applies CDD floor at AED 55,000 (≈ USD 15k).
const SCRUTINY_THRESHOLD_AED = 184_000;        // ≈ USD 50k
const ESCALATE_THRESHOLD_AED = 1_000_000;      // ≈ USD 270k — material

export const insSinglePremiumScrutinyApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<SinglePremiumPolicy>(ctx, 'singlePremiumPolicies');
  if (items.length === 0) {
    return {
      modeId: 'ins_single_premium_scrutiny',
      category: 'sectoral_typology' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No singlePremiumPolicies evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const p of items) {
    const ref = p.policyId ?? '(unidentified)';
    const amt = p.premiumAmountAed ?? 0;
    const isSingle = p.isSinglePremium === true;

    if (isSingle && amt >= ESCALATE_THRESHOLD_AED) {
      hits.push({ id: 'large_single_premium', label: `Single premium AED ${amt.toLocaleString()} (≥${ESCALATE_THRESHOLD_AED.toLocaleString()})`, weight: 0.4, evidence: ref, severity: 'escalate' });
    } else if (isSingle && amt >= SCRUTINY_THRESHOLD_AED) {
      hits.push({ id: 'material_single_premium', label: `Single premium AED ${amt.toLocaleString()} (≥${SCRUTINY_THRESHOLD_AED.toLocaleString()})`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (isSingle && amt >= SCRUTINY_THRESHOLD_AED && p.customerSourceOfFundsDocumented === false) {
      hits.push({ id: 'no_sof_documentation', label: 'High-value single premium without source-of-funds documentation', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (isSingle && amt >= SCRUTINY_THRESHOLD_AED && p.edDdPerformed === false) {
      hits.push({ id: 'no_edd', label: 'High-value single premium without EDD (FATF R.10 + R.12)', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (p.paidInMultipleTranches === true && (p.trancheCount ?? 0) >= 3) {
      hits.push({ id: 'tranche_structuring', label: `Single-premium product paid in ${p.trancheCount} tranches (structuring indicator)`, weight: 0.45, evidence: ref, severity: 'escalate' });
    }
    if (p.premiumPaymentMethod === 'cash') {
      hits.push({ id: 'cash_premium', label: 'Single premium paid in cash', weight: 0.35, evidence: ref, severity: 'flag' });
    }
    if (p.premiumPaymentMethod === 'crypto') {
      hits.push({ id: 'crypto_premium', label: 'Single premium paid in crypto', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (isSingle && amt >= SCRUTINY_THRESHOLD_AED && p.customerIsPep === true && p.edDdPerformed === false) {
      hits.push({ id: 'pep_no_edd', label: 'PEP customer + high-value single premium + no EDD', weight: 0.55, evidence: ref, severity: 'escalate' });
    }
    if (isSingle && amt >= SCRUTINY_THRESHOLD_AED && p.customerJurisdictionFatfHighRisk === true) {
      hits.push({ id: 'high_risk_jurisdiction_customer', label: 'Customer in FATF high-risk jurisdiction with high-value single premium', weight: 0.45, evidence: ref, severity: 'escalate' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'ins_single_premium_scrutiny',
    category: 'sectoral_typology' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} single-premium policy(ies) reviewed; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF Life-Insurance Guidance Oct 2018 §3.4 · IAIS ICP 22 · UAE CBUAE Reg 26/2014.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default insSinglePremiumScrutinyApply;
