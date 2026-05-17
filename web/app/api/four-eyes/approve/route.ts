// Explicit approve/reject endpoint — alias to the PATCH mechanism on the
// parent four-eyes route, designed for programmatic callers (MLRO dashboard,
// automation scripts) that prefer a stable POST body over a query-string id.
//
// POST /api/four-eyes/approve
//
// Body: { itemId, actor, decision: "approve"|"reject", rationale }
//
// Enforces:
//   • All four fields required and non-empty
//   • Item must exist and be in "pending" status
//   • No duplicate approver (same actor cannot sign twice)
//   • No self-approval (actor !== item.initiatedBy) — UAE FDL 10/2025 Art.16
//   • Two distinct "approve" decisions required to flip status to "approved"

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { getJson, setJson } from "@/lib/server/store";
import type { FourEyesItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ---------------------------------------------------------------------------
// Extended item shape — the base FourEyesItem type predates the multi-approval
// model; we layer the approvals array and completedAt on top.
// ---------------------------------------------------------------------------

interface ApprovalRecord {
  actor: string;
  decision: "approve" | "reject";
  rationale: string;
  at: string;
}

type FourEyesItemExtended = FourEyesItem & {
  approvals?: ApprovalRecord[];
  completedAt?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handler(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!isRecord(raw)) {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }

  // 1. Validate required fields.
  const itemId = stringField(raw["itemId"]);
  const actor = stringField(raw["actor"]);
  const decisionRaw = stringField(raw["decision"]);
  const rationale = stringField(raw["rationale"]);

  if (!itemId || !actor || !decisionRaw || !rationale) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_fields",
        hint: "itemId, actor, decision, and rationale are all required and must be non-empty",
      },
      { status: 400 },
    );
  }

  if (decisionRaw !== "approve" && decisionRaw !== "reject") {
    return NextResponse.json(
      { ok: false, error: "invalid_decision", hint: "decision must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  const decision = decisionRaw as "approve" | "reject";

  // 2. Load the item.
  const item = await getJson<FourEyesItemExtended>(`four-eyes/${itemId}`);

  // 3. 404 if not found.
  if (!item) {
    return NextResponse.json(
      { ok: false, error: "item_not_found" },
      { status: 404 },
    );
  }

  // 4. Must be pending.
  if (item.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "item_not_pending", status: item.status },
      { status: 409 },
    );
  }

  // 5. Duplicate approver guard.
  const existingApprovals: ApprovalRecord[] = item.approvals ?? [];
  if (existingApprovals.some((a) => a.actor === actor)) {
    return NextResponse.json(
      {
        ok: false,
        error: "duplicate_approver",
        hint: "Same actor cannot approve twice",
      },
      { status: 409 },
    );
  }

  // 6. Self-approval guard — UAE FDL 10/2025 Art.16.
  if (actor === item.initiatedBy) {
    return NextResponse.json(
      {
        ok: false,
        error: "self_approval_not_permitted",
        hint: "UAE FDL 10/2025 Art.16 requires two distinct actors",
      },
      { status: 409 },
    );
  }

  // 7. Build the new approval record.
  const approvalRecord: ApprovalRecord = {
    actor,
    decision,
    rationale,
    at: new Date().toISOString(),
  };

  // 8. Append to approvals array.
  const updatedApprovals = [...existingApprovals, approvalRecord];

  // Determine the new status.
  const approveCount = updatedApprovals.filter((a) => a.decision === "approve").length;

  let updatedItem: FourEyesItemExtended = {
    ...item,
    approvals: updatedApprovals,
  };

  let auditEvent: string;

  // 9. Reject path — immediate.
  if (decision === "reject") {
    updatedItem = {
      ...updatedItem,
      status: "rejected",
      rejectedBy: actor,
      rejectedAt: approvalRecord.at,
      rejectionReason: rationale,
    };
    auditEvent = "four_eyes.rejected";
  } else if (approveCount >= 2) {
    // 10. Second approval — mark complete.
    updatedItem = {
      ...updatedItem,
      status: "approved",
      approvedBy: actor,
      approvedAt: approvalRecord.at,
      completedAt: approvalRecord.at,
    };
    auditEvent = "four_eyes.completed";
  } else {
    // 11. First approval — remain pending.
    auditEvent = "";
  }

  // 12. Persist updated item.
  await setJson(`four-eyes/${itemId}`, updatedItem);

  // Write audit chain entry — fire-and-forget.
  if (auditEvent) {
    void writeAuditChainEntry({
      event: auditEvent,
      actor,
      caseId: updatedItem.caseId ?? updatedItem.subjectId,
      itemId,
      subjectName: updatedItem.subjectName,
      fourEyesAction: updatedItem.action,
      initiatedBy: updatedItem.initiatedBy,
      decision,
      rationale,
    });
  }

  return NextResponse.json({
    ok: true,
    itemId,
    status: updatedItem.status,
    approvalsCount: updatedApprovals.length,
    requiredApprovals: 2,
    completedAt: updatedItem.completedAt ?? null,
  });
}

export const POST = withGuard(handler);
