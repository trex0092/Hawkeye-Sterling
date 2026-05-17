// Four-eyes approval queue. Replaces the native window.prompt() approver
// flow used by the screening detail panel for STR / freeze / decline /
// EDD-uplift / escalation actions.
//
// Storage layout: blob key `four-eyes/<id>` → FourEyesItem JSON. The MLRO
// page (/screening/four-eyes) lists the queue, approves or rejects each
// item, and the original action only fires after a second operator's
// approval.
//
// Routes:
//   GET    /api/four-eyes              → list (filtered by ?status=pending)
//   POST   /api/four-eyes              → enqueue
//   PATCH  /api/four-eyes?id=<id>      → approve / reject
//   DELETE /api/four-eyes?id=<id>      → remove (auditable; usually leave it)

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { del, getJson, listKeys, setJson } from "@/lib/server/store";
import { getAnthropicClient } from "@/lib/server/llm";
// enforce is provided by withGuard; no direct import needed here.
import type { FourEyesAction, FourEyesItem, FourEyesStatus } from "@/lib/types";
import { asanaGids } from "@/lib/server/asanaConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/;
const MAX_ID_LENGTH = 96;
const ALLOWED_ACTIONS: ReadonlySet<FourEyesAction> = new Set([
  "str", "freeze", "decline", "edd-uplift", "escalate",
]);
const ALLOWED_STATUSES: ReadonlySet<FourEyesStatus> = new Set([
  "pending", "approved", "rejected", "expired",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function safeId(v: unknown): string | null {
  const s = stringField(v);
  if (!s || s.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(s)) return null;
  return s;
}

interface ApprovalSummary {
  aiSummary: string;
  aiRegulatoryAnchor: string;
  aiRiskLevel: "critical" | "high" | "medium" | "low";
}

async function generateApprovalSummary(
  action: string,
  subjectName: string,
  reason: string,
  initiatedBy: string,
): Promise<ApprovalSummary | null> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;

  const userContent = [
    `Action: ${action}`,
    `Subject: ${subjectName}`,
    `Reason: ${reason}`,
    `Initiated by: ${initiatedBy}`,
  ].join("\n");

  const client = getAnthropicClient(apiKey, 10_000);
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    system: [{ type: "text" as const, text: 'You are an AML four-eyes approval assessor. Return ONLY this JSON: { "aiSummary": "string", "aiRegulatoryAnchor": "string", "aiRiskLevel": "critical|high|medium|low" }. aiSummary = 1 sentence: what this action means for the subject and why a second approver should care. aiRegulatoryAnchor = the specific UAE/FATF regulation that requires this action (e.g. \'FDL 10/2025 Art.22 — STR filing obligation\'). aiRiskLevel = the risk level of the action.', cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user", content: userContent }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(stripped) as ApprovalSummary;
  } catch {
    return null;
  }
}

const OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 h

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  // Default to pending queue; caller can override with ?status=approved|rejected|expired
  const wantStatus = url.searchParams.get("status")?.trim() ?? "pending";
  const wantCaseId = url.searchParams.get("caseId")?.trim();
  let keys: string[];
  try {
    keys = await listKeys("four-eyes/");
  } catch (err) {
    console.warn("[hawkeye] four-eyes GET listKeys failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: true, pending: [], total: 0, items: [] }, { headers: {} });
  }
  const loaded = await Promise.all(
    keys.map((k) => getJson<FourEyesItem>(k).catch(() => null)),
  );
  let items = loaded.filter((s): s is FourEyesItem => s !== null);
  if (ALLOWED_STATUSES.has(wantStatus as FourEyesStatus)) {
    items = items.filter((i) => i.status === wantStatus);
  }
  if (wantCaseId) {
    items = items.filter(
      (i) => i.caseId === wantCaseId || i.subjectId === wantCaseId,
    );
  }
  // Newest first.
  items.sort((a, b) => b.initiatedAt.localeCompare(a.initiatedAt));

  // Flag items that have been pending longer than 24 hours.
  const now = Date.now();
  const enriched = items.map((i) => {
    const age = now - new Date(i.initiatedAt).getTime();
    return i.status === "pending" && age > OVERDUE_THRESHOLD_MS
      ? { ...i, overdue: true, overdueHours: Math.floor(age / 3_600_000) }
      : i;
  });

  return NextResponse.json(
    { ok: true, pending: enriched, total: enriched.length, items: enriched },
    { headers: {} },
  );
}

async function handlePost(req: Request): Promise<NextResponse> {
  // Auth is already enforced by withGuard — no second enforce() call needed.
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }
  // Accept both field names used in governance docs (actor/rationale/caseId)
  // and the internal names (initiatedBy/reason/subjectId).
  const subjectId = safeId(raw["subjectId"] ?? raw["caseId"]);
  const subjectName = stringField(raw["subjectName"]);
  const actionRaw = stringField(raw["action"]);
  const initiatedBy = stringField(raw["initiatedBy"] ?? raw["actor"]) ?? "analyst";
  const reason = stringField(raw["reason"] ?? raw["rationale"]) ?? "";
  if (!subjectId || !subjectName) {
    return NextResponse.json(
      { ok: false, error: "subjectId (or caseId) + subjectName required" },
      { status: 400 },
    );
  }
  if (!actionRaw || !ALLOWED_ACTIONS.has(actionRaw as FourEyesAction)) {
    return NextResponse.json({ ok: false, error: `action must be one of ${[...ALLOWED_ACTIONS].join(", ")}` }, { status: 400 });
  }

  // Duplicate-actor check: prevent the same person from submitting multiple
  // entries for the same subject (UAE FDL 10/2025 Art.16 — two DISTINCT
  // actors required). This is a pre-write guard; PATCH /four-eyes?id also
  // enforces initiatedBy ≠ approvedBy at approval time.
  const existingKeys = await listKeys("four-eyes/").catch(() => [] as string[]);
  const existingItems = (await Promise.all(
    existingKeys.map((k) => getJson<FourEyesItem>(k).catch(() => null)),
  )).filter((i): i is FourEyesItem => i !== null);
  const alreadySubmitted = existingItems.some(
    (i) => i.subjectId === subjectId && i.initiatedBy === initiatedBy && i.status === "pending",
  );
  if (alreadySubmitted) {
    return NextResponse.json(
      {
        ok: false,
        error: "duplicate_approver",
        message: `${initiatedBy} has already submitted a pending four-eyes entry for this subject. Two distinct actors are required. UAE FDL 10/2025 Art.16.`,
      },
      { status: 409 },
    );
  }

  // Capture explicit caseId if provided (may differ from subjectId).
  const explicitCaseId = safeId(raw["caseId"]);
  // Capture actor alias if provided (for external API compat).
  const actorAlias = stringField(raw["actor"]);

  const id = `fe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: FourEyesItem = {
    id,
    subjectId,
    ...(explicitCaseId ? { caseId: explicitCaseId } : {}),
    subjectName,
    action: actionRaw as FourEyesAction,
    initiatedBy,
    ...(actorAlias ? { actor: actorAlias } : {}),
    initiatedAt: new Date().toISOString(),
    reason,
    status: "pending",
    ...(stringField(raw["contextUrl"]) ? { contextUrl: stringField(raw["contextUrl"])! } : {}),
  };

  // AI approval summary — enriches item before storage, graceful degradation
  const aiEnrichment = await generateApprovalSummary(
    item.action,
    item.subjectName,
    item.reason,
    item.initiatedBy,
  ).catch((err: unknown) => {
    console.warn("[hawkeye] four-eyes AI enrichment failed — item stored without aiSummary:", err);
    return null;
  });

  const enrichedItem: FourEyesItem & {
    aiSummary?: string;
    aiRegulatoryAnchor?: string;
    aiRiskLevel?: string;
  } = {
    ...item,
    ...(aiEnrichment ?? {}),
  };

  await setJson(`four-eyes/${id}`, enrichedItem);

  // Write audit chain entry for the enqueue action (fire-and-forget).
  void writeAuditChainEntry({
    event: "four_eyes.enqueued",
    actor: initiatedBy,
    caseId: enrichedItem.caseId ?? enrichedItem.subjectId,
    itemId: id,
    subjectName: enrichedItem.subjectName,
    fourEyesAction: enrichedItem.action,
    reason: enrichedItem.reason,
  });

  return NextResponse.json({ ok: true, item: enrichedItem }, { headers: {} });
}

const ACTION_LABEL_MAP: Record<FourEyesAction, string> = {
  str: "STR draft",
  freeze: "Freeze relationship",
  decline: "Decline onboarding",
  "edd-uplift": "Uplift to EDD",
  escalate: "Escalate to MLRO",
};

async function reportToAsana(item: FourEyesItem, decision: "approve" | "reject", operator: string): Promise<string | null> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) return null;

  const projectGid = asanaGids.fourEyes();

  const date = new Date().toISOString().slice(0, 10);
  const decisionLabel = decision === "approve" ? "APPROVED" : "REJECTED";
  const actionLabel = ACTION_LABEL_MAP[item.action];

  const taskName = `[FOUR-EYES ${decisionLabel}] ${item.subjectName} — ${actionLabel} · ${date}`;

  const lines = [
    `FOUR-EYES DECISION RECORD`,
    ``,
    `Subject         : ${item.subjectName}`,
    `Subject ID      : ${item.subjectId}`,
    `Action          : ${actionLabel}`,
    `Decision        : ${decisionLabel}`,
    `Signed by       : ${operator}`,
    `Initiated by    : ${item.initiatedBy}`,
    `Initiated at    : ${item.initiatedAt}`,
    `Decided at      : ${new Date().toISOString()}`,
  ];
  if (item.reason) lines.push(`Reason          : ${item.reason}`);
  if (decision === "reject" && item.rejectionReason) lines.push(`Rejection reason: ${item.rejectionReason}`);
  if (item.contextUrl) lines.push(`Context URL     : ${item.contextUrl}`);
  lines.push(``);
  lines.push(`Legal basis     : FATF R.28 · FDL 10/2025 Art.22 · four-eyes principle`);

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
    const payload = (await res.json().catch((err: unknown) => {
      console.warn("[hawkeye] four-eyes Asana POST response parse failed:", err);
      return null;
    })) as { data?: { gid?: string; permalink_url?: string }; errors?: Array<{ message?: string }> } | null;
    // Audit DR-13: previously returned just permalink_url. If Asana
    // returned 200 with no task gid (soft validation error), the caller
    // treated the decision as Asana-linked when no task actually existed.
    // Require gid before declaring the link valid; log soft errors so ops
    // can triage the project/workspace config.
    if (!res.ok || !payload?.data?.gid) {
      const errMessages = payload?.errors?.map((e) => e.message).filter(Boolean).join("; ");
      console.warn(
        `[hawkeye] four-eyes Asana POST did not create a task — HTTP ${res.status}` +
          (errMessages ? ` errors: ${errMessages}` : "") +
          ". Decision logged locally without Asana mirror.",
      );
      return null;
    }
    return payload.data.permalink_url ?? null;
  } catch (err) {
    console.warn("[hawkeye] four-eyes reportToAsana threw — decision logged locally without Asana task:", err);
    return null;
  }
}

async function handlePatch(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = safeId(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 , headers: {} });
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: {} });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 , headers: {} });
  }
  const action = stringField(raw["decision"]); // "approve" | "reject"
  const operator = stringField(raw["operator"]);
  if (!operator) return NextResponse.json({ ok: false, error: "operator required" }, { status: 400 , headers: {} });
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: false, error: "decision must be 'approve' or 'reject'" }, { status: 400 , headers: {} });
  }
  const existing = await getJson<FourEyesItem>(`four-eyes/${id}`);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 , headers: {} });
  if (existing.status !== "pending") {
    return NextResponse.json({ ok: false, error: `item already ${existing.status}` }, { status: 409 , headers: {} });
  }
  if (operator === existing.initiatedBy) {
    return NextResponse.json({ ok: false, error: "second approver must be different from initiator (FATF four-eyes)" }, { status: 403 , headers: {} });
  }
  const now = new Date().toISOString();
  const updated: FourEyesItem =
    action === "approve"
      ? { ...existing, status: "approved", approvedBy: operator, approvedAt: now }
      : { ...existing, status: "rejected", rejectedBy: operator, rejectedAt: now,
          ...(stringField(raw["rejectionReason"]) ? { rejectionReason: stringField(raw["rejectionReason"])! } : {}) };
  await setJson(`four-eyes/${id}`, updated);

  // Write audit chain entry — fire-and-forget, must not block the response.
  void writeAuditChainEntry({
    event: `four_eyes.${action}d`,
    actor: operator,
    caseId: updated.caseId ?? updated.subjectId,
    itemId: id,
    subjectName: updated.subjectName,
    fourEyesAction: updated.action,
    initiatedBy: updated.initiatedBy,
    ...(action === "reject" && updated.rejectionReason ? { rejectionReason: updated.rejectionReason } : {}),
  });

  // Report to Asana Four-Eyes board — non-blocking, best effort
  const asanaTaskUrl = await reportToAsana(updated, action, operator).catch((err: unknown) => {
    console.warn("[hawkeye] four-eyes Asana report failed — decision logged locally but no Asana task created:", err);
    return null;
  });

  return NextResponse.json({ ok: true, item: updated, ...(asanaTaskUrl ? { asanaTaskUrl } : {}) });
}

async function handleDelete(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = safeId(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  await del(`four-eyes/${id}`);
  return NextResponse.json({ ok: true });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
export const PATCH = withGuard(handlePatch);
export const DELETE = withGuard(handleDelete);
