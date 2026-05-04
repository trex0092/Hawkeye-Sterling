// Hawkeye Sterling — wave-3 mode: nested_designation_match
// Detects sanctioned entity reached transitively via subsidiary /
// ownership chain (50% rule). Anchors: OFAC 50% rule · UNSCR 1267 ·
// UAE FDL 10/2025 Art.20.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface OwnershipPath {
  pathId: string;
  rootEntityId: string;
  designatedAncestorId?: string;
  cumulativeOwnershipPct?: number;
  hopCount?: number;
  designationProgramme?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const nestedDesignationApply = async (ctx: BrainContext): Promise<Finding> => {
  const paths = typedEvidence<OwnershipPath>(ctx, 'ownershipPaths');
  if (paths.length === 0) {
    return {
      modeId: 'nested_designation_match', category: 'proliferation' as ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No ownershipPaths evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }
  const hits: SignalHit[] = [];
  for (const p of paths) {
    if (!p.designatedAncestorId) continue;
    const own = p.cumulativeOwnershipPct ?? 0;
    if (own >= 50) hits.push({ id: 'ofac_50_rule', label: `${own.toFixed(0)}% via designated ancestor`, weight: 0.5, evidence: `${p.rootEntityId} ← ${p.designatedAncestorId} (${p.designationProgramme ?? '?'})` });
    else if (own >= 25) hits.push({ id: 'eu_25_rule', label: `${own.toFixed(0)}% via designated ancestor`, weight: 0.35, evidence: `${p.rootEntityId} ← ${p.designatedAncestorId}` });
    if ((p.hopCount ?? 0) >= 4) hits.push({ id: 'deep_designation_chain', label: `${p.hopCount} hops to designation`, weight: 0.2, evidence: `${p.rootEntityId}` });
  }
  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return {
    modeId: 'nested_designation_match', category: 'proliferation' as ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} nested-designation signal(s) over ${paths.length} path(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: OFAC 50% rule · UNSCR 1267 · UAE FDL 10/2025 Art.20.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default nestedDesignationApply;
