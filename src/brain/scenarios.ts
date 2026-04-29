// Hawkeye Sterling — scenario preset registry.
// Named AML/CFT/sanctions/PEP/adverse-media scenarios with narrative, bound template,
// and expected-flag profile. Used for regression testing, training, and live demo.

import type { Scenario } from './types.js';

const s = (
  id: string,
  name: string,
  domain: string,
  narrative: string,
  templateId: string | undefined,
  expectedFlags: string[],
): Scenario => ({
  id, name, domain, narrative, expectedFlags,
  ...(templateId ? { templateId } : {}),
});

export const SCENARIOS: Scenario[] = [
  // ─── WAVE 1 ─────────────────────────────────────────────────────────
  s('dpms_retail_micro_structure', 'DPMS — Retail Micro-Structuring', 'dpms',
    'Same retail buyer splits a single gold purchase across three consecutive days, each below AED 55,000, paid in cash, no KYC triggered under the naive threshold.',
    'dpms_retail_threshold',
    ['structuring','threshold_avoidance','kyc_gap']),

  s('dpms_retail_expatriate_cash', 'DPMS — Expatriate Cash Buyer', 'dpms',
    'Newly arrived expatriate pays AED 180k cash for investment-grade bars; declared SoF is "savings"; no tax/bank proofs offered.',
    'dpms_retail_threshold',
    ['sow_unverified','cash_intensive','adverse_profile_mismatch']),

  s('bullion_wholesale_loco_split', 'Bullion — Loco-Split Delivery', 'dpms',
    'Refined bars ordered in Dubai, split-delivered Loco Zurich and Loco London across two buyers with linked UBOs.',
    undefined,
    ['ubo_linked_parties','jurisdiction_split','typology_match']),

  s('bullion_dore_drc_asm', 'Bullion — DRC ASM Doré', 'dpms',
    'Doré shipments declared as Ugandan-origin but customs paperwork traces back to DRC artisanal mines in a CAHRA.',
    'dpms_refiner_cahra',
    ['cahra_exposure','provenance_mismatch','lbma_step_gap']),

  s('vasp_sanctioned_wallet', 'VASP — Sanctioned Wallet Direct Inflow', 'vasp',
    'Incoming transfer of 2.1 BTC from a wallet labelled by at least two chain-analytics vendors as OFAC-designated.',
    'vasp_wallet_screen',
    ['sanctions_match','taint_direct','block_candidate']),

  s('vasp_mixer_inbound', 'VASP — Mixer Inbound', 'vasp',
    'Deposit 0.8 BTC from a wallet with 3-hop exposure to a coin-mixer; user claims "privacy preference".',
    'vasp_wallet_screen',
    ['mixer_exposure','high_taint','edd_trigger']),

  s('tbml_over_invoice_textile', 'TBML — Textile Over-Invoicing', 'tbml',
    'Bulk polyester invoiced at 4× fair-market band, shipped Jebel Ali → Hong Kong, paid via correspondent in third country.',
    'tbml_over_invoicing',
    ['price_anomaly','third_country_payment','ucp_doc_risk']),

  s('pep_domestic_minister', 'PEP — Domestic Minister', 'pep',
    'Prospect is the sister of a sitting cabinet minister; proposed relationship: private banking; SoW: inheritance.',
    undefined,
    ['pep_family','edd_required','senior_approval']),

  s('sanc_eu_vs_ofac_conflict', 'Sanctions — EU vs OFAC Conflict', 'sanctions',
    'Counterparty lawful under EU regime but designated by OFAC; EU blocking statute may apply.',
    'sanc_partial_match_decision',
    ['regime_conflict','legal_opinion_required']),

  s('ubo_multi_jur_cascade', 'UBO — Multi-Jurisdiction Cascade', 'ubo',
    'Five-layer chain: BVI → Cayman → Panama → UAE Free Zone → mainland LLC, with nominees at layer 3.',
    'ubo_25_threshold',
    ['layered_chain','nominee_risk','opacity_high']),

  s('npo_charity_conflict_zone', 'NPO — Charity to Conflict Zone', 'tf',
    'Registered UAE charity remits aid into a conflict region; counterparty is a local unregistered foundation.',
    undefined,
    ['tf_exposure','edd_required','aid_diversion_risk']),

  s('cb_cash_60k_arrival', 'Cash — AED 60k Arrival Declaration', 'cash',
    'Traveller declares AED 60k on arrival; stated purpose: "business reserves"; no receipts; repeated monthly pattern.',
    'cash_courier_ctn',
    ['structuring_suspect','pattern_of_life','edd_required']),

  s('corresp_nested_bank_flow', 'Correspondent — Nested Bank Flow', 'corresp',
    'Respondent bank routes USD traffic via correspondent on behalf of its own respondents (downstream nesting) without disclosure.',
    undefined,
    ['nested_correspondent','transparency_gap','wolfsberg_breach']),

  // ─── WAVE 2 ─────────────────────────────────────────────────────────
  s('tf_lc_discrep', 'TF — LC Discrepancy Chain', 'tf',
    'Documentary credit presentation with four discrepancies across BL, insurance, commercial invoice; waiver sought from applicant.',
    'tf_lc_ucp600',
    ['doc_discrepancy','waiver_pattern','ucp_breach']),

  s('tf_sblc_draw_chain', 'TF — SBLC Draw Chain', 'tf',
    'Standby drawn on counter-guarantee which itself sits on a second SBLC; underlying obligation unclear.',
    'tf_standby_lc',
    ['chain_obscurity','underlying_weakness']),

  s('re_cash_villa', 'RE — Cash Villa Purchase', 're',
    'AED 11M villa settled cash across 4 tranches via exchange houses; buyer declares inheritance.',
    're_cash_purchase',
    ['cash_intensive','sow_weak','structuring_suspect']),

  s('re_goldenvisa_invest', 'RE — Golden-Visa Property Investment', 're',
    'Investor purchases AED 2M property to qualify for residency, via a corporate vehicle with opaque UBO.',
    're_goldenvisa_invest',
    ['ubo_opacity','threshold_compliance_check']),

  s('ins_life_surrender_cash', 'Insurance — Life Surrender to Cash', 'ins',
    'Single-premium life policy surrendered at 18 months, proceeds paid to third party account in a different jurisdiction.',
    'ins_life_surrender',
    ['rapid_surrender','third_party_payout','layering_typology']),

  s('fo_pep_patriarch', 'Family Office — PEP Patriarch', 'fo',
    'Multi-branch family office ultimately controlled by a PEP patriarch; one branch runs politically-exposed mandates.',
    'fo_single_family',
    ['pep_control','related_party_risk','governance_gap']),

  s('lux_art_private_sale', 'Luxury — Art Private Sale', 'lux',
    'Old Master sold privately through a dealer in a free-port; anonymous buyer SPV; no public provenance.',
    'lux_art_dealer',
    ['anonymity','provenance_gap','free_port_risk']),

  s('pay_msb_agent_onboard', 'Payments — MSB Agent Onboarding', 'pay',
    'MSB seeks to onboard 14 new agents in rapid batch; two share directors with a previously-terminated agent.',
    'pay_msb_onboard',
    ['connected_agents','control_gap']),

  s('fund_capital_call_source', 'Fund — Capital Call LP SoW', 'fund',
    'Capital call funded from an LP SPV whose banker declines to share SoW evidence citing confidentiality.',
    'fund_capital_call',
    ['sow_refused','LP_opacity','edd_required']),

  s('market_insider_trade', 'Market — Insider Trade Window', 'market',
    'Cluster of accounts, all linked via a single lawyer, buy within 48h of a confidential M&A filing.',
    'market_insider',
    ['pre_announcement_trade','cluster_pattern','information_leak']),

  s('fraud_bec_redirect', 'Fraud — BEC Invoice Redirect', 'fraud',
    'Long-standing vendor emails a one-character-different domain instructing payment to a new IBAN mid-engagement.',
    'fraud_bec',
    ['domain_lookalike','payment_redirect','control_bypass']),

  s('ops_alert_backlog', 'Ops — Alert Backlog', 'ops',
    '2,400 open alerts, average age 41 days, SLA breach on 37%; staffing flat for 9 months.',
    'ops_alert_triage',
    ['sla_breach','backlog_risk','capacity_gap']),

  s('mlro_str_draft_review', 'MLRO — STR Draft Review', 'mlro',
    'Draft STR names party but omits typology, weights on circumstantial observations only.',
    'mlro_str_review',
    ['narrative_weak','typology_missing','rework_required']),

  s('audit_lookback_sample', 'Audit — Lookback Sample', 'audit',
    'Lookback sample of 120 high-risk files; 18 have UBO gaps, 5 missed sanctions hits under old list version.',
    'audit_lookback',
    ['systemic_ubo_gap','historical_miss','remediation_trigger']),

  s('incident_lessons', 'Incident — Lessons Learned', 'incident',
    'Post-incident review 6 weeks late; some controls adjusted informally; no tabletop since.',
    undefined,
    ['post_mortem_overdue','informal_change','exercise_gap']),

  // ─── WAVE 3 ────────────────────────────────────────────────────────
  s('dark_fleet_stss_cargo', 'Dark Fleet — STS Cargo', 'sanctions',
    'Tanker without P&I cover conducts two overnight STS transfers off Lakonikos; AIS dark for 11 hours; vessel flag changed within 60 days.',
    'russian_oil_attestation',
    ['ais_gap','stss_pattern','flag_hopping','p_and_i_gap']),

  s('front_company_cluster', 'Front-Company Cluster', 'sanctions',
    'Three recently-incorporated UAE free-zone entities share registered agent, filing day, and director-of-record.',
    'sanctions_evasion_probe',
    ['shared_agent','formation_cluster','front_company_fingerprint']),

  s('iran_gold_for_oil', 'Iran — Gold-for-Oil', 'sanctions',
    'UAE gold refiner invoiced by Malaysian intermediary; funds settle via Hong Kong shell; pattern repeats monthly.',
    'iran_evasion_screen',
    ['iran_evasion_pattern','precious_metal_typology','intermediary_layering']),

  s('dprk_crypto_heist_flow', 'DPRK — Crypto Heist Flow', 'vasp',
    'Funds from a known Lazarus-linked wallet hop three bridges into privacy pools, then re-emerge at an OTC desk serving Chinese RMB settlement.',
    'dprk_evasion_screen',
    ['dprk_evasion_pattern','bridge_hopping','privacy_pool_exposure']),

  s('chip_diversion_hub', 'Chip — Diversion Hub', 'pf',
    'Advanced AI-GPU shipment consigned to a Dubai free-zone trader with no discernible end-user, re-exported within 9 days to a Hong Kong shell.',
    'chip_export_screen',
    ['chip_export_controls','diversion_risk','shell_end_user']),

  s('corporate_benford_anomaly', 'Corporate — Benford Anomaly', 'ops',
    'AP dataset of 8,400 invoices over 12 months; leading-digit distribution deviates heavily from Benford; round-numbered invoices spike at period close.',
    'forensic_benford_screen',
    ['benford_deviation','journal_entry_anomaly','period_close_pattern']),

  s('insider_cluster_kcore', 'Market — Insider Cluster k-Core', 'market',
    'Graph of trades reveals a 5-account k-core with temporal motifs tightly coupled to a confidential regulatory approval.',
    'network_kcore_screen',
    ['dense_subgraph','temporal_motif','pre_announcement_trade']),

  s('peel_chain_exit', 'Crypto — Peel-Chain Exit', 'vasp',
    'Large balance dissipates through a 26-hop peel chain to multiple exchanges over three days, with a change-address pattern.',
    'crypto_deep_probe',
    ['peel_chain','change_address_heuristic','cross_exchange_layering']),

  s('esg_mineral_origin_laundering', 'ESG — Mineral-Origin Laundering', 'esg',
    'Tungsten declared Rwandan-origin; smelter records and LBMA-equivalent ITSCI tags inconsistent with DRC-ASM movement pattern.',
    'esg_greenwash_screen',
    ['conflict_mineral_typology','provenance_mismatch','esg_false_claim']),

  s('bec_linguistic_tell', 'Fraud — BEC Linguistic Tell', 'fraud',
    'Late-Friday invoice-redirect email uses stylometric register distinct from vendor baseline; obfuscation markers and hedging cluster in the payment-instruction sentence.',
    'linguistic_forensic_read',
    ['stylometry_shift','obfuscation_pattern','hedging_cluster','bec_fraud']),

  // ─── WAVE 4 — FATF 2021 environmental predicate + Wave-4 crime ──────
  s('env_crime_cahra_dore', 'Environmental crime — CAHRA doré with no OECD evidence', 'environmental',
    'Refinery accepts 480 kg doré declared Tanzanian-origin; customs paper trails terminate at a DRC artisanal mine in a CAHRA; OECD Annex II evidence never attached.',
    'dpms_refiner_cahra',
    ['cahra_exposure','provenance_mismatch','fatf_r3_env_predicate','lbma_step_gap']),

  s('env_crime_iuu_seafood', 'Environmental crime — IUU seafood supply chain', 'environmental',
    'Seafood importer sources from vessel listed on IUU register; AIS shows repeated 24-hour gaps over protected fishing grounds; payments layered through two correspondent banks.',
    undefined,
    ['iuu_fishing_nexus','vessel_ais_gap','fatf_r3_env_predicate']),

  s('env_crime_waste_trafficking_basel', 'Environmental crime — hazardous-waste trafficking (Basel gap)', 'environmental',
    'Hazardous-waste HS code shipped cross-border with mis-declared freight class; no Basel Convention notification; buyer is a shell in opaque jurisdiction.',
    undefined,
    ['basel_gap','hs_misclassification','shell_buyer','fatf_r3_env_predicate']),

  s('carbon_phantom_credit_issuance', 'Carbon-market — phantom credit issuance', 'carbon',
    'Carbon project claims 1.2M tCO2e avoided; satellite baseline shows no change; no verified-MRV record at the declared registry; credits retired in Singapore while re-sold in EU.',
    undefined,
    ['phantom_credit','registry_gap','mrv_mismatch','carbon_market_fraud']),

  s('carbon_double_counting_a6', 'Carbon-market — Article-6 double counting', 'carbon',
    'Same tCO2e claimed under a host-country NDC and resold to an EU buyer as a corresponding-adjusted credit; no corresponding-adjustment entry on either ledger.',
    undefined,
    ['double_counting','corresponding_adjustment_absent','carbon_market_fraud']),

  s('insider_threat_offboarding_exfil', 'Insider threat — offboarding bulk exfiltration', 'insider',
    'Privileged engineer exports 6 GB of source + customer data in the 3 weeks before announced resignation; new employer files patents in overlapping subject-matter 4 months later.',
    undefined,
    ['privileged_exfil','offboarding_spike','ip_overlap','insider_threat']),

  s('insider_threat_usb_after_hours', 'Insider threat — removable-media after hours', 'insider',
    'Analyst with access to client dossiers writes repeatedly to USB storage between 23:00 and 02:00 over 12 nights; DLP alerts triaged as false-positives until volume is reviewed.',
    undefined,
    ['usb_after_hours','dlp_gap','pattern_of_life','insider_threat']),

  s('synthetic_id_loan_mill', 'Synthetic identity — loan-mill cluster', 'synthetic_identity',
    'Fifteen unsecured-loan applicants share blended real + fabricated attributes — all with thin-file SSNs, reused device fingerprints, and coordinated first-payment defaults.',
    undefined,
    ['synthetic_id_cluster','device_overlap','first_payment_default','synthetic_identity']),

  s('real_estate_ml_layered', 'Real-estate ML — layered purchase', 'real_estate',
    'AED 28m villa purchased by a 3-layer BVI / Cayman / UAE FZ structure; funds arrived through 4 correspondent hops; cash closure; declared beneficial owner is a nominee.',
    undefined,
    ['shell_chain','jurisdiction_cascade','cash_closure','real_estate_cash']),

  s('luxury_yacht_beneficial_opacity', 'Luxury asset — yacht registration opacity', 'luxury_asset',
    '60m yacht registered through a chain of SPVs across Marshall Islands → Malta → Guernsey; nominee directors; beneficial use by sanctioned PEP relative; AIS silent on repositioning.',
    undefined,
    ['yacht_chain_opacity','nominee_directors','ais_silence','pep_proximity']),

  // ─── WAVE 4 — AI governance + AI incidents ──────────────────────────
  s('ai_gov_high_risk_no_conformity', 'AI governance — high-risk deployment without conformity assessment', 'ai_governance',
    'Credit-scoring model deployed across retail portfolio; no EU AI Act Annex III conformity assessment on file; no model card or fairness-monitoring metric; business unit unaware of obligations.',
    undefined,
    ['eu_ai_act_annex_iii','conformity_assessment_absent','fairness_monitoring_gap','ai_governance_breach']),

  s('ai_gov_shadow_llm_sensitive', 'AI governance — shadow-LLM on sensitive data', 'ai_governance',
    'Business unit pastes customer PII and M&A plans into a third-party generative-AI web UI; egress logs show 200+ sessions over a month; no AI registry entry.',
    undefined,
    ['shadow_ai','pii_egress','registry_gap','ai_governance_breach']),

  s('ai_agentic_autonomous_spend', 'AI governance — agentic AI autonomous spend', 'ai_governance',
    'Procurement agent LLM-driven workflow issues purchase orders below a de-minimis threshold; vendor diligence bypassed; no human-in-the-loop; total AED 1.4m across 90 days.',
    undefined,
    ['agentic_autonomy','no_human_in_loop','vendor_diligence_bypass','ai_governance_breach']),

  s('ai_prompt_injection_data_exfil', 'AI failure — indirect prompt injection exfiltrates data', 'ai_incident',
    'Customer-support LLM integrated with case-ticket store falls to indirect prompt injection embedded in a PDF; partial dossier content echoed to attacker-controlled URL.',
    undefined,
    ['prompt_injection','owasp_llm_top_10','data_exfiltration','ai_failure']),

  s('ai_synthetic_ceo_deepfake_bec', 'AI synthetic-media — CEO deepfake BEC', 'ai_synthetic_media',
    'CFO receives live video call from apparent CEO requesting urgent AED 9m wire to new beneficiary; voice cadence + lip-sync indicate synthetic origin; beneficiary account opened 12 days prior.',
    'linguistic_forensic_read',
    ['deepfake_executive','voice_clone','new_beneficiary','ai_synthetic_media_fraud']),

  s('ai_liveness_bypass_onboarding', 'AI synthetic-media — liveness-bypass KYC onboarding', 'ai_synthetic_media',
    'KYC flow passes liveness check; post-onboarding selfie fails device / biometric cross-check; deeper review finds AI-generated ID with EXIF anomalies.',
    undefined,
    ['liveness_spoof','ai_generated_kyc_doc','biometric_mismatch','ai_synthetic_media_fraud']),

  // ─── WAVE 5 — Professional ML, Hawala, Romance fraud, Gaming, RE ─────
  s('hawala_network_gold_settlement', 'Hawala — Gold-settled bilateral netting', 'hawala',
    'UAE trading company receives AED 4.2m from 18 Pakistani remitters in 10 days; matching outbound AED transfers to a Karachi hawaladar; settlement confirmed via gold shipment invoice matching the net position.',
    undefined,
    ['hawala_network','velocity_analysis','pattern_of_life','jurisdiction_cascade']),

  s('romance_pig_butchering_crypto', 'Pig-butchering — crypto investment scam', 'cyber_fraud',
    'UAE resident contacts "investment advisor" on dating app; over 6 weeks transfers AED 890k to unhosted wallets via a fake exchange claiming 40% monthly returns; funds chain-hop to sanctioned mixer within 48 hours.',
    undefined,
    ['romance_fraud','chain_analysis','taint_propagation','unhosted_wallet']),

  s('professional_ml_network_invoicing', 'Professional ML — invoice-layering network', 'professional_ml',
    'Three UAE FZ entities and two foreign shell companies issue circular invoices totalling AED 28m over 6 months; funds rotate through 4 jurisdictions before landing in a real-estate holding; same beneficial owner identified via UBO cascade.',
    undefined,
    ['professional_money_laundering','community_detection','link_analysis','circular_invoicing']),

  s('gambling_online_chip_wash', 'Online gambling — chip washing', 'gambling',
    'Subject deposits AED 1.8m across 6 online gambling platforms in one month; wagers < 5% of funds; withdraws to 3 different bank accounts citing "winnings"; no documented gaming history.',
    undefined,
    ['gambling_ml','velocity_analysis','pattern_of_life','placement_layering']),

  s('funnel_account_mule_network', 'Funnel account — student mule cluster', 'banking',
    '14 UAE university student accounts each receive AED 60k–80k from unrelated foreign senders over 72 hours; aggregate AED 980k consolidated into one account within 24 hours then wired to a single IBAN in Turkey.',
    undefined,
    ['funnel_account','velocity_analysis','smurfing_detection','mule_network']),

  s('vasp_chain_hop_ransomware', 'Ransomware proceeds — chain-hopping cash-out', 'crypto',
    'OFAC-linked ransomware wallet disburses 7.4 BTC across 3 protocol bridges (BTC→ETH→MATIC→BSC) within 6 hours; proceeds arrive at UAE OTC desk as USDT then converted to AED and collected in cash.',
    undefined,
    ['crypto_ransomware','chain_analysis','taint_propagation','sanctions_regime_matrix']),

  s('real_estate_over_valuation_kickback', 'Real estate — over-valuation with cash-back', 'real_estate',
    'AED 12m villa contracted at AED 17m; AED 5m excess funded by buyer from an offshore account and returned in cash by developer to a third-party account; independent RICS valuation supports AED 12m.',
    undefined,
    ['real_estate_over_valuation','real_estate_cash','source_triangulation','cash_intensive']),

  s('insurance_pep_wrap_surrender', 'Insurance wrap — PEP multi-jurisdiction surrender', 'insurance',
    'Former minister holds 4 single-premium life wrappers (Switzerland, Guernsey, Liechtenstein, UAE) with aggregate EUR 8m premiums; all surrendered within 18 months; proceeds consolidated to a new Cayman holding.',
    undefined,
    ['insurance_wrap','pep_domestic_minister','source_triangulation','jurisdiction_cascade']),

  s('correspondent_shell_respondent', 'Correspondent banking — shell respondent access', 'banking',
    'Caribbean-incorporated entity with no physical presence and no CBUAE licence maintains a USD account via a Lebanese correspondent; routes payments to Iranian counterparties through 3 intermediate hops.',
    undefined,
    ['correspondent_shell','corresp_nested_bank_flow','sanctions_regime_matrix','jurisdiction_cascade']),

  s('tax_evasion_offshore_layering', 'Tax evasion — offshore layering via UAE FZ', 'tax_evasion',
    'European HNW individual channels business profits through a JAFZA company to a BVI holding; no substance in either entity; transfer-pricing study absent; funds ultimately remitted to Switzerland without tax disclosure.',
    undefined,
    ['tax_evasion_offshore','jurisdiction_cascade','source_triangulation','ubo_tree_walk']),

  s('daigou_luxury_parallel_import', 'Daigou — luxury parallel-import trade ML', 'tbml',
    'UAE resident purchases 120 Rolex watches per quarter from Swiss AD; ships to PRC buyers via a logistics company; invoice values 40% below retail; PRC buyers settle via WeChat Pay to UAE personal accounts.',
    undefined,
    ['daigou_parallel_import','tbml_over_invoicing','jurisdiction_cascade','customs_fraud']),

  s('construction_kickback_ml', 'Construction — government contract kickback', 'construction',
    'AED 450m government infrastructure contract awarded to a JV; 12% consultancy fee paid to a BVI entity controlled by a procurement official relative; funds routed via three correspondent hops before real-estate investment.',
    undefined,
    ['construction_ml','kleptocracy','pep_domestic_minister','ubo_tree_walk']),

  s('virtual_iban_mule_layering', 'Virtual IBAN — EMI mule layering', 'banking',
    'UK EMI issues 400 virtual IBANs to UAE applicants in 30 days; each account receives AED 40k-90k; all funds forwarded within 24h to a single UAE bank account; no CDD on the EMI side.',
    undefined,
    ['virtual_iban_abuse','funnel_account','velocity_analysis','kyc_gap']),

  s('healthcare_billing_fraud_ml', 'Healthcare — ghost-procedure billing ML', 'healthcare',
    'UAE private clinic submits AED 6m of insurance claims over 12 months for procedures performed on patients who deny receiving treatment; reimbursements flow to a shell trading company; ultimate funds used to purchase real estate.',
    undefined,
    ['healthcare_billing_fraud','reconciliation','placement_layering','real_estate_cash']),

  s('precious_stones_border_smuggle', 'Precious stones — border smuggling value transfer', 'dpms',
    'Uncut rubies with estimated retail value AED 2.4m declared as "industrial minerals" on customs manifest; buyer is an unregistered dealer; payment made cash-on-delivery; no CITES or origin documentation.',
    undefined,
    ['precious_stones','customs_fraud','provenance_trace','jurisdiction_cascade']),
];

export const SCENARIO_BY_ID: Map<string, Scenario> = new Map(
  SCENARIOS.map((s) => [s.id, s]),
);
