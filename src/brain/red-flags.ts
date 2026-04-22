// Hawkeye Sterling — structured red-flag catalogue.
// Red flags are FACTUAL INDICATORS, not legal conclusions (per P3 of the
// compliance charter). Each flag binds to the typology it indicates, the
// reasoning modes that detect it, and a severity (low | medium | high).
// The brain cites red flags by id in its findings; the UI groups them by
// typology for the MLRO.

export type RedFlagSeverity = 'low' | 'medium' | 'high';

export interface RedFlag {
  id: string;
  typology: string;
  indicator: string;
  severity: RedFlagSeverity;
  reasoningModes: string[];
  sources: string[];
}

export const RED_FLAGS: RedFlag[] = [
  // — Structuring / smurfing
  { id: 'rf_structuring_threshold', typology: 'structuring', indicator: 'Multiple cash deposits immediately below the reporting threshold.', severity: 'high', reasoningModes: ['velocity_analysis', 'spike_detection', 'peer_group_anomaly'], sources: ['FATF RBA', 'UAE FIU typology catalogue'] },
  { id: 'rf_structuring_branches', typology: 'structuring', indicator: 'Same customer depositing across multiple branches on the same day.', severity: 'high', reasoningModes: ['pattern_of_life', 'link_analysis'], sources: ['Wolfsberg FAQ'] },

  // — DPMS / precious metals
  { id: 'rf_dpms_cash_walk_in', typology: 'dpms_retail', indicator: 'Walk-in buyer pays for high-value gold in cash with no relationship history.', severity: 'high', reasoningModes: ['dpms_retail_threshold', 'cash_courier_ctn'], sources: ['MoE DNFBP circular', 'LBMA RGG'] },
  { id: 'rf_dpms_no_receipt', typology: 'dpms_retail', indicator: 'Customer declines receipt or requests anonymous transaction.', severity: 'high', reasoningModes: ['documentation_quality', 'source_credibility'], sources: ['MoE DNFBP'] },
  { id: 'rf_dpms_refiner_cahra', typology: 'dpms_refinery', indicator: 'Doré/scrap origin in conflict-affected or high-risk area without OECD-annex-II documentation.', severity: 'high', reasoningModes: ['oecd_ddg_annex', 'provenance_trace', 'lineage'], sources: ['LBMA RGG', 'OECD DDG'] },

  // — Trade-based money laundering
  { id: 'rf_tbml_over_invoice', typology: 'tbml', indicator: 'Invoice value materially above market rate for goods described.', severity: 'high', reasoningModes: ['tbml_over_invoicing', 'regression', 'peer_benchmark'], sources: ['FATF TBML report'] },
  { id: 'rf_tbml_phantom_shipment', typology: 'tbml', indicator: 'Shipping documents inconsistent with vessel AIS tracks or absent entirely.', severity: 'high', reasoningModes: ['tbml_phantom_shipment', 'sanctions_maritime_stss', 'timeline_reconstruction'], sources: ['FATF', 'OFAC maritime advisory'] },
  { id: 'rf_tbml_ucp600_gap', typology: 'tbml', indicator: 'LC discrepancies waived repeatedly under UCP 600 without documented rationale.', severity: 'medium', reasoningModes: ['ucp600_discipline', 'exception_log', 'documentation_quality'], sources: ['ICC UCP 600'] },

  // — Sanctions evasion / proliferation
  { id: 'rf_sanc_shell_chain', typology: 'sanctions_evasion', indicator: 'Counterparty is a newly-formed shell with nominee directors in opaque jurisdictions.', severity: 'high', reasoningModes: ['ubo_nominee_directors', 'jurisdiction_cascade', 'entity_resolution'], sources: ['OFAC', 'UK OFSI'] },
  { id: 'rf_sanc_dual_use', typology: 'proliferation', indicator: 'Dual-use goods shipped to end-user in proliferation-sensitive jurisdiction.', severity: 'high', reasoningModes: ['pf_dual_use_controls', 'sanctions_regime_matrix', 'attack_tree'], sources: ['UN 1540', 'EU dual-use regulation'] },
  { id: 'rf_sanc_stss', typology: 'sanctions_evasion', indicator: 'Vessel performs ship-to-ship transfer outside established port with AIS gap.', severity: 'high', reasoningModes: ['sanctions_maritime_stss', 'velocity_analysis'], sources: ['OFAC maritime', 'UK OFSI'] },

  // — PEP
  { id: 'rf_pep_wealth_mismatch', typology: 'pep', indicator: 'Declared source of wealth inconsistent with known public salary.', severity: 'high', reasoningModes: ['source_triangulation', 'narrative_coherence', 'regression'], sources: ['Wolfsberg FAQ', 'FATF R.12'] },
  { id: 'rf_pep_family_nominee', typology: 'pep', indicator: 'Accounts opened in names of PEP family members shortly after appointment.', severity: 'medium', reasoningModes: ['pep_domestic_minister', 'link_analysis', 'timeline_reconstruction'], sources: ['FATF R.12'] },

  // — UBO / corporate opacity
  { id: 'rf_ubo_bearer_shares', typology: 'ubo', indicator: 'Beneficial ownership obscured by bearer shares or multi-layered holding.', severity: 'high', reasoningModes: ['ubo_bearer_shares', 'ubo_tree_walk', 'jurisdiction_cascade'], sources: ['FATF R.24', 'Wolfsberg'] },
  { id: 'rf_ubo_common_address', typology: 'ubo', indicator: 'Multiple apparently unrelated entities share the same registered address or agent.', severity: 'medium', reasoningModes: ['entity_resolution', 'community_detection'], sources: ['Open Corporates typology'] },

  // — VASP / crypto
  { id: 'rf_vasp_mixer', typology: 'vasp', indicator: 'Inbound funds sourced from a known mixer or privacy protocol address.', severity: 'high', reasoningModes: ['vasp_mixer_inbound' as string, 'privacy_coin_reasoning', 'chain_analysis'], sources: ['FATF VASP guidance'] },
  { id: 'rf_vasp_travel_rule_gap', typology: 'vasp', indicator: 'Transfer above threshold missing originator/beneficiary data (Travel Rule).', severity: 'high', reasoningModes: ['vasp_travel_rule', 'completeness_audit'], sources: ['FATF R.16'] },

  // — Adverse media / conduct
  { id: 'rf_am_ongoing_investigation', typology: 'adverse_media', indicator: 'Counterparty named in credible, recent ongoing investigation.', severity: 'medium', reasoningModes: ['source_triangulation', 'freshness_check', 'source_credibility'], sources: ['news APIs', 'regulator press releases'] },

  // — Governance / controls
  { id: 'rf_ctl_four_eyes_bypass', typology: 'governance', indicator: 'Second approver role repeatedly overridden by same user.', severity: 'high', reasoningModes: ['four_eyes_stress', 'policy_drift', 'exception_log'], sources: ['CR 134/2025 Art.19', 'Three Lines Model'] },
  { id: 'rf_ctl_training_gap', typology: 'governance', indicator: 'AML training overdue for users handling high-risk disposition.', severity: 'medium', reasoningModes: ['training_inadequacy', 'documentation_quality'], sources: ['FATF R.18'] },
  { id: 'rf_ctl_record_gap', typology: 'governance', indicator: 'Screening evidence missing for a disposition already recorded.', severity: 'high', reasoningModes: ['retention_audit', 'audit_trail_reconstruction', 'reconciliation'], sources: ['FDL 10/2025 Art.24'] },
];

export const RED_FLAGS_BY_TYPOLOGY: Record<string, RedFlag[]> = RED_FLAGS.reduce(
  (acc, rf) => {
    (acc[rf.typology] ||= []).push(rf);
    return acc;
  },
  {} as Record<string, RedFlag[]>,
);

export const RED_FLAG_BY_ID: Map<string, RedFlag> = new Map(
  RED_FLAGS.map((rf) => [rf.id, rf]),
);
