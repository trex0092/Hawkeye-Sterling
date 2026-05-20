// PATCH /api/breaches/:breachId — update status / closure evidence

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { loadBreach, updateBreach } from "@/lib/server/breach-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ breachId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;
  const { breachId } = await ctx.params;
  const breach = await loadBreach(breachId);
  if (!breach) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, breach }, { headers: gate.headers });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ breachId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const { breachId } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const VALID_STATUSES = new Set(["open", "remediation_in_progress", "closed"]);
  const { status, closureEvidence, owner, dueDate } = body;

  if (status !== undefined && !VALID_STATUSES.has(status as string)) {
    return NextResponse.json(
      { ok: false, error: "status must be: open | remediation_in_progress | closed" },
      { status: 400 },
    );
  }

  const updated = await updateBreach(
    breachId,
    {
      ...(typeof status === "string" ? { status: status as "open" | "remediation_in_progress" | "closed" } : {}),
      ...(typeof closureEvidence === "string" ? { closureEvidence } : {}),
      ...(typeof owner === "string" ? { owner } : {}),
      ...(typeof dueDate === "string" ? { dueDate } : {}),
      ...(status === "closed" ? { closedAt: new Date().toISOString() } : {}),
    },
    gate.keyId,
  );

  if (!updated) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, breach: updated }, { headers: gate.headers });
}
