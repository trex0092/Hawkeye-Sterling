import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { createOecdDdgRecord, loadAllOecdDdgRecords } from "@/lib/server/oecd-ddg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  try {
    const records = await loadAllOecdDdgRecords(tenantId);
    return NextResponse.json({ ok: true, records }, { headers: gate.headers });
  } catch (err) {
    console.error("[oecd-ddg] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load OECD DDG records" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body["reportingYear"] || typeof body["reportingYear"] !== "number") {
    return NextResponse.json(
      { ok: false, error: "Missing required field: reportingYear (number)" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    const record = await createOecdDdgRecord(tenantId, {
      reportingYear: Number(body["reportingYear"]),
    });
    return NextResponse.json({ ok: true, record }, { status: 201, headers: gate.headers });
  } catch (err) {
    console.error("[oecd-ddg] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to create OECD DDG record" }, { status: 500, headers: gate.headers });
  }
}
