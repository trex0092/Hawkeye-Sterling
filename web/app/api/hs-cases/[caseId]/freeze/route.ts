// POST /api/hs-cases/:caseId/freeze
// Sets case status to frozen and records the reason.
// Auto-freezes triggered by uae_ltl hits bypass manual reason requirement.

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
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* optional */ }

  const existing = await loadCase(tenant, caseId);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (existing.status === "frozen") {
    return NextResponse.json({ ok: false, error: "case already frozen" }, { status: 409 });
  }

  const reason = typeof body["reason"] === "string"
    ? body["reason"]
    : existing.autoFreezeRequired
      ? "Auto-freeze: UAE LTL hit detected (Cabinet Resolution 74/2020)"
      : "Frozen by MLRO";

  const updated = await updateCase(tenant, caseId, {
    status: "frozen",
    notes: existing.notes ? `${existing.notes}\n[FROZEN] ${reason}` : `[FROZEN] ${reason}`,
  }, gate.keyId);

  void writeAuditChainEntry({
    event: "case.frozen",
    actor: gate.keyId,
    caseId,
    subjectName: existing.subjectName,
    reason: reason.slice(0, 200),
    autoFreezeRequired: existing.autoFreezeRequired,
  }, tenant).catch(() => undefined);

  return NextResponse.json({ ok: true, case: updated }, { headers: gate.headers });
}
