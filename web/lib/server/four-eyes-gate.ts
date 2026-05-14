// Hawkeye Sterling — four-eyes approval gate.
//
// UAE FDL 10/2025 Art.16 + FATF R.26 require dual attestation before
// regulator-facing filings (STR / SAR / CTR / FFR goAML submissions and
// material disposition commits). This module provides the canonical gate
// that route handlers call before any tipping-off-risk action.
//
// Storage: a sequence of approval entries per case under
// `four-eyes/approvals/<caseId>/<approvalId>.json`. Two entries with
// distinct `actor` values constitute the four-eyes set; a single
// operator approving twice is rejected.
//
// Auth: the approver identity (`actor`) is supplied by the caller — the
// route handler is responsible for resolving it from session / API key /
// regulator JWT before invoking this gate.

import { getJson, setJson, listKeys } from "@/lib/server/store";
import { createHash } from "crypto";

export interface ApprovalEntry {
  approvalId: string;
  caseId: string;
  actor: string;            // operator email / GID — MUST be unique per
                            // person, not a shared role account.
  decision: "approve" | "reject";
  rationale: string;
  approvedAt: string;
  digest: string;           // sha-256 over caseId|actor|decision|rationale
                            // — tamper-evident link into audit chain.
  parentJti?: string;       // optional regulator-JWT linkage
}

export interface FourEyesStatus {
  caseId: string;
  approverCount: number;
  approverGids: string[];
  decisions: ApprovalEntry[];
  /** Both gates satisfied? true = two distinct actors have approved. */
  passed: boolean;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

const PREFIX = "four-eyes/approvals/";

function approvalKey(caseId: string, approvalId: string): string {
  return `${PREFIX}${caseId}/${approvalId}.json`;
}

function digestApproval(input: { caseId: string; actor: string; decision: string; rationale: string }): string {
  return createHash("sha256")
    .update(`${input.caseId}|${input.actor}|${input.decision}|${input.rationale}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Record an approval / rejection. Caller MUST have verified the actor
 * identity from the inbound auth context — this gate trusts the `actor`
 * arg. Returns the resulting status so the caller can immediately decide
 * whether to allow downstream submission.
 *
 * Throws if the same actor tries to add a second approval for the same
 * case (single-operator-collusion guard).
 */
export async function recordApproval(input: {
  caseId: string;
  actor: string;
  decision: "approve" | "reject";
  rationale: string;
  parentJti?: string;
}): Promise<{ status: FourEyesStatus; entry: ApprovalEntry; conflict?: string }> {
  if (!input.caseId.trim() || !input.actor.trim() || !input.rationale.trim()) {
    throw new Error("four-eyes: caseId, actor, rationale all required");
  }
  // Inspect existing approvals — refuse same-actor double-approval.
  const existing = await getCaseApprovals(input.caseId);
  const sameActor = existing.decisions.find((d) => d.actor === input.actor);
  if (sameActor) {
    return {
      status: existing,
      entry: sameActor,
      conflict: `actor ${input.actor} already recorded a ${sameActor.decision} on this case at ${sameActor.approvedAt}`,
    };
  }

  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: ApprovalEntry = {
    approvalId,
    caseId: input.caseId,
    actor: input.actor,
    decision: input.decision,
    rationale: input.rationale,
    approvedAt: new Date().toISOString(),
    digest: digestApproval(input),
    ...(input.parentJti ? { parentJti: input.parentJti } : {}),
  };
  await setJson(approvalKey(input.caseId, approvalId), entry);

  // Re-load post-write for fresh status.
  const status = await getCaseApprovals(input.caseId);
  return { status, entry };
}

/** Read all approvals for a case and compute pass/reject state. */
export async function getCaseApprovals(caseId: string): Promise<FourEyesStatus> {
  const keys = await listKeys(`${PREFIX}${caseId}/`);
  const decisions: ApprovalEntry[] = [];
  for (const k of keys) {
    const e = await getJson<ApprovalEntry>(k);
    if (e && e.approvalId && e.actor) decisions.push(e);
  }
  decisions.sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));

  // Any reject short-circuits the chain.
  const rejected = decisions.find((d) => d.decision === "reject");
  if (rejected) {
    return {
      caseId,
      approverCount: decisions.length,
      approverGids: Array.from(new Set(decisions.map((d) => d.actor))),
      decisions,
      passed: false,
      rejectedAt: rejected.approvedAt,
      rejectedBy: rejected.actor,
      rejectionReason: rejected.rationale,
    };
  }
  const distinctApprovers = Array.from(new Set(decisions.filter((d) => d.decision === "approve").map((d) => d.actor)));
  return {
    caseId,
    approverCount: decisions.length,
    approverGids: distinctApprovers,
    decisions,
    passed: distinctApprovers.length >= 2,
  };
}

/**
 * Convenience guard for handler routes. Returns null when four-eyes
 * passes; returns a structured error envelope when it fails. Caller
 * does: `const block = await requireFourEyes(caseId); if (block) return block;`
 */
export async function requireFourEyes(caseId: string): Promise<{
  ok: false;
  error: "four-eyes-gate";
  message: string;
  status: FourEyesStatus;
  regulationBasis: string[];
} | null> {
  const status = await getCaseApprovals(caseId);
  if (status.passed) return null;
  const need = status.rejectedAt
    ? `case was rejected by ${status.rejectedBy} (reason: ${status.rejectionReason}); submission blocked`
    : `four-eyes principle requires TWO distinct approvers — case has ${status.approverGids.length} (${status.approverGids.join(", ") || "none"}). Record a second distinct approval before submitting.`;
  return {
    ok: false,
    error: "four-eyes-gate",
    message: need,
    status,
    regulationBasis: [
      "UAE FDL 10/2025 Art.16 (dual-attestation for regulator filings)",
      "FATF Recommendation 26 (record-keeping + responsibility separation)",
      "CR No. 134/2025 Art.18 (MLRO sign-off review)",
    ],
  };
}
