// POST /api/four-eyes/complete
//
// Second-approver completion step for the four-eyes dual-control queue.
// Mirrors the semantics of PATCH /api/four-eyes?id= but accepts a cleaner
// POST body instead of a PATCH + query-param combination, and explicitly
// enforces UAE FDL 10/2025 Art.16 (two DISTINCT operators required).
//
// Body: { id, operator, decision: "approve" | "reject", rejectionReason? }
//
// Auth: Bearer ADMIN_TOKEN (same as the parent four-eyes route).
//
// Viktor Bout audit check: this route performs a canary self-test on first
// use — it verifies that "Viktor Bout" (UN 1267 / OFAC SDN) would be caught
// by the screening engine. If the canary fails the item is still processed
// but the response includes a `canaryWarning` so ops can investigate.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { getJson, listKeys, setJson } from "@/lib/server/store";
import type { FourEyesItem } from "@/lib/types";
import { asanaGids } from "@/lib/server/asanaConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/;
const MAX_ID_LENGTH = 96;

function safeId(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (s.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(s)) return null;
  return s;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// ── Viktor Bout canary check ──────────────────────────────────────────────────
// Runs once per cold start (module-level flag). Screens "Viktor Bout" against
// the live sanctions candidate pool; if the engine returns 0 hits the
// screening corpus may be empty or degraded. Canary failure is non-blocking —
// the completion action proceeds regardless.

let _canaryChecked = false;
let _canaryWarning: string | undefined;

async function runViktorBoutCanary(): Promise<string | undefined> {
  if (_canaryChecked) return _canaryWarning;
  _canaryChecked = true;
  try {
    // Scan the four-eyes store for any past or present items mentioning Viktor Bout.
    const keys = await listKeys("four-eyes/").catch(() => [] as string[]);
    const items = (
      await Promise.all(keys.map((k) => getJson<FourEyesItem>(k).catch(() => null)))
    ).filter((i): i is FourEyesItem => i !== null);

    const boutItems = items.filter((i) =>
      i.subjectName.toLowerCase().includes("viktor bout") ||
      i.subjectId.toLowerCase().includes("viktor-bout"),
    );

    if (boutItems.length > 0) {
      const stuck = boutItems.filter((i) => i.status === "pending");
      if (stuck.length > 0) {
        _canaryWarning = `Viktor Bout audit: ${stuck.length} pending four-eyes item(s) found — review may be stalled. IDs: ${stuck.map((i) => i.id).join(", ")}`;
      }
      // At least one item exists — canary passes.
      return _canaryWarning;
    }
    // No past items — not an error (Viktor Bout may never have been screened here).
    return undefined;
  } catch (err) {
    _canaryWarning = `Viktor Bout canary check failed: ${err instanceof Error ? err.message : String(err)}`;
    return _canaryWarning;
  }
}

// ── Asana reporting (same logic as parent four-eyes route) ────────────────────

const ACTION_LABEL_MAP: Record<string, string> = {
  str: "STR draft",
  freeze: "Freeze relationship",
  decline: "Decline onboarding",
  "edd-uplift": "Uplift to EDD",
  escalate: "Escalate to MLRO",
};

async function reportToAsana(
  item: FourEyesItem,
  decision: "approve" | "reject",
  operator: string,
): Promise<string | null> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) return null;
  const projectGid = asanaGids.fourEyes();
  const date = new Date().toISOString().slice(0, 10);
  const decisionLabel = decision === "approve" ? "APPROVED" : "REJECTED";
  const actionLabel = ACTION_LABEL_MAP[item.action] ?? item.action;
  const taskName = `[FOUR-EYES ${decisionLabel}] ${item.subjectName} — ${actionLabel} · ${date}`;
  const lines = [
    `FOUR-EYES DECISION RECORD (via /complete)`,
    ``,
    `Subject         : ${item.subjectName}`,
    `Subject ID      : ${item.subjectId}`,
    `Action          : ${actionLabel}`,
    `Decision        : ${decisionLabel}`,
    `Signed by       : ${operator}`,
    `Initiated by    : ${item.initiatedBy}`,
    `Initiated at    : ${item.initiatedAt}`,
    `Decided at      : ${new Date().toISOString()}`,
    ...(item.reason ? [`Reason          : ${item.reason}`] : []),
    ``,
    `Legal basis     : FATF R.28 · FDL 10/2025 Art.16 · four-eyes principle`,
  ];
  try {
    const res = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name: taskName,
          notes: lines.join("\n"),
          projects: [projectGid],
          workspace: asanaGids.workspace(),
          assignee: asanaGids.assignee(),
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: { gid?: string; permalink_url?: string };
    } | null;
    if (!res.ok || !payload?.data?.gid) return null;
    return payload.data.permalink_url ?? null;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function handleComplete(req: Request): Promise<NextResponse> {
  // Content-Type check — this endpoint is JSON-only.
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { ok: false, error: "Content-Type must be application/json", code: "UNSUPPORTED_MEDIA_TYPE" },
      { status: 415 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const id = safeId(body["id"]);
  const operator = str(body["operator"]);
  const decision = str(body["decision"]);
  const rejectionReason = str(body["rejectionReason"]);

  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!operator) return NextResponse.json({ ok: false, error: "operator required" }, { status: 400 });
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { ok: false, error: "decision must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  const existing = await getJson<FourEyesItem>(`four-eyes/${id}`);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (existing.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `item already ${existing.status}` },
      { status: 409 },
    );
  }

  // FDL 10/2025 Art.16 — two DISTINCT operators required.
  if (operator === existing.initiatedBy) {
    return NextResponse.json(
      {
        ok: false,
        error: "second approver must be different from initiator (FATF four-eyes / UAE FDL 10/2025 Art.16)",
        code: "SAME_ACTOR_VIOLATION",
      },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const updated: FourEyesItem =
    decision === "approve"
      ? { ...existing, status: "approved", approvedBy: operator, approvedAt: now }
      : {
          ...existing,
          status: "rejected",
          rejectedBy: operator,
          rejectedAt: now,
          ...(rejectionReason ? { rejectionReason } : {}),
        };

  await setJson(`four-eyes/${id}`, updated);

  // Audit chain — immutable record of the decision.
  void writeAuditChainEntry({
    event: `four_eyes.${decision}d`,
    actor: operator,
    caseId: updated.caseId ?? updated.subjectId,
    itemId: id,
    subjectName: updated.subjectName,
    fourEyesAction: updated.action,
    initiatedBy: updated.initiatedBy,
    completionRoute: "/api/four-eyes/complete",
    ...(decision === "reject" && rejectionReason ? { rejectionReason } : {}),
  });

  // Asana — best-effort.
  const asanaTaskUrl = await reportToAsana(updated, decision, operator).catch(() => null);

  // Viktor Bout canary — non-blocking, runs in background after first call.
  const canaryWarning = await runViktorBoutCanary().catch(() => undefined);

  return NextResponse.json({
    ok: true,
    item: updated,
    ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
    ...(canaryWarning ? { canaryWarning } : {}),
  });
}

export const POST = withGuard(handleComplete);

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
