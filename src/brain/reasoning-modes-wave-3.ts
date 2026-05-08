// Hawkeye Sterling — reasoning modes, Wave 3.
//
// HONESTY NOTE (2026-05-07):
// This file used to export `REASONING_MODE_IDS_WAVE_3` as if it were a list
// of registered reasoning modes. It isn't, and it never was. The constant is
// not consumed anywhere in the verdict path — `src/brain/modes/registry.ts`
// resolves apply() implementations from the per-domain *_MODE_APPLIES bundles
// (forensic, behavioral, compliance, …) and the explicit `wave3-*.ts` modules
// it imports directly. Listing an ID here registers nothing.
//
// As of this audit the wave-3 *implemented* modes (the ones that actually
// produce findings, not stubApply() placeholders) live in:
//   src/brain/modes/wave3-art-provenance-gap.ts
//   src/brain/modes/wave3-bridge-crossing-trace.ts
//   src/brain/modes/wave3-cash-courier-threshold.ts
//   src/brain/modes/wave3-casino-chip-dumping.ts
//   src/brain/modes/wave3-correspondent-nesting.ts
//   src/brain/modes/wave3-crypto-chain-hop.ts
//   src/brain/modes/wave3-dpms-structuring.ts
//   src/brain/modes/wave3-dual-use-routing.ts
//   src/brain/modes/wave3-family-office-trust.ts
//   src/brain/modes/wave3-ftz-layered-ownership.ts
//   src/brain/modes/wave3-hawala-ivts.ts
//   src/brain/modes/wave3-legal-pooled-account.ts
//   src/brain/modes/wave3-mixer-forensics.ts
//   src/brain/modes/wave3-mule-cluster.ts
//   src/brain/modes/wave3-nested-designation-match.ts
//   src/brain/modes/wave3-nft-wash-trading.ts
//   src/brain/modes/wave3-non-face-to-face-kyc.ts
//   src/brain/modes/wave3-npo-high-risk.ts
//   src/brain/modes/wave3-pep-proximity.ts
//   src/brain/modes/wave3-professional-enabler.ts
//   src/brain/modes/wave3-real-estate-underpricing.ts
//   src/brain/modes/wave3-shell-company.ts
//   src/brain/modes/wave3-tbml-invoice.ts
//   src/brain/modes/wave3-utxo-clustering.ts
//   src/brain/modes/wave3-vessel-ais-gap.ts
//   src/brain/modes/wave3-wire-stripping.ts
// plus the batch bundles (SANCTIONS_BATCH_APPLIES, TBML_BATCH_APPLIES,
// CRYPTO_BATCH_APPLIES, IDENTITY_BATCH_APPLIES, BEHAVIORAL_BATCH_APPLIES,
// PEP_PREDICATE_BATCH_APPLIES, SECURITIES_DPMS_OPS_BATCH_APPLIES) — see
// `src/brain/modes/registry.ts` for the canonical wiring.
//
// The list below is a *roadmap* of mode IDs we want to support. It is NOT
// the registered set. To stop misleading auditBrain output and downstream
// callers, the export is renamed to `WAVE_3_ROADMAP_IDS` and explicitly
// typed as a roadmap. If you need to know what modes are actually live,
// call `listImplementedModeIds()` from `modes/registry.ts`.

/**
 * Wave-3 roadmap mode IDs — NOT registered, NOT executed.
 *
 * To check which IDs are actually wired into the verdict path, use
 * `listImplementedModeIds()` from `src/brain/modes/registry.ts`.
 *
 * To register a roadmap ID for real, write its apply() in a new
 * `wave3-*.ts` module and add it to `WAVE3_MODE_APPLIES` in registry.ts.
 */
export const WAVE_3_ROADMAP_IDS = [
  // On-chain forensics
  'utxo_clustering', 'address_reuse_analysis', 'heuristic_common_input',
  'heuristic_change_address', 'peel_chain', 'coinjoin_detection',
  'taint_half_life', 'dust_attack_detection', 'smart_contract_static_analysis',
  'token_approval_audit', 'bridge_crossing_trace', 'layer2_rollup_trace',
  'sanction_wallet_cluster', 'ransomware_payment_trace',
  'darknet_market_flow', 'mixer_forensics', 'mev_sandwich',
  'flash_loan_exploit', 'oracle_manipulation', 'rug_pull_detection',

  // Trade finance
  'lc_confirmation_gap', 'sblc_draw_chain_trace', 'bill_of_lading_crosscheck',
  'vessel_ais_gap_analysis', 'port_state_control', 'carrier_risk_scoring',
  'dual_hatting_banker', 'commodity_price_anomaly', 'over_shipment_check',
  'under_shipment_check', 'phantom_buyer', 'phantom_seller',
  'incoterms_misuse', 'invoice_splitting', 'shell_freight_forwarder',
  'bill_discounting_abuse', 'factoring_arbitrage', 'trade_round_tripping',
  'commodity_swap_exposure',

  // Real estate
  're_cash_purchase_check', 're_shell_owner_check', 're_rapid_flip_detection',
  're_valuation_anomaly', 're_title_transfer_chain', 're_tenant_surrogate',
  're_golden_visa_investment', 're_bulk_purchase_linked_entity',
  're_off_plan_advance_check', 're_mortgage_prepayment_anomaly',

  // Insurance
  'ins_early_surrender_cash', 'ins_premium_overfund', 'ins_policy_assignment',
  'ins_beneficiary_rotation', 'ins_cross_border_nominee',
  'ins_single_premium_scrutiny',

  // NPO / charity
  'npo_grantee_diligence', 'npo_beneficiary_trace', 'npo_conflict_zone_flow',
  'npo_programme_vs_cash_ratio',

  // Shipping / maritime
  'stss_ais_dark', 'flag_of_convenience', 'vessel_beneficial_owner',
  'sanctions_port_call', 'cargo_manifest_cross_check', 'broker_chain_depth',

  // ESG / supply-chain
  'modern_slavery_indicator', 'child_labour_indicator',
  'supply_chain_transparency', 'conflict_mineral_documentation',
  'sustainability_claim_audit', 'scope3_emissions_reasonableness',

  // Market abuse / insider
  'layering_detection', 'quote_stuffing', 'marking_the_close',
  'wash_sale_detection', 'matched_trade_detection', 'cross_exchange_arbitrage_flag',

  // Cyber / BEC / fraud
  'email_spoof_forensic', 'typosquat_domain_detection',
  'invoice_redirection_trace', 'ceo_impersonation_signal',
  'sim_swap_indicator', 'account_takeover_sequence',
  'credential_stuffing_pattern',

  // Precious metals / bullion
  'doré_origin_crosscheck', 'recycled_input_audit',
  'refined_output_reconciliation', 'assay_certificate_audit',
  'chain_of_custody_break', 'lbma_five_step_gate',
  'oecd_annex_ii_discipline',

  // Free zones
  'free_zone_entity_check', 'free_zone_ubo_walk',
  'free_zone_nominee_director_check', 'free_zone_restriction_compliance',

  // Gambling / gaming
  'gambling_proceeds_layering', 'casino_junket_flow',
  'online_gambling_deposit_velocity',

  // Art / luxury
  'art_provenance_chain', 'art_auction_ring_detection',
  'luxury_asset_purchase_structure', 'yacht_jet_registration_opacity',

  // Family offices
  'fo_single_family_oversight', 'fo_ptc_structure_check',
  'fo_source_of_wealth_narrative', 'fo_trust_chain_audit',

  // Reporting / governance extras
  'mlro_escalation_quality', 'four_eyes_coverage_drift',
  'control_testing_cadence', 'policy_vs_procedure_alignment',
  'incident_lessons_learned', 'thematic_review_finding',
  'horizon_scanning_regulatory',

  // Data quality / engineering
  'schema_drift_detection', 'null_rate_audit',
  'cross_system_reconciliation', 'backfill_integrity_check',
  'freshness_sla_breach', 'lineage_break_detection',
] as const;

export type Wave3RoadmapId = typeof WAVE_3_ROADMAP_IDS[number];

/**
 * @deprecated Misleading name — these IDs were never registered as reasoning
 * modes. Use `WAVE_3_ROADMAP_IDS` to read the roadmap, or
 * `listImplementedModeIds()` (from `modes/registry.ts`) to read what's actually
 * wired into the verdict path. This alias is kept for backwards compatibility
 * with older imports and will be removed once external callers migrate.
 */
export const REASONING_MODE_IDS_WAVE_3 = WAVE_3_ROADMAP_IDS;

/** @deprecated Use `Wave3RoadmapId` instead. */
export type ReasoningModeIdWave3 = Wave3RoadmapId;
