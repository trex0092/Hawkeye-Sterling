// Hawkeye Sterling — wave-3 mode: dual_use_goods_routing
// Detects routing of dual-use / military-end-use goods through hub
// jurisdictions to evade export controls. Anchors: UAE Cabinet Res
// 156/2025 (goods control) · EU 2021/821 · US ECRA / EAR.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ShipmentRecord {
  shipmentId: string;
  hsCode?: string;
  isDualUse?: boolean;
  endUserCountryIso2?: string;
  declaredEndUseCategory?: 'civilian' | 'military' | 'unknown';
  routedThrough?: string[];          // intermediary country chain
  endUserCertProvided?: boolean;
  freeTradeZoneOrigin?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const HIGH_RISK_END_USERS = new Set(['IR', 'KP', 'SY', 'RU', 'BY']);

export const dualUseRoutingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ships = typedEvidence<ShipmentRecord>(ctx, 'shipments');
  if (ships.length === 0) {
    return {
      modeId: 'dual_use_goods_routing',
      category: 'proliferation' as ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No shipments evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const s of ships) {
    if (s.isDualUse !== true) continue;
    const flags: string[] = [];
    if (s.endUserCountryIso2 && HIGH_RISK_END_USERS.has(s.endUserCountryIso2.toUpperCase())) flags.push('high_risk_end_user');
    if ((s.routedThrough ?? []).length >= 3) flags.push(`routed_via_${s.routedThrough!.length}_intermediaries`);
    if (s.endUserCertProvided === false) flags.push('no_end_user_cert');
    if (s.declaredEndUseCategory === 'unknown') flags.push('unknown_end_use');
    if (s.freeTradeZoneOrigin === true && (s.routedThrough ?? []).length >= 2) flags.push('ftz_relayed');

    if (flags.length >= 2) {
      hits.push({
        id: 'dual_use_anomaly',
        label: `${s.shipmentId}: ${flags.length} routing flags`,
        weight: Math.min(0.4, 0.15 + flags.length * 0.06),
        evidence: `${s.shipmentId} (HS=${s.hsCode ?? '?'}): ${flags.join(', ')}`,
      });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'dual_use_goods_routing',
    category: 'proliferation' as ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} dual-use routing signal(s) over ${ships.length} shipment(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: UAE Cabinet Res 156/2025 · EU 2021/821 · US ECRA.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default dualUseRoutingApply;
