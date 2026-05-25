// GET   /api/pnmr/[id]  — load single PNMR record
// PATCH /api/pnmr/[id]  — update PNMR status + metadata
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
  loadPnmrRecord,
  updatePnmrRecord,
  type PnmrRecord,
} from "@/lib/server/pnmr";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

const VALID_STATUSES: PnmrRecord["status"][] = [
  "pending",
  "submitted",
  "resolved_false_positive",
  "resolved_confirmed",
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const { id } = await params;
  const record = await loadPnmrRecord(tenant, id);
  if (!record) {
    return NextResponse.json(
      { ok: false, error: "PNMR record not found" },
      { status: 404, headers: gate.headers },
    );
  }

  return NextResponse.json({ ok: true, record }, { headers: gate.headers });
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
    status?: PnmrRecord["status"];
    goamlRef?: string;
    submittedAt?: string;
    resolvedAt?: string;
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

  if (body.status && !(VALID_STATUSES as string[]).includes(body.status)) {
    return NextResponse.json(
      { ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  const now = new Date().toISOString();
  const patch: Partial<Omit<PnmrRecord, "id" | "tenantId" | "createdAt">> = {};

  if (body.status) patch.status = body.status;
  if (body.goamlRef !== undefined) patch.goamlRef = body.goamlRef;
  if (body.notes !== undefined) patch.notes = body.notes;

  // Auto-set submittedAt when transitioning to "submitted"
  if (body.status === "submitted") {
    patch.submittedAt = body.submittedAt ?? now;
  } else if (body.submittedAt !== undefined) {
    patch.submittedAt = body.submittedAt;
  }

  // Auto-set resolvedAt when transitioning to any resolved_* status
  if (body.status === "resolved_false_positive" || body.status === "resolved_confirmed") {
    patch.resolvedAt = body.resolvedAt ?? now;
  } else if (body.resolvedAt !== undefined) {
    patch.resolvedAt = body.resolvedAt;
  }

  const actor = gate.record?.email ?? gate.keyId ?? "unknown";

  let record: PnmrRecord;
  try {
    record = await updatePnmrRecord(tenant, id, patch, actor);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "PNMR record not found" },
        { status: 404, headers: gate.headers },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Failed to update PNMR record" },
      { status: 500, headers: gate.headers },
    );
  }

  void writeAuditChainEntry(
    { event: "pnmr.updated", actor: gate.keyId, caseId: id, meta: { status: body.status } },
    tenant,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, record }, { headers: gate.headers });
}
