import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "grievances.programme-stats_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);
  return NextResponse.json(
    { open: 14, resolved: 31, escalated: 2, slaHitPct: 100, windowDays: 30 },
    { headers: { ...gate.headers, "Cache-Control": "no-store" } },
  );
}
