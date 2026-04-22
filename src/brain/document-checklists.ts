// Hawkeye Sterling — document checklists per customer-type × risk-tier.
// Concrete, procedural. Returned to operators as the "what to collect" list
// before a relationship is considered onboard-ready.

export type CustomerType = 'individual' | 'entity' | 'vasp' | 'dpms_refiner' | 'npo' | 'family_office' | 'trust' | 'partnership';
export type Tier = 'low' | 'medium' | 'high' | 'very_high' | 'pep';

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  evidenceKind: string; // mapped to EvidenceKind in evidence.ts where possible
}

export interface DocumentChecklist {
  customerType: CustomerType;
  tier: Tier;
  items: ChecklistItem[];
}

const req = (id: string, label: string, evidenceKind: string): ChecklistItem =>
  ({ id, label, required: true, evidenceKind });
const opt = (id: string, label: string, evidenceKind: string): ChecklistItem =>
  ({ id, label, required: false, evidenceKind });

export const CHECKLISTS: DocumentChecklist[] = [
  { customerType: 'individual', tier: 'low', items: [
    req('dl_ind_govt_id', 'Government-issued photo ID', 'customer_document'),
    req('dl_ind_proof_address', 'Proof of residential address (≤ 90 days)', 'customer_document'),
    req('dl_ind_occupation', 'Occupation declaration', 'customer_document'),
    req('dl_ind_screening', 'Screening evidence (lists + versions)', 'internal_system'),
  ]},
  { customerType: 'individual', tier: 'medium', items: [
    req('dl_ind_govt_id', 'Government-issued photo ID', 'customer_document'),
    req('dl_ind_proof_address', 'Proof of residential address', 'customer_document'),
    req('dl_ind_tax_res', 'Tax residence declaration', 'customer_document'),
    req('dl_ind_sow_narrative', 'Source-of-wealth narrative', 'customer_document'),
    req('dl_ind_sof_narrative', 'Source-of-funds narrative', 'customer_document'),
    req('dl_ind_screening', 'Screening evidence', 'internal_system'),
  ]},
  { customerType: 'individual', tier: 'high', items: [
    req('dl_ind_govt_id', 'Government-issued photo ID', 'customer_document'),
    req('dl_ind_proof_address', 'Proof of residential address', 'customer_document'),
    req('dl_ind_tax_res', 'Tax residence declaration', 'customer_document'),
    req('dl_ind_sow_evidenced', 'Source of wealth with supporting documents (pay slips, sale agreements, probate, etc.)', 'customer_document'),
    req('dl_ind_sof_evidenced', 'Source of funds with transaction-level documents', 'customer_document'),
    req('dl_ind_mlro_signoff', 'MLRO sign-off on onboarding', 'internal_system'),
    req('dl_ind_screening_delta', 'Re-screen evidence + delta list version', 'internal_system'),
    opt('dl_ind_adverse_media', 'Adverse-media scan outputs', 'news_article'),
  ]},
  { customerType: 'individual', tier: 'very_high', items: [
    req('dl_ind_govt_id', 'Government-issued photo ID', 'customer_document'),
    req('dl_ind_proof_address', 'Proof of residential address', 'customer_document'),
    req('dl_ind_tax_res', 'Tax residence declaration', 'customer_document'),
    req('dl_ind_sow_evidenced', 'Fully evidenced SoW', 'customer_document'),
    req('dl_ind_sof_evidenced', 'Fully evidenced SoF', 'customer_document'),
    req('dl_ind_senior_mgmt', 'Senior-management approval', 'internal_system'),
    req('dl_ind_mlro_signoff', 'MLRO sign-off', 'internal_system'),
    req('dl_ind_screening_delta', 'Re-screen evidence + delta', 'internal_system'),
    req('dl_ind_adverse_media', 'Adverse-media scan with cited sources', 'news_article'),
    opt('dl_ind_wealth_source_proof', 'Independent wealth-source corroboration (lawyer letter, tax filings)', 'customer_document'),
  ]},
  { customerType: 'individual', tier: 'pep', items: [
    req('dl_pep_role_evidence', 'Documented PEP role + dates', 'regulator_press_release'),
    req('dl_pep_rca_list', 'RCA list (family + close associates)', 'customer_document'),
    req('dl_pep_sow_narrative_evidenced', 'SoW narrative reconciled against public salary and declared assets', 'customer_document'),
    req('dl_pep_sof_evidenced', 'SoF with transaction-level evidence', 'customer_document'),
    req('dl_pep_senior_mgmt', 'Senior-management approval', 'internal_system'),
    req('dl_pep_mlro_signoff', 'MLRO sign-off', 'internal_system'),
    req('dl_pep_adverse_media', 'Adverse-media scan with cited sources', 'news_article'),
  ]},

  { customerType: 'entity', tier: 'low', items: [
    req('dl_ent_registry', 'Corporate registry extract', 'corporate_registry'),
    req('dl_ent_trade_licence', 'Trade licence', 'customer_document'),
    req('dl_ent_directors', 'Directors + government IDs', 'customer_document'),
    req('dl_ent_ubo_declaration', 'UBO declaration (≥25% / effective control)', 'customer_document'),
    req('dl_ent_screening', 'Screening evidence', 'internal_system'),
  ]},
  { customerType: 'entity', tier: 'medium', items: [
    req('dl_ent_registry', 'Corporate registry extract', 'corporate_registry'),
    req('dl_ent_trade_licence', 'Trade licence', 'customer_document'),
    req('dl_ent_directors', 'Directors + IDs', 'customer_document'),
    req('dl_ent_ubo_evidenced', 'UBO chain with % to natural persons', 'corporate_registry'),
    req('dl_ent_sof_narrative', 'SoF narrative + supporting docs', 'customer_document'),
    req('dl_ent_screening', 'Screening evidence', 'internal_system'),
  ]},
  { customerType: 'entity', tier: 'high', items: [
    req('dl_ent_registry', 'Corporate registry extract', 'corporate_registry'),
    req('dl_ent_trade_licence', 'Trade licence', 'customer_document'),
    req('dl_ent_directors', 'Directors + IDs', 'customer_document'),
    req('dl_ent_ubo_evidenced', 'Full UBO chain', 'corporate_registry'),
    req('dl_ent_nominee_disclosure', 'Nominee / bearer-share disclosure', 'customer_document'),
    req('dl_ent_group_structure', 'Group structure chart', 'customer_document'),
    req('dl_ent_sof_evidenced', 'SoF transaction-level evidence', 'customer_document'),
    req('dl_ent_mlro_signoff', 'MLRO sign-off', 'internal_system'),
    req('dl_ent_adverse_media', 'Adverse-media scan', 'news_article'),
  ]},
  { customerType: 'entity', tier: 'very_high', items: [
    req('dl_ent_registry', 'Corporate registry extract', 'corporate_registry'),
    req('dl_ent_trade_licence', 'Trade licence', 'customer_document'),
    req('dl_ent_directors', 'Directors + IDs', 'customer_document'),
    req('dl_ent_ubo_evidenced', 'Full UBO chain with independent verification', 'corporate_registry'),
    req('dl_ent_nominee_disclosure', 'Nominee disclosure', 'customer_document'),
    req('dl_ent_group_structure', 'Group structure chart', 'customer_document'),
    req('dl_ent_sof_evidenced', 'SoF transaction-level evidence', 'customer_document'),
    req('dl_ent_senior_mgmt', 'Senior-management approval', 'internal_system'),
    req('dl_ent_mlro_signoff', 'MLRO sign-off', 'internal_system'),
    req('dl_ent_adverse_media', 'Adverse-media scan', 'news_article'),
    opt('dl_ent_wolfsberg_cbddq', 'Wolfsberg CBDDQ (if correspondent flow)', 'customer_document'),
  ]},

  { customerType: 'vasp', tier: 'high', items: [
    req('dl_vasp_licence', 'Licence / registration with regulator', 'regulator_press_release'),
    req('dl_vasp_aml_programme', 'Published AML programme', 'customer_document'),
    req('dl_vasp_travel_rule', 'Travel-rule implementation evidence', 'customer_document'),
    req('dl_vasp_wallet_screening', 'Wallet-screening provider + methodology', 'customer_document'),
    req('dl_vasp_mixer_policy', 'Mixer / privacy-protocol policy', 'customer_document'),
    req('dl_vasp_mlro_signoff', 'MLRO sign-off', 'internal_system'),
  ]},

  { customerType: 'dpms_refiner', tier: 'very_high', items: [
    req('dl_ref_lbma_policy', 'LBMA RGG policy + 5-step process', 'customer_document'),
    req('dl_ref_oecd_annex_ii', 'OECD DDG Annex II workflow', 'customer_document'),
    req('dl_ref_supplier_list', 'Approved supplier list with country-of-origin', 'customer_document'),
    req('dl_ref_assay_policy', 'Assay comparison policy', 'customer_document'),
    req('dl_ref_chain_of_custody', 'Chain-of-custody documentation', 'customer_document'),
    req('dl_ref_audit_report', 'Most recent independent audit report', 'customer_document'),
    req('dl_ref_mlro_signoff', 'MLRO sign-off', 'internal_system'),
    req('dl_ref_senior_mgmt', 'Senior-management approval', 'internal_system'),
  ]},

  { customerType: 'npo', tier: 'high', items: [
    req('dl_npo_registration', 'Charity registration', 'corporate_registry'),
    req('dl_npo_beneficiaries', 'Beneficiary description / programme', 'customer_document'),
    req('dl_npo_geography', 'Operating geographies', 'customer_document'),
    req('dl_npo_controls', 'Disbursement controls', 'customer_document'),
    req('dl_npo_audited_accounts', 'Audited accounts', 'customer_document'),
  ]},

  { customerType: 'family_office', tier: 'very_high', items: [
    req('dl_fo_structure', 'Structure chart (trusts, PTC, holding cos)', 'customer_document'),
    req('dl_fo_controllers', 'Controller definitions for each vehicle', 'customer_document'),
    req('dl_fo_sow_narrative', 'Family SoW narrative', 'customer_document'),
    req('dl_fo_senior_mgmt', 'Senior-management approval', 'internal_system'),
  ]},

  { customerType: 'trust', tier: 'very_high', items: [
    req('dl_trust_deed', 'Trust deed', 'customer_document'),
    req('dl_trust_settlor', 'Settlor identity + SoW', 'customer_document'),
    req('dl_trust_trustees', 'Trustee identities', 'customer_document'),
    req('dl_trust_protectors', 'Protector(s) / enforcers if any', 'customer_document'),
    req('dl_trust_beneficiaries', 'Beneficiary class / named beneficiaries', 'customer_document'),
  ]},

  { customerType: 'partnership', tier: 'medium', items: [
    req('dl_pshp_agreement', 'Partnership agreement', 'customer_document'),
    req('dl_pshp_partners', 'Partner list with IDs + ownership %', 'customer_document'),
    req('dl_pshp_ubo_evidenced', 'UBO natural persons', 'corporate_registry'),
  ]},
];

export function checklistFor(customer: CustomerType, tier: Tier): DocumentChecklist | undefined {
  return CHECKLISTS.find((c) => c.customerType === customer && c.tier === tier);
}
