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
import { del, getJson, listKeys, setJson } from "@/lib/server/store";
import type { FourEyesAction, FourEyesItem, FourEyesStatus } from "@/lib/types";

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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:
        'You are an AML four-eyes approval assessor. Return ONLY this JSON: { "aiSummary": "string", "aiRegulatoryAnchor": "string", "aiRiskLevel": "critical|high|medium|low" }. aiSummary = 1 sentence: what this action means for the subject and why a second approver should care. aiRegulatoryAnchor = the specific UAE/FATF regulation that requires this action (e.g. \'FDL 10/2025 Art.22 — STR filing obligation\'). aiRiskLevel = the risk level of the action.',
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    content?: { type: string; text: string }[];
  };
  const text = data?.content?.[0]?.text ?? "";

  // Strip markdown fences before parsing
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return JSON.parse(stripped) as ApprovalSummary;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const wantStatus = url.searchParams.get("status")?.trim();
  const keys = await listKeys("four-eyes/");
  const loaded = await Promise.all(keys.map((k) => getJson<FourEyesItem>(k)));
  let items = loaded.filter((s): s is FourEyesItem => s !== null);
  if (wantStatus && ALLOWED_STATUSES.has(wantStatus as FourEyesStatus)) {
    items = items.filter((i) => i.status === wantStatus);
  }
  // Newest first.
  items.sort((a, b) => b.initiatedAt.localeCompare(a.initiatedAt));
  return NextResponse.json({ ok: true, count: items.length, items });
}

async function handlePost(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }
  const subjectId = safeId(raw["subjectId"]);
  const subjectName = stringField(raw["subjectName"]);
  const actionRaw = stringField(raw["action"]);
  const initiatedBy = stringField(raw["initiatedBy"]) ?? "analyst";
  const reason = stringField(raw["reason"]) ?? "";
  if (!subjectId || !subjectName) {
    return NextResponse.json({ ok: false, error: "subjectId + subjectName required" }, { status: 400 });
  }
  if (!actionRaw || !ALLOWED_ACTIONS.has(actionRaw as FourEyesAction)) {
    return NextResponse.json({ ok: false, error: `action must be one of ${[...ALLOWED_ACTIONS].join(", ")}` }, { status: 400 });
  }
  const id = `fe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: FourEyesItem = {
    id,
    subjectId,
    subjectName,
    action: actionRaw as FourEyesAction,
    initiatedBy,
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
  ).catch(() => null);

  const enrichedItem: FourEyesItem & {
    aiSummary?: string;
    aiRegulatoryAnchor?: string;
    aiRiskLevel?: string;
  } = {
    ...item,
    ...(aiEnrichment ?? {}),
  };

  await setJson(`four-eyes/${id}`, enrichedItem);
  return NextResponse.json({ ok: true, item: enrichedItem });
}

async function handlePatch(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = safeId(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }
  const action = stringField(raw["decision"]); // "approve" | "reject"
  const operator = stringField(raw["operator"]);
  if (!operator) return NextResponse.json({ ok: false, error: "operator required" }, { status: 400 });
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: false, error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }
  const existing = await getJson<FourEyesItem>(`four-eyes/${id}`);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (existing.status !== "pending") {
    return NextResponse.json({ ok: false, error: `item already ${existing.status}` }, { status: 409 });
  }
  if (operator === existing.initiatedBy) {
    return NextResponse.json({ ok: false, error: "second approver must be different from initiator (FATF four-eyes)" }, { status: 403 });
  }
  const now = new Date().toISOString();
  const updated: FourEyesItem =
    action === "approve"
      ? { ...existing, status: "approved", approvedBy: operator, approvedAt: now }
      : { ...existing, status: "rejected", rejectedBy: operator, rejectedAt: now,
          ...(stringField(raw["rejectionReason"]) ? { rejectionReason: stringField(raw["rejectionReason"])! } : {}) };
  await setJson(`four-eyes/${id}`, updated);
  return NextResponse.json({ ok: true, item: updated });
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
