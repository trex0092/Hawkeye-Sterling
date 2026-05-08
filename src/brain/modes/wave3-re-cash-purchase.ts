// Hawkeye Sterling — wave-3 mode: re_cash_purchase_check
// Triggers on cash-component thresholds for real-estate transactions.
// Anchors: UAE FDL 10/2025 Art.18 (DNFBP CDD for real-estate brokers),
// UAE Cabinet Resolution 134/2025 Art.3 (AED 55,000 cash threshold —
// applied by analogy to real-estate per the DNFBP framework),
// FATF R.22 (DNFBPs incl. real-estate agents) + R.10 (CDD).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface RealEstateTxn {
  txnId?: string;
  buyerId?: string;
  propertyValueAed?: number;
  cashComponentAed?: number;
  financingComponentAed?: number;
  jurisdiction?: string;
  at?: string;
  isOffPlan?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// Threshold anchors: CR 134/2025 Art.3 = AED 55,000 (DPMS); applied by
// analogy to real-estate. Higher escalation tier (AED 100,000) is an
// institution-risk-tier interpolation pending MLRO sign-off (see
// WAVE_3_SPEC_DRAFTS.md ⚠️ VERIFY).
const CASH_FLAG_THRESHOLD_AED     = 55_000;
const CASH_ESCALATE_THRESHOLD_AED = 100_000;
const CASH_PCT_FLAG               = 0.5;
const CASH_PCT_ESCALATE           = 0.8;

export const reCashPurchaseCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<RealEstateTxn>(ctx, 'realEstateTransactions');
  if (txns.length === 0) {
    return {
      modeId: 're_cash_purchase_check',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No realEstateTransactions evidence supplied; re_cash_purchase_check requires evidence.realEstateTransactions[].',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  let highestVerdict: Verdict = 'clear';
  for (const t of txns) {
    const cash = t.cashComponentAed ?? 0;
    const total = t.propertyValueAed ?? Math.max(cash + (t.financingComponentAed ?? 0), 1);
    const cashPct = total > 0 ? cash / total : 0;
    const ref = t.txnId ?? '(unidentified)';

    if (cash >= CASH_ESCALATE_THRESHOLD_AED) {
      hits.push({ id: 'cash_escalate', label: `Cash component AED ${cash.toLocaleString()} ≥ ${CASH_ESCALATE_THRESHOLD_AED.toLocaleString()}`, weight: 0.4, evidence: ref });
      highestVerdict = 'escalate';
    } else if (cash >= CASH_FLAG_THRESHOLD_AED) {
      hits.push({ id: 'cash_flag', label: `Cash component AED ${cash.toLocaleString()} ≥ ${CASH_FLAG_THRESHOLD_AED.toLocaleString()}`, weight: 0.25, evidence: ref });
      if (highestVerdict === 'clear') highestVerdict = 'flag';
    }
    if (cashPct >= CASH_PCT_ESCALATE) {
      hits.push({ id: 'cash_pct_escalate', label: `${(cashPct * 100).toFixed(0)}% of property value paid in cash (≥${CASH_PCT_ESCALATE * 100}%)`, weight: 0.35, evidence: ref });
      highestVerdict = 'escalate';
    } else if (cashPct >= CASH_PCT_FLAG) {
      hits.push({ id: 'cash_pct_flag', label: `${(cashPct * 100).toFixed(0)}% of property value paid in cash (≥${CASH_PCT_FLAG * 100}%)`, weight: 0.2, evidence: ref });
      if (highestVerdict === 'clear') highestVerdict = 'flag';
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const summary = hits.length > 0
    ? `${hits.length} cash-purchase signal(s) across ${txns.length} real-estate txn(s); composite ${score.toFixed(2)}.`
    : `${txns.length} real-estate txn(s) reviewed — all under cash thresholds.`;
  const detail = hits.slice(0, 6).map((h) => h.label).join('; ');

  return {
    modeId: 're_cash_purchase_check',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length),
    verdict: highestVerdict,
    rationale: [
      summary,
      detail ? `Signals: ${detail}.` : '',
      'Anchors: UAE FDL 10/2025 Art.18 · CR 134/2025 Art.3 · FATF R.22 · FATF R.10.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default reCashPurchaseCheckApply;
