// Hawkeye Sterling — wave-3 mode: ins_early_surrender_cash
// Detects early-surrender life-insurance redemptions used as a
// laundering vehicle. Anchors: FATF Risk-Based Approach for Life
// Insurance (Oct 2018) §3.4, IAIS ICP 22 (AML/CFT for insurers),
// UAE CBUAE Insurance Authority Regulation 26/2014.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface PolicySurrender {
  policyId?: string;
  customerId?: string;
  policyType?: 'whole_life' | 'universal_life' | 'unit_linked' | 'term' | 'annuity';
  premiumPaidAed?: number;
  surrenderValueAed?: number;
  policyAgeDays?: number;
  surrenderPenaltyAed?: number;
  surrenderReason?: string;
  payoutMethod?: 'wire' | 'cheque' | 'cash' | 'crypto' | 'third_party_account';
  payoutToThirdParty?: boolean;
  surrenderedAt?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// FATF Life-Insurance Guidance §3.4: early surrender (within 1-2 years)
// despite material penalty is a classic placement-stage typology.
const EARLY_SURRENDER_FLAG_DAYS = 365;        // < 1 year = flag
const EARLY_SURRENDER_ESCALATE_DAYS = 180;    // < 6 months = escalate
const PENALTY_TOLERANCE_PCT = 0.10;           // surrender despite ≥10% penalty

export const insEarlySurrenderCashApply = async (ctx: BrainContext): Promise<Finding> => {
  const surrenders = typedEvidence<PolicySurrender>(ctx, 'policySurrenders');
  if (surrenders.length === 0) {
    return {
      modeId: 'ins_early_surrender_cash',
      category: 'sectoral_typology' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No policySurrenders evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const s of surrenders) {
    const ref = s.policyId ?? '(unidentified)';
    const age = s.policyAgeDays ?? Number.MAX_SAFE_INTEGER;
    const premium = s.premiumPaidAed ?? 0;
    const penalty = s.surrenderPenaltyAed ?? 0;
    const penaltyPct = premium > 0 ? penalty / premium : 0;

    if (age < EARLY_SURRENDER_ESCALATE_DAYS) {
      hits.push({ id: 'surrender_under_6mo', label: `Surrender ${age} days after issue (<${EARLY_SURRENDER_ESCALATE_DAYS}d) — FATF placement-stage indicator`, weight: 0.5, evidence: ref, severity: 'escalate' });
    } else if (age < EARLY_SURRENDER_FLAG_DAYS) {
      hits.push({ id: 'surrender_under_1y', label: `Surrender ${age} days after issue (<${EARLY_SURRENDER_FLAG_DAYS}d)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (age < EARLY_SURRENDER_FLAG_DAYS && penaltyPct >= PENALTY_TOLERANCE_PCT) {
      hits.push({ id: 'surrender_despite_penalty', label: `Surrender despite ${(penaltyPct * 100).toFixed(0)}% penalty (≥${PENALTY_TOLERANCE_PCT * 100}%)`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (s.payoutToThirdParty === true) {
      hits.push({ id: 'third_party_payout', label: 'Surrender payout directed to third party', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (s.payoutMethod === 'cash' || s.payoutMethod === 'crypto') {
      hits.push({ id: 'high_risk_payout_channel', label: `Surrender payout via ${s.payoutMethod}`, weight: 0.35, evidence: ref, severity: 'flag' });
    }
    if (s.policyType === 'unit_linked' && age < EARLY_SURRENDER_FLAG_DAYS) {
      hits.push({ id: 'ulip_early_surrender', label: 'Unit-linked policy surrendered within 1y (FATF §3.4 elevated risk)', weight: 0.25, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'ins_early_surrender_cash',
    category: 'sectoral_typology' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${surrenders.length} surrender(s) reviewed; ${hits.length} signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF Life-Insurance Guidance Oct 2018 §3.4 · IAIS ICP 22 · UAE CBUAE Reg 26/2014.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default insEarlySurrenderCashApply;
