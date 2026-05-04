// Hawkeye Sterling — wave-3 mode: tbml_invoice_manipulation
// (audit follow-up #7). Detects classic trade-based money laundering
// invoice manipulation: over-invoicing, under-invoicing, multi-
// invoicing, phantom shipments, falsely-described goods.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface TradeInvoice {
  invoiceId: string;
  hsCode?: string;
  declaredUnitPrice?: number;
  marketUnitPrice?: number;     // benchmark (pre-supplied or external)
  quantity?: number;
  totalDeclared?: number;
  shipmentManifestRef?: string;
  duplicatedInvoiceIds?: string[];
  partyChain?: string[];         // exporter → intermediary → importer
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const tbmlInvoiceApply = async (ctx: BrainContext): Promise<Finding> => {
  const inv = typedEvidence<TradeInvoice>(ctx, 'tradeInvoices');
  if (inv.length === 0) {
    return {
      modeId: 'tbml_invoice_manipulation',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No tradeInvoices evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const i of inv) {
    if (i.declaredUnitPrice !== undefined && i.marketUnitPrice !== undefined && i.marketUnitPrice > 0) {
      const ratio = i.declaredUnitPrice / i.marketUnitPrice;
      if (ratio >= 1.5) hits.push({ id: 'over_invoice', label: `Over-invoiced ${(ratio * 100 - 100).toFixed(0)}%`, weight: Math.min(0.35, 0.1 + (ratio - 1.5) * 0.1), evidence: `${i.invoiceId}: ${i.declaredUnitPrice} vs market ${i.marketUnitPrice}` });
      else if (ratio <= 0.5) hits.push({ id: 'under_invoice', label: `Under-invoiced by ${(100 - ratio * 100).toFixed(0)}%`, weight: Math.min(0.35, 0.1 + (0.5 - ratio) * 0.5), evidence: `${i.invoiceId}: ${i.declaredUnitPrice} vs market ${i.marketUnitPrice}` });
    }
    if ((i.duplicatedInvoiceIds ?? []).length >= 1) {
      hits.push({ id: 'multi_invoicing', label: `Duplicate invoice id(s): ${i.duplicatedInvoiceIds!.length}`, weight: 0.3, evidence: `${i.invoiceId} ↔ ${(i.duplicatedInvoiceIds ?? []).slice(0, 3).join(', ')}` });
    }
    if (!i.shipmentManifestRef && (i.totalDeclared ?? 0) > 0) {
      hits.push({ id: 'phantom_shipment_risk', label: 'Invoice without shipment manifest', weight: 0.2, evidence: `${i.invoiceId}: ${i.totalDeclared}` });
    }
    if ((i.partyChain ?? []).length >= 4) {
      hits.push({ id: 'long_party_chain', label: `Party chain length ${i.partyChain!.length}`, weight: 0.15, evidence: i.partyChain!.join(' → ') });
    }
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'tbml_invoice_manipulation',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} TBML invoice signal(s) over ${inv.length} invoice(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: FATF TBML 2006 + 2008 reports · UAE FDL 10/2025 Art.15 · Cabinet Res 156/2025.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default tbmlInvoiceApply;
