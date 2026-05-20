// GET /api/ai-governance
// Returns the AI model registry and governance policy.
// Satisfies Leader's Action Checklist: "Inventory AI systems, models and data flows."

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { MODEL_REGISTRY, GOVERNANCE_POLICY } from "@/lib/server/ai-governance";
import { getBiasReport } from "@/lib/server/bias-monitor";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const biasReport = await getBiasReport(tenant).catch(() => null);

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
            flaggedGroups: biasReport.groups
              .filter((g) => g.flagged)
              .map((g) => ({ script: g.script, biasRatio: g.biasRatio, count: g.count })),
          }
        : { status: "no_data", note: "Bias report generated after 100 screenings" },
    },
    { headers: gate.headers },
  );
}
