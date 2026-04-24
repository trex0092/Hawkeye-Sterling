// Wave 4 — AI governance + financial-crime-predicate expansion pack.
//
// Adds 60 reasoning modes across nine themes sourced from:
//   • Hartono et al., "The Dual Persona of AI", ICIMCIS 2025 — dual-persona
//     framing and three ethical gaps (Explainability, Algorithmic Bias,
//     Nonhuman Ethical).
//   • 2026 AI-governance stack — EU AI Act (Reg. EU 2024/1689, Aug 2026
//     enforcement), NIST AI RMF 1.0 + GAI Profile, ISO/IEC 42001 AIMS,
//     OWASP Top 10 for LLM Applications.
//   • FATF Recommendation 3 (2021) environmental-crime predicate,
//     carbon-market integrity (ICVCM / Paris Art.6), insider-threat /
//     IP-exfiltration, synthetic-identity fraud, AI synthetic-media fraud.
//
// Modes are registered as stubs (following the established Wave-3 pattern —
// many Wave-3 modes also shipped as stubs and get real apply() overrides
// in a later phase). The stub rationale clearly marks placeholder output
// so audit tooling can distinguish inconclusive-stub findings from real
// inconclusive findings.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';

const stubApply = (modeId: string, category: ReasoningCategory, faculties: FacultyId[]) =>
  async (_ctx: BrainContext): Promise<Finding> => ({
    modeId,
    category,
    faculties,
    score: 0,
    confidence: 0,
    verdict: 'inconclusive',
    rationale: `[stub] ${modeId} — Wave-4 mode, implementation pending.`,
    evidence: [],
    producedAt: Date.now(),
  });

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
  apply?: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode => ({
  id, name, category, faculties, wave: 4, description,
  apply: apply ?? stubApply(id, category, faculties),
});

// ─── WAVE 4 REGISTRY ───────────────────────────────────────────────────

export const WAVE4_MODES: ReasoningMode[] = [
  // ─── AI GOVERNANCE — Hartono dual-persona + 2026 stack ────────────
  m('ai_dual_persona_lens', 'AI Dual-Persona Lens', 'governance', ['deep_thinking','introspection'], 'Apply the Hartono Solution-vs-Dilemma persona lens; emit findings for AI-as-tool AND AI-as-subject. Source: ICIMCIS 2025.'),
  m('ai_explainability_gap_audit', 'AI Explainability Gap Audit', 'governance', ['reasoning','argumentation'], "Audit Hartono's Explainability Gap: can the decision be traced to auditable features and thresholds?"),
  m('ai_algorithmic_bias_test', 'Algorithmic Bias Test', 'governance', ['data_analysis','introspection'], 'Slice fairness metrics across protected classes and representative subgroups; flag disparate-impact gaps.'),
  m('ai_nonhuman_ethical_gap', 'Nonhuman Ethical Gap', 'governance', ['reasoning','introspection'], "Audit Hartono's Nonhuman Ethical Gap: are non-anthropocentric stakeholders (ecosystems, future generations, autonomous agents) represented?"),
  m('eu_ai_act_tier_mapping', 'EU AI Act Risk-Tier Mapping', 'compliance_framework', ['intelligence','reasoning'], 'Classify scope against EU AI Act tiers: prohibited / high-risk / limited / minimal; cite the Annex.'),
  m('eu_ai_act_conformity_assessment', 'EU AI Act Conformity Assessment', 'compliance_framework', ['ratiocination','intelligence'], 'Verify conformity-assessment evidence for high-risk AI systems: risk-management, data governance, logging, transparency, human oversight.'),
  m('nist_ai_rmf_govern', 'NIST AI RMF — Govern', 'compliance_framework', ['intelligence'], 'Govern-function alignment: AI policies, accountability, culture, diversity of practice.'),
  m('nist_ai_rmf_map', 'NIST AI RMF — Map', 'compliance_framework', ['intelligence'], 'Map-function alignment: context, categorisation, capabilities, impact assessment.'),
  m('nist_ai_rmf_measure', 'NIST AI RMF — Measure', 'compliance_framework', ['data_analysis','intelligence'], 'Measure-function alignment: metrics, bias, robustness, security, trustworthiness evidence.'),
  m('nist_ai_rmf_manage', 'NIST AI RMF — Manage', 'compliance_framework', ['intelligence'], 'Manage-function alignment: prioritisation, response, recovery, communications.'),
  m('iso_42001_aims_check', 'ISO/IEC 42001 AIMS Check', 'compliance_framework', ['ratiocination','intelligence'], 'AI Management System alignment: PDCA cycle, policy, risk, objectives, roles, resources, competence, awareness, operations.'),
  m('ai_model_inventory_audit', 'AI Model Inventory Audit', 'governance', ['data_analysis','introspection'], 'Every production AI model registered with purpose, owner, tier, data sources, and last review.'),
  m('ai_registry_completeness', 'AI Registry Completeness', 'governance', ['data_analysis'], 'Registry entries carry model card, eval report, drift plan, fairness metric, kill-switch owner.'),
  m('ai_sbom_discipline', 'AI Software Bill of Materials', 'governance', ['intelligence'], 'SBOM present + current for every AI system: dependencies, model weights, fine-tune corpora, external services.'),
  m('ai_model_card_discipline', 'Model Card Discipline', 'governance', ['ratiocination'], 'Model card present with intended use, limitations, training data, evaluation metrics, ethical considerations.'),

  // ─── AI SECURITY — OWASP LLM Top 10 ─────────────────────────────────
  m('owasp_llm_prompt_injection', 'OWASP LLM01 — Prompt Injection', 'threat_modeling', ['intelligence','smartness'], 'Detect direct-prompt injection attack surface on LLM endpoints; verify sanitisation + system-prompt guards.'),
  m('owasp_llm_indirect_injection', 'OWASP LLM01 — Indirect Prompt Injection', 'threat_modeling', ['intelligence','smartness'], 'Detect indirect-prompt injection via retrieved content (RAG, PDF ingestion, tool output).'),
  m('owasp_llm_training_data_poisoning', 'OWASP LLM03 — Training-Data Poisoning', 'threat_modeling', ['data_analysis','intelligence'], 'Pipeline controls against poisoned pre-training / fine-tuning corpora; provenance of training data.'),
  m('owasp_llm_model_dos', 'OWASP LLM04 — Model Denial-of-Service', 'threat_modeling', ['data_analysis'], 'Resource-exhaustion / context-window-explosion controls on LLM endpoints.'),
  m('owasp_llm_supply_chain', 'OWASP LLM05 — Supply-Chain Vulnerability', 'threat_modeling', ['intelligence'], 'Third-party model, plugin, and dataset supply-chain diligence; SBOM verification.'),
  m('owasp_llm_sensitive_info_disclosure', 'OWASP LLM06 — Sensitive Info Disclosure', 'threat_modeling', ['intelligence'], 'Controls preventing PII / secrets / training-data leakage in LLM outputs.'),
  m('owasp_llm_insecure_plugin', 'OWASP LLM07 — Insecure Plugin Design', 'threat_modeling', ['smartness'], 'LLM plugin / tool-calling authz, input validation, scope-minimisation controls.'),
  m('owasp_llm_excessive_agency', 'OWASP LLM08 — Excessive Agency', 'threat_modeling', ['deep_thinking','introspection'], 'Agentic-AI scope of authority proportionate to risk; approval gates on irreversible actions.'),
  m('owasp_llm_overreliance', 'OWASP LLM09 — Overreliance', 'threat_modeling', ['introspection','argumentation'], 'Human-in-the-loop controls against unwarranted user reliance on LLM output.'),
  m('owasp_llm_model_theft', 'OWASP LLM10 — Model Theft', 'threat_modeling', ['intelligence'], 'Model-exfiltration controls: API rate limits, watermarking, access logs, API-key discipline.'),

  // ─── AGENTIC-AI OVERSIGHT ─────────────────────────────────────────
  m('agentic_ai_approval_gate', 'Agentic-AI Approval Gate', 'governance', ['introspection','ratiocination'], 'Agentic-AI irreversible actions require documented four-eyes / human-in-the-loop approval.'),
  m('agentic_ai_action_logging', 'Agentic-AI Action Logging', 'governance', ['data_analysis'], 'Agentic-AI maintains full action log with timestamps, intents, tool calls, and outcomes — regulator-replay ready.'),
  m('agentic_ai_kill_switch_readiness', 'Agentic-AI Kill-Switch Readiness', 'governance', ['introspection'], 'Documented kill-switch exists, tested on cadence, with clear trigger criteria and owner.'),
  m('human_in_the_loop_audit', 'Human-in-the-Loop Audit', 'governance', ['introspection','argumentation'], 'For AI-assisted decisions about persons, verify meaningful human oversight — not rubber-stamp review.'),
  m('shadow_ai_egress_detection', 'Shadow-AI Egress Detection', 'governance', ['data_analysis','intelligence'], 'Detect corporate-network egress to unregistered generative-AI APIs from sensitive-data workstations.'),

  // ─── AI FAILURE MODES ─────────────────────────────────────────────
  m('model_drift_detection', 'Model-Drift Detection', 'data_quality', ['data_analysis'], 'Continuous monitoring of model performance against production baseline; alert on statistical drift.'),
  m('concept_drift_detection', 'Concept-Drift Detection', 'data_quality', ['data_analysis'], 'Drift in the underlying distribution being modelled — different phenomenon from model drift.'),
  m('data_drift_detection', 'Data-Drift Detection', 'data_quality', ['data_analysis'], 'Input-feature distribution shift detection — covariate drift alarms.'),
  m('fairness_monitoring_audit', 'Fairness-Monitoring Audit', 'governance', ['data_analysis','introspection'], 'For AI systems deciding about persons, fairness metrics are recorded, monitored, and acted on.'),
  m('red_team_rigor_audit', 'Red-Team Rigor Audit', 'threat_modeling', ['smartness','intelligence'], 'Red-team evidence pre- and post-deployment for high-risk AI: breadth (OWASP LLM Top 10), depth, remediation proof.'),

  // ─── INSIDER THREAT / IP EXFILTRATION ──────────────────────────────
  m('insider_privileged_exfil', 'Insider Privileged Exfiltration', 'threat_modeling', ['data_analysis','intelligence'], 'Privileged user download / export volume materially above role-profile baseline in short window.'),
  m('insider_offboarding_spike', 'Insider Offboarding Spike', 'threat_modeling', ['intelligence','data_analysis'], 'Material access / print / external-drive activity in the 30 days before announced resignation.'),
  m('insider_usb_after_hours', 'Insider USB After-Hours', 'threat_modeling', ['data_analysis'], 'Removable-media write events outside business hours on sensitive-data workstations.'),
  m('insider_patent_after_exit', 'Insider Patent-After-Exit', 'forensic', ['intelligence','ratiocination'], 'Patent / publication by former employee within 6 months of exit covering role-accessed subject-matter.'),
  m('insider_dlp_bypass', 'Insider DLP Bypass', 'threat_modeling', ['smartness','intelligence'], 'Patterns consistent with deliberate DLP-rule evasion: chunking, encoding, renaming, split transfers.'),
  m('insider_access_velocity', 'Insider Access Velocity', 'behavioral_signals', ['data_analysis'], 'Rate of system / document access materially above role-profile baseline.'),
  m('insider_role_privilege_creep', 'Insider Privilege Creep', 'governance', ['introspection'], 'Accumulated entitlements beyond current role; stale privileges not revoked on role change.'),
  m('insider_external_domain_email_spike', 'Insider External-Domain Email Spike', 'threat_modeling', ['data_analysis'], 'Spike in outbound email to personal / free / competitor domains from privileged users.'),
  m('insider_vpn_anomaly', 'Insider VPN Anomaly', 'behavioral_signals', ['data_analysis'], 'VPN / access pattern geospatial anomalies inconsistent with role or declared location.'),
  m('insider_bulk_export_volume', 'Insider Bulk-Export Volume', 'behavioral_signals', ['data_analysis'], 'Absolute volume of data exported in a single session exceeds role-baseline tail percentile.'),

  // ─── ENVIRONMENTAL CRIME — FATF R.3 (2021) predicate ──────────────
  m('env_crime_cahra_flow', 'Environmental Crime — CAHRA Flow', 'esg', ['intelligence','ratiocination'], 'Commodity flow linked to CAHRA supply chain without OECD / legal-extraction evidence.'),
  m('env_crime_iuu_fishing', 'Environmental Crime — IUU Fishing', 'esg', ['intelligence','data_analysis'], 'Seafood supply chain includes vessels on IUU fishing registers or with AIS gaps over protected grounds.'),
  m('env_crime_illegal_logging_cites', 'Environmental Crime — Illegal Logging / CITES', 'esg', ['intelligence'], 'Timber species regulated under CITES shipped without permit or with forged CITES paperwork.'),
  m('env_crime_waste_trafficking_basel', 'Environmental Crime — Basel Waste Trafficking', 'esg', ['intelligence'], 'Cross-border waste shipment without Basel Convention notification or with mis-declared HS code.'),
  m('env_crime_illegal_mining_dore', 'Environmental Crime — Illegal Mining / Doré', 'esg', ['intelligence','ratiocination'], 'Doré imports declared from jurisdiction with no legal gold production; provenance mismatch.'),

  // ─── CARBON-MARKET FRAUD ──────────────────────────────────────────
  m('carbon_phantom_credit', 'Carbon Phantom Credit', 'esg', ['intelligence','data_analysis'], 'Credits issued against a project with no verifiable baseline or registry-issuance gap.'),
  m('carbon_double_counting', 'Carbon Double Counting', 'esg', ['data_analysis','reasoning'], 'Same tCO2e claimed under more than one corresponding-adjustment ledger or retirement registry.'),
  m('carbon_retirement_mismatch', 'Carbon Retirement Mismatch', 'esg', ['data_analysis'], 'Credits retired in one jurisdiction yet sold / claimed as offset in another without A6 corresponding adjustment.'),
  m('carbon_baseline_manipulation', 'Carbon Baseline Manipulation', 'esg', ['intelligence','data_analysis'], 'Project baseline / additionality documentation materially diverges from independent MRV evidence.'),
  m('carbon_mrv_gap', 'Carbon MRV Gap', 'esg', ['data_analysis'], 'Measurement / Reporting / Verification evidence incomplete or inconsistent with claimed impact.'),

  // ─── SYNTHETIC IDENTITY ───────────────────────────────────────────
  m('synthetic_identity_composition', 'Synthetic-Identity Composition', 'forensic', ['smartness','intelligence'], 'Identity attributes mix real and fabricated layers (SSN / DOB / address / device / biometric) without plausible provenance.'),
  m('device_fingerprint_cluster', 'Device-Fingerprint Cluster', 'behavioral_signals', ['data_analysis','intelligence'], 'Multiple distinct applicants share device fingerprints, browser entropy, or fraud-ring markers.'),
  m('thin_file_coordinated_applications', 'Thin-File Coordinated Applications', 'forensic', ['data_analysis','intelligence'], 'Cluster of thin-credit-file applications with coordinated timing, amount bands, and first-payment defaults.'),

  // ─── AI SYNTHETIC-MEDIA FRAUD ─────────────────────────────────────
  m('deepfake_ceo_pattern', 'Deepfake CEO Pattern', 'forensic', ['intelligence','smartness'], 'Payment / policy instruction authorised via live video/voice call matching CEO-deepfake-fraud profile.'),
  m('liveness_spoof_detection', 'Liveness-Spoof Detection', 'forensic', ['data_analysis','intelligence'], 'KYC liveness check shows face-swap / liveness-spoof / AI-generated-document artefacts.'),
];
