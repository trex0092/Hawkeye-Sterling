// GET  /api/bra  — list all BRA records for the authenticated tenant
// POST /api/bra  — create a new BRA record
//
// Regulatory basis: MOE Circular 6/2025 (DNFBP business risk assessment,
// 90-day mandatory review cycle)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadAllBraRecords,
  createBraRecord,
  type BraRecord,
  type BraCreateFields,
} from "@/lib/server/bra";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function withOverdueFlag(record: BraRecord): BraRecord & { isOverdueReview: boolean } {
  return {
    ...record,
    isOverdueReview: new Date(record.nextReviewDate) < new Date(),
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const records = await loadAllBraRecords(tenantId);
  const withFlags = records.map(withOverdueFlag);

  return NextResponse.json(
    { ok: true, count: withFlags.length, records: withFlags },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<BraCreateFields>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Validate required fields
  const requiredNumericFields = [
    "inherentRisk",
    "controlsEffectiveness",
    "customerRisk",
    "productRisk",
    "channelRisk",
    "geographyRisk",
  ] as const;

  for (const field of requiredNumericFields) {
    const val = body[field];
    if (typeof val !== "number" || val < 1 || val > 5) {
      return NextResponse.json(
        { ok: false, error: `${field} must be a number between 1 and 5` },
        { status: 400, headers: gate.headers },
      );
    }
  }

  if (!body.activityScope || typeof body.activityScope !== "string" || body.activityScope.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "activityScope is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  const fields: BraCreateFields = {
    inherentRisk: body.inherentRisk as 1 | 2 | 3 | 4 | 5,
    controlsEffectiveness: body.controlsEffectiveness as 1 | 2 | 3 | 4 | 5,
    customerRisk: body.customerRisk as 1 | 2 | 3 | 4 | 5,
    productRisk: body.productRisk as 1 | 2 | 3 | 4 | 5,
    channelRisk: body.channelRisk as 1 | 2 | 3 | 4 | 5,
    geographyRisk: body.geographyRisk as 1 | 2 | 3 | 4 | 5,
    activityScope: body.activityScope.trim(),
    isDnfbp: body.isDnfbp ?? false,
    aedThresholdApplies: body.aedThresholdApplies ?? false,
    ...(body.notes ? { notes: body.notes } : {}),
  };

  const record = await createBraRecord(tenantId, fields);

  void writeAuditChainEntry(
    { event: "bra.record_saved", actor: gate.keyId, meta: { id: record.id, entityName: fields.activityScope } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json(
    { ok: true, record: withOverdueFlag(record) },
    { status: 201, headers: gate.headers },
  );
}
