// GET /api/kri-dashboard
//
// Returns the full KRI registry enriched with computed live values where
// derivable from the server-side case vault.  KRIs whose signals require
// external transaction data (cash intensity, UBO opacity, mixer hops)
// return value: null and a derivation hint so the UI can render an
// explicit "needs data feed" state rather than misleading zeros.
//
// KRI classification bands are defined in src/brain/kri-registry.ts
// (green/amber/red per KRI).  This route mirrors the band definitions so
// the frontend never imports server-side TypeScript modules.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";
import { getOverdueModels } from "@/lib/server/ai-governance";
import { summarizeObligations } from "../../../../src/brain/regulatory-obligations.js";
import { computeVendorConcentration } from "../../../../src/brain/vendor-register.js";
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

function classify(value: number | null, band: KriBand, _direction: "lower_better" | "higher_better"): KriStatus {
  if (value === null) return "no_data";
  const inBand = (v: number, b: [number, number]) => v >= b[0] && (b[1] === Infinity ? true : v <= b[1]);
  if (inBand(value, band.green)) return "green";
  if (inBand(value, band.amber)) return "amber";
  return "red";
}


// Severity from the optional screeningSnapshot; falls back to badgeTone heuristic.
function caseSeverity(c: CaseRecord): "critical" | "high" | "medium" | "low" | "unknown" {
  const snap = c.screeningSnapshot?.result.severity;
  if (snap && snap !== "clear") return snap;
  if (c.badgeTone === "orange") return "medium";
  return "unknown";
}

function isOpenCase(c: CaseRecord): boolean {
  return c.status !== "closed";
}

async function computeKris(cases: CaseRecord[]): Promise<KriResult[]> {
  const now = Date.now();
  const openCases = cases.filter(isOpenCase);
  const criticalOpen = openCases.filter((c) => {
    const sev = caseSeverity(c);
    return sev === "critical" || sev === "high";
  });

  // Screening freshness: hours since the most recently active case
  const lastActivityMs = cases.length
    ? Math.max(...cases.map((c) => new Date(c.lastActivity).getTime()))
    : null;
  const lastScreened = lastActivityMs !== null ? (now - lastActivityMs) / 3_600_000 : null;

  // PEP share: % of open cases where subject name contains "pep" (crude proxy)
  const pepMatches = openCases.filter((c) => c.subject.toLowerCase().includes("pep")).length;
  const pepShare = openCases.length > 0 ? (pepMatches / openCases.length) * 100 : null;

  // Four-eyes violations: critical/high cases open > 24 h without disposition
  const fourEyesViolations = criticalOpen.filter((c) => {
    const ageDays = (now - new Date(c.opened).getTime()) / 86_400_000;
    return ageDays > 1 && !c.mlroDisposition;
  }).length;

  // STR SLA breaches: open cases older than 15 days (escalation threshold)
  const strSlaBreaches =
    cases.length > 0
      ? (openCases.filter((c) => {
          const ageDays = (now - new Date(c.opened).getTime()) / 86_400_000;
          return ageDays > 15;
        }).length /
          Math.max(openCases.length, 1)) *
        100
      : null;

  // Alert backlog: age in days of the oldest unresolved critical/high case
  const oldestOpenMs = criticalOpen.length
    ? Math.max(...criticalOpen.map((c) => now - new Date(c.opened).getTime()))
    : null;
  const alertBacklogDays = oldestOpenMs !== null ? oldestOpenMs / 86_400_000 : null;

  // Regulatory obligations: standing-obligation register plus any MODEL_REGISTRY
  // entries past their attestation date — both are missed compliance deadlines.
  const obligations = summarizeObligations(now);
  const overdueModels = getOverdueModels().length;
  const regulatoryOverdue = obligations.overdue + overdueModels;

  // Vendor concentration: % of platform functions served by a single provider
  // with no alternate (ISO 42001 Clause 8.4 supply-chain risk).
  const vendorConcentration = computeVendorConcentration();

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
      derivedFrom: "Case vault — % open cases with 'pep' in subject name",
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
      derivedFrom: "Case vault — critical/high cases open >24h without MLRO disposition",
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
    {
      id: "kri_regulatory_obligation_overdue",
      label: "Regulatory obligations overdue",
      unit: "count",
      value: regulatoryOverdue,
      band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] },
      direction: "lower_better",
      derivedFrom:
        overdueModels > 0 || obligations.overdueIds.length > 0
          ? `Obligations register + model attestations — overdue: ${[...obligations.overdueIds, ...(overdueModels > 0 ? [`${overdueModels} model attestation(s)`] : [])].join(", ")}`
          : "Obligations register (src/brain/regulatory-obligations.ts) + MODEL_REGISTRY attestation status",
    },
    {
      id: "kri_vendor_concentration",
      label: "Single-vendor function concentration",
      unit: "%",
      value: vendorConcentration.concentrationPct,
      band: { green: [0, 20], amber: [20, 50], red: [50, 100] },
      direction: "lower_better",
      derivedFrom: vendorConcentration.singleProviderFunctions.length
        ? `Vendor register (HS-OPS-003) — single-provider functions: ${vendorConcentration.singleProviderFunctions.join(", ")}`
        : "Vendor register (HS-OPS-003) — no single-provider functions",
    },
    {
      id: "kri_privacy_request_overdue",
      label: "Privacy requests past statutory window",
      unit: "count",
      value: null,
      band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] },
      direction: "lower_better",
      derivedFrom: "Requires privacy-request intake log (operator feed)",
    },
    {
      id: "kri_training_completion",
      label: "Staff AML/AI training completion",
      unit: "%",
      value: null,
      band: { green: [98, 100], amber: [90, 98], red: [0, 90] },
      direction: "higher_better",
      derivedFrom: "Requires training tracker feed (external)",
    },
    {
      id: "kri_repeat_control_failures",
      label: "Repeat control failures (rolling 12 months)",
      unit: "count",
      value: null,
      band: { green: [0, 0], amber: [0, 1], red: [1, Infinity] },
      direction: "lower_better",
      derivedFrom: "Requires control-test result log (calibration/CI feed)",
    },
  ];

  return KRIS.map((k) => ({ ...k, status: classify(k.value, k.band, k.direction) }));
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "kri-dashboard_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

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
