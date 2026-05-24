// GET   /api/eocn-sla/[id]  — load single EOCN SLA record + countdown
// PATCH /api/eocn-sla/[id]  — update status, notes; auto-set timestamps
//
// Regulatory basis: Cabinet Decision 74/2020 — EOCN SLA tracking.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadEocnSlaRecord,
  updateEocnSlaRecord,
  computeEocnSlaStatus,
  type EocnSlaStatus,
} from "@/lib/server/eocn-sla";

const VALID_STATUSES: EocnSlaStatus[] = ["active", "breached", "completed", "cancelled"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const { id } = await params;
  const record = await loadEocnSlaRecord(tenant, id);
  if (!record) {
    return NextResponse.json(
      { ok: false, error: "EOCN SLA record not found" },
      { status: 404, headers: gate.headers },
    );
  }

  return NextResponse.json(
    { ok: true, record: computeEocnSlaStatus(record) },
    { headers: gate.headers },
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const { id } = await params;

  let body: {
    status?: EocnSlaStatus;
    notes?: string;
    completedAt?: string;
    breachedAt?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  if (body.status && !(VALID_STATUSES as string[]).includes(body.status)) {
    return NextResponse.json(
      { ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  const now = new Date().toISOString();
  const patch: Partial<Omit<import("@/lib/server/eocn-sla").EocnSlaRecord, "id" | "tenantId" | "createdAt">> = {};

  if (body.status) patch.status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes;

  // Auto-set completedAt when transitioning to "completed"
  if (body.status === "completed") {
    patch.completedAt = body.completedAt ?? now;
  } else if (body.completedAt !== undefined) {
    patch.completedAt = body.completedAt;
  }

  // Auto-set breachedAt when transitioning to "breached"
  if (body.status === "breached") {
    patch.breachedAt = body.breachedAt ?? now;
  } else if (body.breachedAt !== undefined) {
    patch.breachedAt = body.breachedAt;
  }

  let record: import("@/lib/server/eocn-sla").EocnSlaRecord;
  try {
    record = await updateEocnSlaRecord(tenant, id, patch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "EOCN SLA record not found" },
        { status: 404, headers: gate.headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Failed to update EOCN SLA record" },
      { status: 500, headers: gate.headers },
    );
  }

  return NextResponse.json(
    { ok: true, record: computeEocnSlaStatus(record) },
    { headers: gate.headers },
  );
}
