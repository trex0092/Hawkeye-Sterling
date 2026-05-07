// Hawkeye Sterling — wave-3 mode: npo_conflict_zone_flow
// Detects NPO disbursements into UN-sanctioned conflict zones without
// enhanced controls. Anchors: FATF R.8 (NPO sector), UN Security
// Council consolidated sanctions list, UAE FDL 10/2025 Art.15,
// UAE Cabinet Decision 50/2018 (NPO regulation).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface NpoDisbursement {
  disbursementId?: string;
  npoId?: string;
  recipientCountry?: string;          // ISO-2
  amountUsd?: number;
  amountAed?: number;
  channel?: 'wire' | 'cash_courier' | 'crypto' | 'in_kind' | 'hawala' | 'other';
  hasFieldVerification?: boolean;     // physical verification at delivery
  approvedByMlro?: boolean;
  at?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// UN-designated conflict zones / FATF call-for-action + monitored
// jurisdictions overlapping with active armed conflict (2024 baseline).
const CONFLICT_ZONES = new Set([
  'AF', 'SY', 'YE', 'IQ', 'SO', 'SS', 'SD', 'LY', 'CD', 'CF', 'ML',
  'MM', 'KP', 'IR', 'PS', 'UA',
]);
const HIGH_RISK_CHANNELS = new Set(['cash_courier', 'crypto', 'hawala']);

export const npoConflictZoneFlowApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = typedEvidence<NpoDisbursement>(ctx, 'npoDisbursements');
  if (items.length === 0) {
    return {
      modeId: 'npo_conflict_zone_flow',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No npoDisbursements evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const d of items) {
    const ref = d.disbursementId ?? '(unidentified)';
    const country = (d.recipientCountry ?? '').toUpperCase();
    const inConflict = CONFLICT_ZONES.has(country);
    if (inConflict) {
      hits.push({ id: 'conflict_zone', label: `Disbursement to UN-sanctioned conflict zone (${country})`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (inConflict && d.channel && HIGH_RISK_CHANNELS.has(d.channel)) {
      hits.push({ id: 'conflict_zone_high_risk_channel', label: `Conflict-zone disbursement via ${d.channel}`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (inConflict && d.hasFieldVerification === false) {
      hits.push({ id: 'no_field_verification', label: 'Conflict-zone disbursement without field verification', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (inConflict && d.approvedByMlro === false) {
      hits.push({ id: 'no_mlro_approval', label: 'Conflict-zone disbursement lacks MLRO approval', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'npo_conflict_zone_flow',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${items.length} disbursement(s) reviewed; ${hits.length} conflict-zone signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF R.8 · UN consolidated sanctions list · UAE FDL 10/2025 Art.15 · UAE CD 50/2018.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default npoConflictZoneFlowApply;
