// GET  /api/pnmr  — list all PNMR records (optional ?status= filter)
// POST /api/pnmr  — manually create a PNMR record
//
// Regulatory basis: Cabinet Decision 74/2020 — PNMR filing within 5 UAE
// business days of a hit against LTL, EOCN, or UN Consolidated lists.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  createPnmrRecord,
  loadAllPnmrRecords,
  type PnmrRecord,
} from "@/lib/server/pnmr";

const VALID_STATUSES: PnmrRecord["status"][] = [
  "pending",
  "submitted",
  "resolved_false_positive",
  "resolved_confirmed",
];

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  let records = await loadAllPnmrRecords(tenant);

  if (statusFilter) {
    if (!(VALID_STATUSES as string[]).includes(statusFilter)) {
      return NextResponse.json(
        { ok: false, error: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400, headers: gate.headers },
      );
    }
    records = records.filter((r) => r.status === statusFilter);
  }

  records.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return NextResponse.json(
    { ok: true, records, total: records.length },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: {
    subjectName?: string;
    listId?: string;
    listLabel?: string;
    subjectId?: string;
    screeningHitId?: string;
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
  if (!body.listLabel?.trim()) {
    return NextResponse.json(
      { ok: false, error: "listLabel is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const actor = gate.record?.email ?? gate.keyId ?? "unknown";

  const record = await createPnmrRecord(tenant, {
    subjectName: body.subjectName.trim(),
    listId: body.listId.trim(),
    listLabel: body.listLabel.trim(),
    subjectId: body.subjectId,
    screeningHitId: body.screeningHitId,
    notes: body.notes,
    initiatedBy: actor,
  });

  return NextResponse.json(
    { ok: true, record },
    { status: 201, headers: gate.headers },
  );
}
