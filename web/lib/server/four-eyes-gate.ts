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

import { getJson, setJson, listKeys, del } from "@/lib/server/store";
import { createHash, randomBytes } from "node:crypto";
import { startSpan, SpanStatus } from "@/lib/server/tracer";

// Hash actor for OTel span attributes — actor may be an email/GID (PII).
// 12-hex prefix is sufficient for correlation without being reversible.
function hashActor(actor: string): string {
  return createHash("sha256").update(actor).digest("hex").slice(0, 12);
}

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
  isExpired?: boolean;
  expiresAt?: string;
  overdueHours?: number;
}

/** PII-safe view returned in API responses — actor identities are hashed. */
export interface SanitizedFourEyesStatus {
  caseId: string;
  approverCount: number;
  /** SHA-256 hashes (first 12 hex chars) of approver identities — no raw PII. */
  approverHashes: string[];
  passed: boolean;
  rejectedAt?: string;
  /** SHA-256 hash of rejecting actor's identity — no raw PII. */
  rejectedByHash?: string;
  rejectionReason?: string;
  isExpired?: boolean;
  expiresAt?: string;
  overdueHours?: number;
}

const PREFIX = "four-eyes/approvals/";
const FOUR_EYES_TTL_HOURS = 48; // Cases pending > 48h are flagged as overdue (FDL 10/2025 Art.16)
const FOUR_EYES_ESCALATION_HOURS = 72; // Cases pending > 72h trigger escalation

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
}

export function isCaseOverdue(firstApprovalAt: string, nowMs = Date.now()): boolean {
  const ageHours = (nowMs - Date.parse(firstApprovalAt)) / 3_600_000;
  return ageHours >= FOUR_EYES_TTL_HOURS;
}

export function isCaseRequiresEscalation(firstApprovalAt: string, nowMs = Date.now()): boolean {
  const ageHours = (nowMs - Date.parse(firstApprovalAt)) / 3_600_000;
  return ageHours > FOUR_EYES_ESCALATION_HOURS;
}

function approvalKey(caseId: string, approvalId: string): string {
  return `${PREFIX}${safeSegment(caseId)}/${approvalId}.json`;
}

function sanitizeStatus(status: FourEyesStatus): SanitizedFourEyesStatus {
  const { approverGids, rejectedBy, decisions: _decisions, ...rest } = status;
  return {
    ...rest,
    approverHashes: approverGids.map(hashActor),
    ...(rejectedBy ? { rejectedByHash: hashActor(rejectedBy) } : {}),
  };
}

function digestApproval(input: { caseId: string; actor: string; decision: string; rationale: string }): string {
  return createHash("sha256")
    .update(`${input.caseId}|${input.actor}|${input.decision}|${input.rationale}`)
    .digest("hex");
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
  const span = startSpan('four-eyes.record-approval', {
    'four-eyes.caseId': input.caseId,
    'four-eyes.actorHash': hashActor(input.actor),
    'four-eyes.decision': input.decision,
  });
  try {
    return await _recordApproval(input, span);
  } catch (err) {
    span.setStatus({ code: SpanStatus.ERROR });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    span.end();
  }
}

async function _recordApproval(
  input: { caseId: string; actor: string; decision: "approve" | "reject"; rationale: string; parentJti?: string },
  span: ReturnType<typeof startSpan>,
): Promise<{ status: FourEyesStatus; entry: ApprovalEntry; conflict?: string }> {
  // Minimum rationale of 20 chars prevents trivially empty sign-offs like
  // "ok", "approved", "x". Regulators require substantive reasoning.
  if (!input.caseId.trim() || !input.actor.trim() || input.rationale.trim().length < 20) {
    throw new Error(
      "four-eyes: caseId and actor are required; rationale must be at least 20 characters " +
      "(provide substantive reasoning per UAE FDL 10/2025 Art.16)"
    );
  }
  // Inspect existing approvals — refuse same-actor double-approval.
  const existing = await getCaseApprovals(input.caseId);
  const sameActor = existing.decisions.find((d) => d.actor === input.actor);
  if (sameActor) {
    return {
      status: existing,
      entry: sameActor,
      // Use hash of actor identity in the conflict message — raw actor value
      // (email/GID) must not appear in error responses or logs (UAE PDPL + FATF R.7).
      conflict: `actor ${hashActor(input.actor)} already recorded a ${sameActor.decision} on this case at ${sameActor.approvedAt}`,
    };
  }

  const approvalId = `appr_${Date.now()}_${randomBytes(8).toString("hex")}`;
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

  // Post-write duplicate check: guards against TOCTOU race where two
  // concurrent requests both passed the pre-write same-actor check.
  // Re-read the full decision set and verify our actor only appears once.
  const status = await getCaseApprovals(input.caseId);
  const actorDecisions = status.decisions.filter((d) => d.actor === input.actor);
  if (actorDecisions.length > 1) {
    // We lost the race — delete our entry and surface the earlier one.
    await del(approvalKey(input.caseId, approvalId)).catch(async () => {
      await new Promise((r) => setTimeout(r, 200));
      await del(approvalKey(input.caseId, approvalId)).catch((retryErr) => {
        console.error(
          "[four-eyes] orphaned approval entry — both delete attempts failed:",
          { caseId: input.caseId, approvalId, err: retryErr instanceof Error ? retryErr.message : String(retryErr) },
        );
      });
    });
    const earlier = actorDecisions[0]!;
    return {
      status: await getCaseApprovals(input.caseId),
      entry: earlier,
      conflict: `actor ${hashActor(input.actor)} already recorded a ${earlier.decision} on this case at ${earlier.approvedAt} (concurrent write detected and rolled back)`,
    };
  }
  span.setAttribute('four-eyes.passed', status.passed);
  span.setAttribute('four-eyes.approver-count', status.approverCount);
  return { status, entry };
}

/** Read all approvals for a case and compute pass/reject state. */
export async function getCaseApprovals(caseId: string): Promise<FourEyesStatus> {
  const keys = await listKeys(`${PREFIX}${safeSegment(caseId)}/`);
  const results = await Promise.all(keys.map((k) => getJson<ApprovalEntry>(k)));
  const decisions: ApprovalEntry[] = results.filter(
    (e): e is ApprovalEntry => e != null && !!e.approvalId && !!e.actor,
  );
  decisions.sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));

  // Compute expiry fields based on the first approval timestamp.
  const firstApprovalAt = decisions[0]?.approvedAt;
  const isExpired = firstApprovalAt ? isCaseOverdue(firstApprovalAt) : false;
  const overdueHours = firstApprovalAt
    ? Math.floor((Date.now() - Date.parse(firstApprovalAt)) / 3_600_000)
    : 0;
  const expiresAt = firstApprovalAt
    ? new Date(Date.parse(firstApprovalAt) + FOUR_EYES_TTL_HOURS * 3_600_000).toISOString()
    : undefined;

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
      isExpired,
      expiresAt,
      overdueHours,
    };
  }
  const distinctApprovers = Array.from(new Set(decisions.filter((d) => d.decision === "approve").map((d) => d.actor)));
  return {
    caseId,
    approverCount: decisions.length,
    approverGids: distinctApprovers,
    decisions,
    passed: distinctApprovers.length >= 2,
    isExpired,
    expiresAt,
    overdueHours,
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
  status: SanitizedFourEyesStatus;
  regulationBasis: string[];
} | null> {
  const span = startSpan('four-eyes.require', { 'four-eyes.caseId': caseId });
  try {
    const status = await getCaseApprovals(caseId);
    span.setAttribute('four-eyes.passed', status.passed);
    span.setAttribute('four-eyes.approver-count', status.approverCount);
    if (status.passed) return null;
    const sanitized = sanitizeStatus(status);
    const need = status.rejectedAt
      ? `case was rejected by actor ${sanitized.rejectedByHash} (reason: ${status.rejectionReason}); submission blocked`
      : `four-eyes principle requires TWO distinct approvers — case has ${sanitized.approverHashes.length} (${sanitized.approverHashes.join(", ") || "none"}). Record a second distinct approval before submitting.`;
    return {
      ok: false,
      error: "four-eyes-gate",
      message: need,
      status: sanitized,
      regulationBasis: [
        "UAE FDL 10/2025 Art.16 (dual-attestation for regulator filings)",
        "FATF Recommendation 26 (record-keeping + responsibility separation)",
        "CR No. 134/2025 Art.18 (MLRO sign-off review)",
      ],
    };
  } catch (err) {
    span.setStatus({ code: SpanStatus.ERROR });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    span.end();
  }
}

export async function expireCase(caseId: string, expiredBy: string): Promise<{ status: FourEyesStatus; expired: boolean }> {
  const status = await getCaseApprovals(caseId);
  if (status.passed) return { status, expired: false };
  const expiry: ApprovalEntry = {
    approvalId: `expiry_${Date.now()}_${randomBytes(8).toString("hex")}`,
    caseId,
    actor: expiredBy,
    decision: 'reject',
    rationale: `Case expired automatically — pending > ${FOUR_EYES_TTL_HOURS}h without second approval (FDL 10/2025 Art.16)`,
    approvedAt: new Date().toISOString(),
    digest: digestApproval({ caseId, actor: expiredBy, decision: 'reject', rationale: 'auto-expire' }),
  };
  await setJson(approvalKey(caseId, expiry.approvalId), expiry);
  const newStatus = await getCaseApprovals(caseId);
  return { status: newStatus, expired: true };
}

export async function getOverdueCases(): Promise<Array<{ caseId: string; overdueHours: number; requiresEscalation: boolean }>> {
  // List all case directories under four-eyes/approvals/
  const allKeys = await listKeys(PREFIX);
  const caseIds = Array.from(new Set(allKeys.map((k) => k.replace(PREFIX, '').split('/')[0] ?? '')));
  const overdue: Array<{ caseId: string; overdueHours: number; requiresEscalation: boolean }> = [];
  for (const caseId of caseIds) {
    if (!caseId) continue;
    const status = await getCaseApprovals(caseId);
    if (!status.passed && !status.rejectedAt && status.isExpired) {
      overdue.push({
        caseId,
        overdueHours: status.overdueHours ?? 0,
        requiresEscalation: (status.overdueHours ?? 0) > FOUR_EYES_ESCALATION_HOURS,
      });
    }
  }
  return overdue;
}

