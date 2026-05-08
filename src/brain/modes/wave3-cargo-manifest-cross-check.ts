// Hawkeye Sterling — wave-3 mode: cargo_manifest_cross_check
// Cross-validates cargo manifests against companion invoices for HS-code,
// weight and value discrepancies — classic over/under-invoicing TBML.
// Anchors: FATF Trade-Based Money Laundering Risk Indicators (2021),
// FATF R.16, World Customs Organization TBML guide,
// UAE Federal Customs Authority manifest-validation,
// Egmont Group TBML Typologies 2020.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CargoManifest {
  manifestId?: string;
  vessel?: string;
  blNumber?: string;
  portLoading?: string;
  portDischarge?: string;
  goodsDescription?: string;
  hsCode?: string;
  declaredWeightKg?: number;
  declaredValueUsd?: number;
  lcReference?: string;
  invoiceReference?: string;
  at?: string;
}

interface Invoice {
  invoiceId?: string;
  blReference?: string;
  goodsDescription?: string;
  hsCode?: string;
  weightKg?: number;
  valueUsd?: number;
  shipperCountry?: string;
  consigneeCountry?: string;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
function pctDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denom;
}

const WEIGHT_FLAG_PCT     = 0.10;
const WEIGHT_ESCALATE_PCT = 0.25;
const VALUE_FLAG_PCT      = 0.15;
const VALUE_ESCALATE_PCT  = 0.50;

export const cargoManifestCrossCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const manifests = typedEvidence<CargoManifest>(ctx, 'cargoManifests');
  const invoices = typedEvidence<Invoice>(ctx, 'invoices');
  if (manifests.length === 0) {
    return {
      modeId: 'cargo_manifest_cross_check',
      category: 'forensic' satisfies ReasoningCategory,
      faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No cargoManifests evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const invoiceByBl: Map<string, Invoice> = new Map();
  for (const inv of invoices) {
    if (inv.blReference) invoiceByBl.set(inv.blReference, inv);
  }

  const hits: SignalHit[] = [];
  let orphan = 0, hsMismatch = 0, weightMismatch = 0, valueMismatch = 0;

  for (const m of manifests) {
    const ref = m.manifestId ?? m.blNumber ?? '(unidentified)';
    const inv = m.blNumber ? invoiceByBl.get(m.blNumber) : undefined;
    if (!inv) {
      orphan++;
      hits.push({ id: 'orphan_manifest', label: `Manifest ${m.blNumber ?? ref} has no companion invoice`, weight: 0.15, evidence: ref, severity: 'flag' });
      continue;
    }
    if (m.hsCode && inv.hsCode && m.hsCode !== inv.hsCode) {
      hsMismatch++;
      hits.push({ id: 'hs_mismatch', label: `HS-code mismatch: manifest ${m.hsCode} vs invoice ${inv.hsCode}`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
    const wDiff = pctDiff(m.declaredWeightKg ?? 0, inv.weightKg ?? 0);
    if (wDiff >= WEIGHT_ESCALATE_PCT) {
      weightMismatch++;
      hits.push({ id: 'weight_escalate', label: `Weight diff ${(wDiff * 100).toFixed(0)}% (≥${WEIGHT_ESCALATE_PCT * 100}%)`, weight: 0.4, evidence: ref, severity: 'escalate' });
    } else if (wDiff >= WEIGHT_FLAG_PCT) {
      weightMismatch++;
      hits.push({ id: 'weight_flag', label: `Weight diff ${(wDiff * 100).toFixed(0)}% (≥${WEIGHT_FLAG_PCT * 100}%)`, weight: 0.2, evidence: ref, severity: 'flag' });
    }
    const vDiff = pctDiff(m.declaredValueUsd ?? 0, inv.valueUsd ?? 0);
    if (vDiff >= VALUE_ESCALATE_PCT) {
      valueMismatch++;
      hits.push({ id: 'value_escalate', label: `Value diff ${(vDiff * 100).toFixed(0)}% (≥${VALUE_ESCALATE_PCT * 100}%) — over/under-invoicing`, weight: 0.5, evidence: ref, severity: 'escalate' });
    } else if (vDiff >= VALUE_FLAG_PCT) {
      valueMismatch++;
      hits.push({ id: 'value_flag', label: `Value diff ${(vDiff * 100).toFixed(0)}% (≥${VALUE_FLAG_PCT * 100}%)`, weight: 0.3, evidence: ref, severity: 'flag' });
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate'
    : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'cargo_manifest_cross_check',
    category: 'forensic' satisfies ReasoningCategory,
    faculties: ['forensic_accounting', 'data_analysis'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${manifests.length} manifest(s) cross-checked vs ${invoices.length} invoice(s). Discrepancies: ${hsMismatch} HS, ${weightMismatch} weight, ${valueMismatch} value. Orphans: ${orphan}.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: FATF TBML Risk Indicators 2021 · FATF R.16 · WCO TBML Guide · UAE FCA · Egmont TBML Typologies 2020.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default cargoManifestCrossCheckApply;
