import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  deleteCaseById,
  loadAllCases,
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
  const { id } = await ctx.params;
  const cases = await loadAllCases();
  const found = cases.find((c) => c.id === id);
  if (!found) {
    return NextResponse.json(
      { ok: false, error: "not found" },
      { status: 404, headers: gate.headers },
    );
  }
  return NextResponse.json(
    { ok: true, case: found },
    { headers: gate.headers },
  );
}

async function handleDelete(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const cases = await deleteCaseById(id);
  return NextResponse.json(
    { ok: true, cases },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
export const DELETE = handleDelete;
