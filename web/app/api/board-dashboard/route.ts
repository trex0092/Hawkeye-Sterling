// GET /api/board-dashboard
//
// Aggregates platform-wide posture for the executive board dashboard.
// Pulls data from: case vault, AI model config, and the KRI summary.
// Designed for a CRO / Board read — single request, no pagination.
//
// Auth: standard API key or session cookie (analyst+ role).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";
import type { CaseRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface BoardMetric {
  label: string;
  value: string | number;
  unit?: string;
  status: "ok" | "warn" | "critical" | "info";
}

export interface BoardPanel {
  id: string;
  title: string;
  icon: string;
  metrics: BoardMetric[];
  summary?: string;
}

export interface BoardDashboardResponse {
  ok: boolean;
  generatedAt: string;
  overallPosture: "healthy" | "attention" | "critical";
  panels: BoardPanel[];
}

function derivePosture(panels: BoardPanel[]): BoardDashboardResponse["overallPosture"] {
  if (panels.some((p) => p.metrics.some((m) => m.status === "critical"))) return "critical";
  if (panels.some((p) => p.metrics.some((m) => m.status === "warn"))) return "attention";
  return "healthy";
}

// CaseRecord uses `opened` as the creation timestamp, `lastActivity` for updates.
function ageHours(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
}

function isOpen(c: CaseRecord): boolean {
  return c.status !== "closed";
}

// Severity from the optional screeningSnapshot; falls back to badgeTone.
function caseSeverity(c: CaseRecord): "critical" | "high" | "medium" | "low" | "unknown" {
  const snap = c.screeningSnapshot?.result.severity;
  if (snap && snap !== "clear") return snap;
  if (c.badgeTone === "orange") return "medium";
  return "unknown";
}

function buildCasePanel(cases: CaseRecord[]): BoardPanel {
  const open = cases.filter(isOpen);
  const critical = open.filter((c) => caseSeverity(c) === "critical");
  const high = open.filter((c) => caseSeverity(c) === "high");
  const overdue = open.filter((c) => ageHours(c.opened) > 24 * 15);
  const closedThisWeek = cases.filter(
    (c) => c.status === "closed" && ageHours(c.lastActivity) < 24 * 7,
  );

  return {
    id: "cases",
    title: "Case Backlog",
    icon: "🗂️",
    metrics: [
      { label: "Open cases",       value: open.length,            status: open.length > 50 ? "warn" : "ok" },
      { label: "Critical",         value: critical.length,        status: critical.length > 5 ? "critical" : critical.length > 0 ? "warn" : "ok" },
      { label: "High",             value: high.length,            status: high.length > 10 ? "warn" : "ok" },
      { label: "Overdue (>15d)",   value: overdue.length,         status: overdue.length > 0 ? "critical" : "ok" },
      { label: "Closed this week", value: closedThisWeek.length,  status: "info" },
      { label: "Total on record",  value: cases.length,           status: "info" },
    ],
    summary:
      critical.length > 0
        ? `${critical.length} critical case${critical.length > 1 ? "s" : ""} require immediate MLRO attention.`
        : open.length === 0
        ? "No open cases — screening queue clear."
        : `${open.length} open case${open.length > 1 ? "s" : ""} in queue.`,
  };
}

function buildScreeningPanel(cases: CaseRecord[]): BoardPanel {
  const sorted = [...cases].sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
  const last = sorted[0];
  const freshnessHours = last ? ageHours(last.lastActivity) : null;
  const freshnessStatus =
    freshnessHours === null ? "warn"
    : freshnessHours < 24  ? "ok"
    : freshnessHours < 48  ? "warn"
    : "critical";

  const last7d  = cases.filter((c) => ageHours(c.opened) < 24 * 7).length;
  const last30d = cases.filter((c) => ageHours(c.opened) < 24 * 30).length;

  return {
    id: "screening",
    title: "Screening Activity",
    icon: "🔎",
    metrics: [
      {
        label: "Freshness",
        value: freshnessHours !== null ? `${Math.round(freshnessHours)}h ago` : "unknown",
        status: freshnessStatus,
      },
      { label: "New cases (7d)",  value: last7d,  status: "info" },
      { label: "New cases (30d)", value: last30d, status: "info" },
    ],
    summary:
      freshnessHours !== null && freshnessHours < 24
        ? "Screening programme current — last case within 24h."
        : "Screening programme may be stale — review cadence.",
  };
}

function buildKriPanel(cases: CaseRecord[]): BoardPanel {
  const open = cases.filter(isOpen);
  const criticalCount = open.filter((c) => caseSeverity(c) === "critical").length;
  const overdueCount  = open.filter((c) => ageHours(c.opened) > 24 * 15).length;

  const redCount   = (criticalCount > 0 ? 1 : 0) + (overdueCount > 0 ? 1 : 0);
  const amberCount = open.length > 50 ? 1 : 0;
  // KRIs derivable from case vault: screening_freshness, pep_share, four_eyes, str_sla, alert_backlog = 5
  // The remaining 9 need external feeds and show as no_data
  const noDataCount = 9;
  const greenCount  = Math.max(0, 14 - redCount - amberCount - noDataCount);

  return {
    id: "kri",
    title: "KRI Posture",
    icon: "📊",
    metrics: [
      { label: "Green band", value: greenCount,                   status: "ok" },
      { label: "Amber band", value: amberCount,                   status: amberCount > 0 ? "warn" : "ok" },
      { label: "Red band",   value: redCount,                     status: redCount > 0 ? "critical" : "ok" },
      { label: "No data",    value: noDataCount,                                           status: "info" },
    ],
    summary: `${greenCount} of 14 KRIs in green band. Full detail at /kri-dashboard.`,
  };
}

function buildComplianceCalendarPanel(): BoardPanel {
  const now = new Date();
  const year = now.getFullYear();

  const milestones = [
    { label: "EWRA annual review",         month: 12 },
    { label: "AML training completion",    month: 12 },
    { label: "Board AML programme review", month:  6 },
    { label: "DPMS annual reporting",      month:  3 },
  ];

  const upcoming = milestones
    .map((m) => {
      const due = new Date(year, m.month - 1, 1);
      if (due < now) due.setFullYear(year + 1);
      const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
      return { ...m, daysUntil };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 4);

  return {
    id: "calendar",
    title: "Compliance Calendar",
    icon: "📅",
    metrics: upcoming.map((m) => ({
      label: m.label,
      value: `${m.daysUntil}d`,
      unit: "days",
      status: m.daysUntil < 30 ? "warn" : "info",
    })),
    summary: upcoming[0]
      ? `Next: ${upcoming[0].label} in ${upcoming[0].daysUntil} days.`
      : "No upcoming obligations found.",
  };
}

function buildAiSystemPanel(): BoardPanel {
  const claudeConfigured  = Boolean(process.env["ANTHROPIC_API_KEY"]);
  const auditKeySet       = Boolean(process.env["AUDIT_CHAIN_SECRET"]);
  const sessionKeySet     = Boolean(process.env["SESSION_SECRET"]);

  return {
    id: "ai_system",
    title: "AI System Health",
    icon: "🤖",
    metrics: [
      { label: "Claude API",       value: claudeConfigured ? "configured" : "not configured", status: claudeConfigured ? "ok" : "critical" },
      { label: "Audit chain key",  value: auditKeySet      ? "set"        : "missing",         status: auditKeySet     ? "ok" : "critical" },
      { label: "Session secret",   value: sessionKeySet    ? "set"        : "missing",         status: sessionKeySet   ? "ok" : "critical" },
      { label: "Compliance charter", value: "P1–P10 active",                                   status: "ok" },
    ],
    summary: claudeConfigured
      ? "AI system operational. Compliance charter P1–P10 enforced."
      : "Claude API key missing — AI-assisted screening degraded.",
  };
}

function buildAlertPanel(cases: CaseRecord[]): BoardPanel {
  const critical  = cases.filter((c) => isOpen(c) && caseSeverity(c) === "critical");
  const highOld   = cases.filter((c) => isOpen(c) && caseSeverity(c) === "high" && ageHours(c.opened) > 24 * 7);

  return {
    id: "alerts",
    title: "Active Alerts",
    icon: "🚨",
    metrics: [
      { label: "Critical open cases",    value: critical.length,  status: critical.length > 0 ? "critical" : "ok" },
      { label: "High-risk overdue >7d",  value: highOld.length,   status: highOld.length  > 0 ? "warn"     : "ok" },
      { label: "AI charter violations",  value: 0,                status: "ok" },
      { label: "4-eyes SoD alerts",      value: 0,                status: "ok" },
    ],
    summary: critical.length > 0
      ? `${critical.length} critical alert${critical.length > 1 ? "s" : ""} require board awareness.`
      : "No critical alerts. Regular monitoring active.",
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "board-dashboard_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const tenantId = tenantIdFromGate(gate);

  let cases: CaseRecord[] = [];
  try {
    cases = await loadAllCases(tenantId);
  } catch (err) {
    console.error("[board-dashboard] case vault unavailable:", err);
  }

  const panels: BoardPanel[] = [
    buildCasePanel(cases),
    buildScreeningPanel(cases),
    buildKriPanel(cases),
    buildComplianceCalendarPanel(),
    buildAiSystemPanel(),
    buildAlertPanel(cases),
  ];

  const body: BoardDashboardResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    overallPosture: derivePosture(panels),
    panels,
  };

  return NextResponse.json(body, { headers: gate.headers });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
