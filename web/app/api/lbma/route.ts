import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { createLbmaRecord, loadAllLbmaRecords } from "@/lib/server/lbma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);
  try {
    const records = await loadAllLbmaRecords(tenantId);
    return NextResponse.json({ ok: true, records }, { headers: gate.headers });
  } catch (err) {
    console.error("[lbma] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load LBMA records" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const required = [
    "reportingYear",
    "counterpartyName",
    "counterpartyCountry",
    "counterpartyType",
    "isGdlListed",
    "watchlistResult",
    "cahraSourcing",
    "supplyChainVerified",
    "ongoingMonitoringFrequency",
    "declarationSubmitted",
  ];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return NextResponse.json(
        { ok: false, error: `Missing required field: ${field}` },
        { status: 400, headers: gate.headers },
      );
    }
  }

  try {
    const record = await createLbmaRecord(tenantId, {
      reportingYear: Number(body["reportingYear"]),
      hasAmlPolicy: Boolean(body["hasAmlPolicy"] ?? false),
      amlPolicyLastReviewed: body["amlPolicyLastReviewed"] as string | undefined,
      counterpartyName: String(body["counterpartyName"]),
      counterpartyCountry: String(body["counterpartyCountry"]),
      counterpartyType: body["counterpartyType"] as "refiner" | "supplier" | "dealer" | "other",
      isGdlListed: Boolean(body["isGdlListed"]),
      watchlistScreeningDate: body["watchlistScreeningDate"] as string | undefined,
      watchlistResult: body["watchlistResult"] as "clear" | "hit" | "pending" | "not_done",
      watchlistScreeningRef: body["watchlistScreeningRef"] as string | undefined,
      cahraSourcing: Boolean(body["cahraSourcing"]),
      cahraJurisdictions: body["cahraJurisdictions"] as string[] | undefined,
      supplyChainVerified: Boolean(body["supplyChainVerified"]),
      supplyChainDepth: body["supplyChainDepth"] !== undefined ? Number(body["supplyChainDepth"]) : undefined,
      ongoingMonitoringFrequency: body["ongoingMonitoringFrequency"] as "daily" | "weekly" | "monthly" | "quarterly" | "annual",
      lastAuditDate: body["lastAuditDate"] as string | undefined,
      auditorName: body["auditorName"] as string | undefined,
      auditFindings: body["auditFindings"] as "compliant" | "minor_findings" | "major_findings" | "non_compliant" | undefined,
      declarationSubmitted: Boolean(body["declarationSubmitted"]),
      declarationDate: body["declarationDate"] as string | undefined,
      declarationSignedBy: body["declarationSignedBy"] as string | undefined,
      notes: body["notes"] as string | undefined,
    });
    return NextResponse.json({ ok: true, record }, { status: 201, headers: gate.headers });
  } catch (err) {
    console.error("[lbma] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to create LBMA record" }, { status: 500, headers: gate.headers });
  }
}
