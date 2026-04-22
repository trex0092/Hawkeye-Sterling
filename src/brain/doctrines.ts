// Hawkeye Sterling — professional doctrines the brain is allowed to cite.
// Each doctrine names the authoritative body, the canonical document, and the
// reasoning modes that operationalise it. Citing a doctrine is how the brain
// demonstrates "reasoning with reference to the record" instead of "reasoning
// from training data".

export type DoctrineId =
  | 'fatf_rba'
  | 'fatf_effectiveness'
  | 'wolfsberg_faq'
  | 'wolfsberg_correspondent'
  | 'lbma_rgg'
  | 'oecd_ddg'
  | 'egmont_fiu'
  | 'basel_aml_index'
  | 'uae_fdl_20_2018'
  | 'uae_cd_10_2019'
  | 'uae_cd_74_2020'
  | 'uae_cr_16_2021'
  | 'uae_cr_134_2025'
  | 'uae_fdl_10_2025'
  | 'uae_moe_dnfbp_circulars'
  | 'iso_31000'
  | 'coso_erm'
  | 'three_lines_defence'
  | 'pdpl_fdl_45_2021';

export interface Doctrine {
  id: DoctrineId;
  authority: string;
  title: string;
  scope: string;
  reasoningModes: string[];
  mandatoryInUAE: boolean;
}

export const DOCTRINES: Doctrine[] = [
  {
    id: 'fatf_rba',
    authority: 'Financial Action Task Force',
    title: 'Risk-Based Approach Guidance',
    scope: 'Proportionate AML/CFT controls calibrated to assessed risk.',
    reasoningModes: ['risk_based_approach', 'kri_alignment', 'risk_appetite_check', 'residual_vs_inherent'],
    mandatoryInUAE: true,
  },
  {
    id: 'fatf_effectiveness',
    authority: 'Financial Action Task Force',
    title: 'Methodology — Immediate Outcomes (effectiveness)',
    scope: 'Effectiveness of national AML/CFT systems; IOs 1–11.',
    reasoningModes: ['fatf_effectiveness', 'control_effectiveness', 'regulatory_mapping'],
    mandatoryInUAE: true,
  },
  {
    id: 'wolfsberg_faq',
    authority: 'The Wolfsberg Group',
    title: 'Wolfsberg FAQs on AML compliance',
    scope: 'Industry-standard expectations for CDD, screening, and monitoring.',
    reasoningModes: ['wolfsberg_faq', 'peer_benchmark', 'source_triangulation'],
    mandatoryInUAE: false,
  },
  {
    id: 'wolfsberg_correspondent',
    authority: 'The Wolfsberg Group',
    title: 'Correspondent Banking Due Diligence Questionnaire',
    scope: 'Correspondent-bank risk assessment.',
    reasoningModes: ['kyb_strict', 'corresp_nested_bank_flow', 'jurisdiction_cascade'],
    mandatoryInUAE: false,
  },
  {
    id: 'lbma_rgg',
    authority: 'London Bullion Market Association',
    title: 'Responsible Gold Guidance (5-step framework)',
    scope: 'Refiner & supply-chain due diligence for gold.',
    reasoningModes: ['lbma_rgg_five_step', 'provenance_trace', 'lineage', 'source_triangulation'],
    mandatoryInUAE: true,
  },
  {
    id: 'oecd_ddg',
    authority: 'Organisation for Economic Co-operation and Development',
    title: 'Due Diligence Guidance for Responsible Mineral Supply Chains (Annex II)',
    scope: 'Mineral supply chains from conflict-affected / high-risk areas.',
    reasoningModes: ['oecd_ddg_annex', 'typology_catalogue', 'provenance_trace'],
    mandatoryInUAE: true,
  },
  {
    id: 'egmont_fiu',
    authority: 'Egmont Group of Financial Intelligence Units',
    title: 'Principles for Information Exchange',
    scope: 'FIU-to-FIU cross-border intelligence sharing.',
    reasoningModes: ['source_triangulation', 'evidence_graph', 'cross_case_triangulation'],
    mandatoryInUAE: false,
  },
  {
    id: 'basel_aml_index',
    authority: 'Basel Institute on Governance',
    title: 'Basel AML Index',
    scope: 'Country-level AML/CFT risk scoring.',
    reasoningModes: ['jurisdiction_cascade', 'peer_benchmark', 'risk_adjusted'],
    mandatoryInUAE: false,
  },
  {
    id: 'uae_fdl_20_2018',
    authority: 'United Arab Emirates',
    title: 'Federal Decree-Law No. 20 of 2018 (AML/CFT), as amended',
    scope: 'Primary AML/CFT statute; tipping-off (Art.25), STR/SAR obligations.',
    reasoningModes: ['article_by_article', 'regulatory_mapping', 'escalation_trigger'],
    mandatoryInUAE: true,
  },
  {
    id: 'uae_cd_10_2019',
    authority: 'UAE Cabinet',
    title: 'Cabinet Decision No. 10 of 2019 (Executive Regulations), as amended',
    scope: 'Executive regulations under FDL 20/2018.',
    reasoningModes: ['article_by_article', 'regulatory_mapping'],
    mandatoryInUAE: true,
  },
  {
    id: 'uae_cd_74_2020',
    authority: 'UAE Cabinet',
    title: 'Cabinet Decision No. 74 of 2020 (Terrorism Lists / TFS)',
    scope: 'EOCN regime; 24-hour freeze obligations.',
    reasoningModes: ['list_walk', 'sanctions_regime_matrix', 'escalation_trigger'],
    mandatoryInUAE: true,
  },
  {
    id: 'uae_cr_16_2021',
    authority: 'UAE Cabinet',
    title: 'Cabinet Resolution No. 16 of 2021 (administrative penalties)',
    scope: 'Penalty schedule for AML/CFT breaches.',
    reasoningModes: ['regulatory_mapping', 'proportionality_test'],
    mandatoryInUAE: true,
  },
  {
    id: 'uae_cr_134_2025',
    authority: 'UAE Cabinet',
    title: 'Cabinet Resolution No. 134 of 2025',
    scope: 'Governance updates; four-eyes / SoD (Art.19).',
    reasoningModes: ['four_eyes_stress', 'three_lines_defence', 'governance' as unknown as string],
    mandatoryInUAE: true,
  },
  {
    id: 'uae_fdl_10_2025',
    authority: 'UAE',
    title: 'Federal Decree-Law No. 10 of 2025 (amendments)',
    scope: 'Amendments to FDL 20/2018 (MLRO, screening, record-keeping, disposition).',
    reasoningModes: ['article_by_article', 'regulatory_mapping', 'retention_audit'],
    mandatoryInUAE: true,
  },
  {
    id: 'uae_moe_dnfbp_circulars',
    authority: 'UAE Ministry of Economy',
    title: 'DNFBP circulars and guidance (precious-metals sector)',
    scope: 'Sector-specific obligations for DPMS.',
    reasoningModes: ['circular_walk', 'kpi_dpms_thirty', 'dpms_refiner_cahra' as unknown as string],
    mandatoryInUAE: true,
  },
  {
    id: 'pdpl_fdl_45_2021',
    authority: 'UAE',
    title: 'Federal Decree-Law No. 45 of 2021 (PDPL)',
    scope: 'Personal-data processing; lawful basis of legal obligation for AML/CFT/CPF.',
    reasoningModes: ['regulatory_mapping', 'completeness_audit', 'documentation_quality'],
    mandatoryInUAE: true,
  },
  {
    id: 'iso_31000',
    authority: 'International Organization for Standardization',
    title: 'ISO 31000 — Risk management guidelines',
    scope: 'Generic risk-management framework.',
    reasoningModes: ['risk_based_approach', 'sensitivity_tornado', 'residual_vs_inherent'],
    mandatoryInUAE: false,
  },
  {
    id: 'coso_erm',
    authority: 'Committee of Sponsoring Organizations of the Treadway Commission',
    title: 'COSO Enterprise Risk Management — Integrated Framework',
    scope: 'Entity-wide risk integration with strategy and performance.',
    reasoningModes: ['three_lines_defence', 'control_effectiveness', 'risk_appetite_check'],
    mandatoryInUAE: false,
  },
  {
    id: 'three_lines_defence',
    authority: 'Institute of Internal Auditors',
    title: 'Three Lines Model (updated)',
    scope: 'Operational management · risk & compliance · internal audit separation.',
    reasoningModes: ['three_lines_defence', 'four_eyes_stress', 'audit_trail_reconstruction'],
    mandatoryInUAE: true,
  },
];

export const DOCTRINE_BY_ID: Map<string, Doctrine> = new Map(
  DOCTRINES.map((d) => [d.id, d]),
);

export const DOCTRINES_BY_AUTHORITY: Record<string, Doctrine[]> = DOCTRINES.reduce(
  (acc, d) => {
    (acc[d.authority] ||= []).push(d);
    return acc;
  },
  {} as Record<string, Doctrine[]>,
);

export function mandatoryDoctrines(): Doctrine[] {
  return DOCTRINES.filter((d) => d.mandatoryInUAE);
}
