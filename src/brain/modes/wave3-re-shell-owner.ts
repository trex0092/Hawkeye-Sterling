// Hawkeye Sterling — wave-3 mode: re_shell_owner_check
// Detects real-estate purchases registered to shell-company buyers
// without disclosed UBO. Anchors: UAE Cabinet Decision 58/2020
// (Beneficial Owner regulation), UAE FDL 10/2025 Art.19 (UBO ID),
// FATF R.24 + R.25 (transparency of legal persons / arrangements).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ShellOwnerPurchase {
  txnId?: string;
  propertyValueAed?: number;
  buyerType?: 'individual' | 'corporate' | 'trust' | 'foundation';
  buyerJurisdiction?: string;       // ISO-2
  uboDisclosed?: boolean;
  uboCount?: number;
  hasNomineeIndicators?: boolean;
  isOffshoreJurisdiction?: boolean;
  registeredOfficeAge?: number;     // days since registered office created
  at?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const reShellOwnerCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<ShellOwnerPurchase>(ctx, 'realEstateShellOwnerPurchases');
  if (txns.length === 0) {
    return {
      modeId: 're_shell_owner_check',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'reasoning'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No realEstateShellOwnerPurchases evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const t of txns) {
    const ref = t.txnId ?? '(unidentified)';
    const isCorpish = t.buyerType === 'corporate' || t.buyerType === 'trust' || t.buyerType === 'foundation';
    if (isCorpish && t.uboDisclosed === false) {
      hits.push({ id: 'no_ubo_disclosed', label: `${t.buyerType} buyer with no UBO disclosed (CD 58/2020 Art.6)`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (isCorpish && t.isOffshoreJurisdiction) {
      hits.push({ id: 'offshore_corp_buyer', label: `${t.buyerType} buyer registered in offshore jurisdiction (${t.buyerJurisdiction})`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (t.hasNomineeIndicators) {
      hits.push({ id: 'nominee_signals', label: 'Nominee director/shareholder signals present', weight: 0.35, evidence: ref, severity: 'escalate' });
    }
    if (typeof t.registeredOfficeAge === 'number' && t.registeredOfficeAge < 90) {
      hits.push({ id: 'fresh_registered_office', label: `Registered office < 90 days old (${t.registeredOfficeAge} days) at purchase`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (typeof t.uboCount === 'number' && t.uboCount > 5) {
      hits.push({ id: 'fragmented_ownership', label: `Fragmented UBO (${t.uboCount} owners) — opacity indicator`, weight: 0.2, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 're_shell_owner_check',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'reasoning'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${txns.length} corporate-owner purchase(s) reviewed; ${hits.length} shell signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: UAE CD 58/2020 · UAE FDL 10/2025 Art.19 · FATF R.24 + R.25.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default reShellOwnerCheckApply;
