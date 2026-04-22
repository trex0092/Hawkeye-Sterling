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
  | 'pb_ubo_opacity';

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
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'pb_confirmed_sanctions_match',
    title: 'Confirmed sanctions match',
    trigger: 'Screening engine returns EXACT or STRONG with strong-identifier corroboration against UN / OFAC / EU / UK / UAE EOCN / UAE Local.',
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
    trigger: 'Screening engine returns POSSIBLE or WEAK; disambiguators incomplete.',
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
    trigger: 'Prospect or customer identified as PEP or Relative & Close Associate of a PEP.',
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
    trigger: 'Customer / counterparty / transaction nexus with FATF Call-for-Action or Increased-Monitoring jurisdiction.',
    steps: [
      { n: 1, action: 'EDD pack: beneficial-ownership diagrammed to natural persons; SoW/SoF documented.', owner: 'analyst', sla: 'before onboarding', citations: ['FATF R.19'] },
      { n: 2, action: 'Board-level approval for onboarding.', owner: 'senior_management', sla: 'before onboarding', citations: ['FATF R.19'] },
      { n: 3, action: 'Uplifted transaction-monitoring rules enabled.', owner: 'system', sla: 'on onboarding', citations: [] },
    ],
  },
  {
    id: 'pb_cash_over_threshold',
    title: 'Cash transaction ≥ AED 55,000 (DPMS)',
    trigger: 'Single or linked DPMS cash transaction at or above the DPMS threshold.',
    steps: [
      { n: 1, action: 'Full KYC captured at point of sale; receipts retained.', owner: 'analyst', sla: 'point of sale', citations: ['MoE DNFBP circulars'] },
      { n: 2, action: 'File cash transaction report via goAML.', owner: 'mlro', sla: 'within statutory window', citations: [] },
      { n: 3, action: 'Monitor for structuring / linked transactions over subsequent days.', owner: 'system', sla: 'continuous', citations: ['FATF RBA'] },
    ],
  },
  {
    id: 'pb_structuring_suspected',
    title: 'Structuring / smurfing suspected',
    trigger: 'Velocity rule fires for a customer or cluster immediately below reporting thresholds.',
    steps: [
      { n: 1, action: 'Build linked-party graph; identify connecting accounts / counterparties.', owner: 'analyst', sla: 'within 2 business days', citations: [] },
      { n: 2, action: 'Assess whether pattern supports suspicion; document observable facts only.', owner: 'mlro', sla: 'within 5 business days', citations: ['charter P3'] },
      { n: 3, action: 'If suspicion confirmed: file STR; keep customer unaware (no tipping-off).', owner: 'mlro', sla: 'within 5 business days', citations: ['FDL 20/2018 Art.25'] },
    ],
  },
  {
    id: 'pb_tbml_over_invoice',
    title: 'TBML over-invoicing detected',
    trigger: 'Trade-finance invoice materially above market rate vs. comparable trade-data benchmark.',
    steps: [
      { n: 1, action: 'Document discrepancy; request supporting contracts / bills of lading.', owner: 'analyst', sla: 'within 2 business days', citations: ['UCP 600'] },
      { n: 2, action: 'Escalate to MLRO; cross-check vessel tracking and shipment records.', owner: 'mlro', sla: 'within 3 business days', citations: [] },
      { n: 3, action: 'Decide: release, enhanced monitoring, STR, or exit.', owner: 'mlro', sla: 'within 5 business days', citations: ['FATF R.20'] },
    ],
  },
  {
    id: 'pb_vasp_mixer_inbound',
    title: 'Inbound from mixer / privacy protocol',
    trigger: 'On-chain analytics flag inbound funds sourced through a known mixer or privacy protocol.',
    steps: [
      { n: 1, action: 'Segregate the inbound value pending disposition.', owner: 'system', sla: 'immediate', citations: [] },
      { n: 2, action: 'Travel-rule data gap assessment; request originator data.', owner: 'analyst', sla: 'within 1 business day', citations: ['FATF R.16'] },
      { n: 3, action: 'MLRO disposition: return, reject, or onboarding with EDD; STR if suspicion.', owner: 'mlro', sla: 'within 5 business days', citations: [] },
    ],
  },
  {
    id: 'pb_tipping_off_risk',
    title: 'Tipping-off risk intercepted',
    trigger: 'Draft communication or operator action appears to disclose an internal suspicion / filing.',
    steps: [
      { n: 1, action: 'Block the communication or action; preserve evidence.', owner: 'system', sla: 'immediate', citations: ['FDL 20/2018 Art.25'] },
      { n: 2, action: 'Notify MLRO; substitute with neutral offboarding or status-only language.', owner: 'mlro', sla: 'same business day', citations: [] },
      { n: 3, action: 'Record incident in audit chain; review control effectiveness.', owner: 'system', sla: 'same business day', citations: ['FDL 10/2025 Art.24'] },
    ],
  },
  {
    id: 'pb_exit_relationship',
    title: 'Exit customer relationship',
    trigger: 'MLRO disposition = exit.',
    steps: [
      { n: 1, action: 'Use neutral offboarding language; no reasons tied to suspicion.', owner: 'analyst', sla: 'on event', citations: ['FDL 20/2018 Art.25'] },
      { n: 2, action: 'Preserve all evidence and audit trail; retention policy applies.', owner: 'system', sla: 'on event', citations: ['FDL 10/2025 Art.24'] },
      { n: 3, action: 'Route residual balances only to verified instructed account.', owner: 'analyst', sla: 'per process', citations: [] },
    ],
  },
  {
    id: 'pb_lbma_rgg_cahra',
    title: 'LBMA RGG — CAHRA sourced inputs',
    trigger: 'Refinery or bullion input originates from a CAHRA country.',
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
    trigger: 'UBO resolver returns no 25%-threshold candidate, or opacity score > 0.5.',
    steps: [
      { n: 1, action: 'Request additional ownership evidence: trust deeds, shareholder register, nominee agreements.', owner: 'analyst', sla: 'within 5 business days', citations: ['FATF R.24'] },
      { n: 2, action: 'If opacity persists: apply effective-control analysis; document.', owner: 'mlro', sla: 'within 10 business days', citations: [] },
      { n: 3, action: 'If still opaque: decline or exit; document rationale in the audit chain.', owner: 'mlro', sla: 'within 10 business days', citations: [] },
    ],
  },
];

export const PLAYBOOK_BY_ID: Map<PlaybookId, Playbook> = new Map(
  PLAYBOOKS.map((p) => [p.id, p]),
);
