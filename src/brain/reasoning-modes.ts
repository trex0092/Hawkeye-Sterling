// Hawkeye Sterling — reasoning-mode registry.
// 273 modes across 16+ categories, wave 1 + wave 2 + wave 3.
// Each entry is registered metadata + either a real apply() (if src/brain/modes/registry.ts
// or reasoning-modes-wave3.ts supplies an override) or a stub apply() that returns an
// inconclusive placeholder Finding.  Real algorithms land mode-by-mode in Phase 7.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { MODE_OVERRIDES } from './modes/registry.js';
import { WAVE3_MODES, WAVE3_OVERRIDES } from './reasoning-modes-wave3.js';
import { WAVE4_MODES, WAVE4_OVERRIDES } from './reasoning-modes-wave4.js';

const stubApply = (modeId: string, category: ReasoningCategory, faculties: FacultyId[]) =>
  async (_ctx: BrainContext): Promise<Finding> => ({
    modeId,
    category,
    faculties,
    score: 0,
    confidence: 0,
    verdict: 'inconclusive',
    rationale: `[stub] ${modeId} — implementation pending (Phase 7).`,
    evidence: [],
    producedAt: Date.now(),
  });

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  wave: 1 | 2,
  description: string,
): ReasoningMode => ({
  id, name, category, faculties, wave, description,
  apply: stubApply(id, category, faculties),
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

export const REASONING_MODE_BY_ID: Map<string, ReasoningMode> = new Map(
  REASONING_MODES.map((r) => [r.id, r]),
);

export const REASONING_MODES_BY_CATEGORY: Record<string, ReasoningMode[]> =
  REASONING_MODES.reduce((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {} as Record<string, ReasoningMode[]>);
