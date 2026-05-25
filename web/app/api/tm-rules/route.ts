// GET  /api/tm-rules  — list all TM rule changes for the authenticated tenant
// POST /api/tm-rules  — create a new TM rule change proposal
//
// Regulatory basis: CBUAE AML/CFT Guidelines §7
// All TM rule changes require MLRO sign-off before deployment.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  loadAllTmRuleChanges,
  createTmRuleChange,
  type TmRuleChangeCreateFields,
} from "@/lib/server/tm-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const records = await loadAllTmRuleChanges(tenantId);

  return NextResponse.json(
    { ok: true, count: records.length, records },
    { headers: gate.headers },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: Partial<TmRuleChangeCreateFields>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const VALID_RULE_TYPES = ["threshold", "new_rule", "modification", "retirement"];

  if (!body.ruleName || typeof body.ruleName !== "string" || body.ruleName.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "ruleName is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.ruleType || !VALID_RULE_TYPES.includes(body.ruleType)) {
    return NextResponse.json(
      { ok: false, error: `ruleType must be one of: ${VALID_RULE_TYPES.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  const requiredStrings = ["proposedValue", "rationale", "proposedBy", "expectedImpact"] as const;
  for (const field of requiredStrings) {
    if (!body[field] || typeof body[field] !== "string" || body[field]!.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: `${field} is required` },
        { status: 400, headers: gate.headers },
      );
    }
  }

  const tenantId = tenantIdFromGate(gate);

  const fields: TmRuleChangeCreateFields = {
    ruleName: body.ruleName.trim(),
    ruleType: body.ruleType,
    proposedValue: body.proposedValue!.trim(),
    rationale: body.rationale!.trim(),
    proposedBy: body.proposedBy!.trim(),
    expectedImpact: body.expectedImpact!.trim(),
    ...(body.currentValue ? { currentValue: body.currentValue } : {}),
  };

  const record = await createTmRuleChange(tenantId, fields);

  void writeAuditChainEntry(
    { event: "tm.rule.proposed", actor: gate.keyId, meta: { id: record.id, ruleName: fields.ruleName } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, record },
    { status: 201, headers: gate.headers },
  );
}
