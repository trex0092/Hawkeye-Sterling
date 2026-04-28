// Wave 6 — behavioral science, network science, cryptoasset forensics,
// geopolitical risk, corporate intelligence, epistemic quality,
// psychological profiling, and insider threat reasoning modes.
// 35 modes. All stub-apply pending Phase 8.

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
    rationale: `[stub] ${modeId} — implementation pending (Phase 8).`,
    evidence: [],
    producedAt: Date.now(),
  });

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
): ReasoningMode => ({
  id, name, category, faculties, wave: 6, description,
  apply: stubApply(id, category, faculties),
});

// ── behavioral_science (5) ────────────────────────────────────────────────────
const behavioral_science: ReasoningMode[] = [
  m('bs.confirmation_bias_audit', 'Confirmation Bias Audit', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Audit the evidence-selection process for confirmation bias: enumerate discarded adverse evidence, apply the name-swap test, and require three disconfirming data points before sealing a risk-lowering verdict.'),
  m('bs.motivated_reasoning_scan', 'Motivated Reasoning Scan', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Test whether the conclusion aligns with a commercial or relational interest of an internal stakeholder; apply the name-swap identity test; flag any divergence between formal analysis and independent-reviewer expectation.'),
  m('bs.social_proof_fallacy_check', 'Social Proof Fallacy Check', 'behavioral_science',
    ['reasoning', 'argumentation'],
    'Detect and neutralise "market practice" and "everyone does it" defences; require the specific regulatory provision permitting the practice; treat prevalence without legal authority as a red flag.'),
  m('bs.sunk_cost_relationship_test', 'Sunk-Cost Relationship Test', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Apply the zero-based risk assessment to relationship continuation: would this entity be approved as a new onboarding today? Prior revenue, tenure, or remediation investment is not a mitigating factor.'),
  m('bs.groupthink_dissent_check', 'Groupthink Dissent Check', 'behavioral_science',
    ['reasoning', 'introspection'],
    'Detect unanimous committee approval on HIGH/CRITICAL cases without documented dissent; verify devil\'s advocate appointment; flag deliberation time under 15 minutes on complex cases as a procedural groupthink indicator.'),
];

// ── network_science (5) ───────────────────────────────────────────────────────
const network_science: ReasoningMode[] = [
  m('ns.graph_centrality_scoring', 'Graph Centrality Scoring', 'network_science',
    ['data_analysis', 'intelligence'],
    'Compute degree, betweenness, and eigenvector centrality for every node in the subject\'s entity graph; flag high-betweenness nodes (bridge controllers) as priority investigation targets.'),
  m('ns.bridge_node_analysis', 'Bridge Node Analysis', 'network_science',
    ['data_analysis', 'inference'],
    'Identify articulation points in the counterparty network whose removal would disconnect criminal sub-graphs from legitimate entities; treat bridge nodes as probable gatekeepers requiring EDD.'),
  m('ns.clique_detection', 'Clique and Dense Subgraph Detection', 'network_science',
    ['data_analysis', 'intelligence'],
    'Detect dense subgraphs (cliques) within the transaction or ownership network; flag cliques where all members share a common controller, registered agent, or beneficial owner as shell-network indicators.'),
  m('ns.temporal_network_evolution', 'Temporal Network Evolution Analysis', 'network_science',
    ['data_analysis', 'anticipation'],
    'Track how the entity network evolves over time; detect rapid expansion of node count following a triggering event (regulatory action, sanctions designation) as a network-restructuring evasion signal.'),
  m('ns.network_density_scoring', 'Network Density and Opacity Scoring', 'network_science',
    ['data_analysis', 'intelligence'],
    'Score the network\'s overall opacity using density (edges ÷ max possible edges), proportion of anonymous nodes, and multi-hop depth to reach natural persons; escalate any network scoring HIGH on all three dimensions.'),
];

// ── cryptoasset_forensics (5) ─────────────────────────────────────────────────
const cryptoasset_forensics: ReasoningMode[] = [
  m('cf.blockchain_provenance_trace', 'Blockchain Provenance Tracing', 'cryptoasset_forensics',
    ['intelligence', 'data_analysis'],
    'Trace cryptoasset flows from wallet to fiat off-ramp across all chains; identify mixer/tumbler exposure, privacy-coin swap, chain-hop, and VASP counterparty licence status at each hop.'),
  m('cf.defi_protocol_risk_assessment', 'DeFi Protocol Risk Assessment', 'cryptoasset_forensics',
    ['intelligence', 'reasoning'],
    'Assess DeFi protocol interactions: DEX swap chains obscuring origin, cross-chain bridge hops ≥2, NFT wash-trading patterns, DAO treasury beneficiary opacity, liquidity-pool rug-pull indicators.'),
  m('cf.vasp_counterparty_profiling', 'VASP Counterparty Profiling', 'cryptoasset_forensics',
    ['intelligence', 'data_analysis'],
    'Profile every VASP counterparty for licence status, FATF jurisdiction risk, travel-rule compliance posture, known mixer or high-risk exchange association, and adverse regulatory history.'),
  m('cf.mixer_tumbler_detection', 'Mixer and Tumbler Exposure Detection', 'cryptoasset_forensics',
    ['intelligence', 'inference'],
    'Detect direct or indirect mixer/tumbler interactions across the full wallet cluster; treat any confirmed mixer exposure as a CRITICAL finding requiring Travel Rule compliance check regardless of nominal amount.'),
  m('cf.onchain_sanctions_screening', 'On-Chain Sanctions Wallet Screening', 'cryptoasset_forensics',
    ['intelligence', 'data_analysis'],
    'Screen every wallet address in the subject\'s cluster against OFAC SDN crypto addresses, EU consolidated crypto identifiers, and third-party blockchain intelligence attribution clusters for sanctioned entities.'),
];

// ── geopolitical_risk (4) ─────────────────────────────────────────────────────
const geopolitical_risk: ReasoningMode[] = [
  m('gr.sanctions_jurisdiction_shift', 'Sanctions Evasion via Jurisdiction Shift', 'geopolitical_risk',
    ['geopolitical_awareness', 'intelligence'],
    'Detect rapid re-registration, flag-hopping, or beneficial-ownership migration to a new jurisdiction immediately following or anticipating a sanctions designation; treat timing coincidence as evasion evidence.'),
  m('gr.state_sponsored_ml_detection', 'State-Sponsored Money Laundering Detection', 'geopolitical_risk',
    ['geopolitical_awareness', 'intelligence'],
    'Apply the DPRK, Iran, and Russia state-sponsored ML typologies; cross-reference crypto wallet clusters, petroleum trade routes, and oligarch asset-migration patterns against published UN Panel of Experts and OFAC advisory attribution data.'),
  m('gr.geopolitical_recalibration_trigger', 'Geopolitical Recalibration Trigger', 'geopolitical_risk',
    ['geopolitical_awareness', 'anticipation'],
    'Trigger portfolio-wide risk recalibration upon FATF grey/black-listing, UN Security Council sanctions resolution, armed conflict outbreak, or major CPI movement ≥10 points affecting a jurisdiction with existing customer exposure.'),
  m('gr.conflict_zone_nexus_mapping', 'Conflict Zone Nexus Mapping', 'geopolitical_risk',
    ['geopolitical_awareness', 'synthesis'],
    'Map every financial flow with a nexus to an active armed-conflict zone; assess whether flows constitute legitimate humanitarian activity, commercial activity with conflict-finance risk, or direct TF/PF facilitation; cite CAHRA registry entries for each zone.'),
];

// ── corporate_intelligence (4) ────────────────────────────────────────────────
const corporate_intelligence: ReasoningMode[] = [
  m('ci.beneficial_ownership_graph_walk', 'Beneficial Ownership Graph Walk', 'corporate_intelligence',
    ['intelligence', 'data_analysis'],
    'Pierce every corporate, trust, foundation, and partnership veil to natural-person level; flag any chain exceeding 5 layers without a natural person identified at ≥25% ownership or effective control as a UBO opacity alert.'),
  m('ci.shell_company_hallmark_scorer', 'Shell Company Hallmark Scorer', 'corporate_intelligence',
    ['intelligence', 'reasoning'],
    'Score for shell hallmarks: bearer shares, nominee directors/shareholders, registered-agent address shared with ≥50 entities, no employees/premises/activity, jurisdiction-stacking across ≥2 secrecy jurisdictions; 3+ hallmarks = hard escalation.'),
  m('ci.professional_intermediary_audit', 'Professional Intermediary Audit', 'corporate_intelligence',
    ['intelligence', 'argumentation'],
    'Audit every lawyer, notary, accountant, trust/company service provider, and registered agent in the ownership chain; verify professional registration, absence of enforcement history, and whether their role creates a principal-agent misalignment.'),
  m('ci.corporate_substance_test', 'Corporate Substance Test', 'corporate_intelligence',
    ['intelligence', 'data_analysis'],
    'Compare declared revenue against sector-average revenue-per-employee benchmarks; verify physical premises, payroll records, supplier invoices, and utility consumption proportionate to stated business scale; flag implausible substance across ≥3 metrics as a probable front.'),
];

// ── epistemic_quality (4) ─────────────────────────────────────────────────────
const epistemic_quality: ReasoningMode[] = [
  m('eq.source_reliability_scoring', 'Source Reliability Scoring', 'epistemic_quality',
    ['reasoning', 'synthesis'],
    'Score every source used in the assessment on a four-tier reliability scale: (1) primary documentary evidence, (2) peer-reviewed/regulator notice, (3) mainstream financial press, (4) unverified secondary; weight conclusions proportionally and flag any HIGH verdict resting primarily on tier-4 sources.'),
  m('eq.evidence_triangulation_check', 'Evidence Triangulation Check', 'epistemic_quality',
    ['reasoning', 'synthesis'],
    'For every HIGH or CRITICAL adverse finding, require ≥3 independent corroborating sources from different source pipelines; flag any finding corroborated by only 1–2 sources as SINGLE-SOURCE RISK requiring expedited re-investigation.'),
  m('eq.base_rate_calibration', 'Base Rate Calibration', 'epistemic_quality',
    ['reasoning', 'inference'],
    'Calculate the empirical SAR/adverse-media/enforcement base rate for entities matching the subject\'s sector, jurisdiction, PEP status, and transaction profile; apply Bayesian updating explicitly — state prior, likelihood ratio, and posterior before adjusting the risk tier.'),
  m('eq.scope_sensitivity_audit', 'Scope Sensitivity Audit', 'epistemic_quality',
    ['reasoning', 'data_analysis'],
    'Verify that the risk score scales monotonically with the magnitude of evidence: USD 100M exposure must score higher than USD 100K for equivalent structural characteristics; 50 corroborated adverse-media hits must score higher than 1 isolated hit.'),
];

// ── psychological_profiling (4) ───────────────────────────────────────────────
const psychological_profiling: ReasoningMode[] = [
  m('pp.moral_disengagement_detection', 'Moral Disengagement Detection', 'psychological_profiling',
    ['intelligence', 'introspection'],
    'Identify moral disengagement mechanisms in case record and counterparty communications: euphemistic labelling, displacement of responsibility through intermediaries, diffusion of responsibility, dehumanisation of victims — each is an independent red flag naming deliberate construction.'),
  m('pp.authority_exploitation_probe', 'Authority Exploitation Probe', 'psychological_profiling',
    ['reasoning', 'introspection'],
    'Detect counterparty use of authority figures, professional credentials, or regulatory relationships to suppress due diligence scrutiny; require independent corroboration for every authority assertion used in a risk-lowering conclusion.'),
  m('pp.urgency_pressure_indicator', 'Urgency and Pressure Indicator', 'psychological_profiling',
    ['intelligence', 'introspection'],
    'Flag unusual urgency, deadline pressure, or emotional appeals to complete transactions or onboarding; document reluctance to provide information and stated preference for cash or bearer instruments as qualitative behavioral risk indicators.'),
  m('pp.narrative_coherence_scoring', 'Narrative Coherence Scoring', 'psychological_profiling',
    ['reasoning', 'synthesis'],
    'Read the subject\'s declared narrative — business purpose, transaction pattern, geographic footprint, SoW, counterparty relationships — as a single connected story; score coherence HIGH/MEDIUM/LOW; every internal inconsistency is more powerful evidence than an isolated red flag.'),
];

// ── insider_threat (4) ────────────────────────────────────────────────────────
const insider_threat: ReasoningMode[] = [
  m('it.privilege_abuse_chain_trace', 'Privilege Abuse Chain Trace', 'insider_threat',
    ['intelligence', 'inference'],
    'Trace insider-threat signals along the full privilege-abuse chain: authorised access → abnormal access pattern → exfiltration vector → external recipient → monetisation path; do not conclude "disgruntled employee" without every link evidenced.'),
  m('it.analyst_integrity_audit', 'Analyst Integrity Audit', 'insider_threat',
    ['introspection', 'reasoning'],
    'Audit the assessment chain for analyst conflicts of interest: undisclosed personal relationships with the subject, performance incentives aligned with a specific verdict, or hierarchical pressure from revenue-generating stakeholders; flag any alignment as a compliance integrity risk.'),
  m('it.access_anomaly_detection', 'Access Anomaly Detection', 'insider_threat',
    ['intelligence', 'data_analysis'],
    'Detect abnormal case-file access patterns: access outside normal working hours, bulk exports of CDD data, access to cases outside the analyst\'s assigned portfolio, or access immediately before a relationship approval or STR deadline — each is a behavioural access indicator.'),
  m('it.whistleblower_intelligence_integration', 'Whistleblower Intelligence Integration', 'insider_threat',
    ['intelligence', 'synthesis'],
    'Integrate whistleblower disclosures as credible adverse intelligence: apply the five-step protocol (cite as unverified, trigger enhanced adverse-media review, escalate to EDD, document corroboration status, file STR if corroborated by ≥2 independent sources); never dismiss solely on informal provenance.'),
];

export const WAVE6_MODES: ReasoningMode[] = [
  ...behavioral_science,
  ...network_science,
  ...cryptoasset_forensics,
  ...geopolitical_risk,
  ...corporate_intelligence,
  ...epistemic_quality,
  ...psychological_profiling,
  ...insider_threat,
];

export const WAVE6_OVERRIDES: ReasoningMode[] = [];
