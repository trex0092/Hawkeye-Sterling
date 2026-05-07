// Hawkeye Sterling — wave-3 mode: ceo_impersonation_signal
// Detects "CEO fraud" / wire-transfer-impersonation requests where an
// attacker poses as a senior executive to demand an urgent, secret,
// unusual payment. Anchors: FBI IC3 BEC Annual Report ("CEO Fraud" /
// "Executive Impersonation" sub-typology — historically the highest-
// loss BEC category), UAE CBUAE Cyber Risk Management Standard
// 21/2018, UK Action Fraud Whaling Bulletin.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ExecRequestEvent {
  requestId?: string;
  claimedSenderName?: string;             // who they say they are
  claimedSenderRole?: string;             // CEO / CFO / Chairman / etc.
  senderEmailAddress?: string;
  senderEmailDomainMatchesOrg?: boolean;
  senderUsesPersonalEmail?: boolean;       // gmail.com / outlook.com etc.
  isFirstContactWithRecipient?: boolean;
  bypassesNormalChannel?: boolean;         // requested directly from finance, not via normal workflow
  hasUrgencyTone?: boolean;                // "must be done within the hour"
  hasSecrecyDirective?: boolean;           // "do not discuss with anyone, not even compliance"
  isOutsideBusinessHours?: boolean;
  paymentAmountAed?: number;
  paymentDestinationCountry?: string;
  paymentDestinationFatfHighRisk?: boolean;
  outOfBandVerificationPerformed?: boolean;
  receivedAt?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate' | 'block'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FBI IC3 published "CEO Fraud" attack-pattern hallmarks. Each true
// indicator adds weight; ≥3 simultaneous = textbook attack pattern.
export const ceoImpersonationSignalApply = async (ctx: BrainContext): Promise<Finding> => {
  const events = typedEvidence<ExecRequestEvent>(ctx, 'execRequestEvents');
  if (events.length === 0) {
    return {
      modeId: 'ceo_impersonation_signal',
      category: 'identity_fraud' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No execRequestEvents evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const e of events) {
    const ref = e.requestId ?? '(unidentified)';
    let attackPatternMatches = 0;

    if (e.senderUsesPersonalEmail === true) {
      attackPatternMatches++;
      hits.push({ id: 'personal_email_for_exec_request', label: `Exec request sent from personal email (${e.senderEmailAddress ?? '?'}) — IC3 hallmark`, weight: 0.45, evidence: ref, severity: 'escalate' });
    }
    if (e.senderEmailDomainMatchesOrg === false && !e.senderUsesPersonalEmail) {
      attackPatternMatches++;
      hits.push({ id: 'sender_domain_not_org', label: 'Sender domain does not match organisation domain', weight: 0.45, evidence: ref, severity: 'escalate' });
    }
    if (e.bypassesNormalChannel === true) {
      attackPatternMatches++;
      hits.push({ id: 'bypasses_normal_channel', label: 'Request bypasses normal payment authorisation channel', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (e.hasSecrecyDirective === true) {
      attackPatternMatches++;
      hits.push({ id: 'secrecy_directive', label: '"Do not discuss with anyone" instruction (IC3 hallmark)', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (e.hasUrgencyTone === true) {
      attackPatternMatches++;
      hits.push({ id: 'urgency_tone', label: 'Urgency / time-pressure tone in request', weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (e.isFirstContactWithRecipient === true) {
      hits.push({ id: 'first_contact', label: 'First-time contact between claimed-exec and recipient', weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (e.isOutsideBusinessHours === true) {
      hits.push({ id: 'outside_hours', label: 'Request received outside business hours', weight: 0.2, evidence: ref, severity: 'flag' });
    }
    if (e.outOfBandVerificationPerformed === false && (e.paymentAmountAed ?? 0) > 0) {
      hits.push({ id: 'no_out_of_band_verification', label: 'Payment proposed without out-of-band exec verification', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (e.paymentDestinationFatfHighRisk === true) {
      hits.push({ id: 'high_risk_payment_destination', label: `Payment destination in FATF high-risk jurisdiction (${e.paymentDestinationCountry ?? '?'})`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (attackPatternMatches >= 3) {
      hits.push({ id: 'classic_attack_pattern', label: `${attackPatternMatches} IC3 CEO-fraud hallmarks present simultaneously`, weight: 0.7, evidence: ref, severity: 'block' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'block') ? 'block'
    : hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'ceo_impersonation_signal',
    category: 'identity_fraud' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.95, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${events.length} exec request(s) reviewed; ${hits.length} CEO-fraud signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FBI IC3 BEC (CEO Fraud) · UAE CBUAE Cyber Standard 21/2018 · UK Action Fraud Whaling Bulletin.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default ceoImpersonationSignalApply;
