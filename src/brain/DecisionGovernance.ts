// Hawkeye Sterling — decision governance engine.
// Every compliance decision must be recorded with:
//   - The reviewer who made it
//   - The rationale (plain language)
//   - The evidence references that supported it
//   - Any alerts that were overridden and why
//   - The policy references justifying the decision
//   - A tamper-evident hash of the decision record
//
// Satisfies FATF R.10 (record-keeping), R.11 (data retention),
// and UAE CBUAE AML-CFT Standards Section 8 (documentation).

// ── Decision types ────────────────────────────────────────────────────────────

export type DecisionOutcome =
  | 'clear'            // no further action required
  | 'monitor'          // enhanced ongoing monitoring
  | 'escalate'         // refers to next escalation tier
  | 'de_risk'          // de-risk the relationship
  | 'exit_relationship'// terminate the relationship
  | 'file_str'         // file suspicious transaction report
  | 'block'            // block transaction / freeze account
  | 'request_info'     // request additional information from customer
  | 'refer_regulator'; // refer directly to regulator

export type DecisionCategory =
  | 'onboarding_kyc'
  | 'periodic_review'
  | 'triggered_review'
  | 'transaction_monitoring'
  | 'sanctions_screening'
  | 'adverse_media_review'
  | 'pep_assessment'
  | 'str_str_filing'
  | 'case_closure';

export interface ReviewerRecord {
  reviewerId: string;
  reviewerName: string;
  role: string;         // analyst, mlro, legal_counsel, etc.
  department: string;
  organizationId?: string;
}

export interface EvidenceReference {
  evidenceId: string;
  evidenceType: string;    // 'sanctions_hit', 'adverse_media', 'kyc_document', etc.
  description: string;
  url?: string;
  hash?: string;           // SHA-256 of evidence content
}

export interface PolicyReference {
  policyId: string;
  policyName: string;
  section?: string;
  jurisdiction?: string;
  url?: string;
}

export interface OverriddenAlert {
  alertId: string;
  alertType: string;
  originalSeverity: string;
  overrideReason: string;
  approvedBy?: string;     // second approver for senior overrides
}

export interface Decision {
  decisionId: string;
  caseId?: string;           // links to EscalationCase
  subjectId: string;
  subjectName: string;
  category: DecisionCategory;
  outcome: DecisionOutcome;

  reviewer: ReviewerRecord;
  rationale: string;          // plain-language explanation (regulator-readable)
  evidenceReferences: EvidenceReference[];
  policyReferences: PolicyReference[];
  overriddenAlerts: OverriddenAlert[];

  riskScoreAtDecision: number;
  confidenceAtDecision: string; // MatchConfidenceLevel

  requiresSecondApproval: boolean;
  secondApprover?: ReviewerRecord;
  secondApprovalAt?: string;
  secondApprovalRationale?: string;

  effectiveDates: {
    decidedAt: string;          // ISO 8601
    reviewDueAt?: string;       // for 'monitor' decisions
    expiresAt?: string;         // for time-limited decisions
  };

  decisionHash: string;         // tamper-evident hash
  auditTrailRef?: string;       // reference to audit chain entry
  schemaVersion: string;
}

// ── Decision ID generator ─────────────────────────────────────────────────────

let _decisionCounter = 0;
function generateDecisionId(): string {
  _decisionCounter++;
  return `DEC-${Date.now().toString(36).toUpperCase()}-${String(_decisionCounter).padStart(4, '0')}`;
}

// ── Decision hash ─────────────────────────────────────────────────────────────

function canonicaliseDecision(d: Omit<Decision, 'decisionHash'>): string {
  return JSON.stringify({
    decisionId: d.decisionId,
    subjectId: d.subjectId,
    category: d.category,
    outcome: d.outcome,
    reviewerId: d.reviewer.reviewerId,
    rationale: d.rationale,
    evidenceIds: d.evidenceReferences.map((e) => e.evidenceId).sort(),
    policyIds: d.policyReferences.map((p) => p.policyId).sort(),
    overrideIds: d.overriddenAlerts.map((o) => o.alertId).sort(),
    riskScore: d.riskScoreAtDecision,
    decidedAt: d.effectiveDates.decidedAt,
  });
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function hashDecision(d: Omit<Decision, 'decisionHash'>): string {
  return fnv1a(canonicaliseDecision(d));
}

// ── Second approval requirements ──────────────────────────────────────────────

const SECOND_APPROVAL_OUTCOMES: DecisionOutcome[] = [
  'file_str', 'exit_relationship', 'refer_regulator', 'block',
];

const SECOND_APPROVAL_RISK_THRESHOLD = 0.75;

export function requiresSecondApproval(
  outcome: DecisionOutcome,
  riskScore: number,
  reviewerRole: string,
): boolean {
  if (SECOND_APPROVAL_OUTCOMES.includes(outcome)) return true;
  if (riskScore >= SECOND_APPROVAL_RISK_THRESHOLD && reviewerRole === 'analyst') return true;
  return false;
}

// ── Standard policy references ────────────────────────────────────────────────

export const STANDARD_POLICIES: Record<string, PolicyReference> = {
  FATF_R3: { policyId: 'FATF_R3', policyName: 'FATF Recommendation 3 — Money Laundering Offence' },
  FATF_R5: { policyId: 'FATF_R5', policyName: 'FATF Recommendation 5 — Terrorist Financing Offence' },
  FATF_R6: { policyId: 'FATF_R6', policyName: 'FATF Recommendation 6 — Targeted Financial Sanctions (TF/PF)' },
  FATF_R10: { policyId: 'FATF_R10', policyName: 'FATF Recommendation 10 — Customer Due Diligence' },
  FATF_R11: { policyId: 'FATF_R11', policyName: 'FATF Recommendation 11 — Record Keeping' },
  FATF_R12: { policyId: 'FATF_R12', policyName: 'FATF Recommendation 12 — PEPs' },
  FATF_R20: { policyId: 'FATF_R20', policyName: 'FATF Recommendation 20 — Reporting of Suspicious Transactions' },
  FATF_R21: { policyId: 'FATF_R21', policyName: 'FATF Recommendation 21 — Tipping-Off and Confidentiality' },
  UAE_FDL20: { policyId: 'UAE_FDL20', policyName: 'UAE Federal Decree-Law No. 20 of 2018', jurisdiction: 'AE' },
  UAE_CD74: { policyId: 'UAE_CD74', policyName: 'UAE Cabinet Decision No. 74 of 2020', jurisdiction: 'AE' },
  CBUAE_STD: { policyId: 'CBUAE_STD', policyName: 'CBUAE AML-CFT Standards', jurisdiction: 'AE' },
};

// ── Review due date calculator ────────────────────────────────────────────────

function calculateReviewDue(outcome: DecisionOutcome, riskScore: number): string | undefined {
  if (outcome === 'clear') {
    // Annual review for low risk, 6 months for medium
    const months = riskScore < 0.25 ? 12 : riskScore < 0.50 ? 6 : 3;
    return new Date(Date.now() + months * 30 * 86_400_000).toISOString();
  }
  if (outcome === 'monitor') {
    // Enhanced monitoring: 30 days for high risk, 90 days for medium
    const days = riskScore >= 0.50 ? 30 : 90;
    return new Date(Date.now() + days * 86_400_000).toISOString();
  }
  return undefined;
}

// ── Decision builder ──────────────────────────────────────────────────────────

export interface BuildDecisionInput {
  caseId?: string;
  subjectId: string;
  subjectName: string;
  category: DecisionCategory;
  outcome: DecisionOutcome;
  reviewer: ReviewerRecord;
  rationale: string;
  evidenceReferences?: EvidenceReference[];
  policyReferences?: PolicyReference[];
  overriddenAlerts?: OverriddenAlert[];
  riskScoreAtDecision: number;
  confidenceAtDecision?: string;
  auditTrailRef?: string;
}

export function buildDecision(input: BuildDecisionInput): Decision {
  const decisionId = generateDecisionId();
  const decidedAt = new Date().toISOString();

  const needsSecondApproval = requiresSecondApproval(
    input.outcome,
    input.riskScoreAtDecision,
    input.reviewer.role,
  );

  const base: Omit<Decision, 'decisionHash'> = {
    decisionId,
    caseId: input.caseId,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    category: input.category,
    outcome: input.outcome,
    reviewer: input.reviewer,
    rationale: input.rationale,
    evidenceReferences: input.evidenceReferences ?? [],
    policyReferences: input.policyReferences ?? [STANDARD_POLICIES.FATF_R11!],
    overriddenAlerts: input.overriddenAlerts ?? [],
    riskScoreAtDecision: input.riskScoreAtDecision,
    confidenceAtDecision: input.confidenceAtDecision ?? 'UNKNOWN',
    requiresSecondApproval: needsSecondApproval,
    effectiveDates: {
      decidedAt,
      reviewDueAt: calculateReviewDue(input.outcome, input.riskScoreAtDecision),
    },
    auditTrailRef: input.auditTrailRef,
    schemaVersion: '2025.1',
  };

  return {
    ...base,
    decisionHash: hashDecision(base),
  };
}

// ── Second approval recorder ──────────────────────────────────────────────────

export function recordSecondApproval(
  decision: Decision,
  secondApprover: ReviewerRecord,
  rationale: string,
): Decision {
  const updated: Omit<Decision, 'decisionHash'> = {
    ...decision,
    secondApprover,
    secondApprovalAt: new Date().toISOString(),
    secondApprovalRationale: rationale,
    requiresSecondApproval: false,
  };
  return {
    ...updated,
    decisionHash: hashDecision(updated),
  };
}

// ── Decision integrity verifier ───────────────────────────────────────────────

export function verifyDecisionIntegrity(decision: Decision): {
  ok: boolean;
  expectedHash: string;
  actualHash: string;
} {
  const { decisionHash, ...rest } = decision;
  const expectedHash = hashDecision(rest);
  return {
    ok: expectedHash === decisionHash,
    expectedHash,
    actualHash: decisionHash,
  };
}

// ── Decision summary for reports ──────────────────────────────────────────────

export function formatDecisionSummary(d: Decision): string {
  const lines = [
    `Decision ID: ${d.decisionId}`,
    `Subject: ${d.subjectName} (${d.subjectId})`,
    `Category: ${d.category} | Outcome: ${d.outcome.toUpperCase()}`,
    `Reviewer: ${d.reviewer.reviewerName} (${d.reviewer.role})`,
    `Decided: ${d.effectiveDates.decidedAt}`,
    `Risk Score: ${(d.riskScoreAtDecision * 100).toFixed(0)}%`,
    ``,
    `Rationale:`,
    d.rationale,
    ``,
    `Evidence references: ${d.evidenceReferences.map((e) => e.evidenceId).join(', ') || 'none'}`,
    `Policy references: ${d.policyReferences.map((p) => p.policyId).join(', ')}`,
  ];

  if (d.overriddenAlerts.length > 0) {
    lines.push(`Overridden alerts: ${d.overriddenAlerts.map((o) => o.alertId).join(', ')}`);
    for (const o of d.overriddenAlerts) {
      lines.push(`  - ${o.alertId} (${o.alertType}): ${o.overrideReason}`);
    }
  }

  if (d.secondApprover) {
    lines.push(`Second approval: ${d.secondApprover.reviewerName} at ${d.secondApprovalAt}`);
    lines.push(`Second approval rationale: ${d.secondApprovalRationale}`);
  }

  lines.push(``, `Decision hash: ${d.decisionHash} | Schema: ${d.schemaVersion}`);
  return lines.join('\n');
}
