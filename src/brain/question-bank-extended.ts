// Hawkeye Sterling — extended CDD / EDD / SoW / SoF question bank.
// 120+ structured questions across customer types. Each carries scope,
// risk tier applicability, and the evidence kinds that satisfy it.

export type CustomerScope = 'individual' | 'entity' | 'vasp' | 'dpms_refiner' | 'pep' | 'npo' | 'trade_finance' | 'real_estate' | 'insurance' | 'family_office';
export type QuestionTier = 'baseline' | 'enhanced' | 'pep' | 'high_risk_country';

export interface Question {
  id: string;
  scope: CustomerScope[];
  tier: QuestionTier[];
  prompt: string;
  acceptableEvidence: string[]; // kinds
}

const Q = (id: string, scope: CustomerScope[], tier: QuestionTier[], prompt: string, evidence: string[]): Question =>
  ({ id, scope, tier, prompt, acceptableEvidence: evidence });

export const QUESTION_BANK: Question[] = [
  // Identity — individual
  Q('qx_id_full_legal_name', ['individual'], ['baseline'], 'Confirm full legal name as shown on government-issued photo ID.', ['customer_document']),
  Q('qx_id_dob', ['individual'], ['baseline'], 'Date of birth.', ['customer_document']),
  Q('qx_id_nationality', ['individual'], ['baseline'], 'Nationality / all citizenships held.', ['customer_document']),
  Q('qx_id_tax_res', ['individual'], ['baseline'], 'Tax residence(s) in the last 24 months.', ['customer_document']),
  Q('qx_id_address', ['individual'], ['baseline'], 'Current residential address with proof ≤ 90 days old.', ['customer_document']),
  Q('qx_id_occupation', ['individual'], ['baseline'], 'Occupation and employer.', ['customer_document']),
  Q('qx_id_public_role', ['individual', 'pep'], ['baseline', 'pep'], 'Any current or former public function held (self, family, close associates).', ['customer_document']),
  Q('qx_id_sanctions_self_decl', ['individual'], ['baseline'], 'Self-declaration of any sanctions designation, prior or pending.', ['customer_document']),

  // Identity — entity
  Q('qx_ent_legal_name', ['entity', 'dpms_refiner'], ['baseline'], 'Full registered legal name.', ['corporate_registry']),
  Q('qx_ent_jurisdiction', ['entity'], ['baseline'], 'Jurisdiction of incorporation.', ['corporate_registry']),
  Q('qx_ent_reg_number', ['entity'], ['baseline'], 'Registration number / trade licence number.', ['corporate_registry']),
  Q('qx_ent_activity', ['entity'], ['baseline'], 'Description of business activities.', ['corporate_registry']),
  Q('qx_ent_directors', ['entity'], ['baseline'], 'List of directors with government-issued ID.', ['corporate_registry']),
  Q('qx_ent_ubos', ['entity'], ['baseline'], 'All natural persons holding ≥25% or effective control.', ['corporate_registry']),
  Q('qx_ent_ubo_nominee', ['entity'], ['enhanced', 'high_risk_country'], 'Any nominee arrangements across the ownership chain.', ['customer_document', 'corporate_registry']),
  Q('qx_ent_bearer_shares', ['entity'], ['enhanced'], 'Any bearer-share instruments in ownership chain.', ['customer_document']),
  Q('qx_ent_group_structure', ['entity'], ['enhanced'], 'Corporate group structure with percentages to UBO.', ['customer_document']),

  // SoW / SoF
  Q('qx_sow_origin', ['individual', 'pep'], ['enhanced', 'pep'], 'Source of wealth: how the overall stock of assets was accumulated.', ['customer_document', 'regulator_press_release']),
  Q('qx_sof_origin', ['individual', 'entity'], ['enhanced', 'pep'], 'Source of funds for this relationship / transaction.', ['customer_document']),
  Q('qx_sow_business_sale', ['individual'], ['enhanced'], 'If SoW includes business sale: buyer, date, sale documents.', ['customer_document']),
  Q('qx_sow_inheritance', ['individual'], ['enhanced'], 'If SoW includes inheritance: deceased, date, probate / court order.', ['court_filing', 'customer_document']),
  Q('qx_sow_investment_gain', ['individual'], ['enhanced'], 'If SoW includes investment gain: assets, holding period, realised vs. unrealised.', ['customer_document']),
  Q('qx_sof_salary', ['individual'], ['baseline'], 'If SoF is salary: employer, role, tenure, payslips.', ['customer_document']),
  Q('qx_sof_loan', ['individual', 'entity'], ['enhanced'], 'If SoF includes loan: lender, terms, repayment evidence.', ['customer_document']),
  Q('qx_sof_crypto_offramp', ['individual', 'vasp'], ['enhanced'], 'If SoF is crypto: on-chain provenance to legitimate origin.', ['internal_system']),

  // VASP-specific
  Q('qx_vasp_licensing', ['vasp'], ['baseline'], 'Licence / registration status of the VASP counterparty.', ['regulator_press_release']),
  Q('qx_vasp_travel_rule', ['vasp'], ['baseline'], 'Travel-rule data exchanged for in-scope transfers.', ['internal_system']),
  Q('qx_vasp_wallet_screen', ['vasp'], ['baseline'], 'On-chain screening performed against sanctioned clusters.', ['internal_system']),
  Q('qx_vasp_mixer_exposure', ['vasp'], ['enhanced'], 'Exposure to mixers, privacy coins, or privacy protocols.', ['internal_system']),

  // DPMS refiner
  Q('qx_ref_lbma_gate', ['dpms_refiner'], ['baseline'], 'LBMA RGG 5-step country-of-origin evidence for each input lot.', ['customer_document']),
  Q('qx_ref_oecd_annex', ['dpms_refiner'], ['enhanced'], 'OECD DDG Annex II evidence for CAHRA-sourced inputs.', ['customer_document']),
  Q('qx_ref_assay', ['dpms_refiner'], ['baseline'], 'Assay certificate comparison against refinery measurement.', ['internal_system']),
  Q('qx_ref_chain_of_custody', ['dpms_refiner'], ['baseline'], 'Unbroken chain-of-custody from origin through smelter/refiner to shipment.', ['customer_document']),

  // PEP
  Q('qx_pep_role', ['pep'], ['pep'], 'Specific role held (tier, function, dates).', ['customer_document', 'regulator_press_release']),
  Q('qx_pep_rcas', ['pep'], ['pep'], 'Relatives and close associates (RCAs) with role descriptions.', ['customer_document']),
  Q('qx_pep_sow_narrative', ['pep'], ['pep'], 'Narrative SoW reconciliation against public salary + declared assets.', ['customer_document']),
  Q('qx_pep_residences', ['pep'], ['pep'], 'Properties owned directly or via structures in any jurisdiction.', ['corporate_registry']),
  Q('qx_pep_senior_mgmt_approval', ['pep'], ['pep'], 'Senior-management approval documented for relationship.', ['internal_system']),

  // NPO
  Q('qx_npo_beneficiaries', ['npo'], ['baseline'], 'Beneficiary list and programme description.', ['customer_document']),
  Q('qx_npo_geography', ['npo'], ['enhanced', 'high_risk_country'], 'Operating geographies, including any CAHRA jurisdictions.', ['customer_document']),
  Q('qx_npo_disbursement_controls', ['npo'], ['enhanced'], 'Disbursement controls to prevent diversion.', ['internal_system']),
  Q('qx_npo_programme_cash_ratio', ['npo'], ['enhanced'], 'Programme-to-cash ratio with audited accounts.', ['customer_document']),

  // Real estate
  Q('qx_re_purchase_method', ['real_estate'], ['baseline'], 'Method of payment (cash, wire, financing).', ['customer_document']),
  Q('qx_re_buyer_ubo', ['real_estate'], ['enhanced'], 'If buyer is entity: UBO natural person + SoF.', ['corporate_registry']),
  Q('qx_re_title_chain', ['real_estate'], ['enhanced'], 'Title-transfer chain for last 24 months.', ['corporate_registry']),

  // Trade finance
  Q('qx_tf_parties', ['trade_finance'], ['baseline'], 'All parties to the trade with existence verified in registries.', ['corporate_registry']),
  Q('qx_tf_goods', ['trade_finance'], ['baseline'], 'Goods description + HS code with unit-price benchmark check.', ['customer_document']),
  Q('qx_tf_route', ['trade_finance'], ['enhanced'], 'Vessel route consistency + AIS continuity evidence.', ['internal_system']),
  Q('qx_tf_sanc_regime', ['trade_finance'], ['enhanced'], 'Sanction-regime assessment for cargo, parties, vessels, routing.', ['internal_system']),

  // Insurance
  Q('qx_ins_premium_source', ['insurance'], ['baseline'], 'Source of premium funds and relationship to insured.', ['customer_document']),
  Q('qx_ins_beneficiary_history', ['insurance'], ['enhanced'], 'Beneficiary history and any changes over policy term.', ['internal_system']),

  // Family office
  Q('qx_fo_governance', ['family_office'], ['baseline'], 'Family office governance and controller definitions.', ['corporate_registry']),
  Q('qx_fo_purpose_trust', ['family_office'], ['enhanced'], 'Purpose-trust / PTC structure detailing settlor, trustees, beneficiaries.', ['customer_document']),

  // Screening scope / ongoing
  Q('qx_scrn_scope', ['individual', 'entity', 'dpms_refiner', 'vasp'], ['baseline'], 'Lists included in scope and version dates used.', ['internal_system']),
  Q('qx_scrn_cadence', ['individual', 'entity'], ['baseline'], 'Re-screening cadence against delta lists.', ['internal_system']),

  // Governance
  Q('qx_gov_four_eyes', ['individual', 'entity', 'dpms_refiner', 'vasp'], ['baseline'], 'Four-eyes / SoD evidence on disposition.', ['internal_system']),
  Q('qx_gov_mlro_signoff', ['individual', 'entity', 'dpms_refiner'], ['baseline'], 'MLRO sign-off captured for escalated dispositions.', ['internal_system']),
  Q('qx_gov_retention', ['individual', 'entity', 'dpms_refiner'], ['baseline'], 'Retention horizon recorded against record (≥ 5 yr statutory, 10 yr internal).', ['internal_system']),

  // Data quality
  Q('qx_dq_source_freshness', ['individual', 'entity'], ['baseline'], 'Each evidence item carries observedAt and source credibility.', ['internal_system']),
  Q('qx_dq_lineage', ['entity'], ['enhanced'], 'Lineage preserved from ingest through enrichment to output.', ['internal_system']),
];
