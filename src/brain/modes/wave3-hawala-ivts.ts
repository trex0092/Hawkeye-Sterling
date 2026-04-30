// Hawkeye Sterling — wave-3 mode: hawala_ivts_pattern
// (audit follow-up #7). Detects hawala / informal value transfer
// service patterns: corridor-anomaly flows, settlement clustering,
// physical-cash settlement, agent-network indicators.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CorridorFlow {
  fromCountryIso2?: string;
  toCountryIso2?: string;
  amountAed?: number;
  channel?: 'cash' | 'wire' | 'crypto' | 'hawala_referral';
  bookkeepingRef?: string;
  settlementWindowHours?: number;
  agentName?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const HIGH_RISK_CORRIDORS = new Set([
  'PK-AE', 'AF-AE', 'IR-AE', 'SO-AE', 'YE-AE',
  'PK-IN', 'BD-AE', 'IR-TR', 'AF-PK', 'SY-LB', 'YE-OM',
]);

export const hawalaIvtsApply = async (ctx: BrainContext): Promise<Finding> => {
  const flows = typedEvidence<CorridorFlow>(ctx, 'corridorFlows');
  if (flows.length === 0) {
    return {
      modeId: 'hawala_ivts_pattern',
      category: 'hawala_ivt' as ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No corridorFlows evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  let cashHeavyCount = 0, hawalaReferralCount = 0, missingBookkeeping = 0, fastSettlement = 0, riskCorridor = 0;
  const agentCounts = new Map<string, number>();

  for (const f of flows) {
    if (f.channel === 'cash') cashHeavyCount++;
    if (f.channel === 'hawala_referral') hawalaReferralCount++;
    if (!f.bookkeepingRef) missingBookkeeping++;
    if (f.settlementWindowHours !== undefined && f.settlementWindowHours <= 4) fastSettlement++;
    const corridor = `${f.fromCountryIso2 ?? '??'}-${f.toCountryIso2 ?? '??'}`;
    if (HIGH_RISK_CORRIDORS.has(corridor.toUpperCase())) riskCorridor++;
    if (f.agentName) agentCounts.set(f.agentName, (agentCounts.get(f.agentName) ?? 0) + 1);
  }

  if (cashHeavyCount >= 3) hits.push({ id: 'cash_heavy', label: `${cashHeavyCount} cash-channel flows`, weight: 0.2, evidence: `${cashHeavyCount}/${flows.length}` });
  if (hawalaReferralCount >= 1) hits.push({ id: 'explicit_hawala_referral', label: `${hawalaReferralCount} explicit hawala-referral flows`, weight: 0.35, evidence: `${hawalaReferralCount}` });
  if (missingBookkeeping >= flows.length * 0.5 && flows.length >= 3) hits.push({ id: 'missing_bookkeeping', label: `${missingBookkeeping} flows without bookkeeping reference`, weight: 0.25, evidence: `${missingBookkeeping}/${flows.length}` });
  if (fastSettlement >= 2) hits.push({ id: 'fast_settlement', label: `${fastSettlement} settlements ≤4h`, weight: 0.15, evidence: `${fastSettlement} flows` });
  if (riskCorridor >= 1) hits.push({ id: 'high_risk_corridor', label: `${riskCorridor} flows in high-risk corridor`, weight: 0.25, evidence: `${riskCorridor} flows` });

  for (const [agent, count] of agentCounts) {
    if (count >= 4) {
      hits.push({ id: 'agent_concentration', label: `Agent '${agent}' channels ${count} flows`, weight: 0.2, evidence: `${agent}: ${count}` });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'hawala_ivts_pattern',
    category: 'hawala_ivt' as ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} hawala/IVTS signal(s) over ${flows.length} flow(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.14 (MVTS) · UAE FDL 10/2025 Art.15.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default hawalaIvtsApply;
