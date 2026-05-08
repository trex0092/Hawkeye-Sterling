// Hawkeye Sterling — wave-3 mode: port_state_control
// Detects vessels with PSC detentions or significant deficiencies —
// substandard-vessel risk that often correlates with sanctions evasion
// and dark-fleet operation. Anchors: Paris MoU on PSC, Tokyo MoU on PSC,
// IMO Resolution A.1138(31), FATF Vessel-Risk Indicators (Sept 2020).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface PscRecord {
  imo?: string;
  inspectionDate?: string;
  portCountry?: string;
  mou?: 'paris' | 'tokyo' | 'caribbean' | 'mediterranean' | 'us_uscg' | 'other';
  detentions?: number;
  deficiencies?: number;
  deficiencyCategories?: string[];
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const TIER1_MOUS = new Set(['paris', 'tokyo']);
const DEFICIENCY_FLAG_THRESHOLD = 10;

export const portStateControlApply = async (ctx: BrainContext): Promise<Finding> => {
  const records = typedEvidence<PscRecord>(ctx, 'pscRecords');
  if (records.length === 0) {
    return {
      modeId: 'port_state_control',
      category: 'forensic' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No pscRecords evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  let detentionsTotal = 0;
  const detentionsByImo: Map<string, number> = new Map();
  let lastDetentionRef = '';

  for (const r of records) {
    const ref = `${r.imo ?? '(unknown)'}@${r.inspectionDate ?? '?'}`;
    const det = r.detentions ?? 0;
    const def = r.deficiencies ?? 0;
    detentionsTotal += det;
    if (r.imo) detentionsByImo.set(r.imo, (detentionsByImo.get(r.imo) ?? 0) + det);

    if (det >= 1) {
      const isTier1 = r.mou && TIER1_MOUS.has(r.mou);
      hits.push({
        id: isTier1 ? 'detention_tier1' : 'detention',
        label: `${det} PSC detention(s) at ${r.portCountry ?? '?'} (${r.mou ?? 'mou?'})`,
        weight: isTier1 ? 0.45 : 0.3,
        evidence: ref,
        severity: isTier1 ? 'escalate' : 'flag',
      });
      lastDetentionRef = ref;
    }
    if (def >= DEFICIENCY_FLAG_THRESHOLD) {
      hits.push({
        id: 'high_deficiencies',
        label: `${def} deficiencies recorded (≥${DEFICIENCY_FLAG_THRESHOLD})`,
        weight: 0.2,
        evidence: ref,
        severity: 'flag',
      });
    }
  }

  // Repeat-detention escalation (≥2 detentions on same IMO across 24-month window).
  for (const [imo, count] of detentionsByImo) {
    if (count >= 2) {
      hits.push({
        id: 'repeat_detentions',
        label: `Repeat detentions: vessel ${imo} detained ${count}× across record set`,
        weight: 0.4,
        evidence: imo,
        severity: 'escalate',
      });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'port_state_control',
    category: 'forensic' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${records.length} PSC record(s) reviewed across ${detentionsByImo.size} vessel(s); ${detentionsTotal} total detention(s).`,
      lastDetentionRef ? `Last detention: ${lastDetentionRef}.` : '',
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: Paris MoU · Tokyo MoU · IMO Res A.1138(31) · FATF Vessel-Risk Indicators 2020.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default portStateControlApply;
