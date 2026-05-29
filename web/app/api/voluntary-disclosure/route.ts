// GET  /api/voluntary-disclosure  — list all voluntary disclosures for the authenticated tenant
// POST /api/voluntary-disclosure  — create a new voluntary disclosure
//
// Regulatory basis: FDL 10/2025 Art.25, CBUAE Enforcement Policy
// Self-reporting before detection may qualify for enforcement mitigation.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  loadAllVoluntaryDisclosures,
  createVoluntaryDisclosure,
  type VoluntaryDisclosureCreateFields,
} from "@/lib/server/voluntary-disclosure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const records = await loadAllVoluntaryDisclosures(tenantId);

  return NextResponse.json(
    { ok: true, count: records.length, records },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<VoluntaryDisclosureCreateFields>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const VALID_DISCLOSURE_TYPES = ["sanctions_breach", "str_filing_delay", "cdd_failure", "record_keeping", "other"];
  const VALID_REGULATORY_BODIES = ["UAE_FIU", "MOE", "CBUAE", "EOCN", "OTHER"];

  if (!body.disclosureType || !VALID_DISCLOSURE_TYPES.includes(body.disclosureType)) {
    return NextResponse.json(
      { ok: false, error: `disclosureType must be one of: ${VALID_DISCLOSURE_TYPES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.regulatoryBody || !VALID_REGULATORY_BODIES.includes(body.regulatoryBody)) {
    return NextResponse.json(
      { ok: false, error: `regulatoryBody must be one of: ${VALID_REGULATORY_BODIES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.detectedDate || typeof body.detectedDate !== "string" || body.detectedDate.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "detectedDate is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const requiredStrings = ["description", "rootCause", "remediationTaken"] as const;
  for (const field of requiredStrings) {
    if (!body[field] || typeof body[field] !== "string" || body[field]!.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: `${field} is required` },
        { status: 400, headers: gate.headers },
      );
    }
  }

  const tenantId = tenantIdFromGate(gate);

  const fields: VoluntaryDisclosureCreateFields = {
    disclosureType: body.disclosureType,
    regulatoryBody: body.regulatoryBody,
    detectedDate: body.detectedDate.trim(),
    description: body.description!.trim(),
    rootCause: body.rootCause!.trim(),
    remediationTaken: body.remediationTaken!.trim(),
    ...(body.submittedBy ? { submittedBy: body.submittedBy } : {}),
    ...(body.selfReportingDiscount !== undefined ? { selfReportingDiscount: body.selfReportingDiscount } : {}),
  };

  const record = await createVoluntaryDisclosure(tenantId, fields);

  void writeAuditChainEntry(
    { event: "voluntary_disclosure.created", actor: gate.keyId, meta: { id: record.id, disclosureType: fields.disclosureType } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, record },
    { status: 201, headers: gate.headers },
  );
}
