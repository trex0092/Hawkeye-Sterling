// Hawkeye Sterling — wave-3 PEP / corruption / predicate batch (14 modes).
// Anchors: FATF R.12, R.20-21 · UNCAC · UAE FDL 10/2025 Art.16 · UNTOC.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
type ModeApply = (ctx: BrainContext) => Promise<Finding>;
const FAC: FacultyId[] = ['data_analysis', 'geopolitical_awareness'];
const CAT: ReasoningCategory = 'predicate_crime';
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

interface DomesticPep { pepId: string; concentratedAccounts?: number; familyMemberCount?: number; }
const domesticPepApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DomesticPep>(ctx, 'domesticPeps');
  if (items.length === 0) return empty('domestic_pep_concentration', 'domesticPeps', 'regulatory_aml');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.concentratedAccounts ?? 0) >= 5) hits.push({ id: 'account_cluster', label: `${i.concentratedAccounts} accounts`, weight: 0.35, evidence: i.pepId });
    if ((i.familyMemberCount ?? 0) >= 5) hits.push({ id: 'family_cluster', label: `${i.familyMemberCount} associated family`, weight: 0.25, evidence: i.pepId });
  }
  return build('domestic_pep_concentration', hits, items.length, 'FATF R.12 · UAE FDL 10/2025 Art.16', 'regulatory_aml');
};

interface SoeExec { execId: string; soeName?: string; payoutAed?: number; relatedToTender?: boolean; }
const soePayoutApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SoeExec>(ctx, 'soeExecs');
  if (items.length === 0) return empty('soe_executive_payout', 'soeExecs', 'regulatory_aml');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.payoutAed ?? 0) >= 500_000) hits.push({ id: 'large_soe_payout', label: `Payout AED ${i.payoutAed} from ${i.soeName ?? '?'}`, weight: 0.35, evidence: i.execId });
    if (i.relatedToTender === true) hits.push({ id: 'tender_linked', label: 'Payout linked to tender', weight: 0.4, evidence: i.execId });
  }
  return build('soe_executive_payout', hits, items.length, 'UNCAC · OECD Anti-Bribery · FATF R.12', 'regulatory_aml');
};

interface ElectoralWindow { jurisdictionIso2: string; daysFromElection?: number; flowAed?: number; recipientPepLinked?: boolean; }
const electoralWindowApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ElectoralWindow>(ctx, 'electoralWindows');
  if (items.length === 0) return empty('electoral_window_anomaly', 'electoralWindows', 'regulatory_aml');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (Math.abs(i.daysFromElection ?? 999) <= 60 && i.recipientPepLinked === true) hits.push({ id: 'election_window_pep_flow', label: `±60d of election, PEP-linked`, weight: 0.4, evidence: `${i.jurisdictionIso2}: AED ${i.flowAed}` });
  }
  return build('electoral_window_anomaly', hits, items.length, 'OECD Anti-Bribery · UNCAC', 'regulatory_aml');
};

interface JudicialPayment { paymentId: string; daysFromRulingFavoring?: number; recipientLinkedToBench?: boolean; }
const judicialCorrelationApply: ModeApply = async (ctx) => {
  const items = typedEvidence<JudicialPayment>(ctx, 'judicialPayments');
  if (items.length === 0) return empty('judicial_payment_correlation', 'judicialPayments', 'regulatory_aml');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (Math.abs(i.daysFromRulingFavoring ?? 999) <= 30 && i.recipientLinkedToBench === true) hits.push({ id: 'ruling_proximity', label: `Payment ±30d of favorable ruling`, weight: 0.5, evidence: i.paymentId });
  }
  return build('judicial_payment_correlation', hits, items.length, 'UNCAC Art.11 · OECD Anti-Bribery', 'regulatory_aml');
};

interface ProcurementRecord { tenderId: string; declaredCompetitiveBids?: number; winnerNewlyIncorporated?: boolean; winnerLinkedToOfficial?: boolean; }
const procurementKickbackApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ProcurementRecord>(ctx, 'procurementRecords');
  if (items.length === 0) return empty('procurement_kickback_pattern', 'procurementRecords', 'regulatory_aml');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.declaredCompetitiveBids ?? 99) <= 1) hits.push({ id: 'no_competition', label: `${i.declaredCompetitiveBids} competitive bids`, weight: 0.3, evidence: i.tenderId });
    if (i.winnerNewlyIncorporated === true) hits.push({ id: 'fresh_winner', label: 'Winner newly incorporated', weight: 0.3, evidence: i.tenderId });
    if (i.winnerLinkedToOfficial === true) hits.push({ id: 'official_link', label: 'Winner linked to awarding official', weight: 0.4, evidence: i.tenderId });
  }
  return build('procurement_kickback_pattern', hits, items.length, 'UNCAC · OECD · World Bank Procurement Guidelines', 'regulatory_aml');
};

interface ExtractivePayment { paymentId: string; sectorOilGasMining?: boolean; eitiCompliant?: boolean; opaqueIntermediary?: boolean; }
const extractiveOpacityApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ExtractivePayment>(ctx, 'extractivePayments');
  if (items.length === 0) return empty('extractive_payment_opacity', 'extractivePayments', 'regulatory_aml');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.sectorOilGasMining === true && i.eitiCompliant === false) hits.push({ id: 'non_eiti_extractive', label: 'Non-EITI-compliant extractive flow', weight: 0.35, evidence: i.paymentId });
    if (i.opaqueIntermediary === true) hits.push({ id: 'opaque_intermediary', label: 'Opaque intermediary', weight: 0.3, evidence: i.paymentId });
  }
  return build('extractive_payment_opacity', hits, items.length, 'EITI Standard · UNCAC · OECD', 'regulatory_aml');
};

interface TraffickingSignal { caseId: string; recipientLocationsHighRisk?: boolean; massiveSmallTransfers?: boolean; pseudonymPattern?: boolean; }
const humanTraffickingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<TraffickingSignal>(ctx, 'traffickingSignals');
  if (items.length === 0) return empty('human_trafficking_pattern', 'traffickingSignals');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.recipientLocationsHighRisk === true) hits.push({ id: 'high_risk_corridor', label: 'High-risk trafficking corridor', weight: 0.4, evidence: i.caseId });
    if (i.massiveSmallTransfers === true) hits.push({ id: 'micro_transfers', label: 'Many small transfers pattern', weight: 0.3, evidence: i.caseId });
    if (i.pseudonymPattern === true) hits.push({ id: 'pseudonym_recipients', label: 'Pseudonym recipient pattern', weight: 0.25, evidence: i.caseId });
  }
  return build('human_trafficking_pattern', hits, items.length, 'FATF HT Trafficking 2018 · UNTOC Trafficking Protocol');
};

interface WildlifeFlow { flowId: string; cargoSpeciesCitesListed?: 'I' | 'II' | 'III' | 'none'; corridorAfricaAsia?: boolean; }
const wildlifeTraffickingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<WildlifeFlow>(ctx, 'wildlifeFlows');
  if (items.length === 0) return empty('wildlife_trafficking_indicator', 'wildlifeFlows');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.cargoSpeciesCitesListed === 'I') hits.push({ id: 'cites_appendix_i', label: 'CITES Appendix I species', weight: 0.5, evidence: i.flowId });
    else if (i.cargoSpeciesCitesListed === 'II') hits.push({ id: 'cites_appendix_ii', label: 'CITES Appendix II species', weight: 0.3, evidence: i.flowId });
    if (i.corridorAfricaAsia === true) hits.push({ id: 'african_asian_corridor', label: 'High-risk wildlife corridor', weight: 0.25, evidence: i.flowId });
  }
  return build('wildlife_trafficking_indicator', hits, items.length, 'FATF Wildlife 2020 · CITES · UNTOC');
};

interface DrugProceeds { caseId: string; cashIntenseDeposits?: boolean; geoNexusToProductionRegion?: boolean; }
const drugProceedsApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DrugProceeds>(ctx, 'drugProceeds');
  if (items.length === 0) return empty('drug_proceeds_indicator', 'drugProceeds');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.cashIntenseDeposits === true) hits.push({ id: 'cash_intense', label: 'Cash-intense deposits', weight: 0.35, evidence: i.caseId });
    if (i.geoNexusToProductionRegion === true) hits.push({ id: 'production_region_nexus', label: 'Production-region nexus', weight: 0.35, evidence: i.caseId });
  }
  return build('drug_proceeds_indicator', hits, items.length, 'UN 1988 Convention · FATF Drug Trafficking 2018');
};

interface LoggingPayment { flowId: string; recipientCountryHighDeforestation?: boolean; flegtCertified?: boolean; }
const illegalLoggingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<LoggingPayment>(ctx, 'loggingPayments');
  if (items.length === 0) return empty('illegal_logging_payment', 'loggingPayments');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.recipientCountryHighDeforestation === true && i.flegtCertified === false) hits.push({ id: 'no_flegt_high_risk', label: 'High deforestation, no FLEGT cert', weight: 0.4, evidence: i.flowId });
  }
  return build('illegal_logging_payment', hits, items.length, 'FATF Environmental Crimes 2021 · EU FLEGT');
};

interface OffshoreTax { entityId: string; declaredTurnover?: number; offshoreSubsidiaryShare?: number; lowTaxJurDeclared?: boolean; }
const taxEvasionApply: ModeApply = async (ctx) => {
  const items = typedEvidence<OffshoreTax>(ctx, 'offshoreTaxRecords');
  if (items.length === 0) return empty('tax_evasion_offshore', 'offshoreTaxRecords');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.offshoreSubsidiaryShare ?? 0) >= 0.7) hits.push({ id: 'high_offshore_share', label: `${((i.offshoreSubsidiaryShare ?? 0) * 100).toFixed(0)}% offshore`, weight: 0.35, evidence: i.entityId });
    if (i.lowTaxJurDeclared === true) hits.push({ id: 'low_tax_jur', label: 'Low-tax jurisdiction declared', weight: 0.25, evidence: i.entityId });
  }
  return build('tax_evasion_offshore', hits, items.length, 'FATF R.3 (predicate) · OECD CRS · UAE Federal Tax Law');
};

interface FraudSignal { caseId: string; advanceFeePattern?: boolean; impersonationPattern?: boolean; pseudonymCounterparty?: boolean; }
const fraud419Apply: ModeApply = async (ctx) => {
  const items = typedEvidence<FraudSignal>(ctx, 'fraudSignals');
  if (items.length === 0) return empty('fraud_419_pattern', 'fraudSignals');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.advanceFeePattern === true) hits.push({ id: 'advance_fee', label: 'Advance-fee pattern', weight: 0.35, evidence: i.caseId });
    if (i.impersonationPattern === true) hits.push({ id: 'impersonation', label: 'Impersonation pattern', weight: 0.3, evidence: i.caseId });
  }
  return build('fraud_419_pattern', hits, items.length, 'FATF R.3 · INTERPOL Project Falcon');
};

interface CounterfeitFlow { shipmentId: string; brandFlagged?: boolean; routeViaKnownHub?: boolean; }
const counterfeitSupplyApply: ModeApply = async (ctx) => {
  const items = typedEvidence<CounterfeitFlow>(ctx, 'counterfeitFlows');
  if (items.length === 0) return empty('counterfeit_supply_chain', 'counterfeitFlows');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.brandFlagged === true) hits.push({ id: 'brand_flag', label: 'Brand-protection flag', weight: 0.35, evidence: i.shipmentId });
    if (i.routeViaKnownHub === true) hits.push({ id: 'known_hub', label: 'Route via known counterfeit hub', weight: 0.3, evidence: i.shipmentId });
  }
  return build('counterfeit_supply_chain', hits, items.length, 'FATF IPR 2007 · WCO');
};

interface SmugglingFlow { eventId: string; uaeBorderPort?: string; declarationDiscrepancy?: boolean; concealmentMethodFlagged?: boolean; }
const smugglingUaeApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SmugglingFlow>(ctx, 'smugglingFlows');
  if (items.length === 0) return empty('smuggling_corridor_uae', 'smugglingFlows');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if (i.declarationDiscrepancy === true) hits.push({ id: 'declaration_discrepancy', label: 'Declaration vs cargo discrepancy', weight: 0.35, evidence: `${i.eventId} (${i.uaeBorderPort ?? '?'})` });
    if (i.concealmentMethodFlagged === true) hits.push({ id: 'concealment_method', label: 'Known concealment method', weight: 0.4, evidence: i.eventId });
  }
  return build('smuggling_corridor_uae', hits, items.length, 'UAE Customs · WCO · FATF R.3');
};

export const PEP_PREDICATE_BATCH_APPLIES: Record<string, ModeApply> = {
  domestic_pep_concentration: domesticPepApply,
  soe_executive_payout: soePayoutApply,
  electoral_window_anomaly: electoralWindowApply,
  judicial_payment_correlation: judicialCorrelationApply,
  procurement_kickback_pattern: procurementKickbackApply,
  extractive_payment_opacity: extractiveOpacityApply,
  human_trafficking_pattern: humanTraffickingApply,
  wildlife_trafficking_indicator: wildlifeTraffickingApply,
  drug_proceeds_indicator: drugProceedsApply,
  illegal_logging_payment: illegalLoggingApply,
  tax_evasion_offshore: taxEvasionApply,
  fraud_419_pattern: fraud419Apply,
  counterfeit_supply_chain: counterfeitSupplyApply,
  smuggling_corridor_uae: smugglingUaeApply,
};
