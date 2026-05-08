// Hawkeye Sterling — wave-3 mode: invoice_redirection_trace
// Detects invoice-redirection fraud: a previously-trusted vendor
// invoice arrives with new bank details, triggering a wire to an
// attacker-controlled account. Anchors: FBI IC3 BEC Annual Report
// ("Vendor Email Compromise" sub-typology), UK Action Fraud BEC
// Typology Bulletin, FFIEC IT Examination Handbook (Wholesale
// Payment Systems §6.B), UAE CBUAE Cyber Risk Management Standard
// 21/2018.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface InvoicePaymentEvent {
  invoiceId?: string;
  vendorId?: string;
  vendorName?: string;
  amountAed?: number;
  destinationIban?: string;
  destinationBankCountry?: string;
  destinationAccountHolderName?: string;
  destinationAccountAgeDays?: number;
  ibanDifferentFromVendorOnFile?: boolean;
  bankCountryDifferentFromVendorJurisdiction?: boolean;
  changeRequestChannel?: 'email' | 'phone' | 'portal' | 'in_person' | 'letter';
  changeRequestVerifiedOutOfBand?: boolean;     // call-back / known-good number confirmation
  invoiceUrgencyTone?: boolean;                 // "must be paid today" indicator
  approvedByDualControl?: boolean;
  receivedAt?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate' | 'block'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FFIEC §6.B: account < 30 days old at receiving bank is a strong
// fraud-mule indicator. FBI IC3 BEC: bank country mismatch with vendor
// jurisdiction is the #1 vendor-email-compromise red flag.
const FRESH_ACCOUNT_FLAG_DAYS = 30;
const FRESH_ACCOUNT_ESCALATE_DAYS = 7;

export const invoiceRedirectionTraceApply = async (ctx: BrainContext): Promise<Finding> => {
  const events = typedEvidence<InvoicePaymentEvent>(ctx, 'invoicePaymentEvents');
  if (events.length === 0) {
    return {
      modeId: 'invoice_redirection_trace',
      category: 'identity_fraud' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No invoicePaymentEvents evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const e of events) {
    const ref = e.invoiceId ?? '(unidentified)';

    if (e.ibanDifferentFromVendorOnFile === true) {
      hits.push({ id: 'iban_change', label: 'Destination IBAN differs from vendor on file', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (e.bankCountryDifferentFromVendorJurisdiction === true) {
      hits.push({ id: 'bank_country_mismatch', label: `Destination bank country (${e.destinationBankCountry ?? '?'}) differs from vendor jurisdiction (FBI IC3 #1 indicator)`, weight: 0.55, evidence: ref, severity: 'escalate' });
    }
    if (typeof e.destinationAccountAgeDays === 'number') {
      if (e.destinationAccountAgeDays < FRESH_ACCOUNT_ESCALATE_DAYS) {
        hits.push({ id: 'fresh_account_critical', label: `Destination account ${e.destinationAccountAgeDays} days old (<${FRESH_ACCOUNT_ESCALATE_DAYS}d, FFIEC mule indicator)`, weight: 0.55, evidence: ref, severity: 'block' });
      } else if (e.destinationAccountAgeDays < FRESH_ACCOUNT_FLAG_DAYS) {
        hits.push({ id: 'fresh_account', label: `Destination account ${e.destinationAccountAgeDays} days old (<${FRESH_ACCOUNT_FLAG_DAYS}d)`, weight: 0.35, evidence: ref, severity: 'escalate' });
      }
    }
    if (e.changeRequestChannel === 'email' && e.changeRequestVerifiedOutOfBand === false) {
      hits.push({ id: 'email_change_no_callback', label: 'Bank-detail change request via email without out-of-band verification (FBI IC3 BEC top control gap)', weight: 0.6, evidence: ref, severity: 'block' });
    }
    if (e.invoiceUrgencyTone === true && e.ibanDifferentFromVendorOnFile === true) {
      hits.push({ id: 'urgency_plus_iban_change', label: 'Urgency cue + IBAN change — classic BEC pressure-tactic combination', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (e.approvedByDualControl === false && (e.amountAed ?? 0) >= 100_000) {
      hits.push({ id: 'no_dual_control_high_value', label: `AED ${(e.amountAed ?? 0).toLocaleString()} payment without dual control`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (e.destinationAccountHolderName && e.vendorName && !e.destinationAccountHolderName.toLowerCase().includes(e.vendorName.toLowerCase().split(' ')[0]?.toLowerCase() ?? '__')) {
      hits.push({ id: 'account_holder_name_mismatch', label: `Account holder "${e.destinationAccountHolderName}" doesn't match vendor "${e.vendorName}"`, weight: 0.35, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'block') ? 'block'
    : hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'invoice_redirection_trace',
    category: 'identity_fraud' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.95, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${events.length} invoice payment(s) reviewed; ${hits.length} redirection signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FBI IC3 BEC (Vendor Email Compromise) · UK Action Fraud · FFIEC IT Handbook §6.B · UAE CBUAE Cyber Standard 21/2018.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default invoiceRedirectionTraceApply;
