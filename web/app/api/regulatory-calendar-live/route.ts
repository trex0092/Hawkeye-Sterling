// Hawkeye Sterling — Live Regulatory Calendar
// Returns upcoming and overdue regulatory deadlines with date-relative daysUntil
// calculated from the current date at request time.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CalendarEvent {
  id: string;
  title: string;
  deadline: string; // ISO date YYYY-MM-DD
  daysUntil: number;
  category: "filing" | "review" | "audit" | "training" | "reporting";
  authority: string;
  description: string;
  urgency: "overdue" | "critical" | "upcoming" | "planned";
  regulatoryRef: string;
}

export interface RegCalendarLiveResult {
  ok: true;
  eventsCount: number;
  overdueCount: number;
  criticalCount: number;
  events: CalendarEvent[];
}

// Static event definitions — deadlines are absolute ISO dates.
// daysUntil and urgency are computed per-request from today's date.
interface RawEvent {
  id: string;
  title: string;
  deadline: string; // YYYY-MM-DD
  category: CalendarEvent["category"];
  authority: string;
  description: string;
  regulatoryRef: string;
}

const RAW_EVENTS: RawEvent[] = [
  {
    id: "cal-001",
    title: "Enterprise-Wide Risk Assessment (EWRA) — Annual Review",
    deadline: "2026-06-30",
    category: "review",
    authority: "UAE MoE / FDL 10/2025",
    description: "Annual EWRA review and Board approval required. Must be submitted to UAE MoE within 30 days of Board sign-off. Covers ML/TF/PF risk across all business lines.",
    regulatoryRef: "FDL 10/2025 Art.4",
  },
  {
    id: "cal-002",
    title: "Staff AML/CFT Training Completion",
    deadline: "2026-05-31",
    category: "training",
    authority: "UAE MoE",
    description: "Annual AML/CFT training for all front-line staff, relationship managers, and operations teams. Training completion records must be maintained for 10 years.",
    regulatoryRef: "FDL 10/2025 Art.22",
  },
  {
    id: "cal-003",
    title: "Q2 Governance Committee Meeting",
    deadline: "2026-06-15",
    category: "review",
    authority: "CBUAE",
    description: "Quarterly AML/CFT governance committee meeting. Agenda must include: open alerts status, STR statistics, training completion rates, and EWRA progress.",
    regulatoryRef: "CBUAE AML Standards §6",
  },
  {
    id: "cal-004",
    title: "goAML Annual Summary Filing",
    deadline: "2026-07-31",
    category: "filing",
    authority: "UAE FIU (goAML)",
    description: "Annual statistical summary of STRs, CTRs, and other reports submitted via goAML for the preceding calendar year. Includes narrative on typologies observed.",
    regulatoryRef: "FDL 10/2025 Art.17",
  },
  {
    id: "cal-005",
    title: "LBMA Step-4 Independent Audit",
    deadline: "2026-09-15",
    category: "audit",
    authority: "LBMA",
    description: "Annual independent Step-4 audit as required by LBMA Responsible Gold Guidance v9. Scope includes supply chain due diligence, OECD DDG alignment, and digital tracking controls.",
    regulatoryRef: "LBMA RGG v9",
  },
  {
    id: "cal-006",
    title: "EOCN Responsible Sourcing Declaration — OVERDUE",
    deadline: "2026-03-31",
    category: "filing",
    authority: "EOCN",
    description: "Annual responsible sourcing declaration for conflict minerals covering all upstream smelters and refiners. Must be supported by LBMA/RJC chain-of-custody certificates. DEADLINE PASSED — remediation required.",
    regulatoryRef: "EOCN requirements",
  },
  {
    id: "cal-007",
    title: "High-Risk CDD Refresh — 3 Customers",
    deadline: "2026-05-15",
    category: "review",
    authority: "UAE MoE / CBUAE",
    description: "Periodic CDD refresh due for 3 high-risk customers. Enhanced due diligence including source of wealth re-verification, beneficial ownership update, and risk scoring review.",
    regulatoryRef: "FDL 10/2025 Art.10",
  },
  {
    id: "cal-008",
    title: "Board AML/CFT Training",
    deadline: "2026-06-30",
    category: "training",
    authority: "FATF / UAE MoE",
    description: "Annual AML/CFT awareness training for Board members and senior management. Must cover typologies, regulatory updates (FDL 10/2025), and governance obligations.",
    regulatoryRef: "FATF R.18",
  },
  {
    id: "cal-009",
    title: "CBUAE Annual Compliance Report",
    deadline: "2026-12-31",
    category: "reporting",
    authority: "CBUAE",
    description: "Annual compliance report to CBUAE covering AML/CFT programme effectiveness, identified deficiencies, remediation actions, and compliance metrics for the reporting year.",
    regulatoryRef: "MoE Circular / CBUAE AML Standards",
  },
];

function calcDaysUntil(deadline: string, today: Date): number {
  const deadlineDate = new Date(deadline + "T00:00:00Z");
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const deadlineUtc = Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate());
  return Math.round((deadlineUtc - todayUtc) / 86_400_000);
}

function calcUrgency(daysUntil: number): CalendarEvent["urgency"] {
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 14) return "critical";
  if (daysUntil <= 60) return "upcoming";
  return "planned";
}

export async function GET(): Promise<NextResponse> {
  const today = new Date();

  const events: CalendarEvent[] = RAW_EVENTS.map((raw): CalendarEvent => {
    const daysUntil = calcDaysUntil(raw.deadline, today);
    return {
      id: raw.id,
      title: raw.title,
      deadline: raw.deadline,
      daysUntil,
      category: raw.category,
      authority: raw.authority,
      description: raw.description,
      urgency: calcUrgency(daysUntil),
      regulatoryRef: raw.regulatoryRef,
    };
  });

  // Sort: overdue first (most overdue at top), then by daysUntil ascending
  events.sort((a, b) => a.daysUntil - b.daysUntil);

  const overdueCount = events.filter((e) => e.urgency === "overdue").length;
  const criticalCount = events.filter((e) => e.urgency === "critical").length;

  const result: RegCalendarLiveResult = {
    ok: true,
    eventsCount: events.length,
    overdueCount,
    criticalCount,
    events,
  };

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
