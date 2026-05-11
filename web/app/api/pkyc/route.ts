// GET  /api/pkyc          — list all perpetual-KYC subjects
// POST /api/pkyc          — enroll a subject in perpetual monitoring
// DELETE /api/pkyc?id=... — remove a subject from monitoring
//
// pKYC (Perpetual KYC) = continuous CDD lifecycle management.
// Each enrolled subject is rescreened on its assigned cadence, and any
// material change in risk profile (new hit, band change, PEP reclassification)
// is queued for MLRO review and recorded in the audit trail.
//
// Controls: 3.01 (CDD ongoing), 3.04 (periodic review), 20.09 (telemetry)

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export type PKycCadence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export type PKycStatus = "active" | "pending_review" | "suspended" | "archived";
export type PKycRiskBand = "clear" | "low" | "medium" | "high" | "critical";

export interface PKycSubject {
  id: string;
  name: string;
  entityType?: string;
  jurisdiction?: string;
  nationality?: string;
  dob?: string;
  aliases?: string[];
  caseId?: string;
  cadence: PKycCadence;
  status: PKycStatus;
  enrolledAt: string;
  lastRunAt: string | null;
  nextRunAt: string;
  lastBand: PKycRiskBand | null;
  lastComposite: number | null;
  lastHits: number;
  runCount: number;
  alertCount: number;
  notes?: string;
  mlro?: string;
}

export interface PKycDelta {
  id: string;
  subjectId: string;
  subjectName: string;
  detectedAt: string;
  kind: "new_hit" | "band_change" | "pep_reclassified" | "adverse_media" | "clear";
  from?: string;
  to?: string;
  detail: string;
  acknowledged: boolean;
}

// ── Blobs ────────────────────────────────────────────────────────────────────

async function getStore() {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return null;
    return mod.getStore({ name: "pkyc" });
  } catch { return null; }
}

export async function listSubjects(): Promise<PKycSubject[]> {
  const store = await getStore();
  if (!store) return [];
  try {
    const listed = await store.list({ prefix: "subject/" });
    const subjects = await Promise.all(
      listed.blobs.map((b: { key: string }) =>
        store.get(b.key, { type: "json" }).catch(() => null)
      )
    );
    return subjects.filter((s): s is PKycSubject => s !== null);
  } catch { return []; }
}

export async function getSubject(id: string): Promise<PKycSubject | null> {
  const store = await getStore();
  if (!store) return null;
  return store.get(`subject/${id}`, { type: "json" }).catch(() => null) as Promise<PKycSubject | null>;
}

export async function saveSubject(subject: PKycSubject): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.setJSON(`subject/${subject.id}`, subject);
}

export async function deleteSubject(id: string): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.delete(`subject/${id}`).catch(() => {});
}

// ── Next-run calculation ──────────────────────────────────────────────────────

function nextRunAt(cadence: PKycCadence, from = new Date()): string {
  const d = new Date(from);
  switch (cadence) {
    case "daily":     d.setUTCDate(d.getUTCDate() + 1); break;
    case "weekly":    d.setUTCDate(d.getUTCDate() + 7); break;
    case "monthly":   d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "quarterly": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "annual":    d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString();
}

// ── GET ───────────────────────────────────────────────────────────────────────

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

// ── POST ──────────────────────────────────────────────────────────────────────

async function handlePost(req: Request): Promise<NextResponse> {
  let body: Partial<PKycSubject>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  if (!body.name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

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

// ── DELETE ────────────────────────────────────────────────────────────────────

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
