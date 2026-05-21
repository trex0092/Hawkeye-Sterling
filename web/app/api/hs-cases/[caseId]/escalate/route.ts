// POST /api/hs-cases/:caseId/escalate
// Escalates case to MD. Logs escalation.triggered to audit trail.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadCase, updateCase } from "@/lib/server/hs-case-store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { caseId } = await ctx.params;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* body optional */ }

  const existing = await loadCase(tenant, caseId);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: gate.headers });
  if (existing.status === "closed") {
    return NextResponse.json({ ok: false, error: "cannot escalate a closed case" }, { status: 409, headers: gate.headers });
  }

  const reason = typeof body["reason"] === "string" ? body["reason"] : "Escalated to MD for review";

  const updated = await updateCase(tenant, caseId, {
    status: "escalated",
    notes: existing.notes ? `${existing.notes}\n[ESCALATED] ${reason}` : `[ESCALATED] ${reason}`,
  }, gate.keyId);

  void writeAuditChainEntry({
    event: "escalation.triggered",
    actor: gate.keyId,
    caseId,
    subjectName: existing.subjectName,
    reason: reason.slice(0, 200),
  }, tenant).catch(() => undefined);

  return NextResponse.json({ ok: true, case: updated }, { headers: gate.headers });
}
