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
  | 'D16_closed_no_action'
  | 'D17_pep_declassification_review'
  | 'D18_joint_investigation_triggered'
  | 'D19_cross_border_fiu_referral'
  | 'D20_asset_tracing_initiated'
  | 'D21_deferred_prosecution_compliance'
  | 'D22_mlro_board_escalation'
  | 'D23_retaliatory_sar_deferred'
  | 'D24_ubo_resolution_pending'
  | 'D25_sof_sow_verification_pending'
  | 'D26_litigation_hold_active'
  | 'D27_regulatory_inquiry_under_way'
  | 'D28_sector_derisk_assessment'
  | 'D29_behavioral_profiling_escalation'
  | 'D30_insider_threat_investigation'
  | 'D31_social_engineering_referral'
  | 'D32_whistleblower_protection_active'
  | 'D33_external_monitor_appointed'
  | 'D34_cryptoasset_freeze'
  | 'D35_enhanced_source_verification';

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
  { code: 'D17_pep_declassification_review', label: 'PEP declassification review pending', description: 'Subject formerly classified as PEP; formal declassification assessment initiated to determine whether the 1-year (prominent function) or 5-year (head-of-state tier) cooling-off standard has been met. Relationship continues under PEP monitoring during review.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, playbookId: 'pb_pep_onboarding', notableCharterPins: ['P6'] },
  { code: 'D18_joint_investigation_triggered', label: 'Joint investigation triggered', description: 'Cross-authority or multi-agency joint investigation initiated. Case transferred to coordinated investigation protocol; primary decision authority rests with the lead investigating agency. Relationship suspended pending joint outcome.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P4'] },
  { code: 'D19_cross_border_fiu_referral', label: 'Cross-border FIU referral', description: 'Matter referred to a foreign Financial Intelligence Unit through the Egmont Group mutual assistance channel or applicable bilateral MLA agreement. goAML referral record filed; case placed in awaiting-response status.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P4'] },
  { code: 'D20_asset_tracing_initiated', label: 'Asset tracing and preservation initiated', description: 'Asset tracing and preservation proceedings commenced under civil or criminal recovery framework. Legal hold imposed on identified assets pending court or competent authority order. Does not constitute a TFS freeze under Cabinet Decision 74/2020.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P4'] },
  { code: 'D21_deferred_prosecution_compliance', label: 'Deferred prosecution / consent order compliance monitoring', description: 'Subject or counterparty institution is under an active Deferred Prosecution Agreement (DPA), Non-Prosecution Agreement (NPA), or consent order. Enhanced monitoring applied for the duration of the monitorship period as a condition of the agreement.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, playbookId: 'pb_high_risk_customer', notableCharterPins: ['P3', 'P6'] },
  { code: 'D22_mlro_board_escalation', label: 'Escalated to Board Risk Committee', description: 'Case escalated to Board Risk Committee for a binary go / no-go decision where the commercial, reputational, and regulatory stakes exceed MLRO authority thresholds. Commercial team is excluded from the Board deliberation. Board decision is the final authority and must be minuted.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3'] },
  { code: 'D23_retaliatory_sar_deferred', label: 'STR deferred — retaliatory SAR legal review', description: 'Proposed STR filing deferred pending independent legal review for risk that the filing could constitute a retaliatory or weaponised use of suspicious-activity reporting. The deferral must not exceed 24 hours; if legal review is inconclusive, the STR is filed and the concern noted separately.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P4'] },
  { code: 'D24_ubo_resolution_pending', label: 'UBO resolution pending', description: 'Ultimate Beneficial Owner chain is unresolved. Case suspended pending receipt of corporate-documentary evidence (certified register extract, notarised ownership chain, court-verified trust deed). Relationship or transaction cannot proceed until UBO is identified to natural-person level.', minApprovals: 1, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: ['P6', 'P7'] },
  { code: 'D25_sof_sow_verification_pending', label: 'Source of Funds / Source of Wealth verification pending', description: 'Source of Funds (SoF) and / or Source of Wealth (SoW) documentation has been formally requested. Approval and any material transaction or onboarding decision are suspended until documentation is received and independently verified. Case must resolve within the SLA window or escalate to D08.', minApprovals: 1, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: ['P6', 'P7'] },
  { code: 'D26_litigation_hold_active', label: 'Litigation hold active', description: 'Legal preservation order (litigation hold) has been invoked. No case-file modification, deletion, or archiving is permitted for the duration of the hold. Hold must be documented with a reference number, scope description, invoking authority, and anticipated duration.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P7'] },
  { code: 'D27_regulatory_inquiry_under_way', label: 'Active regulatory inquiry — heightened confidentiality', description: 'A competent authority (CBUAE, SCA, DFSA, ADGM FSRA, or equivalent) has initiated an active inquiry. Heightened confidentiality protocol is in force. All internal communications referencing the inquiry are subject to legal professional privilege review before dissemination. No information related to the inquiry may be shared with the subject of the inquiry.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P4'] },
  { code: 'D28_sector_derisk_assessment', label: 'Sector-level derisking assessment', description: 'The relationship is subject to a systematic portfolio-wide or sector-level derisking review initiated by the MLRO or Board Risk Committee. Individual relationship assessment is suspended pending the portfolio decision. Sector-level reviews must be completed within 30 calendar days.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3'] },
  { code: 'D29_behavioral_profiling_escalation', label: 'Behavioral profiling escalation', description: 'Case escalated because the behavioral pattern of the subject — including reluctance to provide information, inconsistent explanations across interactions, unusual urgency, or explicit social-engineering conduct — has triggered the behavioral-science layer of the assessment and requires specialist behavioral analysis before a disposition is confirmed. Standard document-based CDD alone is insufficient to resolve the case.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: ['P6', 'P7'] },
  { code: 'D30_insider_threat_investigation', label: 'Insider threat — compliance integrity investigation', description: 'An internal compliance integrity investigation has been triggered by indicators that an employee, contractor, or approved-person has acted in a manner that compromises the AML/CFT assessment process — including motivated reasoning confirmed by independent review, undisclosed personal relationship with the subject, or deliberate suppression of red flags. The investigation is ring-fenced from the business line concerned. HR, Legal, and the MLRO are jointly responsible for the investigation timeline.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P7'] },
  { code: 'D31_social_engineering_referral', label: 'Social engineering attempt — security and fraud referral', description: 'A social engineering attempt targeting the onboarding or due diligence process has been detected and referred to the Information Security and Fraud Risk teams. The subject\'s case is placed in BLOCKED status pending a full investigation. No onboarding, transaction, or relationship continuation decision may be made until the fraud investigation is closed and the MLRO has signed off on the outcome.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P4'] },
  { code: 'D32_whistleblower_protection_active', label: 'Whistleblower protection order in force', description: 'A whistleblower protection order has been invoked under applicable law (UAE Federal Decree-Law No. 10/2025 Art. 34; CBUAE Whistleblowing Policy; or applicable jurisdiction equivalent). The case file is ring-fenced with access limited to the MLRO and Legal. The identity of the whistleblower may not be disclosed to the subject of the report or to any operational business line. Standard case-workflow access controls are suspended for the duration of the protection order.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3', 'P7'] },
  { code: 'D33_external_monitor_appointed', label: 'External compliance monitor appointed by regulator', description: 'A competent authority has appointed an external compliance monitor to oversee the institution\'s AML/CFT programme or a specific business unit. All case dispositions, STR filing decisions, and risk-appetite determinations in the monitored scope must be reviewed by the monitor during the monitorship period. The monitor\'s findings supersede internal MLRO decisions on matters within the monitorship scope. Monitorship duration, scope, and reporting cadence must be documented in the case record.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, notableCharterPins: ['P3'] },
  { code: 'D34_cryptoasset_freeze', label: 'Cryptoasset-specific freeze — TFS or investigation hold', description: 'A targeted financial sanction (TFS) freeze or investigative hold has been applied specifically to identified cryptoasset holdings, wallet addresses, or DeFi positions belonging to or controlled by the subject. The freeze is implemented via coordination with the relevant VASP or custodian and is reported to the UAE CBUAE TFS unit within 24 hours under Cabinet Decision 74/2020. On-chain monitoring is activated for all associated wallet addresses. A goAML FFR is filed within 48 hours.', minApprovals: 2, requiresSeniorManagement: true, requiresMlroSignOff: true, playbookId: 'pb_confirmed_sanctions_match', notableCharterPins: ['P4'] },
  { code: 'D35_enhanced_source_verification', label: 'Enhanced source of funds verification — cryptoasset or DeFi origin', description: 'Source of Funds verification has been triggered specifically for funds originating from cryptoasset transactions, DeFi protocol interactions, or VASP-settled proceeds. Standard SoF documentation is insufficient; on-chain forensic analysis (blockchain tracing, VASP KYC records, DEX transaction logs) must be produced and independently reviewed before any fiat-conversion, onboarding, or relationship continuation decision is made. Case must resolve within 10 business days or escalate to D08.', minApprovals: 2, requiresSeniorManagement: false, requiresMlroSignOff: true, notableCharterPins: ['P6', 'P7'] },
];

export const DISPOSITION_BY_CODE: Map<DispositionCode, Disposition> = new Map(
  DISPOSITIONS.map((d) => [d.code, d]),
);
