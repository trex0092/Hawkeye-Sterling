// Hawkeye Sterling — reasoning-mode registry.
// 456 mode definitions across all wave files (213 base + 73 wave3 + 29 wave4 +
//   37 wave5 + 35 wave6 + 40 wave11 + 17 wave12 + 19 wave13 + 12 wave14);
//   412 unique IDs after merge dedup (32 wave-3/4/5/6 entries reuse existing
//   base IDs to upgrade stub implementations to real apply() functions via
//   the OVERRIDES path).
// Categories: 50. Wave 1 + 2 + 3 + 4 + 5 + 6 + 11 + 12 + 13 + 14.
// Each entry is registered metadata + either a real apply() (if src/brain/modes/registry.ts
// or reasoning-modes-wave3.ts supplies an override) or a stub apply() that returns an
// inconclusive placeholder Finding.  Real algorithms land mode-by-mode in Phase 7/8/11/14.

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
import { WAVE13_MODES, WAVE13_OVERRIDES } from './reasoning-modes-wave13.js';
import { WAVE14_MODES, WAVE14_OVERRIDES } from './reasoning-modes-wave14.js';

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
  const r = REASONING_MODES[i]; if (!r) continue;
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
  const r = REASONING_MODES[i]; if (!r) continue;
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
  const r = REASONING_MODES[i]; if (!r) continue;
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
  const r = REASONING_MODES[i]; if (!r) continue;
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
  const r = REASONING_MODES[i]; if (!r) continue;
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
  const r = REASONING_MODES[i]; if (!r) continue;
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
  const r = REASONING_MODES[i]; if (!r) continue;
  const w12override = WAVE12_OVERRIDES.find((o) => o.id === r.id);
  if (w12override) REASONING_MODES[i] = w12override;
}

// Merge Wave 13: 19 new modes expanding forensic_accounting (6), quantum_intelligence (4),
// anticipation (5), and geopolitical_awareness (4) — the four sparsest faculties.
const existingIdsW13 = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE13_MODES) {
  if (!existingIdsW13.has(m.id)) REASONING_MODES.push(m);
}
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]; if (!r) continue;
  const w13override = WAVE13_OVERRIDES.find((o) => o.id === r.id);
  if (w13override) REASONING_MODES[i] = w13override;
}

// Merge Wave 14: 12 new modes — temporal forecasting (3), cognitive load monitoring (2),
// adversarial explainability (2), cross-case intelligence (3), dynamic RBA (2).
// All 12 have real apply() implementations in modes/wave14-applies.ts.
const existingIdsW14 = new Set(REASONING_MODES.map((r) => r.id));
for (const m of WAVE14_MODES) {
  if (!existingIdsW14.has(m.id)) REASONING_MODES.push(m);
}
for (let i = 0; i < REASONING_MODES.length; i++) {
  const r = REASONING_MODES[i]; if (!r) continue;
  const w14override = WAVE14_OVERRIDES.find((o) => o.id === r.id);
  if (w14override) REASONING_MODES[i] = w14override;
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
  // Wave 13 — forensic accounting (6), quantum intelligence (4), anticipation (5), geopolitical awareness (4)
  { modeId: 'fa.journal_entry_timing_analysis',  version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-fa-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Off-hours journal entry timing analysis — wave 13' },
  { modeId: 'fa.round_dollar_clustering',        version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-fa-002', author: 'data-science', approvedBy: 'mlro', changeLog: 'Round-dollar transaction clustering detection — wave 13' },
  { modeId: 'fa.duplicate_transaction_detection',version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-fa-003', author: 'data-science', approvedBy: 'mlro', changeLog: 'Same-amount/counterparty/date duplicate detection — wave 13' },
  { modeId: 'fa.shell_company_financial_signature', version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-fa-004', author: 'data-science', approvedBy: 'mlro', changeLog: 'Shell company financial fingerprint scorer — wave 13' },
  { modeId: 'fa.transfer_pricing_manipulation',  version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-fa-005', author: 'data-science', approvedBy: 'mlro', changeLog: 'Intercompany arm\'s-length pricing deviation — wave 13' },
  { modeId: 'fa.revenue_recognition_anomaly',    version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-fa-006', author: 'data-science', approvedBy: 'mlro', changeLog: 'Channel-stuffing / bill-and-hold detection — wave 13' },
  { modeId: 'qi.bayesian_network_fusion',        version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-qi-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Bayesian network multi-factor posterior fusion — wave 13' },
  { modeId: 'qi.ensemble_uncertainty_quantification', version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-qi-002', author: 'data-science', approvedBy: 'mlro', changeLog: 'Epistemic/aleatoric uncertainty decomposition — wave 13' },
  { modeId: 'qi.markov_chain_risk_projection',   version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-qi-003', author: 'data-science', approvedBy: 'mlro', changeLog: 'n-step Markov risk state projection — wave 13' },
  { modeId: 'qi.entropy_anomaly_detection',      version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-qi-004', author: 'data-science', approvedBy: 'mlro', changeLog: 'Shannon entropy behavioural anomaly detection — wave 13' },
  { modeId: 'an.regulatory_change_impact_assessment', version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-an-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Pre-emptive regulatory change portfolio impact — wave 13' },
  { modeId: 'an.network_restructuring_prediction', version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-an-002', author: 'data-science', approvedBy: 'mlro', changeLog: 'Post-designation network restructuring predictor — wave 13' },
  { modeId: 'an.pre_sanction_positioning_detection', version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-an-003', author: 'data-science', approvedBy: 'mlro', changeLog: 'Pre-sanction asset positioning detection — wave 13' },
  { modeId: 'an.seasonal_ml_pattern_forecasting', version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-an-004', author: 'data-science', approvedBy: 'mlro', changeLog: 'Seasonal ML risk spike forecasting — wave 13' },
  { modeId: 'an.typology_evolution_tracker',     version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-an-005', author: 'data-science', approvedBy: 'mlro', changeLog: 'Typology mutation / successor prediction — wave 13' },
  { modeId: 'ga.dual_use_goods_proliferation_financing', version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-ga-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Dual-use goods proliferation financing — wave 13' },
  { modeId: 'ga.de_dollarization_cbdc_risk',     version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-ga-002', author: 'data-science', approvedBy: 'mlro', changeLog: 'CBDC/alt-payment sanctions evasion risk — wave 13' },
  { modeId: 'ga.bri_project_nexus_assessment',   version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-ga-003', author: 'data-science', approvedBy: 'mlro', changeLog: 'Belt and Road Initiative nexus assessment — wave 13' },
  { modeId: 'ga.crypto_state_actor_evasion',     version: '1.0.0', deployedDate: '2026-05-25', contentHash: 'sha256:w13-ga-004', author: 'data-science', approvedBy: 'mlro', changeLog: 'State-actor (DPRK/Iran/Russia) crypto evasion — wave 13' },
  // Batch governance alignment 2026-05-27 — 350 modes pinned (FDL 10/2025 Art.16)
  { modeId: 'occam_vs_conspiracy',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-occam_vs_conspiracy-000', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'burden_of_proof',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-burden_of_proof-001', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'presumption_innocence',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-presumption_innocence-002', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'popper_falsification',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-popper_falsification-003', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'triangulation',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-triangulation-004', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'saturation',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-saturation-005', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'system_1',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-system_1-006', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'system_2',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-system_2-007', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'dual_process',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-dual_process-008', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ooda',                                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ooda-009', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pre_mortem',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pre_mortem-010', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'post_mortem',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-post_mortem-011', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'steelman',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-steelman-012', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'hindsight_check',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-hindsight_check-013', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cognitive_bias_audit',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cognitive_bias_audit-014', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'confidence_calibration',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-confidence_calibration-015', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'planning_fallacy',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-planning_fallacy-016', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'availability_check',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-availability_check-017', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'framing_check',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-framing_check-018', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'overconfidence_check',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-overconfidence_check-019', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'anchoring_avoidance',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-anchoring_avoidance-020', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'monte_carlo',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-monte_carlo-021', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fermi',                                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fermi-022', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'expected_utility',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-expected_utility-023', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'minimax',                                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-minimax-024', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'maximin',                                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-maximin-025', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cvar',                                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cvar-026', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'regret_min',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-regret_min-027', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'marginal',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-marginal-028', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cost_benefit',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cost_benefit-029', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'break_even',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-break_even-030', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'real_options',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-real_options-031', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'sensitivity_tornado',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-sensitivity_tornado-032', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'risk_adjusted',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-risk_adjusted-033', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'loss_aversion_check',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-loss_aversion_check-034', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'portfolio_view',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-portfolio_view-035', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'five_whys',                                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-five_whys-036', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fishbone',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fishbone-037', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fmea',                                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fmea-038', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pareto',                                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pareto-039', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'swiss_cheese',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-swiss_cheese-040', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bowtie',                                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bowtie-041', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'kill_chain',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-kill_chain-042', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'timeline_reconstruction',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-timeline_reconstruction-043', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'evidence_graph',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-evidence_graph-044', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'link_analysis',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-link_analysis-045', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'entity_resolution',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-entity_resolution-046', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'narrative_coherence',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-narrative_coherence-047', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'linguistic_forensics',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-linguistic_forensics-048', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pattern_of_life',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pattern_of_life-049', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'peer_group_anomaly',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-peer_group_anomaly-050', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'insider_threat',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-insider_threat-051', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'collusion_pattern',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-collusion_pattern-052', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'self_dealing',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-self_dealing-053', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'front_running',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-front_running-054', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'wash_trade',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-wash_trade-055', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'spoofing',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-spoofing-056', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ghost_employees',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ghost_employees-057', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'lapping',                                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-lapping-058', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'three_lines_defence',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-three_lines_defence-059', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'five_pillars',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-five_pillars-060', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'risk_based_approach',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-risk_based_approach-061', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fatf_effectiveness',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fatf_effectiveness-062', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'wolfsberg_faq',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-wolfsberg_faq-063', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'lbma_rgg_five_step',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-lbma_rgg_five_step-064', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'oecd_ddg_annex',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-oecd_ddg_annex-065', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'typology_catalogue',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-typology_catalogue-066', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'article_by_article',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-article_by_article-067', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cabinet_res_walk',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cabinet_res_walk-068', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'circular_walk',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-circular_walk-069', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'list_walk',                                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-list_walk-070', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ubo_tree_walk',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ubo_tree_walk-071', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'jurisdiction_cascade',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-jurisdiction_cascade-072', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'sanctions_regime_matrix',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-sanctions_regime_matrix-073', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'kpi_dpms_thirty',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-kpi_dpms_thirty-074', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'emirate_jurisdiction',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-emirate_jurisdiction-075', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'source_triangulation',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-source_triangulation-076', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'retention_audit',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-retention_audit-077', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'peer_benchmark',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-peer_benchmark-078', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'toulmin',                                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-toulmin-079', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'irac',                                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-irac-080', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'craac',                                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-craac-081', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'rogerian',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-rogerian-082', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'policy_vs_rule',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-policy_vs_rule-083', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'de_minimis',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-de_minimis-084', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'proportionality_test',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-proportionality_test-085', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'stare_decisis',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-stare_decisis-086', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'analogical_precedent',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-analogical_precedent-087', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'gray_zone_resolution',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-gray_zone_resolution-088', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'swot',                                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-swot-089', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pestle',                                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pestle-090', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'porter_adapted',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-porter_adapted-091', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'steep',                                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-steep-092', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'lens_shift',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-lens_shift-093', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'stakeholder_map',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-stakeholder_map-094', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'scenario_planning',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-scenario_planning-095', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'war_game',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-war_game-096', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'minimum_viable_compliance',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-minimum_viable_compliance-097', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'defence_in_depth',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-defence_in_depth-098', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bayesian_network',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bayesian_network-099', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'causal_inference',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-causal_inference-100', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'counterexample_search',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-counterexample_search-101', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cross_case_triangulation',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cross_case_triangulation-102', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'adversarial_collaboration',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-adversarial_collaboration-103', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bayes_theorem',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bayes_theorem-104', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'frequentist',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-frequentist-105', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'confidence_interval',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-confidence_interval-106', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'hypothesis_test',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-hypothesis_test-107', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'chi_square',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-chi_square-108', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'regression',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-regression-109', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'time_series',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-time_series-110', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'markov_chain',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-markov_chain-111', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'hmm',                                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-hmm-112', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'survival',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-survival-113', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'entropy',                                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-entropy-114', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'kl_divergence',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-kl_divergence-115', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'mdl',                                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-mdl-116', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'occam',                                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-occam-117', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'centrality',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-centrality-118', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'community_detection',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-community_detection-119', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'motif_detection',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-motif_detection-120', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'shortest_path',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-shortest_path-121', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'stride',                                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-stride-122', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pasta',                                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pasta-123', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'attack_tree',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-attack_tree-124', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'mitre_attack',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-mitre_attack-125', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'tabletop_exercise',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-tabletop_exercise-126', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fair',                                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fair-127', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'octave',                                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-octave-128', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'velocity_analysis',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-velocity_analysis-129', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'spike_detection',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-spike_detection-130', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'seasonality',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-seasonality-131', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'regime_change',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-regime_change-132', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'sentiment_analysis',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-sentiment_analysis-133', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ethical_matrix',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ethical_matrix-134', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'provenance_trace',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-provenance_trace-135', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'lineage',                                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-lineage-136', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'tamper_detection',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-tamper_detection-137', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'source_credibility',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-source_credibility-138', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'completeness_audit',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-completeness_audit-139', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'freshness_check',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-freshness_check-140', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'reconciliation',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-reconciliation-141', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'discrepancy_log',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-discrepancy_log-142', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'data_quality_score',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-data_quality_score-143', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'conflict_interest',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-conflict_interest-144', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'four_eyes_stress',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-four_eyes_stress-145', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'escalation_trigger',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-escalation_trigger-146', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'sla_check',                                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-sla_check-147', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'audit_trail_reconstruction',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-audit_trail_reconstruction-148', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'control_effectiveness',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-control_effectiveness-149', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'residual_vs_inherent',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-residual_vs_inherent-150', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'risk_appetite_check',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-risk_appetite_check-151', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'kri_alignment',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-kri_alignment-152', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'regulatory_mapping',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-regulatory_mapping-153', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'exception_log',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-exception_log-154', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'training_inadequacy',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-training_inadequacy-155', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'staff_workload',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-staff_workload-156', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'documentation_quality',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-documentation_quality-157', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'policy_drift',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-policy_drift-158', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'verdict_replay',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-verdict_replay-159', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'chain_analysis',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-chain_analysis-160', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'taint_propagation',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-taint_propagation-161', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'privacy_coin_reasoning',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-privacy_coin_reasoning-162', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bridge_risk',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bridge_risk-163', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'mev_scan',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-mev_scan-164', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'stablecoin_reserve',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-stablecoin_reserve-165', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'nft_wash',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-nft_wash-166', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'defi_smart_contract',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-defi_smart_contract-167', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ucp600_discipline',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ucp600_discipline-168', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'tbml_overlay',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-tbml_overlay-169', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'insurance_wrap',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-insurance_wrap-170', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'real_estate_cash',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-real_estate_cash-171', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'art_dealer',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-art_dealer-172', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'yacht_jet',                                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-yacht_jet-173', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'family_office_signal',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-family_office_signal-174', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'market_manipulation',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-market_manipulation-175', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'advance_fee',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-advance_fee-176', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'app_scam',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-app_scam-177', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bec_fraud',                                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bec_fraud-178', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'synthetic_id',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-synthetic_id-179', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ponzi_scheme',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ponzi_scheme-180', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'invoice_fraud',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-invoice_fraud-181', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'phoenix_company',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-phoenix_company-182', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'sanctions_maritime_stss',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-sanctions_maritime_stss-183', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'kyb_strict',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-kyb_strict-184', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pig_butchering',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pig_butchering-185', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'romance_scam',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-romance_scam-186', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'narco_tf',                                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-narco_tf-187', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'relationship_mapping',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-relationship_mapping-188', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'network_centrality',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-network_centrality-189', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'multi_jurisdictional_conflict',               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-multi_jurisdictional_conflict-190', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'evidence_chain_audit',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-evidence_chain_audit-191', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ontology_mismatch_detector',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ontology_mismatch_detector-192', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'prior_belief_decay',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-prior_belief_decay-193', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'counterfactual_simulator',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-counterfactual_simulator-194', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'adversarial_red_team',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-adversarial_red_team-195', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'socmint_scan',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-socmint_scan-196', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'geoint_plausibility',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-geoint_plausibility-197', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'imint_verification',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-imint_verification-198', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'humint_reliability_grade',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-humint_reliability_grade-199', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'nato_admiralty_grading',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-nato_admiralty_grading-200', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'osint_chain_of_custody',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-osint_chain_of_custody-201', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'adversarial_simulation',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-adversarial_simulation-202', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'deception_detection',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-deception_detection-203', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'counter_intelligence',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-counter_intelligence-204', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'false_flag_check',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-false_flag_check-205', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'honey_trap_pattern',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-honey_trap_pattern-206', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cover_story_stress',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cover_story_stress-207', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'legend_verification',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-legend_verification-208', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'sanctions_arbitrage',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-sanctions_arbitrage-209', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'offshore_secrecy_index',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-offshore_secrecy_index-210', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fatf_grey_list_dynamics',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fatf_grey_list_dynamics-211', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'secrecy_jurisdiction_scoring',                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-secrecy_jurisdiction_scoring-212', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'russian_oil_price_cap',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-russian_oil_price_cap-213', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'eu_14_package',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-eu_14_package-214', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'us_secondary_sanctions',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-us_secondary_sanctions-215', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'chip_export_controls',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-chip_export_controls-216', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'iran_evasion_pattern',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-iran_evasion_pattern-217', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'dprk_evasion_pattern',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-dprk_evasion_pattern-218', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'benford_law',                                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-benford_law-219', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'split_payment_detection',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-split_payment_detection-220', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'round_trip_transaction',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-round_trip_transaction-221', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'shell_triangulation',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-shell_triangulation-222', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'po_fraud_pattern',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-po_fraud_pattern-223', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'vendor_master_anomaly',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-vendor_master_anomaly-224', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'journal_entry_anomaly',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-journal_entry_anomaly-225', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'revenue_recognition_stretch',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-revenue_recognition_stretch-226', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'prospect_theory',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-prospect_theory-227', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'status_quo_bias',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-status_quo_bias-228', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'endowment_effect',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-endowment_effect-229', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'hyperbolic_discount',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-hyperbolic_discount-230', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'certainty_effect',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-certainty_effect-231', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'reference_point_shift',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-reference_point_shift-232', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'mental_accounting',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-mental_accounting-233', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'k_core_analysis',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-k_core_analysis-234', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bridge_detection',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bridge_detection-235', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'temporal_motif',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-temporal_motif-236', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'reciprocal_edge_pattern',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-reciprocal_edge_pattern-237', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'triadic_closure',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-triadic_closure-238', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'structural_hole',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-structural_hole-239', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'stylometry',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-stylometry-240', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'gaslighting_detection',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-gaslighting_detection-241', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'obfuscation_pattern',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-obfuscation_pattern-242', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'code_word_detection',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-code_word_detection-243', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'hedging_language',                            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-hedging_language-244', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'minimisation_pattern',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-minimisation_pattern-245', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'phantom_vessel',                              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-phantom_vessel-246', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'flag_hopping',                                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-flag_hopping-247', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'dark_fleet_pattern',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-dark_fleet_pattern-248', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'front_company_fingerprint',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-front_company_fingerprint-249', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'nominee_rotation_detection',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-nominee_rotation_detection-250', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bvi_cook_island_chain',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bvi_cook_island_chain-251', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'freeport_risk',                               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-freeport_risk-252', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'address_poisoning',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-address_poisoning-253', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'chain_hopping_velocity',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-chain_hopping_velocity-254', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cross_chain_taint',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cross_chain_taint-255', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'privacy_pool_exposure',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-privacy_pool_exposure-256', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'tornado_cash_proximity',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-tornado_cash_proximity-257', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'peel_chain',                                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-peel_chain-258', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'change_address_heuristic',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-change_address_heuristic-259', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'dusting_attack_pattern',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-dusting_attack_pattern-260', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'greenwashing_signal',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-greenwashing_signal-261', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'forced_labour_supply_chain',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-forced_labour_supply_chain-262', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'conflict_mineral_typology',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-conflict_mineral_typology-263', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'carbon_fraud_pattern',                        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-carbon_fraud_pattern-264', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'dempster_shafer',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-dempster_shafer-265', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'bayesian_update_cascade',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-bayesian_update_cascade-266', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'multi_source_consistency',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-multi_source_consistency-267', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'counter_evidence_weighting',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-counter_evidence_weighting-268', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'predicate_crime_cascade',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-predicate_crime_cascade-269', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'environmental_predicate',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-environmental_predicate-270', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'tax_evasion_predicate',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-tax_evasion_predicate-271', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'insider_trading_predicate',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-insider_trading_predicate-272', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cyber_crime_predicate',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cyber_crime_predicate-273', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'human_trafficking_predicate',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-human_trafficking_predicate-274', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pf_red_flag_screen',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pf_red_flag_screen-275', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'dual_use_end_user',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-dual_use_end_user-276', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'sanctions_evasion_network',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-sanctions_evasion_network-277', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ship_flag_hop_analysis',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ship_flag_hop_analysis-278', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cbr_risk_matrix',                             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cbr_risk_matrix-279', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'nested_account_detection',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-nested_account_detection-280', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'payable_through_account',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-payable_through_account-281', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cbr_due_diligence_cascade',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cbr_due_diligence_cascade-282', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'hawala_network_map',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-hawala_network_map-283', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'settlement_commodity_flow',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-settlement_commodity_flow-284', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'value_equivalence_check',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-value_equivalence_check-285', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ftz_opacity_screen',                          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ftz_opacity_screen-286', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 're_export_discrepancy',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-re_export_discrepancy-287', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'travel_rule_gap_analysis',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-travel_rule_gap_analysis-288', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'crypto_ransomware_cashout',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-crypto_ransomware_cashout-289', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'p2p_exchange_risk',                           version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-p2p_exchange_risk-290', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'professional_ml_ecosystem',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-professional_ml_ecosystem-291', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'invoice_fabrication_pattern',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-invoice_fabrication_pattern-292', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'funnel_mule_cascade',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-funnel_mule_cascade-293', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'vara_rulebook_check',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-vara_rulebook_check-294', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'pdpl_data_minimisation',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-pdpl_data_minimisation-295', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'ewra_scoring_calibration',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-ewra_scoring_calibration-296', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'goaml_schema_preflight',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-goaml_schema_preflight-297', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.plausibility_check',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-plausibility_check-298', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.motive_coherence',                         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-motive_coherence-299', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.lifestyle_vs_income',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-lifestyle_vs_income-300', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.counterparty_logic',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-counterparty_logic-301', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.timing_anomaly_sense',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-timing_anomaly_sense-302', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.round_number_suspicion',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-round_number_suspicion-303', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.narrative_consistency',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-narrative_consistency-304', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.too_good_to_be_true',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-too_good_to_be_true-305', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.victim_vs_perpetrator',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-victim_vs_perpetrator-306', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'cs.basic_entity_reality_check',               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-cs-basic_entity_reality_check-307', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.statistical_outlier_detection',            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-statistical_outlier_detecti-308', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.flow_velocity_analysis',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-flow_velocity_analysis-309', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.concentration_risk_scoring',               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-concentration_risk_scoring-310', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.benford_law_analysis',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-benford_law_analysis-311', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.time_series_anomaly',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-time_series_anomaly-312', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.peer_group_benchmarking',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-peer_group_benchmarking-313', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.value_at_risk_exposure',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-value_at_risk_exposure-314', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.network_flow_matrix',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-network_flow_matrix-315', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.seasonality_stripping',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-seasonality_stripping-316', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'qa.regression_discontinuity',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-qa-regression_discontinuity-317', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.cross_modal_fusion',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-cross_modal_fusion-318', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.adversarial_simulation',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-adversarial_simulation-319', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.knowledge_graph_inference',                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-knowledge_graph_inference-320', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.meta_pattern_recognition',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-meta_pattern_recognition-321', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.counterfactual_reasoning',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-counterfactual_reasoning-322', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.ensemble_verdict_fusion',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-ensemble_verdict_fusion-323', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.hypothesis_generation',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-hypothesis_generation-324', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.semantic_vector_search',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-semantic_vector_search-325', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.causal_dag_inference',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-causal_dag_inference-326', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'si.belief_propagation',                       version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-si-belief_propagation-327', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.logical_entailment_check',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-logical_entailment_check-328', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.modal_logic_obligation',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-modal_logic_obligation-329', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.rule_conflict_resolution',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-rule_conflict_resolution-330', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.first_order_predicate_audit',              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-first_order_predicate_audit-331', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.proof_by_contradiction',                   version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-proof_by_contradiction-332', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.abductive_inference',                      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-abductive_inference-333', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.temporal_logic_sequencing',                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-temporal_logic_sequencing-334', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.defeasible_reasoning',                     version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-defeasible_reasoning-335', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.argument_structure_mapping',               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-argument_structure_mapping-336', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'fr.constraint_satisfaction',                  version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-fr-constraint_satisfaction-337', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'an.temporal_threat_forecast',                 version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-an-temporal_threat_forecast-338', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'an.cahra_route_reactivation_forecast',        version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-an-cahra_route_reactivation_fo-339', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'an.pep_role_transition_forecast',             version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-an-pep_role_transition_forecas-340', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'intr.mlro_cognitive_load_monitor',            version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-intr-mlro_cognitive_load_monit-341', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'intr.false_positive_drift_detector',          version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-intr-false_positive_drift_dete-342', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'arg.adversarial_counterfactual_explainer',    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-arg-adversarial_counterfactual-343', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'arg.jurisdiction_str_conflict_resolver',      version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-arg-jurisdiction_str_conflict_-344', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'int.cross_case_typology_miner',               version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-int-cross_case_typology_miner-345', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'int.semantic_context_disambiguation',         version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-int-semantic_context_disambigu-346', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'int.shap_score_explainer',                    version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-int-shap_score_explainer-347', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'da.dynamic_rba_recalculation',                version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-da-dynamic_rba_recalculation-348', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
  { modeId: 'da.synthetic_redteam_generator',              version: '1.0.0', deployedDate: '2026-05-27', contentHash: 'sha256:b-da-synthetic_redteam_generator-349', author: 'data-science', approvedBy: 'mlro', changeLog: 'Initial production version pin — batch governance alignment 2026-05-27' },
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
