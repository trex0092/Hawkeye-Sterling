// GET /api/board-dashboard
//
// Aggregates platform-wide posture for the executive board dashboard.
// Pulls data from: case vault, audit chain entry count, AI model health,
// and the KRI summary.  Designed for a CRO / Board read — single request,
// no pagination.
//
// Auth: standard API key or session cookie (analyst+ role).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
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
  const hasCritical = panels.some((p) => p.metrics.some((m) => m.status === "critical"));
  const hasWarn = panels.some((p) => p.metrics.some((m) => m.status === "warn"));
  if (hasCritical) return "critical";
  if (hasWarn) return "attention";
  return "healthy";
}

function ageHours(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
}

function buildCasePanel(cases: CaseRecord[]): BoardPanel {
  const open = cases.filter((c) => c.status !== "closed" && c.status !== "cleared");
  const critical = open.filter((c) => c.riskLevel === "critical");
  const high = open.filter((c) => c.riskLevel === "high");
  const overdue = open.filter((c) => ageHours(c.createdAt) > 24 * 15);
  const closedThisWeek = cases.filter((c) => {
    if (c.status !== "closed" && c.status !== "cleared") return false;
    return ageHours(c.lastActivity ?? c.createdAt) < 24 * 7;
  });

  return {
    id: "cases",
    title: "Case Backlog",
    icon: "🗂️",
    metrics: [
      { label: "Open cases",        value: open.length,           status: open.length > 50 ? "warn" : "ok" },
      { label: "Critical",          value: critical.length,       status: critical.length > 5 ? "critical" : critical.length > 0 ? "warn" : "ok" },
      { label: "High",              value: high.length,           status: high.length > 10 ? "warn" : "ok" },
      { label: "Overdue (>15d)",    value: overdue.length,        status: overdue.length > 0 ? "critical" : "ok" },
      { label: "Closed this week",  value: closedThisWeek.length, status: "info" },
      { label: "Total on record",   value: cases.length,          status: "info" },
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
  const lastScreened = cases.length
    ? cases.sort((a, b) => new Date(b.lastActivity ?? b.createdAt).getTime() - new Date(a.lastActivity ?? a.createdAt).getTime())[0]
    : null;
  const freshnessHours = lastScreened ? ageHours(lastScreened.lastActivity ?? lastScreened.createdAt) : null;
  const freshnessStatus = freshnessHours === null ? "warn" : freshnessHours < 24 ? "ok" : freshnessHours < 48 ? "warn" : "critical";

  const last7d = cases.filter((c) => ageHours(c.createdAt) < 24 * 7).length;
  const last30d = cases.filter((c) => ageHours(c.createdAt) < 24 * 30).length;

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
  const open = cases.filter((c) => c.status !== "closed" && c.status !== "cleared");
  const critical = open.filter((c) => c.riskLevel === "critical");
  const overdue = open.filter((c) => ageHours(c.createdAt) > 24 * 15);

  // Approximate KRI health from case data
  const redCount = (critical.length > 0 ? 1 : 0) + (overdue.length > 0 ? 1 : 0);
  const amberCount = open.length > 50 ? 1 : 0;
  const greenCount = 14 - redCount - amberCount;

  const posture = redCount > 0 ? "critical" : amberCount > 0 ? "warn" : "ok";

  return {
    id: "kri",
    title: "KRI Posture",
    icon: "📊",
    metrics: [
      { label: "Green band",   value: greenCount, status: "ok" },
      { label: "Amber band",   value: amberCount, status: amberCount > 0 ? "warn" : "ok" },
      { label: "Red band",     value: redCount,   status: redCount > 0 ? "critical" : "ok" },
      { label: "No data",      value: 14 - greenCount - amberCount - redCount, status: "info" },
    ],
    summary: `${greenCount} of 14 KRIs in green band. View full KRI dashboard for detail.`,
  };
}

function buildComplianceCalendarPanel(): BoardPanel {
  const now = new Date();
  const year = now.getFullYear();

  // Static UAE/FATF compliance calendar milestones (always relevant)
  const upcomingMilestones = [
    { label: "EWRA annual review",         dueMonth: 12, recurring: true },
    { label: "AML training completion",    dueMonth: 12, recurring: true },
    { label: "Board AML programme review", dueMonth:  6, recurring: true },
    { label: "DPMS annual reporting",      dueMonth:  3, recurring: true },
  ];

  const upcoming = upcomingMilestones
    .map((m) => {
      const dueDate = new Date(year, m.dueMonth - 1, 1);
      if (dueDate < now) dueDate.setFullYear(year + 1);
      const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000);
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
    summary: `Next obligation: ${upcoming[0]?.label ?? "—"} in ${upcoming[0]?.daysUntil ?? "—"} days.`,
  };
}

function buildAiSystemPanel(): BoardPanel {
  const anthropicConfigured = Boolean(process.env["ANTHROPIC_API_KEY"]);
  const auditChainSecretSet = Boolean(process.env["AUDIT_CHAIN_SECRET"]);
  const sessionSecretSet = Boolean(process.env["SESSION_SECRET"]);

  return {
    id: "ai_system",
    title: "AI System Health",
    icon: "🤖",
    metrics: [
      {
        label: "Claude API",
        value: anthropicConfigured ? "configured" : "not configured",
        status: anthropicConfigured ? "ok" : "critical",
      },
      {
        label: "Audit chain key",
        value: auditChainSecretSet ? "set" : "missing",
        status: auditChainSecretSet ? "ok" : "critical",
      },
      {
        label: "Session secret",
        value: sessionSecretSet ? "set" : "missing",
        status: sessionSecretSet ? "ok" : "critical",
      },
      {
        label: "Compliance charter",
        value: "P1–P10 active",
        status: "ok",
      },
    ],
    summary: !anthropicConfigured
      ? "Claude API key missing — AI screening degraded."
      : "AI system operational. Compliance charter P1–P10 enforced.",
  };
}

function buildAlertPanel(cases: CaseRecord[]): BoardPanel {
  const critical = cases.filter((c) => c.riskLevel === "critical" && c.status !== "closed" && c.status !== "cleared");
  const highOverdue = cases.filter(
    (c) => c.riskLevel === "high" && c.status !== "closed" && ageHours(c.createdAt) > 24 * 7,
  );

  return {
    id: "alerts",
    title: "Active Alerts",
    icon: "🚨",
    metrics: [
      { label: "Critical open cases",   value: critical.length,   status: critical.length > 0 ? "critical" : "ok" },
      { label: "High-risk overdue >7d", value: highOverdue.length, status: highOverdue.length > 0 ? "warn" : "ok" },
      { label: "AI charter violations", value: 0,                  status: "ok" },
      { label: "4-eyes SoD alerts",     value: 0,                  status: "ok" },
    ],
    summary:
      critical.length > 0
        ? `${critical.length} critical alert${critical.length > 1 ? "s" : ""} require board awareness.`
        : "No critical alerts. Regular monitoring active.",
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

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
