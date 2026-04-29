// Hawkeye Sterling — MLRO playbooks.
// Step-by-step procedures per alert class. Playbooks never auto-execute; they
// are decision scaffolds the MLRO follows (and that the brain cites).

export type PlaybookId =
  | 'pb_confirmed_sanctions_match'
  | 'pb_partial_sanctions_match'
  | 'pb_pep_onboarding'
  | 'pb_high_risk_country_onboarding'
  | 'pb_cash_over_threshold'
  | 'pb_structuring_suspected'
  | 'pb_tbml_over_invoice'
  | 'pb_vasp_mixer_inbound'
  | 'pb_tipping_off_risk'
  | 'pb_exit_relationship'
  | 'pb_lbma_rgg_cahra'
  | 'pb_ubo_opacity'
  | 'pb_insider_threat_exfil'
  | 'pb_environmental_crime_nexus'
  | 'pb_deepfake_synthetic_kyc'
  | 'pb_ai_governance_breach'
  | 'pb_adverse_media_escalation'
  | 'pb_dormant_account_reactivation'
  | 'pb_real_estate_layering'
  | 'pb_correspondent_nested_account'
  | 'pb_proliferation_dual_use'
  | 'pb_carbon_market_fraud';

export interface PlaybookStep {
  n: number;
  action: string;
  owner: 'analyst' | 'mlro' | 'deputy_mlro' | 'senior_management' | 'system';
  sla: string;
  citations: string[];
}

export interface Playbook {
  id: PlaybookId;
  title: string;
  trigger: string;
  steps: PlaybookStep[];
  // Coverage-engine shape (see src/brain/coverage.ts).
  // `name`/`summary` mirror `title`/`trigger`; required-* arrays hold
  // taxonomy / anchor IDs this playbook needs discharged. Populated
  // incrementally as the taxonomy↔playbook mapping is authored.
  name: string;
  summary: string;
  slaHours?: number;
  requiredSkills: string[];
  requiredReasoning: string[];
  requiredAnalysis: string[];
  requiredAnchors: string[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'pb_confirmed_sanctions_match',
    title: 'Confirmed sanctions match',
    name: 'Confirmed sanctions match',
    trigger: 'Screening engine returns EXACT or STRONG with strong-identifier corroboration against UN / OFAC / EU / UK / UAE EOCN / UAE Local.',
    summary: 'Screening engine returns EXACT or STRONG with strong-identifier corroboration against UN / OFAC / EU / UK / UAE EOCN / UAE Local.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Freeze assets and block transactions under the customer relationship.', owner: 'system', sla: 'immediate; within 24 hours', citations: ['CR 74/2020 Art.4-7'] },
      { n: 2, action: 'Do NOT notify the customer or any third party (tipping-off prohibition).', owner: 'analyst', sla: 'immediate', citations: ['FDL 20/2018 Art.25'] },
      { n: 3, action: 'Escalate to MLRO; MLRO corroborates match against original source list.', owner: 'mlro', sla: 'same business day', citations: [] },
      { n: 4, action: 'Prepare FFR envelope in Hawkeye Sterling and queue to goAML.', owner: 'analyst', sla: 'within 2 business days', citations: ['CR 74/2020 Art.7'] },
      { n: 5, action: 'Senior management approval of FFR.', owner: 'senior_management', sla: 'same business day as FFR preparation', citations: ['CR 134/2025 Art.19'] },
      { n: 6, action: 'Submit FFR to UAE FIU via goAML.', owner: 'mlro', sla: 'within 5 business days of freeze', citations: ['CR 74/2020'] },
      { n: 7, action: 'Persist full reasoning chain + evidence in audit chain; retain per policy.', owner: 'system', sla: 'same business day', citations: ['FDL 10/2025 Art.24'] },
    ],
  },
  {
    id: 'pb_partial_sanctions_match',
    title: 'Partial sanctions match (PNMR)',
    name: 'Partial sanctions match (PNMR)',
    trigger: 'Screening engine returns POSSIBLE or WEAK; disambiguators incomplete.',
    summary: 'Screening engine returns POSSIBLE or WEAK; disambiguators incomplete.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Hold transaction; do not release.', owner: 'system', sla: 'immediate', citations: ['CR 74/2020'] },
      { n: 2, action: 'MLRO attempts disambiguation using additional identifiers, counterparty data, transliteration variants.', owner: 'mlro', sla: 'same business day', citations: [] },
      { n: 3, action: 'If match ruled out: document rationale (charter P7 scope declaration), release hold, preserve evidence.', owner: 'mlro', sla: 'within 1 business day', citations: ['FDL 10/2025 Art.24'] },
      { n: 4, action: 'If match still not ruled out: freeze and file PNMR via goAML.', owner: 'mlro', sla: 'within 5 business days', citations: ['CR 74/2020'] },
    ],
  },
  {
    id: 'pb_pep_onboarding',
    title: 'PEP / RCA onboarding',
    name: 'PEP / RCA onboarding',
    trigger: 'Prospect or customer identified as PEP or Relative & Close Associate of a PEP.',
    summary: 'Prospect or customer identified as PEP or Relative & Close Associate of a PEP.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Classify as high risk; flag in customer master.', owner: 'system', sla: 'on event', citations: ['FATF R.12'] },
      { n: 2, action: 'Source of wealth and source of funds documentation.', owner: 'analyst', sla: 'before onboarding', citations: ['FATF R.12'] },
      { n: 3, action: 'Senior management approval of the relationship.', owner: 'senior_management', sla: 'before onboarding', citations: ['FATF R.12'] },
      { n: 4, action: 'Ongoing enhanced monitoring enabled; review cadence set to annual.', owner: 'system', sla: 'on onboarding; annual', citations: [] },
    ],
  },
  {
    id: 'pb_high_risk_country_onboarding',
    title: 'High-risk country onboarding',
    name: 'High-risk country onboarding',
    trigger: 'Customer / counterparty / transaction nexus with FATF Call-for-Action or Increased-Monitoring jurisdiction.',
    summary: 'Customer / counterparty / transaction nexus with FATF Call-for-Action or Increased-Monitoring jurisdiction.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'EDD pack: beneficial-ownership diagrammed to natural persons; SoW/SoF documented.', owner: 'analyst', sla: 'before onboarding', citations: ['FATF R.19'] },
      { n: 2, action: 'Board-level approval for onboarding.', owner: 'senior_management', sla: 'before onboarding', citations: ['FATF R.19'] },
      { n: 3, action: 'Uplifted transaction-monitoring rules enabled.', owner: 'system', sla: 'on onboarding', citations: [] },
    ],
  },
  {
    id: 'pb_cash_over_threshold',
    title: 'Cash transaction ≥ AED 55,000 (DPMS)',
    name: 'Cash transaction ≥ AED 55,000 (DPMS)',
    trigger: 'Single or linked DPMS cash transaction at or above the DPMS threshold.',
    summary: 'Single or linked DPMS cash transaction at or above the DPMS threshold.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Full KYC captured at point of sale; receipts retained.', owner: 'analyst', sla: 'point of sale', citations: ['MoE DNFBP circulars'] },
      { n: 2, action: 'File cash transaction report via goAML.', owner: 'mlro', sla: 'within statutory window', citations: [] },
      { n: 3, action: 'Monitor for structuring / linked transactions over subsequent days.', owner: 'system', sla: 'continuous', citations: ['FATF RBA'] },
    ],
  },
  {
    id: 'pb_structuring_suspected',
    title: 'Structuring / smurfing suspected',
    name: 'Structuring / smurfing suspected',
    trigger: 'Velocity rule fires for a customer or cluster immediately below reporting thresholds.',
    summary: 'Velocity rule fires for a customer or cluster immediately below reporting thresholds.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Build linked-party graph; identify connecting accounts / counterparties.', owner: 'analyst', sla: 'within 2 business days', citations: [] },
      { n: 2, action: 'Assess whether pattern supports suspicion; document observable facts only.', owner: 'mlro', sla: 'within 5 business days', citations: ['charter P3'] },
      { n: 3, action: 'If suspicion confirmed: file STR; keep customer unaware (no tipping-off).', owner: 'mlro', sla: 'within 5 business days', citations: ['FDL 20/2018 Art.25'] },
    ],
  },
  {
    id: 'pb_tbml_over_invoice',
    title: 'TBML over-invoicing detected',
    name: 'TBML over-invoicing detected',
    trigger: 'Trade-finance invoice materially above market rate vs. comparable trade-data benchmark.',
    summary: 'Trade-finance invoice materially above market rate vs. comparable trade-data benchmark.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Document discrepancy; request supporting contracts / bills of lading.', owner: 'analyst', sla: 'within 2 business days', citations: ['UCP 600'] },
      { n: 2, action: 'Escalate to MLRO; cross-check vessel tracking and shipment records.', owner: 'mlro', sla: 'within 3 business days', citations: [] },
      { n: 3, action: 'Decide: release, enhanced monitoring, STR, or exit.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20'] },
    ],
  },
  {
    id: 'pb_vasp_mixer_inbound',
    title: 'Inbound from mixer / privacy protocol',
    name: 'Inbound from mixer / privacy protocol',
    trigger: 'On-chain analytics flag inbound funds sourced through a known mixer or privacy protocol.',
    summary: 'On-chain analytics flag inbound funds sourced through a known mixer or privacy protocol.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Segregate the inbound value pending disposition.', owner: 'system', sla: 'immediate', citations: [] },
      { n: 2, action: 'Travel-rule data gap assessment; request originator data.', owner: 'analyst', sla: 'within 1 business day', citations: ['FATF R.16'] },
      { n: 3, action: 'MLRO disposition: return, reject, or onboarding with EDD; STR if suspicion.', owner: 'mlro', sla: 'within 5 business days', citations: [] },
    ],
  },
  {
    id: 'pb_tipping_off_risk',
    title: 'Tipping-off risk intercepted',
    name: 'Tipping-off risk intercepted',
    trigger: 'Draft communication or operator action appears to disclose an internal suspicion / filing.',
    summary: 'Draft communication or operator action appears to disclose an internal suspicion / filing.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Block the communication or action; preserve evidence.', owner: 'system', sla: 'immediate', citations: ['FDL 20/2018 Art.25'] },
      { n: 2, action: 'Notify MLRO; substitute with neutral offboarding or status-only language.', owner: 'mlro', sla: 'same business day', citations: [] },
      { n: 3, action: 'Record incident in audit chain; review control effectiveness.', owner: 'system', sla: 'same business day', citations: ['FDL 10/2025 Art.24'] },
    ],
  },
  {
    id: 'pb_exit_relationship',
    title: 'Exit customer relationship',
    name: 'Exit customer relationship',
    trigger: 'MLRO disposition = exit.',
    summary: 'MLRO disposition = exit.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Use neutral offboarding language; no reasons tied to suspicion.', owner: 'analyst', sla: 'on event', citations: ['FDL 20/2018 Art.25'] },
      { n: 2, action: 'Preserve all evidence and audit trail; retention policy applies.', owner: 'system', sla: 'on event', citations: ['FDL 10/2025 Art.24'] },
      { n: 3, action: 'Route residual balances only to verified instructed account.', owner: 'analyst', sla: 'per process', citations: [] },
    ],
  },
  {
    id: 'pb_lbma_rgg_cahra',
    title: 'LBMA RGG — CAHRA sourced inputs',
    name: 'LBMA RGG — CAHRA sourced inputs',
    trigger: 'Refinery or bullion input originates from a CAHRA country.',
    summary: 'Refinery or bullion input originates from a CAHRA country.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Obtain OECD Annex II supply-chain declaration and supporting evidence.', owner: 'analyst', sla: 'before acceptance', citations: ['OECD DDG Annex II', 'LBMA RGG'] },
      { n: 2, action: 'Assess red flags; escalate to MLRO if any red-flag id fires.', owner: 'mlro', sla: 'same business day', citations: [] },
      { n: 3, action: 'Senior management sign-off for acceptance.', owner: 'senior_management', sla: 'before acceptance', citations: ['LBMA RGG'] },
      { n: 4, action: 'Record provenance trace to origin in the audit chain.', owner: 'system', sla: 'on acceptance', citations: [] },
    ],
  },
  {
    id: 'pb_ubo_opacity',
    title: 'Opaque UBO chain',
    name: 'Opaque UBO chain',
    trigger: 'UBO resolver returns no 25%-threshold candidate, or opacity score > 0.5.',
    summary: 'UBO resolver returns no 25%-threshold candidate, or opacity score > 0.5.',
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Request additional ownership evidence: trust deeds, shareholder register, nominee agreements.', owner: 'analyst', sla: 'within 5 business days', citations: ['FATF R.24'] },
      { n: 2, action: 'If opacity persists: apply effective-control analysis; document.', owner: 'mlro', sla: 'within 10 business days', citations: [] },
      { n: 3, action: 'If still opaque: decline or exit; document rationale in the audit chain.', owner: 'mlro', sla: 'within 10 business days', citations: [] },
    ],
  },
  // ── Wave 4 — new threat-typology playbooks ─────────────────────────────
  {
    id: 'pb_insider_threat_exfil',
    title: 'Insider threat — privileged-access exfiltration',
    name: 'Insider threat — privileged-access exfiltration',
    trigger: 'System or HR flags anomalous privileged-access activity: after-hours login, bulk data export, USB attachment, or access to systems outside job scope, by a current or recently offboarded employee.',
    summary: 'Anomalous privileged access by current or former employee suggesting data exfiltration.',
    slaHours: 4,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Immediately revoke or suspend the account; preserve all access logs without alteration.', owner: 'system', sla: 'immediate', citations: ['Three Lines Model', 'ISO/IEC 42001'] },
      { n: 2, action: 'Isolate and image the endpoint; do NOT alert the employee (tipping-off analogue).', owner: 'analyst', sla: 'within 2 hours', citations: ['FDL 20/2018 Art.25'] },
      { n: 3, action: 'Trace the full privilege-abuse chain: authorised access → abnormal pattern → exfiltration vector → external recipient → monetisation path. Require every link evidenced.', owner: 'mlro', sla: 'within 24 hours', citations: [] },
      { n: 4, action: 'Assess whether financial data accessed could facilitate financial crime (customer lists, AML filings, sanction overrides). If so, treat as predicate.', owner: 'mlro', sla: 'within 24 hours', citations: ['FATF R.20'] },
      { n: 5, action: 'If criminal nexus established: file STR citing insider-threat typology. Notify senior management and legal.', owner: 'mlro', sla: 'within 5 business days', citations: ['FDL 20/2018 Art.23'] },
      { n: 6, action: 'Record incident in audit chain; update insider-threat programme controls within 30 days.', owner: 'system', sla: 'same business day', citations: ['FDL 10/2025 Art.24'] },
    ],
  },
  {
    id: 'pb_environmental_crime_nexus',
    title: 'Environmental crime / IUU fishing financial nexus',
    name: 'Environmental crime / IUU fishing financial nexus',
    trigger: 'Transaction, customer, or counterparty linked to environmental-crime predicate (illegal mining, logging, IUU fishing, waste trafficking, wildlife trafficking) per FATF 2021 methodology.',
    summary: 'Financial nexus to environmental-crime predicate offence; requires supply-chain provenance evidence before treating as AML predicate.',
    slaHours: 48,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Document the specific environmental predicate alleged: sector, geography, commodity, and the financial flow linkage.', owner: 'analyst', sla: 'within 2 business days', citations: ['FATF R.3 (2021)'] },
      { n: 2, action: 'Require explicit CAHRA / supply-chain provenance evidence linking the predicate to the financial flow. ESG-only signals without the nexus are NOT AML predicates.', owner: 'mlro', sla: 'within 3 business days', citations: ['OECD DDG Annex II', 'LBMA RGG'] },
      { n: 3, action: 'Cross-check vessel tracking (IUU fishing), timber legality documents (logging), or waste-transfer certificates (waste trafficking) as applicable.', owner: 'analyst', sla: 'within 3 business days', citations: [] },
      { n: 4, action: 'If nexus evidenced: classify as high-risk; escalate to MLRO for STR assessment.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20'] },
      { n: 5, action: 'File STR if criminal proceeds suspected. Retain full evidence pack including provenance chain.', owner: 'mlro', sla: 'within 5 business days', citations: ['FDL 20/2018 Art.23', 'FDL 10/2025 Art.24'] },
    ],
  },
  {
    id: 'pb_deepfake_synthetic_kyc',
    title: 'Deepfake / synthetic-identity KYC bypass',
    name: 'Deepfake / synthetic-identity KYC bypass',
    trigger: 'Liveness-detection failure, biometric-anomaly flag, or post-onboarding intelligence suggesting the customer used a deepfake video, AI-generated identity document, or synthetic persona composite to pass KYC.',
    summary: 'Suspected use of synthetic or AI-generated identity to bypass biometric KYC controls.',
    slaHours: 8,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Suspend account and block transactions pending investigation. Do not alert the customer.', owner: 'system', sla: 'immediate', citations: ['FDL 20/2018 Art.25'] },
      { n: 2, action: 'Preserve all onboarding artefacts: video, liveness frames, submitted documents, IP/device metadata.', owner: 'analyst', sla: 'within 2 hours', citations: ['FDL 10/2025 Art.24'] },
      { n: 3, action: 'Re-run biometric verification with an independent liveness provider. Engage document forensics on submitted ID.', owner: 'analyst', sla: 'within 1 business day', citations: [] },
      { n: 4, action: 'MLRO reviews whether a synthetic-identity loan-mill, account-takeover, or money-mule pattern is present.', owner: 'mlro', sla: 'within 2 business days', citations: [] },
      { n: 5, action: 'If fraud confirmed: exit the relationship; file STR citing synthetic-media fraud typology; notify senior management.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20', 'FDL 20/2018 Art.23'] },
      { n: 6, action: 'Review KYC control effectiveness; update liveness-bypass detection parameters; record in AI incident register if AI tool was abused.', owner: 'system', sla: 'within 30 days', citations: ['EU AI Act Art.73'] },
    ],
  },
  {
    id: 'pb_ai_governance_breach',
    title: 'AI governance breach — high-risk system',
    name: 'AI governance breach — high-risk system',
    trigger: 'Detection of: undisclosed AI system in production, high-risk AI system without conformity assessment, shadow-LLM in compliance workflow, agentic AI making autonomous decisions without human-in-the-loop, or prompt-injection incident affecting compliance output.',
    summary: 'Uncontrolled or non-conformant AI system operating within the compliance or financial-crime perimeter.',
    slaHours: 72,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Isolate the non-conformant AI system; suspend any automated decisions it produced pending review.', owner: 'system', sla: 'immediate', citations: ['EU AI Act', 'ISO/IEC 42001'] },
      { n: 2, action: 'Apply the Hartono dual-persona lens: assess the system as BOTH a productivity tool AND a governance subject. Document explainability gap, algorithmic-bias risk, and nonhuman-ethical exposure.', owner: 'mlro', sla: 'within 24 hours', citations: ['EU AI Act'] },
      { n: 3, action: 'Traverse the full 2026 AI governance stack: EU AI Act tier, NIST AI RMF, ISO/IEC 42001, OWASP LLM Top-10. Cite every missing control as a gap.', owner: 'analyst', sla: 'within 48 hours', citations: ['NIST AI RMF', 'OWASP LLM Top 10'] },
      { n: 4, action: 'Escalate serious incident (harm, drift, prompt-injection, model-theft, autonomous-agent failure) within 72 hours per EU AI Act Art.73. Attach: model card, eval report, SBOM, decision log, drift trace.', owner: 'mlro', sla: 'within 72 hours', citations: ['EU AI Act Art.73'] },
      { n: 5, action: 'Senior management and Board notified if incident is material. Legal counsel engaged if regulatory notification required.', owner: 'senior_management', sla: 'within 72 hours', citations: [] },
      { n: 6, action: 'Remediate: add to AI model inventory, conduct red-team, implement human-in-the-loop, engage kill switch. Document corrective actions.', owner: 'analyst', sla: 'within 30 days', citations: ['ISO/IEC 42001', 'EU AI Act'] },
    ],
  },
  {
    id: 'pb_adverse_media_escalation',
    title: 'Adverse media escalation — credible allegation',
    name: 'Adverse media escalation — credible allegation',
    trigger: 'Adverse-media dossier returns a credible allegation of financial crime, sanctions evasion, corruption, or predicate offence against a current customer or material counterparty (POSSIBLE or above confidence).',
    summary: 'Credible adverse-media allegation triggers EDD refresh and STR assessment.',
    slaHours: 24,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Preserve and timestamp the adverse-media source (URL, headline, publication date, jurisdiction). Do not delete or modify.', owner: 'analyst', sla: 'on event', citations: ['FDL 10/2025 Art.19'] },
      { n: 2, action: 'Cross-reference against all active sanctions lists, PEP databases, and the internal case register.', owner: 'system', sla: 'same business day', citations: [] },
      { n: 3, action: 'MLRO assesses credibility: source reliability, corroboration across ≥2 independent outlets, specificity of allegation.', owner: 'mlro', sla: 'within 24 hours', citations: ['charter P3 / P5'] },
      { n: 4, action: 'Initiate EDD refresh: re-run full KYC, update risk rating, review transaction history for last 12 months.', owner: 'analyst', sla: 'within 3 business days', citations: ['FATF R.10'] },
      { n: 5, action: 'If transaction activity is consistent with the allegation: prepare STR; do not tip off. If allegation appears unfounded: document scope-declaration and close with MLRO sign-off (charter P7).', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20', 'FDL 20/2018 Art.25'] },
      { n: 6, action: 'Log to 10-year adverse-media lookback register per FDL 10/2025 Art.19.', owner: 'system', sla: 'same business day', citations: ['FDL 10/2025 Art.19'] },
    ],
  },
  {
    id: 'pb_dormant_account_reactivation',
    title: 'Dormant account reactivation — suspicious',
    name: 'Dormant account reactivation — suspicious',
    trigger: 'Account dormant for ≥12 months is reactivated with: change of contact details, unusual transaction volume, new counterparties inconsistent with prior profile, or reactivation request from third party.',
    summary: 'Dormant account reactivation with red flags suggesting account takeover or money-mule activation.',
    slaHours: 24,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Hold the reactivation; do not process any transactions until CDD is confirmed current.', owner: 'system', sla: 'immediate', citations: [] },
      { n: 2, action: 'Re-verify customer identity face-to-face or via live biometric if contact details have changed.', owner: 'analyst', sla: 'within 2 business days', citations: ['FATF R.10'] },
      { n: 3, action: 'Re-screen customer name against all active sanctions and adverse-media sources.', owner: 'system', sla: 'on event', citations: [] },
      { n: 4, action: 'MLRO reviews transaction profile pre- and post-dormancy; assess whether reactivation pattern fits money-mule or account-takeover typology.', owner: 'mlro', sla: 'within 3 business days', citations: [] },
      { n: 5, action: 'If suspicious: file STR; continue account hold. If cleared: reactivate with enhanced monitoring for 90 days.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20'] },
    ],
  },
  {
    id: 'pb_real_estate_layering',
    title: 'Real estate layering — multi-entity chain',
    name: 'Real estate layering — multi-entity chain',
    trigger: 'Real estate transaction involving: multiple SPVs or shell entities in the chain, mismatch between declared SoW and purchase price, cash-heavy settlement, rapid resale / flip, or nominee buyer.',
    summary: 'Complex multi-entity real estate structure used to layer illicit funds.',
    slaHours: 72,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Map the full ownership chain to natural persons; document every SPV, nominee, and trust.', owner: 'analyst', sla: 'within 3 business days', citations: ['FATF R.24/25'] },
      { n: 2, action: 'Obtain source of funds for the full acquisition price; reconcile with declared SoW.', owner: 'analyst', sla: 'within 5 business days', citations: ['FATF R.12'] },
      { n: 3, action: 'Check property valuation vs. market comps; flag discrepancy >15% as red flag.', owner: 'analyst', sla: 'within 3 business days', citations: [] },
      { n: 4, action: 'MLRO reviews layering indicators: opacity score, number of SPV layers, settlement method, rapid-resale timeline.', owner: 'mlro', sla: 'within 5 business days', citations: [] },
      { n: 5, action: 'If layering confirmed or suspicion remains: file STR; do not tip off any party in the chain.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20', 'FDL 20/2018 Art.25'] },
      { n: 6, action: 'Apply enhanced monitoring to all entities and individuals in the chain.', owner: 'system', sla: 'on STR filing', citations: [] },
    ],
  },
  {
    id: 'pb_correspondent_nested_account',
    title: 'Correspondent bank — nested account risk',
    name: 'Correspondent bank — nested account risk',
    trigger: 'Correspondent or respondent bank customer found to be providing services to a third-party financial institution (nested correspondent) without disclosure, or respondent bank is in a FATF Call-for-Action jurisdiction.',
    summary: 'Nested or undisclosed correspondent relationship exposing the firm to unvetted third-party financial crime risk.',
    slaHours: 48,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Suspend processing of transactions pending scope assessment; notify senior management.', owner: 'mlro', sla: 'same business day', citations: ['FATF R.13'] },
      { n: 2, action: 'Obtain and review the respondent bank\'s AML/CFT programme documentation: policy, ownership, regulatory status, enforcement history.', owner: 'analyst', sla: 'within 3 business days', citations: ['FATF R.13'] },
      { n: 3, action: 'Identify all nested institutions; confirm whether each has been onboarded and KYC\'d independently.', owner: 'analyst', sla: 'within 5 business days', citations: [] },
      { n: 4, action: 'MLRO decision: exit the correspondent relationship, remediate with enhanced due diligence, or obtain signed representations from respondent on nested institutions.', owner: 'mlro', sla: 'within 10 business days', citations: ['FATF R.13'] },
      { n: 5, action: 'If suspicion of financial crime: file STR covering the correspondent flow.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20'] },
    ],
  },
  {
    id: 'pb_proliferation_dual_use',
    title: 'Proliferation financing — dual-use goods',
    name: 'Proliferation financing — dual-use goods',
    trigger: 'Transaction or counterparty linked to dual-use goods (nuclear, chemical, biological, radiological, missile, or advanced conventional arms components) or export-control red flags: front companies, unusual shipping routes, vague commodity descriptions, end-use certificate anomalies.',
    summary: 'Suspected proliferation financing via dual-use goods trade; FATF R.7 and UN Security Council resolution obligations apply.',
    slaHours: 24,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Hold transaction immediately; do not release under any circumstances pending MLRO review.', owner: 'system', sla: 'immediate', citations: ['UN SC Res. 1718', 'UN SC Res. 2231', 'CR 74/2020'] },
      { n: 2, action: 'Screen all parties (seller, buyer, freight forwarder, end-user) against DPRK, Iran, Syria, Belarus, and Russia proliferation lists.', owner: 'analyst', sla: 'within 2 hours', citations: ['OFAC', 'UN Consolidated', 'EU FSF'] },
      { n: 3, action: 'Cross-check commodity codes against export-control lists (EU Dual-Use Regulation, UAE MOF export-control schedule). Flag any controlled commodity.', owner: 'analyst', sla: 'within 1 business day', citations: [] },
      { n: 4, action: 'MLRO applies FATF R.7 targeted financial sanctions (TFS) obligations; assess whether end-use certificate is credible.', owner: 'mlro', sla: 'within 24 hours', citations: ['FATF R.7', 'CR 74/2020'] },
      { n: 5, action: 'Notify legal counsel; consider voluntary disclosure to UAE MoE or relevant export-control authority.', owner: 'senior_management', sla: 'within 24 hours', citations: [] },
      { n: 6, action: 'File STR/FFR citing proliferation-financing typology. Retain full documentation of commodity, end-user, and financial flow.', owner: 'mlro', sla: 'within 5 business days', citations: ['FDL 20/2018 Art.23', 'FATF R.20'] },
    ],
  },
  {
    id: 'pb_carbon_market_fraud',
    title: 'Carbon market fraud — A6 double-counting',
    name: 'Carbon market fraud — A6 double-counting',
    trigger: 'Transaction, customer, or counterparty linked to voluntary or compliance carbon-credit trading with red flags: phantom credits, Article 6 corresponding-adjustment bypass, registry mismatch, double-issuance across registries, or VCM project without ICVCM Core Carbon Principles certification.',
    summary: 'Carbon-credit fraud including Article 6 Paris Agreement double-counting and phantom-credit issuance.',
    slaHours: 48,
    requiredSkills: [],
    requiredReasoning: [],
    requiredAnalysis: [],
    requiredAnchors: [],
    steps: [
      { n: 1, action: 'Hold any transfer or monetisation of credits pending provenance verification.', owner: 'system', sla: 'immediate', citations: [] },
      { n: 2, action: 'Verify credit serial numbers against the issuance registry (Gold Standard, Verra VCS, CORSIA, or national registry). Confirm retirement status.', owner: 'analyst', sla: 'within 2 business days', citations: ['ICVCM Core Carbon Principles', 'Article 6 Paris Agreement'] },
      { n: 3, action: 'Check for corresponding adjustment under Article 6.2/6.4: confirm the host country has authorised the international transfer and issued an ITMO. Absence of authorisation = double-counting red flag.', owner: 'analyst', sla: 'within 3 business days', citations: ['Article 6 Paris Agreement'] },
      { n: 4, action: 'MLRO assesses whether the fraud proceeds constitute a predicate offence and whether AML reporting obligations are triggered.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.3 (2021)', 'FATF R.20'] },
      { n: 5, action: 'If criminal proceeds suspected: file STR citing carbon-market fraud typology. Notify senior management.', owner: 'mlro', sla: 'within 5 business days', citations: ['FDL 20/2018 Art.23'] },
      { n: 6, action: 'Retain full credit provenance chain, registry screenshots, and correspondence in the audit trail.', owner: 'system', sla: 'same business day', citations: ['FDL 10/2025 Art.24'] },
    ],
  },
];

export const PLAYBOOK_BY_ID: Map<PlaybookId, Playbook> = new Map(
  PLAYBOOKS.map((p) => [p.id, p]),
);
