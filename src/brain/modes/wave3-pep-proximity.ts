// Hawkeye Sterling — wave-3 mode: pep_proximity_chain
// Detects 2nd / 3rd-degree connections to PEPs through beneficial
// ownership / family / business chains. Anchors: FATF R.12 (PEPs) ·
// UAE FDL 10/2025 Art.16.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface PepLink {
  subjectId: string;
  pepId: string;
  hops: number;
  relationshipType?: 'family' | 'business' | 'beneficial_owner' | 'signatory' | 'other';
  pepCategory?: 'foreign' | 'domestic' | 'international_org';
  pepRank?: 'head_of_state' | 'minister' | 'judge' | 'military' | 'soe_executive' | 'party_official';
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const pepProximityApply = async (ctx: BrainContext): Promise<Finding> => {
  const links = typedEvidence<PepLink>(ctx, 'pepLinks');
  if (links.length === 0) {
    return {
      modeId: 'pep_proximity_chain',
      category: 'regulatory_aml' as ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No pepLinks evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const direct = links.filter((l) => l.hops <= 1);
  const second = links.filter((l) => l.hops === 2);
  const senior = links.filter((l) => l.pepRank === 'head_of_state' || l.pepRank === 'minister' || l.pepRank === 'judge');
  const foreign = links.filter((l) => l.pepCategory === 'foreign');

  if (direct.length >= 1) hits.push({ id: 'direct_pep_link', label: `${direct.length} direct (1-hop) PEP link(s)`, weight: 0.35, evidence: direct.slice(0, 4).map((l) => `${l.pepId} (${l.relationshipType ?? '?'})`).join('; ') });
  if (second.length >= 1) hits.push({ id: 'second_degree_pep', label: `${second.length} 2-hop PEP link(s)`, weight: 0.2, evidence: second.slice(0, 4).map((l) => l.pepId).join(', ') });
  if (senior.length >= 1) hits.push({ id: 'senior_pep', label: `${senior.length} senior-rank PEP(s)`, weight: 0.3, evidence: senior.slice(0, 4).map((l) => `${l.pepId} (${l.pepRank})`).join('; ') });
  if (foreign.length >= 1) hits.push({ id: 'foreign_pep', label: `${foreign.length} foreign PEP(s)`, weight: 0.2, evidence: foreign.slice(0, 4).map((l) => l.pepId).join(', ') });

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'pep_proximity_chain',
    category: 'regulatory_aml' as ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} PEP-proximity signal(s) over ${links.length} link(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.12 · UAE FDL 10/2025 Art.16.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default pepProximityApply;
