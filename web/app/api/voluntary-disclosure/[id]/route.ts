// GET   /api/voluntary-disclosure/[id] — load a single voluntary disclosure
// PATCH /api/voluntary-disclosure/[id] — update a voluntary disclosure
//
// Regulatory basis: Federal Decree-Law No. 10 of 2025 Art.25, CBUAE Enforcement Policy

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  loadVoluntaryDisclosure,
  updateVoluntaryDisclosure,
  type VoluntaryDisclosurePatch,
} from "@/lib/server/voluntary-disclosure";

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
  const record = await loadVoluntaryDisclosure(tenantId, id);

  if (!record) {
    return NextResponse.json(
      { ok: false, error: "Voluntary disclosure not found" },
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

  let body: VoluntaryDisclosurePatch;
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
    record = await updateVoluntaryDisclosure(tenantId, id, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "Voluntary disclosure not found" },
        { status: 404, headers: gate.headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: gate.headers },
    );
  }

  void writeAuditChainEntry(
    { event: "voluntary_disclosure.updated", actor: gate.keyId, meta: { id } },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(
    { ok: true, record },
    { headers: gate.headers },
  );
}
