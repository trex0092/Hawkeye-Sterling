// Hawkeye Sterling — wave-3 mode: ins_premium_overfund
// Detects premium overfunding / top-ups beyond stated coverage need —
// a layering / placement vehicle when paired with subsequent partial
// withdrawals. Anchors: FATF Risk-Based Approach for Life Insurance
// (Oct 2018) §3.5, IAIS ICP 22, UAE CBUAE Reg 26/2014.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface PolicyFunding {
  policyId?: string;
  customerId?: string;
  scheduledAnnualPremiumAed?: number;
  actualPremiumPaidYtdAed?: number;
  topUpsCountYtd?: number;
  topUpsValueYtdAed?: number;
  partialWithdrawalsYtdAed?: number;
  hasFinancialJustification?: boolean;       // documented underwriting basis for over-funding
  customerStatedNeedAed?: number;
  reportingYear?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FATF §3.5: premium ≥ 1.5× scheduled is a "may be a layering vehicle"
// indicator. Combined with same-year partial withdrawal it becomes a
// near-certain typology hit.
const OVERFUND_FLAG_RATIO = 1.5;
const OVERFUND_ESCALATE_RATIO = 3.0;

export const insPremiumOverfundApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<PolicyFunding>(ctx, 'policyFunding');
  if (items.length === 0) {
    return {
      modeId: 'ins_premium_overfund',
      category: 'sectoral_typology' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No policyFunding evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const f of items) {
    const ref = `${f.policyId ?? '?'}@${f.reportingYear ?? '?'}`;
    const scheduled = f.scheduledAnnualPremiumAed ?? 0;
    const actual = f.actualPremiumPaidYtdAed ?? 0;
    const ratio = scheduled > 0 ? actual / scheduled : 0;
    const topUpsValue = f.topUpsValueYtdAed ?? 0;
    const withdrawals = f.partialWithdrawalsYtdAed ?? 0;

    if (scheduled > 0 && ratio >= OVERFUND_ESCALATE_RATIO) {
      hits.push({ id: 'overfund_extreme', label: `Premium paid ${ratio.toFixed(1)}× scheduled (≥${OVERFUND_ESCALATE_RATIO}×)`, weight: 0.5, evidence: ref, severity: 'escalate' });
    } else if (scheduled > 0 && ratio >= OVERFUND_FLAG_RATIO) {
      hits.push({ id: 'overfund_significant', label: `Premium paid ${ratio.toFixed(1)}× scheduled (≥${OVERFUND_FLAG_RATIO}×)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (topUpsValue > 0 && withdrawals > 0) {
      const churn = Math.min(topUpsValue, withdrawals);
      const churnRatio = scheduled > 0 ? churn / scheduled : 0;
      if (churnRatio >= 0.5) {
        hits.push({ id: 'topup_withdraw_churn', label: `Top-ups + same-year withdrawals = ${(churnRatio * 100).toFixed(0)}% of scheduled premium (FATF §3.5 layering)`, weight: 0.5, evidence: ref, severity: 'escalate' });
      }
    }
    if ((f.topUpsCountYtd ?? 0) >= 5) {
      hits.push({ id: 'frequent_top_ups', label: `${f.topUpsCountYtd} top-ups in year (≥5)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (ratio >= OVERFUND_FLAG_RATIO && f.hasFinancialJustification === false) {
      hits.push({ id: 'overfund_no_justification', label: 'Material over-funding without documented underwriting justification', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'ins_premium_overfund',
    category: 'sectoral_typology' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} policy-year(s) reviewed; ${hits.length} overfunding signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF Life-Insurance Guidance Oct 2018 §3.5 · IAIS ICP 22 · UAE CBUAE Reg 26/2014.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default insPremiumOverfundApply;
