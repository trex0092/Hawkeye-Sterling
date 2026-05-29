// Wave 14 — app intelligence expansion: temporal forecasting, adversarial
// explainability, cross-case learning, XAI, semantic disambiguation,
// dynamic RBA, FP optimisation, synthetic scenario generation, cognitive
// load monitoring, and multi-jurisdiction STR conflict resolution.
// 12 new modes across 5 existing faculties.

import type {
  FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { defaultApply } from './modes/default-apply.js';

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
): ReasoningMode => ({
  id, name, category, faculties, wave: 14, description,
  apply: defaultApply(id, category, faculties, description),
});

// ── anticipation (3 new) ──────────────────────────────────────────────────────
const anticipation: ReasoningMode[] = [
  m('an.temporal_threat_forecast', 'Temporal Threat Forecasting',
    'geopolitical_risk',
    ['anticipation', 'intelligence'],
    'Predict when dormant risk factors (sanctions-list proximity, CAHRA route dormancy, PEP mandate ' +
    'expiry) will likely materialise into active threats. Uses exponential decay correlated with ' +
    'upcoming geopolitical triggers and regulatory-calendar events to produce a probabilistic ' +
    'threat-maturity horizon with 95% confidence intervals.'),

  m('an.cahra_route_reactivation_forecast', 'CAHRA Route Reactivation Forecast',
    'geopolitical_risk',
    ['anticipation', 'intelligence', 'data_analysis'],
    'Specifically models the dormancy–reactivation lifecycle of Conflict-Affected and High-Risk Area ' +
    'trade routes. When a known CAHRA supply-chain route has been dormant >90 days, cross-correlates ' +
    'with geopolitical event calendars (ceasefires, sanctions-designation changes, elections) to ' +
    'forecast probable reactivation windows. Aligns with LBMA Responsible Gold Guidance Step 3.'),

  m('an.pep_role_transition_forecast', 'PEP Role Transition Forecast',
    'geopolitical_risk',
    ['anticipation', 'intelligence'],
    'Track PEPs whose mandates, term-limits, or institutional roles are approaching expiry. Model ' +
    'post-mandate risk: outgoing officials frequently face enforcement actions, asset-freezing orders, ' +
    'or court proceedings within 6–18 months of leaving office. Proactively flags customers whose ' +
    'PEP status will change tier within the forecast horizon (FATF R.12 enhanced monitoring).'),
];

// ── introspection (2 new) ──────────────────────────────────────────────────────
const introspection: ReasoningMode[] = [
  m('intr.mlro_cognitive_load_monitor', 'MLRO Cognitive Load Monitor',
    'epistemic_quality',
    ['introspection'],
    'Detect alert-fatigue signatures in the reviewing MLRO\'s decision patterns: velocity ' +
    '(cases/hour > 8), sub-30s case reviews on high-risk matters, consecutive-approval streaks ≥5, ' +
    'and high-velocity windows outside business hours. Emits a fatigueScore and recommended ' +
    'intervention (case reassignment, mandatory break) to maintain SOC2 CC7.4 control effectiveness.'),

  m('intr.false_positive_drift_detector', 'False Positive Drift Detector',
    'epistemic_quality',
    ['introspection', 'data_analysis'],
    'Monitor rolling false-positive rate per screening mode over 90-day windows. When a mode\'s ' +
    'observed FP rate exceeds 30% with ≥10 supporting cases, flag it for Bayesian threshold ' +
    'recalibration. Surfaces the modes contributing most to screening burden without contributing ' +
    'to confirmed STR/SAR outcomes — enabling evidence-based threshold tightening via MLRO approval.'),
];

// ── argumentation (2 new) ──────────────────────────────────────────────────────
const argumentation: ReasoningMode[] = [
  m('arg.adversarial_counterfactual_explainer', 'Adversarial Counterfactual Explainer',
    'epistemic_quality',
    ['argumentation', 'reasoning'],
    'For any escalation or STR disposition, generate a regulator-facing defensibility document: ' +
    '"what factual change to the evidence record would make this decision not triggerable?" ' +
    'Iterates over the causal DAG to find the minimal-flip-set — the smallest combination of ' +
    'evidence changes that would shift the verdict. Identifies immovable factors (confirmed ' +
    'sanctions, court judgments) that no counterfactual can remove. UAE FDL 10/2025 Art.16.'),

  m('arg.jurisdiction_str_conflict_resolver', 'Jurisdiction STR Obligation Conflict Resolver',
    'compliance_framework',
    ['argumentation', 'reasoning'],
    'Determine STR/SAR filing obligations across all applicable jurisdictions simultaneously ' +
    '(UAE FDL 10/2025 Art.17, FATF R.20-21, EU 6AMLD Art.36-40, UK POCA 2002 ss.330-332, ' +
    'US BSA 31 USC §5318(g)) and resolve conflicts where one jurisdiction mandates filing while ' +
    'another\'s tipping-off prohibition would block disclosure. Outputs a ranked obligation matrix ' +
    'with jurisdiction-specific goAML entity ID requirements.'),
];

// ── intelligence (3 new) ──────────────────────────────────────────────────────
const intelligence: ReasoningMode[] = [
  m('int.cross_case_typology_miner', 'Cross-Case Emerging Typology Miner',
    'intelligence_fusion',
    ['intelligence', 'data_analysis'],
    'Mine confirmed STR cases in the MLRO feedback journal for structural patterns absent from the ' +
    'FATF typology library. When ≥3 confirmed STRs share a fingerprint cluster (cosine similarity ' +
    '<0.35 intra-cluster distance, centroid similarity <0.80 to existing typologies), auto-propose ' +
    'a new typology candidate for four-eyes MLRO approval. Approved patterns feed into Bayesian priors.'),

  m('int.semantic_context_disambiguation', 'Semantic Context-Vector Disambiguation',
    'identity_fraud',
    ['intelligence', 'reasoning'],
    'Upgrade entity disambiguation from phonetic/identifier matching to semantic context vectors. ' +
    'Encode occupation, sector, known associates, and geographic context into an 87-dimensional ' +
    'feature space; compute cosine similarity against hit profiles. Hits with similarity <0.15 are ' +
    'classified confirmed_false_positive without LLM invocation. Directly reduces false-positive ' +
    'disparity for Arabic and South Asian names (FATF R.10 / bias-monitor biasRatio target).'),

  m('int.shap_score_explainer', 'SHAP-Style Risk Score Explainer',
    'epistemic_quality',
    ['intelligence', 'data_analysis'],
    'Decompose every composite risk score (0–100) into per-feature SHAP attributions: which evidence ' +
    'dimension contributed how many points, counterfactual direction ("if PEP salience were 0, score ' +
    'would be 61 not 82"), and 95% confidence interval per dimension. Enables supervisory examination ' +
    'of individual screening decisions. UAE FDL 10/2025 Art.18 / EU AI Act Art.13 transparency.'),
];

// ── data_analysis (2 new) ────────────────────────────────────────────────────
const data_analysis: ReasoningMode[] = [
  m('da.dynamic_rba_recalculation', 'Dynamic RBA Risk-Tier Recalculation',
    'regulatory_aml',
    ['data_analysis', 'intelligence'],
    'Event-driven customer risk-tier recalculation. Triggers on sanctions-delta-intel, ' +
    'adverse-media-live, or geopolitical events affecting a known customer\'s jurisdiction. ' +
    'Re-runs the full customer-risk-rating pipeline and emits a tier-change event with before/after ' +
    'diff, trigger source, and regulatory rationale. Closes CG-2 (OFAC SDN delta auto-rescreening) ' +
    'and satisfies FATF R.10 ongoing-monitoring obligations.'),

  m('da.synthetic_redteam_generator', 'Synthetic Red-Team Scenario Generator',
    'threat_modeling',
    ['data_analysis', 'deep_thinking'],
    'Generate novel AML/CFT regression-test scenarios beyond the static eval-harness corpus, ' +
    'parameterised by typology, jurisdiction, entity type, and evasion sophistication (1–5). ' +
    'Uses Claude Opus with a content-frozen system prompt to produce deterministic goldVerdict + ' +
    'goldCitations arrays. Validated against RegressionScenario schema and rejected if PII patterns ' +
    'are detected. Continuously expands regression coverage (UAE FDL 10/2025 Art.18 continuous validation).'),
];

export const WAVE14_MODES: ReasoningMode[] = [
  ...anticipation,
  ...introspection,
  ...argumentation,
  ...intelligence,
  ...data_analysis,
];

export const WAVE14_OVERRIDES: ReasoningMode[] = [];
