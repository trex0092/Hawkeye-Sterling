// POST /api/mlro-inbox-triage
//
// MLRO Inbox Triage Engine.
// AI-powered prioritisation and routing of incoming AML alerts, SAR referrals,
// escalations, and compliance notifications into the MLRO's action queue.
//
// Input: array of inbox items (alerts, cases, referrals, regulatory notices)
// Output: triaged list with priority, recommended action, time-to-act, assignee
//
// Triage logic:
//   - Sanctions hits → CRITICAL, immediate action
//   - Overdue CTR/STR → CRITICAL if past deadline
//   - High-risk transaction alerts → HIGH
//   - EDD review overdue → HIGH
//   - Regulatory enquiry / exam notice → HIGH
//   - SAR referrals from staff → MEDIUM
//   - Routine monitoring alerts → MEDIUM
//   - Training / admin items → LOW
//
// Regulatory basis: FDL 10/2025 Art.15-16; FATF R.20, R.29

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ItemType =
  | "sanctions_hit"
  | "ctr_overdue"
  | "str_referral"
  | "str_overdue"
  | "edd_overdue"
  | "pep_alert"
  | "transaction_alert"
  | "regulatory_enquiry"
  | "exam_notice"
  | "staff_referral"
  | "monitoring_alert"
  | "adverse_media"
  | "system_alert"
  | "training_reminder"
  | "admin"
  | "other";

type Priority = "critical" | "high" | "medium" | "low";

interface InboxItem {
  id: string;
  type: ItemType;
  subject?: string;
  description?: string;
  createdAt?: string;         // ISO datetime
  dueDate?: string;           // ISO date if known
  subjectName?: string;       // customer/entity name
  riskScore?: number;         // 0-100 if pre-scored
  source?: string;            // system / staff name / external
  jurisdiction?: string;
  amount?: number;
  currency?: string;
}

interface TriagedItem {
  id: string;
  type: ItemType;
  subject: string;
  priority: Priority;
  priorityReason: string;
  timeToAct: string;          // e.g. "2 hours", "today", "3 business days"
  recommendedAction: string;
  regulatoryBasis?: string;
  suggestedAssignee?: string; // mlro | deputy_mlro | analyst | compliance_officer
  aiSummary?: string;
}

interface TriageResult {
  triaged: TriagedItem[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  urgentActions: string[];
  triageNarrative?: string;
  processedAt: string;
}

// Deterministic priority rules — no AI needed for classification
function classifyItem(item: InboxItem): {
  priority: Priority;
  reason: string;
  timeToAct: string;
  action: string;
  basis?: string;
  assignee?: string;
} {
  const now = Date.now();
  const due = item.dueDate ? new Date(item.dueDate).getTime() : null;
  const isOverdue = due !== null && due < now;
  const daysUntilDue = due ? Math.round((due - now) / 86_400_000) : null;

  switch (item.type) {
    case "sanctions_hit":
      return {
        priority: "critical",
        reason: "Sanctions match requires immediate freeze and regulatory reporting",
        timeToAct: "immediately",
        action: "Freeze transaction/account, notify MLRO, file EOCN report within 2 hours, escalate to senior management",
        basis: "FDL No.10/2025 Art.11; CR No.134/2025",
        assignee: "mlro",
      };

    case "ctr_overdue":
      return {
        priority: "critical",
        reason: "CTR filing deadline exceeded — regulatory breach",
        timeToAct: "today",
        action: "File CTR via goAML immediately. Document reason for delay. Notify compliance officer.",
        basis: "FDL 10/2025 Art.16 — 2 business day deadline",
        assignee: "mlro",
      };

    case "str_overdue":
      return {
        priority: "critical",
        reason: "STR/SAR filing deadline exceeded — regulatory breach",
        timeToAct: "today",
        action: "File STR via goAML immediately. Document delay reason. MLRO signature required.",
        basis: "FDL 10/2025 Art.15 — 35-day deadline",
        assignee: "mlro",
      };

    case "str_referral": {
      const daysOld = item.createdAt
        ? Math.round((now - new Date(item.createdAt).getTime()) / 86_400_000)
        : 0;
      const daysLeft = 35 - daysOld;
      if (daysLeft <= 5) {
        return {
          priority: "critical",
          reason: `STR referral — only ${daysLeft} day(s) remaining before 35-day filing deadline`,
          timeToAct: "today",
          action: "MLRO review and STR determination required urgently. File or close referral.",
          basis: "FDL 10/2025 Art.15",
          assignee: "mlro",
        };
      }
      return {
        priority: "high",
        reason: `STR referral with ${daysLeft} days remaining`,
        timeToAct: "within 2 business days",
        action: "MLRO to review referral, gather evidence, and make STR determination",
        basis: "FDL 10/2025 Art.15",
        assignee: "mlro",
      };
    }

    case "edd_overdue":
      return {
        priority: "high",
        reason: "EDD review overdue — relationship continuity at risk",
        timeToAct: isOverdue ? "today" : `${daysUntilDue} days`,
        action: "Initiate EDD refresh. Suspend high-risk transactions until complete.",
        basis: "FDL 10/2025 Art.8",
        assignee: "analyst",
      };

    case "regulatory_enquiry":
    case "exam_notice":
      return {
        priority: "high",
        reason: "Regulatory enquiry or examination notice requires senior attention",
        timeToAct: "within 24 hours",
        action: "MLRO and senior management to review. Prepare response team. Do not delete records.",
        basis: "FDL 10/2025 Art.27",
        assignee: "mlro",
      };

    case "pep_alert":
      return {
        priority: "high",
        reason: "PEP-related alert requires MLRO-level review",
        timeToAct: "within 24 hours",
        action: "Review PEP alert, assess EDD adequacy, obtain senior management sign-off if relationship continues",
        basis: "FDL 10/2025 Art.10; FATF R.12",
        assignee: "mlro",
      };

    case "adverse_media":
      return {
        priority: (item.riskScore ?? 0) >= 70 ? "high" : "medium",
        reason: "Adverse media hit — customer risk profile may need updating",
        timeToAct: "within 2 business days",
        action: "Review adverse media. Update customer risk classification if warranted. Consider EDD refresh.",
        basis: "FDL 10/2025 Art.8(6)",
        assignee: "analyst",
      };

    case "transaction_alert":
      return {
        priority: (item.riskScore ?? 0) >= 75 ? "high" : "medium",
        reason: `Transaction alert — risk score ${item.riskScore ?? "unknown"}`,
        timeToAct: (item.riskScore ?? 0) >= 75 ? "today" : "within 3 business days",
        action: "Review transaction context, customer profile, and determine if STR referral warranted",
        basis: "FDL 10/2025 Art.15",
        assignee: (item.riskScore ?? 0) >= 75 ? "mlro" : "analyst",
      };

    case "staff_referral":
      return {
        priority: "medium",
        reason: "Internal staff SAR referral awaiting MLRO determination",
        timeToAct: "within 3 business days",
        action: "Review staff referral. Request additional evidence if needed. Make STR/no-action determination.",
        basis: "FDL 10/2025 Art.15; FATF R.20",
        assignee: "mlro",
      };

    case "monitoring_alert":
      return {
        priority: "medium",
        reason: "Ongoing monitoring system alert",
        timeToAct: "within 5 business days",
        action: "Analyst review of alert context. Escalate to MLRO if STR indicators present.",
        basis: "FDL 10/2025 Art.13",
        assignee: "analyst",
      };

    case "system_alert":
      return {
        priority: "low",
        reason: "System notification",
        timeToAct: "within 1 week",
        action: "Review and acknowledge system alert. Take remedial action if required.",
        assignee: "compliance_officer",
      };

    default:
      return {
        priority: "low",
        reason: "Routine compliance or administrative item",
        timeToAct: "within 1 week",
        action: "Review and process according to standard procedures",
        assignee: "compliance_officer",
      };
  }
}

const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { items: InboxItem[]; generateNarrative?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { items = [], generateNarrative = false } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array is required and must be non-empty" }, { status: 400 });
  }

  const triaged: TriagedItem[] = items.map((item) => {
    const cls = classifyItem(item);
    return {
      id: item.id,
      type: item.type,
      subject: item.subject ?? item.subjectName ?? item.id,
      priority: cls.priority,
      priorityReason: cls.reason,
      timeToAct: cls.timeToAct,
      recommendedAction: cls.action,
      regulatoryBasis: cls.basis,
      suggestedAssignee: cls.assignee,
    };
  });

  // Sort by priority then creation time
  triaged.sort((a, b) => {
    const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return pd !== 0 ? pd : 0;
  });

  const counts = triaged.reduce(
    (acc, t) => { acc[t.priority]++; return acc; },
    { critical: 0, high: 0, medium: 0, low: 0 } as Record<Priority, number>
  );

  const urgentActions: string[] = triaged
    .filter((t) => t.priority === "critical")
    .map((t) => `[CRITICAL] ${t.subject}: ${t.recommendedAction}`);

  const result: TriageResult = {
    triaged,
    summary: { ...counts, total: items.length },
    urgentActions,
    processedAt: new Date().toISOString(),
  };

  if (generateNarrative && triaged.length > 0) {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      const anthropic = getAnthropicClient(apiKey, 20_000, "mlro-inbox-triage");
      const criticalItems = triaged.filter((t) => t.priority === "critical");
      const highItems = triaged.filter((t) => t.priority === "high");

      const prompt = `You are a UAE DPMS MLRO reviewing your compliance inbox. Here is the triage summary:

Total items: ${items.length}
Critical: ${counts.critical} | High: ${counts.high} | Medium: ${counts.medium} | Low: ${counts.low}

${criticalItems.length > 0 ? `CRITICAL items:\n${criticalItems.map((t) => `- ${sanitizeField(t.subject, 200)}: ${t.priorityReason}`).join("\n")}` : ""}
${highItems.length > 0 ? `HIGH priority:\n${highItems.map((t) => `- ${sanitizeField(t.subject, 200)}: ${t.priorityReason}`).join("\n")}` : ""}

Write a 3-4 sentence MLRO triage briefing for today's inbox. Highlight the most urgent regulatory obligations and recommended sequencing of actions.`;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 250,
        messages: [{ role: "user", content: prompt }],
      });
      result.triageNarrative = (msg.content[0] as { type: string; text: string }).text?.trim();
    } catch {
      // best-effort
    }
  }

  return NextResponse.json(result);
}
