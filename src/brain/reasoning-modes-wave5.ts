// Wave 5 — decision theory, behavioral economics, strategic reasoning,
// intelligence fusion, asset recovery, conduct risk, identity fraud,
// digital economy, and human rights reasoning modes.
// 35 modes. All stub-apply pending Phase 7.

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
  id, name, category, faculties, wave: 5, description,
  apply: defaultApply(id, category, faculties, description),
});

export const WAVE5_MODES: ReasoningMode[] = [
  // ── DECISION THEORY ─────────────────────────────────────────────────────
  m('expected_value_decision', 'Expected-Value Decision Analysis', 'decision_theory', ['reasoning', 'strong_brain'],
    'Computes expected value across decision branches (escalate / file / clear / block) weighting probability × severity × reversibility for each option.'),
  m('regret_minimization', 'Minimax Regret Decision Gate', 'decision_theory', ['reasoning', 'inference'],
    'Constructs the regret matrix across decision options and world states; selects the action minimising maximum regret for irreversible decisions.'),
  m('multi_criteria_decision_analysis', 'Multi-Criteria Decision Analysis (MCDA)', 'decision_theory', ['reasoning', 'strong_brain'],
    'Scores each disposition option across regulatory, customer-fairness, and institutional-risk criteria; aggregates with explicit weights before selecting the dominant option.'),
  m('value_of_information', 'Value of Information (VOI) Assessment', 'decision_theory', ['reasoning', 'inference'],
    'Quantifies the expected benefit of obtaining each missing piece of evidence before making a verdict; prioritises EDD requests by VOI descending.'),
  m('satisficing_vs_optimizing', 'Satisficing vs. Optimising Calibration', 'decision_theory', ['reasoning', 'introspection'],
    'Distinguishes between satisficing (finding a good-enough answer quickly) and optimising (finding the best answer exhaustively); flags cases where satisficing is applied when the stakes demand optimising.'),

  // ── BEHAVIORAL ECONOMICS ─────────────────────────────────────────────────
  m('prospect_theory_audit', 'Prospect Theory Bias Audit', 'behavioral_economics', ['reasoning', 'introspection'],
    'Detects loss-aversion framing (avoiding a false positive outweighs finding a true positive) and reference-point anchoring in risk assessment; requires explicit debiasing step.'),
  m('anchoring_debiasing', 'Anchoring Debiasing Protocol', 'behavioral_economics', ['reasoning', 'introspection'],
    'Identifies the first risk score or finding that anchored the analysis and systematically adjusts by generating an independent bottom-up re-assessment before finalising.'),
  m('status_quo_bias_probe', 'Status Quo Bias Probe', 'behavioral_economics', ['reasoning', 'introspection'],
    'Tests whether a decision to maintain an existing relationship, risk tier, or control is driven by inertia rather than evidence; requires a documented positive justification for status quo continuation.'),
  m('availability_cascade_guard', 'Availability Cascade Guard', 'behavioral_economics', ['reasoning', 'strong_brain'],
    'Detects over-weighting of recent, vivid, or high-profile typologies (DPRK cyber, pig-butchering) due to media salience; corrects by anchoring on empirical base rates before narrative adjustment.'),
  m('overconfidence_calibration', 'Overconfidence Calibration', 'behavioral_economics', ['reasoning', 'introspection'],
    'Tests for overconfidence by requiring explicit uncertainty intervals around every probability judgment; flags any interval narrower than the evidence supports and widens it before emission.'),

  // ── STRATEGIC REASONING ──────────────────────────────────────────────────
  m('nash_equilibrium_analysis', 'Nash Equilibrium Analysis', 'strategic', ['reasoning', 'deep_thinking'],
    'Models the financial arrangement as a strategic game; tests whether observed behaviour constitutes a Nash equilibrium for a legitimate vs. criminal arrangement; structural deviation is itself a red flag.'),
  m('mechanism_design_reverse', 'Mechanism Design Reverse Engineering', 'strategic', ['reasoning', 'strong_brain'],
    'Identifies the target regulatory outcome that a complex structure is engineered to produce; names the specific supervisory mechanism being circumvented; treats design intent as an independent red flag.'),
  m('commitment_device_audit', 'Commitment Device Audit', 'strategic', ['reasoning', 'inference'],
    'Assesses whether legal and contractual structures function as credible commitment devices that bind the principal to compliance; distinguishes credible from cheap-talk commitments.'),
  m('information_revelation_timing', 'Information Revelation Timing Analysis', 'strategic', ['reasoning', 'intelligence'],
    'Tests whether disclosures are timed to reveal or conceal material information; detects strategic sequencing where unfavourable facts are disclosed only after favourable context has been established.'),
  m('entry_exit_timing_analysis', 'Relationship Entry/Exit Timing Analysis', 'strategic', ['reasoning', 'intelligence'],
    'Analyses the timing of relationship initiation, peak activity, and exit for strategic motivation; rapid entry + high volume + abrupt exit is a one-shot-game defection signal.'),

  // ── INTELLIGENCE FUSION ──────────────────────────────────────────────────
  m('multi_source_intelligence_fusion', 'Multi-Source Intelligence Fusion', 'intelligence_fusion', ['intelligence', 'synthesis'],
    'Structured fusion of OSINT, financial intelligence (FININT), human intelligence signals, and regulatory intelligence into a unified probability-weighted picture.'),
  m('cross_domain_signal_integration', 'Cross-Domain Signal Integration', 'intelligence_fusion', ['intelligence', 'reasoning'],
    'Links financial, behavioural, geopolitical, and supply-chain intelligence signals across domain boundaries; identifies cross-domain patterns invisible within any single domain.'),
  m('confidence_weighted_aggregation', 'Confidence-Weighted Signal Aggregation', 'intelligence_fusion', ['reasoning', 'strong_brain'],
    'Aggregates disparate intelligence signals weighting each by source quality tier, temporal relevance, and corroboration status before computing composite risk.'),
  m('temporal_signal_sequencing', 'Temporal Signal Sequencing', 'intelligence_fusion', ['reasoning', 'intelligence'],
    'Sequences all intelligence signals chronologically to detect causal patterns, escalating series, and deliberate timing that reveal the structure of the underlying activity.'),
  m('network_edge_inference', 'Network Edge Inference', 'intelligence_fusion', ['intelligence', 'reasoning'],
    'Infers unobserved network edges (relationships not disclosed) from observed node behaviours; uses co-occurrence, shared identifiers, and transaction graph topology.'),

  // ── ASSET RECOVERY ───────────────────────────────────────────────────────
  m('civil_recovery_pathway_map', 'Civil Recovery Pathway Mapping', 'asset_recovery', ['reasoning', 'strong_brain'],
    'Maps all applicable civil recovery mechanisms — POCA UK, civil forfeiture UAE, unjust enrichment, unexplained wealth orders — and identifies the fastest available pathway with the highest recovery probability.'),
  m('cross_border_asset_trace', 'Cross-Border Asset Tracing Protocol', 'asset_recovery', ['reasoning', 'intelligence'],
    'International asset tracing through MLA, Egmont Group, ARIN-WA/ARINSA networks, and informal law enforcement cooperation channels; documents each tracing hop with jurisdiction and mechanism.'),
  m('crypto_seizure_protocol', 'Cryptocurrency Seizure and Tracing Protocol', 'asset_recovery', ['reasoning', 'strong_brain'],
    'Maps the seizure workflow for virtual assets: wallet identification, on-chain tracing to exchange, legal process for exchange KYC disclosure, asset preservation order, and transfer to government wallet.'),
  m('restrained_asset_governance', 'Restrained Asset Governance', 'asset_recovery', ['reasoning', 'inference'],
    'Governs court-restrained assets during ongoing proceedings: identifies permissible maintenance activities, reporting obligations to the court, and risk of dissipation through asset deterioration.'),

  // ── CONDUCT RISK ──────────────────────────────────────────────────────────
  m('culture_tone_audit', 'Organisational Culture and Tone Audit', 'conduct_risk', ['reasoning', 'intelligence'],
    'Assesses organisational culture as an AML risk driver: board messaging, MLRO empowerment, compliance-revenue balance, and the gap between stated and lived values.'),
  m('incentive_misalignment_scan', 'Incentive Misalignment Scan', 'conduct_risk', ['reasoning', 'strong_brain'],
    'Identifies incentive structures that reward risk-taking (origination bonuses without claw-back) or discourage reporting (retaliation risk, career consequences for SARs on profitable clients).'),
  m('whistleblower_signal_triage', 'Whistleblower Signal Triage', 'conduct_risk', ['reasoning', 'intelligence'],
    'Assesses, protects, and acts on internal compliance whistleblower signals; distinguishes motivated disclosure from malicious reports; routes credible signals to MLRO without revealing source identity.'),

  // ── IDENTITY FRAUD ───────────────────────────────────────────────────────
  m('deepfake_document_forensics', 'Deepfake Document Forensic Analysis', 'identity_fraud', ['reasoning', 'strong_brain'],
    'Multi-indicator forensic analysis of KYC documents: EXIF metadata, font consistency, MRZ checksum, biometric GAN artefacts, compression artifacts, and issuing-authority template library comparison.'),
  m('synthetic_identity_decomposition', 'Synthetic Identity Decomposition', 'identity_fraud', ['reasoning', 'intelligence'],
    'Decomposes identity claims into independent attribute layers (legal name, DOB, NID, address, device, biometric, behavioural); detects real-attribute / fabricated-attribute mixing patterns.'),
  m('biometric_gap_analysis', 'Biometric Verification Gap Analysis', 'identity_fraud', ['reasoning', 'strong_brain'],
    'Identifies gaps in biometric verification pipelines that enable identity substitution: liveness detection bypass, template ageing, cross-device continuity breaks, and presentation attack indicators.'),
  m('device_identity_coherence', 'Device-Identity Coherence Check', 'identity_fraud', ['reasoning', 'inference'],
    'Cross-references device fingerprint, IP geolocation, timezone, language settings, and declared identity to detect mismatches consistent with identity substitution or account takeover.'),

  // ── DIGITAL ECONOMY ──────────────────────────────────────────────────────
  m('platform_economy_risk', 'Platform Economy AML Risk Assessment', 'digital_economy', ['reasoning', 'strong_brain'],
    'Risk assessment for gig economy, marketplace, and P2P platform relationships: payment aggregation risk, earnings volatility as a cash-front cover, and chargeback abuse for proceeds extraction.'),
  m('defi_protocol_governance_risk', 'DeFi Protocol Governance and ML Risk Audit', 'digital_economy', ['reasoning', 'intelligence'],
    'Governance and ML risks in decentralised finance protocols: anonymous governance token voting, DAO treasury opacity, flash-loan-enabled market manipulation, and cross-chain bridge smart-contract vulnerabilities.'),
  m('embedded_finance_risk', 'Embedded Finance and BaaS ML Risk', 'digital_economy', ['reasoning', 'strong_brain'],
    'AML risks in banking-as-a-service, BaaS, and payment-as-a-service: pass-through liability, KYC delegation to non-banking partners, multi-tenant account structures, and sub-ledger opacity.'),
  m('open_banking_api_risk', 'Open Banking API and Aggregator ML Risk', 'digital_economy', ['reasoning', 'inference'],
    'PSD2/Open Banking data-sharing risks: aggregator account-level access abuse, synthetic account creation via API, mule-account management through aggregator dashboards, and consent-jacking.'),

  // ── HUMAN RIGHTS ──────────────────────────────────────────────────────────
  m('modern_slavery_financial_pattern', 'Modern Slavery Financial Pattern Detection', 'human_rights', ['reasoning', 'intelligence'],
    'Identifies financial patterns consistent with labour exploitation and debt bondage: wage suppression below legal minimum, group housing deductions, employer-controlled bank accounts, and forced savings schemes.'),
  m('hrd_financial_exclusion_probe', 'HRD Financial Exclusion Probe', 'human_rights', ['reasoning', 'strong_brain'],
    'Detects weaponised financial exclusion targeting human rights defenders, journalists, and activists: account closures without commercial rationale, coordinated de-banking, and transaction blocking aligned with advocacy activity.'),
];

export const WAVE5_OVERRIDES: ReasoningMode[] = [];
