// GET /api/admin/model-drift  — latest drift report
// POST /api/admin/model-drift — force recompute

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { adminAuth } from "@/lib/server/admin-auth";
import { getDriftReport, computeDriftReport } from "@/lib/server/drift-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "admin.model-drift_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);
  const tenant = tenantIdFromGate(gate);

  try {
    const report = await getDriftReport(tenant);
    if (!report) {
      return NextResponse.json(
        { ok: true, report: null, note: "No drift data yet — report generated after 50 AI decisions" },
        { headers: gate.headers },
      );
    }
    return NextResponse.json({ ok: true, report }, { headers: gate.headers });
  } catch (err) {
    console.error("[admin/model-drift] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load drift report" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "admin.model-drift_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);
  const tenant = tenantIdFromGate(gate);

  try {
    const report = await computeDriftReport(tenant);
    return NextResponse.json({ ok: true, report }, { headers: gate.headers });
  } catch (err) {
    console.error("[admin/model-drift] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to compute drift report" }, { status: 500, headers: gate.headers });
  }
}
