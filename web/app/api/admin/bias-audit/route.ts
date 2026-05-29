// GET /api/admin/bias-audit  — latest bias report
// POST /api/admin/bias-audit — force recompute

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { adminAuth } from "@/lib/server/admin-auth";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getBiasReport, computeBiasReport } from "@/lib/server/bias-monitor";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  try {
    const report = await getBiasReport(tenant);
    if (!report) {
      return NextResponse.json(
        { ok: true, report: null, note: "No bias data yet — report generated after 100 screenings" },
        { headers: gate.headers },
      );
    }
    return NextResponse.json({ ok: true, report }, { headers: gate.headers });
  } catch (err) {
    console.error("[admin/bias-audit] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load bias report" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  try {
    const report = await computeBiasReport(tenant);
    void writeAuditChainEntry(
      { event: "bias_audit.computed", actor: gate.keyId, meta: { tenant } },
      tenant,
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, report }, { headers: gate.headers });
  } catch (err) {
    console.error("[admin/bias-audit] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to compute bias report" }, { status: 500, headers: gate.headers });
  }
}
