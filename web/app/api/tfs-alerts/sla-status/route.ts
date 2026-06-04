// GET /api/tfs-alerts/sla-status
//
// Returns the latest 24-hour freeze SLA status report produced by the
// freeze-sla-monitor.mts cron function (runs hourly at :30 UTC).
//
// Cabinet Resolution 74/2020 Art.4 + UAE FDL 10/2025 Art.24 require
// asset freeze within 24 hours of an EOCN/TFS designation hit.
//
// Response:
//   { ok: boolean, checkedAt: ISO, overdueCount: number, breaches: [...], nextCheckAt: ISO }
//
// When overdueCount > 0, immediate MLRO action is required.
// Auth: standard enforce() gate (API key / JWT / admin token).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getStore } from "@netlify/blobs";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SLA_STATUS_KEY = "tfs-sla-status.json";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "tfs_alerts.sla_status_read", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  try {
    const store = getStore("hawkeye-sterling");
    const raw = await store.get(SLA_STATUS_KEY, { type: "text" });
    if (!raw) {
      return NextResponse.json(
        {
          ok: true,
          checkedAt: null,
          totalOpenAlerts: 0,
          overdueCount: 0,
          breaches: [],
          note: "SLA monitor has not run yet. It runs hourly at :30 UTC (freeze-sla-monitor function).",
          regulatoryBasis: "Cabinet Resolution 74/2020 Art.4 — 24h freeze deadline",
        },
        { headers: gate.headers },
      );
    }
    const report = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json({ ...report, regulatoryBasis: "Cabinet Resolution 74/2020 Art.4 — 24h freeze deadline" }, { headers: gate.headers });
  } catch (err) {
    console.error("[tfs-alerts/sla-status] failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "Failed to read SLA status", overdueCount: null },
      { status: 503, headers: gate.headers },
    );
  }
}
