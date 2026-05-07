// Hawkeye Sterling — wave-3 mode: child_labour_indicator
// Detects child-labour signals in supply-chain counterparties.
// Anchors: ILO Convention C138 (Minimum Age for Admission to
// Employment, 1973), ILO Convention C182 (Worst Forms of Child
// Labour, 1999), OECD DDG Annex II §1.c (worst forms of child
// labour as red flag), US TVPRA list of goods produced by child
// labour, UAE Federal Decree-Law 33/2021 (Labour Relations).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ChildLabourContext {
  supplierId?: string;
  supplierName?: string;
  jurisdiction?: string;
  sector?: string;
  hasIloC138Ratification?: boolean;        // jurisdiction-level
  hasIloC182Ratification?: boolean;
  minAgeOfWorkers?: number;                // documented minimum age
  hasAgeVerificationProcedure?: boolean;
  isOnTvpraList?: boolean;                 // US TVPRA-listed goods
  reportedChildLabourIncidents?: number;
  hasIndependentAudit?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate' | 'block'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// US TVPRA 2024 — sectors with documented child-labour goods.
const TVPRA_SECTORS = new Set([
  'cocoa', 'cotton', 'coffee', 'tobacco', 'gold_mining', 'mining', 'mica',
  'cobalt', 'palm_oil', 'sugarcane', 'fish', 'tea', 'rubber', 'rice',
  'textiles', 'garments', 'brick_kiln',
]);

// ILO C138 sets minimum employment age at 15 (14 in developing countries).
// Below 14 = absolute minimum threshold; below 15 = flag in non-developing.
const ABSOLUTE_MIN_AGE = 14;
const STANDARD_MIN_AGE = 15;

export const childLabourIndicatorApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<ChildLabourContext>(ctx, 'childLabourSuppliers');
  if (items.length === 0) {
    return {
      modeId: 'child_labour_indicator',
      category: 'esg' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No childLabourSuppliers evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const s of items) {
    const ref = s.supplierId ?? s.supplierName ?? '(unidentified)';
    const sector = (s.sector ?? '').toLowerCase();
    const minAge = s.minAgeOfWorkers ?? 18;

    if (minAge < ABSOLUTE_MIN_AGE) {
      hits.push({ id: 'below_absolute_min', label: `Workers documented below ILO absolute minimum age (${minAge} < ${ABSOLUTE_MIN_AGE})`, weight: 0.7, evidence: ref, severity: 'block' });
    } else if (minAge < STANDARD_MIN_AGE) {
      hits.push({ id: 'below_standard_min', label: `Workers below ILO C138 standard minimum age (${minAge} < ${STANDARD_MIN_AGE})`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (TVPRA_SECTORS.has(sector) && s.hasIndependentAudit === false) {
      hits.push({ id: 'tvpra_no_audit', label: `${sector} on US TVPRA list, no independent audit`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (s.isOnTvpraList && s.hasAgeVerificationProcedure === false) {
      hits.push({ id: 'tvpra_no_age_verification', label: 'TVPRA-listed supplier without age-verification procedure', weight: 0.45, evidence: ref, severity: 'escalate' });
    }
    if ((s.reportedChildLabourIncidents ?? 0) >= 1) {
      hits.push({ id: 'reported_incidents', label: `${s.reportedChildLabourIncidents} child-labour incident(s) reported`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (s.hasIloC182Ratification === false) {
      hits.push({ id: 'no_c182_ratification', label: 'Jurisdiction has not ratified ILO C182 (worst forms of child labour)', weight: 0.25, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'block') ? 'block'
    : hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'child_labour_indicator',
    category: 'esg' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.95, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} supplier context(s) reviewed; ${hits.length} child-labour signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: ILO C138 (1973) · ILO C182 (1999) · OECD DDG Annex II §1.c · US TVPRA list · UAE FDL 33/2021.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default childLabourIndicatorApply;
