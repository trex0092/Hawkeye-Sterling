// Hawkeye Sterling — wave-3 mode: professional_enabler_pattern
// (audit follow-up #7). Detects law firm / accountancy / notary fronting.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ProfessionalAccountFlow {
  firmType?: 'law' | 'accountancy' | 'notary' | 'corporate_service_provider' | 'other';
  jurisdiction?: string;
  clientAccountTransitMs?: number;
  matterFileReferenced?: boolean;
  destinationDifferentFromOrigin?: boolean;
  amount?: number;
  multiClientSharedDestination?: boolean;
  firmId?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const SECRECY_HAVENS = new Set(['CH', 'PA', 'BVI', 'KY', 'BS', 'VG', 'JE', 'GG', 'IM', 'MO']);

export const professionalEnablerApply = async (ctx: BrainContext): Promise<Finding> => {
  const flows = typedEvidence<ProfessionalAccountFlow>(ctx, 'professionalAccountFlows');
  if (flows.length === 0) {
    return {
      modeId: 'professional_enabler_pattern',
      category: 'professional_ml' as ReasoningCategory,
      faculties: ['data_analysis', 'argumentation'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No professionalAccountFlows evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  let rapidTransit = 0, unrelated = 0, multiClient = 0, secrecy = 0;

  for (const f of flows) {
    if (f.clientAccountTransitMs !== undefined && f.clientAccountTransitMs <= 48 * 60 * 60 * 1000) rapidTransit++;
    if (f.matterFileReferenced === false) unrelated++;
    if (f.multiClientSharedDestination) multiClient++;
    if (f.jurisdiction && SECRECY_HAVENS.has(f.jurisdiction.toUpperCase())) secrecy++;
  }

  if (rapidTransit >= 3) hits.push({ id: 'rapid_transit', label: `${rapidTransit} rapid client-account transits (<48h)`, weight: 0.3, evidence: `${rapidTransit}/${flows.length}` });
  if (unrelated >= 2) hits.push({ id: 'no_matter_file', label: `${unrelated} flows without underlying matter file`, weight: 0.25, evidence: `${unrelated}/${flows.length}` });
  if (multiClient >= 2) hits.push({ id: 'multi_client_shared_destination', label: `${multiClient} flows with shared destination across clients`, weight: 0.3, evidence: `${multiClient}/${flows.length}` });
  if (secrecy >= 1) hits.push({ id: 'secrecy_jurisdiction', label: `${secrecy} flow(s) routed through secrecy haven`, weight: 0.2, evidence: `${secrecy} flows` });

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'professional_enabler_pattern',
    category: 'professional_ml' as ReasoningCategory,
    faculties: ['data_analysis', 'argumentation'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} enabler signal(s) over ${flows.length} flows. ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.22-23 · UAE FDL 10/2025 Art.4 (DNFBP) · Cabinet Res 71/2024.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default professionalEnablerApply;
