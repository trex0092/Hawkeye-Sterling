// Hawkeye Sterling — wave-3 sanctions-evasion batch (9 modes).
// Anchors: OFAC, UNSCR 1267 / 1540 / 2231, UAE FDL 10/2025 Art.20-22.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
type ModeApply = (ctx: BrainContext) => Promise<Finding>;
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
const FAC: FacultyId[] = ['data_analysis', 'geopolitical_awareness'];
function empty(modeId: string, key: string, cat: ReasoningCategory): Finding {
  return { modeId, category: cat, faculties: FAC, score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict, rationale: `No ${key} evidence supplied.`, evidence: [], producedAt: Date.now() };
}
function build(modeId: string, cat: ReasoningCategory, hits: SignalHit[], n: number, anchors: string): Finding {
  const raw = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(raw > 0.7 ? 0.7 + (raw - 0.7) * 0.3 : raw);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return { modeId, category: cat, faculties: FAC, score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict, rationale: `${hits.length} signal(s) over ${n} item(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: ${anchors}.`, evidence: hits.slice(0, 8).map((h) => h.evidence), producedAt: Date.now() };
}

interface ChemicalShipment { shipmentId: string; precursorListed?: 'AG' | 'CWC' | 'none'; endUserCountryIso2?: string; endUserVerified?: boolean; }
const dualUseChemicalRoutingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ChemicalShipment>(ctx, 'chemicalShipments');
  if (items.length === 0) return empty('dual_use_chemical_routing', 'chemicalShipments', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.precursorListed === 'CWC') hits.push({ id: 'cwc_listed', label: 'CWC schedule precursor', weight: 0.45, evidence: i.shipmentId });
    else if (i.precursorListed === 'AG') hits.push({ id: 'ag_listed', label: 'Australia Group listed', weight: 0.3, evidence: i.shipmentId });
    if (i.endUserVerified === false) hits.push({ id: 'unverified_end_user', label: 'No end-user verification', weight: 0.3, evidence: `${i.shipmentId} → ${i.endUserCountryIso2 ?? '?'}` });
  }
  return build('dual_use_chemical_routing', 'proliferation', hits, items.length, 'CWC · Australia Group · UNSCR 1540');
};

interface ProliferationFlow { flowId: string; entityListed?: boolean; programmeNexus?: 'nuclear' | 'missile' | 'chemical' | 'biological'; financingType?: 'direct' | 'trade' | 'shipping'; }
const proliferationFinanceApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ProliferationFlow>(ctx, 'proliferationFlows');
  if (items.length === 0) return empty('proliferation_finance_unscr1540', 'proliferationFlows', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.entityListed === true) hits.push({ id: 'listed_entity', label: 'Listed proliferation entity', weight: 0.45, evidence: i.flowId });
    if (i.programmeNexus === 'nuclear' || i.programmeNexus === 'missile') hits.push({ id: 'wmd_nexus', label: `${i.programmeNexus} nexus`, weight: 0.4, evidence: i.flowId });
    if (i.financingType === 'shipping') hits.push({ id: 'shipping_finance', label: 'Shipping finance to listed', weight: 0.25, evidence: i.flowId });
  }
  return build('proliferation_finance_unscr1540', 'proliferation', hits, items.length, 'UNSCR 1540 · UNSCR 1718 · UNSCR 2231');
};

interface RansomEvent { eventId: string; cryptoAddressFlagged?: boolean; ofacRansomwareList?: boolean; demandedAed?: number; paymentMade?: boolean; }
const ransomwarePaymentApply: ModeApply = async (ctx) => {
  const items = typedEvidence<RansomEvent>(ctx, 'ransomEvents');
  if (items.length === 0) return empty('ransomware_payment_indicator', 'ransomEvents', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.ofacRansomwareList === true) hits.push({ id: 'ofac_ransomware_list', label: 'OFAC-listed ransomware actor', weight: 0.5, evidence: i.eventId });
    if (i.cryptoAddressFlagged === true) hits.push({ id: 'flagged_addr', label: 'Flagged crypto address', weight: 0.3, evidence: i.eventId });
    if (i.paymentMade === true) hits.push({ id: 'payment_made', label: 'Ransom payment executed', weight: 0.4, evidence: i.eventId });
  }
  return build('ransomware_payment_indicator', 'proliferation', hits, items.length, 'OFAC Ransomware Advisory 2021 · UAE Cabinet Res 41/2022');
};

interface StsTransfer { transferId: string; vesselA: string; vesselB: string; aisGapMinutes?: number; cargoType?: string; locationLat?: number; locationLon?: number; }
const iranOilStsApply: ModeApply = async (ctx) => {
  const items = typedEvidence<StsTransfer>(ctx, 'stsTransfers');
  if (items.length === 0) return empty('iran_oil_sts_transfer', 'stsTransfers', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.aisGapMinutes ?? 0) >= 60) hits.push({ id: 'ais_gap_during_sts', label: `${i.aisGapMinutes}min AIS gap during STS`, weight: 0.4, evidence: `${i.vesselA} ↔ ${i.vesselB}` });
    if ((i.cargoType ?? '').toLowerCase().includes('crude')) hits.push({ id: 'crude_cargo', label: 'Crude oil cargo', weight: 0.3, evidence: i.transferId });
    const lat = i.locationLat ?? 0, lon = i.locationLon ?? 0;
    if (lat >= 24 && lat <= 30 && lon >= 50 && lon <= 60) hits.push({ id: 'gulf_sts_zone', label: 'Persian Gulf STS zone', weight: 0.25, evidence: `${lat.toFixed(1)},${lon.toFixed(1)}` });
  }
  return build('iran_oil_sts_transfer', 'proliferation', hits, items.length, 'OFAC Iran sanctions · UNSCR 2231');
};

interface OilCargo { cargoId: string; gradeApi?: number; declaredOriginIso2?: string; saleUsdPerBarrel?: number; capCeilingUsd?: number; certificateOfOrigin?: boolean; }
const russiaOilCapApply: ModeApply = async (ctx) => {
  const items = typedEvidence<OilCargo>(ctx, 'oilCargo');
  if (items.length === 0) return empty('russia_oil_price_cap_evasion', 'oilCargo', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.declaredOriginIso2 === 'RU' && (i.saleUsdPerBarrel ?? 0) > (i.capCeilingUsd ?? 60)) {
      hits.push({ id: 'above_g7_cap', label: `Sold $${i.saleUsdPerBarrel}/bbl > cap $${i.capCeilingUsd ?? 60}`, weight: 0.5, evidence: i.cargoId });
    }
    if (i.certificateOfOrigin === false && i.declaredOriginIso2 === 'RU') {
      hits.push({ id: 'no_origin_cert', label: 'No origin attestation', weight: 0.3, evidence: i.cargoId });
    }
  }
  return build('russia_oil_price_cap_evasion', 'proliferation', hits, items.length, 'G7 Price Cap Coalition · OFSI · OFAC Determination 2022-12-05');
};

interface DprkPaymentRecord { paymentId: string; recipientFlaggedAsDprkItWorker?: boolean; freelancerPlatformOrigin?: string; cryptoSettled?: boolean; }
const dprkItWorkerApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DprkPaymentRecord>(ctx, 'dprkPayments');
  if (items.length === 0) return empty('dprk_it_worker_payment', 'dprkPayments', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.recipientFlaggedAsDprkItWorker === true) hits.push({ id: 'flagged_dprk_worker', label: 'Recipient flagged as DPRK IT worker', weight: 0.5, evidence: i.paymentId });
    if (i.cryptoSettled === true && i.recipientFlaggedAsDprkItWorker === true) hits.push({ id: 'crypto_settle_dprk', label: 'Crypto-settled to DPRK worker', weight: 0.3, evidence: i.paymentId });
  }
  return build('dprk_it_worker_payment', 'proliferation', hits, items.length, 'OFAC/FBI DPRK IT Worker Advisory 2022');
};

interface VesselCallsign { vesselImo: string; callsignChangesLast90d?: number; flagChangesLast365d?: number; aisOffPctLast30d?: number; }
const vesselCallsignApply: ModeApply = async (ctx) => {
  const items = typedEvidence<VesselCallsign>(ctx, 'vesselCallsigns');
  if (items.length === 0) return empty('vessel_callsign_manipulation', 'vesselCallsigns', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.callsignChangesLast90d ?? 0) >= 2) hits.push({ id: 'callsign_churn', label: `${i.callsignChangesLast90d} callsign changes (90d)`, weight: 0.4, evidence: i.vesselImo });
    if ((i.flagChangesLast365d ?? 0) >= 2) hits.push({ id: 'flag_hopping', label: `${i.flagChangesLast365d} flag changes (1yr)`, weight: 0.3, evidence: i.vesselImo });
    if ((i.aisOffPctLast30d ?? 0) >= 0.4) hits.push({ id: 'persistent_ais_off', label: `AIS off ${(i.aisOffPctLast30d ?? 0) * 100}% of last 30d`, weight: 0.35, evidence: i.vesselImo });
  }
  return build('vessel_callsign_manipulation', 'proliferation', hits, items.length, 'IMO Resolution A.1106(29) · OFAC Maritime Advisory 2020');
};

interface JurisdictionLayer { entityId: string; jurisdictionIso2?: string; sanctionedSurchargeFlag?: boolean; layerDepth?: number; }
const sanctionedJurisdictionApply: ModeApply = async (ctx) => {
  const items = typedEvidence<JurisdictionLayer>(ctx, 'jurisdictionLayers');
  if (items.length === 0) return empty('sanctioned_jurisdiction_layering', 'jurisdictionLayers', 'proliferation');
  const sanctioned = new Set(['IR', 'KP', 'SY', 'CU', 'RU', 'BY']);
  const hits: SignalHit[] = [];
  const sanctionedLayers = items.filter((i) => i.jurisdictionIso2 && sanctioned.has(i.jurisdictionIso2.toUpperCase()));
  if (sanctionedLayers.length >= 1) hits.push({ id: 'sanctioned_layer', label: `${sanctionedLayers.length} layer(s) in sanctioned jurisdiction`, weight: 0.45, evidence: sanctionedLayers.slice(0, 4).map((l) => `${l.entityId} (${l.jurisdictionIso2})`).join('; ') });
  if (items.some((i) => i.sanctionedSurchargeFlag === true)) hits.push({ id: 'surcharge_flag', label: 'Sanctioned surcharge flag set', weight: 0.3, evidence: 'flagged' });
  return build('sanctioned_jurisdiction_layering', 'proliferation', hits, items.length, 'OFAC · OFSI · UNSCR 1267 · UAE FDL 10/2025 Art.20');
};

interface FrontingProfile { entityId: string; isNewlyIncorporated?: boolean; sharesIndustryWithDesignated?: boolean; sharesAddressWithDesignated?: boolean; sharesDirectorsWithDesignated?: boolean; }
const frontingCompanyApply: ModeApply = async (ctx) => {
  const items = typedEvidence<FrontingProfile>(ctx, 'frontingProfiles');
  if (items.length === 0) return empty('fronting_company_indicator', 'frontingProfiles', 'proliferation');
  const hits: SignalHit[] = [];
  for (const i of items) {
    const flags: string[] = [];
    if (i.sharesAddressWithDesignated) flags.push('shared_address');
    if (i.sharesDirectorsWithDesignated) flags.push('shared_directors');
    if (i.sharesIndustryWithDesignated) flags.push('shared_industry');
    if (i.isNewlyIncorporated) flags.push('newly_incorporated');
    if (flags.length >= 2) hits.push({ id: 'fronting_pattern', label: `${i.entityId}: ${flags.join(', ')}`, weight: Math.min(0.45, 0.15 + flags.length * 0.08), evidence: i.entityId });
  }
  return build('fronting_company_indicator', 'proliferation', hits, items.length, 'FATF Best Practices on Asset Freezing · UAE FDL 10/2025 Art.20');
};

export const SANCTIONS_BATCH_APPLIES: Record<string, ModeApply> = {
  dual_use_chemical_routing: dualUseChemicalRoutingApply,
  proliferation_finance_unscr1540: proliferationFinanceApply,
  ransomware_payment_indicator: ransomwarePaymentApply,
  iran_oil_sts_transfer: iranOilStsApply,
  russia_oil_price_cap_evasion: russiaOilCapApply,
  dprk_it_worker_payment: dprkItWorkerApply,
  vessel_callsign_manipulation: vesselCallsignApply,
  sanctioned_jurisdiction_layering: sanctionedJurisdictionApply,
  fronting_company_indicator: frontingCompanyApply,
};
