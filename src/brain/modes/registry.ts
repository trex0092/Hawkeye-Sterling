// Hawkeye Sterling — mode-implementation override registry.
//
// Any mode ID whose real implementation lives here wins over the stubApply()
// in reasoning-modes.ts. This is how Phase 7 stubs become real algorithms
// incrementally, without touching the 200-row registry file itself.
//
// To add a real implementation for an existing mode:
//   1. Write `export const fooApply: ModeApply = async (ctx) => { ... };`
//   2. Either import it here and add `foo: fooApply` to MODE_OVERRIDES,
//      or call `registerModeOverride('foo', fooApply)` at startup.

import type { BrainContext, Finding } from '../types.js';
import { META_MODE_APPLIES } from './meta.js';
import { LOGIC_MODE_APPLIES } from './logic.js';
import { FORENSIC_MODE_APPLIES } from './forensic.js';
import { STATISTICAL_MODE_APPLIES } from './statistical.js';
import { BEHAVIORAL_MODE_APPLIES } from './behavioral.js';
import { GOVERNANCE_MODE_APPLIES } from './governance.js';
import { DATA_QUALITY_MODE_APPLIES } from './data_quality.js';
import { COGNITIVE_MODE_APPLIES } from './cognitive.js';
import { NETWORK_MODE_APPLIES } from './network.js';
import { TYPOLOGY_MODE_APPLIES } from './typology.js';
import { COMPLIANCE_MODE_APPLIES } from './compliance.js';
import { UAE_ADVANCED_MODE_APPLIES } from './uae_advanced.js';
import { INTEGRITY_MODE_APPLIES } from './integrity.js';
import { COGNITIVE_GUARDS_MODE_APPLIES } from './cognitive_guards.js';
import { ANALYTICAL_METHODS_MODE_APPLIES } from './analytical_methods.js';
import { STRATEGIC_LEGAL_MODE_APPLIES } from './strategic_legal.js';
import { MARKET_GOVERNANCE_MODE_APPLIES } from './market_governance.js';
import { LOGIC_FORMAL_MODE_APPLIES } from './logic_formal.js';
import { REASONING_DECISION_MODE_APPLIES } from './reasoning_decision.js';
import { FORENSIC_STRATEGIC_MODE_APPLIES } from './forensic_strategic.js';
import { GOVERNANCE_CRYPTO_MODE_APPLIES } from './governance_crypto.js';

import { artProvenanceGapApply } from './wave3-art-provenance-gap.js';
import { bridgeCrossingTraceApply } from './wave3-bridge-crossing-trace.js';
import { dpmsStructuringApply } from './wave3-dpms-structuring.js';
import { familyOfficeTrustApply } from './wave3-family-office-trust.js';
import { hawalaIvtsApply } from './wave3-hawala-ivts.js';
import { mixerForensicsApply } from './wave3-mixer-forensics.js';
import { muleClusterApply } from './wave3-mule-cluster.js';
import { professionalEnablerApply } from './wave3-professional-enabler.js';
import { tbmlInvoiceApply } from './wave3-tbml-invoice.js';
import { utxoClusteringApply } from './wave3-utxo-clustering.js';
import { vesselAisGapApply } from './wave3-vessel-ais-gap.js';
import { cashCourierThresholdApply } from './wave3-cash-courier-threshold.js';
import { shellCompanyApply } from './wave3-shell-company.js';
import { pepProximityApply } from './wave3-pep-proximity.js';
import { dualUseRoutingApply } from './wave3-dual-use-routing.js';
import { wireStrippingApply } from './wave3-wire-stripping.js';
import { correspondentNestingApply } from './wave3-correspondent-nesting.js';
import { ftzLayeredOwnershipApply } from './wave3-ftz-layered-ownership.js';
import { npoHighRiskApply } from './wave3-npo-high-risk.js';
import { casinoChipDumpingApply } from './wave3-casino-chip-dumping.js';
import { cryptoChainHopApply } from './wave3-crypto-chain-hop.js';
import { nftWashTradingApply } from './wave3-nft-wash-trading.js';
import { realEstateUnderpricingApply } from './wave3-real-estate-underpricing.js';
import { legalPooledAccountApply } from './wave3-legal-pooled-account.js';
import { nonFaceToFaceKycApply } from './wave3-non-face-to-face-kyc.js';

export type ModeApply = (ctx: BrainContext) => Promise<Finding>;

const WAVE3_MODE_APPLIES: Record<string, ModeApply> = {
  art_auction_provenance_gap: artProvenanceGapApply,
  bridge_crossing_trace: bridgeCrossingTraceApply,
  dpms_cash_structuring_split: dpmsStructuringApply,
  family_office_trust_transparency: familyOfficeTrustApply,
  hawala_ivts_pattern: hawalaIvtsApply,
  mixer_forensics: mixerForensicsApply,
  mule_cluster_detection: muleClusterApply,
  professional_enabler_pattern: professionalEnablerApply,
  tbml_invoice_manipulation: tbmlInvoiceApply,
  utxo_clustering: utxoClusteringApply,
  vessel_ais_gap: vesselAisGapApply,
  cash_courier_threshold: cashCourierThresholdApply,
  shell_company_indicator: shellCompanyApply,
  pep_proximity_chain: pepProximityApply,
  dual_use_goods_routing: dualUseRoutingApply,
  wire_stripping_indicator: wireStrippingApply,
  correspondent_banking_nesting: correspondentNestingApply,
  ftz_layered_ownership: ftzLayeredOwnershipApply,
  npo_high_risk_outflow: npoHighRiskApply,
  casino_chip_dumping: casinoChipDumpingApply,
  crypto_chain_hop_layering: cryptoChainHopApply,
  nft_wash_trading: nftWashTradingApply,
  real_estate_underpricing: realEstateUnderpricingApply,
  legal_pooled_account_abuse: legalPooledAccountApply,
  non_face_to_face_kyc_anomaly: nonFaceToFaceKycApply,
};

// Spread order matters: later bundles override earlier for shared IDs.
// COGNITIVE_GUARDS_MODE_APPLIES is spread LAST so its PR #224 anti-bias /
// anti-hallucination implementations win over any earlier bundle if an ID
// collides (audit confirms no current collisions; spread order is defensive).
export const MODE_OVERRIDES: Record<string, ModeApply> = {
  ...META_MODE_APPLIES,
  ...LOGIC_MODE_APPLIES,
  ...FORENSIC_MODE_APPLIES,
  ...STATISTICAL_MODE_APPLIES,
  ...BEHAVIORAL_MODE_APPLIES,
  ...GOVERNANCE_MODE_APPLIES,
  ...DATA_QUALITY_MODE_APPLIES,
  ...COGNITIVE_MODE_APPLIES,
  ...NETWORK_MODE_APPLIES,
  ...TYPOLOGY_MODE_APPLIES,
  ...COMPLIANCE_MODE_APPLIES,
  ...UAE_ADVANCED_MODE_APPLIES,
  ...INTEGRITY_MODE_APPLIES,
  ...COGNITIVE_GUARDS_MODE_APPLIES,
  ...ANALYTICAL_METHODS_MODE_APPLIES,
  ...STRATEGIC_LEGAL_MODE_APPLIES,
  ...MARKET_GOVERNANCE_MODE_APPLIES,
  ...LOGIC_FORMAL_MODE_APPLIES,
  ...REASONING_DECISION_MODE_APPLIES,
  ...FORENSIC_STRATEGIC_MODE_APPLIES,
  ...GOVERNANCE_CRYPTO_MODE_APPLIES,
  ...WAVE3_MODE_APPLIES,
};

/** Register (or replace) a real apply() for a mode at runtime. */
export function registerModeOverride(id: string, apply: ModeApply): void {
  MODE_OVERRIDES[id] = apply;
}

/** List IDs that have real implementations (i.e. are NOT stubs any more). */
export function listImplementedModeIds(): string[] {
  return Object.keys(MODE_OVERRIDES).sort();
}

/** Count real implementations vs a total mode count. Used by auditBrain. */
export function implementationCoverage(totalModes: number): {
  implemented: number;
  total: number;
  percent: number;
} {
  const implemented = Object.keys(MODE_OVERRIDES).length;
  return {
    implemented,
    total: totalModes,
    percent: totalModes === 0 ? 0 : Math.round((implemented / totalModes) * 100),
  };
}
