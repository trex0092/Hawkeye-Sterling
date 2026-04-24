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

  // ── Wave 4 — environmental crime (FATF R.3 2021 predicate) ──────────
  { id: 'rfx_env_supply_iuu_fishing', typology: 'environmental_crime', indicator: 'Seafood supply chain includes vessels listed in IUU fishing registers or with AIS gaps over declared fishing grounds.', severity: 'high', reasoningModes: ['vessel_ais_gap_analysis', 'provenance_trace'], sources: ['FAO Port State Measures'] },
  { id: 'rfx_env_illegal_mining_dore', typology: 'environmental_crime', indicator: 'Doré imports from jurisdiction with no legal gold-mining production yet declared origin on that jurisdiction.', severity: 'high', reasoningModes: ['provenance_trace', 'jurisdiction_cascade'], sources: ['OECD DDG', 'LBMA RGG'] },
  { id: 'rfx_env_timber_cites_gap', typology: 'environmental_crime', indicator: 'Timber species regulated under CITES shipped without permit or with forged CITES paperwork.', severity: 'high', reasoningModes: ['provenance_trace'], sources: ['CITES'] },

  // ── Wave 4 — carbon-market fraud ────────────────────────────────────
  { id: 'rfx_carbon_vcm_register_gap', typology: 'carbon_market_fraud', indicator: 'Claimed voluntary-carbon-market credits not reconcilable against the stated issuing registry.', severity: 'high', reasoningModes: ['reconciliation', 'provenance_trace'], sources: ['ICVCM'] },
  { id: 'rfx_carbon_retirement_mismatch', typology: 'carbon_market_fraud', indicator: 'Credits retired in one jurisdiction yet sold or claimed as offset in another without corresponding-adjustment entry.', severity: 'high', reasoningModes: ['reconciliation'], sources: ['Article 6 Paris Agreement'] },
  { id: 'rfx_carbon_baseline_manipulation', typology: 'carbon_market_fraud', indicator: 'Project baseline / additionality documentation materially diverges from independent MRV evidence.', severity: 'medium', reasoningModes: ['narrative_coherence', 'source_triangulation'], sources: ['VCS / Gold Standard MRV'] },

  // ── Wave 4 — insider threat / IP exfiltration ───────────────────────
  { id: 'rfx_insider_offboarding_bulk_download', typology: 'insider_threat', indicator: 'Privileged user performs bulk document or code export in the window immediately before announced departure.', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_insider_patent_app_after_exit', typology: 'insider_threat', indicator: 'Patent or publication by former employee within 6 months of exit covering subject-matter they accessed in role.', severity: 'medium', reasoningModes: ['timeline_reconstruction'], sources: [] },
  { id: 'rfx_insider_usb_after_hours', typology: 'insider_threat', indicator: 'Removable-media write events outside business hours on sensitive-data workstations.', severity: 'medium', reasoningModes: ['pattern_of_life'], sources: [] },

  // ── Wave 4 — AI governance breach ───────────────────────────────────
  { id: 'rfx_ai_shadow_deployment', typology: 'ai_governance_breach', indicator: 'Business unit consuming a third-party generative-AI API without IT / compliance registration (Shadow AI).', severity: 'high', reasoningModes: ['retention_audit', 'documentation_quality'], sources: ['ISO/IEC 42001', 'NIST AI RMF'] },
  { id: 'rfx_ai_agent_autonomous_spend', typology: 'ai_governance_breach', indicator: 'Agentic AI authorises financial transactions above a de-minimis threshold without human-in-the-loop approval.', severity: 'high', reasoningModes: ['four_eyes_stress', 'control_effectiveness'], sources: ['EU AI Act'] },
  { id: 'rfx_ai_drift_monitoring_absent', typology: 'ai_governance_breach', indicator: 'High-risk AI system lacks model-drift / concept-drift monitoring in production.', severity: 'medium', reasoningModes: ['freshness_sla_breach'], sources: ['NIST AI RMF Measure'] },
  { id: 'rfx_ai_fairness_metric_absent', typology: 'ai_governance_breach', indicator: 'No documented fairness monitoring for an AI system making decisions about protected classes.', severity: 'high', reasoningModes: ['control_effectiveness'], sources: ['EU AI Act Art.10'] },

  // ── Wave 4 — AI synthetic-media fraud ───────────────────────────────
  { id: 'rfx_ai_voice_clone_invoice_approval', typology: 'ai_synthetic_media_fraud', indicator: 'Invoice approval via voice instruction shortly after a high-profile public voice-cloning campaign against the sector.', severity: 'high', reasoningModes: ['linguistic_forensics', 'timeline_reconstruction'], sources: [] },
  { id: 'rfx_ai_liveness_bypass_onboarding', typology: 'ai_synthetic_media_fraud', indicator: 'KYC onboarding passes liveness but subsequent selfies fail device / biometric cross-check.', severity: 'high', reasoningModes: ['entity_resolution'], sources: [] },
  { id: 'rfx_ai_generated_kyc_doc', typology: 'ai_synthetic_media_fraud', indicator: 'KYC document carries EXIF / metadata or artefacts consistent with AI-generated imagery.', severity: 'high', reasoningModes: ['documentation_quality'], sources: [] },

  // ── Wave 5 — Banking / retail banking ────────────────────────────────
  { id: 'rfx_bank_round_dollar_wire_series', typology: 'banking', indicator: 'Series of international wires in exactly round-dollar amounts ($10,000 / $50,000 / $100,000) to the same beneficiary within 30 days.', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_bank_rapid_successive_atm', typology: 'banking', indicator: 'ATM withdrawals at maximum daily limit on consecutive days across multiple card accounts linked to the same entity.', severity: 'medium', reasoningModes: ['velocity_analysis', 'structuring_pattern'], sources: [] },
  { id: 'rfx_bank_ctr_structuring_below', typology: 'banking', indicator: 'Cash deposits consistently just below reporting threshold (≥ 8 deposits in the range AED 36,000–39,999 over 30 days).', severity: 'high', reasoningModes: ['structuring_pattern', 'smurfing_detection'], sources: ['FinCEN Structuring Advisory'] },
  { id: 'rfx_bank_refund_arbitrage', typology: 'banking', indicator: 'High volume of merchant refunds flowing into account without corresponding purchase history.', severity: 'medium', reasoningModes: ['reconciliation', 'pattern_of_life'], sources: [] },
  { id: 'rfx_bank_dormant_reactivation_wire', typology: 'banking', indicator: 'Account dormant > 12 months reactivated with an immediate large international wire above AED 500k.', severity: 'high', reasoningModes: ['dormant_account_signal', 'pattern_of_life'], sources: [] },
  { id: 'rfx_bank_multiple_currency_same_day', typology: 'banking', indicator: 'Same-day deposits in three or more currencies across different branches with no trade-finance explanation.', severity: 'medium', reasoningModes: ['velocity_analysis', 'tbml_overlay'], sources: [] },

  // ── Wave 5 — Crypto / VASP ────────────────────────────────────────────
  { id: 'rfx_vasp_chain_hopping_rapid', typology: 'vasp', indicator: 'Funds converted across ≥4 different blockchain protocols within 48 hours without apparent economic purpose.', severity: 'high', reasoningModes: ['chain_analysis', 'taint_propagation'], sources: [] },
  { id: 'rfx_vasp_darknet_market_taint', typology: 'vasp', indicator: 'On-chain analysis tools flag > 10% of wallet balance as originating from a known darknet-market address cluster.', severity: 'high', reasoningModes: ['chain_analysis', 'taint_propagation'], sources: ['FATF VASP Guidance 2021'] },
  { id: 'rfx_vasp_travel_rule_noncompliance', typology: 'vasp', indicator: 'Counterpart VASP does not transmit originator / beneficiary data for transactions repeatedly exceeding the Travel Rule threshold.', severity: 'high', reasoningModes: ['vasp_travel_rule', 'completeness_audit'], sources: ['FATF INR.16'] },
  { id: 'rfx_vasp_sanctioned_exchange', typology: 'vasp', indicator: 'Funds received from or sent to a VASP address cluster publicly linked to a sanctioned exchange or jurisdiction.', severity: 'high', reasoningModes: ['chain_analysis', 'sanctions_regime_matrix'], sources: ['OFAC VASP advisories'] },
  { id: 'rfx_vasp_p2p_no_kyc', typology: 'vasp', indicator: 'Repeated peer-to-peer transactions with counter-parties showing no KYC onboarding at any regulated platform.', severity: 'medium', reasoningModes: ['vasp_wallet_screen', 'entity_resolution'], sources: [] },
  { id: 'rfx_vasp_nft_wash_cycle', typology: 'vasp', indicator: 'NFT traded between wallets controlled by same beneficial owner at escalating prices with no arm-length buyer.', severity: 'high', reasoningModes: ['nft_wash', 'wash_trade', 'entity_resolution'], sources: [] },

  // ── Wave 5 — Real estate ─────────────────────────────────────────────
  { id: 'rfx_re_pre_construction_flip', typology: 'real_estate_cash', indicator: 'Off-plan unit assigned or sold within 90 days of purchase at a significant premium with no evident market driver.', severity: 'medium', reasoningModes: ['real_estate_cash', 'pattern_of_life'], sources: [] },
  { id: 'rfx_re_poa_nominee_buyer', typology: 'real_estate_cash', indicator: 'Property purchased under power of attorney by a nominee with no documented relationship to the beneficial owner.', severity: 'high', reasoningModes: ['ubo_nominee_directors', 'entity_resolution'], sources: ['FATF Real Estate Guidance 2022'] },
  { id: 'rfx_re_overpayment_cash_back', typology: 'real_estate_cash', indicator: 'Purchase price materially exceeds independent valuation and seller returns difference to buyer in cash or informally.', severity: 'high', reasoningModes: ['real_estate_cash', 'source_triangulation'], sources: [] },

  // ── Wave 5 — TBML ────────────────────────────────────────────────────
  { id: 'rfx_tbml_trade_mirror_discrepancy', typology: 'tbml', indicator: 'Export statistics from Country A for shipments to Country B diverge materially from Country B import statistics for the same commodity and period — mirror-trade gap.', severity: 'high', reasoningModes: ['tbml_overlay', 'source_triangulation'], sources: ['FATF TBML Report'] },
  { id: 'rfx_tbml_back_to_back_lc', typology: 'tbml', indicator: 'Back-to-back letter-of-credit arrangement where intermediary bank neither takes ownership nor inspects goods.', severity: 'high', reasoningModes: ['ucp600_discipline', 'tbml_over_invoicing'], sources: [] },
  { id: 'rfx_tbml_mixed_container_inconsistency', typology: 'tbml', indicator: 'Shipping manifest describes mixed-goods container inconsistently with declared Harmonised System codes and declared value.', severity: 'medium', reasoningModes: ['tbml_phantom_shipment', 'provenance_trace'], sources: [] },
  { id: 'rfx_tbml_third_country_routing', typology: 'tbml', indicator: 'Goods declared as originating in low-risk jurisdiction but routing documentation evidences transit through high-risk country.', severity: 'high', reasoningModes: ['provenance_trace', 'jurisdiction_cascade'], sources: [] },

  // ── Wave 5 — Insurance ───────────────────────────────────────────────
  { id: 'rfx_ins_early_surrender_high_value', typology: 'insurance_wrap', indicator: 'Single-premium life policy surrendered within 12 months; surrender proceeds directed to a different bank account from the premium source.', severity: 'high', reasoningModes: ['insurance_wrap', 'pattern_of_life'], sources: [] },
  { id: 'rfx_ins_pep_multiple_policies', typology: 'insurance_wrap', indicator: 'PEP or PEP-RCA holds multiple single-premium investment-wrapper policies across different jurisdictions disproportionate to declared income.', severity: 'high', reasoningModes: ['insurance_wrap', 'pep_domestic_minister', 'source_triangulation'], sources: [] },
  { id: 'rfx_ins_false_claim_cluster', typology: 'insurance_wrap', indicator: 'Unusually high claim frequency or consistently maximum-value claims from the same insured or broker network.', severity: 'medium', reasoningModes: ['pattern_of_life', 'reconciliation'], sources: [] },

  // ── Wave 5 — BEC / Cyber fraud ───────────────────────────────────────
  { id: 'rfx_bec_new_domain_payment', typology: 'bec_fraud', indicator: 'Counterparty email domain registered within 30 days of a payment instruction received from that domain.', severity: 'high', reasoningModes: ['typosquat_domain_detection', 'timeline_reconstruction'], sources: [] },
  { id: 'rfx_bec_mobile_number_reassignment', typology: 'bec_fraud', indicator: 'Beneficiary bank account recently linked to a mobile number reassigned from a different subscriber.', severity: 'medium', reasoningModes: ['sim_swap_indicator', 'entity_resolution'], sources: [] },
  { id: 'rfx_bec_ceo_wire_off_hours', typology: 'bec_fraud', indicator: 'Urgent wire instruction purportedly from senior executive received outside business hours requesting bypass of normal approval controls.', severity: 'high', reasoningModes: ['four_eyes_stress', 'linguistic_forensics'], sources: [] },

  // ── Wave 5 — Environmental crime ─────────────────────────────────────
  { id: 'rfx_env_wildlife_quota_exceeded', typology: 'environmental_crime', indicator: 'CITES export certificate issued by a country without documented legal export quota for the species in the permit period.', severity: 'high', reasoningModes: ['provenance_trace', 'documentation_quality'], sources: ['CITES Appendix I-III'] },
  { id: 'rfx_env_illegal_e_waste', typology: 'environmental_crime', indicator: 'Electronic-waste shipment declared as second-hand goods transiting through a jurisdiction banned from e-waste import under Basel Convention.', severity: 'medium', reasoningModes: ['tbml_phantom_shipment', 'jurisdiction_cascade'], sources: ['Basel Convention'] },

  // ── Wave 5 — Professional ML / Hawala / Funnel accounts ─────────────
  { id: 'rfx_hawala_mismatched_settlements', typology: 'hawala_network', indicator: 'Cash deposits into account precisely matching outstanding hawala obligations evidenced by informal ledger entries.', severity: 'high', reasoningModes: ['pattern_of_life', 'reconciliation'], sources: [] },
  { id: 'rfx_funnel_many_small_inflows', typology: 'funnel_account', indicator: 'Account receives ≥ 50 small inbound transfers from unrelated parties in 7 days then makes one or two large outbound wires.', severity: 'high', reasoningModes: ['velocity_analysis', 'smurfing_detection'], sources: [] },
  { id: 'rfx_pml_shared_mule_pool', typology: 'professional_money_laundering', indicator: 'Same mule account cluster receives layering flows from ≥ 3 unrelated criminal proceeds sources identified by LEA tipoff or OSINT.', severity: 'high', reasoningModes: ['community_detection', 'link_analysis', 'source_triangulation'], sources: ['Egmont FINT'] },
  { id: 'rfx_gambling_chip_washing', typology: 'gambling_ml', indicator: 'Casino chips purchased with cash, minimally wagered, then cashed out as winnings through third-party cashier.', severity: 'high', reasoningModes: ['casino_junket_flow', 'pattern_of_life'], sources: [] },
  { id: 'rfx_romance_crypto_transfer', typology: 'romance_fraud', indicator: 'Individual with no prior crypto history makes series of transfers to unhosted wallets following a new online relationship.', severity: 'high', reasoningModes: ['pattern_of_life', 'chain_analysis'], sources: [] },
];
