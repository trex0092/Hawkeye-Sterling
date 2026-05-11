// GET  /api/cdd-reviews           — list all CDD review records for the tenant
// POST /api/cdd-reviews           — create or update a CDD review record
// DELETE /api/cdd-reviews?id=<id> — delete a CDD review record
//
// Complements /api/cdd-adequacy (AI adequacy scoring) with persistent storage
// of review outcomes so MLRO has a full audit trail of CDD refresh cadences,
// overdue subjects, and adequacy scores under FDL 10/2025 Art.11 + FATF R.10.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditEvent } from "@/lib/audit";
import {
  listCddReviews,
  getCddReview,
  saveCddReview,
  deleteCddReview,
  newCddReviewId,
  computeNextReviewDate,
  computeDaysOverdue,
  type CddReviewRecord,
} from "@/lib/server/cdd-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const record = await getCddReview(tenant, id);
    if (!record) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, record }, { headers: gate.headers });
  }

  const reviews = await listCddReviews(tenant);
  const overdue = reviews.filter((r) => r.status === "overdue").length;
  return NextResponse.json(
    { ok: true, tenant, count: reviews.length, overdue, reviews },
    { headers: gate.headers },
  );
}

interface CddReviewInput {
  id?: string;
  subject: string;
  tier: "high" | "medium" | "standard";
  reviewDate: string;
  notes?: string;
  outcome?: "adequate" | "marginal" | "inadequate";
  status?: CddReviewRecord["status"];
  adequacyScore?: number;
  enhancedMeasuresRequired?: boolean;
  gaps?: string[];
  recommendedActions?: string[];
  caseId?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: CddReviewInput;
  try {
    body = (await req.json()) as CddReviewInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 });
  }
  if (!body.tier || !["high", "medium", "standard"].includes(body.tier)) {
    return NextResponse.json(
      { ok: false, error: "tier must be high | medium | standard" },
      { status: 400 },
    );
  }
  if (!body.reviewDate || isNaN(new Date(body.reviewDate).getTime())) {
    return NextResponse.json(
      { ok: false, error: "reviewDate required (ISO date, e.g. 2025-03-01)" },
      { status: 400 },
    );
  }

  const nextReviewDate = computeNextReviewDate(body.tier, body.reviewDate);
  const daysOverdue = computeDaysOverdue(nextReviewDate);
  const existing = body.id ? await getCddReview(tenant, body.id) : null;
  const now = new Date().toISOString();

  const status: CddReviewRecord["status"] =
    body.status === "completed" || body.status === "in_progress"
      ? body.status
      : daysOverdue > 0
        ? "overdue"
        : "due";

  const record: CddReviewRecord = {
    id: body.id ?? newCddReviewId(),
    tenantId: tenant,
    subject: body.subject.trim(),
    tier: body.tier,
    reviewDate: body.reviewDate,
    nextReviewDate,
    daysOverdue,
    status,
    notes: body.notes ?? "",
    outcome: body.outcome,
    adequacyScore: body.adequacyScore,
    enhancedMeasuresRequired: body.enhancedMeasuresRequired,
    gaps: body.gaps,
    recommendedActions: body.recommendedActions,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await saveCddReview(tenant, record);
  writeAuditEvent(
    "mlro",
    "cdd.review.saved",
    `${record.subject} — tier:${record.tier} status:${record.status} daysOverdue:${record.daysOverdue}`,
  );

  return NextResponse.json(
    { ok: true, record },
    { status: existing ? 200 : 201, headers: gate.headers },
  );
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "id query param required" }, { status: 400 });
  }

  const existing = await getCddReview(tenant, id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  await deleteCddReview(tenant, id);
  writeAuditEvent("mlro", "cdd.review.deleted", `${existing.subject} (${id})`);
  return NextResponse.json({ ok: true, deleted: id }, { headers: gate.headers });
}
