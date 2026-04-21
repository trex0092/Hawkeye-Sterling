// The ten cognitive faculties of Hawkeye Sterling.
// Each faculty has a synonym cluster (declares what the faculty thinks about)
// and a set of reasoning-mode IDs it draws on when invoked.
// Synonyms are the user's exact input — treated as the authoritative scope declaration.

import type { Faculty } from './types.js';

export const FACULTIES: Faculty[] = [
  {
    id: 'reasoning',
    displayName: 'Reasoning',
    describes: 'Formal and informal logical inference over evidence and rules.',
    synonyms: [
      'logic', 'deduction', 'inference', 'rationalization', 'argumentation',
      'analysis', 'cogitation', 'ratiocination', 'sense-making', 'thought process',
    ],
    modes: [
      'modus_ponens', 'modus_tollens', 'reductio', 'syllogistic',
      'propositional_logic', 'predicate_logic', 'fuzzy_logic', 'probabilistic_logic',
      'default_reasoning', 'non_monotonic', 'paraconsistent', 'modal_logic',
      'deontic_logic', 'temporal_logic', 'epistemic_logic',
      'occam_vs_conspiracy', 'popper_falsification', 'burden_of_proof',
      'presumption_innocence', 'triangulation', 'saturation',
      'counterexample_search', 'adversarial_collaboration',
    ],
  },
  {
    id: 'data_analysis',
    displayName: 'Data Analysis',
    describes: 'Quantitative interrogation and modelling of structured and semi-structured data.',
    synonyms: [
      'data interpretation', 'data mining', 'data crunching', 'analytics',
      'quantitative analysis', 'statistical analysis', 'data examination',
      'data evaluation', 'data modeling', 'data processing',
    ],
    modes: [
      'bayes_theorem', 'frequentist', 'confidence_interval', 'hypothesis_test',
      'chi_square', 'regression', 'time_series', 'markov_chain', 'hmm',
      'survival', 'entropy', 'kl_divergence', 'mdl', 'occam',
      'centrality', 'community_detection', 'motif_detection', 'shortest_path',
      'velocity_analysis', 'spike_detection', 'seasonality', 'regime_change',
      'sentiment_analysis', 'entity_resolution', 'peer_group_anomaly',
      'monte_carlo', 'fermi', 'sensitivity_tornado',
      'completeness_audit', 'freshness_check', 'reconciliation',
      'discrepancy_log', 'data_quality_score',
      'benford_law', 'split_payment_detection', 'round_trip_transaction',
      'shell_triangulation', 'po_fraud_pattern', 'vendor_master_anomaly',
      'journal_entry_anomaly', 'revenue_recognition_stretch',
      'k_core_analysis', 'bridge_detection', 'temporal_motif',
      'reciprocal_edge_pattern', 'triadic_closure',
      'chain_hopping_velocity', 'peel_chain', 'change_address_heuristic',
      'dempster_shafer', 'bayesian_update_cascade', 'multi_source_consistency',
    ],
  },
  {
    id: 'deep_thinking',
    displayName: 'Deep Thinking',
    describes: 'Slow, reflective examination — the System 2 core of the brain.',
    synonyms: [
      'contemplation', 'reflection', 'rumination', 'introspection', 'meditation',
      'pondering', 'musing', 'deliberation', 'cerebration', 'profound thought',
    ],
    modes: [
      'system_2', 'dual_process', 'pre_mortem', 'post_mortem', 'steelman',
      'hindsight_check', 'scenario_planning', 'war_game',
      'cross_case_triangulation', 'verdict_replay', 'tabletop_exercise',
      'narrative_coherence', 'bayesian_network', 'causal_inference',
    ],
  },
  {
    id: 'intelligence',
    displayName: 'Intelligence',
    describes: 'Breadth of pattern recognition across domains and jurisdictions.',
    synonyms: [
      'intellect', 'acumen', 'cleverness', 'brilliance', 'brainpower',
      'wit', 'sagacity', 'perspicacity', 'mental capacity', 'cognitive ability',
    ],
    modes: [
      'pattern_of_life', 'linguistic_forensics', 'narrative_coherence',
      'link_analysis', 'evidence_graph', 'timeline_reconstruction',
      'kill_chain', 'mitre_attack', 'attack_tree', 'stride', 'pasta',
      'fatf_effectiveness', 'wolfsberg_faq', 'lbma_rgg_five_step', 'oecd_ddg_annex',
      'typology_catalogue', 'sanctions_regime_matrix',
      'socmint_scan', 'geoint_plausibility', 'imint_verification',
      'humint_reliability_grade', 'nato_admiralty_grading', 'osint_chain_of_custody',
      'sanctions_arbitrage', 'offshore_secrecy_index', 'fatf_grey_list_dynamics',
      'russian_oil_price_cap', 'eu_14_package', 'us_secondary_sanctions',
      'chip_export_controls', 'iran_evasion_pattern', 'dprk_evasion_pattern',
      'phantom_vessel', 'flag_hopping', 'dark_fleet_pattern',
      'front_company_fingerprint', 'nominee_rotation_detection',
      'greenwashing_signal', 'forced_labour_supply_chain',
      'conflict_mineral_typology', 'carbon_fraud_pattern',
      'stylometry', 'gaslighting_detection', 'obfuscation_pattern',
      'code_word_detection', 'minimisation_pattern',
    ],
  },
  {
    id: 'smartness',
    displayName: 'Smartness',
    describes: 'Fast, street-smart anomaly detection and heuristic triage.',
    synonyms: [
      'sharpness', 'shrewdness', 'astuteness', 'quick-wittedness', 'savvy',
      'canniness', 'ingenuity', 'resourcefulness', 'adroitness', 'keenness',
    ],
    modes: [
      'system_1', 'ooda', 'availability_check', 'framing_check',
      'anchoring_avoidance', 'spike_detection', 'velocity_analysis',
      'insider_threat', 'collusion_pattern', 'self_dealing', 'front_running',
      'wash_trade', 'spoofing', 'ghost_employees', 'lapping',
      'bec_fraud', 'advance_fee', 'app_scam', 'synthetic_id',
      'ponzi_scheme', 'invoice_fraud', 'phoenix_company',
    ],
  },
  {
    id: 'strong_brain',
    displayName: 'Strong Brain',
    describes: 'Integrated mental prowess — composition of all faculties under load.',
    synonyms: [
      'sharp mind', 'keen intellect', 'powerful mind', 'quick mind', 'agile mind',
      'brilliant mind', 'analytical mind', 'steel-trap mind', 'mental prowess',
      'intellectual firepower',
    ],
    modes: [
      'defence_in_depth', 'three_lines_defence', 'five_pillars',
      'risk_based_approach', 'minimum_viable_compliance', 'swiss_cheese',
      'bowtie', 'fmea', 'fair', 'octave',
      'residual_vs_inherent', 'risk_appetite_check', 'kri_alignment',
      'control_effectiveness', 'regulatory_mapping',
    ],
  },
  {
    id: 'inference',
    displayName: 'Inference',
    describes: 'Probabilistic and causal projection from partial evidence to likely truth.',
    synonyms: [
      'abduction', 'induction', 'deduction', 'best explanation',
      'projection', 'extrapolation', 'causal chain', 'probabilistic update',
    ],
    modes: [
      'bayes_theorem', 'bayesian_network', 'causal_inference',
      'markov_chain', 'hmm', 'probabilistic_logic', 'fuzzy_logic',
      'default_reasoning', 'non_monotonic', 'modal_logic',
      'taint_propagation', 'chain_analysis',
      'dempster_shafer', 'bayesian_update_cascade',
      'cross_chain_taint', 'privacy_pool_exposure', 'tornado_cash_proximity',
    ],
  },
  {
    id: 'argumentation',
    displayName: 'Argumentation',
    describes: 'Structured case-building, rebuttal, and adjudication of competing claims.',
    synonyms: [
      'debate', 'disputation', 'advocacy', 'dialectic', 'rebuttal',
      'rejoinder', 'proof', 'justification',
    ],
    modes: [
      'toulmin', 'irac', 'craac', 'rogerian', 'steelman',
      'policy_vs_rule', 'de_minimis', 'proportionality_test',
      'stare_decisis', 'analogical_precedent', 'gray_zone_resolution',
      'adversarial_collaboration', 'burden_of_proof',
    ],
  },
  {
    id: 'introspection',
    displayName: 'Introspection',
    describes: 'The brain auditing itself — bias, calibration, confidence, drift.',
    synonyms: [
      'self-examination', 'meta-cognition', 'self-critique', 'reflection',
      'calibration', 'bias audit', 'blind-spot review', 'epistemic hygiene',
    ],
    modes: [
      'cognitive_bias_audit', 'confidence_calibration', 'planning_fallacy',
      'overconfidence_check', 'hindsight_check', 'availability_check',
      'framing_check', 'anchoring_avoidance', 'loss_aversion_check',
      'verdict_replay', 'policy_drift', 'documentation_quality',
      'prospect_theory', 'status_quo_bias', 'endowment_effect',
      'hyperbolic_discount', 'certainty_effect', 'reference_point_shift',
      'mental_accounting',
      'counter_evidence_weighting', 'false_flag_check',
      'completeness_audit',
    ],
  },
  {
    id: 'ratiocination',
    displayName: 'Ratiocination',
    describes: 'Chained methodical reasoning — the explicit, stepwise derivation of conclusions.',
    synonyms: [
      'methodical reasoning', 'stepwise deduction', 'chain of thought',
      'systematic inference', 'rigorous derivation',
    ],
    modes: [
      'five_whys', 'fishbone', 'pareto', 'timeline_reconstruction',
      'evidence_graph', 'link_analysis', 'source_triangulation',
      'audit_trail_reconstruction', 'reconciliation', 'provenance_trace',
      'lineage', 'article_by_article', 'cabinet_res_walk',
      'circular_walk', 'list_walk', 'ubo_tree_walk', 'jurisdiction_cascade',
    ],
  },
];

export const FACULTY_BY_ID: Map<string, Faculty> = new Map(
  FACULTIES.map((f) => [f.id, f]),
);
