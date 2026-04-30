// Hawkeye Sterling — wave-3 mode: correspondent_banking_nesting
// Detects nested correspondent banking — a respondent bank that is
// itself servicing other downstream banks via the correspondent
// relationship. Anchors: FATF R.13 · UAE Central Bank Standards.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CorrespondentRelationship {
  correspondentBic: string;
  respondentBic: string;
  respondentJurisdictionIso2?: string;
  respondentLicensedBy?: string;
  respondentServicesDownstreamBanks?: boolean;
  downstreamBankCount?: number;
  respondentHasShellCharacteristics?: boolean;
  walkThroughAccount?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const HIGH_RISK_JURISDICTIONS = new Set(['IR', 'KP', 'MM', 'AF', 'YE']);

export const correspondentNestingApply = async (ctx: BrainContext): Promise<Finding> => {
  const rels = typedEvidence<CorrespondentRelationship>(ctx, 'correspondentRelationships');
  if (rels.length === 0) {
    return {
      modeId: 'correspondent_banking_nesting',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No correspondentRelationships evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const r of rels) {
    if (r.respondentServicesDownstreamBanks === true) {
      hits.push({ id: 'nested_correspondent', label: `${r.respondentBic} services ${r.downstreamBankCount ?? '?'} downstream banks`, weight: 0.4, evidence: `${r.correspondentBic} ↔ ${r.respondentBic}` });
    }
    if (r.walkThroughAccount === true) {
      hits.push({ id: 'walk_through_account', label: `Walk-through (PTA) account at ${r.respondentBic}`, weight: 0.45, evidence: `${r.correspondentBic} ↔ ${r.respondentBic}` });
    }
    if (r.respondentHasShellCharacteristics === true) {
      hits.push({ id: 'shell_respondent', label: `Respondent ${r.respondentBic} has shell characteristics`, weight: 0.35, evidence: `${r.respondentBic}` });
    }
    if (r.respondentJurisdictionIso2 && HIGH_RISK_JURISDICTIONS.has(r.respondentJurisdictionIso2.toUpperCase())) {
      hits.push({ id: 'high_risk_respondent_jurisdiction', label: `Respondent in ${r.respondentJurisdictionIso2}`, weight: 0.25, evidence: `${r.respondentBic} (${r.respondentJurisdictionIso2})` });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'correspondent_banking_nesting',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} correspondent-nesting signal(s) over ${rels.length} relationship(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.13 · UAE CBUAE Standards on Correspondent Banking.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default correspondentNestingApply;
