// GET /api/ai-governance/attestation-status
//
// Returns the attestation status for all registered AI models.
// Returns 503 when any high/critical model has overdue attestation so that
// health monitors and the Netlify status page surface governance failures
// before they become regulatory non-compliance events.
//
// Schedule integration: a Netlify scheduled function calls this endpoint
// 30 days before nextAttestationDue and creates an Asana task for the MLRO.
//
// Auth: Bearer ADMIN_TOKEN (admin-only — model governance data is sensitive).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  MODEL_REGISTRY,
  computeAttestationStatus,
  getOverdueModels,
} from "@/lib/server/ai-governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "ai-governance.attestation-status_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);
  if (gate.keyId !== "portal_admin" && gate.keyId !== "cron_internal") {
    return NextResponse.json(
      { ok: false, error: "Forbidden — AI governance data requires admin access." },
      { status: 403, headers: gate.headers },
    );
  }

  const now = new Date().toISOString();
  const overdueModels = getOverdueModels();
  const hasCriticalOverdue = overdueModels.some(
    (m) => m.riskTier === "high" || m.riskTier === "critical",
  );

  // Compute due-soon models (within 30 days)
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const dueSoonModels = MODEL_REGISTRY.filter((m) => {
    const status = computeAttestationStatus(m.approval.nextAttestationDue);
    if (status !== "current") return false;
    const due = new Date(m.approval.nextAttestationDue).getTime();
    return due - Date.now() < thirtyDaysMs;
  });

  const models = MODEL_REGISTRY.map((m) => ({
    id: m.modelId,
    name: m.purpose,
    riskTier: m.riskTier,
    approvedBy: m.approval.approvedBy,
    approvedAt: m.approval.approvedAt,
    nextAttestationDue: m.approval.nextAttestationDue,
    attestationStatus: computeAttestationStatus(m.approval.nextAttestationDue),
    redTeamLastRunAt: m.redTeamLastRunAt,
  }));

  const body = {
    ok: !hasCriticalOverdue,
    generatedAt: now,
    summary: {
      total: MODEL_REGISTRY.length,
      current: models.filter((m) => m.attestationStatus === "current").length,
      due: models.filter((m) => m.attestationStatus === "due").length,
      overdue: models.filter((m) => m.attestationStatus === "overdue").length,
      dueSoon: dueSoonModels.length,
    },
    hasCriticalOverdue,
    overdueModelIds: overdueModels.map((m) => m.modelId),
    dueSoonModelIds: dueSoonModels.map((m) => m.modelId),
    models,
  };

  return NextResponse.json(body, {
    status: hasCriticalOverdue ? 503 : 200,
    headers: gate.headers,
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
