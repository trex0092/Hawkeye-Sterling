// GET /api/bias-report
//
// Returns the latest statistical bias report for the calling tenant.
// Computed by bias-monitor.ts from the rolling 30-day screening window.
//
// Referenced in docs/INCIDENT-RECOVERY.md §9 (AI model incident — bias alert):
//   "Review GET /api/bias-report for the affected tenant. If biasRatio > 1.5
//    for any group, treat as a FATF R.10 discriminatory screening incident."
//
// Auth: Bearer API key (standard enforce gate).
// POST: force-recompute the report (admin use during incident response).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getBiasReport, computeBiasReport } from "@/lib/server/bias-monitor";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const report = await getBiasReport(tenant);
  if (!report) {
    return NextResponse.json(
      {
        ok: true,
        report: null,
        note: "No bias data yet — report is generated after sufficient screening volume (≥100 decisions in the rolling window).",
        tenant,
      },
      { status: 200, headers: gate.headers },
    );
  }

  const criticalGroups = report.groups.filter((g) => g.biasRatio > 1.5);
  return NextResponse.json(
    {
      ok: true,
      report,
      tenant,
      // Quick-read fields for incident response triage
      biasDetected: report.biasDetected,
      nationalityBiasDetected: report.nationalityBiasDetected,
      criticalGroupCount: criticalGroups.length,
      criticalGroups: criticalGroups.map((g) => ({ script: g.script, biasRatio: g.biasRatio })),
      fatfR10Alert: criticalGroups.length > 0,
    },
    { status: 200, headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const report = await computeBiasReport(tenant);
  void writeAuditChainEntry(
    { event: "bias_report.recomputed", actor: gate.keyId, meta: { tenant } },
    tenant,
  ).catch((e: unknown) => console.warn("[bias-report] audit write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(
    { ok: true, report, tenant, recomputed: true },
    { status: 200, headers: gate.headers },
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
