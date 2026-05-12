// Hawkeye Sterling — wave-3 mode: npo_high_risk_outflow
// Detects NPO/charity flows to high-risk-jurisdiction terrorism-finance
// nexuses. Anchors: FATF R.8 (NPOs) · UAE FDL 10/2025 (NPO
// regulation) · UNSCR 1373 / 2462.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface NpoFlow {
  flowId: string;
  npoEntityId: string;
  amountAed?: number;
  recipientCountryIso2?: string;
  programmaticPurpose?: string;
  hasFieldOversight?: boolean;
  recipientIsRegistered?: boolean;
  cashDelivery?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const HIGH_TF_RISK = new Set(['SY', 'YE', 'AF', 'SO', 'IQ', 'LY', 'PK', 'SD']);

export const npoHighRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const flows = typedEvidence<NpoFlow>(ctx, 'npoFlows');
  if (flows.length === 0) {
    return {
      modeId: 'npo_high_risk_outflow',
      category: 'predicate_crime' as ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No npoFlows evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const highRiskFlows = flows.filter((f) => f.recipientCountryIso2 && HIGH_TF_RISK.has(f.recipientCountryIso2.toUpperCase()));
  const noOversight = flows.filter((f) => f.hasFieldOversight === false);
  const cashFlows = flows.filter((f) => f.cashDelivery === true);
  const unregisteredRecipients = flows.filter((f) => f.recipientIsRegistered === false);

  if (highRiskFlows.length >= 1) {
    hits.push({ id: 'high_tf_jurisdiction', label: `${highRiskFlows.length} flow(s) to high-TF-risk jurisdictions`, weight: 0.35, evidence: highRiskFlows.slice(0, 4).map((f) => `${f.flowId} → ${f.recipientCountryIso2}`).join('; ') });
  }
  if (noOversight.length >= 2) {
    hits.push({ id: 'no_field_oversight', label: `${noOversight.length} flow(s) without field oversight`, weight: 0.25, evidence: noOversight.slice(0, 4).map((f) => f.flowId).join(', ') });
  }
  if (cashFlows.length >= 2) {
    hits.push({ id: 'cash_delivery', label: `${cashFlows.length} cash-delivered flow(s)`, weight: 0.3, evidence: cashFlows.slice(0, 4).map((f) => f.flowId).join(', ') });
  }
  if (unregisteredRecipients.length >= 1) {
    hits.push({ id: 'unregistered_recipient', label: `${unregisteredRecipients.length} flow(s) to unregistered recipient`, weight: 0.25, evidence: unregisteredRecipients.slice(0, 4).map((f) => f.flowId).join(', ') });
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'npo_high_risk_outflow',
    category: 'predicate_crime' as ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} NPO-high-risk signal(s) over ${flows.length} flow(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.8 · UAE FDL 10/2025 · UNSCR 1373 / 2462.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default npoHighRiskApply;
