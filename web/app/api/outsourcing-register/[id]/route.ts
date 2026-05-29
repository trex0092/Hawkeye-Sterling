// GET   /api/outsourcing-register/[id] — load a single arrangement
// PATCH /api/outsourcing-register/[id] — update an arrangement
//
// Regulatory basis: FDL 10/2025 Art.18, CBUAE Outsourcing Guidance

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadOutsourcingArrangement,
  updateOutsourcingArrangement,
  type OutsourcingPatch,
} from "@/lib/server/outsourcing-register";
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
  const record = await loadOutsourcingArrangement(tenantId, id);

  if (!record) {
    return NextResponse.json(
      { ok: false, error: "Outsourcing arrangement not found" },
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

  let body: OutsourcingPatch;
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
    record = await updateOutsourcingArrangement(tenantId, id, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "Outsourcing arrangement not found" },
        { status: 404, headers: gate.headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: gate.headers },
    );
  }

  void writeAuditChainEntry(
    { event: "outsourcing_register.updated", actor: gate.keyId, meta: { id } },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(
    { ok: true, record },
    { headers: gate.headers },
  );
}
