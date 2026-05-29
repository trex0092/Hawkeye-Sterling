// GET /api/ai-governance
// Returns the AI model registry and governance policy.
// Satisfies Leader's Action Checklist: "Inventory AI systems, models and data flows."

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { MODEL_REGISTRY, GOVERNANCE_POLICY } from "@/lib/server/ai-governance";
import { getBiasReport } from "@/lib/server/bias-monitor";
import { getDriftReport } from "@/lib/server/drift-monitor";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const [biasReport, driftReport] = await Promise.all([
    getBiasReport(tenant).catch(() => null),
    getDriftReport(tenant).catch(() => null),
  ]);

  void writeAuditChainEntry(
    { event: "ai.governance_accessed", actor: gate.keyId, meta: {} },
    tenant,
  ).catch(() => undefined);

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      policy: GOVERNANCE_POLICY,
      models: MODEL_REGISTRY,
      biasMonitor: biasReport
        ? {
            lastReport: biasReport.generatedAt,
            sampleSize: biasReport.sampleSize,
            biasDetected: biasReport.biasDetected,
            globalMean: biasReport.globalMean,
            flaggedGroups: biasReport.groups
              .filter((g) => g.flagged)
              .map((g) => ({ script: g.script, biasRatio: g.biasRatio, count: g.count })),
            nationalityBias: {
              score: biasReport.nationalityBiasScore,
              detected: biasReport.nationalityBiasDetected,
              flaggedNationalities: biasReport.nationalityGroups.filter((g) => g.flagged).length,
            },
          }
        : { status: "no_data", note: "Bias report generated after 100 screenings" },
      driftMonitor: driftReport
        ? {
            lastReport: driftReport.generatedAt,
            sampleSize: driftReport.sampleSize,
            driftDetected: driftReport.driftDetected,
            driftReason: driftReport.driftReason ?? null,
            approveRateThisWeek: driftReport.thisWeek.approveRate,
            scoreDrift: driftReport.scoreDrift,
            scoreDriftAlert: driftReport.scoreDriftAlert,
          }
        : { status: "no_data", note: "Drift report generated after first AI decisions" },
    },
    { headers: gate.headers },
  );
}
