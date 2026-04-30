// Hawkeye Sterling — wave-3 mode: family_office_trust_transparency
// (audit follow-up #7 + #49). Enforces FATF R.25 transparency
// expectations on legal arrangements (trusts, foundations, private
// holding structures).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface TrustOrArrangement {
  id: string;
  type?: 'discretionary_trust' | 'fixed_trust' | 'foundation' | 'private_company' | 'spv' | 'other';
  jurisdictionOfFormation?: string;
  trusteeName?: string;
  trusteeIsLicensed?: boolean;
  settlorDisclosed?: boolean;
  beneficiariesDisclosed?: boolean;
  protectorPresent?: boolean;
  letterOfWishesAvailable?: boolean;
  multiJurisdictionLayers?: number;
  bearerSharesAllowed?: boolean;
  lastFiledRegistry?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const SECRECY_FORMATION_HAVENS = new Set(['BVI', 'KY', 'BS', 'JE', 'GG', 'IM', 'PA', 'BZ', 'NV']);

export const familyOfficeTrustApply = async (ctx: BrainContext): Promise<Finding> => {
  const arrs = typedEvidence<TrustOrArrangement>(ctx, 'trustsAndArrangements');
  if (arrs.length === 0) {
    return {
      modeId: 'family_office_trust_transparency',
      category: 'governance' as ReasoningCategory,
      faculties: ['reasoning', 'data_analysis'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No trustsAndArrangements evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];

  for (const a of arrs) {
    if (a.settlorDisclosed === false) hits.push({ id: 'settlor_undisclosed', label: 'Settlor not disclosed', weight: 0.3, evidence: a.id });
    if (a.beneficiariesDisclosed === false) hits.push({ id: 'beneficiaries_undisclosed', label: 'Beneficiaries not disclosed', weight: 0.3, evidence: a.id });
    if (a.trusteeIsLicensed === false) hits.push({ id: 'unlicensed_trustee', label: 'Trustee not licensed', weight: 0.2, evidence: `${a.trusteeName ?? '?'} (${a.id})` });
    if (a.bearerSharesAllowed === true) hits.push({ id: 'bearer_shares', label: 'Bearer shares allowed', weight: 0.25, evidence: a.id });
    if ((a.multiJurisdictionLayers ?? 0) >= 4) hits.push({ id: 'multi_jurisdiction_layering', label: `${a.multiJurisdictionLayers} jurisdictional layers`, weight: 0.2, evidence: a.id });
    if (a.jurisdictionOfFormation && SECRECY_FORMATION_HAVENS.has(a.jurisdictionOfFormation.toUpperCase())) {
      hits.push({ id: 'secrecy_formation', label: `Formed in secrecy haven: ${a.jurisdictionOfFormation}`, weight: 0.15, evidence: a.id });
    }
    if (a.protectorPresent === true && a.beneficiariesDisclosed === false) {
      hits.push({ id: 'protector_with_undisclosed_beneficiaries', label: 'Protector present but beneficiaries undisclosed', weight: 0.2, evidence: a.id });
    }
    if (a.lastFiledRegistry) {
      const ageDays = (Date.now() - Date.parse(a.lastFiledRegistry)) / 86_400_000;
      if (ageDays > 365) hits.push({ id: 'stale_registry_filing', label: `Registry filing ${ageDays.toFixed(0)} days stale`, weight: 0.1, evidence: a.id });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'family_office_trust_transparency',
    category: 'governance' as ReasoningCategory,
    faculties: ['reasoning', 'data_analysis'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} trust-transparency signal(s) over ${arrs.length} arrangement(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.25 · UAE Cabinet Res 16/2021 (BO register) · OECD CRS.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default familyOfficeTrustApply;
