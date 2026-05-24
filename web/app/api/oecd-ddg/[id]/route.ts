import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadOecdDdgRecord, updateOecdDdgRecord, getStepCompletion, type OecdDdgRecord } from "@/lib/server/oecd-ddg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);
  const { id } = await params;

  try {
    const record = await loadOecdDdgRecord(tenantId, id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "OECD DDG record not found" }, { status: 404, headers: gate.headers });
    }
    const stepCompletion = getStepCompletion(record);
    return NextResponse.json({ ok: true, record, stepCompletion }, { headers: gate.headers });
  } catch (err) {
    console.error("[oecd-ddg/[id]] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load OECD DDG record" }, { status: 500, headers: gate.headers });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);
  const { id } = await params;

  let body: Partial<Omit<OecdDdgRecord, "id" | "tenantId" | "createdAt">>;
  try {
    body = (await req.json()) as Partial<Omit<OecdDdgRecord, "id" | "tenantId" | "createdAt">>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  try {
    const updated = await updateOecdDdgRecord(tenantId, id, body);
    const stepCompletion = getStepCompletion(updated);
    return NextResponse.json({ ok: true, record: updated, stepCompletion }, { headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 404, headers: gate.headers });
    }
    console.error("[oecd-ddg/[id]] PATCH failed:", msg);
    return NextResponse.json({ ok: false, error: "Failed to update OECD DDG record" }, { status: 500, headers: gate.headers });
  }
}
