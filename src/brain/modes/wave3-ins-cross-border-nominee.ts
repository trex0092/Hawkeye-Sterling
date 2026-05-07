// Hawkeye Sterling — wave-3 mode: ins_cross_border_nominee
// Detects life-insurance policies funded from one jurisdiction with
// beneficiaries / payouts in a second jurisdiction via apparent-nominee
// arrangements. Anchors: FATF Risk-Based Approach for Life Insurance
// (Oct 2018) §3.7 (cross-border policies), IAIS Application Paper on
// AML/CFT (Nov 2019) §5, UAE CBUAE Insurance Authority Regulation
// 26/2014 (cross-border CDD requirements).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CrossBorderPolicy {
  policyId?: string;
  policyholderJurisdiction?: string;          // ISO-2
  policyholderResidency?: string;             // ISO-2
  premiumSourceJurisdiction?: string;         // ISO-2
  premiumSourceFatfHighRisk?: boolean;
  beneficiaryJurisdiction?: string;
  beneficiaryFatfHighRisk?: boolean;
  payoutJurisdiction?: string;
  payoutAccountInThirdParty?: boolean;
  hasNomineeIndicators?: boolean;             // policyholder ≠ beneficial owner of premium
  policyValueAed?: number;
  uaeCbuaeNotificationFiled?: boolean;        // CBUAE Reg 26/2014 cross-border filing
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const insCrossBorderNomineeApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<CrossBorderPolicy>(ctx, 'crossBorderPolicies');
  if (items.length === 0) {
    return {
      modeId: 'ins_cross_border_nominee',
      category: 'sectoral_typology' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No crossBorderPolicies evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const p of items) {
    const ref = p.policyId ?? '(unidentified)';
    const ph = (p.policyholderJurisdiction ?? '').toUpperCase();
    const src = (p.premiumSourceJurisdiction ?? '').toUpperCase();
    const ben = (p.beneficiaryJurisdiction ?? '').toUpperCase();
    const pay = (p.payoutJurisdiction ?? '').toUpperCase();

    // 3+ distinct jurisdictions across the chain = layering vehicle.
    const distinct = new Set([ph, src, ben, pay].filter(Boolean));
    if (distinct.size >= 3) {
      hits.push({ id: 'three_jurisdictions', label: `Policy spans ${distinct.size} jurisdictions (${[...distinct].join(', ')})`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (src && src !== ph) {
      hits.push({ id: 'premium_source_mismatch', label: `Premium funded from ${src} but policyholder in ${ph}`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (p.premiumSourceFatfHighRisk === true) {
      hits.push({ id: 'high_risk_funding_source', label: `Premium sourced from FATF high-risk jurisdiction (${src})`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (p.beneficiaryFatfHighRisk === true) {
      hits.push({ id: 'high_risk_beneficiary', label: `Beneficiary in FATF high-risk jurisdiction (${ben})`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (p.hasNomineeIndicators === true) {
      hits.push({ id: 'nominee_indicators', label: 'Policyholder appears to be nominee (not beneficial owner of premium)', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (p.payoutAccountInThirdParty === true) {
      hits.push({ id: 'third_party_payout', label: 'Payout directed to third-party account', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (distinct.size >= 2 && p.uaeCbuaeNotificationFiled === false) {
      hits.push({ id: 'no_cbuae_notification', label: 'Cross-border policy without CBUAE Reg 26/2014 notification', weight: 0.3, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'ins_cross_border_nominee',
    category: 'sectoral_typology' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} cross-border policy(ies) reviewed; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF Life-Insurance Guidance Oct 2018 §3.7 · IAIS Application Paper Nov 2019 §5 · UAE CBUAE Reg 26/2014.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default insCrossBorderNomineeApply;
