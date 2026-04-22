// Hawkeye Sterling — FATF 40 Recommendations index.
// Maps each Recommendation to the reasoning modes, doctrines, and typologies
// the brain should engage when a control-effectiveness question is asked
// against that Recommendation. Citing FATF R.X in a finding REQUIRES that the
// engaged modes are among this list.

export interface FatfRecommendation {
  id: string;           // 'R.1', 'R.10', ...
  title: string;
  cluster:
    | 'risk_and_coordination'
    | 'ml_tf_offences'
    | 'confiscation'
    | 'preventive_cdd'
    | 'preventive_tr_reporting'
    | 'transparency_bo'
    | 'competent_authorities'
    | 'international_cooperation';
  reasoningModes: string[];
  doctrineIds: string[];
}

export const FATF_RECOMMENDATIONS: FatfRecommendation[] = [
  { id: 'R.1',  title: 'Assessing risks and applying a risk-based approach', cluster: 'risk_and_coordination', reasoningModes: ['risk_based_approach', 'kri_alignment', 'residual_vs_inherent'], doctrineIds: ['fatf_rba'] },
  { id: 'R.2',  title: 'National cooperation and coordination', cluster: 'risk_and_coordination', reasoningModes: ['regulatory_mapping'], doctrineIds: [] },
  { id: 'R.3',  title: 'Money laundering offence', cluster: 'ml_tf_offences', reasoningModes: ['article_by_article'], doctrineIds: ['uae_fdl_20_2018'] },
  { id: 'R.4',  title: 'Confiscation and provisional measures', cluster: 'confiscation', reasoningModes: ['escalation_trigger'], doctrineIds: [] },
  { id: 'R.5',  title: 'Terrorist financing offence', cluster: 'ml_tf_offences', reasoningModes: ['article_by_article'], doctrineIds: ['uae_fdl_20_2018'] },
  { id: 'R.6',  title: 'Targeted financial sanctions — terrorism & TF', cluster: 'preventive_cdd', reasoningModes: ['sanctions_regime_matrix', 'list_walk', 'escalation_trigger'], doctrineIds: ['uae_cd_74_2020'] },
  { id: 'R.7',  title: 'Targeted financial sanctions — proliferation', cluster: 'preventive_cdd', reasoningModes: ['sanctions_regime_matrix', 'pf_dual_use_controls'], doctrineIds: ['uae_cd_74_2020'] },
  { id: 'R.8',  title: 'Non-profit organisations', cluster: 'preventive_cdd', reasoningModes: ['risk_based_approach', 'jurisdiction_cascade'], doctrineIds: ['fatf_rba'] },
  { id: 'R.9',  title: 'Financial institution secrecy laws', cluster: 'preventive_cdd', reasoningModes: ['regulatory_mapping'], doctrineIds: [] },
  { id: 'R.10', title: 'Customer due diligence', cluster: 'preventive_cdd', reasoningModes: ['cdd_prospect_individual', 'cdd_prospect_entity', 'completeness_audit'], doctrineIds: ['fatf_rba', 'wolfsberg_faq'] },
  { id: 'R.11', title: 'Record keeping', cluster: 'preventive_cdd', reasoningModes: ['retention_audit', 'documentation_quality'], doctrineIds: ['uae_fdl_10_2025'] },
  { id: 'R.12', title: 'Politically Exposed Persons', cluster: 'preventive_cdd', reasoningModes: ['pep_domestic_minister'], doctrineIds: ['wolfsberg_faq'] },
  { id: 'R.13', title: 'Correspondent banking', cluster: 'preventive_cdd', reasoningModes: ['corresp_nested_bank_flow', 'kyb_strict'], doctrineIds: ['wolfsberg_correspondent'] },
  { id: 'R.14', title: 'Money or value transfer services', cluster: 'preventive_cdd', reasoningModes: ['pay_msb_onboard' as string], doctrineIds: [] },
  { id: 'R.15', title: 'New technologies', cluster: 'preventive_cdd', reasoningModes: ['vasp_wallet_screen', 'vasp_travel_rule', 'defi_smart_contract'], doctrineIds: ['fatf_rba'] },
  { id: 'R.16', title: 'Wire transfers — travel rule', cluster: 'preventive_cdd', reasoningModes: ['vasp_travel_rule', 'completeness_audit'], doctrineIds: [] },
  { id: 'R.17', title: 'Reliance on third parties', cluster: 'preventive_cdd', reasoningModes: ['source_triangulation', 'documentation_quality'], doctrineIds: [] },
  { id: 'R.18', title: 'Internal controls & foreign branches', cluster: 'preventive_tr_reporting', reasoningModes: ['three_lines_defence', 'training_inadequacy', 'documentation_quality'], doctrineIds: ['three_lines_defence'] },
  { id: 'R.19', title: 'Higher-risk countries', cluster: 'preventive_cdd', reasoningModes: ['jurisdiction_cascade', 'risk_adjusted'], doctrineIds: ['basel_aml_index'] },
  { id: 'R.20', title: 'Reporting of suspicious transactions', cluster: 'preventive_tr_reporting', reasoningModes: ['filing_str_narrative', 'sla_check'], doctrineIds: [] },
  { id: 'R.21', title: 'Tipping-off and confidentiality', cluster: 'preventive_tr_reporting', reasoningModes: ['policy_drift', 'exception_log'], doctrineIds: ['uae_fdl_20_2018'] },
  { id: 'R.22', title: 'DNFBPs — CDD', cluster: 'preventive_cdd', reasoningModes: ['dpms_retail_threshold', 'kpi_dpms_thirty'], doctrineIds: ['uae_moe_dnfbp_circulars'] },
  { id: 'R.23', title: 'DNFBPs — other measures', cluster: 'preventive_tr_reporting', reasoningModes: ['filing_str_narrative'], doctrineIds: ['uae_moe_dnfbp_circulars'] },
  { id: 'R.24', title: 'Transparency of legal persons (BO)', cluster: 'transparency_bo', reasoningModes: ['ubo_25_threshold', 'ubo_effective_control', 'ubo_nominee_directors', 'ubo_bearer_shares', 'ubo_tree_walk'], doctrineIds: [] },
  { id: 'R.25', title: 'Transparency of legal arrangements (trusts etc.)', cluster: 'transparency_bo', reasoningModes: ['ubo_effective_control', 'ubo_tree_walk'], doctrineIds: [] },
  { id: 'R.26', title: 'Regulation and supervision of FIs', cluster: 'competent_authorities', reasoningModes: ['regulatory_mapping'], doctrineIds: [] },
  { id: 'R.27', title: 'Powers of supervisors', cluster: 'competent_authorities', reasoningModes: ['regulatory_mapping'], doctrineIds: [] },
  { id: 'R.28', title: 'Regulation and supervision of DNFBPs', cluster: 'competent_authorities', reasoningModes: ['regulatory_mapping', 'peer_benchmark'], doctrineIds: ['uae_moe_dnfbp_circulars'] },
  { id: 'R.29', title: 'Financial intelligence units', cluster: 'competent_authorities', reasoningModes: ['source_triangulation'], doctrineIds: ['egmont_fiu'] },
  { id: 'R.30', title: 'Responsibilities of law enforcement and investigative authorities', cluster: 'competent_authorities', reasoningModes: [], doctrineIds: [] },
  { id: 'R.31', title: 'Powers of law enforcement and investigative authorities', cluster: 'competent_authorities', reasoningModes: [], doctrineIds: [] },
  { id: 'R.32', title: 'Cash couriers', cluster: 'competent_authorities', reasoningModes: ['cash_courier_ctn', 'jurisdiction_cascade'], doctrineIds: [] },
  { id: 'R.33', title: 'Statistics', cluster: 'competent_authorities', reasoningModes: ['data_quality_score'], doctrineIds: [] },
  { id: 'R.34', title: 'Guidance and feedback', cluster: 'competent_authorities', reasoningModes: ['peer_benchmark'], doctrineIds: [] },
  { id: 'R.35', title: 'Sanctions', cluster: 'competent_authorities', reasoningModes: ['proportionality_test'], doctrineIds: ['uae_cr_16_2021'] },
  { id: 'R.36', title: 'International instruments', cluster: 'international_cooperation', reasoningModes: ['regulatory_mapping'], doctrineIds: [] },
  { id: 'R.37', title: 'Mutual legal assistance', cluster: 'international_cooperation', reasoningModes: [], doctrineIds: [] },
  { id: 'R.38', title: 'Mutual legal assistance — freezing and confiscation', cluster: 'international_cooperation', reasoningModes: [], doctrineIds: [] },
  { id: 'R.39', title: 'Extradition', cluster: 'international_cooperation', reasoningModes: [], doctrineIds: [] },
  { id: 'R.40', title: 'Other forms of international cooperation', cluster: 'international_cooperation', reasoningModes: ['source_triangulation'], doctrineIds: ['egmont_fiu'] },
];

export const FATF_BY_ID: Map<string, FatfRecommendation> = new Map(
  FATF_RECOMMENDATIONS.map((r) => [r.id, r]),
);
