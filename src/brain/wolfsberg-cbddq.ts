// Hawkeye Sterling — Wolfsberg CBDDQ structure.
// The Wolfsberg Correspondent Banking Due Diligence Questionnaire is the
// industry baseline for FI-on-FI due diligence. This module encodes the
// section structure and a representative set of questions per section so
// the brain can drive a CBDDQ workflow without re-typing the format.

export type CbddqSection =
  | 'entity_overview'
  | 'ownership_management'
  | 'products_services'
  | 'aml_cft_programme'
  | 'kyc_cdd_edd'
  | 'pep_screening'
  | 'sanctions'
  | 'transaction_monitoring'
  | 'risk_assessment'
  | 'training_awareness'
  | 'audit'
  | 'reporting_recordkeeping';

export interface CbddqQuestion {
  id: string;
  section: CbddqSection;
  prompt: string;
  expectedEvidence: string[]; // EvidenceKind labels
}

export const CBDDQ: CbddqQuestion[] = [
  // 1. Entity overview
  { id: 'cb_eo_1', section: 'entity_overview', prompt: 'Full legal name and operating name(s).', expectedEvidence: ['corporate_registry'] },
  { id: 'cb_eo_2', section: 'entity_overview', prompt: 'Country of incorporation and any branches.', expectedEvidence: ['corporate_registry'] },
  { id: 'cb_eo_3', section: 'entity_overview', prompt: 'Primary regulator and licence references.', expectedEvidence: ['regulator_press_release'] },
  { id: 'cb_eo_4', section: 'entity_overview', prompt: 'Listing status and external rating (if any).', expectedEvidence: ['internal_system'] },

  // 2. Ownership & management
  { id: 'cb_om_1', section: 'ownership_management', prompt: 'Beneficial ownership down to natural persons.', expectedEvidence: ['corporate_registry'] },
  { id: 'cb_om_2', section: 'ownership_management', prompt: 'Senior management list and tenure.', expectedEvidence: ['internal_system'] },
  { id: 'cb_om_3', section: 'ownership_management', prompt: 'Identification of any PEPs in ownership / management.', expectedEvidence: ['regulator_press_release'] },

  // 3. Products & services
  { id: 'cb_ps_1', section: 'products_services', prompt: 'Products / services offered to customers and to FIs.', expectedEvidence: ['customer_document'] },
  { id: 'cb_ps_2', section: 'products_services', prompt: 'Use of nested correspondent banking and PTAs.', expectedEvidence: ['customer_document'] },
  { id: 'cb_ps_3', section: 'products_services', prompt: 'Provision of services to high-risk industries.', expectedEvidence: ['customer_document'] },

  // 4. AML/CFT programme
  { id: 'cb_pg_1', section: 'aml_cft_programme', prompt: 'Board-approved AML/CFT policy current within 12 months.', expectedEvidence: ['internal_system'] },
  { id: 'cb_pg_2', section: 'aml_cft_programme', prompt: 'Designated MLRO with stated independence + reporting line.', expectedEvidence: ['internal_system'] },
  { id: 'cb_pg_3', section: 'aml_cft_programme', prompt: 'Three-Lines model implemented.', expectedEvidence: ['internal_system'] },

  // 5. KYC / CDD / EDD
  { id: 'cb_kyc_1', section: 'kyc_cdd_edd', prompt: 'Risk-based CDD methodology with dynamic re-rating.', expectedEvidence: ['internal_system'] },
  { id: 'cb_kyc_2', section: 'kyc_cdd_edd', prompt: 'EDD trigger criteria + decision authorities.', expectedEvidence: ['internal_system'] },
  { id: 'cb_kyc_3', section: 'kyc_cdd_edd', prompt: 'UBO identification standard + verification methodology.', expectedEvidence: ['internal_system'] },

  // 6. PEP screening
  { id: 'cb_pep_1', section: 'pep_screening', prompt: 'Screening at onboarding and continuously thereafter.', expectedEvidence: ['internal_system'] },
  { id: 'cb_pep_2', section: 'pep_screening', prompt: 'Coverage of family + close-associate categories.', expectedEvidence: ['internal_system'] },
  { id: 'cb_pep_3', section: 'pep_screening', prompt: 'Senior-management approval requirement for PEP onboarding.', expectedEvidence: ['internal_system'] },

  // 7. Sanctions
  { id: 'cb_sanc_1', section: 'sanctions', prompt: 'Lists screened (UN, EOCN, OFAC, EU, UK, others) and version-control.', expectedEvidence: ['internal_system'] },
  { id: 'cb_sanc_2', section: 'sanctions', prompt: 'Real-time payment screening with deterministic + fuzzy logic.', expectedEvidence: ['internal_system'] },
  { id: 'cb_sanc_3', section: 'sanctions', prompt: 'EOCN / UN TFS 24-hour freeze procedure documented.', expectedEvidence: ['internal_system'] },

  // 8. Transaction monitoring
  { id: 'cb_tm_1', section: 'transaction_monitoring', prompt: 'Rule and / or model coverage with documented thresholds.', expectedEvidence: ['internal_system'] },
  { id: 'cb_tm_2', section: 'transaction_monitoring', prompt: 'Alert disposition SLAs and escalation criteria.', expectedEvidence: ['internal_system'] },
  { id: 'cb_tm_3', section: 'transaction_monitoring', prompt: 'Segmentation of customers + behaviours.', expectedEvidence: ['internal_system'] },

  // 9. Risk assessment
  { id: 'cb_ra_1', section: 'risk_assessment', prompt: 'Enterprise-wide risk assessment refreshed annually.', expectedEvidence: ['internal_system'] },
  { id: 'cb_ra_2', section: 'risk_assessment', prompt: 'Country / product / channel / customer risk weights.', expectedEvidence: ['internal_system'] },

  // 10. Training & awareness
  { id: 'cb_tr_1', section: 'training_awareness', prompt: 'Annual AML/CFT training; role-specific modules.', expectedEvidence: ['internal_system'] },
  { id: 'cb_tr_2', section: 'training_awareness', prompt: 'Post-training competency testing and pass thresholds.', expectedEvidence: ['internal_system'] },

  // 11. Audit
  { id: 'cb_au_1', section: 'audit', prompt: 'Independent internal audit of AML programme cycle.', expectedEvidence: ['internal_system'] },
  { id: 'cb_au_2', section: 'audit', prompt: 'External / regulator audit findings + remediation status.', expectedEvidence: ['regulator_press_release'] },

  // 12. Reporting & record-keeping
  { id: 'cb_rr_1', section: 'reporting_recordkeeping', prompt: 'STR / SAR / FFR / PNMR procedures + statistics.', expectedEvidence: ['internal_system'] },
  { id: 'cb_rr_2', section: 'reporting_recordkeeping', prompt: 'Record retention horizon (≥ 5 yr statutory).', expectedEvidence: ['internal_system'] },
];

export const CBDDQ_BY_SECTION: Record<CbddqSection, CbddqQuestion[]> =
  CBDDQ.reduce((acc, q) => {
    (acc[q.section] ||= []).push(q);
    return acc;
  }, {} as Record<CbddqSection, CbddqQuestion[]>);
