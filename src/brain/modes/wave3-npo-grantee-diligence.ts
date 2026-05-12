// Hawkeye Sterling — wave-3 mode: npo_grantee_diligence
// Detects CDD gaps in NPO grant disbursements — particularly cash and
// CAHRA-jurisdiction recipients. Anchors: FATF R.8 (Non-profits),
// UAE Cabinet Decision 50/2018 (NPO sector AML/CFT regulation),
// UAE Federal Decree-Law No. 10/2025 Art.15 (NPO supervision).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface NpoGrant {
  grantId?: string;
  npoId?: string;
  granteeName?: string;
  granteeJurisdiction?: string;
  amountAed?: number;
  purpose?: string;
  cddCompleted?: boolean;
  cddDocsRetained?: boolean;
  isCahraJurisdiction?: boolean;
  isCashDistribution?: boolean;
  at?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const CASH_DIST_THRESHOLD_AED = 5_000;        // ⚠️ VERIFY — interpolated from FATF R.8 best-practice
const LARGE_GRANT_THRESHOLD_AED = 100_000;

export const npoGranteeDiligenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const grants = typedEvidence<NpoGrant>(ctx, 'npoGrants');
  if (grants.length === 0) {
    return {
      modeId: 'npo_grantee_diligence',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'reasoning'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No npoGrants evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const g of grants) {
    const ref = g.grantId ?? g.granteeName ?? '(unidentified)';
    const amount = g.amountAed ?? 0;
    if (g.cddCompleted === false) {
      hits.push({ id: 'no_cdd', label: 'Grantee CDD not completed', weight: 0.2, evidence: ref, severity: 'flag' });
    }
    if (g.cddDocsRetained === false) {
      hits.push({ id: 'no_cdd_docs', label: 'CDD docs not retained (CD 50/2018 Art.4)', weight: 0.2, evidence: ref, severity: 'flag' });
    }
    if (g.isCahraJurisdiction && g.cddCompleted === false) {
      hits.push({ id: 'cahra_no_cdd', label: 'CAHRA-jurisdiction grantee with no CDD', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (g.isCashDistribution && amount > CASH_DIST_THRESHOLD_AED) {
      hits.push({ id: 'cash_distribution', label: `Cash distribution AED ${amount.toLocaleString()} > ${CASH_DIST_THRESHOLD_AED.toLocaleString()}`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
    if (amount > LARGE_GRANT_THRESHOLD_AED && g.cddCompleted === false) {
      hits.push({ id: 'large_grant_no_cdd', label: `Large grant AED ${amount.toLocaleString()} with no CDD`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  const missingCdd = grants.filter((g) => g.cddCompleted === false).length;
  const cahraCount = grants.filter((g) => g.isCahraJurisdiction).length;
  const cashCount = grants.filter((g) => g.isCashDistribution).length;
  const summary = `${grants.length} grant(s) reviewed. ${missingCdd} lack grantee CDD. ${cahraCount} to CAHRA jurisdictions. ${cashCount} cash distributions.`;

  return {
    modeId: 'npo_grantee_diligence',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'reasoning'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      summary,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF R.8 · UAE CD 50/2018 · FDL No.10/2025 Art.15.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default npoGranteeDiligenceApply;
