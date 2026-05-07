// Hawkeye Sterling — wave-3 mode: lc_confirmation_gap
// Detects unconfirmed Letters of Credit on high-value or high-risk-issuer
// transactions. Anchors: FATF R.16 (wire transfers / LC chains), FATF R.15
// (new technologies / trade finance), ICC UCP 600 (confirming bank
// obligations), Wolfsberg Trade Finance Principles 2019.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface LcTransaction {
  lcId?: string;
  issuingBank?: string;
  issuingBankCountry?: string;
  advisingBank?: string;
  confirmingBank?: string;
  beneficiaryCountry?: string;
  goods?: string;
  amountUsd?: number;
  uCpVersion?: 'UCP600' | 'UCP500' | 'other';
  at?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const FLAG_THRESHOLD_USD     = 1_000_000;
const ESCALATE_THRESHOLD_USD = 5_000_000;   // ⚠️ VERIFY against institution risk appetite

// FATF high-risk + monitored jurisdictions as of 2024 (verify annually).
const HIGH_RISK_ISSUER_COUNTRIES = new Set([
  'IR', 'KP',                     // FATF call-for-action
  'MM',                            // FATF call-for-action (Myanmar)
  'AF', 'AL', 'BB', 'BF', 'KH', 'CD', 'GI', 'HT', 'JM', 'JO', 'ML',
  'MZ', 'NI', 'PA', 'PH', 'SN', 'SS', 'SY', 'TZ', 'TR', 'UG', 'AE_FZ_HIGH', 'YE',
]);

export const lcConfirmationGapApply = async (ctx: BrainContext): Promise<Finding> => {
  const lcs = typedEvidence<LcTransaction>(ctx, 'letterOfCreditTransactions');
  if (lcs.length === 0) {
    return {
      modeId: 'lc_confirmation_gap',
      category: 'forensic' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No letterOfCreditTransactions evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  let unconfirmedCount = 0;
  let highValueUnconfirmed = 0;
  let highRiskCountryCount = 0;

  for (const lc of lcs) {
    const ref = lc.lcId ?? '(unidentified)';
    const amount = lc.amountUsd ?? 0;
    const unconfirmed = !lc.confirmingBank;
    if (unconfirmed) unconfirmedCount++;

    if (unconfirmed && amount >= ESCALATE_THRESHOLD_USD) {
      highValueUnconfirmed++;
      hits.push({ id: 'unconfirmed_high_value', label: `Unconfirmed LC USD ${amount.toLocaleString()} ≥ ${ESCALATE_THRESHOLD_USD.toLocaleString()}`, weight: 0.45, evidence: ref, severity: 'escalate' });
    } else if (unconfirmed && amount >= FLAG_THRESHOLD_USD) {
      highValueUnconfirmed++;
      hits.push({ id: 'unconfirmed_flag_value', label: `Unconfirmed LC USD ${amount.toLocaleString()} ≥ ${FLAG_THRESHOLD_USD.toLocaleString()}`, weight: 0.25, evidence: ref, severity: 'flag' });
    }

    if (lc.issuingBankCountry && HIGH_RISK_ISSUER_COUNTRIES.has(lc.issuingBankCountry.toUpperCase()) && unconfirmed) {
      highRiskCountryCount++;
      hits.push({ id: 'high_risk_issuer_unconfirmed', label: `Unconfirmed LC from FATF high-risk issuer (${lc.issuingBankCountry})`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }

    if (lc.uCpVersion && lc.uCpVersion !== 'UCP600') {
      hits.push({ id: 'obsolete_ucp', label: `Obsolete UCP version (${lc.uCpVersion})`, weight: 0.1, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'lc_confirmation_gap',
    category: 'forensic' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.04 * hits.length),
    verdict,
    rationale: [
      `${lcs.length} LC(s) reviewed. ${unconfirmedCount} unconfirmed; ${highValueUnconfirmed} > USD ${FLAG_THRESHOLD_USD.toLocaleString()}. ${highRiskCountryCount} from FATF high-risk countries.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF R.16 · FATF R.15 · ICC UCP 600 · Wolfsberg TF Principles 2019.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default lcConfirmationGapApply;
