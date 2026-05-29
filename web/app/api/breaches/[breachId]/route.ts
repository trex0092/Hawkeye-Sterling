// PATCH /api/breaches/:breachId — update status / closure evidence

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadBreach, updateBreach } from "@/lib/server/breach-store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ breachId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
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
  const tenantId = tenantIdFromGate(gate);
  const { breachId } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const VALID_STATUSES = new Set(["open", "remediation_in_progress", "closed"]);
  const { status, closureEvidence, owner, dueDate } = body;

  if (status !== undefined && !VALID_STATUSES.has(status as string)) {
    return NextResponse.json(
      { ok: false, error: "status must be: open | remediation_in_progress | closed" },
      { status: 400, headers: gate.headers },
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

  void writeAuditChainEntry(
    { event: "breach.updated", actor: gate.keyId, breachId, meta: { status, closureEvidence, owner, dueDate } },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, breach: updated }, { headers: gate.headers });
}
