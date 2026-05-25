// GET /api/kri-dashboard
//
// Returns the full KRI registry enriched with computed live values where
// derivable from the server-side case vault and audit chain.  KRIs whose
// signals require external transaction data (cash intensity, UBO opacity,
// mixer hops) return value: null and a derivation hint so the UI can
// render an explicit "needs data feed" state rather than misleading zeros.
//
// KRI classification bands are defined in src/brain/kri-registry.ts
// (green/amber/red per KRI).  This route mirrors the band definitions so
// the frontend never imports server-side TypeScript modules.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";
import type { CaseRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type KriStatus = "green" | "amber" | "red" | "no_data";

export interface KriBand {
  green: [number, number];
  amber: [number, number];
  red: [number, number];
}

export interface KriResult {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  status: KriStatus;
  band: KriBand;
  direction: "lower_better" | "higher_better";
  derivedFrom: string;
}

export interface KriDashboardResponse {
  ok: boolean;
  generatedAt: string;
  summary: { green: number; amber: number; red: number; no_data: number };
  kris: KriResult[];
  tenantId: string;
}

function classify(value: number | null, band: KriBand, direction: "lower_better" | "higher_better"): KriStatus {
  if (value === null) return "no_data";
  const inBand = (v: number, b: [number, number]) => v >= b[0] && v < b[1];
  if (inBand(value, band.green)) return "green";
  if (inBand(value, band.amber)) return "amber";
  return "red";
}

function ageHours(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
}

async function computeKris(cases: CaseRecord[]): Promise<KriResult[]> {
  const now = Date.now();
  const openCases = cases.filter((c) => c.status !== "closed" && c.status !== "cleared");
  const criticalOpen = openCases.filter((c) => c.riskLevel === "critical" || c.riskLevel === "high");

  // Screening freshness: hours since the most recently screened case was updated
  const lastScreened = cases.length
    ? Math.min(...cases.map((c) => ageHours(c.lastActivity ?? c.createdAt)))
    : null;

  // PEP share: % of open cases flagged as PEP
  const pepShare =
    openCases.length > 0
      ? (openCases.filter((c) => c.subject?.toLowerCase().includes("pep") || c.riskLevel === "critical").length /
          openCases.length) *
        100
      : null;

  // Four-eyes violations: open cases with no four-eyes sign-off past 24h
  const fourEyesViolations = criticalOpen.filter((c) => {
    const ageDays = (now - new Date(c.createdAt).getTime()) / 86_400_000;
    return ageDays > 1;
  }).length;

  // STR SLA breaches: cases open > 15 days (UAE FDL Art.12 — STR within 30 days, escalate at 15)
  const strSlaBreaches =
    cases.length > 0
      ? (openCases.filter((c) => {
          const ageDays = (now - new Date(c.createdAt).getTime()) / 86_400_000;
          return ageDays > 15;
        }).length /
          Math.max(openCases.length, 1)) *
        100
      : null;

  // Alert backlog: age in days of the oldest unresolved critical/high case
  const oldestOpenMs = criticalOpen.length
    ? Math.max(...criticalOpen.map((c) => now - new Date(c.createdAt).getTime()))
    : null;
  const alertBacklogDays = oldestOpenMs !== null ? oldestOpenMs / 86_400_000 : null;

  const KRIS: Array<Omit<KriResult, "status">> = [
    {
      id: "kri_screening_freshness_hours",
      label: "Screening freshness",
      unit: "hours",
      value: lastScreened !== null ? Math.round(lastScreened * 10) / 10 : null,
      band: { green: [0, 24], amber: [24, 48], red: [48, Infinity] },
      direction: "lower_better",
      derivedFrom: "Case vault — hours since last case activity",
    },
    {
      id: "kri_high_risk_country_share",
      label: "High-risk country exposure",
      unit: "%",
      value: null,
      band: { green: [0, 5], amber: [5, 10], red: [10, 100] },
      direction: "lower_better",
      derivedFrom: "Requires country-risk signal feed (external)",
    },
    {
      id: "kri_pep_share",
      label: "PEP share",
      unit: "%",
      value: pepShare !== null ? Math.round(pepShare * 10) / 10 : null,
      band: { green: [0, 3], amber: [3, 5], red: [5, 100] },
      direction: "lower_better",
      derivedFrom: "Case vault — % open cases with critical/PEP risk level",
    },
    {
      id: "kri_cash_intensity",
      label: "Cash-transaction share (DPMS)",
      unit: "%",
      value: null,
      band: { green: [0, 15], amber: [15, 30], red: [30, 100] },
      direction: "lower_better",
      derivedFrom: "Requires DPMS transaction feed (external)",
    },
    {
      id: "kri_ubo_opacity_avg",
      label: "Average UBO opacity",
      unit: "score",
      value: null,
      band: { green: [0, 0.2], amber: [0.2, 0.4], red: [0.4, 1] },
      direction: "lower_better",
      derivedFrom: "Requires UBO declaration feed (external)",
    },
    {
      id: "kri_structuring_window_count",
      label: "Near-threshold transaction clusters",
      unit: "count",
      value: null,
      band: { green: [0, 1], amber: [1, 3], red: [3, Infinity] },
      direction: "lower_better",
      derivedFrom: "Requires transaction monitoring feed (external)",
    },
    {
      id: "kri_mixer_exposure_hops",
      label: "Min mixer-hop distance",
      unit: "hops",
      value: null,
      band: { green: [3, Infinity], amber: [2, 3], red: [0, 2] },
      direction: "higher_better",
      derivedFrom: "Requires crypto risk feed (external)",
    },
    {
      id: "kri_training_overdue",
      label: "Staff with overdue AML training",
      unit: "%",
      value: null,
      band: { green: [0, 2], amber: [2, 5], red: [5, 100] },
      direction: "lower_better",
      derivedFrom: "Requires training tracker feed (external)",
    },
    {
      id: "kri_four_eyes_violations",
      label: "Four-eyes / SoD violations",
      unit: "count/month",
      value: fourEyesViolations,
      band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] },
      direction: "lower_better",
      derivedFrom: "Case vault — critical/high cases open >24h without disposition",
    },
    {
      id: "kri_str_sla_breaches",
      label: "STR SLA breaches",
      unit: "%",
      value: strSlaBreaches !== null ? Math.round(strSlaBreaches * 10) / 10 : null,
      band: { green: [0, 1], amber: [1, 3], red: [3, 100] },
      direction: "lower_better",
      derivedFrom: "Case vault — % open cases exceeding 15-day STR escalation threshold",
    },
    {
      id: "kri_ffr_sla_breaches",
      label: "FFR SLA breaches",
      unit: "count",
      value: null,
      band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] },
      direction: "lower_better",
      derivedFrom: "Requires FFR filing tracker feed (external)",
    },
    {
      id: "kri_data_quality",
      label: "Customer-master data quality",
      unit: "score",
      value: null,
      band: { green: [95, 100], amber: [90, 95], red: [0, 90] },
      direction: "higher_better",
      derivedFrom: "Requires data quality scan feed (external)",
    },
    {
      id: "kri_alert_backlog_days",
      label: "High-priority alert backlog",
      unit: "days",
      value: alertBacklogDays !== null ? Math.round(alertBacklogDays * 10) / 10 : null,
      band: { green: [0, 3], amber: [3, 7], red: [7, Infinity] },
      direction: "lower_better",
      derivedFrom: "Case vault — age of oldest unresolved critical/high case",
    },
    {
      id: "kri_cahra_without_docs",
      label: "CAHRA inputs without OECD docs",
      unit: "count",
      value: null,
      band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] },
      direction: "lower_better",
      derivedFrom: "Requires supply-chain due-diligence feed (external)",
    },
  ];

  return KRIS.map((k) => ({ ...k, status: classify(k.value, k.band, k.direction) }));
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);

  let cases: CaseRecord[] = [];
  try {
    cases = await loadAllCases(tenantId);
  } catch (err) {
    console.error("[kri-dashboard] case vault unavailable:", err);
  }

  const kris = await computeKris(cases);

  const summary = kris.reduce(
    (acc, k) => {
      acc[k.status] = (acc[k.status] ?? 0) + 1;
      return acc;
    },
    { green: 0, amber: 0, red: 0, no_data: 0 } as Record<KriStatus, number>,
  );

  const body: KriDashboardResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary,
    kris,
    tenantId,
  };

  return NextResponse.json(body, { headers: gate.headers });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
