// Hawkeye Sterling — wave-3 mode: ins_beneficiary_rotation
// Detects rapid / serial beneficiary changes on life-insurance policies
// — a structuring + integration-stage typology, especially when the
// new beneficiary differs in jurisdiction or relationship class.
// Anchors: FATF Risk-Based Approach for Life Insurance (Oct 2018) §3.3,
// IAIS ICP 22, UAE CBUAE Insurance Authority Regulation 26/2014.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface BeneficiaryChange {
  policyId?: string;
  changeId?: string;
  changedAt?: string;                     // ISO datetime
  oldBeneficiaryId?: string;
  newBeneficiaryId?: string;
  newBeneficiaryRelationship?: 'spouse' | 'child' | 'parent' | 'sibling' | 'business' | 'unrelated' | 'unknown';
  newBeneficiaryJurisdiction?: string;
  newBeneficiaryFatfHighRisk?: boolean;
  newBeneficiaryIsPep?: boolean;
  changeReason?: string;
  policyValueAed?: number;
  cddOnNewBeneficiary?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FATF §3.3: ≥3 beneficiary changes within 12 months on a single
// policy is a layering indicator. Rotation to unrelated /
// high-risk-jurisdiction beneficiary near maturity is escalation-tier.
const ROTATION_FLAG_COUNT_12MO = 3;
const ROTATION_ESCALATE_COUNT_12MO = 5;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export const insBeneficiaryRotationApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<BeneficiaryChange>(ctx, 'beneficiaryChanges');
  if (items.length === 0) {
    return {
      modeId: 'ins_beneficiary_rotation',
      category: 'sectoral_typology' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No beneficiaryChanges evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];

  // Group by policyId for rotation-frequency analysis.
  const byPolicy = new Map<string, BeneficiaryChange[]>();
  for (const c of items) {
    const pid = c.policyId ?? '(unknown)';
    if (!byPolicy.has(pid)) byPolicy.set(pid, []);
    (byPolicy.get(pid) ?? []).push(c);
  }

  for (const [pid, changes] of byPolicy) {
    const ref = pid;
    // Per-policy rotation frequency in trailing 12 months.
    const sorted = changes.slice().sort((a, b) => Date.parse(a.changedAt ?? '') - Date.parse(b.changedAt ?? ''));
    if (sorted.length >= ROTATION_FLAG_COUNT_12MO) {
      const earliest = Date.parse(sorted[0]?.changedAt ?? '');
      const latest = Date.parse(sorted[sorted.length - 1]?.changedAt ?? '');
      if (!Number.isNaN(earliest) && !Number.isNaN(latest) && (latest - earliest) <= TWELVE_MONTHS_MS) {
        if (sorted.length >= ROTATION_ESCALATE_COUNT_12MO) {
          hits.push({ id: 'rotation_extreme', label: `${sorted.length} beneficiary changes in 12 months on policy (≥${ROTATION_ESCALATE_COUNT_12MO})`, weight: 0.5, evidence: ref, severity: 'escalate' });
        } else {
          hits.push({ id: 'rotation_significant', label: `${sorted.length} beneficiary changes in 12 months on policy (≥${ROTATION_FLAG_COUNT_12MO})`, weight: 0.3, evidence: ref, severity: 'flag' });
        }
      }
    }

    // Per-change quality signals.
    for (const c of changes) {
      const cref = c.changeId ?? `${pid}@${c.changedAt ?? '?'}`;
      if (c.newBeneficiaryRelationship === 'unrelated') {
        hits.push({ id: 'unrelated_new_beneficiary', label: 'Beneficiary changed to unrelated party', weight: 0.3, evidence: cref, severity: 'flag' });
      }
      if (c.newBeneficiaryFatfHighRisk === true) {
        hits.push({ id: 'high_risk_new_beneficiary', label: `New beneficiary in FATF high-risk jurisdiction (${c.newBeneficiaryJurisdiction ?? '?'})`, weight: 0.4, evidence: cref, severity: 'escalate' });
      }
      if (c.newBeneficiaryIsPep === true) {
        hits.push({ id: 'pep_new_beneficiary', label: 'New beneficiary is a PEP', weight: 0.4, evidence: cref, severity: 'escalate' });
      }
      if (c.cddOnNewBeneficiary === false) {
        hits.push({ id: 'no_cdd_new_beneficiary', label: 'CDD on new beneficiary not completed', weight: 0.4, evidence: cref, severity: 'escalate' });
      }
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'ins_beneficiary_rotation',
    category: 'sectoral_typology' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} beneficiary change(s) across ${byPolicy.size} policies; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF Life-Insurance Guidance Oct 2018 §3.3 · IAIS ICP 22 · UAE CBUAE Reg 26/2014.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default insBeneficiaryRotationApply;
