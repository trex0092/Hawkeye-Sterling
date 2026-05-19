// GET  /api/pkyc          — list all perpetual-KYC subjects
// POST /api/pkyc          — enroll a subject in perpetual monitoring
// DELETE /api/pkyc?id=... — remove a subject from monitoring
//
// Controls: 3.01 (CDD ongoing), 3.04 (periodic review), 20.09 (telemetry)

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import {
  listSubjects, getSubject, saveSubject, deleteSubject,
  type PKycSubject, type PKycCadence,
} from "./_store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function nextRunAt(cadence: PKycCadence, from = new Date()): string {
  const d = new Date(from);
  switch (cadence) {
    case "daily":     d.setUTCDate(d.getUTCDate() + 1); break;
    case "weekly":    d.setUTCDate(d.getUTCDate() + 7); break;
    case "monthly":
    case "quarterly":
    case "annual": {
      // setUTCMonth(m+N) overflows when the source day-of-month doesn't exist
      // in the target month (e.g. Jan 31 + 1 month → Mar 2, skipping Feb).
      // Clamp to the last day of the target month to stay in-month.
      const monthsToAdd = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
      const srcDay = from.getUTCDate();
      const targetTotalMonths = d.getUTCFullYear() * 12 + d.getUTCMonth() + monthsToAdd;
      const targetYear = Math.floor(targetTotalMonths / 12);
      const targetMonth = targetTotalMonths % 12;
      const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      d.setUTCFullYear(targetYear, targetMonth, Math.min(srcDay, lastDayOfTarget));
      break;
    }
  }
  return d.toISOString();
}

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const subject = await getSubject(id);
    if (!subject) return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });
    return NextResponse.json({ ok: true, subject });
  }

  const subjects = await listSubjects();
  const stats = {
    total: subjects.length,
    active: subjects.filter((s) => s.status === "active").length,
    pendingReview: subjects.filter((s) => s.status === "pending_review").length,
    dueNow: subjects.filter((s) => s.status === "active" && new Date(s.nextRunAt) <= new Date()).length,
  };

  return NextResponse.json({ ok: true, stats, subjects });
}

async function handlePost(req: Request): Promise<NextResponse> {
  let body: Partial<PKycSubject>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  if (!body.name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  if (body.name.length > 500) return NextResponse.json({ ok: false, error: "name exceeds 500-character limit" }, { status: 400 });

  const id = body.id ?? `pkyc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const cadence: PKycCadence = (body.cadence ?? "monthly") as PKycCadence;

  const subject: PKycSubject = {
    id,
    name: body.name,
    entityType: body.entityType,
    jurisdiction: body.jurisdiction,
    nationality: body.nationality,
    dob: body.dob,
    aliases: body.aliases,
    caseId: body.caseId,
    cadence,
    status: "active",
    enrolledAt: now,
    lastRunAt: null,
    nextRunAt: nextRunAt(cadence),
    lastBand: null,
    lastComposite: null,
    lastHits: 0,
    runCount: 0,
    alertCount: 0,
    notes: body.notes,
    mlro: body.mlro,
  };

  await saveSubject(subject);
  return NextResponse.json({ ok: true, subject }, { status: 201 });
}

async function handleDelete(req: Request): Promise<NextResponse> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id query param required" }, { status: 400 });

  const subject = await getSubject(id);
  if (!subject) return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });

  await deleteSubject(id);
  return NextResponse.json({ ok: true, deleted: id });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
export const DELETE = withGuard(handleDelete);
