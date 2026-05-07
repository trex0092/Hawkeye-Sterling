// Hawkeye Sterling — wave-3 mode: ins_policy_assignment
// Detects life-insurance policy assignments / changes-of-ownership used
// to launder value through assignment-without-CDD on the assignee.
// Anchors: FATF Risk-Based Approach for Life Insurance (Oct 2018) §3.6,
// IAIS Application Paper on AML/CFT (Nov 2019) §4.3, UAE CBUAE
// Insurance Authority Regulation 26/2014 Art.13 (CDD on assignee).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface PolicyAssignment {
  policyId?: string;
  assignmentId?: string;
  policyValueAed?: number;
  assignorId?: string;
  assigneeId?: string;
  assigneeRelationship?: 'self' | 'spouse' | 'child' | 'parent' | 'sibling' | 'business' | 'unrelated';
  cddOnAssigneeCompleted?: boolean;
  assigneeIsPep?: boolean;
  assigneeJurisdiction?: string;             // ISO-2
  assigneeJurisdictionFatfHighRisk?: boolean;
  considerationPaidAed?: number;             // value paid by assignee for assignment
  policyAgeAtAssignmentDays?: number;
  assignedAt?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FATF §3.6: assignment to unrelated party for less-than-fair-value
// consideration is the textbook layering vehicle. Threshold: assignee
// pays < 50% of policy value = material discount, escalate.
const FAIR_VALUE_DISCOUNT_FLAG_PCT = 0.20;       // < 20% discount = flag
const FAIR_VALUE_DISCOUNT_ESCALATE_PCT = 0.50;   // < 50% of value = escalate
const ASSIGNMENT_QUICK_FLIP_DAYS = 90;           // assigned within 90d of issue

export const insPolicyAssignmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<PolicyAssignment>(ctx, 'policyAssignments');
  if (items.length === 0) {
    return {
      modeId: 'ins_policy_assignment',
      category: 'sectoral_typology' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No policyAssignments evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const a of items) {
    const ref = a.assignmentId ?? a.policyId ?? '(unidentified)';
    const value = a.policyValueAed ?? 0;
    const consideration = a.considerationPaidAed ?? 0;
    const discount = value > 0 ? 1 - (consideration / value) : 0;

    if (a.cddOnAssigneeCompleted === false) {
      hits.push({ id: 'no_assignee_cdd', label: 'CDD on assignee not completed (UAE Reg 26/2014 Art.13)', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (a.assigneeRelationship === 'unrelated' && discount >= FAIR_VALUE_DISCOUNT_ESCALATE_PCT) {
      hits.push({ id: 'unrelated_below_fair_value', label: `Assignment to unrelated party at ${(discount * 100).toFixed(0)}% discount (≥${FAIR_VALUE_DISCOUNT_ESCALATE_PCT * 100}%)`, weight: 0.5, evidence: ref, severity: 'escalate' });
    } else if (a.assigneeRelationship === 'unrelated' && discount >= FAIR_VALUE_DISCOUNT_FLAG_PCT) {
      hits.push({ id: 'unrelated_discount', label: `Assignment to unrelated party at ${(discount * 100).toFixed(0)}% discount (≥${FAIR_VALUE_DISCOUNT_FLAG_PCT * 100}%)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (a.assigneeIsPep === true) {
      hits.push({ id: 'pep_assignee', label: 'PEP assignee — requires senior-management approval', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (a.assigneeJurisdictionFatfHighRisk === true) {
      hits.push({ id: 'high_risk_jurisdiction_assignee', label: `Assignee in FATF high-risk jurisdiction (${a.assigneeJurisdiction})`, weight: 0.35, evidence: ref, severity: 'escalate' });
    }
    if (typeof a.policyAgeAtAssignmentDays === 'number' && a.policyAgeAtAssignmentDays < ASSIGNMENT_QUICK_FLIP_DAYS) {
      hits.push({ id: 'quick_flip_assignment', label: `Policy assigned ${a.policyAgeAtAssignmentDays} days after issue (<${ASSIGNMENT_QUICK_FLIP_DAYS}d)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'ins_policy_assignment',
    category: 'sectoral_typology' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} assignment(s) reviewed; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF Life-Insurance Guidance Oct 2018 §3.6 · IAIS Application Paper Nov 2019 §4.3 · UAE CBUAE Reg 26/2014 Art.13.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default insPolicyAssignmentApply;
