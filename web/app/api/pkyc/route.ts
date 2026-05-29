// GET  /api/pkyc          — list all perpetual-KYC subjects
// POST /api/pkyc          — enroll a subject in perpetual monitoring
// DELETE /api/pkyc?id=... — remove a subject from monitoring
//
// Controls: 3.01 (CDD ongoing), 3.04 (periodic review), 20.09 (telemetry)

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import {
  listSubjects, getSubject, saveSubject, deleteSubject, nextRunAt,
  type PKycSubject, type PKycCadence,
} from "./_store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

async function handleGet(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const subject = await getSubject(id, ctx.tenantId);
    if (!subject) return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });
    return NextResponse.json({ ok: true, subject });
  }

  const subjects = await listSubjects(ctx.tenantId);
  const stats = {
    total: subjects.length,
    active: subjects.filter((s) => s.status === "active").length,
    pendingReview: subjects.filter((s) => s.status === "pending_review").length,
    dueNow: subjects.filter((s) => s.status === "active" && new Date(s.nextRunAt) <= new Date()).length,
  };

  return NextResponse.json({ ok: true, stats, subjects });
}

async function handlePost(req: Request, ctx: RequestContext): Promise<NextResponse> {
  let body: Partial<PKycSubject>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  if (!body.name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  if (body.name.length > 500) return NextResponse.json({ ok: false, error: "name exceeds 500-character limit" }, { status: 400 });

  const SAFE_ID_RE = /^[a-zA-Z0-9_\-.]+$/;
  if (body.id && (body.id.length > 128 || !SAFE_ID_RE.test(body.id))) {
    return NextResponse.json({ ok: false, error: "id must be alphanumeric/._- and ≤128 chars" }, { status: 400 });
  }
  const id = body.id ?? `pkyc-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const VALID_CADENCES: PKycCadence[] = ["daily", "weekly", "monthly", "quarterly", "annual"];
  if (body.cadence !== undefined && !VALID_CADENCES.includes(body.cadence as PKycCadence)) {
    return NextResponse.json({ ok: false, error: "cadence must be daily | weekly | monthly | quarterly | annual" }, { status: 400 });
  }
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

  await saveSubject(subject, ctx.tenantId);

  // FDL 10/2025 Art.24: pKYC enrollment triggers ongoing CDD monitoring — must be in the tamper-evident chain.
  void writeAuditChainEntry(
    { event: "pkyc.enrolled", subjectId: id, actor: ctx.tenantId },
    ctx.tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, subject }, { status: 201 });
}

async function handleDelete(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id query param required" }, { status: 400 });

  const subject = await getSubject(id, ctx.tenantId);
  if (!subject) return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });

  await deleteSubject(id, ctx.tenantId);

  void writeAuditChainEntry(
    { event: "pkyc.deregistered", subjectId: id, subjectName: subject.name, actor: ctx.tenantId },
    ctx.tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, deleted: id });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
export const DELETE = withGuard(handleDelete);
