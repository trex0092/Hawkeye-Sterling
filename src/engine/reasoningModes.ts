export type ReasoningWave = 1 | 2;

export interface ReasoningMode {
  id: string;
  wave: ReasoningWave;
}

export const REASONING_MODES_WAVE_1 = [
  'modus_ponens', 'modus_tollens', 'reductio', 'syllogistic',
  'propositional_logic', 'predicate_logic', 'fuzzy_logic', 'probabilistic_logic',
  'default_reasoning', 'non_monotonic', 'paraconsistent', 'modal_logic',
  'deontic_logic', 'temporal_logic', 'epistemic_logic', 'system_1', 'system_2',
  'dual_process', 'ooda', 'pre_mortem', 'post_mortem', 'steelman',
  'hindsight_check', 'cognitive_bias_audit', 'confidence_calibration',
  'planning_fallacy', 'availability_check', 'framing_check',
  'overconfidence_check', 'anchoring_avoidance', 'monte_carlo', 'fermi',
  'expected_utility', 'minimax', 'maximin', 'cvar', 'regret_min', 'marginal',
  'cost_benefit', 'break_even', 'real_options', 'sensitivity_tornado',
  'risk_adjusted', 'loss_aversion_check', 'portfolio_view', 'five_whys',
  'fishbone', 'fmea', 'pareto', 'swiss_cheese', 'bowtie', 'kill_chain',
  'timeline_reconstruction', 'evidence_graph', 'link_analysis',
  'three_lines_defence', 'five_pillars', 'risk_based_approach',
  'fatf_effectiveness', 'wolfsberg_faq', 'lbma_rgg_five_step',
  'oecd_ddg_annex', 'typology_catalogue', 'article_by_article',
  'cabinet_res_walk', 'circular_walk', 'list_walk', 'ubo_tree_walk',
  'jurisdiction_cascade', 'sanctions_regime_matrix', 'kpi_dpms_thirty',
  'emirate_jurisdiction', 'source_triangulation', 'retention_audit',
  'peer_benchmark', 'toulmin', 'irac', 'craac', 'rogerian',
  'policy_vs_rule', 'de_minimis', 'proportionality_test', 'stare_decisis',
  'analogical_precedent', 'gray_zone_resolution', 'swot', 'pestle',
  'porter_adapted', 'steep', 'lens_shift', 'stakeholder_map',
  'scenario_planning', 'war_game', 'minimum_viable_compliance',
  'defence_in_depth', 'bayesian_network', 'causal_inference',
  'counterexample_search', 'cross_case_triangulation',
  'adversarial_collaboration',
] as const;

export const REASONING_MODES_WAVE_2 = [
  'bayes_theorem', 'frequentist', 'confidence_interval', 'hypothesis_test',
  'chi_square', 'regression', 'time_series', 'markov_chain', 'hmm',
  'survival', 'entropy', 'kl_divergence', 'mdl', 'occam', 'centrality',
  'community_detection', 'motif_detection', 'shortest_path',
  'occam_vs_conspiracy', 'burden_of_proof', 'presumption_innocence',
  'popper_falsification', 'triangulation', 'saturation', 'stride',
  'pasta', 'attack_tree', 'mitre_attack', 'tabletop_exercise', 'fair',
  'octave', 'velocity_analysis', 'spike_detection', 'seasonality',
  'regime_change', 'sentiment_analysis', 'entity_resolution',
  'narrative_coherence', 'linguistic_forensics', 'pattern_of_life',
  'peer_group_anomaly', 'insider_threat', 'collusion_pattern',
  'self_dealing', 'front_running', 'wash_trade', 'spoofing',
  'ghost_employees', 'lapping', 'ethical_matrix', 'provenance_trace',
  'lineage', 'tamper_detection', 'source_credibility', 'completeness_audit',
  'freshness_check', 'reconciliation', 'discrepancy_log',
  'data_quality_score', 'conflict_interest', 'four_eyes_stress',
  'escalation_trigger', 'sla_check', 'audit_trail_reconstruction',
  'control_effectiveness', 'residual_vs_inherent', 'risk_appetite_check',
  'kri_alignment', 'regulatory_mapping', 'exception_log',
  'training_inadequacy', 'staff_workload', 'documentation_quality',
  'policy_drift', 'verdict_replay', 'chain_analysis', 'taint_propagation',
  'privacy_coin_reasoning', 'bridge_risk', 'mev_scan',
  'stablecoin_reserve', 'nft_wash', 'defi_smart_contract',
  'ucp600_discipline', 'tbml_overlay', 'insurance_wrap',
  'real_estate_cash', 'art_dealer', 'yacht_jet', 'family_office_signal',
  'market_manipulation', 'advance_fee', 'app_scam', 'bec_fraud',
  'synthetic_id', 'ponzi_scheme', 'invoice_fraud', 'phoenix_company',
  'sanctions_maritime_stss', 'kyb_strict',
] as const;

export type ReasoningModeIdWave1 = typeof REASONING_MODES_WAVE_1[number];
export type ReasoningModeIdWave2 = typeof REASONING_MODES_WAVE_2[number];
export type ReasoningModeId = ReasoningModeIdWave1 | ReasoningModeIdWave2;

export const REASONING_MODES: readonly ReasoningMode[] = [
  ...REASONING_MODES_WAVE_1.map((id) => ({ id, wave: 1 as const })),
  ...REASONING_MODES_WAVE_2.map((id) => ({ id, wave: 2 as const })),
];

export const REASONING_MODE_IDS: readonly ReasoningModeId[] = REASONING_MODES.map((m) => m.id);

export function isReasoningModeId(id: string): id is ReasoningModeId {
  return (REASONING_MODE_IDS as readonly string[]).includes(id);
}
