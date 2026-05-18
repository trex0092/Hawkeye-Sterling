// Hawkeye Sterling — wave-3 mode: wire_stripping_indicator
// Detects intermediary-bank stripping of originator/beneficiary
// information from cross-border wires. Anchors: FATF R.16 (wire
// transfers / travel rule) · UAE FDL 10/2025 Art.15.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface WireRecord {
  wireId: string;
  amountAed?: number;
  originatorName?: string;
  originatorAccount?: string;
  beneficiaryName?: string;
  beneficiaryAccount?: string;
  intermediaryBanks?: string[];
  cleared?: boolean;
  swiftMt?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const wireStrippingApply = async (ctx: BrainContext): Promise<Finding> => {
  const wires = typedEvidence<WireRecord>(ctx, 'wires');
  if (wires.length === 0) {
    return {
      modeId: 'wire_stripping_indicator',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No wires evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const w of wires) {
    const missingOriginator = !w.originatorName || !w.originatorAccount;
    const missingBeneficiary = !w.beneficiaryName || !w.beneficiaryAccount;
    if (missingOriginator) {
      hits.push({ id: 'missing_originator', label: 'Wire without complete originator', weight: 0.3, evidence: `${w.wireId}: name=${w.originatorName ? 'y' : 'n'} acct=${w.originatorAccount ? 'y' : 'n'}` });
    }
    if (missingBeneficiary) {
      hits.push({ id: 'missing_beneficiary', label: 'Wire without complete beneficiary', weight: 0.3, evidence: `${w.wireId}: name=${w.beneficiaryName ? 'y' : 'n'} acct=${w.beneficiaryAccount ? 'y' : 'n'}` });
    }
    if ((w.intermediaryBanks ?? []).length >= 3) {
      hits.push({ id: 'long_intermediary_chain', label: `${(w.intermediaryBanks ?? []).length} intermediary banks`, weight: 0.2, evidence: `${w.wireId}: ${(w.intermediaryBanks ?? []).slice(0, 4).join(' → ')}` });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'wire_stripping_indicator',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} wire-stripping signal(s) over ${wires.length} wire(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.16 · UAE FDL 10/2025 Art.15.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default wireStrippingApply;
