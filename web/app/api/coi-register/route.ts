// GET  /api/coi-register  — list all COI declarations for the authenticated tenant
// POST /api/coi-register  — create a new COI declaration
//
// Regulatory basis: FATF R.35, CBUAE Governance Guidelines, Federal Decree-Law No. 10 of 2025 Art.19

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  loadAllCoiDeclarations,
  createCoiDeclaration,
  type CoiCreateFields,
} from "@/lib/server/coi-register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const records = await loadAllCoiDeclarations(tenantId);

  return NextResponse.json(
    { ok: true, count: records.length, records },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<CoiCreateFields>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const requiredStringFields = [
    "staffName",
    "staffRole",
    "declarationDate",
    "conflictType",
    "description",
    "potentialImpact",
    "mitigationProposed",
  ] as const;

  for (const field of requiredStringFields) {
    if (!body[field] || typeof body[field] !== "string" || (body[field] as string).trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: `${field} is required` },
        { status: 400, headers: gate.headers },
      );
    }
  }

  const validConflictTypes = ["financial", "personal", "business", "other"];
  if (!validConflictTypes.includes(body.conflictType as string)) {
    return NextResponse.json(
      { ok: false, error: "conflictType must be one of: financial, personal, business, other" },
      { status: 400, headers: gate.headers },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  const fields: CoiCreateFields = {
    staffName: body.staffName!.trim(),
    staffRole: body.staffRole!.trim(),
    declarationDate: body.declarationDate!.trim(),
    conflictType: body.conflictType as CoiCreateFields["conflictType"],
    description: body.description!.trim(),
    potentialImpact: body.potentialImpact!.trim(),
    mitigationProposed: body.mitigationProposed!.trim(),
  };

  const record = await createCoiDeclaration(tenantId, fields);

  void writeAuditChainEntry(
    { event: "coi.declaration.created", actor: gate.keyId, meta: { id: record.id } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, record },
    { status: 201, headers: gate.headers },
  );
}
