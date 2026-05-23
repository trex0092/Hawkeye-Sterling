// GET /api/admin/bias-audit  — latest bias report
// POST /api/admin/bias-audit — force recompute

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getBiasReport, computeBiasReport } from "@/lib/server/bias-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const report = await getBiasReport(tenant);
  if (!report) {
    return NextResponse.json(
      { ok: true, report: null, note: "No bias data yet — report generated after 100 screenings" },
      { headers: gate.headers },
    );
  }
  return NextResponse.json({ ok: true, report }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const report = await computeBiasReport(tenant);
  return NextResponse.json({ ok: true, report }, { headers: gate.headers });
}
