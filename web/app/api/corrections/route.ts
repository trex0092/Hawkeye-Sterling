import { NextResponse } from "next/server";
import { getJson, listKeys, setJson } from "@/lib/server/store";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "corrections/";

// 30-day review SLA. Every correction request carries an auto-computed
// dueBy timestamp so the record-management team has a hard deadline
// published alongside the request.
const REVIEW_SLA_DAYS = 30;

export type CorrectionStatus =
  | "received"
  | "under_review"
  | "correction_applied"
  | "record_retained"
  | "escalated";

export interface CorrectionRequest {
  id: string;
  subjectName: string;
  listId?: string;
  listRef?: string;
  requesterName: string;
  requesterEmail: string;
  requesterCapacity: "subject" | "legal_representative" | "data_controller" | "other";
  claim: string;
  evidenceUrls?: string[];
  status: CorrectionStatus;
  submittedAt: string;
  dueBy: string;
  reason?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function newId(): string {
  return `cor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const keys = await listKeys(PREFIX);
  const items: CorrectionRequest[] = [];
  for (const k of keys) {
    const r = await getJson<CorrectionRequest>(k);
    if (!r) continue;
    if (status && r.status !== status) continue;
    items.push(r);
  }
  items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return NextResponse.json({ ok: true, count: items.length, requests: items });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<CorrectionRequest>;
  try {
    body = (await req.json()) as Partial<CorrectionRequest>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body.subjectName || !body.requesterEmail || !body.claim) {
    return NextResponse.json(
      {
        ok: false,
        error: "subjectName, requesterEmail and claim are required",
      },
      { status: 400 },
    );
  }
  const submittedAt = new Date().toISOString();
  const record: CorrectionRequest = {
    id: newId(),
    subjectName: body.subjectName,
    ...(body.listId ? { listId: body.listId } : {}),
    ...(body.listRef ? { listRef: body.listRef } : {}),
    requesterName: body.requesterName ?? "(withheld)",
    requesterEmail: body.requesterEmail,
    requesterCapacity: body.requesterCapacity ?? "subject",
    claim: body.claim,
    ...(body.evidenceUrls ? { evidenceUrls: body.evidenceUrls } : {}),
    status: "received",
    submittedAt,
    dueBy: addDays(submittedAt, REVIEW_SLA_DAYS),
  };
  await setJson(`${PREFIX}${record.id}`, record);
  return NextResponse.json({
    ok: true,
    id: record.id,
    dueBy: record.dueBy,
    slaDays: REVIEW_SLA_DAYS,
    message:
      "Request received. You will receive an updated status within 30 days. Appeals can be filed via /api/corrections/{id}.",
  });
}
