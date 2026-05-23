// GET   /api/hs-cases/:caseId  — fetch single case
// PATCH /api/hs-cases/:caseId  — update status, disposition, notes

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadCase,
  updateCase,
  appendEscalationHistory,
  setFilingDeadline,
  updateCaseRiskScore,
  type HsCaseStatus,
  type DispositionVerdict,
  type CaseRiskFactors,
} from "@/lib/server/hs-case-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<HsCaseStatus>([
  "open", "under_review", "pending_approval", "closed", "escalated", "frozen",
  "mlro_review", "filed_str",
]);
const VALID_VERDICTS = new Set<DispositionVerdict>([
  "approve", "EDD", "escalate", "STR", "false_positive",
]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { caseId } = await ctx.params;

  const found = await loadCase(tenant, caseId);
  if (!found) return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: gate.headers });

  // Compute SLA remaining for UI countdown.
  const slaRemainingMs = new Date(found.slaDeadline).getTime() - Date.now();
  const slaRemainingHours = Math.max(0, Math.floor(slaRemainingMs / 3_600_000));

  return NextResponse.json(
    { ok: true, case: found, slaRemainingHours },
    { headers: gate.headers },
  );
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { caseId } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const { status, dispositionVerdict, dispositionRationale, notes, goamlReportRef } = body;

  if (status !== undefined && !VALID_STATUSES.has(status as HsCaseStatus)) {
    return NextResponse.json({ ok: false, error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` }, { status: 400, headers: gate.headers });
  }
  if (dispositionVerdict !== undefined && !VALID_VERDICTS.has(dispositionVerdict as DispositionVerdict)) {
    return NextResponse.json({ ok: false, error: `dispositionVerdict must be one of: ${[...VALID_VERDICTS].join(", ")}` }, { status: 400, headers: gate.headers });
  }

  const patch: Record<string, unknown> = {};
  if (status !== undefined) patch["status"] = status;
  if (dispositionVerdict !== undefined) {
    patch["dispositionVerdict"] = dispositionVerdict;
    patch["dispositionBy"] = gate.keyId;
    patch["dispositionAt"] = new Date().toISOString();
  }
  if (typeof dispositionRationale === "string") patch["dispositionRationale"] = dispositionRationale;
  if (typeof notes === "string") patch["notes"] = notes;
  if (typeof goamlReportRef === "string") patch["goamlReportRef"] = goamlReportRef;

  const updated = await updateCase(tenant, caseId, patch, gate.keyId);
  if (!updated) return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: gate.headers });
  return NextResponse.json({ ok: true, case: updated }, { headers: gate.headers });
}
