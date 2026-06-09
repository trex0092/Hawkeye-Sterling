// GET /api/responsible-ai-dashboard
//
// Responsible AI metrics aggregator. Surfaces bias monitor, drift monitor,
// false-positive optimiser proposals, and cognitive-load signals in a single
// dashboard payload so the MLRO can assess overall AI governance health at a
// glance.
//
// Regulatory basis: UAE Federal Decree-Law No. 10 of 2025 Art.18 (AI audit trail), FATF R.10
// (non-discrimination), UNESCO Principle 3 (Fairness).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { getBiasReport } from "@/lib/server/bias-monitor";
import { getDriftReport } from "@/lib/server/drift-monitor";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ── Type helpers ─────────────────────────────────────────────────────────────

type BiasStatus = "compliant" | "warning" | "breach";
type OverallHealth = "green" | "yellow" | "red";

interface DriftSection {
  status: string;
  lastChecked: string;
  flaggedDecisions: number;
}

interface BiasSection {
  overallBiasRatio: number;
  status: BiasStatus;
  lastAuditAt: string;
}

interface FpOptimizerSection {
  pendingProposals: number;
  lastOptimizationAt: string | null;
}

interface CognitiveLoadSection {
  analystsAtRisk: number;
  totalAnalysts: number;
}

interface DashboardResponse {
  ok: true;
  drift: DriftSection | null;
  bias: BiasSection | null;
  fpOptimizer: FpOptimizerSection | null;
  cognitiveLoad: CognitiveLoadSection | null;
  summary: {
    overallHealth: OverallHealth;
    issues: string[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive a BiasStatus from the stored report's biasDetected flag and max ratio. */
function deriveBiasStatus(maxRatio: number, biasDetected: boolean): BiasStatus {
  if (biasDetected || maxRatio > 1.5) return "breach";
  if (maxRatio > 1.15) return "warning";
  return "compliant";
}

/** Compute overall health from sub-section data. */
function computeHealth(
  drift: DriftSection | null,
  bias: BiasSection | null,
  issues: string[],
): OverallHealth {
  if (
    (bias && bias.status === "breach") ||
    (drift && drift.status === "critical")
  ) {
    return "red";
  }
  if (issues.length > 0) return "yellow";
  return "green";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenant = tenantIdFromGate(gate);

  // ── Bias monitor ──────────────────────────────────────────────────────────
  let bias: BiasSection | null = null;
  try {
    const report = await getBiasReport(tenant);
    if (report) {
      const maxRatio = report.groups.reduce(
        (m, g) => Math.max(m, g.biasRatio),
        0,
      );
      bias = {
        overallBiasRatio: maxRatio,
        status: deriveBiasStatus(maxRatio, report.biasDetected),
        lastAuditAt: report.generatedAt,
      };
    }
  } catch {
    // Non-fatal — leave bias null.
  }

  // ── Drift monitor ─────────────────────────────────────────────────────────
  let drift: DriftSection | null = null;
  try {
    const report = await getDriftReport(tenant);
    if (report) {
      const status =
        report.driftDetected || report.scoreDriftAlert ? "critical" :
        report.thisWeek.approveRate > 0.6 ? "elevated" : "nominal";
      drift = {
        status,
        lastChecked: report.generatedAt,
        flaggedDecisions: report.driftDetected || report.scoreDriftAlert ? report.thisWeek.count : 0,
      };
    }
  } catch {
    // Non-fatal — leave drift null.
  }

  // ── FP optimiser proposals ────────────────────────────────────────────────
  let fpOptimizer: FpOptimizerSection | null = null;
  try {
    const safeTenant = tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
    const proposals = await getJson<
      Array<{ createdAt?: string; proposedAt?: string }>
    >(`hs-fp-optimizer/${safeTenant}/proposals.json`);
    if (proposals !== null) {
      const sorted = [...proposals].sort((a, b) => {
        const ta = a.createdAt ?? a.proposedAt ?? "";
        const tb = b.createdAt ?? b.proposedAt ?? "";
        return tb.localeCompare(ta);
      });
      fpOptimizer = {
        pendingProposals: proposals.length,
        lastOptimizationAt: sorted[0]?.createdAt ?? sorted[0]?.proposedAt ?? null,
      };
    }
  } catch {
    // Non-fatal — leave fpOptimizer null.
  }

  // ── Cognitive load ────────────────────────────────────────────────────────
  let cognitiveLoad: CognitiveLoadSection | null = null;
  try {
    const safeTenant = tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
    const keys = await listKeys(`hs-cognitive-load/${safeTenant}/`);
    if (keys.length > 0) {
      // Each key represents a unique analyst event stream.
      // Consider an analyst "at risk" if they have ≥5 load events recorded.
      const analystCounts = new Map<string, number>();
      for (const key of keys) {
        // Key pattern: hs-cognitive-load/<tenant>/<analystId>[/<suffix>]
        const parts = key.split("/");
        const analystId = parts[2] ?? "unknown";
        analystCounts.set(analystId, (analystCounts.get(analystId) ?? 0) + 1);
      }
      const totalAnalysts = analystCounts.size;
      const analystsAtRisk = Array.from(analystCounts.values()).filter(
        (count) => count >= 5,
      ).length;
      cognitiveLoad = { analystsAtRisk, totalAnalysts };
    }
  } catch {
    // Non-fatal — leave cognitiveLoad null.
  }

  // ── Summary health ────────────────────────────────────────────────────────
  const issues: string[] = [];

  if (bias) {
    if (bias.status === "breach") {
      issues.push(`Bias breach detected — overall bias ratio ${bias.overallBiasRatio.toFixed(2)} exceeds 1.5 threshold (FATF R.10)`);
    } else if (bias.status === "warning") {
      issues.push(`Bias warning — overall bias ratio ${bias.overallBiasRatio.toFixed(2)} exceeds 1.15 advisory threshold`);
    }
  }

  if (drift) {
    if (drift.status === "critical") {
      issues.push(`Model drift alert — ${drift.flaggedDecisions} flagged decision(s) detected this period`);
    } else if (drift.status === "elevated") {
      issues.push("Elevated approval rate this week — monitor for model drift");
    }
  }

  if (cognitiveLoad && cognitiveLoad.analystsAtRisk > 0) {
    issues.push(
      `${cognitiveLoad.analystsAtRisk}/${cognitiveLoad.totalAnalysts} analyst(s) showing high cognitive load indicators`,
    );
  }

  if (fpOptimizer && fpOptimizer.pendingProposals > 0) {
    issues.push(
      `${fpOptimizer.pendingProposals} pending false-positive optimiser proposal(s) awaiting review`,
    );
  }

  const overallHealth = computeHealth(drift, bias, issues);

  await writeAuditChainEntry(
    {
      event: "ai.responsible_dashboard_accessed",
      actor: gate.keyId,
      meta: {},
    },
    tenant,
  );

  const payload: DashboardResponse = {
    ok: true,
    drift,
    bias,
    fpOptimizer,
    cognitiveLoad,
    summary: {
      overallHealth,
      issues,
    },
  };

  return NextResponse.json(payload, { headers: gate.headers });
}
