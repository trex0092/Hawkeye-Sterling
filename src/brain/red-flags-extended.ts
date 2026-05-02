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

  // ══════════════════════════════════════════════════════════════════════
  // Wave 6 — Customer-behaviour layer (52 indicators)
  // Operator-observable signals at onboarding and during the lifecycle.
  // Charter P3: indicators only, never legal conclusions.
  // ══════════════════════════════════════════════════════════════════════

  // — Onboarding evasion / interview signals (12)
  { id: 'rfx_cb_refuses_ubo_docs', typology: 'onboarding_evasion', indicator: 'Customer refuses to provide UBO documentation despite repeated requests.', severity: 'high', reasoningModes: ['documentation_quality', 'narrative_coherence'], sources: ['FATF R.10', 'Wolfsberg CBDDQ'] },
  { id: 'rfx_cb_urgency_no_reason', typology: 'onboarding_evasion', indicator: 'Demands urgent processing without legitimate commercial reason.', severity: 'medium', reasoningModes: ['narrative_coherence', 'four_eyes_stress'], sources: [] },
  { id: 'rfx_cb_threshold_pre_knowledge', typology: 'onboarding_evasion', indicator: 'Pre-knowledge of internal reporting thresholds — references AED 55k / USD 10k specifically.', severity: 'high', reasoningModes: ['narrative_coherence', 'structuring_pattern'], sources: ['FinCEN Structuring Advisory'] },
  { id: 'rfx_cb_compliance_shopping', typology: 'onboarding_evasion', indicator: 'Customer "shops" for compliance officer or asks "what is the maximum you do not ask about?"', severity: 'high', reasoningModes: ['narrative_coherence', 'structuring_pattern'], sources: [] },
  { id: 'rfx_cb_refuses_face_to_face', typology: 'onboarding_evasion', indicator: 'Refuses face-to-face or video interview when offered.', severity: 'medium', reasoningModes: ['documentation_quality', 'entity_resolution'], sources: ['FATF R.10'] },
  { id: 'rfx_cb_third_party_answers', typology: 'onboarding_evasion', indicator: 'Customer accompanied by third party who answers all substantive questions.', severity: 'medium', reasoningModes: ['narrative_coherence', 'link_analysis'], sources: [] },
  { id: 'rfx_cb_interview_distress', typology: 'onboarding_evasion', indicator: 'Visible nervousness or inconsistent eye contact during identification interview.', severity: 'low', reasoningModes: ['narrative_coherence'], sources: [] },
  { id: 'rfx_cb_third_party_beneficiary_disclosed', typology: 'onboarding_evasion', indicator: 'Identifies a third party as actual beneficiary mid-onboarding contradicting earlier declaration.', severity: 'high', reasoningModes: ['ubo_tree_walk', 'narrative_coherence'], sources: ['FATF R.10'] },
  { id: 'rfx_cb_reluctant_specify_pattern', typology: 'onboarding_evasion', indicator: 'Reluctant to specify expected transaction patterns when asked.', severity: 'medium', reasoningModes: ['narrative_coherence'], sources: [] },
  { id: 'rfx_cb_queries_edd_trigger', typology: 'onboarding_evasion', indicator: 'Customer queries the enhanced-due-diligence trigger as if to avoid it.', severity: 'high', reasoningModes: ['narrative_coherence', 'structuring_pattern'], sources: [] },
  { id: 'rfx_cb_refuses_tipping_off_ack', typology: 'onboarding_evasion', indicator: 'Refuses to acknowledge tipping-off / confidentiality clause at onboarding.', severity: 'medium', reasoningModes: ['narrative_coherence'], sources: ['FDL 20/2018'] },
  { id: 'rfx_cb_introducer_filters_comms', typology: 'onboarding_evasion', indicator: 'Accountancy or legal "introducer" insists on filtering all communication with the customer.', severity: 'medium', reasoningModes: ['link_analysis', 'documentation_quality'], sources: [] },

  // — Identity & document tells (10)
  { id: 'rfx_cb_id_handwritten_copy', typology: 'identity_proof_anomaly', indicator: 'Provides handwritten or low-quality copy of ID instead of original.', severity: 'medium', reasoningModes: ['documentation_quality'], sources: [] },
  { id: 'rfx_cb_id_mrz_blurred', typology: 'identity_proof_anomaly', indicator: 'ID-document edges blurred or pixelated near the machine-readable zone.', severity: 'medium', reasoningModes: ['documentation_quality'], sources: [] },
  { id: 'rfx_cb_id_mrz_checksum_invalid', typology: 'identity_proof_anomaly', indicator: 'ID-document MRZ checksum invalid on independent calculation.', severity: 'high', reasoningModes: ['documentation_quality', 'entity_resolution'], sources: ['ICAO 9303'] },
  { id: 'rfx_cb_biometric_session_drift', typology: 'identity_proof_anomaly', indicator: 'Liveness passes at onboarding but biometric mismatch on later session selfie.', severity: 'high', reasoningModes: ['entity_resolution'], sources: [] },
  { id: 'rfx_cb_selfie_ai_artefacts', typology: 'ai_synthetic_media_fraud', indicator: 'Selfie EXIF / metadata or pixel artefacts consistent with AI-generated imagery.', severity: 'high', reasoningModes: ['documentation_quality'], sources: [] },
  { id: 'rfx_cb_passport_recent_cbi', typology: 'identity_proof_anomaly', indicator: 'Passport recently issued (< 30 days) from a CBI / passport-shop jurisdiction.', severity: 'medium', reasoningModes: ['jurisdiction_cascade', 'timeline_reconstruction'], sources: ['FATF CBI guidance'] },
  { id: 'rfx_cb_id_name_variant_submissions', typology: 'identity_proof_anomaly', indicator: 'Multiple ID submissions across the same applicant with subtle name-spelling variants.', severity: 'high', reasoningModes: ['entity_resolution'], sources: [] },
  { id: 'rfx_cb_signature_mismatch', typology: 'identity_proof_anomaly', indicator: 'Different signatures on different forms within the same submission session.', severity: 'medium', reasoningModes: ['documentation_quality', 'entity_resolution'], sources: [] },
  { id: 'rfx_cb_address_co_agent_only', typology: 'identity_proof_anomaly', indicator: 'Address provided is C/O lawyer, virtual office, or registered-agent address only.', severity: 'medium', reasoningModes: ['ubo_nominee_directors', 'jurisdiction_cascade'], sources: ['FATF R.24'] },
  { id: 'rfx_cb_phone_voip_disposable', typology: 'identity_proof_anomaly', indicator: 'Phone number is VoIP, disposable, or reassigned within last 30 days.', severity: 'medium', reasoningModes: ['entity_resolution', 'sim_swap_indicator'], sources: [] },

  // — Source of wealth / source of funds inconsistency (10)
  { id: 'rfx_cb_sow_employment_timeline_gap', typology: 'source_of_wealth_inconsistency', indicator: 'Source-of-wealth narrative inconsistent with declared employment timeline.', severity: 'high', reasoningModes: ['narrative_coherence', 'timeline_reconstruction', 'source_triangulation'], sources: ['Wolfsberg FAQ'] },
  { id: 'rfx_cb_income_below_industry_norm', typology: 'source_of_wealth_inconsistency', indicator: 'Declared income materially below industry / role norms.', severity: 'medium', reasoningModes: ['regression', 'peer_benchmark'], sources: [] },
  { id: 'rfx_cb_income_above_plausibility', typology: 'source_of_wealth_inconsistency', indicator: 'Declared income materially above plausibility for stated role without verifiable source.', severity: 'high', reasoningModes: ['regression', 'narrative_coherence'], sources: ['Wolfsberg'] },
  { id: 'rfx_cb_cannot_articulate_business', typology: 'source_of_wealth_inconsistency', indicator: 'Cannot articulate the customer\'s own business model in plain terms.', severity: 'medium', reasoningModes: ['narrative_coherence'], sources: [] },
  { id: 'rfx_cb_business_website_dead', typology: 'source_of_wealth_inconsistency', indicator: 'Business website is generic template, under construction, or dead.', severity: 'low', reasoningModes: ['documentation_quality', 'narrative_coherence'], sources: [] },
  { id: 'rfx_cb_no_online_presence', typology: 'source_of_wealth_inconsistency', indicator: 'LinkedIn / professional online presence absent for senior role claimed.', severity: 'low', reasoningModes: ['source_triangulation'], sources: [] },
  { id: 'rfx_cb_references_defunct_entities', typology: 'source_of_wealth_inconsistency', indicator: 'Reference letters issued by entities that are dissolved, defunct, or unverifiable.', severity: 'medium', reasoningModes: ['documentation_quality', 'source_credibility'], sources: [] },
  { id: 'rfx_cb_unverifiable_govt_link', typology: 'source_of_wealth_inconsistency', indicator: 'Government / NGO linkage claimed without verifiable evidence.', severity: 'medium', reasoningModes: ['source_triangulation', 'pep_domestic_minister'], sources: [] },
  { id: 'rfx_cb_tax_residence_mismatch', typology: 'source_of_wealth_inconsistency', indicator: 'Declared tax residence inconsistent with primary banking activity location.', severity: 'medium', reasoningModes: ['fatca_indicia_reasoning', 'jurisdiction_cascade'], sources: ['OECD CRS'] },
  { id: 'rfx_cb_crs_self_cert_inconsistent', typology: 'source_of_wealth_inconsistency', indicator: 'CRS / FATCA self-certification refused, contradicted, or repeatedly amended.', severity: 'high', reasoningModes: ['fatca_indicia_reasoning', 'documentation_quality'], sources: ['OECD CRS'] },

  // — Profile / structure mismatch (10)
  { id: 'rfx_cb_account_type_profile_mismatch', typology: 'profile_mismatch', indicator: 'Account type requested incompatible with declared profile (e.g. corporate trust + retail combination).', severity: 'medium', reasoningModes: ['narrative_coherence'], sources: [] },
  { id: 'rfx_cb_ubo_id_via_intermediary_only', typology: 'profile_mismatch', indicator: 'UBO declined to provide own ID; only the intermediary\'s ID is supplied.', severity: 'high', reasoningModes: ['ubo_tree_walk', 'documentation_quality'], sources: ['FATF R.10'] },
  { id: 'rfx_cb_nominee_no_business_rationale', typology: 'profile_mismatch', indicator: 'Nominee directors / shareholders without articulated business rationale.', severity: 'high', reasoningModes: ['ubo_nominee_directors', 'narrative_coherence'], sources: ['FATF R.24'] },
  { id: 'rfx_cb_poa_signatory_no_link', typology: 'profile_mismatch', indicator: 'Power-of-attorney signatory has no apparent linkage to the customer or beneficiary.', severity: 'medium', reasoningModes: ['link_analysis', 'entity_resolution'], sources: [] },
  { id: 'rfx_cb_poa_jurisdiction_drift', typology: 'profile_mismatch', indicator: 'POA jurisdiction differs from customer\'s and beneficiary\'s jurisdictions without explanation.', severity: 'medium', reasoningModes: ['jurisdiction_cascade'], sources: [] },
  { id: 'rfx_cb_beneficiary_swap_pre_activation', typology: 'profile_mismatch', indicator: 'Beneficiary changed shortly before account activation.', severity: 'medium', reasoningModes: ['ins_beneficiary_rotation', 'timeline_reconstruction'], sources: [] },
  { id: 'rfx_cb_pep_self_decl_contradicted', typology: 'profile_mismatch', indicator: 'PEP self-declaration "no" contradicted by OSINT or registry evidence.', severity: 'high', reasoningModes: ['source_triangulation', 'pep_domestic_minister'], sources: ['FATF R.12'] },
  { id: 'rfx_cb_casual_sanctioned_associate', typology: 'profile_mismatch', indicator: 'Customer references a sanctioned individual casually as "associate" or "partner".', severity: 'high', reasoningModes: ['link_analysis', 'sanctions_regime_matrix'], sources: [] },
  { id: 'rfx_cb_prepaid_multi_card_request', typology: 'profile_mismatch', indicator: 'Multiple cards or pre-loaded prepaid cards requested at onboarding.', severity: 'medium', reasoningModes: ['structuring_pattern', 'narrative_coherence'], sources: [] },
  { id: 'rfx_cb_introducer_prior_str', typology: 'profile_mismatch', indicator: 'Customer onboarded by introducer / referrer with prior STR involvement.', severity: 'high', reasoningModes: ['link_analysis', 'community_detection'], sources: [] },

  // — Behavioural over time (10)
  { id: 'rfx_cb_branch_hopping', typology: 'behavioural_pattern', indicator: 'Visit pattern: switches branches frequently for similar transactions.', severity: 'medium', reasoningModes: ['pattern_of_life', 'structuring_pattern'], sources: [] },
  { id: 'rfx_cb_anxiety_about_monitoring', typology: 'behavioural_pattern', indicator: 'Customer expresses anxiety about reporting or monitoring obligations.', severity: 'medium', reasoningModes: ['narrative_coherence'], sources: [] },
  { id: 'rfx_cb_volume_below_declared_90d', typology: 'behavioural_pattern', indicator: 'Stated transaction volume materially below actual within first 90 days.', severity: 'medium', reasoningModes: ['pattern_of_life', 'reconciliation'], sources: [] },
  { id: 'rfx_cb_volume_above_declared_90d', typology: 'behavioural_pattern', indicator: 'Stated transaction volume materially above declared within first 90 days.', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_cb_legal_name_change_no_trail', typology: 'behavioural_pattern', indicator: 'Customer changes legal name shortly before or after onboarding without documented legal trail.', severity: 'high', reasoningModes: ['entity_resolution', 'timeline_reconstruction'], sources: [] },
  { id: 'rfx_cb_early_closure_after_one_flow', typology: 'behavioural_pattern', indicator: 'Requests early closure of newly opened account after one large flow.', severity: 'high', reasoningModes: ['pattern_of_life', 'velocity_analysis'], sources: [] },
  { id: 'rfx_cb_multiple_close_in_time_accounts', typology: 'behavioural_pattern', indicator: 'Multiple close-in-time accounts opened under name variants.', severity: 'high', reasoningModes: ['entity_resolution', 'community_detection'], sources: [] },
  { id: 'rfx_cb_pre_paid_verification_deposit', typology: 'behavioural_pattern', indicator: 'Customer pre-pays an unusual deposit "for verification" before any business activity.', severity: 'medium', reasoningModes: ['narrative_coherence'], sources: [] },
  { id: 'rfx_cb_reluctant_disclose_cash_source', typology: 'behavioural_pattern', indicator: 'Reluctant to disclose source of cash even when directly asked.', severity: 'high', reasoningModes: ['narrative_coherence', 'documentation_quality'], sources: [] },
  { id: 'rfx_cb_cash_industry_no_controls', typology: 'behavioural_pattern', indicator: 'Customer\'s industry / profession is high-cash-handling but no controls evidenced.', severity: 'medium', reasoningModes: ['narrative_coherence'], sources: ['FATF Cash-intensive guidance'] },

  // ══════════════════════════════════════════════════════════════════════
  // Wave 6 — Transaction-monitoring layer (56 indicators)
  // Alert-tier observable signals — velocity, structure, geography,
  // counterparty, instrument, calendar.
  // ══════════════════════════════════════════════════════════════════════

  // — Cash & structuring (8)
  { id: 'rfx_tm_cash_just_below_threshold', typology: 'structuring', indicator: 'Cash deposits consistently just below the AED 55k / USD 10k reporting threshold.', severity: 'high', reasoningModes: ['structuring_pattern', 'velocity_analysis'], sources: ['FinCEN Structuring Advisory'] },
  { id: 'rfx_tm_identical_deposits_same_day', typology: 'structuring', indicator: 'Series of identical-amount cash deposits across the same business day.', severity: 'high', reasoningModes: ['structuring_pattern', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_multi_branch_deposits', typology: 'structuring', indicator: 'Cash deposits made from multiple branches on the same day.', severity: 'high', reasoningModes: ['structuring_pattern', 'pattern_of_life'], sources: ['Wolfsberg FAQ'] },
  { id: 'rfx_tm_multi_currency_same_day', typology: 'structuring', indicator: 'Same-day cash deposits in three or more currencies without trade nexus.', severity: 'medium', reasoningModes: ['velocity_analysis'], sources: [] },
  { id: 'rfx_tm_cashier_cheque_just_below', typology: 'structuring', indicator: 'Recurring purchase of cashier cheques / negotiable instruments just below threshold.', severity: 'high', reasoningModes: ['structuring_pattern'], sources: ['FinCEN'] },
  { id: 'rfx_tm_max_atm_multi_card', typology: 'structuring', indicator: 'Cash withdrawals at maximum daily ATM limit across multiple cards linked to same UBO.', severity: 'medium', reasoningModes: ['velocity_analysis', 'structuring_pattern'], sources: [] },
  { id: 'rfx_tm_cash_withdraw_after_inbound', typology: 'velocity_pass_through', indicator: 'Cash withdrawal immediately following large inbound wire (< 24 hours).', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_cash_aggregated_subaccounts', typology: 'structuring', indicator: 'Cash deposits aggregated across cards / sub-accounts of a single UBO.', severity: 'medium', reasoningModes: ['structuring_pattern', 'entity_resolution'], sources: [] },

  // — Velocity & pass-through (10)
  { id: 'rfx_tm_same_day_in_out_thin_margin', typology: 'velocity_pass_through', indicator: 'Same-day cross-border inbound + outbound with thin margin (pass-through).', severity: 'high', reasoningModes: ['velocity_analysis', 'chain_analysis'], sources: ['FATF'] },
  { id: 'rfx_tm_wire_reroute_under_1h', typology: 'velocity_pass_through', indicator: 'Wire received and immediately re-routed within one hour.', severity: 'high', reasoningModes: ['velocity_analysis'], sources: [] },
  { id: 'rfx_tm_round_amount_no_rationale', typology: 'velocity_pass_through', indicator: 'Round-number transfers (USD 10k / 50k / 100k) with no commercial rationale.', severity: 'medium', reasoningModes: ['velocity_analysis', 'narrative_coherence'], sources: [] },
  { id: 'rfx_tm_round_trip_minutes', typology: 'velocity_pass_through', indicator: 'Round-trip transfer A → B → A within minutes.', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_multi_leg_passthrough', typology: 'velocity_pass_through', indicator: 'Multi-leg pass-through across ≥ 3 intermediary banks where direct route exists.', severity: 'high', reasoningModes: ['chain_analysis', 'jurisdiction_cascade'], sources: [] },
  { id: 'rfx_tm_funnel_inflow_outflow', typology: 'funnel_account', indicator: 'Funnel pattern: ≥ 50 small inflows from unrelated parties → 1–2 large outflows.', severity: 'high', reasoningModes: ['velocity_analysis', 'community_detection'], sources: [] },
  { id: 'rfx_tm_reverse_funnel_to_mules', typology: 'funnel_account', indicator: 'Reverse-funnel: one large inbound → many small outflows to apparent mule cluster.', severity: 'high', reasoningModes: ['community_detection', 'link_analysis'], sources: [] },
  { id: 'rfx_tm_dormant_reactivated_500k', typology: 'velocity_pass_through', indicator: 'Dormant account reactivated then receives large inbound > AED 500k.', severity: 'high', reasoningModes: ['dormant_account_signal', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_first_tx_100k_xborder', typology: 'velocity_pass_through', indicator: 'New account whose first transaction is > USD 100k cross-border.', severity: 'high', reasoningModes: ['velocity_analysis', 'jurisdiction_cascade'], sources: [] },
  { id: 'rfx_tm_turnover_exceeds_income_3x', typology: 'velocity_pass_through', indicator: 'Account turnover materially exceeds declared income (≥ 3× declared).', severity: 'high', reasoningModes: ['regression', 'reconciliation'], sources: ['Wolfsberg'] },

  // — Geography / corridor (8)
  { id: 'rfx_tm_cahra_no_rationale', typology: 'geographic_corridor', indicator: 'Wire to or from a CAHRA jurisdiction without documented business rationale.', severity: 'high', reasoningModes: ['jurisdiction_cascade'], sources: ['OECD DDG', 'EU CAHRA list'] },
  { id: 'rfx_tm_shell_jurisdiction_counterparty', typology: 'geographic_corridor', indicator: 'Counterparty in non-resident shell jurisdiction with no evidence of trade.', severity: 'high', reasoningModes: ['jurisdiction_cascade', 'entity_resolution'], sources: ['FATF R.24'] },
  { id: 'rfx_tm_currency_invoice_mismatch', typology: 'geographic_corridor', indicator: 'Settlement currency differs from invoice currency without FX rationale.', severity: 'medium', reasoningModes: ['tbml_overlay', 'reconciliation'], sources: [] },
  { id: 'rfx_tm_routing_via_nesting_hub', typology: 'geographic_corridor', indicator: 'Routing through a known correspondent-banking nesting hub.', severity: 'high', reasoningModes: ['correspondent_nesting', 'jurisdiction_cascade'], sources: ['FATF R.13'] },
  { id: 'rfx_tm_high_risk_transit_contradicts_origin', typology: 'geographic_corridor', indicator: 'Transit through high-risk country contradicts declared origin in trade documents.', severity: 'high', reasoningModes: ['provenance_trace', 'jurisdiction_cascade'], sources: [] },
  { id: 'rfx_tm_unnecessary_intermediaries', typology: 'geographic_corridor', indicator: 'Use of multiple intermediary banks where direct correspondent exists.', severity: 'medium', reasoningModes: ['correspondent_nesting', 'narrative_coherence'], sources: [] },
  { id: 'rfx_tm_atm_geo_dispersion_same_day', typology: 'geographic_corridor', indicator: 'ATM withdrawals across geographically dispersed countries on the same day.', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_holiday_silence_surge', typology: 'timing_calendar', indicator: 'Velocity surge during known holiday or regulator-silence windows.', severity: 'medium', reasoningModes: ['pattern_of_life', 'velocity_analysis'], sources: [] },

  // — Counterparty & screening evasion (8)
  { id: 'rfx_tm_counterparty_rotation', typology: 'screening_evasion', indicator: 'Counterparty rotates across many of customer\'s transactions with no stable trading relationship.', severity: 'medium', reasoningModes: ['community_detection', 'entity_resolution'], sources: [] },
  { id: 'rfx_tm_beneficiary_name_variant_screen_evade', typology: 'screening_evasion', indicator: 'Beneficiary uses name variant deliberately spelled to defeat screening.', severity: 'high', reasoningModes: ['entity_resolution'], sources: ['FATF R.6'] },
  { id: 'rfx_tm_originator_diacritic_evasion', typology: 'screening_evasion', indicator: 'Originator name structured (whitespace, diacritics, transliteration) to bypass spell-match list.', severity: 'high', reasoningModes: ['entity_resolution'], sources: ['OFAC compliance guidance'] },
  { id: 'rfx_tm_wire_stripping_detected', typology: 'screening_evasion', indicator: 'Wire-stripping detected — originator / beneficiary fields removed downstream.', severity: 'high', reasoningModes: ['completeness_audit', 'sanctions_regime_matrix'], sources: ['FATF INR.16'] },
  { id: 'rfx_tm_repeat_counterparty_entity_confusion', typology: 'screening_evasion', indicator: 'Repeat counterparty under different entity-name variations (entity confusion).', severity: 'medium', reasoningModes: ['entity_resolution'], sources: [] },
  { id: 'rfx_tm_post_designation_tx', typology: 'screening_evasion', indicator: 'Beneficiary recently designated on a watchlist after the trade.', severity: 'high', reasoningModes: ['sanctions_regime_matrix', 'timeline_reconstruction'], sources: [] },
  { id: 'rfx_tm_within_2_hops_sanctioned_cluster', typology: 'screening_evasion', indicator: 'Counterparty within 2 hops of sanctioned wallet or account cluster.', severity: 'high', reasoningModes: ['chain_analysis', 'community_detection', 'sanctions_regime_matrix'], sources: ['OFAC'] },
  { id: 'rfx_tm_post_listing_spike', typology: 'timing_calendar', indicator: 'Same-amount transfers spike around watchlist-publication date.', severity: 'high', reasoningModes: ['timeline_reconstruction', 'velocity_analysis'], sources: [] },

  // — Trade & TBML overlay (6)
  { id: 'rfx_tm_invoice_hs_outlier', typology: 'tbml', indicator: 'Invoice unit-price outlier vs HS-code global benchmark (over- or under-invoice).', severity: 'high', reasoningModes: ['commodity_price_anomaly', 'regression', 'tbml_over_invoicing'], sources: ['FATF TBML'] },
  { id: 'rfx_tm_phantom_shipment', typology: 'tbml', indicator: 'Phantom-shipment indicator: payment with no corresponding goods movement.', severity: 'high', reasoningModes: ['tbml_phantom_shipment', 'provenance_trace'], sources: ['FATF TBML'] },
  { id: 'rfx_tm_inventory_cash_mismatch', typology: 'tbml', indicator: 'Inventory turnover incompatible with cash-deposit volume.', severity: 'medium', reasoningModes: ['reconciliation'], sources: [] },
  { id: 'rfx_tm_mirror_trade_gap', typology: 'tbml', indicator: 'Mirror-trade gap — country-A export stats ≠ country-B import stats for same shipment.', severity: 'high', reasoningModes: ['source_triangulation', 'tbml_overlay'], sources: ['FATF TBML Report'] },
  { id: 'rfx_tm_back_to_back_lc_no_inspection', typology: 'tbml', indicator: 'Back-to-back letter of credit where intermediary bank does not take ownership or inspect goods.', severity: 'high', reasoningModes: ['ucp600_discipline', 'tbml_over_invoicing'], sources: ['ICC UCP 600'] },
  { id: 'rfx_tm_mixed_container_hs_inconsistent', typology: 'tbml', indicator: 'Mixed-goods container declared inconsistently with HS codes & declared value.', severity: 'medium', reasoningModes: ['tbml_phantom_shipment', 'provenance_trace'], sources: [] },

  // — VASP / crypto (6)
  { id: 'rfx_tm_travel_rule_data_missing', typology: 'vasp', indicator: 'Travel-Rule originator / beneficiary data missing on VASP transfer ≥ USD 1k threshold.', severity: 'high', reasoningModes: ['vasp_travel_rule', 'completeness_audit'], sources: ['FATF INR.16'] },
  { id: 'rfx_tm_chain_hopping_4_protocols_48h', typology: 'vasp', indicator: 'On-ramp followed by chain-hopping across ≥ 4 protocols within 48 hours.', severity: 'high', reasoningModes: ['chain_analysis', 'taint_propagation'], sources: [] },
  { id: 'rfx_tm_bridge_then_stablecoin_offramp', typology: 'vasp', indicator: 'Bridge use followed by rapid stablecoin off-ramp to fiat.', severity: 'high', reasoningModes: ['bridge_crossing_trace', 'chain_analysis'], sources: [] },
  { id: 'rfx_tm_inbound_privacy_mixer', typology: 'vasp', indicator: 'Inbound from a privacy-mixer cluster (Tornado-class, Wasabi CoinJoin).', severity: 'high', reasoningModes: ['chain_analysis', 'privacy_coin_reasoning'], sources: ['OFAC Tornado Cash designation'] },
  { id: 'rfx_tm_nft_same_ubo_escalating', typology: 'vasp', indicator: 'NFT bought / sold between wallets controlled by same UBO at escalating prices.', severity: 'high', reasoningModes: ['nft_wash', 'wash_trade', 'entity_resolution'], sources: [] },
  { id: 'rfx_tm_unrevoked_token_approvals', typology: 'vasp', indicator: 'Wallet holds many unrevoked token approvals to unrelated contracts.', severity: 'medium', reasoningModes: ['token_approval_audit'], sources: [] },

  // — Channel & instrument (6)
  { id: 'rfx_tm_high_risk_mcc_card', typology: 'channel_instrument', indicator: 'Card payments to high-risk MCCs (5993 / 5933 / 7995) inconsistent with profile.', severity: 'medium', reasoningModes: ['pattern_of_life', 'narrative_coherence'], sources: [] },
  { id: 'rfx_tm_card_not_present_testing', typology: 'channel_instrument', indicator: 'Card-not-present testing — many small declines followed by an approval.', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_p2p_fx_no_relationship', typology: 'channel_instrument', indicator: 'P2P FX-app transfers with no apparent counterparty relationship.', severity: 'medium', reasoningModes: ['link_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_insurance_premium_third_party_cash', typology: 'insurance_wrap', indicator: 'Insurance premium paid in cash from an unrelated third-party source.', severity: 'high', reasoningModes: ['ins_premium_overfund', 'source_triangulation'], sources: [] },
  { id: 'rfx_tm_insurance_surrender_diff_account', typology: 'insurance_wrap', indicator: 'Insurance early-surrender refund directed to a different account from premium source.', severity: 'high', reasoningModes: ['ins_early_surrender_cash', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_loan_disbursed_then_offshore', typology: 'channel_instrument', indicator: 'Loan disbursement immediately wired offshore in full.', severity: 'high', reasoningModes: ['velocity_analysis', 'jurisdiction_cascade'], sources: [] },

  // — Calendar / timing / behavioural (4)
  { id: 'rfx_tm_concurrent_unrelated_salaries', typology: 'timing_calendar', indicator: 'Salary credits arrive concurrently from unrelated employers.', severity: 'medium', reasoningModes: ['source_triangulation', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_govt_benefit_immediate_outflow', typology: 'timing_calendar', indicator: 'Government-benefit credit immediately and fully withdrawn or transferred.', severity: 'medium', reasoningModes: ['velocity_analysis', 'pattern_of_life'], sources: [] },
  { id: 'rfx_tm_off_hours_pattern', typology: 'timing_calendar', indicator: 'Recurring transactions outside customer\'s normal time-of-day pattern.', severity: 'low', reasoningModes: ['pattern_of_life'], sources: [] },
  { id: 'rfx_tm_post_announcement_spike', typology: 'timing_calendar', indicator: 'Spike in activity in the 24 hours after a sanctions or regulatory announcement.', severity: 'high', reasoningModes: ['timeline_reconstruction', 'velocity_analysis'], sources: [] },
];
