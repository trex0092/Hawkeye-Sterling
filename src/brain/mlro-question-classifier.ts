// Hawkeye Sterling — MLRO question classifier.
//
// Pure-TS, regex-based classifier that runs BEFORE the question is sent to
// Claude. It identifies the regulatory topic, jurisdiction, sanctions regimes,
// typologies, doctrines, FATF recommendations, playbooks and red flags
// implicated by the question, then returns:
//   • an ordered topic list (primary + secondary)
//   • urgency flags (tipping-off risk, imminent SAR window, MNPI, etc.)
//   • numeric thresholds extracted from the question
//   • the common-sense rules pre-resolved for the primary topic
//   • suggested follow-up questions per topic
//   • a rendered "enrichedPreamble" suitable for direct injection into the
//     advisor's user prompt.
//
// Charter rationale: P9 forbids opaque scoring. By pre-resolving doctrines,
// playbooks, FATF Recs, and citation anchors, the advisor's response can
// quote them verbatim — the operator can verify the citations against the
// source registry instead of trusting model recall.

import type { TypologyId } from './typologies.js';
import type { SanctionRegimeId } from './sanction-regimes.js';
import type { DoctrineId } from './doctrines.js';
import { COMMON_SENSE_RULES, rulesForTopic } from './mlro-common-sense.js';

export type MlroTopic =
  | 'cdd' | 'edd' | 'ongoing_monitoring' | 'source_of_funds' | 'source_of_wealth'
  | 'beneficial_ownership' | 'pep_handling' | 'pep_rca' | 'sanctions_screening'
  | 'adverse_media' | 'str_sar_filing' | 'recordkeeping' | 'training' | 'governance'
  | 'four_eyes' | 'correspondent_banking' | 'vasp_crypto' | 'dpms_precious_metals'
  | 'trade_based_ml' | 'structuring' | 'npo_risk' | 'shell_company'
  | 'proliferation_financing' | 'cahra_jurisdiction' | 'risk_appetite'
  | 'tipping_off_guard' | 'regulatory_reporting' | 'audit_examination'
  | 'typology_research' | 'general_compliance';

export type UrgencyFlag =
  | 'tipping_off_risk' | 'imminent_sar_window' | 'retention_breach'
  | 'mnpi_exposure' | 'sanctions_hit_review' | 'cross_border_block';

export interface NumericThreshold {
  value: number;
  unit: string;
  context: string;
}

export interface MlroQuestionAnalysis {
  topics: MlroTopic[];
  primaryTopic: MlroTopic;
  jurisdictions: string[];
  regimes: SanctionRegimeId[];
  typologies: TypologyId[];
  doctrineHints: DoctrineId[];
  fatfRecHints: string[];
  playbookHints: string[];
  redFlagHints: string[];
  urgencyFlags: UrgencyFlag[];
  numericThresholds: NumericThreshold[];
  commonSenseRules: string[];
  suggestedFollowUps: string[];
  confidence: 'high' | 'medium' | 'low';
  enrichedPreamble: string;
}

// ── Topic keyword map ──────────────────────────────────────────────────────

const KEYWORD_TOPIC_MAP: Record<MlroTopic, RegExp[]> = {
  cdd: [/\bcdd\b/i, /customer due diligence/i, /onboard(?:ing)?/i, /know your customer/i, /\bkyc\b/i, /identity verification/i],
  edd: [/\bedd\b/i, /enhanced due diligence/i, /high.?risk customer/i, /enhanced screening/i],
  ongoing_monitoring: [/ongoing monitoring/i, /periodic review/i, /transaction monitoring/i, /\btm\b/i, /alert/i, /re.?screen/i, /refresh cycle/i],
  source_of_funds: [/source of funds/i, /\bsof\b/i, /origin of (?:the )?funds?/i, /where (?:did|do) the funds come from/i],
  source_of_wealth: [/source of wealth/i, /\bsow\b/i, /wealth origin/i, /accumulated wealth/i],
  beneficial_ownership: [/beneficial owner(?:ship)?/i, /\bubo\b|\bbo\b/i, /ownership chain/i, /control(?:ling)? person/i, /trust(?:ee|or)?/i],
  pep_handling: [/\bpep\b/i, /politically exposed person/i, /head of state/i, /minister/i, /senior politic/i, /public function/i],
  pep_rca: [/\brca\b/i, /relatives? and close associates?/i, /family member of (?:a )?pep/i, /spouse of (?:a )?pep/i, /close associate/i],
  sanctions_screening: [/sanctions?/i, /\bofac\b/i, /\bsdn\b/i, /\bun\s*1267\b/i, /\beu\b.{0,12}sanctions?/i, /\bofsi\b/i, /\beocn\b/i, /freezing list/i],
  adverse_media: [/adverse media/i, /negative news/i, /reputational/i, /press coverage/i, /investigat(?:ion|ive) (?:journalism|reporting)/i],
  str_sar_filing: [/\bstr\b|\bsar\b/i, /suspicious (?:transaction|activity) report/i, /goaml/i, /file (?:an? )?(?:str|sar)/i, /report to (?:the )?fiu/i, /financial intelligence unit/i],
  recordkeeping: [/record.?keep/i, /retention/i, /retain(?:ed)?/i, /5[\s-]year(?:s)? retention/i, /10[\s-]year(?:s)? retention/i, /destroy(?:ed)?/i, /erasure/i],
  training: [/aml training/i, /staff training/i, /awareness training/i, /role.?specific training/i, /(?:annual|onboarding) training/i],
  governance: [/governance/i, /three lines of defen[cs]e/i, /board (?:of directors|reporting|oversight)/i, /(?:audit|risk) committee/i],
  four_eyes: [/four.?eyes/i, /maker.?checker/i, /two.?person review/i, /independent review/i, /dual control/i],
  correspondent_banking: [/correspondent bank/i, /\bcbddq\b/i, /\bnostro\b|\bvostro\b/i, /respondent bank/i, /nested account/i, /payable.?through account/i, /shell bank/i],
  vasp_crypto: [/\bvasp\b/i, /crypto(?:currency)?/i, /virtual asset/i, /digital asset/i, /travel rule/i, /\bdefi\b/i, /\bnft\b/i, /stablecoin/i, /privacy coin/i, /\bbtc\b|\beth\b|\busdt\b/i, /wallet/i, /on.?chain/i, /mixer|tumbler/i],
  dpms_precious_metals: [/\bdpms\b/i, /precious metals?/i, /gold trader/i, /jewell?er/i, /diamond/i, /bullion/i, /refinery|refiner/i, /\blbma\b/i, /kimberley/i],
  trade_based_ml: [/\btbml\b/i, /trade.?based (?:money laundering|ml)/i, /over.?invoicing/i, /under.?invoicing/i, /phantom shipment/i, /trade finance fraud/i],
  structuring: [/structuring/i, /smurfing/i, /\bcuckoo\b/i, /split deposits?/i, /just below the threshold/i, /cash courier/i, /bulk cash/i],
  npo_risk: [/\bnpo\b|\bnonprofit\b/i, /\bngo\b/i, /charity|charit/i, /not.?for.?profit/i, /\bcda\b|\bfanr\b/i],
  shell_company: [/shell (?:company|entity|corporation)/i, /front (?:company|entity)/i, /letterbox company/i, /nominee director/i, /no employees/i, /registered.?agent address/i],
  proliferation_financing: [/proliferation/i, /\bpf\b\b/i, /dual.?use/i, /wmd/i, /export control/i, /end.?user (?:certificate|cert)/i, /catch.?all/i, /missile|chemical weapons|biological weapons|nuclear/i],
  cahra_jurisdiction: [/\bcahra\b/i, /conflict.?affected/i, /high.?risk area/i, /\boecd\s*ddg\b/i, /afghanistan|yemen|syria|sudan|south sudan|libya|somalia|venezuela|myanmar|burma|drc|ddr congo/i],
  risk_appetite: [/risk appetite/i, /risk tolerance/i, /risk budget/i, /\bkri\b|key risk indicator/i, /residual risk/i, /inherent risk/i],
  tipping_off_guard: [/tip.?off/i, /tipping.?off/i, /inform the (?:client|customer|subject)/i, /can (?:i|we) tell the (?:client|customer)/i, /alert the (?:subject|client)/i],
  regulatory_reporting: [/regulator(?:y)? (?:report|filing|return)/i, /annual return/i, /quarterly report/i, /supervisor (?:filing|return)/i, /\beocn\s*annual\b/i, /\bgoaml\b/i],
  audit_examination: [/internal audit/i, /external audit/i, /regulatory examination/i, /supervisor visit/i, /examiner/i, /audit (?:findings?|report)/i, /\biia\b/i],
  typology_research: [/typolog/i, /red flag indicator/i, /pattern of life/i, /predicate offence/i, /emerging threat/i, /case stud(?:y|ies)/i, /\bfatf\s*typolog/i],
  general_compliance: [/.+/], // fallback — matches anything
};

// ── Topic → hint maps ─────────────────────────────────────────────────────

const TOPIC_TO_DOCTRINES: Record<MlroTopic, DoctrineId[]> = {
  cdd: ['fatf_rba', 'wolfsberg_faq', 'uae_fdl_10_2025', 'uae_fdl_20_2018'],
  edd: ['fatf_rba', 'wolfsberg_faq', 'uae_fdl_20_2018'],
  ongoing_monitoring: ['fatf_rba', 'wolfsberg_faq', 'iso_31000'],
  source_of_funds: ['wolfsberg_faq', 'uae_fdl_20_2018'],
  source_of_wealth: ['wolfsberg_faq', 'uae_fdl_20_2018'],
  beneficial_ownership: ['fatf_rba', 'uae_fdl_10_2025', 'wolfsberg_faq'],
  pep_handling: ['wolfsberg_faq', 'uae_fdl_20_2018', 'uae_cd_10_2019'],
  pep_rca: ['wolfsberg_faq', 'uae_fdl_20_2018'],
  sanctions_screening: ['uae_cd_74_2020', 'uae_cr_16_2021', 'uae_cr_134_2025'],
  adverse_media: ['wolfsberg_faq', 'fatf_rba'],
  str_sar_filing: ['uae_fdl_20_2018', 'uae_fdl_10_2025', 'egmont_fiu'],
  recordkeeping: ['uae_fdl_20_2018', 'uae_fdl_10_2025', 'pdpl_fdl_45_2021'],
  training: ['fatf_effectiveness', 'wolfsberg_faq'],
  governance: ['three_lines_defence', 'coso_erm', 'iso_31000'],
  four_eyes: ['three_lines_defence', 'wolfsberg_faq'],
  correspondent_banking: ['wolfsberg_correspondent', 'fatf_rba'],
  vasp_crypto: ['fatf_rba', 'wolfsberg_faq'],
  dpms_precious_metals: ['lbma_rgg', 'oecd_ddg', 'uae_moe_dnfbp_circulars'],
  trade_based_ml: ['fatf_rba', 'wolfsberg_correspondent'],
  structuring: ['fatf_rba', 'uae_cd_10_2019'],
  npo_risk: ['fatf_rba', 'uae_fdl_20_2018'],
  shell_company: ['fatf_rba', 'wolfsberg_faq'],
  proliferation_financing: ['uae_cd_74_2020', 'fatf_rba'],
  cahra_jurisdiction: ['oecd_ddg', 'lbma_rgg', 'uae_moe_dnfbp_circulars'],
  risk_appetite: ['coso_erm', 'iso_31000'],
  tipping_off_guard: ['uae_fdl_20_2018', 'uae_fdl_10_2025'],
  regulatory_reporting: ['uae_fdl_10_2025', 'egmont_fiu'],
  audit_examination: ['three_lines_defence', 'fatf_effectiveness'],
  typology_research: ['fatf_rba', 'fatf_effectiveness'],
  general_compliance: ['fatf_rba', 'wolfsberg_faq'],
};

const TOPIC_TO_PLAYBOOKS: Record<MlroTopic, string[]> = {
  cdd: ['pb_cdd_natural_person', 'pb_cdd_legal_person'],
  edd: ['pb_edd_high_risk', 'pb_celebrity_hnwi'],
  ongoing_monitoring: ['pb_periodic_review', 'pb_risk_rating_refresh'],
  source_of_funds: ['pb_sof_documentation'],
  source_of_wealth: ['pb_sow_corroboration'],
  beneficial_ownership: ['pb_ubo_trust', 'pb_ubo_foundation', 'pb_ubo_cooperative', 'pb_bor_filing'],
  pep_handling: ['pb_pep', 'pb_foreign_pep_onboard', 'pb_domestic_pep_onboard', 'pb_pep_stepdown'],
  pep_rca: ['pb_rca_family'],
  sanctions_screening: ['pb_sanctions_match_triage', 'pb_eocn_tfs', 'pb_russia_sanctions', 'pb_iran_sanctions', 'pb_dprk_sanctions'],
  adverse_media: ['pb_adverse_media_deepdive'],
  str_sar_filing: ['pb_fiu_goaml_filing', 'pb_sar_quality'],
  recordkeeping: ['pb_periodic_review'],
  training: [],
  governance: [],
  four_eyes: ['pb_sar_quality'],
  correspondent_banking: ['pb_correspondent'],
  vasp_crypto: ['pb_vasp', 'pb_crypto_otc', 'pb_travel_rule', 'pb_crypto_exchange_onboard', 'pb_defi_protocol', 'pb_privacy_coin', 'pb_mixer_tumbler', 'pb_nft_wash_trading', 'pb_stablecoin_issuance'],
  dpms_precious_metals: ['pb_dpms_retail', 'pb_hv_dealer', 'pb_diamond_kimberley', 'pb_coloured_gems', 'pb_oecd_ddg_gold', 'pb_moe_dpms_supervisor'],
  trade_based_ml: ['pb_tbml', 'pb_trade_finance', 'pb_petroleum_trade', 'pb_base_metals', 'pb_agri_commodities'],
  structuring: ['pb_structuring', 'pb_cuckoo_smurfing', 'pb_funnel_account', 'pb_bulk_cash_smuggling', 'pb_cash_intensive'],
  npo_risk: ['pb_ngo'],
  shell_company: ['pb_shell_complex', 'pb_sanctions_shell'],
  proliferation_financing: ['pb_proliferation', 'pb_dual_use_export', 'pb_end_user_cert'],
  cahra_jurisdiction: ['pb_oecd_ddg_gold', 'pb_conflict_minerals', 'pb_free_zone_risk'],
  risk_appetite: ['pb_branch_risk_assessment'],
  tipping_off_guard: ['pb_customer_exit'],
  regulatory_reporting: ['pb_eocn_tfs', 'pb_fiu_goaml_filing'],
  audit_examination: ['pb_periodic_review'],
  typology_research: [],
  general_compliance: [],
};

const TOPIC_TO_RED_FLAGS: Record<MlroTopic, string[]> = {
  cdd: ['rf_incomplete_kyc', 'rf_inconsistent_id', 'rf_address_mismatch'],
  edd: ['rf_high_risk_jurisdiction', 'rf_complex_ownership', 'rf_unusual_purpose'],
  ongoing_monitoring: ['rf_alert_fatigue', 'rf_pattern_change', 'rf_unexpected_velocity'],
  source_of_funds: ['rf_unverifiable_sof', 'rf_third_party_funding', 'rf_cash_intensive'],
  source_of_wealth: ['rf_disproportionate_wealth', 'rf_undocumented_wealth'],
  beneficial_ownership: ['rf_nominee_director', 'rf_ubo_chain_break', 'rf_25_pct_avoidance'],
  pep_handling: ['rf_pep_undisclosed', 'rf_pep_step_down_unjustified'],
  pep_rca: ['rf_undisclosed_rca'],
  sanctions_screening: ['rf_close_match', 'rf_50_pct_aggregation', 'rf_dark_fleet', 'rf_sanctioned_ip'],
  adverse_media: ['rf_arrest_article', 'rf_regulator_enforcement', 'rf_litigation_pattern'],
  str_sar_filing: ['rf_under_filing', 'rf_continuing_activity'],
  recordkeeping: ['rf_premature_destruction', 'rf_unauthorised_access'],
  training: ['rf_unrenewed_training'],
  governance: ['rf_committee_dormant', 'rf_kri_breach_unreported'],
  four_eyes: ['rf_self_approval', 'rf_override_log_silence'],
  correspondent_banking: ['rf_nested', 'rf_shell_bank', 'rf_payable_through'],
  vasp_crypto: ['rf_mixer_exposure', 'rf_self_hosted_wallet', 'rf_privacy_coin', 'rf_chain_hop'],
  dpms_precious_metals: ['rf_kpcs_mismatch', 'rf_unverified_origin', 'rf_cash_above_threshold'],
  trade_based_ml: ['rf_invoice_anomaly', 'rf_phantom_shipment', 'rf_circular_trade', 'rf_third_party_payment'],
  structuring: ['rf_threshold_avoidance', 'rf_smurf_network', 'rf_cuckoo_pattern'],
  npo_risk: ['rf_cross_border_charity', 'rf_cash_donations'],
  shell_company: ['rf_no_substance', 'rf_common_address', 'rf_single_customer'],
  proliferation_financing: ['rf_dual_use', 'rf_eu_certificate_anomaly', 'rf_dpr_iran_nexus'],
  cahra_jurisdiction: ['rf_cahra_origin', 'rf_armed_group_proximity'],
  risk_appetite: ['rf_residual_breach', 'rf_appetite_silence'],
  tipping_off_guard: ['rf_customer_alerted', 'rf_relationship_manager_disclosed'],
  regulatory_reporting: ['rf_late_filing', 'rf_unanswered_rfi'],
  audit_examination: ['rf_finding_overdue', 'rf_concealed_finding'],
  typology_research: ['rf_outdated_typology'],
  general_compliance: [],
};

const TOPIC_TO_FATF: Record<MlroTopic, string[]> = {
  cdd: ['fatf_r10', 'fatf_r11'],
  edd: ['fatf_r10', 'fatf_r12', 'fatf_r19'],
  ongoing_monitoring: ['fatf_r10', 'fatf_r20'],
  source_of_funds: ['fatf_r10', 'fatf_r12'],
  source_of_wealth: ['fatf_r10', 'fatf_r12'],
  beneficial_ownership: ['fatf_r24', 'fatf_r25'],
  pep_handling: ['fatf_r12'],
  pep_rca: ['fatf_r12'],
  sanctions_screening: ['fatf_r6', 'fatf_r7'],
  adverse_media: ['fatf_r10'],
  str_sar_filing: ['fatf_r20', 'fatf_r21'],
  recordkeeping: ['fatf_r11'],
  training: ['fatf_r18'],
  governance: ['fatf_r18'],
  four_eyes: ['fatf_r18'],
  correspondent_banking: ['fatf_r13'],
  vasp_crypto: ['fatf_r15', 'fatf_r16'],
  dpms_precious_metals: ['fatf_r22', 'fatf_r23'],
  trade_based_ml: ['fatf_r10', 'fatf_r20'],
  structuring: ['fatf_r10', 'fatf_r20'],
  npo_risk: ['fatf_r8'],
  shell_company: ['fatf_r24', 'fatf_r25'],
  proliferation_financing: ['fatf_r7'],
  cahra_jurisdiction: ['fatf_r19'],
  risk_appetite: ['fatf_r1'],
  tipping_off_guard: ['fatf_r21'],
  regulatory_reporting: ['fatf_r29', 'fatf_r33'],
  audit_examination: ['fatf_r18', 'fatf_r34'],
  typology_research: ['fatf_r1', 'fatf_r3'],
  general_compliance: ['fatf_r1'],
};

const TOPIC_TO_TYPOLOGIES: Record<MlroTopic, TypologyId[]> = {
  cdd: [],
  edd: ['pep'],
  ongoing_monitoring: [],
  source_of_funds: [],
  source_of_wealth: ['kleptocracy'],
  beneficial_ownership: ['shell_company_chain', 'nominee_directors'],
  pep_handling: ['pep'],
  pep_rca: ['pep_rca'],
  sanctions_screening: ['sanctions_evasion'],
  adverse_media: [],
  str_sar_filing: [],
  recordkeeping: [],
  training: [],
  governance: [],
  four_eyes: [],
  correspondent_banking: ['correspondent_banking'],
  vasp_crypto: ['vasp', 'mixer_usage', 'privacy_coin_laundering', 'nft_wash_trade', 'defi_exploit'],
  dpms_precious_metals: ['dpms_retail', 'dpms_refinery', 'bullion_wholesale'],
  trade_based_ml: ['tbml', 'tbml_phantom_shipment'],
  structuring: ['structuring', 'smurfing', 'cash_courier'],
  npo_risk: ['npo_diversion'],
  shell_company: ['shell_company_chain', 'nominee_directors'],
  proliferation_financing: ['proliferation', 'arms_trafficking'],
  cahra_jurisdiction: [],
  risk_appetite: [],
  tipping_off_guard: [],
  regulatory_reporting: [],
  audit_examination: [],
  typology_research: [],
  general_compliance: [],
};

const TOPIC_TO_FOLLOWUPS: Record<MlroTopic, string[]> = {
  cdd: [
    'What CDD documents must I retain after onboarding and for how long?',
    'When can I rely on CDD performed by an introducing intermediary?',
    'How do I evidence purpose-and-intended-nature of relationship?',
  ],
  edd: [
    'When does EDD become mandatory for a non-PEP customer?',
    'How do I evidence source-of-wealth for a HNWI client?',
    'What is the cadence for EDD review post-onboarding?',
  ],
  ongoing_monitoring: [
    'What rule sets should sit on top of pure rules-based TM?',
    'How do I dispose of an alert correctly?',
    'When must we re-screen the entire customer book?',
  ],
  source_of_funds: [
    'How do I evidence cash deposits as source-of-funds?',
    'What is the threshold for SoF documentation under UAE law?',
    'How do I treat third-party funded transactions?',
  ],
  source_of_wealth: [
    'What corroboration is sufficient for SoW for a HNWI?',
    'How do I escalate when SoW cannot be evidenced?',
    'How does SoW differ from SoF in practice?',
  ],
  beneficial_ownership: [
    'How do I identify BO when ownership chains break offshore?',
    'What is the BO of last resort and when does it apply?',
    'How do I file BO with the UAE registry?',
  ],
  pep_handling: [
    'What approval path applies to a foreign PEP onboarding?',
    'When can I step a PEP down to standard CDD?',
    'How do I evidence SoW for a PEP relationship?',
  ],
  pep_rca: [
    'How far does the RCA scope extend in practice?',
    'How do I rebut RCA risk inheritance?',
    'What evidence supports RCA designation?',
  ],
  sanctions_screening: [
    'What is the OFAC 50%-Rule cascade in practice?',
    'How fast must we freeze and notify on a possible match?',
    'What documentation supports a false-positive disposition?',
  ],
  adverse_media: [
    'How do I distinguish allegation, charge, and conviction?',
    'When is multilingual sweep mandatory?',
    'How do I score adverse-media into composite risk?',
  ],
  str_sar_filing: [
    'What is the STR filing window under UAE FDL 10/2025?',
    'When must we file a continuing-activity STR?',
    'How do I write an STR narrative without legal conclusions?',
  ],
  recordkeeping: [
    'What is the retention period for STR records vs CDD records?',
    'How do I handle GDPR erasure during AML retention?',
    'Where are tamper-evidence requirements specified?',
  ],
  training: [
    'How often must AML training be refreshed?',
    'How do I train senior management vs. front-office staff?',
    'What evidence shows training effectiveness in an exam?',
  ],
  governance: [
    'How does the three-lines-of-defence apply to AML?',
    'How often must MLRO report to the Board?',
    'What KRIs should I report to the Audit Committee?',
  ],
  four_eyes: [
    'When does four-eyes become mandatory?',
    'Who is qualified to be the second pair of eyes for sanctions?',
    'How do I document a four-eyes override?',
  ],
  correspondent_banking: [
    'What CBDDQ refresh cadence applies?',
    'How do I assess respondent bank shell-status?',
    'What approval path applies to a high-risk correspondent?',
  ],
  vasp_crypto: [
    'How does the FATF Travel Rule apply to UAE VASPs?',
    'How do I screen unhosted-wallet counterparties?',
    'When can I accept privacy-coin deposits?',
  ],
  dpms_precious_metals: [
    'What is the DPMS cash-transaction threshold under UAE rules?',
    'How does LBMA RGG Step 3 apply to my refinery?',
    'What does the EOCN annual return require?',
  ],
  trade_based_ml: [
    'How do I detect over- vs under-invoicing?',
    'What evidence verifies physical shipment?',
    'How do I treat third-party payments in trade finance?',
  ],
  structuring: [
    'How do I aggregate cash deposits across linked customers?',
    'What is the cuckoo-smurfing typology?',
    'When do I file STR vs request RFI on threshold avoidance?',
  ],
  npo_risk: [
    'How do I apply FATF R.8 risk-based oversight to NPOs?',
    'What due diligence applies to cross-border NPO disbursements?',
    'How do I treat large-cash NPO donors?',
  ],
  shell_company: [
    'What indicators confirm a shell-company designation?',
    'How do I apply OFAC 50%-Rule across a shell network?',
    'When does substance-test require relationship exit?',
  ],
  proliferation_financing: [
    'How do I identify dual-use goods beyond HS-codes?',
    'How do I authenticate end-user certificates?',
    'What sanctions regime applies to DPRK / Iran nexus?',
  ],
  cahra_jurisdiction: [
    'How does OECD DDG five-step methodology apply?',
    'What is the CAHRA classification process?',
    'How do I disclose CAHRA-related diligence publicly?',
  ],
  risk_appetite: [
    'How do I quantify risk appetite by segment?',
    'How do I escalate residual-risk breaches?',
    'What KRIs anchor risk-appetite governance?',
  ],
  tipping_off_guard: [
    'How do I close an account during an active STR?',
    'How do I request KYC documents without tipping off?',
    'When can I share STR information internally?',
  ],
  regulatory_reporting: [
    'What is the goAML STR filing window?',
    'How do I respond to an FIU information request?',
    'How do I correct an erroneous prior filing?',
  ],
  audit_examination: [
    'How do I prepare for a regulatory examination?',
    'How do I track audit findings through to closure?',
    'How do I handle privileged information during audit?',
  ],
  typology_research: [
    'How do I refresh internal typology library?',
    'How do I integrate new typologies into detection rules?',
    'How do I source emerging typologies (AI fraud, deepfakes)?',
  ],
  general_compliance: [
    'When in doubt, what is the conservative interpretation?',
    'How do I document a compliance decision properly?',
    'When does self-disclosure mitigate enforcement risk?',
  ],
};

// ── Jurisdictions and regimes ─────────────────────────────────────────────

const JURISDICTION_SIGNALS: Array<{ tag: string; keywords: RegExp[] }> = [
  { tag: 'UAE', keywords: [/\buae\b/i, /united arab emirates/i, /\bcbuae\b/i, /\bdfsa\b/i, /\bvara\b/i, /\bgoaml\b/i, /\bfdl\b/i, /\bmoe\s*circular/i, /\bdpms\b/i, /\beocn\b/i, /dubai|abu dhabi|sharjah|fujairah|ajman|ras al khaimah|umm al quwain/i] },
  { tag: 'US', keywords: [/bank secrecy act/i, /\bbsa\b/i, /\bofac\b/i, /\bfincen\b/i, /\bfatca\b/i, /patriot act/i, /\bsec\b/i] },
  { tag: 'EU', keywords: [/\b(?:5|6)amld\b/i, /\bamld\b/i, /eu directive/i, /european union/i, /\beba\b/i, /eu council/i] },
  { tag: 'UK', keywords: [/mlr 2017/i, /proceeds of crime act/i, /\bpoca\b/i, /\bfca\b/i, /\bhmrc\b/i, /\bofsi\b/i] },
  { tag: 'FATF/Global', keywords: [/\bfatf\b/i, /\bunscr\b/i, /\bwolfsberg\b/i, /\begmont\b/i, /basel aml index/i] },
  { tag: 'Switzerland', keywords: [/swiss/i, /\bfinma\b/i, /\bfdfa\b/i] },
  { tag: 'Singapore', keywords: [/\bmas\b/i, /singapore/i] },
  { tag: 'Hong Kong', keywords: [/hong kong/i, /\bhkma\b/i, /\bsfc\b/i] },
];

const REGIME_SIGNALS: Array<{ id: SanctionRegimeId; rx: RegExp }> = [
  { id: 'ofac_sdn', rx: /\bofac\s*(?:sdn|specially designated)/i },
  { id: 'ofac_cons', rx: /ofac\s*non.?sdn|ofac\s*consolidated/i },
  { id: 'un_1267', rx: /\bun\s*1267\b|isil|al.?qaida|taliban (?:sanctions)?/i },
  { id: 'un_1988', rx: /\bun\s*1988\b/i },
  { id: 'un_dprk', rx: /\bdprk\b|north korea/i },
  { id: 'un_iran', rx: /\bun\s*(?:iran|2231)\b/i },
  { id: 'un_libya', rx: /libya sanctions/i },
  { id: 'un_somalia', rx: /somalia sanctions/i },
  { id: 'eu_consolidated', rx: /eu\s*(?:consolidated|cfsp|sanctions list)/i },
  { id: 'eu_russia', rx: /eu\s*russia\s*sanctions|reg\s*269\/2014|reg\s*833\/2014/i },
  { id: 'eu_belarus', rx: /eu\s*belarus\s*sanctions/i },
  { id: 'eu_iran', rx: /eu\s*iran\s*sanctions/i },
  { id: 'uk_ofsi', rx: /\bofsi\b|uk consolidated/i },
  { id: 'uk_russia', rx: /uk\s*russia/i },
  { id: 'uk_belarus', rx: /uk\s*belarus/i },
  { id: 'uae_eocn', rx: /\beocn\b|executive office.{0,20}(?:control|notification)/i },
  { id: 'uae_local_terrorist', rx: /uae\s*(?:local )?terrorist list/i },
  { id: 'switzerland_fdfa', rx: /swiss\s*(?:fdfa|seco)/i },
  { id: 'canada_sema', rx: /\bsema\b|canada sanctions/i },
  { id: 'singapore_mas', rx: /mas\s*sanctions/i },
];

const URGENCY_PATTERNS: Array<{ flag: UrgencyFlag; rx: RegExp }> = [
  { flag: 'tipping_off_risk', rx: /tip.?off|inform the (?:client|customer|subject)|tell the (?:client|customer)|alert the (?:subject|customer)/i },
  { flag: 'imminent_sar_window', rx: /\b(?:asap|urgent|immediately|within \d+\s*(?:hours?|days?))/i },
  { flag: 'retention_breach', rx: /destroy(?:ed)? (?:before|after)|retention (?:expired|breach)|cannot retain|gdpr erasure/i },
  { flag: 'mnpi_exposure', rx: /\bmnpi\b|material non.?public/i },
  { flag: 'sanctions_hit_review', rx: /sanctions?\s*(?:hit|match|alert|name screen)/i },
  { flag: 'cross_border_block', rx: /cross.?border\s*(?:block|payment|wire|transfer)|wire\s*(?:block|hold)/i },
];

// ── Public API ────────────────────────────────────────────────────────────

export function classifyMlroQuestion(question: string): MlroQuestionAnalysis {
  const text = (question ?? '').slice(0, 4000);

  // 1 · Score each topic by regex hit count.
  const scores = new Map<MlroTopic, number>();
  (Object.keys(KEYWORD_TOPIC_MAP) as MlroTopic[]).forEach((topic) => {
    if (topic === 'general_compliance') return; // fallback only
    let score = 0;
    for (const rx of KEYWORD_TOPIC_MAP[topic]) {
      const m = text.match(new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`));
      if (m) score += m.length;
    }
    if (score > 0) scores.set(topic, score);
  });

  const ordered = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topics: MlroTopic[] = ordered.length > 0
    ? ordered.map(([t]) => t)
    : ['general_compliance'];
  const primaryTopic: MlroTopic = topics[0] ?? 'general_compliance';
  const primaryScore = ordered[0]?.[1] ?? 0;

  // 2 · Jurisdiction detection.
  const jurisdictions: string[] = [];
  for (const j of JURISDICTION_SIGNALS) {
    if (j.keywords.some((kw) => kw.test(text))) jurisdictions.push(j.tag);
  }

  // 3 · Sanctions regimes.
  const regimes: SanctionRegimeId[] = [];
  for (const r of REGIME_SIGNALS) {
    if (r.rx.test(text) && !regimes.includes(r.id)) regimes.push(r.id);
  }

  // 4 · Urgency flags.
  const urgencyFlags: UrgencyFlag[] = [];
  for (const u of URGENCY_PATTERNS) {
    if (u.rx.test(text) && !urgencyFlags.includes(u.flag)) urgencyFlags.push(u.flag);
  }

  // 5 · Numeric thresholds.
  const numericThresholds = extractNumericThresholds(text);

  // 6 · Resolve hint sets (top 3 topics for breadth, primary for narrative).
  const dedup = <T>(xs: T[]): T[] => Array.from(new Set(xs));
  const topTopics = topics.slice(0, 3);
  const doctrineHints: DoctrineId[] = dedup(topTopics.flatMap((t) => TOPIC_TO_DOCTRINES[t] ?? []));
  const playbookHints: string[] = dedup(topTopics.flatMap((t) => TOPIC_TO_PLAYBOOKS[t] ?? []));
  const redFlagHints: string[] = dedup(topTopics.flatMap((t) => TOPIC_TO_RED_FLAGS[t] ?? []));
  const fatfRecHints: string[] = dedup(topTopics.flatMap((t) => TOPIC_TO_FATF[t] ?? []));
  const typologies: TypologyId[] = dedup(topTopics.flatMap((t) => TOPIC_TO_TYPOLOGIES[t] ?? []));
  const suggestedFollowUps: string[] = TOPIC_TO_FOLLOWUPS[primaryTopic] ?? [];

  // 7 · Common-sense rules — primary topic only.
  const commonSenseRules: string[] = rulesForTopic(primaryTopic, 5).map((r) => `${r.rule} [${r.doctrineAnchor}]`);
  if (commonSenseRules.length === 0) {
    commonSenseRules.push(...COMMON_SENSE_RULES.filter((r) => r.topic === 'general_compliance').slice(0, 5).map((r) => `${r.rule} [${r.doctrineAnchor}]`));
  }

  // 8 · Confidence.
  const confidence: 'high' | 'medium' | 'low' =
    primaryScore >= 3 ? 'high' : primaryScore >= 1 ? 'medium' : 'low';

  // 9 · Enriched preamble — injectable into the advisor user prompt.
  const enrichedPreamble = buildPreamble({
    primaryTopic,
    secondaryTopics: topics.slice(1, 3),
    jurisdictions,
    regimes,
    fatfRecHints,
    doctrineHints,
    playbookHints,
    redFlagHints,
    typologies,
    urgencyFlags,
    numericThresholds,
    commonSenseRules,
  });

  return {
    topics,
    primaryTopic,
    jurisdictions,
    regimes,
    typologies,
    doctrineHints,
    fatfRecHints,
    playbookHints,
    redFlagHints,
    urgencyFlags,
    numericThresholds,
    commonSenseRules,
    suggestedFollowUps,
    confidence,
    enrichedPreamble,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────

function extractNumericThresholds(text: string): NumericThreshold[] {
  const out: NumericThreshold[] = [];
  const rx = /(\d{1,3}(?:[,\d]{0,12})?(?:\.\d+)?)\s*(usd|aed|eur|gbp|btc|eth|usdt|days?|months?|years?|hours?|%)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const raw = (m[1] ?? '').replace(/,/g, '');
    const unit = (m[2] ?? '').toUpperCase();
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) continue;
    const start = Math.max(0, m.index - 30);
    const end = Math.min(text.length, m.index + (m[0]?.length ?? 0) + 30);
    out.push({ value, unit, context: text.slice(start, end).trim() });
    if (out.length >= 8) break;
  }
  return out;
}

function buildPreamble(p: {
  primaryTopic: MlroTopic;
  secondaryTopics: MlroTopic[];
  jurisdictions: string[];
  regimes: SanctionRegimeId[];
  fatfRecHints: string[];
  doctrineHints: DoctrineId[];
  playbookHints: string[];
  redFlagHints: string[];
  typologies: TypologyId[];
  urgencyFlags: UrgencyFlag[];
  numericThresholds: NumericThreshold[];
  commonSenseRules: string[];
}): string {
  const lines: string[] = [];
  lines.push('CLASSIFIER PRE-BRIEF (Hawkeye Sterling — apply verbatim citations where helpful):');
  lines.push(`• Primary topic: ${p.primaryTopic.replace(/_/g, ' ')}.${p.secondaryTopics.length ? ` Secondary: ${p.secondaryTopics.map((t) => t.replace(/_/g, ' ')).join('; ')}.` : ''}`);
  if (p.jurisdictions.length) lines.push(`• Jurisdictions in scope: ${p.jurisdictions.join(', ')}.`);
  if (p.regimes.length) lines.push(`• Sanctions regimes implicated: ${p.regimes.join(', ')}.`);
  if (p.fatfRecHints.length) lines.push(`• FATF Recommendations to anchor: ${p.fatfRecHints.join(', ')}.`);
  if (p.doctrineHints.length) lines.push(`• Doctrines: ${p.doctrineHints.join(', ')}.`);
  if (p.playbookHints.length) lines.push(`• Internal playbooks: ${p.playbookHints.slice(0, 8).join(', ')}.`);
  if (p.typologies.length) lines.push(`• Typology fingerprints: ${p.typologies.join(', ')}.`);
  if (p.redFlagHints.length) lines.push(`• Red flags to consider: ${p.redFlagHints.slice(0, 8).join(', ')}.`);
  if (p.urgencyFlags.length) lines.push(`• URGENCY FLAGS: ${p.urgencyFlags.join(', ')}. Treat with priority.`);
  if (p.numericThresholds.length) {
    lines.push(`• Numeric thresholds in question: ${p.numericThresholds.map((n) => `${n.value} ${n.unit}`).join('; ')}.`);
  }
  if (p.commonSenseRules.length) {
    lines.push('• Common-sense rules to apply (cite the doctrine anchor):');
    p.commonSenseRules.forEach((r, i) => lines.push(`   ${i + 1}. ${r}`));
  }
  lines.push('Where the user question is ambiguous, name the assumption and answer under it. Cite at least one anchor per material claim.');
  return lines.join('\n');
}
