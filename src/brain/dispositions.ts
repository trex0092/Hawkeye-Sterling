// Hawkeye Sterling — disposition codes.
// Canonical outcomes MLROs can record. Each code binds to the required
// downstream playbook and the minimum approvals. The brain NEVER sets a
// disposition autonomously — it proposes, the MLRO decides.

export type DispositionCode =
  | 'D00_no_match'
  | 'D01_false_positive'
  | 'D02_cleared_proceed'
  | 'D03_edd_required'
  | 'D04_heightened_monitoring'
  | 'D05_frozen_ffr'
  | 'D06_partial_match_pnmr'
  | 'D07_str_filed'
  | 'D08_exit_relationship'
  | 'D09_do_not_onboard'
  | 'D10_refer_to_authority'
  | 'D11_pending_information'
  | 'D12_supervisory_disclosure'
  | 'D13_transaction_blocked'
  | 'D14_account_frozen_pending_review'
  | 'D15_voluntary_self_disclosure'
  | 'D16_closed_no_action';

export interface Disposition {
  code: DispositionCode;
  label: string;
  description: string;
  minApprovals: number;           // number of distinct approvers required
  requiresSeniorManagement: boolean;
  requiresMlroSignOff: boolean;
  playbookId?: string;
  notableCharterPins: string[];
}

export const DISPOSITIONS: Disposition[] = [
  { code: 'D00_no_match', label: 'No match', description: 'No hit across declared scope; scope declaration required (P7).', minApprovals: 1, requiresSeniorManagement: false, requiresMlroSignOff: false, notableCharterPins: ['P7'] },
  { code: 'D01_false_positive', label: 'False positive (documented)', description: 'Hit ruled out with documented disambiguator rationale.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: false, notableCharterPins: ['P6', 'P7'] },
  { code: 'D02_cleared_proceed', label: 'Cleared — proceed', description: 'No residual AML/CFT concern; proceed.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: false, notableCharterPins: [] },
  { code: 'D03_edd_required', label: 'Escalate to EDD', description: 'Enhanced Due Diligence required before continuing.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: false, playbookId: 'pb_pep_onboarding', notableCharterPins: [] },
  { code: 'D04_heightened_monitoring', label: 'Heightened monitoring', description: 'Relationship continues under uplifted monitoring rules.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: [] },
  { code: 'D05_frozen_ffr', label: 'Frozen — FFR filed', description: 'Funds frozen; FFR submitted to UAE FIU.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, playbookId: 'pb_confirmed_sanctions_match', notableCharterPins: ['P4'] },
  { code: 'D06_partial_match_pnmr', label: 'Partial match — PNMR filed', description: 'Partial match unresolved; PNMR submitted.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: true, playbookId: 'pb_partial_sanctions_match', notableCharterPins: ['P6'] },
  { code: 'D07_str_filed', label: 'STR filed', description: 'Suspicious Transaction Report filed via goAML.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P4'] },
  { code: 'D08_exit_relationship', label: 'Exit relationship', description: 'Relationship to be terminated with neutral offboarding language.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, playbookId: 'pb_exit_relationship', notableCharterPins: ['P4'] },
  { code: 'D09_do_not_onboard', label: 'Do not onboard', description: 'Prospect refused. Document rationale; preserve record.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P4'] },
  { code: 'D10_refer_to_authority', label: 'Refer to competent authority', description: 'Refer matter to competent authority where warranted.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: [] },
  { code: 'D11_pending_information', label: 'Pending — information requested', description: 'Decision deferred; mandatory information request issued to customer or counterparty. Case must be resolved within the SLA window or escalated to D08.', minApprovals: 1, requiresSeniorManagement: false, requiresMlroSignOff: false, notableCharterPins: ['P6', 'P7'] },
  { code: 'D12_supervisory_disclosure', label: 'Supervisory disclosure — proactive filing', description: 'Voluntary or mandatory disclosure to supervisory authority (CBUAE, SCA, DFSA) where no STR is required but regulatory notification is warranted.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, playbookId: 'pb_regulatory_reporting', notableCharterPins: ['P3', 'P4'] },
  { code: 'D13_transaction_blocked', label: 'Transaction blocked — under investigation', description: 'Specific transaction(s) blocked while the underlying relationship continues pending investigation. Does not constitute a full account freeze.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: ['P4', 'P8'] },
  { code: 'D14_account_frozen_pending_review', label: 'Account frozen — senior review pending', description: 'Full account freeze applied pending senior MLRO and legal review. Distinct from D05 in that no FFR has yet been filed; FFR decision due within 24 hours.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, playbookId: 'pb_confirmed_sanctions_match', notableCharterPins: ['P4'] },
  { code: 'D15_voluntary_self_disclosure', label: 'Voluntary self-disclosure to regulator', description: 'Firm initiates proactive self-disclosure to regulator of a detected AML/CFT control failure or near-miss, before regulatory inquiry.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3'] },
  { code: 'D16_closed_no_action', label: 'Closed — no further action', description: 'Case fully reviewed and closed; no AML/CFT concern identified after exhaustive review. Full audit trail retained per 5-year retention rule.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: ['P7'] },
];

export const DISPOSITION_BY_CODE: Map<DispositionCode, Disposition> = new Map(
  DISPOSITIONS.map((d) => [d.code, d]),
);
