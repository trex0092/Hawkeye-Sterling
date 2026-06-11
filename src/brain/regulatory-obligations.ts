// Hawkeye Sterling — recurring regulatory-obligation register.
// Each entry is a standing compliance obligation with a completion cadence.
// The register drives kri_regulatory_obligation_overdue on /api/kri-dashboard:
// an obligation whose lastCompleted date is older than its cadence is OVERDUE
// and breaches the regulatory_obligation_overdue appetite dimension (zero
// tolerance).
//
// Seed lastCompleted dates are taken from the governance documents named in
// evidenceRef at the time this register was created (2026-06-10). The operator
// updates lastCompleted on every completion — this register is the machine-
// readable counterpart of the governance calendar, not a substitute for it.

export type ObligationOwner =
  | 'MLRO'
  | 'Compliance Officer'
  | 'Engineering Lead'
  | 'Data Science Lead'
  | 'CEO'
  | 'Board';

export interface RegulatoryObligation {
  id: string;
  name: string;
  regulatoryAnchor: string;
  owner: ObligationOwner;
  /** Completion cadence in days (92 ≈ quarterly, 365 = annual). */
  cadenceDays: number;
  /** ISO date of the most recent completion. Omit only for obligations that
   *  have never run; nextDueOverride is then mandatory. */
  lastCompleted?: string;
  /** ISO date the first cycle is due when no completion exists yet
   *  (e.g. a newly scheduled annual exercise). */
  nextDueOverride?: string;
  /** Document that evidences completion. */
  evidenceRef: string;
}

export const REGULATORY_OBLIGATIONS: RegulatoryObligation[] = [
  { id: 'ob_board_mi', name: 'Board AML/AI management-information pack', regulatoryAnchor: 'CR 134/2025; dpms_kpi_25', owner: 'MLRO', cadenceDays: 92, lastCompleted: '2026-06-09', evidenceRef: 'docs/governance/GOVERNANCE_COMMITTEE_MEETINGS.md' },
  { id: 'ob_policy_annual_review', name: 'AI Governance Policy annual review', regulatoryAnchor: 'ISO 42001 Clause 5.2; FATF R.18', owner: 'MLRO', cadenceDays: 365, lastCompleted: '2026-05-06', evidenceRef: 'docs/governance/AI_GOVERNANCE_POLICY.md §11' },
  { id: 'ob_soa_annual_review', name: 'Statement of Applicability annual review', regulatoryAnchor: 'ISO 42001 Annex A', owner: 'MLRO', cadenceDays: 365, lastCompleted: '2026-06-09', evidenceRef: 'docs/governance/STATEMENT_OF_APPLICABILITY.md' },
  { id: 'ob_vendor_annual_review', name: 'Third-party vendor register review', regulatoryAnchor: 'ISO 42001 Clause 8.4; FDL 10/2025 Art.24', owner: 'Engineering Lead', cadenceDays: 365, lastCompleted: '2026-06-09', evidenceRef: 'docs/operations/THIRD_PARTY_MANAGEMENT.md' },
  { id: 'ob_fairness_quarterly_audit', name: 'Disaggregated fairness audit', regulatoryAnchor: 'FATF R.10; FDL 10/2025 Art.18', owner: 'Data Science Lead', cadenceDays: 92, lastCompleted: '2026-06-04', evidenceRef: 'docs/testing/FAIRNESS_TESTING_RESULTS.md' },
  { id: 'ob_internal_audit', name: 'Internal AIMS audit', regulatoryAnchor: 'ISO 42001 Clause 9.2', owner: 'MLRO', cadenceDays: 92, lastCompleted: '2026-06-04', evidenceRef: 'docs/operations/AUDIT_PREP_CHECKLIST.md §0' },
  { id: 'ob_dr_test', name: 'Disaster-recovery exercise', regulatoryAnchor: 'SOC2 CC7.4', owner: 'Engineering Lead', cadenceDays: 92, lastCompleted: '2026-04-01', evidenceRef: 'docs/SLA.md; docs/RELIABILITY-REPORT.md §4.1' },
  { id: 'ob_goaml_credentials', name: 'goAML registration and credential test', regulatoryAnchor: 'FIU guidance; dpms_kpi_24', owner: 'Compliance Officer', cadenceDays: 92, lastCompleted: '2026-06-04', evidenceRef: 'COMPLIANCE_GAPS.md CG-4' },
  { id: 'ob_aml_training', name: 'Annual staff AML/AI training cycle', regulatoryAnchor: 'FATF R.18; dpms_kpi_26', owner: 'Compliance Officer', cadenceDays: 365, lastCompleted: '2026-05-06', evidenceRef: 'docs/governance/AI_INVENTORY.md §7' },
  { id: 'ob_access_review', name: 'Quarterly privileged-access review', regulatoryAnchor: 'SOC2 CC6.1', owner: 'Engineering Lead', cadenceDays: 92, lastCompleted: '2026-06-10', evidenceRef: 'docs/IDENTITY-ACCESS-ATTESTATION.md' },
  { id: 'ob_pentest', name: 'Annual penetration test', regulatoryAnchor: 'SOC2 CC4.1', owner: 'Engineering Lead', cadenceDays: 365, nextDueOverride: '2026-09-30', evidenceRef: 'docs/PENTEST-LOG.md' },
  { id: 'ob_cbuae_ai_guidance_selfassessment', name: 'CBUAE AI Guidance Note 9-obligation self-assessment', regulatoryAnchor: 'CBUAE AI Guidance Note (2025); EU AI Act 2024/1689', owner: 'MLRO', cadenceDays: 365, nextDueOverride: '2026-12-10', evidenceRef: 'docs/governance/FRAMEWORK_COVERAGE.md §5' },
];

export const OBLIGATION_BY_ID: Map<string, RegulatoryObligation> = new Map(
  REGULATORY_OBLIGATIONS.map((o) => [o.id, o]),
);

export type ObligationStatus = 'current' | 'due_soon' | 'overdue';

const DAY_MS = 86_400_000;

/** Epoch ms of the obligation's next due date, or NaN when the entry is
 *  malformed (no lastCompleted and no nextDueOverride). */
export function obligationNextDueMs(o: RegulatoryObligation): number {
  if (o.lastCompleted) return Date.parse(o.lastCompleted) + o.cadenceDays * DAY_MS;
  if (o.nextDueOverride) return Date.parse(o.nextDueOverride);
  return Number.NaN;
}

/** Classify one obligation. Malformed entries report 'overdue' — the
 *  register fails closed rather than hiding a broken row. */
export function obligationStatus(
  o: RegulatoryObligation,
  nowMs: number = Date.now(),
  dueSoonDays: number = 14,
): ObligationStatus {
  const dueMs = obligationNextDueMs(o);
  if (Number.isNaN(dueMs) || dueMs < nowMs) return 'overdue';
  if (dueMs - nowMs <= dueSoonDays * DAY_MS) return 'due_soon';
  return 'current';
}

export interface ObligationsSummary {
  total: number;
  overdue: number;
  dueSoon: number;
  overdueIds: string[];
  dueSoonIds: string[];
}

export function summarizeObligations(nowMs: number = Date.now()): ObligationsSummary {
  const overdueIds: string[] = [];
  const dueSoonIds: string[] = [];
  for (const o of REGULATORY_OBLIGATIONS) {
    const status = obligationStatus(o, nowMs);
    if (status === 'overdue') overdueIds.push(o.id);
    else if (status === 'due_soon') dueSoonIds.push(o.id);
  }
  return {
    total: REGULATORY_OBLIGATIONS.length,
    overdue: overdueIds.length,
    dueSoon: dueSoonIds.length,
    overdueIds,
    dueSoonIds,
  };
}
