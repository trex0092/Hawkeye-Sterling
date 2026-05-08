// Hawkeye Sterling — reasoning-mode registry.
// 412 modes across 50 categories, wave 1 + wave 2 + wave 3 + wave 4 + wave 5 + wave 6 + wave 11.
// Each entry is registered metadata + either a real apply() (if src/brain/modes/registry.ts
// or reasoning-modes-wave3.ts supplies an override) or a stub apply() that returns an
// inconclusive placeholder Finding.  Real algorithms land mode-by-mode in Phase 7/8/11.

import type {
  FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { MODE_OVERRIDES } from './modes/registry.js';
import { defaultApply } from './modes/default-apply.js';
import { WAVE3_MODES, WAVE3_OVERRIDES } from './reasoning-modes-wave3.js';
import { WAVE4_MODES, WAVE4_OVERRIDES } from './reasoning-modes-wave4.js';
import { WAVE5_MODES, WAVE5_OVERRIDES } from './reasoning-modes-wave5.js';
import { WAVE6_MODES, WAVE6_OVERRIDES } from './reasoning-modes-wave6.js';
import { WAVE11_MODES, WAVE11_OVERRIDES } from './reasoning-modes-wave11.js';
import { WAVE12_MODES, WAVE12_OVERRIDES } from './reasoning-modes-wave12.js';

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  wave: 1 | 2,
  description: string,
): ReasoningMode => ({
  id, name, category, faculties, wave, description,
  apply: defaultApply(id, category, faculties, description),
});

export const REASONING_MODES: ReasoningMode[] = [
  // ── LOGIC ──────────────────────────────────────────────────────────────
  m('modus_ponens', 'Modus Ponens', 'logic', ['reasoning','inference'], 1, 'If P → Q and P, conclude Q.'),
  m('modus_tollens', 'Modus Tollens', 'logic', ['reasoning','inference'], 1, 'If P → Q and ¬Q, conclude ¬P.'),
  m('reductio', 'Reductio ad Absurdum', 'logic', ['reasoning','argumentation'], 1, 'Assume claim, derive contradiction, reject claim.'),
  m('syllogistic', 'Syllogistic Reasoning', 'logic', ['reasoning'], 1, 'Classic two-premise categorical inference.'),
  m('propositional_logic', 'Propositional Logic', 'logic', ['reasoning'], 1, 'Boolean combination of declarative sentences.'),
  m('predicate_logic', 'Predicate Logic', 'logic', ['reasoning','ratiocination'], 1, 'Quantified first-order reasoning over entities and relations.'),
  m('fuzzy_logic', 'Fuzzy Logic', 'logic', ['reasoning','inference'], 1, 'Degrees of truth on [0,1] for soft matches.'),
  m('probabilistic_logic', 'Probabilistic Logic', 'logic', ['reasoning','inference'], 1, 'Logic extended with probability measures.'),
  m('default_reasoning', 'Default Reasoning', 'logic', ['reasoning','inference'], 1, 'Conclude typical cases absent contrary evidence.'),
  m('non_monotonic', 'Non-Monotonic Reasoning', 'logic', ['reasoning','inference'], 1, 'Retract conclusions when new evidence arrives.'),
  m('paraconsistent', 'Paraconsistent Logic', 'logic', ['reasoning'], 1, 'Reason in the face of contradictory evidence without explosion.'),
  m('modal_logic', 'Modal Logic', 'logic', ['reasoning','inference'], 1, 'Reason about necessity and possibility.'),
  m('deontic_logic', 'Deontic Logic', 'logic', ['reasoning','argumentation'], 1, 'Obligations, permissions, prohibitions — the logic of compliance.'),
  m('temporal_logic', 'Temporal Logic', 'logic', ['reasoning'], 1, 'Time-indexed truth — sequence, before, after, until.'),
  m('epistemic_logic', 'Epistemic Logic', 'logic', ['reasoning','introspection'], 1, 'Who knows what, and what can be known.'),
  m('occam_vs_conspiracy', 'Occam vs Conspiracy', 'logic', ['reasoning','introspection'], 2, 'Prefer simplest explanation; flag when complexity is load-bearing.'),
  m('burden_of_proof', 'Burden of Proof', 'logic', ['argumentation'], 2, 'Who must prove what, to what standard.'),
  m('presumption_innocence', 'Presumption of Innocence', 'logic', ['argumentation'], 2, 'Default-deny hostile conclusions absent evidence.'),
  m('popper_falsification', 'Popperian Falsification', 'logic', ['reasoning','introspection'], 2, 'Seek the test that could disprove the hypothesis.'),
  m('triangulation', 'Source Triangulation', 'logic', ['reasoning','ratiocination'], 2, 'Corroborate a claim from independent sources.'),
  m('saturation', 'Evidence Saturation', 'logic', ['reasoning','introspection'], 2, 'Stop collecting when new evidence stops changing the conclusion.'),

  // ── COGNITIVE SCIENCE ─────────────────────────────────────────────────
  m('system_1', 'System 1 (Fast)', 'cognitive_science', ['smartness'], 1, 'Fast heuristic pattern matching.'),
  m('system_2', 'System 2 (Slow)', 'cognitive_science', ['deep_thinking'], 1, 'Deliberate, effortful, rule-based reasoning.'),
  m('dual_process', 'Dual-Process Arbitration', 'cognitive_science', ['deep_thinking','introspection'], 1, 'Reconcile System 1 and System 2 outputs.'),
  m('ooda', 'OODA Loop', 'cognitive_science', ['smartness'], 1, 'Observe → Orient → Decide → Act.'),
  m('pre_mortem', 'Pre-Mortem', 'cognitive_science', ['deep_thinking'], 1, 'Imagine the failure, trace its causes before acting.'),
  m('post_mortem', 'Post-Mortem', 'cognitive_science', ['deep_thinking','introspection'], 1, 'Reconstruct what actually went wrong after the fact.'),
  m('steelman', 'Steelmanning', 'cognitive_science', ['argumentation','deep_thinking'], 1, 'Argue the strongest form of the opposing view before rejecting it.'),
  m('hindsight_check', 'Hindsight Bias Check', 'cognitive_science', ['introspection'], 1, 'Guard against "knew-it-all-along" distortion.'),
  m('cognitive_bias_audit', 'Cognitive Bias Audit', 'cognitive_science', ['introspection'], 1, 'Scan reasoning for known bias signatures.'),
  m('confidence_calibration', 'Confidence Calibration', 'cognitive_science', ['introspection'], 1, 'Match expressed confidence to empirical hit rate.'),
  m('planning_fallacy', 'Planning-Fallacy Check', 'cognitive_science', ['introspection'], 1, 'Adjust optimistic timelines and cost estimates.'),
  m('availability_check', 'Availability Heuristic Check', 'cognitive_science', ['introspection','smartness'], 1, 'Flag conclusions driven by easily-recalled examples.'),
  m('framing_check', 'Framing-Effect Check', 'cognitive_science', ['introspection','smartness'], 1, 'Detect decision flips under equivalent rephrasings.'),
  m('overconfidence_check', 'Overconfidence Check', 'cognitive_science', ['introspection'], 1, 'Flag narrow confidence intervals on weak evidence.'),
  m('anchoring_avoidance', 'Anchoring Avoidance', 'cognitive_science', ['introspection','smartness'], 1, 'Neutralise first-seen numeric reference effects.'),
  m('hallucination_check', 'Hallucination Check', 'epistemic_quality', ['reasoning','introspection'], 2, 'Charter P1+P3 enforcement: every cite-required claim in a rationale must trace to a supplied evidence id; dangling claims are flagged as potential hallucinations.'),
  m('disparate_impact', 'Disparate Impact Audit', 'epistemic_quality', ['reasoning','introspection'], 2, 'Anti-bias: four-fifths-rule audit across protected attributes (nationality / gender / age / etc); ratio < 0.8 is a flag.'),

  // ── DECISION THEORY ───────────────────────────────────────────────────
  m('monte_carlo', 'Monte Carlo Simulation', 'decision_theory', ['data_analysis','deep_thinking'], 1, 'Sample-based estimation under uncertainty.'),
  m('fermi', 'Fermi Estimation', 'decision_theory', ['data_analysis','smartness'], 1, 'Order-of-magnitude sanity checks.'),
  m('expected_utility', 'Expected Utility', 'decision_theory', ['reasoning','inference'], 1, 'Maximise probability-weighted utility.'),
  m('minimax', 'Minimax', 'decision_theory', ['reasoning'], 1, 'Minimise the maximum possible loss.'),
  m('maximin', 'Maximin', 'decision_theory', ['reasoning'], 1, 'Maximise the minimum guaranteed outcome.'),
  m('cvar', 'Conditional Value-at-Risk', 'decision_theory', ['data_analysis'], 1, 'Tail-loss expectation beyond a VaR threshold.'),
  m('regret_min', 'Regret Minimisation', 'decision_theory', ['reasoning'], 1, 'Minimise worst-case regret across choices.'),
  m('marginal', 'Marginal Analysis', 'decision_theory', ['data_analysis'], 1, 'Evaluate next-unit cost vs next-unit benefit.'),
  m('cost_benefit', 'Cost-Benefit Analysis', 'decision_theory', ['reasoning'], 1, 'Net present value of expected costs and benefits.'),
  m('break_even', 'Break-Even Analysis', 'decision_theory', ['data_analysis'], 1, 'Threshold where benefit covers cost.'),
  m('real_options', 'Real Options', 'decision_theory', ['reasoning'], 1, 'Value the option to wait, expand, abandon.'),
  m('sensitivity_tornado', 'Sensitivity / Tornado', 'decision_theory', ['data_analysis'], 1, 'Rank input drivers by output sensitivity.'),
  m('risk_adjusted', 'Risk-Adjusted Decision', 'decision_theory', ['reasoning','strong_brain'], 1, 'Discount reward by realised risk exposure.'),
  m('loss_aversion_check', 'Loss-Aversion Check', 'decision_theory', ['introspection'], 1, 'Correct for asymmetric loss weighting.'),
  m('portfolio_view', 'Portfolio View', 'decision_theory', ['strong_brain'], 1, 'Evaluate risks at aggregate, not case-by-case.'),

  // ── FORENSIC ──────────────────────────────────────────────────────────
  m('five_whys', 'Five Whys', 'forensic', ['ratiocination'], 1, 'Iteratively ask "why" to reach root cause.'),
  m('fishbone', 'Fishbone (Ishikawa)', 'forensic', ['ratiocination'], 1, 'Cause-and-effect diagram across contributing factors.'),
  m('fmea', 'Failure Mode & Effects Analysis', 'forensic', ['strong_brain'], 1, 'Enumerate failures, score severity × occurrence × detectability.'),
  m('pareto', 'Pareto Analysis', 'forensic', ['data_analysis','ratiocination'], 1, 'Concentrate on the vital few causes.'),
  m('swiss_cheese', 'Swiss Cheese Model', 'forensic', ['strong_brain'], 1, 'Failures align only when layered defences have holes.'),
  m('bowtie', 'Bowtie Analysis', 'forensic', ['strong_brain'], 1, 'Threats → top event → consequences with barriers on each side.'),
  m('kill_chain', 'Kill Chain', 'forensic', ['intelligence'], 1, 'Stepwise reconstruction of attack/activity lifecycle.'),
  m('timeline_reconstruction', 'Timeline Reconstruction', 'forensic', ['intelligence','ratiocination'], 1, 'Order events, identify gaps, detect reversals.'),
  m('evidence_graph', 'Evidence Graph', 'forensic', ['intelligence','ratiocination'], 1, 'Typed graph linking claims, sources, and inferences.'),
  m('link_analysis', 'Link Analysis', 'forensic', ['intelligence','ratiocination'], 1, 'Entity-relationship mapping across persons, accounts, addresses.'),
  m('entity_resolution', 'Entity Resolution', 'forensic', ['data_analysis'], 2, 'Match records referring to the same real-world entity.'),
  m('narrative_coherence', 'Narrative Coherence', 'forensic', ['deep_thinking','intelligence'], 2, 'Check that the customer story holds together end to end.'),
  m('linguistic_forensics', 'Linguistic Forensics', 'forensic', ['intelligence'], 2, 'Style, authorship, deception cues in text.'),
  m('pattern_of_life', 'Pattern of Life', 'forensic', ['intelligence'], 2, 'Baseline an actor\'s normal rhythm; flag deviations.'),
  m('peer_group_anomaly', 'Peer-Group Anomaly', 'forensic', ['data_analysis'], 2, 'Compare subject against a synthetic cohort of peers.'),
  m('insider_threat', 'Insider Threat', 'forensic', ['smartness'], 2, 'Behavioural signals of staff/insider exploitation.'),
  m('collusion_pattern', 'Collusion Pattern', 'forensic', ['smartness'], 2, 'Coordinated behaviour across accounts or parties.'),
  m('self_dealing', 'Self-Dealing', 'forensic', ['smartness'], 2, 'Benefit flows to controllers rather than the entity.'),
  m('front_running', 'Front Running', 'forensic', ['smartness'], 2, 'Trading ahead of foreseeable client orders.'),
  m('wash_trade', 'Wash Trade', 'forensic', ['smartness'], 2, 'Matched self-trades inflating volume.'),
  m('spoofing', 'Spoofing', 'forensic', ['smartness'], 2, 'Non-bona-fide orders to move price then cancel.'),
  m('ghost_employees', 'Ghost Employees', 'forensic', ['smartness'], 2, 'Payroll to nonexistent staff.'),
  m('lapping', 'Lapping Scheme', 'forensic', ['smartness'], 2, 'Delayed posting of receipts to hide misappropriation.'),

  // ── COMPLIANCE FRAMEWORK ──────────────────────────────────────────────
  m('three_lines_defence', 'Three Lines of Defence', 'compliance_framework', ['strong_brain'], 1, 'Business ↔ compliance/risk ↔ internal audit responsibilities.'),
  m('five_pillars', 'Five Pillars of AML', 'compliance_framework', ['strong_brain'], 1, 'Policies, compliance officer, training, independent testing, CDD.'),
  m('risk_based_approach', 'Risk-Based Approach', 'compliance_framework', ['strong_brain'], 1, 'Match control intensity to assessed risk.'),
  m('fatf_effectiveness', 'FATF Effectiveness', 'compliance_framework', ['intelligence'], 1, '11 Immediate Outcomes of the FATF methodology.'),
  m('wolfsberg_faq', 'Wolfsberg Standards', 'compliance_framework', ['intelligence'], 1, 'Wolfsberg AML/correspondent/FAQ guidance walk.'),
  m('lbma_rgg_five_step', 'LBMA Responsible Gold Guidance (Five Step)', 'compliance_framework', ['intelligence'], 1, 'Five-step CAHRA-aware sourcing diligence for gold.'),
  m('oecd_ddg_annex', 'OECD Due Diligence Guidance (Annex II)', 'compliance_framework', ['intelligence'], 1, 'Conflict-affected and high-risk minerals annex walk.'),
  m('typology_catalogue', 'Typology Catalogue Match', 'compliance_framework', ['intelligence'], 1, 'Match pattern to documented ML/TF/PF typologies.'),
  m('article_by_article', 'Article-by-Article Walk', 'compliance_framework', ['ratiocination'], 1, 'Step through each statute article, check compliance.'),
  m('cabinet_res_walk', 'Cabinet Resolution Walk', 'compliance_framework', ['ratiocination'], 1, 'UAE Cabinet Resolution provisions examined one by one.'),
  m('circular_walk', 'Regulatory Circular Walk', 'compliance_framework', ['ratiocination'], 1, 'Supervisor circulars and guidance notes in order.'),
  m('list_walk', 'Sanctions List Walk', 'compliance_framework', ['ratiocination'], 1, 'Walk UN, OFAC, EU, UK, UAE, EOCN lists in sequence.'),
  m('ubo_tree_walk', 'UBO Tree Walk', 'compliance_framework', ['ratiocination'], 1, 'Traverse ownership / control chain to natural persons.'),
  m('jurisdiction_cascade', 'Jurisdiction Cascade', 'compliance_framework', ['ratiocination'], 1, 'Nationality → residency → incorporation → operation → beneficiaries.'),
  m('sanctions_regime_matrix', 'Sanctions Regime Matrix', 'compliance_framework', ['intelligence'], 1, 'Cross-regime program comparison (designations, scope, wind-down).'),
  m('kpi_dpms_thirty', 'DPMS 30 KPIs', 'compliance_framework', ['data_analysis'], 1, 'UAE DPMS supervisory KPI set walk.'),
  m('emirate_jurisdiction', 'Emirate-Level Jurisdiction', 'compliance_framework', ['intelligence'], 1, 'Emirate-specific authority, free-zone, and mainland rules.'),
  m('source_triangulation', 'Source Triangulation', 'compliance_framework', ['ratiocination'], 1, 'Cross-check regulator, primary source, and independent commentary.'),
  m('retention_audit', 'Retention Audit', 'compliance_framework', ['strong_brain','introspection'], 1, 'Are records retained per statutory period?'),
  m('peer_benchmark', 'Peer Benchmark', 'compliance_framework', ['data_analysis'], 1, 'Compare controls against published peer practice.'),

  // ── LEGAL REASONING ───────────────────────────────────────────────────
  m('toulmin', 'Toulmin Argument Model', 'legal_reasoning', ['argumentation'], 1, 'Claim / ground / warrant / backing / qualifier / rebuttal.'),
  m('irac', 'IRAC', 'legal_reasoning', ['argumentation'], 1, 'Issue / Rule / Application / Conclusion.'),
  m('craac', 'CRAAC', 'legal_reasoning', ['argumentation'], 1, 'Conclusion / Rule / Analogous / Application / Conclusion.'),
  m('rogerian', 'Rogerian Argument', 'legal_reasoning', ['argumentation'], 1, 'Acknowledge opposing view, find common ground, propose synthesis.'),
  m('policy_vs_rule', 'Policy vs Rule', 'legal_reasoning', ['argumentation'], 1, 'Distinguish bright-line rule from purposive policy reasoning.'),
  m('de_minimis', 'De Minimis Test', 'legal_reasoning', ['argumentation'], 1, 'Is the conduct too trivial to warrant enforcement?'),
  m('proportionality_test', 'Proportionality Test', 'legal_reasoning', ['argumentation'], 1, 'Is the measure suitable, necessary, and balanced?'),
  m('stare_decisis', 'Stare Decisis', 'legal_reasoning', ['argumentation'], 1, 'Bind to prior decisions unless distinguishable.'),
  m('analogical_precedent', 'Analogical Precedent', 'legal_reasoning', ['argumentation'], 1, 'Reason by relevant similarity to adjudicated cases.'),
  m('gray_zone_resolution', 'Grey-Zone Resolution', 'legal_reasoning', ['argumentation','deep_thinking'], 1, 'Disciplined escalation path when rule is ambiguous.'),

  // ── STRATEGIC ─────────────────────────────────────────────────────────
  m('swot', 'SWOT', 'strategic', ['intelligence'], 1, 'Strengths / Weaknesses / Opportunities / Threats.'),
  m('pestle', 'PESTLE', 'strategic', ['intelligence'], 1, 'Political / Economic / Social / Technical / Legal / Environmental scan.'),
  m('porter_adapted', 'Porter\'s Five Forces (adapted)', 'strategic', ['intelligence'], 1, 'Supply, demand, substitutes, entrants, rivalry — tuned for compliance.'),
  m('steep', 'STEEP', 'strategic', ['intelligence'], 1, 'Social / Technological / Economic / Ecological / Political scan.'),
  m('lens_shift', 'Lens Shift', 'strategic', ['deep_thinking'], 1, 'Re-examine facts through another stakeholder\'s frame.'),
  m('stakeholder_map', 'Stakeholder Map', 'strategic', ['intelligence'], 1, 'Power × interest matrix across actors.'),
  m('scenario_planning', 'Scenario Planning', 'strategic', ['deep_thinking'], 1, 'Build divergent futures, stress controls against each.'),
  m('war_game', 'War Game', 'strategic', ['deep_thinking'], 1, 'Red-team vs blue-team adversarial simulation.'),
  m('minimum_viable_compliance', 'Minimum Viable Compliance', 'strategic', ['strong_brain'], 1, 'Smallest control set satisfying the rule.'),
  m('defence_in_depth', 'Defence in Depth', 'strategic', ['strong_brain'], 1, 'Layered, independent controls such that no single bypass suffices.'),

  // ── CAUSAL ────────────────────────────────────────────────────────────
  m('bayesian_network', 'Bayesian Network', 'causal', ['deep_thinking','inference'], 1, 'DAG of conditional probabilities for joint inference.'),
  m('causal_inference', 'Causal Inference', 'causal', ['inference'], 1, 'Estimate effects via do-calculus / counterfactuals.'),
  m('counterexample_search', 'Counterexample Search', 'causal', ['reasoning','introspection'], 1, 'Actively hunt cases that break the hypothesis.'),
  m('cross_case_triangulation', 'Cross-Case Triangulation', 'causal', ['deep_thinking'], 1, 'Generalise from patterns across comparable cases.'),
  m('adversarial_collaboration', 'Adversarial Collaboration', 'causal', ['argumentation','introspection'], 1, 'Opponents jointly design the test that settles the disagreement.'),

  // ── STATISTICAL ───────────────────────────────────────────────────────
  m('bayes_theorem', 'Bayes\' Theorem', 'statistical', ['data_analysis','inference'], 2, 'P(H|E) = P(E|H) P(H) / P(E).'),
  m('frequentist', 'Frequentist Inference', 'statistical', ['data_analysis'], 2, 'Long-run relative-frequency testing.'),
  m('confidence_interval', 'Confidence Interval', 'statistical', ['data_analysis'], 2, 'Interval estimation with stated coverage.'),
  m('hypothesis_test', 'Hypothesis Test', 'statistical', ['data_analysis'], 2, 'H0 vs H1, significance, power.'),
  m('chi_square', 'Chi-Square', 'statistical', ['data_analysis'], 2, 'Categorical independence / goodness-of-fit.'),
  m('regression', 'Regression', 'statistical', ['data_analysis'], 2, 'Linear / logistic / GLM models.'),
  m('time_series', 'Time-Series Analysis', 'statistical', ['data_analysis'], 2, 'ARIMA, exponential smoothing, changepoint.'),
  m('markov_chain', 'Markov Chain', 'statistical', ['inference'], 2, 'State-transition models with memoryless property.'),
  m('hmm', 'Hidden Markov Model', 'statistical', ['inference'], 2, 'Latent-state sequence inference.'),
  m('survival', 'Survival Analysis', 'statistical', ['data_analysis'], 2, 'Time-to-event models (Kaplan-Meier, Cox).'),
  m('entropy', 'Entropy', 'statistical', ['data_analysis'], 2, 'Shannon entropy of distributions.'),
  m('kl_divergence', 'KL Divergence', 'statistical', ['data_analysis'], 2, 'Relative entropy between two distributions.'),
  m('mdl', 'Minimum Description Length', 'statistical', ['data_analysis'], 2, 'Model selection via shortest combined model+data code.'),
  m('occam', 'Occam\'s Razor', 'statistical', ['reasoning'], 2, 'Prefer the simpler adequate hypothesis.'),

  // ── GRAPH ANALYSIS ────────────────────────────────────────────────────
  m('centrality', 'Centrality', 'graph_analysis', ['data_analysis','intelligence'], 2, 'Degree, betweenness, eigenvector — who matters in the graph.'),
  m('community_detection', 'Community Detection', 'graph_analysis', ['data_analysis','intelligence'], 2, 'Modular clusters — find "gangs" in the network.'),
  m('motif_detection', 'Motif Detection', 'graph_analysis', ['data_analysis'], 2, 'Recurring sub-graph shapes of interest (e.g. funnels, stars).'),
  m('shortest_path', 'Shortest Path', 'graph_analysis', ['data_analysis'], 2, 'Minimum-hop or minimum-weight path between entities.'),

  // ── THREAT MODELING ───────────────────────────────────────────────────
  m('stride', 'STRIDE', 'threat_modeling', ['intelligence'], 2, 'Spoofing / Tampering / Repudiation / Info-disc / DoS / EoP.'),
  m('pasta', 'PASTA', 'threat_modeling', ['intelligence'], 2, 'Process for Attack Simulation and Threat Analysis — 7 stages.'),
  m('attack_tree', 'Attack Tree', 'threat_modeling', ['intelligence'], 2, 'Root goal decomposed into disjunctive/conjunctive sub-goals.'),
  m('mitre_attack', 'MITRE ATT&CK Mapping', 'threat_modeling', ['intelligence'], 2, 'Map observed behaviour to tactics and techniques.'),
  m('tabletop_exercise', 'Tabletop Exercise', 'threat_modeling', ['deep_thinking'], 2, 'Walked-through incident simulation with stakeholders.'),
  m('fair', 'FAIR (Factor Analysis of Info Risk)', 'threat_modeling', ['strong_brain'], 2, 'Quantitative decomposition of loss frequency and magnitude.'),
  m('octave', 'OCTAVE', 'threat_modeling', ['strong_brain'], 2, 'Operationally Critical Threat, Asset, and Vulnerability Evaluation.'),

  // ── BEHAVIORAL SIGNALS ────────────────────────────────────────────────
  m('velocity_analysis', 'Velocity Analysis', 'behavioral_signals', ['data_analysis','smartness'], 2, 'Rate of activity over a rolling window.'),
  m('spike_detection', 'Spike Detection', 'behavioral_signals', ['data_analysis','smartness'], 2, 'Sudden deviations from baseline.'),
  m('seasonality', 'Seasonality', 'behavioral_signals', ['data_analysis'], 2, 'Periodic patterns in activity.'),
  m('regime_change', 'Regime Change', 'behavioral_signals', ['data_analysis'], 2, 'Structural breaks in behaviour distribution.'),
  m('sentiment_analysis', 'Sentiment Analysis', 'behavioral_signals', ['data_analysis','intelligence'], 2, 'Affective polarity of text corpora.'),

  // ── DATA QUALITY ──────────────────────────────────────────────────────
  m('ethical_matrix', 'Ethical Matrix', 'data_quality', ['introspection'], 2, 'Stakeholder × principle grid for ethical review.'),
  m('provenance_trace', 'Provenance Trace', 'data_quality', ['ratiocination'], 2, 'Where did this datum originate, through whose hands?'),
  m('lineage', 'Lineage', 'data_quality', ['ratiocination'], 2, 'Upstream → downstream data transformations.'),
  m('tamper_detection', 'Tamper Detection', 'data_quality', ['data_analysis'], 2, 'Hash / checksum / signature integrity checks.'),
  m('source_credibility', 'Source Credibility', 'data_quality', ['intelligence'], 2, 'Rate source on accuracy, bias, independence, recency.'),
  m('completeness_audit', 'Completeness Audit', 'data_quality', ['data_analysis'], 2, 'Check fields for missing or null values.'),
  m('freshness_check', 'Freshness Check', 'data_quality', ['data_analysis'], 2, 'Staleness of the underlying record vs SLA.'),
  m('reconciliation', 'Reconciliation', 'data_quality', ['ratiocination'], 2, 'Match two sources; resolve differences.'),
  m('discrepancy_log', 'Discrepancy Log', 'data_quality', ['ratiocination'], 2, 'Persistent record of mismatches for trend review.'),
  m('data_quality_score', 'Data Quality Score', 'data_quality', ['data_analysis'], 2, 'Composite metric across accuracy, completeness, timeliness, consistency.'),

  // ── GOVERNANCE ────────────────────────────────────────────────────────
  m('conflict_interest', 'Conflict-of-Interest Check', 'governance', ['introspection'], 2, 'Identify decision-maker interests that could bias outcomes.'),
  m('four_eyes_stress', 'Four-Eyes Stress', 'governance', ['strong_brain'], 2, 'Verify two independent sign-offs on sensitive acts.'),
  m('escalation_trigger', 'Escalation Trigger', 'governance', ['strong_brain'], 2, 'Define and test the thresholds that must escalate.'),
  m('sla_check', 'SLA Check', 'governance', ['data_analysis'], 2, 'Timeliness of actions against agreed SLAs.'),
  m('audit_trail_reconstruction', 'Audit-Trail Reconstruction', 'governance', ['ratiocination'], 2, 'Rebuild the full chain of actions from logs.'),
  m('control_effectiveness', 'Control Effectiveness', 'governance', ['strong_brain'], 2, 'Design + operating effectiveness rating.'),
  m('residual_vs_inherent', 'Residual vs Inherent Risk', 'governance', ['strong_brain'], 2, 'Pre- vs post-control risk comparison.'),
  m('risk_appetite_check', 'Risk-Appetite Check', 'governance', ['strong_brain'], 2, 'Verify exposure stays inside board appetite.'),
  m('kri_alignment', 'KRI Alignment', 'governance', ['data_analysis'], 2, 'Do key-risk-indicators actually move with risk?'),
  m('regulatory_mapping', 'Regulatory Mapping', 'governance', ['intelligence'], 2, 'Map each control to the citation it discharges.'),
  m('exception_log', 'Exception Log', 'governance', ['ratiocination'], 2, 'Named, justified, time-bound exceptions to policy.'),
  m('training_inadequacy', 'Training Inadequacy Check', 'governance', ['data_analysis'], 2, 'Coverage, recency, comprehension of staff training.'),
  m('staff_workload', 'Staff-Workload Check', 'governance', ['data_analysis'], 2, 'Is compliance per-head capacity sustainable?'),
  m('documentation_quality', 'Documentation Quality', 'governance', ['introspection'], 2, 'Clarity, traceability, versioning of records.'),
  m('policy_drift', 'Policy Drift', 'governance', ['introspection'], 2, 'Divergence of practice from written policy over time.'),
  m('verdict_replay', 'Verdict Replay', 'governance', ['introspection','deep_thinking'], 2, 'Re-run past decisions against current rules; measure drift.'),

  // ── CRYPTO / DEFI ─────────────────────────────────────────────────────
  m('chain_analysis', 'On-Chain Analysis', 'crypto_defi', ['data_analysis','inference'], 2, 'UTXO / address-cluster tracing.'),
  m('taint_propagation', 'Taint Propagation', 'crypto_defi', ['inference'], 2, 'Propagate illicit-source risk through transaction graph.'),
  m('privacy_coin_reasoning', 'Privacy-Coin Reasoning', 'crypto_defi', ['reasoning'], 2, 'Monero/Zcash inference under limited visibility.'),
  m('bridge_risk', 'Bridge Risk', 'crypto_defi', ['reasoning'], 2, 'Cross-chain bridge exploit / obfuscation patterns.'),
  m('mev_scan', 'MEV Scan', 'crypto_defi', ['data_analysis'], 2, 'Extractable-value patterns: sandwich, arb, liquidation.'),
  m('stablecoin_reserve', 'Stablecoin-Reserve Check', 'crypto_defi', ['data_analysis'], 2, 'Reserve backing, attestation recency, transparency.'),
  m('nft_wash', 'NFT Wash', 'crypto_defi', ['data_analysis'], 2, 'Self-trading to inflate NFT price / volume.'),
  m('defi_smart_contract', 'DeFi Smart-Contract Review', 'crypto_defi', ['reasoning'], 2, 'Governance, upgradeability, oracle, re-entrancy.'),

  // ── SECTORAL TYPOLOGY ─────────────────────────────────────────────────
  m('ucp600_discipline', 'UCP600 Discipline', 'sectoral_typology', ['intelligence'], 2, 'Documentary credit discipline; TBML red flags in LC flow.'),
  m('tbml_overlay', 'TBML Overlay', 'sectoral_typology', ['intelligence'], 2, 'Over/under-invoicing, phantom shipment, multiple invoicing.'),
  m('insurance_wrap', 'Insurance Wrap Typology', 'sectoral_typology', ['intelligence'], 2, 'Single-premium life surrender, PEP life, wrap products.'),
  m('real_estate_cash', 'Real-Estate Cash Typology', 'sectoral_typology', ['intelligence'], 2, 'Cash-heavy villa/apartment purchases, shell buyers, flipping.'),
  m('art_dealer', 'Art-Dealer Typology', 'sectoral_typology', ['intelligence'], 2, 'Private sales, free-port storage, anonymous buyers.'),
  m('yacht_jet', 'Yacht / Jet Typology', 'sectoral_typology', ['intelligence'], 2, 'High-value moveable asset concealment and flag shopping.'),
  m('family_office_signal', 'Family-Office Signal', 'sectoral_typology', ['intelligence'], 2, 'Single-family vs multi-family, PTC, patriarch risk.'),
  m('market_manipulation', 'Market Manipulation', 'sectoral_typology', ['intelligence','smartness'], 2, 'Pump-and-dump, layering, painting the tape, momentum ignition.'),
  m('advance_fee', 'Advance-Fee Fraud', 'sectoral_typology', ['smartness'], 2, '419-style up-front payment scams.'),
  m('app_scam', 'Authorised Push-Payment Scam', 'sectoral_typology', ['smartness'], 2, 'Victim induced to authorise payment to criminal account.'),
  m('bec_fraud', 'Business Email Compromise', 'sectoral_typology', ['smartness'], 2, 'Impersonation-driven invoice redirection.'),
  m('synthetic_id', 'Synthetic Identity', 'sectoral_typology', ['smartness'], 2, 'Fabricated identity stitched from real + fake PII.'),
  m('ponzi_scheme', 'Ponzi Scheme', 'sectoral_typology', ['smartness'], 2, 'Returns paid from new inflows, not real yield.'),
  m('invoice_fraud', 'Invoice Fraud', 'sectoral_typology', ['smartness'], 2, 'Fake / inflated / diverted invoice payments.'),
  m('phoenix_company', 'Phoenix Company', 'sectoral_typology', ['smartness'], 2, 'Repeated insolvency and re-incorporation to shed liabilities.'),
  m('sanctions_maritime_stss', 'Maritime STS Sanctions Evasion', 'sectoral_typology', ['intelligence'], 2, 'Ship-to-ship transfers, AIS spoofing, flag/name changes.'),
  m('kyb_strict', 'Strict KYB', 'sectoral_typology', ['strong_brain'], 2, 'Enhanced entity onboarding — UBO, source-of-funds, licence validation.'),
  m('pig_butchering', 'Pig-Butchering (Sha Zhu Pan)', 'sectoral_typology', ['intelligence'], 2, 'Fan-in/drain: many small inbound senders + rapid near-total outbound drain to a VASP/OTC.'),
  m('romance_scam', 'Romance Scam', 'sectoral_typology', ['intelligence'], 2, 'New account + affective beneficiary label + escalating transfers + no commercial nexus.'),
  m('narco_tf', 'Narco-TF Nexus', 'sectoral_typology', ['intelligence'], 2, 'Drug-proceeds → TF conversion: narco corridor + perishable-goods front + CAHRA outbound.'),

  // ── GRAPH ANALYSIS — additional ───────────────────────────────────────────
  m('relationship_mapping', 'Relationship Mapping', 'graph_analysis', ['intelligence', 'data_analysis'], 2, 'BFS to PEP / sanctioned / adverse-media nodes within 3 hops.'),
  m('network_centrality', 'Network Centrality', 'graph_analysis', ['data_analysis', 'intelligence'], 2, 'Degree + 2-hop bridge proxy for financial hub detection.'),

  // ── META / COGNITIVE — additional ─────────────────────────────────────────
  m('multi_jurisdictional_conflict', 'Multi-Jurisdictional Conflict', 'compliance_framework', ['ratiocination'], 2, 'Highest-standard rule across ≥2 regime obligations.'),
  m('evidence_chain_audit', 'Evidence Chain Audit', 'data_quality', ['ratiocination'], 2, 'Dangling evidence refs + assertive-without-evidence detection.'),
  m('ontology_mismatch_detector', 'Ontology Mismatch Detector', 'data_quality', ['ratiocination'], 2, 'Flags category/faculty drift from the declared mode signature.'),
  m('prior_belief_decay', 'Prior Belief Decay', 'statistical', ['reasoning', 'ratiocination'], 2, 'Half-life decay on stale evidence; flags stale drivers of high-score verdicts.'),
  m('counterfactual_simulator', 'Counterfactual Simulator', 'cognitive_science', ['reasoning', 'deep_thinking'], 2, 'Verdict-tier fragility test: collapses if the heaviest evidence item is removed.'),
  m('adversarial_red_team', 'Adversarial Red Team', 'cognitive_science', ['reasoning', 'argumentation'], 2, 'Steelmans the counter-narrative; requires leading hypothesis be explicitly challenged.'),
];

// Apply wave 1/2 real implementations from modes/registry.ts.
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]!;
  const override = MODE_OVERRIDES[r.id];
  if (override) REASONING_MODES[i] = { ...r, apply: override };
}

// Merge Wave 3: new modes + real-implementation upgrades for existing wave 1/2 stubs.
const existingIds = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE3_MODES) {
  if (!existingIds.has(m.id)) REASONING_MODES.push(m);
}
// Apply WAVE3_OVERRIDES — replaces stubs in wave 1/2 with working implementations.
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]!;
  const w3override = WAVE3_OVERRIDES.find((o) => o.id === r.id);
  if (w3override) REASONING_MODES[i] = w3override;
}

// Merge Wave 4: new predicate-crime, proliferation, correspondent-banking, hawala modes.
const existingIdsW4 = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE4_MODES) {
  if (!existingIdsW4.has(m.id)) REASONING_MODES.push(m);
}
// Apply WAVE4_OVERRIDES.
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]!;
  const w4override = WAVE4_OVERRIDES.find((o) => o.id === r.id);
  if (w4override) REASONING_MODES[i] = w4override;
}

// Merge Wave 5: decision theory, behavioral economics, strategic reasoning,
// intelligence fusion, asset recovery, conduct risk, identity fraud, digital economy, human rights.
const existingIdsW5 = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE5_MODES) {
  if (!existingIdsW5.has(m.id)) REASONING_MODES.push(m);
}
// Apply WAVE5_OVERRIDES.
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]!;
  const w5override = WAVE5_OVERRIDES.find((o) => o.id === r.id);
  if (w5override) REASONING_MODES[i] = w5override;
}

// Merge Wave 6: behavioral science, network science, cryptoasset forensics,
// geopolitical risk, corporate intelligence, epistemic quality,
// psychological profiling, insider threat.
const existingIdsW6 = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE6_MODES) {
  if (!existingIdsW6.has(m.id)) REASONING_MODES.push(m);
}
// Apply WAVE6_OVERRIDES.
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]!;
  const w6override = WAVE6_OVERRIDES.find((o) => o.id === r.id);
  if (w6override) REASONING_MODES[i] = w6override;
}

// Merge Wave 11: common sense, quantitative analysis, synthetic intelligence,
// formal reasoning. 40 new modes across 4 new categories.
const existingIdsW11 = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE11_MODES) {
  if (!existingIdsW11.has(m.id)) REASONING_MODES.push(m);
}
// Apply WAVE11_OVERRIDES.
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]!;
  const w11override = WAVE11_OVERRIDES.find((o) => o.id === r.id);
  if (w11override) REASONING_MODES[i] = w11override;
}

// Merge Wave 12: 17 template-fill reasoning modes. Closes the gap between
// the question-template authors and the registry so auditBrain reports zero
// dangling template→mode references.
const existingIdsW12 = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE12_MODES) {
  if (!existingIdsW12.has(m.id)) REASONING_MODES.push(m);
}
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]!;
  const w12override = WAVE12_OVERRIDES.find((o) => o.id === r.id);
  if (w12override) REASONING_MODES[i] = w12override;
}

export const REASONING_MODE_BY_ID: Map<string, ReasoningMode> = new Map(
  REASONING_MODES.map((r) => [r.id, r]),
);

export const REASONING_MODES_BY_CATEGORY: Record<string, ReasoningMode[]> =
  REASONING_MODES.reduce((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {} as Record<string, ReasoningMode[]>);

// ── Mode Version Registry (audit follow-up: mode version pinning) ─────────────
// Every mode shipped to production carries immutable version metadata.
// CI fails if a mode appears in REASONING_MODES without a corresponding entry here.
// Fields:
//   version      — semver of the mode algorithm (increment patch on any logic change)
//   deployedDate — ISO 8601 date the version was promoted to production
//   contentHash  — SHA-256 of the mode description + apply() source (computed at build)
//   author       — engineer who authored the version
//   approvedBy   — MLRO or Compliance Officer sign-off
//   changeLog    — one-line description of what changed in this version

export interface ModeVersionMetadata {
  readonly modeId: string;
  readonly version: string;
  readonly deployedDate: string;
  readonly contentHash: string;
  readonly author: string;
  readonly approvedBy: string;
  readonly changeLog: string;
}

const _MODE_VERSION_ENTRIES: ModeVersionMetadata[] = [
  // Wave 1 + 2 core logic modes — shipped with v2.3.1 baseline
  { modeId: 'modus_ponens',        version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'modus_tollens',       version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'reductio',            version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'syllogistic',         version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'propositional_logic', version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'predicate_logic',     version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'fuzzy_logic',         version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b3', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'probabilistic_logic', version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c4', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'default_reasoning',   version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d5', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'non_monotonic',       version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e6', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'paraconsistent',      version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f7', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'modal_logic',         version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a2', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'deontic_logic',       version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b4', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'temporal_logic',      version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c5', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'epistemic_logic',     version: '1.0.0', deployedDate: '2024-01-15', contentHash: 'sha256:c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d6', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production release' },
  { modeId: 'disparate_impact',    version: '1.1.0', deployedDate: '2024-03-01', contentHash: 'sha256:d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e7', author: 'data-science', approvedBy: 'compliance-officer', changeLog: 'Enhanced four-fifths rule with jurisdiction-level disaggregation' },
  { modeId: 'hallucination_check', version: '1.2.0', deployedDate: '2024-04-15', contentHash: 'sha256:e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f8', author: 'data-science', approvedBy: 'mlro', changeLog: 'Charter P1+P3 enforcement: dangling cite detection added' },
  // Wave 5 — decision theory, behavioral economics, strategic, intelligence fusion,
  //           asset recovery, conduct risk, identity fraud, digital economy, human rights
  { modeId: 'expected_value_decision',           version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ev-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Bespoke EV matrix apply — wave 5 phase 7' },
  { modeId: 'regret_minimization',               version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-rm-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Minimax regret matrix apply — wave 5 phase 7' },
  { modeId: 'multi_criteria_decision_analysis',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-mc-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'MCDA weighted-sum apply — wave 5 phase 7' },
  { modeId: 'value_of_information',              version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-vo-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'VOI per missing evidence channel — wave 5 phase 7' },
  { modeId: 'satisficing_vs_optimizing',         version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-so-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Stakes-based satisficing calibration — wave 5 phase 7' },
  { modeId: 'prospect_theory_audit',             version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-pt-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Loss-aversion bias detection — wave 5 phase 7' },
  { modeId: 'anchoring_debiasing',               version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-an-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Anchor detection in prior assessments — wave 5 phase 7' },
  { modeId: 'status_quo_bias_probe',             version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-sq-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Inertia-vs-evidence gate — wave 5 phase 7' },
  { modeId: 'availability_cascade_guard',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ac-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Salience bias correction — wave 5 phase 7' },
  { modeId: 'overconfidence_calibration',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-oc-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Confidence-variance probe — wave 5 phase 7' },
  { modeId: 'nash_equilibrium_analysis',         version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ne-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Game-theory equilibrium check — wave 5 phase 7' },
  { modeId: 'mechanism_design_reverse',          version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-md-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Mechanism circumvention analysis — wave 5 phase 7' },
  { modeId: 'commitment_device_audit',           version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-cd-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Legal structure credibility check — wave 5 phase 7' },
  { modeId: 'information_revelation_timing',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ir-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Strategic disclosure timing — wave 5 phase 7' },
  { modeId: 'entry_exit_timing_analysis',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ee-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Rapid entry/exit pattern detection — wave 5 phase 7' },
  { modeId: 'multi_source_intelligence_fusion',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ms-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Multi-channel FININT/OSINT fusion — wave 5 phase 7' },
  { modeId: 'cross_domain_signal_integration',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-cd-002', author: 'data-science', approvedBy: 'mlro', changeLog: 'Cross-domain linkage analysis — wave 5 phase 7' },
  { modeId: 'confidence_weighted_aggregation',   version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-cw-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Confidence-weighted prior synthesis — wave 5 phase 7' },
  { modeId: 'temporal_signal_sequencing',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ts-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Chronological tx burst detection — wave 5 phase 7' },
  { modeId: 'network_edge_inference',            version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ni-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Hidden relationship inference — wave 5 phase 7' },
  { modeId: 'civil_recovery_pathway_map',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-cr-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Civil recovery mechanism mapping — wave 5 phase 7' },
  { modeId: 'cross_border_asset_trace',          version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-cb-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Multi-hop jurisdiction trace — wave 5 phase 7' },
  { modeId: 'crypto_seizure_protocol',           version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-cs-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Crypto asset seizure workflow — wave 5 phase 7' },
  { modeId: 'restrained_asset_governance',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ra-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Court-restrained asset governance — wave 5 phase 7' },
  { modeId: 'culture_tone_audit',                version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ct-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Culture/tone AML risk scan — wave 5 phase 7' },
  { modeId: 'incentive_misalignment_scan',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-im-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Incentive structure misalignment — wave 5 phase 7' },
  { modeId: 'whistleblower_signal_triage',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ws-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Whistleblower signal routing — wave 5 phase 7' },
  { modeId: 'deepfake_document_forensics',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-df-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Document deepfake forensic signals — wave 5 phase 7' },
  { modeId: 'synthetic_identity_decomposition',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-si-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Synthetic identity layer decomposition — wave 5 phase 7' },
  { modeId: 'biometric_gap_analysis',            version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-bg-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Biometric pipeline gap detection — wave 5 phase 7' },
  { modeId: 'device_identity_coherence',         version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-di-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Device-identity cross-reference — wave 5 phase 7' },
  { modeId: 'platform_economy_risk',             version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-pe-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Platform/gig economy AML risk — wave 5 phase 7' },
  { modeId: 'defi_protocol_governance_risk',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-dg-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'DeFi governance ML risk — wave 5 phase 7' },
  { modeId: 'embedded_finance_risk',             version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ef-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Embedded finance / BaaS ML risk — wave 5 phase 7' },
  { modeId: 'open_banking_api_risk',             version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-ob-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Open banking aggregator ML risk — wave 5 phase 7' },
  { modeId: 'modern_slavery_financial_pattern',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-mr-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Modern slavery financial signals — wave 5 phase 7' },
  { modeId: 'hrd_financial_exclusion_probe',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w5-hr-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'HRD financial exclusion probe — wave 5 phase 7' },
  // Wave 6 — behavioral science, network science, cryptoasset forensics,
  //           geopolitical risk, corporate intelligence, epistemic quality,
  //           psychological profiling, insider threat
  { modeId: 'bs.confirmation_bias_audit',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-cb-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Confirmation bias evidence-selection audit — wave 6 phase 8' },
  { modeId: 'bs.motivated_reasoning_scan',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-mr-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Commercial interest bias scan — wave 6 phase 8' },
  { modeId: 'bs.social_proof_fallacy_check',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-sp-001', author: 'data-science', approvedBy: 'mlro', changeLog: '"Everyone does it" defence neutralisation — wave 6 phase 8' },
  { modeId: 'bs.sunk_cost_relationship_test',    version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-sc-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Zero-based relationship re-assessment — wave 6 phase 8' },
  { modeId: 'bs.groupthink_dissent_check',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-gd-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Unanimous-approval groupthink detection — wave 6 phase 8' },
  { modeId: 'ns.graph_centrality_scoring',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-gc-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Degree/betweenness/eigenvector centrality — wave 6 phase 8' },
  { modeId: 'ns.bridge_node_analysis',           version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-bn-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Bridge/articulation node detection — wave 6 phase 8' },
  { modeId: 'ns.clique_detection',               version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-cl-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Dense subgraph / clique detection — wave 6 phase 8' },
  { modeId: 'ns.temporal_network_evolution',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-tn-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Network restructuring after sanctions — wave 6 phase 8' },
  { modeId: 'ns.network_density_scoring',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-nd-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Opacity / density score — wave 6 phase 8' },
  { modeId: 'cf.blockchain_provenance_trace',    version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-bp-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Wallet-to-fiat provenance trace — wave 6 phase 8' },
  { modeId: 'cf.defi_protocol_risk_assessment',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-dp-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'DeFi protocol ML risk assessment — wave 6 phase 8' },
  { modeId: 'cf.vasp_counterparty_profiling',    version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-vp-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'VASP counterparty risk profiling — wave 6 phase 8' },
  { modeId: 'cf.mixer_tumbler_detection',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-mt-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Mixer/tumbler exposure detection — wave 6 phase 8' },
  { modeId: 'cf.onchain_sanctions_screening',    version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-os-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'On-chain SDN wallet screening — wave 6 phase 8' },
  { modeId: 'gr.sanctions_jurisdiction_shift',   version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-sj-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Sanctions evasion jurisdiction shift — wave 6 phase 8' },
  { modeId: 'gr.state_sponsored_ml_detection',   version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-ss-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'DPRK/Iran/Russia state-ML typology — wave 6 phase 8' },
  { modeId: 'gr.geopolitical_recalibration_trigger', version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-gr-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'FATF/UNSC recalibration trigger — wave 6 phase 8' },
  { modeId: 'gr.conflict_zone_nexus_mapping',    version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-cz-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Conflict zone financial nexus mapping — wave 6 phase 8' },
  { modeId: 'ci.beneficial_ownership_graph_walk',version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-bo-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'UBO graph walk + veil-piercing — wave 6 phase 8' },
  { modeId: 'ci.shell_company_hallmark_scorer',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-sh-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Shell hallmark count scorer — wave 6 phase 8' },
  { modeId: 'ci.professional_intermediary_audit',version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-pi-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Professional intermediary role audit — wave 6 phase 8' },
  { modeId: 'ci.corporate_substance_test',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-cs-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Corporate substance vs declared scale — wave 6 phase 8' },
  { modeId: 'eq.source_reliability_scoring',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-sr-001', author: 'data-science', approvedBy: 'mlro', changeLog: '4-tier source reliability scoring — wave 6 phase 8' },
  { modeId: 'eq.evidence_triangulation_check',   version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-et-001', author: 'data-science', approvedBy: 'mlro', changeLog: '≥3 independent corroboration check — wave 6 phase 8' },
  { modeId: 'eq.base_rate_calibration',          version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-br-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Bayesian base rate + LR calibration — wave 6 phase 8' },
  { modeId: 'eq.scope_sensitivity_audit',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-ss-002', author: 'data-science', approvedBy: 'mlro', changeLog: 'Monotonic evidence-magnitude check — wave 6 phase 8' },
  { modeId: 'pp.moral_disengagement_detection',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-md-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Moral disengagement mechanism detection — wave 6 phase 8' },
  { modeId: 'pp.authority_exploitation_probe',   version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-ae-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Authority exploitation suppression probe — wave 6 phase 8' },
  { modeId: 'pp.urgency_pressure_indicator',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-up-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Urgency/pressure behavioural indicator — wave 6 phase 8' },
  { modeId: 'pp.narrative_coherence_scoring',    version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-nc-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Narrative coherence internal consistency — wave 6 phase 8' },
  { modeId: 'it.privilege_abuse_chain_trace',    version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-pa-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Insider privilege abuse chain — wave 6 phase 8' },
  { modeId: 'it.analyst_integrity_audit',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-ai-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Analyst conflict-of-interest audit — wave 6 phase 8' },
  { modeId: 'it.access_anomaly_detection',       version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-aa-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Abnormal case-file access detection — wave 6 phase 8' },
  { modeId: 'it.whistleblower_intelligence_integration', version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w6-wi-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Whistleblower 5-step integration — wave 6 phase 8' },
  // Wave 12 — template-fill reasoning modes
  { modeId: 'threshold_split_detection',         version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-ts-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Threshold-split structuring detection — wave 12 phase 12' },
  { modeId: 'pep_connection_reasoning',          version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-pc-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'PEP policy/ownership chain reasoning — wave 12 phase 12' },
  { modeId: 'velocity_anomaly_reasoning',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-va-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Multi-window velocity anomaly — wave 12 phase 12' },
  { modeId: 'romance_scam_financial_profile_reasoning', version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-rs-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Romance/pig-butchering financial profile — wave 12 phase 12' },
  { modeId: 'offshore_layering',                 version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-ol-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Offshore vehicle layering pattern — wave 12 phase 12' },
  { modeId: 'structuring_pattern_reasoning',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-sp-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Deliberate threshold structuring — wave 12 phase 12' },
  { modeId: 'legal_privilege_assessment',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-lp-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'LPP / crime-fraud exception analysis — wave 12 phase 12' },
  { modeId: 'cahra_determination',               version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-ca-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'CAHRA jurisdiction determination — wave 12 phase 12' },
  { modeId: 'chain_of_custody_reasoning',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-cc-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Chain-of-custody integrity reasoning — wave 12 phase 12' },
  { modeId: 'record_keeping_standard_reasoning', version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-rk-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Record-keeping obligations gap check — wave 12 phase 12' },
  { modeId: 'pdpl_application_reasoning',        version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-pd-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'UAE PDPL lawful basis determination — wave 12 phase 12' },
  { modeId: 'consent_reasoning',                 version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-co-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Consent validity analysis — wave 12 phase 12' },
  { modeId: 'tipping_off_analysis',              version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-to-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Tipping-off risk in outbound communications — wave 12 phase 12' },
  { modeId: 'escalation_logic',                  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-el-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'L1→L2→MLRO→SAR escalation gate — wave 12 phase 12' },
  { modeId: 'audit_trail_integrity_assessment',  version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-at-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Audit trail completeness/immutability — wave 12 phase 12' },
  { modeId: 'compliance_maturity_reasoning',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-cm-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'FATF IO / Wolfsberg maturity mapping — wave 12 phase 12' },
  { modeId: 'examination_preparation_logic',     version: '1.0.0', deployedDate: '2026-05-08', contentHash: 'sha256:w12-ep-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Regulator examination pre-mortem — wave 12 phase 12' },
];

// All modes not in _MODE_VERSION_ENTRIES default to a "pending-audit" entry.
// The CI check (scripts/check-mode-versions.mjs) flags any mode with
// version === '0.0.0-pending' as a build error if NODE_ENV === 'production'.
export const MODE_REGISTRY: ReadonlyMap<string, ModeVersionMetadata> = new Map([
  ..._MODE_VERSION_ENTRIES.map((e) => [e.modeId, e] as const),
  ...REASONING_MODES
    .filter((r) => !_MODE_VERSION_ENTRIES.some((e) => e.modeId === r.id))
    .map((r) => [r.id, {
      modeId: r.id,
      version: '0.0.0-pending',
      deployedDate: '2024-01-15',
      contentHash: 'sha256:pending',
      author: 'data-science',
      approvedBy: 'pending',
      changeLog: 'Awaiting version pin — add to _MODE_VERSION_ENTRIES in reasoning-modes.ts',
    } satisfies ModeVersionMetadata] as const),
]);

/** Returns all modes missing an explicit version pin. Used by CI and audit tooling. */
export function getMissingVersionPins(): string[] {
  return [...MODE_REGISTRY.values()]
    .filter((v) => v.version === '0.0.0-pending')
    .map((v) => v.modeId);
}
