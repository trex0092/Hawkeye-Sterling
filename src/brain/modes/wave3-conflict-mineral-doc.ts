// Hawkeye Sterling — wave-3 mode: conflict_mineral_documentation
// Detects gaps in conflict-mineral due-diligence documentation across
// 3TG (tin/tantalum/tungsten/gold) and cobalt supply chains.
// Anchors: US Dodd-Frank Act Section 1502 (conflict minerals reporting),
// EU Regulation 2017/821 (importer due-diligence for 3TG from CAHRAs),
// OECD DDG 5-step framework, UAE MoE Circular 2/2024 (responsible
// sourcing), RMI / RMAP audit framework.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface ConflictMineralBatch {
  batchId?: string;
  mineral?: '3T_tin' | '3T_tantalum' | '3T_tungsten' | 'gold' | 'cobalt';
  smelterId?: string;
  smelterRmapStatus?: 'conformant' | 'active' | 'expired' | 'not_enrolled';
  hasOriginCertificate?: boolean;
  hasChainOfCustodyDocs?: boolean;
  hasSection1502Filing?: boolean;        // SEC filing for US-listed companies
  hasEuImporterDueDiligence?: boolean;   // EU Reg 2017/821
  cahraOrigin?: boolean;
  countryOfOrigin?: string;              // ISO-2
  yearOfShipment?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// CAHRA list per OECD DDG + EU Reg 2017/821 implementing acts (2024).
const CAHRA_COUNTRIES = new Set([
  'CD',  // DRC + adjoining 9 covered countries:
  'AO', 'BI', 'CF', 'CG', 'RW', 'SS', 'TZ', 'UG', 'ZM',
  // Plus other globally-recognised CAHRAs:
  'AF', 'CO', 'IQ', 'MM', 'NG', 'SO', 'SY', 'YE', 'VE',
]);

export const conflictMineralDocumentationApply = async (ctx: BrainContext): Promise<Finding> => {
  const batches = typedEvidence<ConflictMineralBatch>(ctx, 'conflictMineralBatches');
  if (batches.length === 0) {
    return {
      modeId: 'conflict_mineral_documentation',
      category: 'compliance_framework' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No conflictMineralBatches evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const b of batches) {
    const ref = b.batchId ?? '(unidentified)';
    const country = (b.countryOfOrigin ?? '').toUpperCase();
    const isCahra = b.cahraOrigin || CAHRA_COUNTRIES.has(country);

    if (b.hasOriginCertificate === false) {
      hits.push({ id: 'no_origin_cert', label: 'No certificate of origin', weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (b.hasChainOfCustodyDocs === false) {
      hits.push({ id: 'no_coc_docs', label: 'No chain-of-custody documentation', weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (isCahra && b.smelterRmapStatus === 'not_enrolled') {
      hits.push({ id: 'cahra_no_rmap', label: 'CAHRA-origin batch from RMAP-not-enrolled smelter', weight: 0.5, evidence: ref, severity: 'escalate' });
    }
    if (isCahra && b.hasEuImporterDueDiligence === false) {
      hits.push({ id: 'cahra_no_eu_dd', label: 'CAHRA-origin batch without EU 2017/821 importer DD', weight: 0.45, evidence: ref, severity: 'escalate' });
    }
    if (b.mineral && b.hasSection1502Filing === false && (b.mineral === '3T_tin' || b.mineral === '3T_tantalum' || b.mineral === '3T_tungsten' || b.mineral === 'gold')) {
      hits.push({ id: 'no_1502_filing', label: 'Dodd-Frank Sec 1502 filing missing for 3TG batch', weight: 0.3, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'conflict_mineral_documentation',
    category: 'compliance_framework' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${batches.length} batch(es) reviewed; ${hits.length} documentation gap(s) detected.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: Dodd-Frank §1502 · EU Reg 2017/821 · OECD DDG · UAE MoE Circular 2/2024 · RMI/RMAP.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default conflictMineralDocumentationApply;
