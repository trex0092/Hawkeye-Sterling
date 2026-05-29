// GET  /api/eocn-sla  — list all EOCN SLA records, enriched with countdown
// POST /api/eocn-sla  — manually create an EOCN SLA record
//
// Regulatory basis: Cabinet Decision 74/2020 — EOCN obligations for asset
// freeze (24h), PNMR filing (5BD), and customer identity verification (10BD).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  createEocnSlaRecord,
  loadAllEocnSlaRecords,
  computeEocnSlaStatus,
  type EocnSlaType,
} from "@/lib/server/eocn-sla";

const VALID_TYPES: EocnSlaType[] = [
  "EOCN_FREEZE_24H",
  "EOCN_PNMR_5BD",
  "EOCN_CUSTOMER_VERIFY_10BD",
];

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const records = await loadAllEocnSlaRecords(tenant);
  const enriched = records
    .map(computeEocnSlaStatus)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return NextResponse.json(
    { ok: true, records: enriched },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: {
    type?: EocnSlaType;
    subjectName?: string;
    listId?: string;
    pnmrId?: string;
    notes?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.type || !(VALID_TYPES as string[]).includes(body.type)) {
    return NextResponse.json(
      { ok: false, error: `type is required and must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.subjectName?.trim()) {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.listId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "listId is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const record = await createEocnSlaRecord(tenant, {
    type: body.type,
    subjectName: body.subjectName.trim(),
    listId: body.listId.trim(),
    pnmrId: body.pnmrId,
    notes: body.notes,
  });

  return NextResponse.json(
    { ok: true, record: computeEocnSlaStatus(record) },
    { status: 201, headers: gate.headers },
  );
}
