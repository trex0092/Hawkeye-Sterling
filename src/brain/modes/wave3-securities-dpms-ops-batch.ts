// Hawkeye Sterling — wave-3 securities / DPMS / ops batch (15 modes).
// Anchors: FATF R.22 · UAE Cabinet Res 134/2025 (DPMS) · IOSCO · SCA UAE.

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
function empty(modeId: string, key: string, cat: ReasoningCategory = CAT): Finding {
  return { modeId, category: cat, faculties: FAC, score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict, rationale: `No ${key} evidence supplied.`, evidence: [], producedAt: Date.now() };
}
function build(modeId: string, hits: SignalHit[], n: number, anchors: string, cat: ReasoningCategory = CAT): Finding {
  const raw = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(raw > 0.7 ? 0.7 + (raw - 0.7) * 0.3 : raw);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return { modeId, category: cat, faculties: FAC, score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict, rationale: `${hits.length} signal(s) over ${n} item(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: ${anchors}.`, evidence: hits.slice(0, 8).map((h) => h.evidence), producedAt: Date.now() };
}

interface InsurancePolicy { policyId: string; premiumPaidAed?: number; surrenderedWithinDays?: number; surrenderValueAed?: number; }
const insuranceDumpApply: ModeApply = async (ctx) => {
  const items = typedEvidence<InsurancePolicy>(ctx, 'insurancePolicies');
  if (items.length === 0) return empty('insurance_premium_dump', 'insurancePolicies');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.surrenderedWithinDays ?? Infinity) <= 90 && (i.premiumPaidAed ?? 0) >= 100_000) hits.push({ id: 'rapid_surrender_high_premium', label: `Premium AED ${i.premiumPaidAed} surrendered in ${i.surrenderedWithinDays}d`, weight: 0.45, evidence: i.policyId });
  }
  return build('insurance_premium_dump', hits, items.length, 'FATF Insurance 2018 · IAIS ICP 22');
};

interface PolicyAssignment { policyId: string; assigneeRelationship?: 'spouse' | 'parent' | 'child' | 'unrelated' | 'corporate'; ownershipChangeWithinDays?: number; }
const lifePolicyAssignApply: ModeApply = async (ctx) => {
  const items = typedEvidence<PolicyAssignment>(ctx, 'policyAssignments');
  if (items.length === 0) return empty('life_policy_third_party_assignment', 'policyAssignments');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.assigneeRelationship === 'unrelated' || i.assigneeRelationship === 'corporate') hits.push({ id: 'unrelated_assignee', label: `Assigned to ${i.assigneeRelationship}`, weight: 0.4, evidence: i.policyId });
    if ((i.ownershipChangeWithinDays ?? 9999) <= 90) hits.push({ id: 'rapid_assignment', label: `Assigned within ${i.ownershipChangeWithinDays}d`, weight: 0.25, evidence: i.policyId });
  }
  return build('life_policy_third_party_assignment', hits, items.length, 'FATF Insurance 2018 · IAIS ICP 22');
};

interface SwapTrade { tradeId: string; notionalAed?: number; offsettingTrades?: number; counterpartyRelated?: boolean; }
const securitiesSwapLayerApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SwapTrade>(ctx, 'swapTrades');
  if (items.length === 0) return empty('securities_swap_layering', 'swapTrades', 'market_integrity');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.offsettingTrades ?? 0) >= 3 && i.counterpartyRelated === true) hits.push({ id: 'offsetting_related_party', label: `${i.offsettingTrades} offsetting trades, related party`, weight: 0.4, evidence: i.tradeId });
  }
  return build('securities_swap_layering', hits, items.length, 'IOSCO MMoU · UAE SCA', 'market_integrity');
};

interface SecuritiesWash { tradeId: string; sameUboBothSides?: boolean; priceImpactBps?: number; }
const washTradingSecuritiesApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SecuritiesWash>(ctx, 'securitiesWashTrades');
  if (items.length === 0) return empty('wash_trading_securities', 'securitiesWashTrades', 'market_integrity');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.sameUboBothSides === true) hits.push({ id: 'same_ubo', label: 'Same UBO both sides', weight: 0.5, evidence: i.tradeId });
    if (Math.abs(i.priceImpactBps ?? 0) >= 50) hits.push({ id: 'price_move', label: `${i.priceImpactBps}bps price impact`, weight: 0.25, evidence: i.tradeId });
  }
  return build('wash_trading_securities', hits, items.length, 'IOSCO Manipulation · SCA UAE Rulebook', 'market_integrity');
};

interface OrderBookEvent { eventId: string; spoofedQuoteCount?: number; cancellationRatio?: number; }
const spoofingLayeringApply: ModeApply = async (ctx) => {
  const items = typedEvidence<OrderBookEvent>(ctx, 'orderBookEvents');
  if (items.length === 0) return empty('spoofing_layering', 'orderBookEvents', 'market_integrity');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.cancellationRatio ?? 0) >= 0.95 && (i.spoofedQuoteCount ?? 0) >= 10) hits.push({ id: 'high_cancel_layered', label: `${((i.cancellationRatio ?? 0) * 100).toFixed(0)}% cancellation across ${i.spoofedQuoteCount} layers`, weight: 0.45, evidence: i.eventId });
  }
  return build('spoofing_layering', hits, items.length, 'CFTC anti-spoofing · MAR · SCA UAE', 'market_integrity');
};

interface PumpDumpEvent { tickerId: string; volumeSpikeMultiplier?: number; priceMoveMultiplier?: number; promotionDetected?: boolean; }
const pumpDumpApply: ModeApply = async (ctx) => {
  const items = typedEvidence<PumpDumpEvent>(ctx, 'pumpDumpEvents');
  if (items.length === 0) return empty('pump_and_dump_indicator', 'pumpDumpEvents', 'market_integrity');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.volumeSpikeMultiplier ?? 0) >= 10) hits.push({ id: 'volume_spike', label: `Volume ${i.volumeSpikeMultiplier}× baseline`, weight: 0.35, evidence: i.tickerId });
    if ((i.priceMoveMultiplier ?? 0) >= 2) hits.push({ id: 'price_move', label: `Price ${i.priceMoveMultiplier}×`, weight: 0.3, evidence: i.tickerId });
    if (i.promotionDetected === true) hits.push({ id: 'promotion', label: 'Promotional campaign', weight: 0.3, evidence: i.tickerId });
  }
  return build('pump_and_dump_indicator', hits, items.length, 'IOSCO Manipulation · SEC Rule 10b-5', 'market_integrity');
};

interface GoldCorridor { shipmentId: string; weightKg?: number; declaredOriginIso2?: string; conflictMineralsRisk?: boolean; }
const goldSmugglingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<GoldCorridor>(ctx, 'goldCorridors');
  if (items.length === 0) return empty('gold_smuggling_corridor', 'goldCorridors');
  const hits: SignalHit[] = [];
  const conflictRiskOrigins = new Set(['SD', 'CD', 'CF', 'VE']);
  for (const i of items) {
    if ((i.weightKg ?? 0) >= 10) hits.push({ id: 'large_gold_movement', label: `${i.weightKg}kg movement`, weight: 0.3, evidence: i.shipmentId });
    if (i.declaredOriginIso2 && conflictRiskOrigins.has(i.declaredOriginIso2.toUpperCase())) hits.push({ id: 'conflict_origin', label: `Origin ${i.declaredOriginIso2}`, weight: 0.4, evidence: i.shipmentId });
    if (i.conflictMineralsRisk === true) hits.push({ id: 'conflict_minerals_risk', label: 'Conflict-minerals risk', weight: 0.3, evidence: i.shipmentId });
  }
  return build('gold_smuggling_corridor', hits, items.length, 'OECD Conflict Minerals · UAE Cabinet Res 134/2025');
};

interface FictitiousSupplier { supplierId: string; existsInRegistry?: boolean; addressVerified?: boolean; tradeLicenseValid?: boolean; }
const fictitiousSupplierApply: ModeApply = async (ctx) => {
  const items = typedEvidence<FictitiousSupplier>(ctx, 'fictitiousSuppliers');
  if (items.length === 0) return empty('dpms_fictitious_supplier', 'fictitiousSuppliers');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.existsInRegistry === false) hits.push({ id: 'not_in_registry', label: 'Supplier not in registry', weight: 0.4, evidence: i.supplierId });
    if (i.addressVerified === false) hits.push({ id: 'unverified_address', label: 'Address unverified', weight: 0.25, evidence: i.supplierId });
    if (i.tradeLicenseValid === false) hits.push({ id: 'invalid_license', label: 'Invalid trade license', weight: 0.3, evidence: i.supplierId });
  }
  return build('dpms_fictitious_supplier', hits, items.length, 'UAE Cabinet Res 134/2025 · MoE Circular 3/2025');
};

interface PreciousStone { stoneId: string; provenanceCertified?: boolean; certifyingAuthority?: string; conflictRiskRegion?: boolean; }
const preciousStonesProvenanceApply: ModeApply = async (ctx) => {
  const items = typedEvidence<PreciousStone>(ctx, 'preciousStones');
  if (items.length === 0) return empty('precious_stones_provenance_gap', 'preciousStones');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.provenanceCertified === false) hits.push({ id: 'no_provenance', label: 'No provenance certificate', weight: 0.4, evidence: i.stoneId });
    if (i.conflictRiskRegion === true) hits.push({ id: 'conflict_region', label: 'Conflict region origin', weight: 0.35, evidence: i.stoneId });
    if (i.provenanceCertified === true && !i.certifyingAuthority) hits.push({ id: 'unnamed_authority', label: 'Cert without named authority', weight: 0.2, evidence: i.stoneId });
  }
  return build('precious_stones_provenance_gap', hits, items.length, 'Kimberley Process · UAE Cabinet Res 134/2025');
};

interface BullionWarehouse { warehouseId: string; stockReconcilationVarianceKg?: number; lastAuditDaysAgo?: number; }
const bullionWarehouseApply: ModeApply = async (ctx) => {
  const items = typedEvidence<BullionWarehouse>(ctx, 'bullionWarehouses');
  if (items.length === 0) return empty('bullion_warehouse_anomaly', 'bullionWarehouses');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (Math.abs(i.stockReconcilationVarianceKg ?? 0) >= 1) hits.push({ id: 'reconciliation_variance', label: `Variance ${i.stockReconcilationVarianceKg}kg`, weight: 0.4, evidence: i.warehouseId });
    if ((i.lastAuditDaysAgo ?? 0) >= 365) hits.push({ id: 'stale_audit', label: `Last audit ${i.lastAuditDaysAgo}d ago`, weight: 0.25, evidence: i.warehouseId });
  }
  return build('bullion_warehouse_anomaly', hits, items.length, 'LBMA Responsible Sourcing · UAE Cabinet Res 134/2025');
};

interface AssayCert { certId: string; declaredPurity?: number; verifiedPurity?: number; assayLabAccredited?: boolean; }
const assayCertApply: ModeApply = async (ctx) => {
  const items = typedEvidence<AssayCert>(ctx, 'assayCerts');
  if (items.length === 0) return empty('assay_certificate_inconsistency', 'assayCerts');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.declaredPurity !== undefined && i.verifiedPurity !== undefined && Math.abs(i.declaredPurity - i.verifiedPurity) > 0.01) {
      hits.push({ id: 'purity_mismatch', label: `Declared ${i.declaredPurity} vs verified ${i.verifiedPurity}`, weight: 0.4, evidence: i.certId });
    }
    if (i.assayLabAccredited === false) hits.push({ id: 'unaccredited_lab', label: 'Lab not accredited', weight: 0.25, evidence: i.certId });
  }
  return build('assay_certificate_inconsistency', hits, items.length, 'LBMA Good Delivery · DMCC standards');
};

interface CompanyReact { entityId: string; dormantYears?: number; recentReactivation?: boolean; postReactivationVolumeAed?: number; }
const dormantReactivationApply: ModeApply = async (ctx) => {
  const items = typedEvidence<CompanyReact>(ctx, 'companyReactivations');
  if (items.length === 0) return empty('dormant_company_reactivation', 'companyReactivations');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.dormantYears ?? 0) >= 2 && i.recentReactivation === true && (i.postReactivationVolumeAed ?? 0) >= 500_000) {
      hits.push({ id: 'dormant_then_active', label: `${i.dormantYears}y dormant → AED ${i.postReactivationVolumeAed}`, weight: 0.4, evidence: i.entityId });
    }
  }
  return build('dormant_company_reactivation', hits, items.length, 'FATF R.24 · UAE Cabinet Res 58/2020');
};

interface ResignationCluster { entityId: string; resignationsLast90d?: number; rolesAffected?: string[]; }
const directorResignClusterApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ResignationCluster>(ctx, 'resignationClusters');
  if (items.length === 0) return empty('director_resignation_cluster', 'resignationClusters');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.resignationsLast90d ?? 0) >= 3) hits.push({ id: 'mass_resignation', label: `${i.resignationsLast90d} resignations in 90d`, weight: 0.4, evidence: `${i.entityId}: ${(i.rolesAffected ?? []).slice(0, 3).join(', ')}` });
  }
  return build('director_resignation_cluster', hits, items.length, 'FATF R.24 · governance literature');
};

interface AgentConcentration { agentId: string; clientCount?: number; bouncedFilingsLast90d?: number; }
const registeredAgentApply: ModeApply = async (ctx) => {
  const items = typedEvidence<AgentConcentration>(ctx, 'agentConcentrations');
  if (items.length === 0) return empty('registered_agent_concentration', 'agentConcentrations');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.clientCount ?? 0) >= 50) hits.push({ id: 'mass_client', label: `Agent serves ${i.clientCount} clients`, weight: 0.3, evidence: i.agentId });
    if ((i.bouncedFilingsLast90d ?? 0) >= 5) hits.push({ id: 'filing_bounces', label: `${i.bouncedFilingsLast90d} bounced filings`, weight: 0.25, evidence: i.agentId });
  }
  return build('registered_agent_concentration', hits, items.length, 'FATF R.22-24 · UAE Cabinet Res 58/2020');
};

interface MassFiling { filingDate: string; filingsCount?: number; sameAgent?: boolean; }
const massFilingSameDayApply: ModeApply = async (ctx) => {
  const items = typedEvidence<MassFiling>(ctx, 'massFilings');
  if (items.length === 0) return empty('mass_filing_same_day', 'massFilings');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.filingsCount ?? 0) >= 20 && i.sameAgent === true) hits.push({ id: 'same_day_burst', label: `${i.filingsCount} same-day same-agent filings`, weight: 0.4, evidence: i.filingDate });
  }
  return build('mass_filing_same_day', hits, items.length, 'FATF R.24 · UAE registries');
};

export const SECURITIES_DPMS_OPS_BATCH_APPLIES: Record<string, ModeApply> = {
  insurance_premium_dump: insuranceDumpApply,
  life_policy_third_party_assignment: lifePolicyAssignApply,
  securities_swap_layering: securitiesSwapLayerApply,
  wash_trading_securities: washTradingSecuritiesApply,
  spoofing_layering: spoofingLayeringApply,
  pump_and_dump_indicator: pumpDumpApply,
  gold_smuggling_corridor: goldSmugglingApply,
  dpms_fictitious_supplier: fictitiousSupplierApply,
  precious_stones_provenance_gap: preciousStonesProvenanceApply,
  bullion_warehouse_anomaly: bullionWarehouseApply,
  assay_certificate_inconsistency: assayCertApply,
  dormant_company_reactivation: dormantReactivationApply,
  director_resignation_cluster: directorResignClusterApply,
  registered_agent_concentration: registeredAgentApply,
  mass_filing_same_day: massFilingSameDayApply,
};
