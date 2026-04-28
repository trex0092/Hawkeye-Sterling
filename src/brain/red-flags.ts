// Hawkeye Sterling — structured red-flag catalogue.
// Red flags are FACTUAL INDICATORS, not legal conclusions (per P3 of the
// compliance charter). Each flag binds to the typology it indicates, the
// reasoning modes that detect it, and a severity (low | medium | high).
// The brain cites red flags by id in its findings; the UI groups them by
// typology for the MLRO.

export type RedFlagSeverity = 'low' | 'medium' | 'high';

export interface RedFlag {
  id: string;
  typology: string;
  indicator: string;
  severity: RedFlagSeverity;
  reasoningModes: string[];
  sources: string[];
}

export const RED_FLAGS: RedFlag[] = [
  // — Structuring / smurfing
  { id: 'rf_structuring_threshold', typology: 'structuring', indicator: 'Multiple cash deposits immediately below the reporting threshold.', severity: 'high', reasoningModes: ['velocity_analysis', 'spike_detection', 'peer_group_anomaly'], sources: ['FATF RBA', 'UAE FIU typology catalogue'] },
  { id: 'rf_structuring_branches', typology: 'structuring', indicator: 'Same customer depositing across multiple branches on the same day.', severity: 'high', reasoningModes: ['pattern_of_life', 'link_analysis'], sources: ['Wolfsberg FAQ'] },

  // — DPMS / precious metals
  { id: 'rf_dpms_cash_walk_in', typology: 'dpms_retail', indicator: 'Walk-in buyer pays for high-value gold in cash with no relationship history.', severity: 'high', reasoningModes: ['dpms_retail_threshold', 'cash_courier_ctn'], sources: ['MoE DNFBP circular', 'LBMA RGG'] },
  { id: 'rf_dpms_no_receipt', typology: 'dpms_retail', indicator: 'Customer declines receipt or requests anonymous transaction.', severity: 'high', reasoningModes: ['documentation_quality', 'source_credibility'], sources: ['MoE DNFBP'] },
  { id: 'rf_dpms_refiner_cahra', typology: 'dpms_refinery', indicator: 'Doré/scrap origin in conflict-affected or high-risk area without OECD-annex-II documentation.', severity: 'high', reasoningModes: ['oecd_ddg_annex', 'provenance_trace', 'lineage'], sources: ['LBMA RGG', 'OECD DDG'] },

  // — Trade-based money laundering
  { id: 'rf_tbml_over_invoice', typology: 'tbml', indicator: 'Invoice value materially above market rate for goods described.', severity: 'high', reasoningModes: ['tbml_over_invoicing', 'regression', 'peer_benchmark'], sources: ['FATF TBML report'] },
  { id: 'rf_tbml_phantom_shipment', typology: 'tbml', indicator: 'Shipping documents inconsistent with vessel AIS tracks or absent entirely.', severity: 'high', reasoningModes: ['tbml_phantom_shipment', 'sanctions_maritime_stss', 'timeline_reconstruction'], sources: ['FATF', 'OFAC maritime advisory'] },
  { id: 'rf_tbml_ucp600_gap', typology: 'tbml', indicator: 'LC discrepancies waived repeatedly under UCP 600 without documented rationale.', severity: 'medium', reasoningModes: ['ucp600_discipline', 'exception_log', 'documentation_quality'], sources: ['ICC UCP 600'] },

  // — Sanctions evasion / proliferation
  { id: 'rf_sanc_shell_chain', typology: 'sanctions_evasion', indicator: 'Counterparty is a newly-formed shell with nominee directors in opaque jurisdictions.', severity: 'high', reasoningModes: ['ubo_nominee_directors', 'jurisdiction_cascade', 'entity_resolution'], sources: ['OFAC', 'UK OFSI'] },
  { id: 'rf_sanc_dual_use', typology: 'proliferation', indicator: 'Dual-use goods shipped to end-user in proliferation-sensitive jurisdiction.', severity: 'high', reasoningModes: ['pf_dual_use_controls', 'sanctions_regime_matrix', 'attack_tree'], sources: ['UN 1540', 'EU dual-use regulation'] },
  { id: 'rf_sanc_stss', typology: 'sanctions_evasion', indicator: 'Vessel performs ship-to-ship transfer outside established port with AIS gap.', severity: 'high', reasoningModes: ['sanctions_maritime_stss', 'velocity_analysis'], sources: ['OFAC maritime', 'UK OFSI'] },

  // — PEP
  { id: 'rf_pep_wealth_mismatch', typology: 'pep', indicator: 'Declared source of wealth inconsistent with known public salary.', severity: 'high', reasoningModes: ['source_triangulation', 'narrative_coherence', 'regression'], sources: ['Wolfsberg FAQ', 'FATF R.12'] },
  { id: 'rf_pep_family_nominee', typology: 'pep', indicator: 'Accounts opened in names of PEP family members shortly after appointment.', severity: 'medium', reasoningModes: ['pep_domestic_minister', 'link_analysis', 'timeline_reconstruction'], sources: ['FATF R.12'] },

  // — UBO / corporate opacity
  { id: 'rf_ubo_bearer_shares', typology: 'ubo', indicator: 'Beneficial ownership obscured by bearer shares or multi-layered holding.', severity: 'high', reasoningModes: ['ubo_bearer_shares', 'ubo_tree_walk', 'jurisdiction_cascade'], sources: ['FATF R.24', 'Wolfsberg'] },
  { id: 'rf_ubo_common_address', typology: 'ubo', indicator: 'Multiple apparently unrelated entities share the same registered address or agent.', severity: 'medium', reasoningModes: ['entity_resolution', 'community_detection'], sources: ['Open Corporates typology'] },

  // — VASP / crypto
  { id: 'rf_vasp_mixer', typology: 'vasp', indicator: 'Inbound funds sourced from a known mixer or privacy protocol address.', severity: 'high', reasoningModes: ['vasp_mixer_inbound' as string, 'privacy_coin_reasoning', 'chain_analysis'], sources: ['FATF VASP guidance'] },
  { id: 'rf_vasp_travel_rule_gap', typology: 'vasp', indicator: 'Transfer above threshold missing originator/beneficiary data (Travel Rule).', severity: 'high', reasoningModes: ['vasp_travel_rule', 'completeness_audit'], sources: ['FATF R.16'] },

  // — Adverse media / conduct
  { id: 'rf_am_ongoing_investigation', typology: 'adverse_media', indicator: 'Counterparty named in credible, recent ongoing investigation.', severity: 'medium', reasoningModes: ['source_triangulation', 'freshness_check', 'source_credibility'], sources: ['news APIs', 'regulator press releases'] },

  // — Governance / controls
  { id: 'rf_ctl_four_eyes_bypass', typology: 'governance', indicator: 'Second approver role repeatedly overridden by same user.', severity: 'high', reasoningModes: ['four_eyes_stress', 'policy_drift', 'exception_log'], sources: ['CR 134/2025 Art.19', 'Three Lines Model'] },
  { id: 'rf_ctl_training_gap', typology: 'governance', indicator: 'AML training overdue for users handling high-risk disposition.', severity: 'medium', reasoningModes: ['training_inadequacy', 'documentation_quality'], sources: ['FATF R.18'] },
  { id: 'rf_ctl_record_gap', typology: 'governance', indicator: 'Screening evidence missing for a disposition already recorded.', severity: 'high', reasoningModes: ['retention_audit', 'audit_trail_reconstruction', 'reconciliation'], sources: ['FDL 10/2025 Art.24'] },

  // ── Wave 4 — environmental crime (FATF 2021 predicate) ──────────────
  { id: 'rf_env_crime_cahra_flow', typology: 'environmental_crime', indicator: 'Commodity flows linked to CAHRA supply chain without OECD / provenance evidence of legal extraction.', severity: 'high', reasoningModes: ['oecd_ddg_annex', 'provenance_trace', 'jurisdiction_cascade'], sources: ['FATF R.3 (2021)', 'OECD DDG'] },
  { id: 'rf_env_crime_waste_trafficking', typology: 'environmental_crime', indicator: 'Cross-border waste shipment without Basel Convention notification or with false HS-code classification.', severity: 'high', reasoningModes: ['provenance_trace', 'commodity_price_anomaly'], sources: ['Basel Convention', 'FATF R.3'] },

  // ── Wave 4 — carbon-market fraud ────────────────────────────────────
  { id: 'rf_carbon_market_phantom_credit', typology: 'carbon_market_fraud', indicator: 'Carbon credits issued against a project with no verifiable baseline or with a registry-registration gap.', severity: 'high', reasoningModes: ['provenance_trace', 'source_triangulation'], sources: ['ICVCM Core Carbon Principles'] },
  { id: 'rf_carbon_market_double_count', typology: 'carbon_market_fraud', indicator: 'Same tonne of emissions claimed under more than one corresponding-adjustment ledger or retirement registry.', severity: 'high', reasoningModes: ['reconciliation', 'provenance_trace'], sources: ['Article 6 Paris Agreement'] },

  // ── Wave 4 — insider threat / IP exfiltration ───────────────────────
  { id: 'rf_insider_threat_privileged_exfil', typology: 'insider_threat', indicator: 'Privileged user downloads or exports data volume materially above role-profile baseline in short window.', severity: 'high', reasoningModes: ['velocity_analysis', 'peer_group_anomaly', 'timeline_reconstruction'], sources: ['Three Lines Model'] },
  { id: 'rf_insider_threat_offboarding_spike', typology: 'insider_threat', indicator: 'Material access, print, or external-drive activity in the 30 days preceding announced resignation or role change.', severity: 'high', reasoningModes: ['timeline_reconstruction', 'pattern_of_life'], sources: [] },

  // ── Wave 4 — AI governance breach (EU AI Act / NIST / ISO 42001) ────
  { id: 'rf_ai_gov_no_model_inventory', typology: 'ai_governance_breach', indicator: 'AI system in production not recorded in the AI registry / model inventory required by ISO/IEC 42001.', severity: 'high', reasoningModes: ['retention_audit', 'documentation_quality'], sources: ['ISO/IEC 42001', 'EU AI Act Art.11'] },
  { id: 'rf_ai_gov_high_risk_tier_skipped', typology: 'ai_governance_breach', indicator: 'AI use-case fits a high-risk tier (hiring, credit, health, education, law-enforcement) yet no EU AI Act conformity assessment has been executed.', severity: 'high', reasoningModes: ['regulatory_mapping', 'control_effectiveness'], sources: ['EU AI Act Annex III'] },
  { id: 'rf_ai_gov_red_team_absent', typology: 'ai_governance_breach', indicator: 'High-risk AI system deployed without pre- and post-deployment red-team evidence (OWASP LLM Top 10).', severity: 'medium', reasoningModes: ['attack_tree', 'control_effectiveness'], sources: ['OWASP LLM Top 10', 'EU AI Act'] },
  { id: 'rf_ai_gov_no_kill_switch', typology: 'ai_governance_breach', indicator: 'Agentic AI acting on irreversible actions without documented kill-switch, approval-gate, or human-in-the-loop control.', severity: 'high', reasoningModes: ['control_effectiveness', 'four_eyes_stress'], sources: ['EU AI Act', 'NIST AI RMF'] },

  // ── Wave 4 — AI synthetic-media fraud ───────────────────────────────
  { id: 'rf_ai_synthetic_ceo_deepfake', typology: 'ai_synthetic_media_fraud', indicator: 'Payment or policy instruction apparently authorised via live video/voice call matching the profile of a known deepfake CEO-fraud pattern.', severity: 'high', reasoningModes: ['linguistic_forensics', 'pattern_of_life', 'timeline_reconstruction'], sources: [] },
  { id: 'rf_ai_synthetic_kyc_bypass', typology: 'ai_synthetic_media_fraud', indicator: 'Onboarding liveness / biometric check shows indicators of face-swap, liveness spoof, or AI-generated document.', severity: 'high', reasoningModes: ['linguistic_forensics', 'entity_resolution'], sources: [] },

  // ── Wave 6 — crypto on-/off-ramp obfuscation ────────────────────────
  { id: 'rf_crypto_onramp_card_to_mixer', typology: 'crypto_onramp_obfuscation', indicator: 'Card-funded crypto purchase on a centralised exchange followed within minutes by withdrawal to a private wallet that subsequently routes through a mixer or chain-hop.', severity: 'high', reasoningModes: ['chain_analysis', 'taint_propagation', 'velocity_analysis'], sources: ['FATF VASP guidance', 'Chainalysis crypto crime report'] },
  { id: 'rf_crypto_offramp_otc_cash', typology: 'crypto_onramp_obfuscation', indicator: 'Privacy-coin or mixer-tainted crypto sold via unlicensed P2P / OTC desk for fiat cash with no Travel-Rule data and no KYC linkage to the originator.', severity: 'high', reasoningModes: ['vasp_travel_rule', 'chain_analysis', 'jurisdiction_cascade'], sources: ['FATF R.16', 'FATF VASP guidance'] },

  // ── Wave 6 — NPO diversion (terrorism financing predicate) ──────────
  { id: 'rf_npo_field_office_cash_payouts', typology: 'npo_diversion', indicator: 'Charity field office in a conflict-affected area issues large cash payouts with no beneficiary register or with beneficiaries that cannot be independently verified.', severity: 'high', reasoningModes: ['source_triangulation', 'jurisdiction_cascade', 'documentation_quality'], sources: ['FATF R.8', 'UN 1267 / 1373'] },
  { id: 'rf_npo_donor_chain_circular', typology: 'npo_diversion', indicator: 'Inbound donations originate from related parties or shell entities and the funds flow back as field-office expenses to the same beneficial network — a circular donor chain.', severity: 'high', reasoningModes: ['link_analysis', 'community_detection', 'reconciliation'], sources: ['FATF R.8'] },

  // ── Wave 6 — shell-layering / sanctions evasion ─────────────────────
  { id: 'rf_shell_director_overlap', typology: 'shell_company_chain', indicator: 'The same nominee director, registered agent, or company-formation service appears across more than five shell entities active simultaneously, several of which are counterparties to one another.', severity: 'high', reasoningModes: ['entity_resolution', 'community_detection', 'ubo_nominee_directors'], sources: ['FATF R.24', 'OpenCorporates typology'] },
  { id: 'rf_shell_back_to_back', typology: 'shell_company_chain', indicator: 'Loan, supply, or service contract between two related shell entities with offsetting terms and no apparent operational substance — classic back-to-back layering.', severity: 'high', reasoningModes: ['reconciliation', 'narrative_coherence', 'ubo_tree_walk'], sources: ['Wolfsberg FAQ', 'FATF RBA'] },

  // ── Wave 6 — bearer-share / free-zone loophole ──────────────────────
  { id: 'rf_bearer_share_fz_holding', typology: 'bearer_share_fz_loophole', indicator: 'UAE / GCC free-zone holding entity registered with bearer-share equivalent or undisclosed beneficial owner not refreshed against the local UBO register.', severity: 'high', reasoningModes: ['ubo_bearer_shares', 'ubo_tree_walk', 'jurisdiction_cascade'], sources: ['UAE FDL 20/2018', 'FATF R.24'] },
  { id: 'rf_fz_no_substance', typology: 'bearer_share_fz_loophole', indicator: 'Free-zone licensee with mailbox-only office, zero employees, and no demonstrable economic activity yet invoicing mainland operations or third-country counterparties at material volume.', severity: 'high', reasoningModes: ['kyb_strict', 'narrative_coherence', 'reconciliation'], sources: ['UAE Cabinet Resolution 31/2019 — Economic Substance', 'FATF R.24'] },

  // ── Wave 6 — TBML invoice anomalies ─────────────────────────────────
  { id: 'rf_tbml_round_trip', typology: 'tbml', indicator: 'Same goods or HS-code class invoiced multiple times between related parties across jurisdictions within a short window — carousel / round-trip pattern.', severity: 'high', reasoningModes: ['tbml_overlay', 'tbml_over_invoicing', 'reconciliation', 'community_detection'], sources: ['FATF TBML report', 'WCO carousel-fraud typology'] },
  { id: 'rf_tbml_unit_price_outlier', typology: 'tbml', indicator: 'Per-unit declared price diverges by more than three standard deviations from peer-benchmark shipments of the same HS-code in the same month.', severity: 'medium', reasoningModes: ['regression', 'peer_benchmark', 'commodity_price_anomaly'], sources: ['FATF TBML report'] },

  // ── Wave 6 — synthetic identity / mule funnel ───────────────────────
  { id: 'rf_synthetic_id_thin_file', typology: 'synthetic_identity', indicator: 'Identity record presents as adult yet credit / utility / address footprint is under 90 days and shows no historical address change — characteristic synthetic-identity pattern.', severity: 'high', reasoningModes: ['synthetic_id', 'entity_resolution', 'pattern_of_life'], sources: ['FRB synthetic-identity toolkit'] },
  { id: 'rf_funnel_rapid_disburse', typology: 'funnel_account', indicator: 'Account aggregates ten or more inbound transfers from unrelated payers and disburses more than 90% of the consolidated balance within 24 hours to third-party accounts.', severity: 'high', reasoningModes: ['velocity_analysis', 'pattern_of_life', 'spike_detection'], sources: ['FATF mule-network typology'] },
];

export const RED_FLAGS_BY_TYPOLOGY: Record<string, RedFlag[]> = RED_FLAGS.reduce(
  (acc, rf) => {
    (acc[rf.typology] ||= []).push(rf);
    return acc;
  },
  {} as Record<string, RedFlag[]>,
);

export const RED_FLAG_BY_ID: Map<string, RedFlag> = new Map(
  RED_FLAGS.map((rf) => [rf.id, rf]),
);
