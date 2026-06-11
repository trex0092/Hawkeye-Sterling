// GET /api/ai-governance/risk-register
//
// Returns the full model risk register with computed attestation status.
// Returns 503 if any high/critical model has an overdue attestation — this
// makes attestation failures visible to health monitors and the SOC2 auditor.
//
// Auth: Bearer ADMIN_TOKEN (admin-only — model governance data is sensitive).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { isServicePrincipal, auditActorFromGate } from "@/lib/server/rbac";
import {
  MODEL_REGISTRY,
  getOverdueModels,
  computeAttestationStatus,
} from "@/lib/server/ai-governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "ai-governance.risk-register_accessed", actor: auditActorFromGate(gate) },
    tenantIdFromGate(gate),
  ).catch(() => undefined);
  if (!isServicePrincipal(gate.keyId)) {
    return NextResponse.json(
      { ok: false, error: "Forbidden — model risk register requires admin access." },
      { status: 403, headers: gate.headers },
    );
  }

  const now = new Date().toISOString();
  const overdue = getOverdueModels();
  const criticalOrHighOverdue = overdue.filter(
    (m) => m.riskTier === "high" || m.riskTier === "critical",
  );

  const entries = MODEL_REGISTRY.map((m) => ({
    modelId:            m.modelId,
    purpose:            m.purpose,
    riskTier:           m.riskTier,
    humanReviewRequired: m.humanReviewRequired,
    fdlReference:       m.fdlReference,
    registeredAt:       m.registeredAt,
    redTeamLastRunAt:   m.redTeamLastRunAt ?? null,
    cardRef:            m.cardRef ?? null,
    approval: {
      ...m.approval,
      // Recompute status at request time so it reflects today's date
      attestationStatus: computeAttestationStatus(m.approval.nextAttestationDue),
    },
  }));

  const overallStatus = criticalOrHighOverdue.length > 0 ? "overdue" : "current";

  const body = {
    ok:            overallStatus === "current",
    generatedAt:   now,
    overallStatus,
    totalModels:   MODEL_REGISTRY.length,
    overdueCount:  overdue.length,
    criticalOrHighOverdueCount: criticalOrHighOverdue.length,
    entries,
    ...(criticalOrHighOverdue.length > 0 && {
      overdueModels: criticalOrHighOverdue.map((m) => ({
        modelId: m.modelId,
        purpose: m.purpose,
        riskTier: m.riskTier,
        nextAttestationDue: m.approval.nextAttestationDue,
      })),
    }),
  };

  // 503 when high/critical attestations are overdue — makes this a health-check target
  const status = criticalOrHighOverdue.length > 0 ? 503 : 200;
  return NextResponse.json(body, { status, headers: gate.headers });
}
