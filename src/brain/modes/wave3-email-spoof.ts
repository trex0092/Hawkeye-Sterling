// Hawkeye Sterling — wave-3 mode: email_spoof_forensic
// Detects email-spoofing forensic indicators (DMARC/SPF/DKIM failures,
// header anomalies, suspicious reply-to, look-alike sender) on
// payment-instruction or counterparty-update emails. Anchors:
// NIST SP 800-177 Rev. 1 (Trustworthy Email — DMARC/SPF/DKIM),
// FBI IC3 BEC Annual Report typology, M3AAWG Email Authentication
// Recommended Best Practices.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface EmailEvidence {
  messageId?: string;
  fromAddress?: string;
  replyToAddress?: string;
  returnPath?: string;
  spfResult?: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';
  dkimResult?: 'pass' | 'fail' | 'none' | 'policy' | 'temperror' | 'permerror';
  dmarcResult?: 'pass' | 'fail' | 'none';
  senderIpCountry?: string;
  senderIpCountryDiffersFromOrgDomain?: boolean;
  attachmentCount?: number;
  hasPaymentInstruction?: boolean;            // contains IBAN / wire details
  paymentInstructionDifferentFromOnFile?: boolean;
  receivedAt?: string;
  expectedSenderDomain?: string;              // domain we expected (e.g. counterparty's prior emails)
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate' | 'block'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function domainOf(email?: string): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase();
}

export const emailSpoofForensicApply = async (ctx: BrainContext): Promise<Finding> => {
  const emails = typedEvidence<EmailEvidence>(ctx, 'emailEvidence');
  if (emails.length === 0) {
    return {
      modeId: 'email_spoof_forensic',
      category: 'identity_fraud' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No emailEvidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const e of emails) {
    const ref = e.messageId ?? e.fromAddress ?? '(unidentified)';
    const fromDomain = domainOf(e.fromAddress);
    const replyDomain = domainOf(e.replyToAddress);
    const returnDomain = domainOf(e.returnPath);

    if (e.dmarcResult === 'fail') {
      hits.push({ id: 'dmarc_fail', label: 'DMARC=fail (NIST SP 800-177r1)', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (e.spfResult === 'fail') {
      hits.push({ id: 'spf_fail', label: 'SPF=fail', weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (e.dkimResult === 'fail') {
      hits.push({ id: 'dkim_fail', label: 'DKIM=fail', weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (replyDomain && fromDomain && replyDomain !== fromDomain) {
      hits.push({ id: 'reply_to_mismatch', label: `Reply-To domain (${replyDomain}) ≠ From domain (${fromDomain})`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (returnDomain && fromDomain && returnDomain !== fromDomain) {
      hits.push({ id: 'return_path_mismatch', label: `Return-Path domain (${returnDomain}) ≠ From domain (${fromDomain})`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (e.senderIpCountryDiffersFromOrgDomain === true) {
      hits.push({ id: 'sender_ip_country_anomaly', label: `Sender IP country (${e.senderIpCountry ?? '?'}) inconsistent with claimed sender domain`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (e.expectedSenderDomain && fromDomain && fromDomain !== e.expectedSenderDomain.toLowerCase()) {
      hits.push({ id: 'unexpected_sender_domain', label: `Sender domain (${fromDomain}) ≠ expected counterparty domain (${e.expectedSenderDomain})`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (e.hasPaymentInstruction === true && e.paymentInstructionDifferentFromOnFile === true) {
      hits.push({ id: 'payment_change_via_email', label: 'Payment-instruction change request via email (FBI IC3 BEC top typology)', weight: 0.6, evidence: ref, severity: 'block' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'block') ? 'block'
    : hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'email_spoof_forensic',
    category: 'identity_fraud' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.95, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${emails.length} email(s) reviewed; ${hits.length} spoof-forensic signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: NIST SP 800-177r1 · FBI IC3 BEC Annual Report · M3AAWG Email Authentication Best Practices.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default emailSpoofForensicApply;
