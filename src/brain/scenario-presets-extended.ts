// Hawkeye Sterling — extended scenario presets.
// 80+ additional scenarios layered on top of the Wave 1/2 scenario registry.
// Each is an ID + wave marker; narrative + expected reasoning modes live in
// Phase 7 scenario files.

export type ScenarioWave = 1 | 2 | 3;

export interface ScenarioPresetExt {
  id: string;
  wave: ScenarioWave;
  sector: string;
}

export const SCENARIO_PRESETS_WAVE_3 = [
  // DPMS
  'dpms_retail_cash_just_under_threshold',
  'dpms_retail_expatriate_remittance_linked',
  'dpms_refiner_asm_cahra_doré',
  'dpms_refiner_recycled_roundtrip',
  'dpms_wholesale_loco_split_via_fz',
  // VASP / crypto
  'vasp_onboard_from_sanction_hop',
  'vasp_travel_rule_missing_originator',
  'vasp_mixer_inbound_structured',
  'vasp_bridge_offramp_stablecoin',
  'vasp_nft_wash_circular',
  'vasp_flash_loan_exploit_proceeds',
  // TBML / trade finance
  'tf_lc_material_discrep_waived',
  'tf_phantom_buyer_no_registry',
  'tf_route_deviation_aishgap',
  'tf_unit_price_outlier_hs_code',
  'tf_third_party_payment_under_lc',
  'tf_sblc_draw_chain_ring',
  // Real estate
  're_offplan_overpay_refund_third_party',
  're_cash_villa_shell_owner',
  're_rapid_flip_related_party',
  're_golden_visa_layered_funds',
  // Insurance
  'ins_single_premium_overfund_refund',
  'ins_cooling_off_surrender_cash',
  'ins_beneficiary_switch_before_claim',
  // NPO
  'npo_conflict_zone_programme_disbursement',
  'npo_donation_round_tripping',
  // PEP / RCA
  'pep_domestic_minister_wealth_mismatch',
  'pep_rca_family_shell_onboarding',
  'pep_former_role_recent_departure',
  // Sanctions / PF
  'sanc_partial_name_common_locale',
  'sanc_conflict_eu_vs_ofac_regime',
  'pf_dual_use_end_user_opacity',
  'maritime_stss_ais_dark',
  'maritime_flag_of_convenience',
  // Corresp / FI
  'corresp_nested_respondent_visibility',
  'corresp_u_turn_payment_detected',
  // Banking
  'bank_funnel_account_multi_payer',
  'bank_pass_through_same_day',
  'bank_dormant_reactivation_inbound',
  'bank_round_numbers_no_rationale',
  // Cyber / BEC / fraud
  'bec_typosquat_supplier_invoice',
  'bec_late_redirect_wire',
  'ato_sim_swap_takeover',
  'synthetic_identity_loan_fraud',
  'advance_fee_romance_scam',
  'ponzi_scheme_return_promise',
  'invoice_fraud_duplicate_submission',
  'phoenix_company_director_reuse',
  // Market abuse
  'market_layering_small_cap',
  'marking_the_close_pattern',
  'insider_trading_material_nonpublic',
  'spoofing_bid_side',
  'wash_sale_tax_event',
  // Art / luxury
  'art_private_sale_provenance_gap',
  'art_auction_ring_escalation',
  'lux_yacht_registration_chain',
  'lux_jet_beneficial_ownership_opaque',
  // Gambling
  'gambling_junket_inflow_layered',
  'online_gambling_velocity_multi_provider',
  // Family office
  'fo_ptc_patriarch_opacity',
  'fo_multi_gen_trust_chain',
  // Operations / governance
  'ops_alert_backlog_breach',
  'ops_training_overdue_high_risk_staff',
  'audit_lookback_sample_gap',
  'incident_lessons_learned_policy_drift',
  'mlro_str_draft_insufficient_facts',
  'four_eyes_override_attempted',
  'tipping_off_risk_intercepted',
  // Data quality
  'dq_feed_schema_drift_silent',
  'dq_sanctions_freshness_sla_breach',
  'dq_customer_master_duplicate_merge_conflict',
  // Charity / religious
  'charity_friday_prayer_cash_inflow',
  'charity_ramadan_campaign_diversion_risk',
  // Free zone
  'free_zone_shell_nominee_directors',
  'free_zone_cross_border_layering',
  // Cash courier
  'cash_courier_inbound_undeclared',
  'cash_courier_structured_under_threshold',
  // Anti-fraud / ops
  'chargeback_abuse_pattern',
  'refund_farming_pattern',
  'loyalty_points_redemption_fraud',
  // International cooperation
  'mlar_request_cross_border',
  'foreign_fiu_information_request',
] as const;

export type ScenarioIdWave3 = typeof SCENARIO_PRESETS_WAVE_3[number];

export const SCENARIO_PRESETS_EXT: ScenarioPresetExt[] = SCENARIO_PRESETS_WAVE_3.map((id) => {
  const sector = id.startsWith('dpms_') ? 'dpms'
    : id.startsWith('vasp_') ? 'vasp'
    : id.startsWith('tf_') ? 'trade_finance'
    : id.startsWith('re_') ? 'real_estate'
    : id.startsWith('ins_') ? 'insurance'
    : id.startsWith('npo_') ? 'npo'
    : id.startsWith('pep_') ? 'pep'
    : id.startsWith('sanc_') || id.startsWith('pf_') || id.startsWith('maritime_') ? 'sanctions'
    : id.startsWith('corresp_') ? 'correspondent_banking'
    : id.startsWith('bank_') ? 'banking'
    : id.startsWith('bec_') || id.startsWith('ato_') || id.includes('fraud') || id.includes('ponzi') || id.includes('phoenix') || id.includes('advance_fee') || id.includes('synthetic_identity') ? 'cyber_fraud'
    : id.startsWith('market_') || id.includes('insider_trading') || id.includes('spoofing') || id.includes('wash_sale') || id.includes('marking_the_close') ? 'market_abuse'
    : id.startsWith('art_') || id.startsWith('lux_') ? 'art_luxury'
    : id.startsWith('gambling_') || id.startsWith('online_gambling') ? 'gambling'
    : id.startsWith('fo_') ? 'family_office'
    : id.startsWith('ops_') || id.startsWith('audit_') || id.startsWith('incident_') || id.startsWith('mlro_') || id.startsWith('four_eyes_') || id.startsWith('tipping_off_') ? 'operations'
    : id.startsWith('dq_') ? 'data_quality'
    : id.startsWith('charity_') ? 'charity'
    : id.startsWith('free_zone_') ? 'free_zone'
    : id.startsWith('cash_courier_') ? 'cash_courier'
    : id.startsWith('chargeback_') || id.startsWith('refund_') || id.startsWith('loyalty_') ? 'anti_fraud'
    : id.startsWith('mlar_') || id.startsWith('foreign_fiu_') ? 'intl_cooperation'
    : 'general';
  return { id, wave: 3 as const, sector };
});
