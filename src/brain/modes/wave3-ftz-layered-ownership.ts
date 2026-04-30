// Hawkeye Sterling — wave-3 mode: ftz_layered_ownership
// Detects ownership layering through UAE Free Trade Zones — multi-
// jurisdictional shell stacking that obscures UBO. Anchors: UAE
// Cabinet Res 58/2020 (UBO) · FATF R.24-25.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface OwnershipLayer {
  entityId: string;
  parentEntityId?: string;
  jurisdictionIso2?: string;
  ftzCode?: string;            // DMCC, JAFZA, ADGM, DIFC, RAKEZ, etc.
  isFreeTradeZone?: boolean;
  beneficialOwnersDisclosed?: boolean;
  layerDepthFromUbo?: number;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const ftzLayeredOwnershipApply = async (ctx: BrainContext): Promise<Finding> => {
  const layers = typedEvidence<OwnershipLayer>(ctx, 'ownershipLayers');
  if (layers.length === 0) {
    return {
      modeId: 'ftz_layered_ownership',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No ownershipLayers evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const ftzLayers = layers.filter((l) => l.isFreeTradeZone === true);
  const ftzShare = ftzLayers.length / layers.length;
  const maxDepth = Math.max(0, ...layers.map((l) => l.layerDepthFromUbo ?? 0));
  const undisclosed = layers.filter((l) => l.beneficialOwnersDisclosed === false).length;
  const distinctJurisdictions = new Set(layers.map((l) => l.jurisdictionIso2).filter(Boolean)).size;
  const distinctFtz = new Set(ftzLayers.map((l) => l.ftzCode).filter(Boolean)).size;

  if (ftzShare >= 0.5 && layers.length >= 3) {
    hits.push({ id: 'ftz_dominant_chain', label: `${(ftzShare * 100).toFixed(0)}% of layers are FTZ`, weight: 0.3, evidence: `${ftzLayers.length}/${layers.length}` });
  }
  if (distinctFtz >= 3) {
    hits.push({ id: 'multi_ftz_chain', label: `Chain spans ${distinctFtz} different FTZs`, weight: 0.3, evidence: Array.from(new Set(ftzLayers.map((l) => l.ftzCode).filter(Boolean))).slice(0, 4).join(', ') });
  }
  if (maxDepth >= 5) {
    hits.push({ id: 'deep_chain', label: `UBO is ${maxDepth} layers from operating entity`, weight: 0.25, evidence: `depth=${maxDepth}` });
  }
  if (undisclosed >= 2) {
    hits.push({ id: 'undisclosed_layers', label: `${undisclosed} layer(s) without disclosed BO`, weight: 0.25, evidence: `${undisclosed}/${layers.length}` });
  }
  if (distinctJurisdictions >= 4) {
    hits.push({ id: 'cross_jurisdiction_layering', label: `Chain spans ${distinctJurisdictions} jurisdictions`, weight: 0.2, evidence: `${distinctJurisdictions} jur` });
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'ftz_layered_ownership',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} FTZ-layering signal(s) over ${layers.length} layer(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: UAE Cabinet Res 58/2020 (UBO) · FATF R.24-25.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default ftzLayeredOwnershipApply;
