// GET   /api/subjects/:subjectId  — fetch subject profile
// PATCH /api/subjects/:subjectId  — update profile fields

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadSubject, patchSubject, reviewDueSoon } from "@/lib/server/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ subjectId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { subjectId } = await ctx.params;

  const profile = await loadSubject(tenant, subjectId);
  if (!profile) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const reviewIn = profile.nextReviewDate
    ? Math.max(0, Math.floor((new Date(profile.nextReviewDate).getTime() - Date.now()) / 86_400_000))
    : null;

  return NextResponse.json(
    { ok: true, subject: profile, reviewDueSoon: reviewDueSoon(profile), reviewInDays: reviewIn },
    { headers: gate.headers },
  );
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ subjectId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { subjectId } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const updated = await patchSubject(tenant, subjectId, body as Parameters<typeof patchSubject>[2], gate.keyId);
  if (!updated) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, subject: updated }, { headers: gate.headers });
}
