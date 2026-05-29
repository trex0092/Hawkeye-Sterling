// GET  /api/outsourcing-register  — list all arrangements for the authenticated tenant
// POST /api/outsourcing-register  — create a new outsourcing arrangement
//
// Regulatory basis: FDL 10/2025 Art.18, CBUAE Outsourcing Guidance, FATF R.2

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  loadAllOutsourcingArrangements,
  createOutsourcingArrangement,
  type OutsourcingCreateFields,
} from "@/lib/server/outsourcing-register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const records = await loadAllOutsourcingArrangements(tenantId);

  return NextResponse.json(
    { ok: true, count: records.length, records },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<OutsourcingCreateFields>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Validate required fields
  if (!body.vendorName || typeof body.vendorName !== "string" || body.vendorName.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "vendorName is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.vendorCountry || typeof body.vendorCountry !== "string" || body.vendorCountry.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "vendorCountry is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.serviceType || typeof body.serviceType !== "string" || body.serviceType.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "serviceType is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (typeof body.amlCftRelevant !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "amlCftRelevant must be a boolean" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.contractStartDate || typeof body.contractStartDate !== "string") {
    return NextResponse.json(
      { ok: false, error: "contractStartDate is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.riskRating || !["high", "medium", "low"].includes(body.riskRating)) {
    return NextResponse.json(
      { ok: false, error: "riskRating must be 'high', 'medium', or 'low'" },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  const fields: OutsourcingCreateFields = {
    vendorName: body.vendorName.trim(),
    vendorCountry: body.vendorCountry.trim(),
    serviceType: body.serviceType.trim(),
    amlCftRelevant: body.amlCftRelevant,
    contractStartDate: body.contractStartDate,
    riskRating: body.riskRating,
    ...(body.contractEndDate ? { contractEndDate: body.contractEndDate } : {}),
    ...(body.boardApproved !== undefined ? { boardApproved: body.boardApproved } : {}),
    ...(body.agreementCurrent !== undefined ? { agreementCurrent: body.agreementCurrent } : {}),
    ...(body.mlroSignOff !== undefined ? { mlroSignOff: body.mlroSignOff } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
  };

  const record = await createOutsourcingArrangement(tenantId, fields);

  void writeAuditChainEntry(
    { event: "outsourcing.arrangement.created", actor: gate.keyId, meta: { id: record.id } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, record },
    { status: 201, headers: gate.headers },
  );
}
