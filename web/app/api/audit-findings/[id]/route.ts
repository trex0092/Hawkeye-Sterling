// GET   /api/audit-findings/[id] — load a single audit finding
// PATCH /api/audit-findings/[id] — update an audit finding
//
// Regulatory basis: CBUAE §9, IIA Standards

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAuditFinding, updateAuditFinding, type AuditFindingPatch } from "@/lib/server/audit-findings";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const tenantId = tenantIdFromGate(gate);
  const record = await loadAuditFinding(tenantId, id);

  if (!record) {
    return NextResponse.json(
      { ok: false, error: "Audit finding not found" },
      { status: 404, headers: gate.headers },
    );
  }

  return NextResponse.json(
    { ok: true, record },
    { headers: gate.headers },
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: AuditFindingPatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  let record;
  try {
    record = await updateAuditFinding(tenantId, id, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "Audit finding not found" },
        { status: 404, headers: gate.headers },
      );
    }
    console.error("[audit-findings] update failed:", message);
    return NextResponse.json(
      { ok: false, error: "Update failed — service temporarily unavailable" },
      { status: 500, headers: gate.headers },
    );
  }

  void writeAuditChainEntry(
    { event: "audit_finding.updated", actor: gate.keyId, findingId: id },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] finding write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(
    { ok: true, record },
    { headers: gate.headers },
  );
}
