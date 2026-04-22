// Hawkeye Sterling — extended red-flag catalogue.
// Sector-organised. Every flag is an OBSERVABLE INDICATOR, never a legal
// conclusion (charter P3). Bindings point to reasoning modes (incl. Wave 3).

import type { RedFlag } from './red-flags.js';

export const RED_FLAGS_EXTENDED: RedFlag[] = [
  // — Banking / retail
  { id: 'rfx_bank_dormant_reactivated', typology: 'banking', indicator: 'Dormant account reactivated immediately before large inbound transfer.', severity: 'medium', reasoningModes: ['pattern_of_life', 'timeline_reconstruction'], sources: ['FATF RBA', 'Wolfsberg'] },
  { id: 'rfx_bank_funnel_account', typology: 'banking', indicator: 'Multiple unrelated payers fund one account followed by consolidated outbound.', severity: 'high', reasoningModes: ['link_analysis', 'community_detection', 'pattern_of_life'], sources: ['FATF'] },
  { id: 'rfx_bank_round_amounts', typology: 'banking', indicator: 'Consistently round-number transactions with no commercial rationale.', severity: 'low', reasoningModes: ['velocity_analysis', 'narrative_coherence'], sources: [] },
  { id: 'rfx_bank_cross_border_same_day', typology: 'banking', indicator: 'Same-day inbound + outbound cross-border with narrow margin (pass-through).', severity: 'high', reasoningModes: ['velocity_analysis', 'chain_analysis'], sources: ['FATF'] },
  { id: 'rfx_bank_atm_repeat_withdrawals', typology: 'banking', indicator: 'High-frequency ATM withdrawals across multiple locations immediately after inbound transfer.', severity: 'medium', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },

  // — Crypto / VASP / DeFi
  { id: 'rfx_crypto_privacy_wallet_inbound', typology: 'crypto', indicator: 'Inbound from a wallet cluster associated with privacy-preserving activity.', severity: 'high', reasoningModes: ['address_reuse_analysis', 'taint_half_life', 'privacy_coin_reasoning'], sources: ['FATF VASP', 'OFAC advisories'] },
  { id: 'rfx_crypto_bridge_rapid_swap', typology: 'crypto', indicator: 'Rapid cross-chain bridge followed by swap into stablecoin then off-ramp.', severity: 'medium', reasoningModes: ['bridge_crossing_trace', 'chain_analysis'], sources: [] },
  { id: 'rfx_crypto_sanction_cluster_hop', typology: 'crypto', indicator: 'Counterparty within 2 hops of a sanction-designated wallet cluster.', severity: 'high', reasoningModes: ['sanction_wallet_cluster', 'chain_analysis'], sources: ['OFAC'] },
  { id: 'rfx_crypto_peel_chain', typology: 'crypto', indicator: 'Peel-chain disbursement pattern indicative of layering.', severity: 'high', reasoningModes: ['peel_chain'], sources: [] },
  { id: 'rfx_crypto_flash_loan_then_drain', typology: 'crypto', indicator: 'Flash loan preceded by contract state change indicative of exploit.', severity: 'high', reasoningModes: ['flash_loan_exploit', 'smart_contract_static_analysis'], sources: [] },
  { id: 'rfx_crypto_approval_sprawl', typology: 'crypto', indicator: 'Wallet holds many unrevoked token approvals to unrelated contracts.', severity: 'medium', reasoningModes: ['token_approval_audit'], sources: [] },
  { id: 'rfx_crypto_darknet_inbound', typology: 'crypto', indicator: 'Inbound traceable to known darknet marketplace wallet.', severity: 'high', reasoningModes: ['darknet_market_flow'], sources: [] },
  { id: 'rfx_crypto_nft_wash', typology: 'crypto', indicator: 'Recurring transfers of same NFT between related wallets at escalating prices.', severity: 'medium', reasoningModes: ['nft_wash', 'wash_trade'], sources: [] },

  // — Real estate
  { id: 'rfx_re_rapid_flip', typology: 'real_estate', indicator: 'Property resold within 90 days at materially different price.', severity: 'medium', reasoningModes: ['re_rapid_flip_detection', 're_valuation_anomaly'], sources: [] },
  { id: 'rfx_re_opaque_buyer', typology: 'real_estate', indicator: 'Buyer is a shell in a jurisdiction not related to the property market.', severity: 'high', reasoningModes: ['re_shell_owner_check', 'jurisdiction_cascade'], sources: [] },
  { id: 'rfx_re_cash_closure', typology: 'real_estate', indicator: 'Residential / commercial purchase closed in cash or equivalent.', severity: 'high', reasoningModes: ['re_cash_purchase_check', 'real_estate_cash'], sources: ['FATF'] },
  { id: 'rfx_re_advance_overpay', typology: 'real_estate', indicator: 'Off-plan advance paid above contract amount with refund demanded later.', severity: 'medium', reasoningModes: ['re_off_plan_advance_check'], sources: [] },
  { id: 'rfx_re_tenant_surrogate', typology: 'real_estate', indicator: 'Tenant pays rent from bank account in name of third party with no linkage.', severity: 'medium', reasoningModes: ['re_tenant_surrogate', 'entity_resolution'], sources: [] },

  // — Trade finance / TBML
  { id: 'rfx_tf_phantom_buyer', typology: 'tbml', indicator: 'Buyer named in LC does not exist in any corporate registry.', severity: 'high', reasoningModes: ['phantom_buyer', 'entity_resolution'], sources: [] },
  { id: 'rfx_tf_third_party_pay', typology: 'tbml', indicator: 'Payment under LC received from a third party unrelated to buyer.', severity: 'high', reasoningModes: ['ucp600_discipline', 'link_analysis'], sources: ['ICC UCP 600'] },
  { id: 'rfx_tf_lc_discrep_waived', typology: 'tbml', indicator: 'Material discrepancies waived under the LC without documented rationale.', severity: 'medium', reasoningModes: ['lc_confirmation_gap', 'exception_log'], sources: [] },
  { id: 'rfx_tf_route_deviation', typology: 'tbml', indicator: 'Vessel route materially deviates from LC-declared route.', severity: 'high', reasoningModes: ['vessel_ais_gap_analysis', 'sanctions_maritime_stss'], sources: [] },
  { id: 'rfx_tf_unit_price_outlier', typology: 'tbml', indicator: 'Unit price is outlier vs. global trade-data benchmark for HS code.', severity: 'medium', reasoningModes: ['commodity_price_anomaly', 'regression'], sources: [] },

  // — Precious metals / bullion
  { id: 'rfx_bullion_unknown_origin', typology: 'dpms_refinery', indicator: 'Doré bars accepted with missing or illegible origin markings.', severity: 'high', reasoningModes: ['doré_origin_crosscheck', 'chain_of_custody_break'], sources: ['LBMA RGG'] },
  { id: 'rfx_bullion_assay_mismatch', typology: 'dpms_refinery', indicator: 'Assay certificate purity materially differs from refinery measurement.', severity: 'medium', reasoningModes: ['assay_certificate_audit', 'reconciliation'], sources: [] },
  { id: 'rfx_bullion_cahra_undocumented', typology: 'dpms_refinery', indicator: 'CAHRA-sourced input without OECD Annex II evidence attached.', severity: 'high', reasoningModes: ['oecd_annex_ii_discipline', 'provenance_trace'], sources: ['OECD DDG'] },
  { id: 'rfx_bullion_recycled_round_trip', typology: 'dpms_refinery', indicator: 'Recycled inputs trace back to recent DPMS outputs (round-trip).', severity: 'medium', reasoningModes: ['recycled_input_audit', 'trade_round_tripping'], sources: [] },

  // — Insurance
  { id: 'rfx_ins_early_surrender', typology: 'insurance', indicator: 'High-premium policy surrendered within cooling-off window with refund to third party.', severity: 'high', reasoningModes: ['ins_early_surrender_cash', 'ins_beneficiary_rotation'], sources: [] },
  { id: 'rfx_ins_overfund', typology: 'insurance', indicator: 'Single-premium paid far in excess of product limits then refund requested.', severity: 'high', reasoningModes: ['ins_premium_overfund', 'ins_single_premium_scrutiny'], sources: [] },
  { id: 'rfx_ins_beneficiary_switch', typology: 'insurance', indicator: 'Beneficiary changed shortly before claim filed.', severity: 'medium', reasoningModes: ['ins_beneficiary_rotation'], sources: [] },

  // — NPO / charity
  { id: 'rfx_npo_conflict_zone_disbursement', typology: 'npo_diversion', indicator: 'Programme disbursements concentrated in conflict-affected area without on-ground evidence.', severity: 'high', reasoningModes: ['npo_conflict_zone_flow', 'provenance_trace'], sources: ['FATF R.8'] },
  { id: 'rfx_npo_cash_programme_ratio', typology: 'npo_diversion', indicator: 'Programme-to-cash ratio inconsistent with declared activities.', severity: 'medium', reasoningModes: ['npo_programme_vs_cash_ratio'], sources: [] },

  // — Gambling
  { id: 'rfx_gam_junket_inflow', typology: 'gambling', indicator: 'Junket-originated funds layered via multiple accounts.', severity: 'high', reasoningModes: ['casino_junket_flow'], sources: [] },
  { id: 'rfx_gam_high_velocity_deposits', typology: 'gambling', indicator: 'Multiple online gambling deposits across providers in short window.', severity: 'medium', reasoningModes: ['online_gambling_deposit_velocity'], sources: [] },

  // — Art / luxury
  { id: 'rfx_art_provenance_gap', typology: 'art_dealer', indicator: 'Provenance chain has unexplained gap exceeding 10 years.', severity: 'medium', reasoningModes: ['art_provenance_chain', 'lineage'], sources: [] },
  { id: 'rfx_art_ring_price_escalation', typology: 'art_dealer', indicator: 'Same work cycling through related dealers with escalating price.', severity: 'high', reasoningModes: ['art_auction_ring_detection', 'wash_trade'], sources: [] },
  { id: 'rfx_lux_jet_registration_opacity', typology: 'yacht_jet', indicator: 'Aircraft registered through chain of special-purpose vehicles with nominees.', severity: 'medium', reasoningModes: ['yacht_jet_registration_opacity', 'ubo_tree_walk'], sources: [] },

  // — Market abuse / insider
  { id: 'rfx_mkt_layering_orders', typology: 'market_manipulation', indicator: 'Rapid placement and cancellation of orders around a price move.', severity: 'high', reasoningModes: ['layering_detection'], sources: [] },
  { id: 'rfx_mkt_marking_close', typology: 'market_manipulation', indicator: 'Pattern of high-impact trades at the closing print.', severity: 'medium', reasoningModes: ['marking_the_close'], sources: [] },
  { id: 'rfx_mkt_insider_prior_disclosure', typology: 'insider_trading', indicator: 'Unusual trading by insider-linked account in window preceding material disclosure.', severity: 'high', reasoningModes: ['insider_threat', 'timeline_reconstruction'], sources: [] },

  // — Cyber / BEC / fraud
  { id: 'rfx_bec_typosquat_invoice', typology: 'bec_fraud', indicator: 'Invoice received from typosquat domain of known supplier.', severity: 'high', reasoningModes: ['typosquat_domain_detection', 'email_spoof_forensic'], sources: [] },
  { id: 'rfx_bec_redirect_late', typology: 'bec_fraud', indicator: 'Bank-details change communicated within days of planned payment.', severity: 'high', reasoningModes: ['invoice_redirection_trace', 'pattern_of_life'], sources: [] },
  { id: 'rfx_ato_sim_swap', typology: 'bec_fraud', indicator: 'Account takeover sequence following SIM-swap indicator.', severity: 'high', reasoningModes: ['sim_swap_indicator', 'account_takeover_sequence'], sources: [] },

  // — Data quality
  { id: 'rfx_dq_schema_drift', typology: 'governance', indicator: 'Upstream feed schema changed without notice; fields mis-bound.', severity: 'medium', reasoningModes: ['schema_drift_detection', 'reconciliation'], sources: [] },
  { id: 'rfx_dq_freshness_breach', typology: 'governance', indicator: 'Sanctions feed freshness SLA breached for ≥ 24 hours.', severity: 'high', reasoningModes: ['freshness_sla_breach'], sources: ['Charter P8'] },
];
