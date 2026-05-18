// Hawkeye Sterling — wave-3 mode: typosquat_domain_detection
// Detects look-alike / typosquat domains in counterparty emails or
// payment-instruction documents that imitate a legitimate domain.
// Anchors: NIST SP 800-177 Rev. 1, ICANN Abuse Reporting Framework,
// MITRE ATT&CK T1583.001 (Acquire Infrastructure: Domains),
// FBI IC3 BEC typology.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface DomainObservation {
  observedDomain?: string;                  // e.g. "amaz0n-payments.com"
  legitimateDomain?: string;                // e.g. "amazon.com"
  context?: string;                         // where it appeared (email, invoice, etc.)
  registrationDate?: string;                // WHOIS createdAt
  registrarReputationScore?: number;        // 0-1, lower = sketchy
  hasValidTls?: boolean;
  hasMxRecords?: boolean;
  isInIcannAbuseList?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// Levenshtein distance — simple O(mn) DP, sufficient for short labels.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j] ?? 0;
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j - 1] ?? 0, dp[j] ?? 0) + 1;
      prev = tmp;
    }
  }
  return dp[n] ?? 0;
}

function rootLabel(domain: string): string {
  if (!domain) return '';
  const parts = domain.toLowerCase().replace(/^https?:\/\//, '').split('.');
  if (parts.length < 2) return parts[0] ?? '';
  // crude eTLD strip (handles common .co.uk style two-segment TLDs).
  const last = parts[parts.length - 1] ?? '';
  const second = parts[parts.length - 2] ?? '';
  if (parts.length >= 3 && (last.length <= 3 && second.length <= 3)) {
    return parts[parts.length - 3] ?? '';
  }
  return second;
}

// Common typosquat character substitutions — homoglyph + keyboard-near.
const HOMOGLYPHS: Record<string, string[]> = {
  o: ['0'], i: ['1', 'l'], l: ['1', 'i'], a: ['@'], e: ['3'], s: ['5', '$'], g: ['9'],
};

function hasHomoglyph(observed: string, legit: string): boolean {
  if (observed.length !== legit.length) return false;
  for (let i = 0; i < observed.length; i++) {
    const o = observed[i] ?? '';
    const l = legit[i] ?? '';
    if (o === l) continue;
    if ((HOMOGLYPHS[l] ?? []).includes(o)) return true;
  }
  return false;
}

const REGISTRATION_FRESH_DAYS = 90;        // ICANN abuse research: <90d = elevated risk

export const typosquatDomainDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const observations = typedEvidence<DomainObservation>(ctx, 'domainObservations');
  if (observations.length === 0) {
    return {
      modeId: 'typosquat_domain_detection',
      category: 'identity_fraud' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No domainObservations evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const o of observations) {
    const observed = (o.observedDomain ?? '').toLowerCase();
    const legit = (o.legitimateDomain ?? '').toLowerCase();
    const ref = observed || '(unidentified)';
    const obsRoot = rootLabel(observed);
    const legRoot = rootLabel(legit);

    if (obsRoot && legRoot && obsRoot !== legRoot) {
      const dist = levenshtein(obsRoot, legRoot);
      if (dist >= 1 && dist <= 2) {
        hits.push({ id: 'levenshtein_close', label: `Domain "${observed}" within edit-distance ${dist} of "${legit}"`, weight: 0.5, evidence: ref, severity: 'escalate' });
      }
      if (hasHomoglyph(obsRoot, legRoot)) {
        hits.push({ id: 'homoglyph_match', label: `Domain "${observed}" appears to use homoglyph substitution vs "${legit}"`, weight: 0.55, evidence: ref, severity: 'escalate' });
      }
    }
    if (o.registrationDate) {
      const ageDays = (Date.now() - Date.parse(o.registrationDate)) / (1000 * 60 * 60 * 24);
      if (ageDays >= 0 && ageDays < REGISTRATION_FRESH_DAYS) {
        hits.push({ id: 'fresh_registration', label: `Domain registered ${Math.round(ageDays)} days ago (<${REGISTRATION_FRESH_DAYS}d)`, weight: 0.3, evidence: ref, severity: 'flag' });
      }
    }
    if (typeof o.registrarReputationScore === 'number' && o.registrarReputationScore < 0.3) {
      hits.push({ id: 'low_reputation_registrar', label: `Registrar reputation ${o.registrarReputationScore.toFixed(2)} (<0.3)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (o.hasValidTls === false) {
      hits.push({ id: 'no_valid_tls', label: 'Domain serves no valid TLS certificate', weight: 0.2, evidence: ref, severity: 'flag' });
    }
    if (o.hasMxRecords === false) {
      hits.push({ id: 'no_mx_records', label: 'Domain has no MX records (cannot legitimately send email)', weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (o.isInIcannAbuseList === true) {
      hits.push({ id: 'icann_abuse_listed', label: 'Domain present in ICANN abuse-reporting feed', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'typosquat_domain_detection',
    category: 'identity_fraud' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${observations.length} domain observation(s) reviewed; ${hits.length} typosquat signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: NIST SP 800-177r1 · ICANN Abuse Reporting · MITRE T1583.001 · FBI IC3 BEC.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default typosquatDomainDetectionApply;
