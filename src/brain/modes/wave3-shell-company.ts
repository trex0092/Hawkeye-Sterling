// Hawkeye Sterling — wave-3 mode: shell_company_indicator
// Detects classic shell-company red flags: registered-mailbox address,
// nominee directors, zero employees, no commercial premises. Anchors:
// FATF R.24 (transparency of legal persons) · UAE Cabinet Res 58/2020.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CorporateProfile {
  entityId: string;
  registeredAddress?: string;
  isMailboxAddress?: boolean;
  hasCommercialPremises?: boolean;
  employeeCount?: number;
  directorIsNominee?: boolean;
  beneficialOwnersDisclosed?: boolean;
  yearsActive?: number;
  filingsLastYear?: number;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const shellCompanyApply = async (ctx: BrainContext): Promise<Finding> => {
  const profiles = typedEvidence<CorporateProfile>(ctx, 'corporateProfiles');
  if (profiles.length === 0) {
    return {
      modeId: 'shell_company_indicator',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No corporateProfiles evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const p of profiles) {
    const flags: string[] = [];
    if (p.isMailboxAddress === true) flags.push('mailbox_address');
    if (p.hasCommercialPremises === false) flags.push('no_premises');
    if ((p.employeeCount ?? -1) === 0) flags.push('zero_employees');
    if (p.directorIsNominee === true) flags.push('nominee_director');
    if (p.beneficialOwnersDisclosed === false) flags.push('bo_undisclosed');
    if ((p.filingsLastYear ?? -1) === 0 && (p.yearsActive ?? 0) > 1) flags.push('dormant_filings');

    if (flags.length >= 3) {
      hits.push({
        id: 'shell_pattern',
        label: `${p.entityId}: ${flags.length} shell indicators`,
        weight: Math.min(0.45, 0.15 + flags.length * 0.07),
        evidence: `${p.entityId}: ${flags.join(', ')}`,
      });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'shell_company_indicator',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} shell-company signal(s) over ${profiles.length} profile(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF R.24 · UAE Cabinet Res 58/2020 (UBO).`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default shellCompanyApply;
