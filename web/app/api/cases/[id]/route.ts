import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  deleteCaseById,
  loadCase,
} from "@/lib/server/case-vault";
import { buildInvestigationTimeline } from "@/lib/server/case-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    /api/cases/<id>     → single case record + canonical brain timeline
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
  // Translate the presentation-layer CaseRecord into the brain's canonical
  // TimelineEvent[] shape (phase / actor / sourceKind / sourceId). Surfaced
  // alongside the legacy `case.timeline` field so UI / regulator exports
  // can migrate to the richer model without a breaking refactor.
  let investigationTimeline: ReturnType<typeof buildInvestigationTimeline> = [];
  try {
    investigationTimeline = buildInvestigationTimeline(found);
  } catch (err) {
    console.warn("[hawkeye] cases/[id]: investigation timeline build failed:", err);
  }
  return NextResponse.json(
    { ok: true, tenant, case: found, investigationTimeline },
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
