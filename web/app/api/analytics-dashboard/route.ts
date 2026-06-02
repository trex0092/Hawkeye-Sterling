// GET /api/analytics-dashboard
//
// Returns KPI data for the finance analytics dashboard:
// screening volumes, risk distribution, goAML pipeline, bias ratio,
// false-positive rate. Pulls from in-process metrics-store + case vault.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getCounters, getGauges } from "@/lib/server/metrics-store";
import { loadAllCases } from "@/lib/server/case-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface KpiTile {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  status: "green" | "amber" | "red" | "info";
  detail?: string;
}

export interface RiskBucket {
  tier: "high" | "medium" | "low";
  count: number;
  pct: number;
}

export interface GoamlPipelineItem {
  stage: string;
  count: number;
  status: "green" | "amber" | "red";
}

export interface AnalyticsDashboardResponse {
  ok: boolean;
  generatedAt: string;
  tenantId: string;
  kpis: KpiTile[];
  riskDistribution: RiskBucket[];
  goamlPipeline: GoamlPipelineItem[];
  biasRatio: number | null;
  driftScore: number | null;
}

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  const [counters, gauges, cases] = await Promise.all([
    Promise.resolve(getCounters()),
    Promise.resolve(getGauges()),
    loadAllCases(tenantId).catch(() => [] as Awaited<ReturnType<typeof loadAllCases>>),
  ]);

  // ── Risk distribution from cases ────────────────────────────────────────────
  const totalCases = cases.length;
  const highCount  = cases.filter((c) => (c as { riskScore?: number }).riskScore != null && (c as unknown as { riskScore: number }).riskScore >= 0.75).length;
  const medCount   = cases.filter((c) => {
    const s = (c as { riskScore?: number }).riskScore;
    return s != null && s >= 0.40 && s < 0.75;
  }).length;
  const lowCount   = Math.max(0, totalCases - highCount - medCount);

  const riskDistribution: RiskBucket[] = [
    { tier: "high",   count: highCount, pct: totalCases ? Math.round((highCount / totalCases) * 100) : 0 },
    { tier: "medium", count: medCount,  pct: totalCases ? Math.round((medCount  / totalCases) * 100) : 0 },
    { tier: "low",    count: lowCount,  pct: totalCases ? Math.round((lowCount  / totalCases) * 100) : 0 },
  ];

  // ── Metrics from counters/gauges ─────────────────────────────────────────────
  const biasRatio: number | null = gauges.find(e => e.key === "hawkeye_bias_ratio")?.value ?? null;
  const driftScore: number | null = gauges.find(e => e.key === "hawkeye_drift_score")?.value ?? null;
  const screeningTotal = counters.find(e => e.key === "hawkeye_screening_requests_total")?.value ?? 0;
  const sarFiled  = counters.find(e => e.key === "hawkeye_sar_filings_total")?.value ?? 0;
  const fpCount   = counters.find(e => e.key === "hawkeye_false_positives_total")?.value ?? 0;
  const fpRate    = screeningTotal > 0 ? Math.round((fpCount / screeningTotal) * 100) : null;

  // ── KPI tiles ────────────────────────────────────────────────────────────────
  const kpis: KpiTile[] = [
    {
      id: "total-cases",
      label: "Total Cases",
      value: totalCases,
      status: "info",
      detail: "All cases in vault",
    },
    {
      id: "high-risk",
      label: "High Risk Cases",
      value: highCount,
      unit: `${riskDistribution[0]?.pct ?? 0}%`,
      status: highCount > 0 ? "red" : "green",
      trend: "stable",
      detail: "Risk score ≥ 0.75 — EDD required",
    },
    {
      id: "sar-filed",
      label: "SARs Filed",
      value: sarFiled,
      status: sarFiled > 0 ? "amber" : "green",
      detail: "Suspicious Activity Reports submitted",
    },
    {
      id: "fp-rate",
      label: "False Positive Rate",
      value: fpRate !== null ? `${fpRate}%` : "—",
      status: fpRate !== null ? (fpRate <= 15 ? "green" : fpRate <= 25 ? "amber" : "red") : "info",
      detail: "Target ≤ 15%",
    },
    {
      id: "bias-ratio",
      label: "Bias Ratio",
      value: biasRatio !== null ? biasRatio.toFixed(2) : "—",
      status: biasRatio !== null ? (biasRatio <= 1.15 ? "green" : biasRatio <= 1.5 ? "amber" : "red") : "info",
      detail: "Target ≤ 1.15 (platform) / ≤ 1.5 (FATF R.10 floor)",
    },
    {
      id: "drift-score",
      label: "Model Drift Score",
      value: driftScore !== null ? driftScore.toFixed(3) : "—",
      status: driftScore !== null ? (driftScore < 0.1 ? "green" : driftScore < 0.2 ? "amber" : "red") : "info",
      detail: "Target < 0.10",
    },
  ];

  // ── goAML pipeline ────────────────────────────────────────────────────────────
  const goamlPipeline: GoamlPipelineItem[] = [
    {
      stage: "Pending MLRO Review",
      count: cases.filter((c) => (c as { status?: string }).status === "pending_review").length,
      status: "amber",
    },
    {
      stage: "SAR Drafted",
      count: cases.filter((c) => (c as { status?: string }).status === "sar_drafted").length,
      status: "amber",
    },
    {
      stage: "Submitted to FIU",
      count: sarFiled,
      status: "green",
    },
    {
      stage: "Four-Eyes Pending",
      count: cases.filter((c) => (c as { status?: string }).status === "four_eyes_pending").length,
      status: (cases.filter((c) => (c as { status?: string }).status === "four_eyes_pending").length) > 0 ? "amber" : "green",
    },
  ];

  const body: AnalyticsDashboardResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    tenantId,
    kpis,
    riskDistribution,
    goamlPipeline,
    biasRatio,
    driftScore,
  };

  return NextResponse.json(body, { headers: gate.headers });
}
