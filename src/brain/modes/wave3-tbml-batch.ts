// Hawkeye Sterling — wave-3 TBML batch (8 modes).
// Anchors: FATF TBML 2006 + 2008 reports · UAE FDL 10/2025 Art.15.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
type ModeApply = (ctx: BrainContext) => Promise<Finding>;
const FAC: FacultyId[] = ['data_analysis', 'forensic_accounting'];
const CAT: ReasoningCategory = 'sectoral_typology';
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
function empty(modeId: string, key: string): Finding {
  return { modeId, category: CAT, faculties: FAC, score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict, rationale: `No ${key} evidence supplied.`, evidence: [], producedAt: Date.now() };
}
function build(modeId: string, hits: SignalHit[], n: number, anchors: string): Finding {
  const raw = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(raw > 0.7 ? 0.7 + (raw - 0.7) * 0.3 : raw);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return { modeId, category: CAT, faculties: FAC, score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict, rationale: `${hits.length} signal(s) over ${n} item(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: ${anchors}.`, evidence: hits.slice(0, 8).map((h) => h.evidence), producedAt: Date.now() };
}

interface PhantomShipment { invoiceId: string; manifestExists?: boolean; trackingExists?: boolean; portInRecord?: boolean; declaredValueAed?: number; }
const phantomShipmentApply: ModeApply = async (ctx) => {
  const items = typedEvidence<PhantomShipment>(ctx, 'phantomShipments');
  if (items.length === 0) return empty('phantom_shipment_detection', 'phantomShipments');
  const hits: SignalHit[] = [];
  for (const i of items) {
    const missing: string[] = [];
    if (i.manifestExists === false) missing.push('manifest');
    if (i.trackingExists === false) missing.push('tracking');
    if (i.portInRecord === false) missing.push('port_record');
    if (missing.length >= 2 && (i.declaredValueAed ?? 0) > 0) hits.push({ id: 'phantom_pattern', label: `${i.invoiceId}: missing ${missing.join('+')}`, weight: 0.4, evidence: `${i.invoiceId} (${i.declaredValueAed} AED)` });
  }
  return build('phantom_shipment_detection', hits, items.length, 'FATF TBML 2008 · UAE FDL 10/2025 Art.15');
};

interface VatChain { chainId: string; participantCount?: number; missingTraderDetected?: boolean; sameGoodsCirculatedTimes?: number; vatReclaimedAed?: number; }
const carouselVatApply: ModeApply = async (ctx) => {
  const items = typedEvidence<VatChain>(ctx, 'vatChains');
  if (items.length === 0) return empty('carousel_vat_fraud', 'vatChains');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.missingTraderDetected === true) hits.push({ id: 'missing_trader', label: 'Missing-trader detected', weight: 0.4, evidence: i.chainId });
    if ((i.sameGoodsCirculatedTimes ?? 0) >= 3) hits.push({ id: 'goods_recirculation', label: `Goods circulated ${i.sameGoodsCirculatedTimes}×`, weight: 0.35, evidence: i.chainId });
    if ((i.vatReclaimedAed ?? 0) >= 500_000) hits.push({ id: 'large_reclaim', label: `Reclaim AED ${i.vatReclaimedAed}`, weight: 0.25, evidence: i.chainId });
  }
  return build('carousel_vat_fraud', hits, items.length, 'EU MTIC fraud playbook · UAE FTA decisions');
};

interface CircularTrade { tradeId: string; partyChain?: string[]; closesLoop?: boolean; netInventoryChange?: number; }
const circularTradeApply: ModeApply = async (ctx) => {
  const items = typedEvidence<CircularTrade>(ctx, 'circularTrades');
  if (items.length === 0) return empty('circular_trade_pattern', 'circularTrades');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.closesLoop === true) hits.push({ id: 'closed_loop', label: `Loop length ${(i.partyChain ?? []).length}`, weight: 0.4, evidence: (i.partyChain ?? []).join(' → ') });
    if (Math.abs(i.netInventoryChange ?? 0) < 0.01 && (i.partyChain ?? []).length >= 4) hits.push({ id: 'no_net_change', label: 'No net inventory change after multi-party loop', weight: 0.35, evidence: i.tradeId });
  }
  return build('circular_trade_pattern', hits, items.length, 'FATF TBML 2006 · OECD BEPS Action 13');
};

interface InvoiceSet { groupId: string; sameGoodsCount?: number; valuesMatch?: boolean; partiesOverlap?: boolean; }
const multiInvoicingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<InvoiceSet>(ctx, 'invoiceSets');
  if (items.length === 0) return empty('multi_invoicing_anomaly', 'invoiceSets');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.sameGoodsCount ?? 0) >= 2 && i.valuesMatch === false) hits.push({ id: 'duplicate_diff_values', label: `${i.sameGoodsCount} invoices, divergent values`, weight: 0.4, evidence: i.groupId });
    if (i.partiesOverlap === false && (i.sameGoodsCount ?? 0) >= 2) hits.push({ id: 'duplicate_diff_parties', label: 'Same goods, different parties', weight: 0.3, evidence: i.groupId });
  }
  return build('multi_invoicing_anomaly', hits, items.length, 'FATF TBML 2008 · UAE FDL 10/2025 Art.15');
};

interface DeclaredGoods { invoiceId: string; declaredHsCode?: string; physicalDescriptionHsCode?: string; physicalInspectionDone?: boolean; }
const misDescribedGoodsApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DeclaredGoods>(ctx, 'declaredGoods');
  if (items.length === 0) return empty('mis_described_goods', 'declaredGoods');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.declaredHsCode && i.physicalDescriptionHsCode && i.declaredHsCode.slice(0, 4) !== i.physicalDescriptionHsCode.slice(0, 4)) {
      hits.push({ id: 'hs_mismatch', label: `HS chapter mismatch ${i.declaredHsCode} vs ${i.physicalDescriptionHsCode}`, weight: 0.4, evidence: i.invoiceId });
    }
    if (i.physicalInspectionDone === false && i.declaredHsCode) hits.push({ id: 'no_physical_check', label: 'No physical inspection', weight: 0.2, evidence: i.invoiceId });
  }
  return build('mis_described_goods', hits, items.length, 'FATF TBML 2008 · WCO Harmonized System · UAE Customs');
};

interface IntraGroupTransaction { transactionId: string; declaredPriceAed?: number; armsLengthBenchmarkAed?: number; relatedParty?: boolean; jurisdictionTaxRatePct?: number; }
const transferPricingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<IntraGroupTransaction>(ctx, 'intraGroupTransactions');
  if (items.length === 0) return empty('transfer_pricing_manipulation', 'intraGroupTransactions');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (!i.relatedParty) continue;
    const declared = i.declaredPriceAed ?? 0, bench = i.armsLengthBenchmarkAed ?? 0;
    if (bench > 0 && (declared / bench < 0.6 || declared / bench > 1.6)) {
      hits.push({ id: 'non_arms_length', label: `${(declared / bench * 100).toFixed(0)}% of arm's-length`, weight: 0.4, evidence: `${i.transactionId}: ${declared}/${bench}` });
    }
    if ((i.jurisdictionTaxRatePct ?? 100) <= 5) hits.push({ id: 'low_tax_jur', label: `Counterparty in ${i.jurisdictionTaxRatePct}% tax jur`, weight: 0.2, evidence: i.transactionId });
  }
  return build('transfer_pricing_manipulation', hits, items.length, 'OECD BEPS · UAE Federal Corporate Tax Law · FATF TBML 2006');
};

interface RoundTrip { roundTripId: string; outflowAed?: number; inflowAed?: number; outflowDate?: string; inflowDate?: string; sameUboBothEnds?: boolean; }
const roundTrippingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<RoundTrip>(ctx, 'roundTrips');
  if (items.length === 0) return empty('round_tripping_pattern', 'roundTrips');
  const hits: SignalHit[] = [];
  for (const i of items) {
    const out = i.outflowAed ?? 0, ins = i.inflowAed ?? 0;
    if (i.sameUboBothEnds === true && out > 0 && Math.abs(out - ins) / out < 0.1) {
      hits.push({ id: 'mirror_amount_same_ubo', label: `Out ${out} ≈ In ${ins}, same UBO both ends`, weight: 0.45, evidence: i.roundTripId });
    }
    if (i.outflowDate && i.inflowDate) {
      const span = Math.abs(Date.parse(i.inflowDate) - Date.parse(i.outflowDate)) / 86_400_000;
      if (Number.isFinite(span) && span <= 14) hits.push({ id: 'rapid_return', label: `Round-trip in ${span.toFixed(0)}d`, weight: 0.25, evidence: i.roundTripId });
    }
  }
  return build('round_tripping_pattern', hits, items.length, 'FATF TBML 2006 · OECD BEPS Action 6');
};

interface ImportExportRatio { entityId: string; importsAed?: number; exportsAed?: number; declaredMargin?: number; }
const importExportRatioApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ImportExportRatio>(ctx, 'importExportRatios');
  if (items.length === 0) return empty('import_export_ratio_anomaly', 'importExportRatios');
  const hits: SignalHit[] = [];
  for (const i of items) {
    const imp = i.importsAed ?? 0, exp = i.exportsAed ?? 0;
    if (imp > 0 && exp > 0) {
      const ratio = exp / imp;
      if (ratio >= 5 || ratio <= 0.2) hits.push({ id: 'extreme_ratio', label: `Export/Import = ${ratio.toFixed(2)}`, weight: 0.35, evidence: i.entityId });
    }
    if ((i.declaredMargin ?? 0) <= 0.01 && exp >= 1_000_000) hits.push({ id: 'zero_margin_high_volume', label: `≤1% margin on AED ${exp}`, weight: 0.25, evidence: i.entityId });
  }
  return build('import_export_ratio_anomaly', hits, items.length, 'FATF TBML 2008 · UAE FDL 10/2025 Art.15');
};

export const TBML_BATCH_APPLIES: Record<string, ModeApply> = {
  phantom_shipment_detection: phantomShipmentApply,
  carousel_vat_fraud: carouselVatApply,
  circular_trade_pattern: circularTradeApply,
  multi_invoicing_anomaly: multiInvoicingApply,
  mis_described_goods: misDescribedGoodsApply,
  transfer_pricing_manipulation: transferPricingApply,
  round_tripping_pattern: roundTrippingApply,
  import_export_ratio_anomaly: importExportRatioApply,
};
