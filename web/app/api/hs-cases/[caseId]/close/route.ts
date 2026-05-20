// POST /api/hs-cases/:caseId/close
// Requires dispositionVerdict + dispositionRationale.
// Governance: all AI-generated outputs require MLRO human review before
// closure (FDL No.10/2025 Art.18).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadCase, updateCase, type DispositionVerdict } from "@/lib/server/hs-case-store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_VERDICTS = new Set<DispositionVerdict>([
  "approve", "EDD", "escalate", "STR", "false_positive",
]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { caseId } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  const { dispositionVerdict, dispositionRationale } = body;

  if (!dispositionVerdict || !VALID_VERDICTS.has(dispositionVerdict as DispositionVerdict)) {
    return NextResponse.json(
      { ok: false, error: `dispositionVerdict required: ${[...VALID_VERDICTS].join(", ")}` },
      { status: 400 },
    );
  }
  if (!dispositionRationale || typeof dispositionRationale !== "string") {
    return NextResponse.json(
      { ok: false, error: "dispositionRationale required — MLRO must record reason for closure" },
      { status: 400 },
    );
  }

  const existing = await loadCase(tenant, caseId);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (existing.status === "closed") {
    return NextResponse.json({ ok: false, error: "case already closed" }, { status: 409 });
  }
  if (existing.fourEyesRequired && existing.fourEyesStatus !== "approved") {
    return NextResponse.json(
      { ok: false, error: "four-eyes approval required before closing this case (FDL No.10/2025 Art.16)" },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const updated = await updateCase(tenant, caseId, {
    status: "closed",
    dispositionVerdict:  dispositionVerdict as DispositionVerdict,
    dispositionRationale: dispositionRationale as string,
    dispositionBy:       gate.keyId,
    dispositionAt:       now,
    enrichmentPending:   false,
  }, gate.keyId);

  void writeAuditChainEntry({
    event: "hs_case.closed",
    actor: gate.keyId,
    caseId,
    subjectName: existing.subjectName,
    dispositionVerdict,
    dispositionRationale: (dispositionRationale as string).slice(0, 200),
  }, tenant).catch(() => undefined);

  return NextResponse.json({ ok: true, case: updated }, { headers: gate.headers });
}
