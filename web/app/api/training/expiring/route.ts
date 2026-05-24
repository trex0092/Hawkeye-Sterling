// GET /api/training/expiring?withinDays=30 — returns records expiring within N days

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getExpiringRecords } from "@/lib/server/training-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const withinDaysParam = url.searchParams.get("withinDays");
  const withinDays = withinDaysParam ? parseInt(withinDaysParam, 10) : 30;

  if (isNaN(withinDays) || withinDays <= 0) {
    return NextResponse.json(
      { ok: false, error: "withinDays must be a positive integer" },
      { status: 400, headers: gate.headers },
    );
  }

  const records = await getExpiringRecords(tenant, withinDays);
  return NextResponse.json(
    { ok: true, records, total: records.length, withinDays },
    { headers: gate.headers },
  );
}
