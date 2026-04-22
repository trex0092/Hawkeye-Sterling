// Hawkeye Sterling — DPMS 30 KPIs.
// Canonical MoE-aligned KPI catalogue for UAE-licensed Designated Precious
// Metals & Stones (DPMS) businesses. Each KPI is addressable by id in the
// brain, exposes a target / threshold, the reasoning modes that monitor it,
// and the regulatory anchor that makes it mandatory.

export type KpiFrequency = 'on_event' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
export type KpiDirection = 'lower_better' | 'higher_better' | 'binary';

export interface DpmsKpi {
  id: string;
  cluster: 'onboarding' | 'screening' | 'transaction' | 'supply_chain' | 'governance' | 'reporting' | 'training' | 'tech';
  name: string;
  metric: string;
  target: string;
  direction: KpiDirection;
  frequency: KpiFrequency;
  reasoningModes: string[];
  regulatoryAnchor: string;
}

export const DPMS_KPIS: DpmsKpi[] = [
  // Onboarding
  { id: 'dpms_kpi_01', cluster: 'onboarding', name: 'CDD completion rate', metric: '% prospects with full CDD before first transaction', target: '100%', direction: 'higher_better', frequency: 'weekly', reasoningModes: ['cdd_prospect_individual', 'cdd_prospect_entity', 'completeness_audit'], regulatoryAnchor: 'FDL 10/2025 Art.14' },
  { id: 'dpms_kpi_02', cluster: 'onboarding', name: 'UBO identification rate', metric: '% entity customers with ≥25%/effective-control UBO identified', target: '100%', direction: 'higher_better', frequency: 'weekly', reasoningModes: ['ubo_25_threshold', 'ubo_effective_control'], regulatoryAnchor: 'FATF R.24' },
  { id: 'dpms_kpi_03', cluster: 'onboarding', name: 'High-risk EDD completion', metric: '% high-risk customers with EDD on file', target: '100%', direction: 'higher_better', frequency: 'monthly', reasoningModes: ['edd_sow_scope', 'risk_based_approach'], regulatoryAnchor: 'FATF R.10/12/19' },
  { id: 'dpms_kpi_04', cluster: 'onboarding', name: 'PEP re-verification cadence', metric: '% PEP files re-verified annually', target: '100%', direction: 'higher_better', frequency: 'annual', reasoningModes: ['pep_domestic_minister', 'freshness_check'], regulatoryAnchor: 'FATF R.12' },

  // Screening
  { id: 'dpms_kpi_05', cluster: 'screening', name: 'Pre-transaction screening coverage', metric: '% in-scope transactions screened before settlement', target: '100%', direction: 'higher_better', frequency: 'daily', reasoningModes: ['list_walk', 'sanctions_regime_matrix'], regulatoryAnchor: 'CR 74/2020 Art.4' },
  { id: 'dpms_kpi_06', cluster: 'screening', name: 'EOCN + UN minimum', metric: 'Every screen includes UN Consolidated + UAE Local Terrorist List', target: '100%', direction: 'binary', frequency: 'on_event', reasoningModes: ['list_walk'], regulatoryAnchor: 'CR 74/2020 Art.4-7' },
  { id: 'dpms_kpi_07', cluster: 'screening', name: 'False-positive resolution SLA', metric: 'Median time to resolve false positive', target: '< 4 business hours', direction: 'lower_better', frequency: 'weekly', reasoningModes: ['sla_check', 'discrepancy_log'], regulatoryAnchor: 'Internal SLO' },
  { id: 'dpms_kpi_08', cluster: 'screening', name: 'Confirmed-match freeze SLA', metric: 'Time from confirmed match to asset freeze', target: '< 24 hours', direction: 'lower_better', frequency: 'on_event', reasoningModes: ['escalation_trigger', 'sla_check'], regulatoryAnchor: 'CR 74/2020 Art.4' },
  { id: 'dpms_kpi_09', cluster: 'screening', name: 'Daily re-screen coverage', metric: '% active customers re-screened daily against delta lists', target: '100%', direction: 'higher_better', frequency: 'daily', reasoningModes: ['freshness_check'], regulatoryAnchor: 'MoE Circular 3/2025' },

  // Transaction monitoring
  { id: 'dpms_kpi_10', cluster: 'transaction', name: 'Cash threshold alert rate', metric: 'Alerts on cash ≥ AED 55,000 (DPMS threshold)', target: '100%', direction: 'binary', frequency: 'on_event', reasoningModes: ['dpms_retail_threshold', 'cash_courier_ctn'], regulatoryAnchor: 'MoE DNFBP circulars' },
  { id: 'dpms_kpi_11', cluster: 'transaction', name: 'Structuring detection rate', metric: 'Velocity alerts triggered under threshold', target: '≥ 1% of cash volume flagged for review', direction: 'higher_better', frequency: 'weekly', reasoningModes: ['velocity_analysis', 'spike_detection'], regulatoryAnchor: 'FATF RBA' },
  { id: 'dpms_kpi_12', cluster: 'transaction', name: 'Unusual pattern escalation', metric: '% unusual patterns escalated within 5 business days', target: '100%', direction: 'higher_better', frequency: 'monthly', reasoningModes: ['escalation_trigger', 'sla_check'], regulatoryAnchor: 'FDL 10/2025 Art.24' },
  { id: 'dpms_kpi_13', cluster: 'transaction', name: 'Linked-parties review', metric: '% transactions >AED 55k with linked-party graph drawn', target: '100%', direction: 'higher_better', frequency: 'monthly', reasoningModes: ['link_analysis', 'community_detection'], regulatoryAnchor: 'FATF RBA' },

  // Supply chain
  { id: 'dpms_kpi_14', cluster: 'supply_chain', name: 'LBMA RGG 5-step compliance', metric: '% refinery inputs processed under full 5-step due diligence', target: '100%', direction: 'higher_better', frequency: 'monthly', reasoningModes: ['lbma_rgg_five_step', 'provenance_trace'], regulatoryAnchor: 'LBMA RGG' },
  { id: 'dpms_kpi_15', cluster: 'supply_chain', name: 'CAHRA sourcing disclosure', metric: '% CAHRA-sourced material with OECD Annex II disclosure', target: '100%', direction: 'higher_better', frequency: 'monthly', reasoningModes: ['oecd_ddg_annex', 'dpms_refiner_cahra' as string], regulatoryAnchor: 'OECD DDG Annex II' },
  { id: 'dpms_kpi_16', cluster: 'supply_chain', name: 'Provenance chain completeness', metric: '% consignments with full provenance trace to origin', target: '≥ 95%', direction: 'higher_better', frequency: 'quarterly', reasoningModes: ['provenance_trace', 'lineage', 'completeness_audit'], regulatoryAnchor: 'LBMA RGG' },
  { id: 'dpms_kpi_17', cluster: 'supply_chain', name: 'Supplier re-assessment cadence', metric: '% suppliers re-assessed annually', target: '100%', direction: 'higher_better', frequency: 'annual', reasoningModes: ['peer_benchmark', 'freshness_check'], regulatoryAnchor: 'LBMA RGG' },

  // Governance
  { id: 'dpms_kpi_18', cluster: 'governance', name: 'MLRO independence', metric: 'MLRO reports to board directly', target: 'binary=true', direction: 'binary', frequency: 'annual', reasoningModes: ['three_lines_defence', 'governance' as string], regulatoryAnchor: 'FDL 10/2025 Art.17' },
  { id: 'dpms_kpi_19', cluster: 'governance', name: 'Four-eyes enforcement', metric: '% dispositions carrying two independent approvers', target: '100%', direction: 'higher_better', frequency: 'monthly', reasoningModes: ['four_eyes_stress', 'policy_drift'], regulatoryAnchor: 'CR 134/2025 Art.19' },
  { id: 'dpms_kpi_20', cluster: 'governance', name: 'Segregation of duties drift', metric: 'Instances of submitter == approver', target: '0', direction: 'lower_better', frequency: 'weekly', reasoningModes: ['four_eyes_stress', 'exception_log'], regulatoryAnchor: 'CR 134/2025 Art.19' },
  { id: 'dpms_kpi_21', cluster: 'governance', name: 'Policy refresh cadence', metric: 'AML policy reviewed and approved in last 12 months', target: 'binary=true', direction: 'binary', frequency: 'annual', reasoningModes: ['documentation_quality'], regulatoryAnchor: 'FATF R.18' },

  // Reporting
  { id: 'dpms_kpi_22', cluster: 'reporting', name: 'STR/SAR filing SLA', metric: 'Median time from suspicion to STR filing', target: '< 5 business days', direction: 'lower_better', frequency: 'on_event', reasoningModes: ['filing_str_narrative', 'sla_check'], regulatoryAnchor: 'FATF R.20' },
  { id: 'dpms_kpi_23', cluster: 'reporting', name: 'FFR filing SLA', metric: 'Median time from freeze to FFR filing on goAML', target: '< 5 business days', direction: 'lower_better', frequency: 'on_event', reasoningModes: ['escalation_trigger', 'sla_check'], regulatoryAnchor: 'CR 74/2020 Art.7' },
  { id: 'dpms_kpi_24', cluster: 'reporting', name: 'goAML registration current', metric: 'goAML credentials active and tested', target: 'binary=true', direction: 'binary', frequency: 'quarterly', reasoningModes: ['documentation_quality'], regulatoryAnchor: 'FIU guidance' },
  { id: 'dpms_kpi_25', cluster: 'reporting', name: 'Board MI cadence', metric: 'Board receives AML MI ≥ quarterly', target: 'binary=true', direction: 'binary', frequency: 'quarterly', reasoningModes: ['governance' as string, 'risk_appetite_check'], regulatoryAnchor: 'CR 134/2025' },

  // Training
  { id: 'dpms_kpi_26', cluster: 'training', name: 'Staff AML training coverage', metric: '% relevant staff with annual AML training', target: '100%', direction: 'higher_better', frequency: 'annual', reasoningModes: ['training_inadequacy', 'documentation_quality'], regulatoryAnchor: 'FATF R.18' },
  { id: 'dpms_kpi_27', cluster: 'training', name: 'Training test pass rate', metric: 'Mean post-training assessment score', target: '≥ 80%', direction: 'higher_better', frequency: 'annual', reasoningModes: ['training_inadequacy'], regulatoryAnchor: 'FATF R.18' },

  // Tech / data
  { id: 'dpms_kpi_28', cluster: 'tech', name: 'List freshness', metric: 'Age of most-recent list snapshot', target: '< 24 hours', direction: 'lower_better', frequency: 'daily', reasoningModes: ['freshness_check', 'completeness_audit'], regulatoryAnchor: 'P8 charter' },
  { id: 'dpms_kpi_29', cluster: 'tech', name: 'Data-quality score', metric: 'Composite DQ score across customer master', target: '≥ 95', direction: 'higher_better', frequency: 'monthly', reasoningModes: ['data_quality_score', 'reconciliation'], regulatoryAnchor: 'FATF RBA' },
  { id: 'dpms_kpi_30', cluster: 'tech', name: 'Audit-log immutability', metric: '% audit logs covered by hash-chain / WORM', target: '100%', direction: 'higher_better', frequency: 'quarterly', reasoningModes: ['audit_trail_reconstruction', 'tamper_detection'], regulatoryAnchor: 'FDL 10/2025 Art.24' },
];

export const DPMS_KPI_BY_ID: Map<string, DpmsKpi> = new Map(
  DPMS_KPIS.map((k) => [k.id, k]),
);

export const DPMS_KPIS_BY_CLUSTER: Record<string, DpmsKpi[]> = DPMS_KPIS.reduce(
  (acc, k) => {
    (acc[k.cluster] ||= []).push(k);
    return acc;
  },
  {} as Record<string, DpmsKpi[]>,
);
