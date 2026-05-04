// Hawkeye Sterling — wave-3 mode: legal_pooled_account_abuse
// Detects misuse of lawyer / accountant pooled (client / escrow)
// accounts — a designated-non-financial-business gateway to the
// banking system. Anchors: FATF R.22 (DNFBPs) · UAE FDL 10/2025 Art.7.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface PooledAccountFlow {
  flowId: string;
  accountHolder: 'lawyer' | 'accountant' | 'notary' | 'tcsp' | 'other';
  amountAed?: number;
  underlyingClientId?: string;
  underlyingClientDisclosed?: boolean;
  serviceConnectedToTransaction?: boolean;
  flowDirection?: 'in' | 'out';
  counterpartyJurisdictionIso2?: string;
  thirdPartyOrigination?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const legalPooledAccountApply = async (ctx: BrainContext): Promise<Finding> => {
  const flows = typedEvidence<PooledAccountFlow>(ctx, 'pooledAccountFlows');
  if (flows.length === 0) {
    return {
      modeId: 'legal_pooled_account_abuse',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No pooledAccountFlows evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const undisclosed = flows.filter((f) => f.underlyingClientDisclosed === false);
  const noService = flows.filter((f) => f.serviceConnectedToTransaction === false);
  const thirdParty = flows.filter((f) => f.thirdPartyOrigination === true);
  const largeFlows = flows.filter((f) => (f.amountAed ?? 0) >= 1_000_000);

  if (undisclosed.length >= 2) {
    hits.push({ id: 'undisclosed_underlying_client', label: `${undisclosed.length} flow(s) without disclosed client`, weight: 0.4, evidence: undisclosed.slice(0, 4).map((f) => f.flowId).join(', ') });
  }
  if (noService.length >= 2) {
    hits.push({ id: 'no_underlying_service', label: `${noService.length} flow(s) without underlying legal/accounting service`, weight: 0.35, evidence: noService.slice(0, 4).map((f) => f.flowId).join(', ') });
  }
  if (thirdParty.length >= 2) {
    hits.push({ id: 'third_party_origination', label: `${thirdParty.length} flow(s) from third-party origin`, weight: 0.25, evidence: thirdParty.slice(0, 4).map((f) => f.flowId).join(', ') });
  }
  if (largeFlows.length >= 1) {
    hits.push({ id: 'large_pooled_flow', label: `${largeFlows.length} flow(s) ≥AED 1M`, weight: 0.2, evidence: largeFlows.slice(0, 4).map((f) => `${f.flowId}: ${f.amountAed}`).join('; ') });
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'legal_pooled_account_abuse',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} pooled-account-abuse signal(s) over ${flows.length} flow(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.22 · UAE FDL 10/2025 Art.7.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default legalPooledAccountApply;
