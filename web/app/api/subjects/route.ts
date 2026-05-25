// GET  /api/subjects  — list all subject profiles
// POST /api/subjects  — create or update a subject profile

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { listSubjects, upsertSubject, reviewDueSoon, type SubjectProfile } from "@/lib/server/subject-store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const subjects = await listSubjects(tenant);

  const reviewDue = subjects.filter((s) => reviewDueSoon(s));
  const overdue   = subjects.filter((s) => s.nextReviewDate && new Date(s.nextReviewDate) < new Date());

  return NextResponse.json(
    { ok: true, subjects, reviewDueSoon: reviewDue.length, overdue: overdue.length },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const { subjectId, subjectName, currentRiskCategory, dueDiligence, nextReviewDate,
          activeCaseId, lastScreenedAt, isPep, hasStrSarOnRecord, notes } = body;

  if (!subjectId || typeof subjectId !== "string") {
    return NextResponse.json({ ok: false, error: "subjectId required" }, { status: 400, headers: gate.headers });
  }
  if (!subjectName || typeof subjectName !== "string") {
    return NextResponse.json({ ok: false, error: "subjectName required" }, { status: 400, headers: gate.headers });
  }
  if (!currentRiskCategory || !["LOW","MEDIUM","HIGH","CRITICAL"].includes(currentRiskCategory as string)) {
    return NextResponse.json({ ok: false, error: "currentRiskCategory required: LOW, MEDIUM, HIGH, CRITICAL" }, { status: 400, headers: gate.headers });
  }
  if (!nextReviewDate || typeof nextReviewDate !== "string") {
    return NextResponse.json({ ok: false, error: "nextReviewDate required (ISO)" }, { status: 400, headers: gate.headers });
  }

  const profile = await upsertSubject(tenant, subjectId as string, {
    subjectId: subjectId as string,
    subjectName: subjectName as string,
    currentRiskCategory: currentRiskCategory as SubjectProfile["currentRiskCategory"],
    dueDiligence: (typeof dueDiligence === "string" ? dueDiligence : "CDD") as SubjectProfile["dueDiligence"],
    nextReviewDate: nextReviewDate as string,
    activeCaseId: typeof activeCaseId === "string" ? activeCaseId : undefined,
    lastScreenedAt: typeof lastScreenedAt === "string" ? lastScreenedAt : undefined,
    isPep: Boolean(isPep),
    hasStrSarOnRecord: Boolean(hasStrSarOnRecord),
    notes: typeof notes === "string" ? notes : undefined,
  });

  void writeAuditChainEntry(
    { event: "subjects.upserted", actor: gate.keyId, meta: { id: profile.subjectId, name: profile.subjectName } },
    tenant,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, subject: profile }, { status: 201, headers: gate.headers });
}
