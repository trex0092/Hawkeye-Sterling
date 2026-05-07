// Hawkeye Sterling — wave-3 mode: npo_programme_vs_cash_ratio
// Detects NPOs whose programme spending vs cash holdings ratio falls
// outside FATF-recommended transparency bands. NPOs holding excessive
// cash relative to programme expenditure indicate diversion risk.
// Anchors: FATF R.8 (NPO sector — programme expenditure ratio),
// UAE Cabinet Decision 50/2018 Art.7 (NPO financial reporting),
// FATF Best-Practice Paper on Combating the Abuse of NPOs (2015).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface NpoFinancials {
  npoId?: string;
  reportingYear?: string;
  totalRevenueAed?: number;
  programmeExpenditureAed?: number;     // direct charitable spend
  administrativeExpenditureAed?: number;
  fundraisingExpenditureAed?: number;
  cashOnHandAed?: number;
  totalAssetsAed?: number;
  hasAuditedAccounts?: boolean;
  auditOpinion?: 'unqualified' | 'qualified' | 'adverse' | 'disclaimer';
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FATF Best-Practice Paper 2015 §5.4 — programme spend should be ≥65% of
// total expenditure. Below 50% indicates significant diversion risk.
const PROGRAMME_RATIO_FLAG     = 0.65;
const PROGRAMME_RATIO_ESCALATE = 0.50;
const CASH_TO_REVENUE_FLAG     = 1.0;   // holding > 1× annual revenue in cash

export const npoProgrammeVsCashRatioApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<NpoFinancials>(ctx, 'npoFinancials');
  if (items.length === 0) {
    return {
      modeId: 'npo_programme_vs_cash_ratio',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No npoFinancials evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const f of items) {
    const ref = `${f.npoId ?? '?'}@${f.reportingYear ?? '?'}`;
    const programme = f.programmeExpenditureAed ?? 0;
    const admin = f.administrativeExpenditureAed ?? 0;
    const fundraising = f.fundraisingExpenditureAed ?? 0;
    const totalExpenditure = programme + admin + fundraising;
    const programmeRatio = totalExpenditure > 0 ? programme / totalExpenditure : 1;
    const revenue = f.totalRevenueAed ?? 0;
    const cash = f.cashOnHandAed ?? 0;
    const cashToRevenue = revenue > 0 ? cash / revenue : 0;

    if (programmeRatio < PROGRAMME_RATIO_ESCALATE) {
      hits.push({ id: 'programme_ratio_critical', label: `Programme spend ${(programmeRatio * 100).toFixed(0)}% of total expenditure (< ${(PROGRAMME_RATIO_ESCALATE * 100)}%)`, weight: 0.5, evidence: ref, severity: 'escalate' });
    } else if (programmeRatio < PROGRAMME_RATIO_FLAG) {
      hits.push({ id: 'programme_ratio_flag', label: `Programme spend ${(programmeRatio * 100).toFixed(0)}% of total expenditure (< ${(PROGRAMME_RATIO_FLAG * 100)}%)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (cashToRevenue > CASH_TO_REVENUE_FLAG) {
      hits.push({ id: 'excess_cash_holdings', label: `Cash holdings ${cashToRevenue.toFixed(1)}× annual revenue (> ${CASH_TO_REVENUE_FLAG}×)`, weight: 0.35, evidence: ref, severity: 'flag' });
    }
    if (f.hasAuditedAccounts === false) {
      hits.push({ id: 'no_audited_accounts', label: 'No audited accounts (CD 50/2018 Art.7)', weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (f.auditOpinion === 'adverse' || f.auditOpinion === 'disclaimer') {
      hits.push({ id: 'adverse_audit', label: `Audit opinion: ${f.auditOpinion}`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'npo_programme_vs_cash_ratio',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} NPO financial year(s) reviewed; ${hits.length} programme/cash signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF R.8 · FATF Best-Practice Paper on NPO Abuse 2015 · UAE CD 50/2018 Art.7.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default npoProgrammeVsCashRatioApply;
