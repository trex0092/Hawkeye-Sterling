// GET    /api/goaml-submissions           — list submission records for tenant
// GET    /api/goaml-submissions?ref=<ref> — get single record by reportRef
// POST   /api/goaml-submissions           — update submission status / add FIU receipt
// DELETE /api/goaml-submissions?ref=<ref> — remove record
//
// Records are created automatically when /api/goaml generates an envelope
// (status: "draft"). MLRO then updates the record after FIU portal submission
// (status: "submitted") and again when FIU sends an acknowledgment
// (status: "acknowledged").
//
// Retry logic: POST with status "submitted" increments retryCount when
// a prior submission already exists.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditEvent } from "@/lib/audit";
import {
  listGoAmlSubmissions,
  getGoAmlSubmission,
  saveGoAmlSubmission,
  deleteGoAmlSubmission,
  type GoAmlSubmissionRecord,
  type SubmissionStatus,
} from "@/lib/server/goaml-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_STATUSES = new Set<SubmissionStatus>([
  "draft", "submitted", "acknowledged", "rejected", "failed",
]);

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");

  if (ref) {
    const record = await getGoAmlSubmission(tenant, ref);
    if (!record) return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: gate.headers });
    return NextResponse.json({ ok: true, record , headers: gate.headers });
  }

  const submissions = await listGoAmlSubmissions(tenant);
  const pending = submissions.filter((s) => s.status === "draft" || s.status === "submitted").length;
  return NextResponse.json(
    { ok: true, tenant, count: submissions.length, pending, submissions },
    { headers: gate.headers },
  );
}

interface UpdateInput {
  reportRef: string;
  status: SubmissionStatus;
  submittedAt?: string;
  acknowledgedAt?: string;
  fiuResponseCode?: string;
  fiuAcknowledgmentNumber?: string;
  notes?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: UpdateInput;
  try {
    body = (await req.json()) as UpdateInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  if (!body.reportRef?.trim()) {
    return NextResponse.json({ ok: false, error: "reportRef required" }, { status: 400 , headers: gate.headers });
  }
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { ok: false, error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` },
      { status: 400, headers: gate.headers }
    );
  }

  const existing = await getGoAmlSubmission(tenant, body.reportRef);
  // Forward-only status transition: prevent regressing terminal states
  const STATUS_RANK: Record<string, number> = { draft: 0, submitted: 1, acknowledged: 2, rejected: 2, failed: 2 };
  if (existing && (STATUS_RANK[existing.status] ?? 0) > (STATUS_RANK[body.status] ?? 0)) {
    return NextResponse.json(
      { ok: false, error: `Cannot regress status from '${existing.status}' to '${body.status}'` },
      { status: 409, headers: gate.headers },
    );
  }
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: `submission ${body.reportRef} not found — it is created automatically by /api/goaml` },
      { status: 404, headers: gate.headers }
    );
  }

  const isResubmit = body.status === "submitted" && existing.status === "submitted";
  const now = new Date().toISOString();

  const updated: GoAmlSubmissionRecord = {
    ...existing,
    status: body.status,
    submittedAt: body.submittedAt ?? (body.status === "submitted" ? now : existing.submittedAt),
    acknowledgedAt:
      body.acknowledgedAt ?? (body.status === "acknowledged" ? now : existing.acknowledgedAt),
    fiuResponseCode: body.fiuResponseCode ?? existing.fiuResponseCode,
    fiuAcknowledgmentNumber: body.fiuAcknowledgmentNumber ?? existing.fiuAcknowledgmentNumber,
    notes: body.notes ?? existing.notes,
    retryCount: isResubmit ? existing.retryCount + 1 : existing.retryCount,
    lastRetryAt: isResubmit ? now : existing.lastRetryAt,
  };

  await saveGoAmlSubmission(tenant, updated);
  try {
    writeAuditEvent(
      "mlro",
      `goaml.submission.${body.status}`,
      `${body.reportRef} — ${existing.reportCode} / ${existing.subjectName}${isResubmit ? ` (retry #${updated.retryCount})` : ""}`,
    );
  } catch { /* browser-only audit — best-effort on server */ }

  return NextResponse.json({ ok: true, record: updated , headers: gate.headers });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref?.trim()) {
    return NextResponse.json({ ok: false, error: "ref query param required" }, { status: 400 , headers: gate.headers });
  }

  const existing = await getGoAmlSubmission(tenant, ref);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: gate.headers });
  }

  await deleteGoAmlSubmission(tenant, ref);
  try { writeAuditEvent("mlro", "goaml.submission.deleted", `${ref} (${existing.reportCode} / ${existing.subjectName})`); } catch { /* browser-only audit */ }
  return NextResponse.json({ ok: true, deleted: ref , headers: gate.headers });
}
