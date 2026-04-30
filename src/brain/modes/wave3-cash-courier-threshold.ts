// Hawkeye Sterling — wave-3 mode: cash_courier_threshold
// Detects bulk cash movement clustering near reporting thresholds —
// the canonical structuring/smurfing pattern. Anchors: FATF R.32 +
// UAE Cabinet Resolution 134/2025 Art.18 (cross-border declaration).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CashMovement {
  movementId: string;
  amountAed?: number;
  carrierId?: string;
  declaredAtBorder?: boolean;
  fromCountryIso2?: string;
  toCountryIso2?: string;
  at?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const DECLARATION_THRESHOLD_AED = 60_000;
const STRUCTURING_BAND_LOW = 50_000;

export const cashCourierThresholdApply = async (ctx: BrainContext): Promise<Finding> => {
  const moves = typedEvidence<CashMovement>(ctx, 'cashMovements');
  if (moves.length === 0) {
    return {
      modeId: 'cash_courier_threshold',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No cashMovements evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const nearThreshold = moves.filter((m) => (m.amountAed ?? 0) >= STRUCTURING_BAND_LOW && (m.amountAed ?? 0) < DECLARATION_THRESHOLD_AED);
  if (nearThreshold.length >= 2) {
    hits.push({ id: 'sub_threshold_clustering', label: `${nearThreshold.length} movements in AED 50-60k band`, weight: 0.4, evidence: nearThreshold.slice(0, 4).map((m) => m.movementId).join(', ') });
  }

  const undeclared = moves.filter((m) => (m.amountAed ?? 0) >= DECLARATION_THRESHOLD_AED && m.declaredAtBorder !== true);
  if (undeclared.length >= 1) {
    hits.push({ id: 'undeclared_cross_border', label: `${undeclared.length} undeclared ≥AED 60k`, weight: 0.45, evidence: undeclared.slice(0, 4).map((m) => m.movementId).join(', ') });
  }

  const byCarrier = new Map<string, number>();
  for (const m of moves) {
    if (m.carrierId) byCarrier.set(m.carrierId, (byCarrier.get(m.carrierId) ?? 0) + 1);
  }
  for (const [cid, count] of byCarrier) {
    if (count >= 4) hits.push({ id: 'carrier_concentration', label: `Carrier ${cid} made ${count} runs`, weight: 0.2, evidence: `${cid}: ${count}` });
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'cash_courier_threshold',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} cash-courier signal(s) over ${moves.length} movement(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.32 · UAE Cabinet Res 134/2025 Art.18.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default cashCourierThresholdApply;
