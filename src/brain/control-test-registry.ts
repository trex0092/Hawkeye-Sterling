// Hawkeye Sterling — internal control-test registry.
// Named tests the Third Line (Internal Audit) runs against the programme.
// Each test carries frequency, sample method, pass criteria, and the
// regulatory / framework anchor.

export type ControlFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'ad_hoc';
export type SampleMethod = 'random' | 'risk_based' | 'judgemental' | 'census';

export interface ControlTest {
  id: string;
  controlArea: 'onboarding' | 'screening' | 'transaction_monitoring' | 'filing' | 'governance' | 'training' | 'data_quality' | 'tech';
  title: string;
  frequency: ControlFrequency;
  sampleMethod: SampleMethod;
  sampleSizeHint: string;
  passCriteria: string;
  anchor: string;
}

export const CONTROL_TESTS: ControlTest[] = [
  // Onboarding
  { id: 'ct_cdd_completeness', controlArea: 'onboarding', title: 'CDD file completeness', frequency: 'quarterly', sampleMethod: 'random', sampleSizeHint: '≥ 30 relationships', passCriteria: '≥ 98% of sampled files complete per checklist.', anchor: 'FATF R.10; internal P1 policy' },
  { id: 'ct_ubo_identification', controlArea: 'onboarding', title: 'UBO identification adequacy', frequency: 'quarterly', sampleMethod: 'risk_based', sampleSizeHint: '≥ 25 entities', passCriteria: '100% have natural-person UBOs identified and verified.', anchor: 'FATF R.24' },
  { id: 'ct_pep_approval_chain', controlArea: 'onboarding', title: 'PEP senior-management approval', frequency: 'quarterly', sampleMethod: 'census', sampleSizeHint: 'all PEPs onboarded in period', passCriteria: '100% have senior-management approval on file.', anchor: 'FATF R.12' },

  // Screening
  { id: 'ct_screen_scope_declaration', controlArea: 'screening', title: 'Screening scope declaration present', frequency: 'monthly', sampleMethod: 'random', sampleSizeHint: '≥ 50 screens', passCriteria: '100% of screens declare lists + version dates + method.', anchor: 'Charter P7' },
  { id: 'ct_screen_eocn_un_minimum', controlArea: 'screening', title: 'EOCN + UN minimum coverage', frequency: 'monthly', sampleMethod: 'census', sampleSizeHint: 'all screens in period', passCriteria: '100% include UN + UAE EOCN lists.', anchor: 'CR 74/2020 Art.4-7' },
  { id: 'ct_screen_fp_disposition_doc', controlArea: 'screening', title: 'False-positive disposition rationale', frequency: 'monthly', sampleMethod: 'risk_based', sampleSizeHint: '≥ 30 false positives', passCriteria: '100% have documented disambiguator rationale; none labelled FP without rationale.', anchor: 'Charter P6 + P7' },

  // Transaction monitoring
  { id: 'ct_tm_rule_execution', controlArea: 'transaction_monitoring', title: 'TM rule execution integrity', frequency: 'quarterly', sampleMethod: 'judgemental', sampleSizeHint: 'per rule', passCriteria: 'Each rule executes as specified on synthetic test set.', anchor: 'Internal SDLC' },
  { id: 'ct_tm_alert_sla', controlArea: 'transaction_monitoring', title: 'Alert disposition SLA', frequency: 'monthly', sampleMethod: 'random', sampleSizeHint: '≥ 40 alerts', passCriteria: '≥ 95% dispositioned within SLA.', anchor: 'Internal SLO' },

  // Filing
  { id: 'ct_ffr_deadline', controlArea: 'filing', title: 'FFR filing deadline compliance', frequency: 'quarterly', sampleMethod: 'census', sampleSizeHint: 'all FFRs in period', passCriteria: '100% filed within 5 business days; freeze within 24 hours.', anchor: 'CR 74/2020 Art.4-7' },
  { id: 'ct_str_narrative_quality', controlArea: 'filing', title: 'STR narrative quality', frequency: 'quarterly', sampleMethod: 'random', sampleSizeHint: '≥ 20 STRs', passCriteria: 'All use observable-facts language; no legal conclusions (charter P3).', anchor: 'Charter P3 + P5' },

  // Governance
  { id: 'ct_four_eyes_evidence', controlArea: 'governance', title: 'Four-eyes / SoD evidence', frequency: 'monthly', sampleMethod: 'census', sampleSizeHint: 'all dispositions above threshold', passCriteria: 'Zero cases where submitter == approver-1 or approver-2.', anchor: 'CR 134/2025 Art.19' },
  { id: 'ct_mlro_independence', controlArea: 'governance', title: 'MLRO independence check', frequency: 'annual', sampleMethod: 'judgemental', sampleSizeHint: 'current MLRO', passCriteria: 'MLRO reports to the board; no material conflict.', anchor: 'FDL 10/2025 Art.17' },

  // Training
  { id: 'ct_training_coverage', controlArea: 'training', title: 'Training coverage + pass rate', frequency: 'annual', sampleMethod: 'census', sampleSizeHint: 'all relevant staff', passCriteria: '100% coverage; ≥ 80% mean pass rate.', anchor: 'FATF R.18' },

  // Data quality
  { id: 'ct_dq_completeness', controlArea: 'data_quality', title: 'Customer-master completeness', frequency: 'quarterly', sampleMethod: 'random', sampleSizeHint: '≥ 100 customers', passCriteria: '≥ 98% of mandatory attributes populated.', anchor: 'FATF RBA' },
  { id: 'ct_dq_freshness', controlArea: 'data_quality', title: 'Sanctions-list freshness', frequency: 'monthly', sampleMethod: 'census', sampleSizeHint: 'daily snapshots', passCriteria: 'Zero days with freshness > 24 hours.', anchor: 'Charter P8' },

  // Tech
  { id: 'ct_audit_chain_integrity', controlArea: 'tech', title: 'Audit-chain integrity verification', frequency: 'quarterly', sampleMethod: 'census', sampleSizeHint: 'full chain at period close', passCriteria: 'AuditChain.verify() returns ok; zero firstBreakAt results.', anchor: 'FDL 10/2025 Art.24' },
  { id: 'ct_backup_recovery_drill', controlArea: 'tech', title: 'Backup + recovery drill', frequency: 'semi_annual', sampleMethod: 'judgemental', sampleSizeHint: 'end-to-end scenario', passCriteria: 'Recovery within RTO/RPO; no data loss.', anchor: 'BCP policy' },
];

export const CONTROL_TEST_BY_ID: Map<string, ControlTest> = new Map(
  CONTROL_TESTS.map((c) => [c.id, c]),
);
