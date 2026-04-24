// Hawkeye Sterling — policy library index.
// Named policies the firm maintains. Each row gives an owner, review cadence,
// approval body, and the charter / regulatory anchors it honours. Not the
// policy text itself — the index.

export type PolicyOwner = 'mlro' | 'compliance' | 'operations' | 'it_security' | 'data_protection_officer' | 'hr' | 'finance';

export interface Policy {
  id: string;
  title: string;
  owner: PolicyOwner;
  reviewMonths: number;
  approvedBy: 'board' | 'senior_management' | 'mlro' | 'committee';
  anchors: string[];
}

export const POLICIES: Policy[] = [
  { id: 'pol_aml_programme', title: 'AML / CFT / CPF Programme', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['FDL 20/2018', 'FDL 10/2025', 'CD 10/2019', 'CR 134/2025'] },
  { id: 'pol_cdd_edd', title: 'CDD / EDD Standard', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.10/12/19', 'Wolfsberg FAQ'] },
  { id: 'pol_sanctions', title: 'Sanctions Screening + TFS', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['CR 74/2020', 'UN 1267 et al.'] },
  { id: 'pol_transaction_monitoring', title: 'Transaction-Monitoring Rules + Thresholds', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF RBA'] },
  { id: 'pol_str_sar_reporting', title: 'STR / SAR / FFR / PNMR Reporting Procedure', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.20', 'CR 74/2020'] },
  { id: 'pol_record_retention', title: 'Record Retention + Destruction', owner: 'compliance', reviewMonths: 24, approvedBy: 'senior_management', anchors: ['FDL 10/2025 Art.24', 'FDL 45/2021 (PDPL)'] },
  { id: 'pol_ubo', title: 'Beneficial Ownership Standard', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.24/25'] },
  { id: 'pol_pep', title: 'PEP / RCA Management', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.12', 'Wolfsberg'] },
  { id: 'pol_training', title: 'AML/CFT Training Curriculum', owner: 'compliance', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.18'] },
  { id: 'pol_tipping_off', title: 'Tipping-off Prevention', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['FDL 20/2018 Art.25'] },
  { id: 'pol_four_eyes', title: 'Four-eyes / Separation of Duties', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['CR 134/2025 Art.19'] },
  { id: 'pol_pdpl_privacy', title: 'Data Protection (PDPL)', owner: 'data_protection_officer', reviewMonths: 12, approvedBy: 'board', anchors: ['FDL 45/2021 (PDPL)'] },
  { id: 'pol_vendor_risk', title: 'Vendor / Third-Party Risk', owner: 'operations', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.17'] },
  { id: 'pol_incident_mgmt', title: 'Incident Management', owner: 'it_security', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['Internal BCP'] },
  { id: 'pol_bcp', title: 'Business Continuity Plan', owner: 'operations', reviewMonths: 12, approvedBy: 'board', anchors: ['Internal BCP'] },
  { id: 'pol_whistleblowing', title: 'Whistleblowing + Non-Retaliation', owner: 'hr', reviewMonths: 24, approvedBy: 'board', anchors: ['Internal'] },
  { id: 'pol_code_of_conduct', title: 'Code of Conduct', owner: 'hr', reviewMonths: 24, approvedBy: 'board', anchors: ['Internal'] },
  { id: 'pol_gifts_entertainment', title: 'Gifts + Entertainment', owner: 'compliance', reviewMonths: 24, approvedBy: 'senior_management', anchors: ['Internal'] },
  { id: 'pol_conflict_of_interest', title: 'Conflict of Interest', owner: 'compliance', reviewMonths: 12, approvedBy: 'board', anchors: ['Internal'] },
  { id: 'pol_dpms_supply_chain', title: 'DPMS Supply-Chain Due Diligence (LBMA / OECD)', owner: 'operations', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['LBMA RGG', 'OECD DDG Annex II'] },

  // ── Wave 4 — AI governance stack (EU AI Act Aug 2026 + NIST + ISO) ──
  { id: 'pol_ai_governance', title: 'AI Governance Policy (EU AI Act / NIST AI RMF / ISO 42001)', owner: 'compliance', reviewMonths: 12, approvedBy: 'board', anchors: ['EU AI Act', 'NIST AI RMF', 'ISO/IEC 42001'] },
  { id: 'pol_ai_model_inventory', title: 'AI Model Inventory & Registry', owner: 'it_security', reviewMonths: 6, approvedBy: 'senior_management', anchors: ['ISO/IEC 42001', 'EU AI Act Art.11'] },
  { id: 'pol_ai_red_teaming', title: 'AI Red-Teaming & Adversarial Testing', owner: 'it_security', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['OWASP LLM Top 10', 'NIST AI RMF'] },
  { id: 'pol_ai_incident_reporting', title: 'AI Serious-Incident Reporting (72h)', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['EU AI Act Art.73'] },
  { id: 'pol_ai_human_oversight', title: 'AI Human-in-the-Loop & Kill-Switch', owner: 'compliance', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['EU AI Act', 'NIST AI RMF Govern'] },
  { id: 'pol_shadow_ai_detection', title: 'Shadow-AI Detection & Egress Controls', owner: 'it_security', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['ISO/IEC 42001', 'Internal InfoSec'] },
  { id: 'pol_synthetic_media_defence', title: 'Synthetic-Media / Deepfake Fraud Defence', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.20'] },

  // ── Wave 4 — Wave-4 financial-crime predicates ──────────────────────
  { id: 'pol_insider_threat_programme', title: 'Insider-Threat Programme', owner: 'it_security', reviewMonths: 12, approvedBy: 'board', anchors: ['Three Lines Model'] },
  { id: 'pol_environmental_crime_compliance', title: 'Environmental-Crime Compliance (FATF R.3 2021 predicate)', owner: 'compliance', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.3 (2021)', 'OECD DDG Annex II'] },
  { id: 'pol_carbon_credit_integrity', title: 'Carbon-Credit / VCM Integrity', owner: 'compliance', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['ICVCM Core Carbon Principles', 'Article 6 Paris Agreement'] },

  // ── Wave 5 — extended AML/CFT operational policies ───────────────────
  { id: 'pol_customer_risk_rating', title: 'Customer Risk Rating Methodology', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF RBA', 'FDL 10/2025 Art.7', 'CBUAE AML/CFT Standards'] },
  { id: 'pol_correspondent_banking', title: 'Correspondent Banking Minimum Standards', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['FATF R.13', 'Wolfsberg Correspondent Banking Principles', 'Basel CDD Paper'] },
  { id: 'pol_virtual_asset_policy', title: 'Virtual Asset / VASP Policy and Controls', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['FATF R.15/16', 'VARA Rulebook', 'CBUAE VASP Framework'] },
  { id: 'pol_dpms_threshold_reporting', title: 'DPMS Threshold Reporting Procedure (AED 55k)', owner: 'operations', reviewMonths: 6, approvedBy: 'senior_management', anchors: ['MoE Circular 2/2024', 'FDL 10/2025', 'goAML DPMS Module'] },
  { id: 'pol_ngo_charity_due_diligence', title: 'NGO / Charity Customer Due Diligence', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.8 NPO Guidance', 'FATF Updated Guidance 2023'] },
  { id: 'pol_funds_transfer_travel_rule', title: 'Funds Transfer and Travel Rule (FATF R.16)', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.16', 'SWIFT gpi Standards', 'VARA Travel Rule'] },
  { id: 'pol_name_screening_standards', title: 'Name Screening Standards and Threshold Policy', owner: 'mlro', reviewMonths: 12, approvedBy: 'senior_management', anchors: ['FATF R.6/10', 'CR 74/2020', 'OFAC SDN Programme'] },
  { id: 'pol_outsourcing_compliance', title: 'Compliance Outsourcing and Delegation Policy', owner: 'compliance', reviewMonths: 12, approvedBy: 'board', anchors: ['FATF R.17', 'CBUAE Outsourcing Standards', 'FDL 10/2025 Art.20'] },
  { id: 'pol_proliferation_financing', title: 'Proliferation Financing Risk Controls', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['FATF R.7', 'CR 74/2020', 'UN SC Res 1718/2231'] },
  { id: 'pol_ewra_methodology', title: 'Enterprise-Wide Risk Assessment Methodology', owner: 'mlro', reviewMonths: 12, approvedBy: 'board', anchors: ['FATF RBA', 'FDL 10/2025 Art.4', 'CBUAE EWRA Guidance'] },
];

export const POLICY_BY_ID: Map<string, Policy> = new Map(POLICIES.map((p) => [p.id, p]));
