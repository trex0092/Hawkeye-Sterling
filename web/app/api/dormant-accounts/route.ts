// GET  /api/dormant-accounts  — list all dormant accounts for the authenticated tenant
// POST /api/dormant-accounts  — flag a new dormant account
//
// Regulatory basis: CBUAE AML/CFT Guidelines §8, §8.4
// dormancyStartDate is auto-computed as lastActivityDate + 365 days.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  loadAllDormantAccounts,
  createDormantAccount,
  type DormantAccountCreateFields,
} from "@/lib/server/dormant-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const records = await loadAllDormantAccounts(tenantId);

  return NextResponse.json(
    { ok: true, count: records.length, records },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<DormantAccountCreateFields>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.customerName || typeof body.customerName !== "string" || body.customerName.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "customerName is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.accountRef || typeof body.accountRef !== "string" || body.accountRef.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "accountRef is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.lastActivityDate || typeof body.lastActivityDate !== "string") {
    return NextResponse.json(
      { ok: false, error: "lastActivityDate is required (ISO date)" },
      { status: 400, headers: gate.headers },
    );
  }
  if (isNaN(Date.parse(body.lastActivityDate))) {
    return NextResponse.json(
      { ok: false, error: "lastActivityDate must be a valid date (e.g. 2025-05-01)" },
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

  const fields: DormantAccountCreateFields = {
    customerName: body.customerName.trim(),
    accountRef: body.accountRef.trim(),
    lastActivityDate: body.lastActivityDate,
    riskRating: body.riskRating,
    ...(body.notes ? { notes: body.notes } : {}),
  };

  const record = await createDormantAccount(tenantId, fields);

  void writeAuditChainEntry(
    { event: "dormant_account.created", actor: gate.keyId, meta: { id: record.id, accountRef: fields.accountRef } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, record },
    { status: 201, headers: gate.headers },
  );
}
