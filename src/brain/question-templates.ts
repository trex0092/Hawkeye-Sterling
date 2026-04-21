// Hawkeye Sterling — question-template registry.
// Templates bind a compliance domain to a prepared investigative questionnaire
// and the reasoning modes that should run when the template fires.
// The user supplied ~35 template IDs across two waves; architecture is designed
// to reach the full 200-template goal additively.

import type { QuestionTemplate } from './types.js';

const t = (
  id: string,
  domain: string,
  title: string,
  questions: string[],
  reasoningModes: string[],
): QuestionTemplate => ({ id, domain, title, questions, reasoningModes });

export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  // ─── WAVE 1 ─────────────────────────────────────────────────────────
  t('cdd_prospect_individual', 'cdd', 'CDD — Prospect (Individual)', [
    'Full legal name, aliases, DOB, nationality, residency, ID verification basis?',
    'Occupation, employer, declared source of funds, expected activity volume?',
    'Screening result vs UN/OFAC/EU/UK/UAE/EOCN lists, PEP, adverse media?',
    'Risk rating and rationale, approver, review cadence?',
  ], ['list_walk','kyb_strict','risk_based_approach','jurisdiction_cascade','sanctions_regime_matrix']),

  t('cdd_prospect_entity', 'cdd', 'CDD — Prospect (Entity)', [
    'Legal form, incorporation jurisdiction, registered office, trade licence status?',
    'Directors, shareholders, UBOs (≥25% or effective control)?',
    'Nature of business, customer/supplier geography, counterparties?',
    'Sanctions/PEP/adverse screening across all related parties?',
  ], ['ubo_tree_walk','list_walk','kyb_strict','jurisdiction_cascade','entity_resolution']),

  t('edd_sow_scope', 'edd', 'EDD — Source-of-Wealth Scope', [
    'Documented SoW vs declared SoF — consistent with profile?',
    'Corroborating documents: tax returns, business accounts, bank statements, deeds?',
    'Independent valuation of assets claimed?',
    'Outstanding gaps and resolution plan?',
  ], ['source_triangulation','provenance_trace','lineage','narrative_coherence','data_quality_score']),

  t('sanc_partial_match_decision', 'sanctions', 'Sanctions — Partial-Match Decision', [
    'Match score, algorithm (Levenshtein / Jaro-Winkler / Metaphone)?',
    'DOB / nationality / identifier alignment?',
    'Secondary attributes: listing reason, program, source date?',
    'Discounting rationale documented and approved?',
  ], ['list_walk','entity_resolution','fuzzy_logic','burden_of_proof','triangulation']),

  t('ubo_25_threshold', 'ubo', 'UBO — 25% Threshold', [
    'Direct and indirect holdings ≥25% at each layer?',
    'Aggregation of connected holdings via family / nominees?',
    'Bearer / no-par / dual-class impact on beneficial ownership?',
  ], ['ubo_tree_walk','jurisdiction_cascade','article_by_article']),

  t('ubo_effective_control', 'ubo', 'UBO — Effective Control (non-shareholding)', [
    'Voting rights, vetoes, senior-management appointment rights?',
    'Contractual / debt / pledge arrangements conferring control?',
    'De-facto controllers identified where legal chain is opaque?',
  ], ['ubo_tree_walk','link_analysis','evidence_graph','causal_inference']),

  t('ubo_nominee_directors', 'ubo', 'UBO — Nominee Directors', [
    'Who stands behind the nominee, per declaration and evidence?',
    'Professional / serial-nominee patterns?',
    'Any regulatory restrictions on nominee use in the jurisdiction?',
  ], ['ubo_tree_walk','link_analysis','peer_group_anomaly']),

  t('ubo_bearer_shares', 'ubo', 'UBO — Bearer Shares', [
    'Are bearer shares permitted in the jurisdiction; if grandfathered, registry?',
    'Current physical custody of certificates?',
    'Mitigation: immobilisation, conversion, disclosure requirement?',
  ], ['ubo_tree_walk','jurisdiction_cascade','article_by_article']),

  t('dpms_retail_threshold', 'dpms', 'DPMS — Retail Threshold', [
    'Single/linked transaction vs AED 55,000 cash threshold?',
    'Customer profile vs purchase amount reasonable?',
    'KYC completed before settlement?',
  ], ['kpi_dpms_thirty','risk_based_approach','velocity_analysis']),

  t('dpms_refiner_cahra', 'dpms', 'DPMS — Refiner CAHRA Diligence', [
    'LBMA RGG five-step applied; OECD DDG Annex II walk completed?',
    'Origin, chain-of-custody, red-flag typologies considered?',
    'Independent audit and remediation plan on findings?',
  ], ['lbma_rgg_five_step','oecd_ddg_annex','typology_catalogue','source_triangulation']),

  t('vasp_wallet_screen', 'vasp', 'VASP — Wallet Screening', [
    'On-chain risk score of wallet; exposure to sanctioned / mixer / darknet sources?',
    'Travel-rule originator/beneficiary info available?',
    'Custody model (MPC / multisig / single-key) and attestations?',
  ], ['chain_analysis','taint_propagation','list_walk','bridge_risk']),

  t('vasp_travel_rule', 'vasp', 'VASP — Travel Rule', [
    'Threshold jurisdictional applicability (e.g. ≥ USD 1,000)?',
    'Counter-VASP identified and reachable?',
    'Data-exchange protocol (IVMS 101 / TRUST / TRISA / Sumsub)?',
  ], ['chain_analysis','article_by_article','jurisdiction_cascade']),

  t('tbml_over_invoicing', 'tbml', 'TBML — Over-Invoicing', [
    'Unit price vs fair market range, transport-adjusted?',
    'Invoice ↔ bill-of-lading ↔ customs declaration consistency?',
    'Counterparty and freight-forwarder profile?',
  ], ['tbml_overlay','ucp600_discipline','source_triangulation','reconciliation']),

  t('tbml_phantom_shipment', 'tbml', 'TBML — Phantom Shipment', [
    'Physical shipment evidence (AIS, container tracking, port logs)?',
    'Insurance cover, freight forwarder documented?',
    'Third-country discharge or reconsignment?',
  ], ['tbml_overlay','sanctions_maritime_stss','timeline_reconstruction']),

  t('gov_policy_gap', 'gov', 'Governance — Policy Gap', [
    'Every control traced to a regulatory citation?',
    'Untraceable controls justified as best practice?',
    'Gaps logged, owned, time-bound?',
  ], ['regulatory_mapping','policy_drift','exception_log','documentation_quality']),

  t('filing_str_narrative', 'mlro', 'Filing — STR Narrative', [
    'Who / what / when / where / why / how covered?',
    'Typology and reason-for-suspicion clearly stated?',
    'Underlying records attached / referenced?',
  ], ['typology_catalogue','narrative_coherence','audit_trail_reconstruction']),

  t('incident_24h_freeze', 'incident', 'Incident — 24h Freeze', [
    'Clock started at detection; decision-maker identified?',
    'Freeze scope (account, party, related parties) documented?',
    'Regulator notification window met?',
  ], ['escalation_trigger','sla_check','audit_trail_reconstruction']),

  t('pf_dual_use_controls', 'pf', 'Proliferation Financing — Dual-Use', [
    'End-user / end-use screening and declaration?',
    'Goods on UN/EU/UK/US dual-use lists?',
    'Diversion risk (transshipment, free-zone, broker layers)?',
  ], ['list_walk','sanctions_regime_matrix','kill_chain','typology_catalogue']),

  t('cash_courier_ctn', 'cash', 'Cash Courier — CTN / Declaration', [
    'Declaration made at the threshold crossing?',
    'Source, purpose, ultimate beneficiary?',
    'Link to any known courier / smuggling typology?',
  ], ['typology_catalogue','jurisdiction_cascade','timeline_reconstruction']),

  // ─── WAVE 2 ─────────────────────────────────────────────────────────
  t('tf_lc_ucp600', 'tf', 'Trade Finance — LC / UCP600', [
    'Documents compliant on face under UCP600 Articles?',
    'Goods, price, quantity, shipment dates plausible?',
    'Issuing / advising / confirming / nominated bank roles and jurisdictions?',
  ], ['ucp600_discipline','tbml_overlay','article_by_article','reconciliation']),

  t('tf_standby_lc', 'tf', 'Trade Finance — Standby LC', [
    'Underlying obligation clearly identified?',
    'Draw condition objective vs subjective?',
    'Counter-guarantee / chain of SBLCs?',
  ], ['ucp600_discipline','evidence_graph','link_analysis']),

  t('re_cash_purchase', 're', 'Real Estate — Cash Purchase', [
    'Source of funds documented; layered flows traced?',
    'Buyer profile vs property value?',
    'Developer / broker / lawyer roles and fees?',
  ], ['real_estate_cash','source_triangulation','provenance_trace']),

  t('re_goldenvisa_invest', 're', 'Real Estate — Golden-Visa Investment', [
    'Minimum-investment threshold actually met post-all-fees?',
    'Investor UBO and SoW?',
    'Post-grant residency behaviour consistent with intent?',
  ], ['real_estate_cash','jurisdiction_cascade','ubo_tree_walk']),

  t('ins_life_surrender', 'ins', 'Insurance — Life-Policy Surrender', [
    'Time between issue and surrender?',
    'Penalty-accepting surrender? Cash-out destination?',
    'Policy obtained via single-premium / offshore channel?',
  ], ['insurance_wrap','velocity_analysis','pattern_of_life']),

  t('ins_pep_life', 'ins', 'Insurance — PEP Life Policy', [
    'PEP status and jurisdiction; family/associates as beneficiaries?',
    'Source-of-premium documented?',
    'EDD approved at senior management level?',
  ], ['insurance_wrap','typology_catalogue','escalation_trigger']),

  t('fo_single_family', 'fo', 'Family Office — Single-Family', [
    'Family structure, principals, PEP exposure?',
    'Governance: investment committee, policies, SoW per branch?',
    'Related-party transactions documented and at arm\'s length?',
  ], ['family_office_signal','ubo_tree_walk','conflict_interest']),

  t('fo_ptc', 'fo', 'Family Office — Private Trust Company', [
    'PTC ownership, board, licensing, enforcer?',
    'Underlying trusts and beneficiary classes?',
    'Distribution policy and evidence of exercise?',
  ], ['family_office_signal','ubo_tree_walk','article_by_article']),

  t('lux_art_dealer', 'lux', 'Luxury — Art Dealer', [
    'Buyer / seller identified; private sale justification?',
    'Provenance chain and export / import compliance?',
    'Free-port storage or physical delivery?',
  ], ['art_dealer','provenance_trace','jurisdiction_cascade']),

  t('pay_msb_onboard', 'pay', 'Payments / MSB — Agent Onboarding', [
    'Agent licensing, ownership, fit-and-proper checks?',
    'Training, monitoring, and termination criteria?',
    'Sanctions screening of agent and its directors?',
  ], ['kyb_strict','list_walk','control_effectiveness']),

  t('fund_capital_call', 'fund', 'Fund — Capital Call / LP Source', [
    'LP SoW, jurisdiction, PEP exposure?',
    'Capital-call funding route and banking chain?',
    'Secondaries / recycled capital treated correctly?',
  ], ['source_triangulation','provenance_trace','jurisdiction_cascade']),

  t('market_insider', 'market', 'Market — Insider Trading', [
    'Timing of trades vs price-sensitive event?',
    'Access-to-information list reconciliation?',
    'Related-party trading cluster?',
  ], ['market_manipulation','timeline_reconstruction','link_analysis']),

  t('fraud_bec', 'fraud', 'Fraud — BEC', [
    'Email-header / domain / header-path forensics?',
    'Payment-instruction change vs vendor master?',
    'Two-channel verification evidence?',
  ], ['bec_fraud','linguistic_forensics','control_effectiveness']),

  t('ops_alert_triage', 'ops', 'Operations — Alert Triage', [
    'Alert severity, age, SLA status?',
    'Analyst notes, peer review, disposition rationale?',
    'Recurring-alert pattern indicating tuning gap?',
  ], ['sla_check','peer_group_anomaly','kri_alignment']),

  t('mlro_str_review', 'mlro', 'MLRO — STR Review', [
    'Is the narrative defensible to the regulator?',
    'Attachments sufficient for reconstruction?',
    'Post-filing customer actions consistent?',
  ], ['narrative_coherence','audit_trail_reconstruction','verdict_replay']),

  t('audit_lookback', 'audit', 'Audit — Lookback', [
    'Scope period and sample selection method?',
    'Findings typed (isolated vs systemic)?',
    'Remediation plan and verification?',
  ], ['audit_trail_reconstruction','control_effectiveness','policy_drift']),

  // ─── WAVE 3 — intelligence expansion ───────────────────────────────
  t('osint_subject_scan', 'cdd', 'OSINT — Subject Scan', [
    'Digital footprint, handles, historical aliases?',
    'Associates, affiliations, cadence of public activity?',
    'Source reliability and credibility per artefact (NATO/Admiralty grading)?',
  ], ['socmint_scan','geoint_plausibility','humint_reliability_grade','nato_admiralty_grading','osint_chain_of_custody']),

  t('sanctions_evasion_probe', 'sanctions', 'Sanctions — Evasion Probe', [
    'Front-company fingerprints, nominee rotation, shared agents?',
    'Flag / vessel / aircraft movement anomalies?',
    'Sanctions-arbitrage routing across regimes?',
  ], ['front_company_fingerprint','nominee_rotation_detection','phantom_vessel','flag_hopping','dark_fleet_pattern','sanctions_arbitrage']),

  t('russian_oil_attestation', 'sanctions', 'Russian Oil — Price-Cap Attestation', [
    'Attestation chain back to producer / loading port?',
    'STS transfers, AIS gaps, dark-fleet exposure?',
    'Insurer / P&I club coverage status?',
  ], ['russian_oil_price_cap','sanctions_maritime_stss','dark_fleet_pattern','phantom_vessel']),

  t('eu_14_package_walk', 'sanctions', 'EU — 14th Package Walk', [
    'No-Russia / no-circumvention clauses in contracts?',
    'Best-efforts obligations on subsidiaries outside EU?',
    'Third-country diversion risk in supply chain?',
  ], ['eu_14_package','sanctions_arbitrage','article_by_article']),

  t('chip_export_screen', 'pf', 'Chip Export — End-Use Screen', [
    'Advanced-node / AI-compute classification (BIS ECCN)?',
    'End-user declaration and site visit?',
    'Diversion risk via transshipment hubs?',
  ], ['chip_export_controls','typology_catalogue','kill_chain','list_walk']),

  t('iran_evasion_screen', 'sanctions', 'Iran — Evasion Screen', [
    'Gold-for-oil, petrochemical, front-bank typologies?',
    'UAE free-zone / Turkey / Malaysia transshipment pattern?',
    'Counterparty linked to IRGC designations?',
  ], ['iran_evasion_pattern','front_company_fingerprint','sanctions_arbitrage']),

  t('dprk_evasion_screen', 'sanctions', 'DPRK — Evasion Screen', [
    'Coal / fisheries / labour-export typology match?',
    'Lazarus / APT38 crypto-proximity?',
    'Ship-to-ship transfers off Chinese / Russian ports?',
  ], ['dprk_evasion_pattern','chain_analysis','sanctions_maritime_stss']),

  t('forensic_benford_screen', 'ops', 'Forensic — Benford / Digit Screen', [
    'Sufficient sample size (n ≥ 30 amounts)?',
    'Leading-digit distribution tested?',
    'Split-payment / round-number patterns around thresholds?',
  ], ['benford_law','split_payment_detection','journal_entry_anomaly']),

  t('network_kcore_screen', 'ops', 'Network — k-Core / Motif Screen', [
    'Densest-subgraph extraction around the subject?',
    'Temporal motifs matching layering signatures?',
    'Bridges / structural holes between clusters?',
  ], ['k_core_analysis','temporal_motif','bridge_detection','structural_hole','community_detection']),

  t('crypto_deep_probe', 'vasp', 'Crypto — Deep On-Chain Probe', [
    'Peel chains, change-address clusters, dusting exposure?',
    'Bridge-hopping velocity, cross-chain taint, privacy-pool proximity?',
    'Address-poisoning history in wallet record?',
  ], ['peel_chain','change_address_heuristic','chain_hopping_velocity','cross_chain_taint','privacy_pool_exposure','tornado_cash_proximity','address_poisoning','dusting_attack_pattern']),

  t('esg_greenwash_screen', 'esg', 'ESG — Greenwash Screen', [
    'Sustainability claims vs Scope 1-3 emissions evidence?',
    'Certification authenticity and scope?',
    'Supply-chain forced-labour / conflict-mineral exposure?',
  ], ['greenwashing_signal','forced_labour_supply_chain','conflict_mineral_typology','carbon_fraud_pattern']),

  t('linguistic_forensic_read', 'mlro', 'Linguistic — Forensic Read', [
    'Stylometry consistency across subject communications?',
    'Obfuscation / hedging / minimisation markers?',
    'Domain code-words or cant?',
  ], ['stylometry','linguistic_forensics','obfuscation_pattern','hedging_language','code_word_detection','minimisation_pattern']),

  t('cover_story_interview', 'edd', 'EDD — Cover-Story Interview', [
    'Does the narrative hold across reset, timeline, and detail probes?',
    'Legend verification — biography cross-corroborated independently?',
    'Honey-trap / false-flag cover-story markers?',
  ], ['cover_story_stress','legend_verification','honey_trap_pattern','false_flag_check','deception_detection']),

  t('bayesian_aggregate_review', 'mlro', 'MLRO — Bayesian Aggregate Review', [
    'Heterogeneous evidence combined via Bayesian update?',
    'Dempster-Shafer mass assignment on conflicting sources?',
    'Counter-evidence weighting applied to resist confirmation bias?',
  ], ['bayesian_update_cascade','dempster_shafer','multi_source_consistency','counter_evidence_weighting']),

  t('behavioral_economics_probe', 'edd', 'EDD — Behavioural-Economics Probe', [
    'Client decisions consistent with rational reference points?',
    'Hyperbolic-discount signature suggesting distress or coercion?',
    'Mental-accounting splits indicating SoW laundering?',
  ], ['prospect_theory','hyperbolic_discount','mental_accounting','status_quo_bias','reference_point_shift']),
];

export const QUESTION_TEMPLATE_BY_ID: Map<string, QuestionTemplate> = new Map(
  QUESTION_TEMPLATES.map((q) => [q.id, q]),
);
