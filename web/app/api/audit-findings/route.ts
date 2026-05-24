// GET  /api/audit-findings  — list all audit findings for the authenticated tenant
// POST /api/audit-findings  — create a new audit finding
//
// Regulatory basis: CBUAE §9, IIA Standards, Board Audit Committee

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadAllAuditFindings,
  createAuditFinding,
  type AuditFindingCreateFields,
} from "@/lib/server/audit-findings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const records = await loadAllAuditFindings(tenantId);

  return NextResponse.json(
    { ok: true, count: records.length, records },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<AuditFindingCreateFields>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const requiredFields = [
    "title",
    "auditorName",
    "auditDate",
    "severity",
    "finding",
    "owner",
    "dueDate",
  ] as const;

  for (const field of requiredFields) {
    if (!body[field] || typeof body[field] !== "string" || (body[field] as string).trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: `${field} is required` },
        { status: 400, headers: gate.headers },
      );
    }
  }

  const validSeverities = ["critical", "high", "medium", "low"];
  if (!validSeverities.includes(body.severity as string)) {
    return NextResponse.json(
      { ok: false, error: "severity must be one of: critical, high, medium, low" },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  const fields: AuditFindingCreateFields = {
    title: body.title!.trim(),
    auditorName: body.auditorName!.trim(),
    auditDate: body.auditDate!.trim(),
    severity: body.severity as AuditFindingCreateFields["severity"],
    finding: body.finding!.trim(),
    regulation: (body.regulation ?? "").trim(),
    owner: body.owner!.trim(),
    dueDate: body.dueDate!.trim(),
    ...(body.remediationPlan ? { remediationPlan: body.remediationPlan.trim() } : {}),
  };

  const record = await createAuditFinding(tenantId, fields);

  return NextResponse.json(
    { ok: true, record },
    { status: 201, headers: gate.headers },
  );
}
