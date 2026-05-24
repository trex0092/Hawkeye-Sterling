// GET   /api/bra/[id] — load a single BRA record
// PATCH /api/bra/[id] — update a BRA record (approve, change status, etc.)
//
// Regulatory basis: MOE Circular 6/2025

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadBraRecord, updateBraRecord, type BraPatch } from "@/lib/server/bra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const tenantId = tenantIdFromGate(gate);
  const record = await loadBraRecord(tenantId, id);

  if (!record) {
    return NextResponse.json(
      { ok: false, error: "BRA record not found" },
      { status: 404, headers: gate.headers },
    );
  }

  const isOverdueReview = new Date(record.nextReviewDate) < new Date();

  return NextResponse.json(
    { ok: true, record: { ...record, isOverdueReview } },
    { headers: gate.headers },
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: BraPatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  // When approvedBy is provided and approvedAt is not, auto-set approvedAt and status
  if (body.approvedBy && !body.approvedAt) {
    body = {
      ...body,
      approvedAt: new Date().toISOString(),
      status: "active",
    };
  }

  let record;
  try {
    record = await updateBraRecord(tenantId, id, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "BRA record not found" },
        { status: 404, headers: gate.headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: gate.headers },
    );
  }

  const isOverdueReview = new Date(record.nextReviewDate) < new Date();

  return NextResponse.json(
    { ok: true, record: { ...record, isOverdueReview } },
    { headers: gate.headers },
  );
}
