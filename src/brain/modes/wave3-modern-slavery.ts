// Hawkeye Sterling — wave-3 mode: modern_slavery_indicator
// Detects modern-slavery / forced-labour signals in supply-chain
// counterparties. Anchors: UK Modern Slavery Act 2015 (transparency
// statements), Australian Modern Slavery Act 2018, ILO Forced Labour
// Indicators (11 indicators), FATF Recommendation 15 (predicate
// offence: human trafficking), UAE Federal Decree-Law 51/2006 (anti-
// trafficking).

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SupplierContext {
  supplierId?: string;
  supplierName?: string;
  jurisdiction?: string;                 // ISO-2
  sector?: string;                       // garments, mining, agriculture, etc.
  hasModernSlaveryStatement?: boolean;   // UK MSA / AU MSA filing
  msaStatementYear?: string;
  ilo_forcedLabour_indicators?: number;  // 0-11 — count of ILO indicators flagged
  reportedIncidents?: number;            // public NGO / press incidents
  workerComplaintsLastYear?: number;
  hasAuditedSupplyChain?: boolean;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// Sectors with documented systemic forced-labour risk per ILO 2022
// Global Estimates of Modern Slavery + US TVPRA list.
const HIGH_RISK_SECTORS = new Set([
  'garments', 'textiles', 'cotton', 'mining', 'gold_mining', 'agriculture',
  'fishing', 'construction', 'electronics', 'palm_oil', 'tobacco', 'cocoa',
  'brick_kiln', 'cobalt', 'mica',
]);

// US State Department TIP Report Tier 3 + Tier 2 Watch List 2024 (subset).
const HIGH_RISK_JURISDICTIONS = new Set([
  'KP', 'CN', 'CU', 'IR', 'MM', 'RU', 'SY', 'AF', 'BY', 'NI', 'VE',
  'UZ', 'TM', 'ER', 'CD', 'SS', 'ML', 'NG',
]);

const ILO_INDICATOR_FLAG = 3;        // ILO: 3+ indicators = strong evidence
const ILO_INDICATOR_ESCALATE = 5;

export const modernSlaveryIndicatorApply = async (ctx: BrainContext): Promise<Finding> => {
  const suppliers = typedEvidence<SupplierContext>(ctx, 'supplyChainSuppliers');
  if (suppliers.length === 0) {
    return {
      modeId: 'modern_slavery_indicator',
      category: 'esg' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No supplyChainSuppliers evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const s of suppliers) {
    const ref = s.supplierId ?? s.supplierName ?? '(unidentified)';
    const sector = (s.sector ?? '').toLowerCase();
    const jur = (s.jurisdiction ?? '').toUpperCase();
    const indicators = s.ilo_forcedLabour_indicators ?? 0;

    if (indicators >= ILO_INDICATOR_ESCALATE) {
      hits.push({ id: 'ilo_critical', label: `${indicators}/11 ILO forced-labour indicators flagged (≥${ILO_INDICATOR_ESCALATE})`, weight: 0.5, evidence: ref, severity: 'escalate' });
    } else if (indicators >= ILO_INDICATOR_FLAG) {
      hits.push({ id: 'ilo_flag', label: `${indicators}/11 ILO forced-labour indicators flagged (≥${ILO_INDICATOR_FLAG})`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if (HIGH_RISK_SECTORS.has(sector) && HIGH_RISK_JURISDICTIONS.has(jur)) {
      hits.push({ id: 'high_risk_sector_jurisdiction', label: `${sector} supplier in TIP-Tier-3 jurisdiction (${jur})`, weight: 0.4, evidence: ref, severity: 'escalate' });
    }
    if (HIGH_RISK_SECTORS.has(sector) && s.hasModernSlaveryStatement === false) {
      hits.push({ id: 'high_risk_no_msa_statement', label: `${sector} supplier without MSA / DDG transparency statement`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    if ((s.reportedIncidents ?? 0) >= 1) {
      hits.push({ id: 'reported_incidents', label: `${s.reportedIncidents} public NGO/press incident(s) reported`, weight: 0.35, evidence: ref, severity: 'flag' });
    }
    if ((s.workerComplaintsLastYear ?? 0) >= 5) {
      hits.push({ id: 'worker_complaints', label: `${s.workerComplaintsLastYear} worker complaint(s) last year (≥5)`, weight: 0.25, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'modern_slavery_indicator',
    category: 'esg' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.5 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${suppliers.length} supplier(s) reviewed; ${hits.length} modern-slavery signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: UK MSA 2015 · AU MSA 2018 · ILO Forced Labour Indicators · FATF R.15 · UAE FDL 51/2006.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default modernSlaveryIndicatorApply;
