import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  deleteCaseById,
  loadCase,
} from "@/lib/server/case-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    /api/cases/<id>     → single case record
// DELETE /api/cases/<id>     → remove case from the vault

async function handleGet(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { id } = await ctx.params;
  const found = await loadCase(tenant, id);
  if (!found) {
    return NextResponse.json(
      { ok: false, error: "not found" },
      { status: 404, headers: gate.headers },
    );
  }
  return NextResponse.json(
    { ok: true, tenant, case: found },
    { headers: gate.headers },
  );
}

async function handleDelete(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { id } = await ctx.params;
  const cases = await deleteCaseById(tenant, id);
  return NextResponse.json(
    { ok: true, tenant, cases },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
export const DELETE = handleDelete;
