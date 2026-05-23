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
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { getJson, setJson } from "@/lib/server/store";
import { validateString, validateEnum } from "@/lib/server/validate";
import { logRequest } from "@/lib/server/logger";
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handler(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const t0 = Date.now();
  // Actor identity comes from the authenticated API key, not the request body,
  // to prevent impersonation and ensure the self-approval / duplicate-approver
  // guards operate on a trusted identity.
  const actor = (ctx.apiKey.email || ctx.apiKey.name || ctx.apiKey.id).toLowerCase().trim();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    logRequest("/api/four-eyes/approve", "unknown", 400, Date.now() - t0, { error: "invalid_json" });
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!isRecord(raw)) {
    logRequest("/api/four-eyes/approve", "unknown", 400, Date.now() - t0, { error: "body_not_object" });
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }

  // 1. Validate required fields using validate.ts helpers.
  const SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/;
  const itemId = validateString(raw["itemId"], { required: true, maxLength: 96, pattern: SAFE_ID_RE });
  // actor is resolved from authenticated context above — body-supplied actor is ignored.
  const decision = validateEnum(raw["decision"], ["approve", "reject"] as const);
  const rationale = validateString(raw["rationale"], { required: true });

  // Minimum rationale: 20 characters — matches four-eyes-gate.ts enforcement.
  // Prevents trivially empty sign-offs per UAE FDL 10/2025 Art.16.
  const rationaleLength = rationale ? rationale.trim().length : 0;

  if (!itemId || !actor || !decision || !rationale || rationaleLength < 20) {
    logRequest("/api/four-eyes/approve", "unknown", 400, Date.now() - t0, { error: "missing_fields" });
    return NextResponse.json(
      {
        ok: false,
        error: "missing_fields",
        hint: rationaleLength > 0 && rationaleLength < 20
          ? "rationale must be at least 20 characters (provide substantive reasoning)"
          : "itemId, actor, decision ('approve'|'reject'), and rationale are all required and must be non-empty",
      },
      { status: 400 },
    );
  }

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

  // 5. Duplicate approver guard. Actor is already normalized to lowercase-trim above.
  const existingApprovals: ApprovalRecord[] = item.approvals ?? [];
  if (existingApprovals.some((a) => a.actor.toLowerCase().trim() === actor)) {
    return NextResponse.json(
      {
        ok: false,
        error: "duplicate_approver",
        hint: "Same actor cannot approve twice",
      },
      { status: 409 },
    );
  }

  // 6. Self-approval guard — UAE FDL 10/2025 Art.16. Case-insensitive compare
  // so "Alice Smith" cannot bypass the check by approving as "alice smith".
  if (actor === (item.initiatedBy ?? "").toLowerCase().trim()) {
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
    // 11. First approval — item stays pending but the approval is audited so
    //     the chain has an immutable record of who signed first.
    auditEvent = "four_eyes.first_approval";
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
    }).catch((err: unknown) => {
      console.warn("[four-eyes/approve] audit write failed:", err instanceof Error ? err.message : String(err));
    });
  }

  const responseStatus = 200;
  logRequest("/api/four-eyes/approve", itemId, responseStatus, Date.now() - t0, {
    actor,
    decision,
    itemStatus: updatedItem.status,
  });

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
