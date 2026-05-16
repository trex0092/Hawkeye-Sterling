// POST /api/board-pack-auto
//
// Board AML Report Auto-Generator (Tier C).
// Produces a structured, compliance-grade board AML/CFT report for the current
// reporting period. No data from external systems — caller provides the metrics
// and the AI produces a boardroom-quality narrative.
//
// Sections generated:
//   1. Executive Summary
//   2. Regulatory Environment Update
//   3. AML Programme Performance
//   4. Key Risk Indicators
//   5. Suspicious Transaction Reporting Summary
//   6. Training & Awareness
//   7. Control Gaps & Remediation
//   8. Upcoming Deadlines & Commitments
//
// Regulatory basis: FDL 10/2025 Art.23; FATF R.18; CBUAE AML/CFT Guidelines 2024

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

interface PeriodMetrics {
  // Reporting period
  periodStart: string;                    // ISO date
  periodEnd: string;                      // ISO date
  entityName?: string;
  reportingDate?: string;
  mlroName?: string;

  // Customer portfolio
  totalCustomers?: number;
  newCustomersOnboarded?: number;
  customersExited?: number;
  highRiskCustomerCount?: number;
  pepCustomerCount?: number;

  // Transaction monitoring
  totalTransactions?: number;
  totalTransactionVolumeAed?: number;
  alertsGenerated?: number;
  alertsClosed?: number;
  alertsEscalated?: number;
  strsFiled?: number;
  strsDeclined?: number;
  ctrsFiled?: number;
  ctrsOverdue?: number;

  // Screening
  sanctionsScreeningsRun?: number;
  sanctionsTrueHits?: number;
  sanctionsFalsePositives?: number;

  // Due diligence
  eddReviewsCompleted?: number;
  eddReviewsOverdue?: number;
  cddRefreshesCompleted?: number;

  // Training
  staffTrainedCount?: number;
  totalStaffCount?: number;
  trainingProgrammes?: string[];

  // Control gaps & remediation
  openControlGaps?: Array<{ description: string; severity: string; targetDate: string }>;
  remediatedGaps?: number;

  // AML health score (from /api/aml-health-score)
  amlHealthScore?: number;
  amlHealthBand?: string;

  // Upcoming
  upcomingDeadlines?: Array<{ item: string; dueDate: string }>;

  // Regulatory changes in period
  regulatoryChanges?: string[];
}

interface BoardPackResult {
  title: string;
  period: string;
  sections: Array<{ heading: string; content: string }>;
  attestation: string;
  generatedAt: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { metrics: PeriodMetrics };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { metrics } = body;
  if (!metrics || !metrics.periodStart || !metrics.periodEnd) {
    return NextResponse.json({ error: "metrics with periodStart and periodEnd are required" }, { status: 400 , headers: gate.headers });
  }

  const strRate = metrics.totalTransactions && metrics.strsFiled
    ? ((metrics.strsFiled / metrics.totalTransactions) * 1000).toFixed(2)
    : "N/A";
  const alertClosureRate = metrics.alertsGenerated && metrics.alertsClosed
    ? Math.round((metrics.alertsClosed / metrics.alertsGenerated) * 100)
    : null;
  const trainingCompletion = metrics.staffTrainedCount && metrics.totalStaffCount
    ? Math.round((metrics.staffTrainedCount / metrics.totalStaffCount) * 100)
    : null;

  const dataContext = `
Entity: ${metrics.entityName ?? "DPMS Entity"}
Period: ${metrics.periodStart} to ${metrics.periodEnd}
MLRO: ${metrics.mlroName ?? "Not specified"}

CUSTOMER PORTFOLIO:
- Total customers: ${metrics.totalCustomers ?? "N/A"}
- New onboarded: ${metrics.newCustomersOnboarded ?? "N/A"}
- Exited: ${metrics.customersExited ?? "N/A"}
- High-risk: ${metrics.highRiskCustomerCount ?? "N/A"}
- PEPs: ${metrics.pepCustomerCount ?? "N/A"}

TRANSACTION MONITORING:
- Total transactions: ${metrics.totalTransactions?.toLocaleString() ?? "N/A"}
- Total volume: AED ${metrics.totalTransactionVolumeAed?.toLocaleString() ?? "N/A"}
- Alerts generated: ${metrics.alertsGenerated ?? "N/A"}
- Alerts closed: ${metrics.alertsClosed ?? "N/A"} (${alertClosureRate !== null ? `${alertClosureRate}%` : "N/A"} closure rate)
- STRs filed: ${metrics.strsFiled ?? "N/A"} (${strRate} per 1,000 transactions)
- STRs declined: ${metrics.strsDeclined ?? "N/A"}
- CTRs filed: ${metrics.ctrsFiled ?? "N/A"}
- CTRs overdue: ${metrics.ctrsOverdue ?? "N/A"}

SANCTIONS SCREENING:
- Screenings run: ${metrics.sanctionsScreeningsRun?.toLocaleString() ?? "N/A"}
- True hits: ${metrics.sanctionsTrueHits ?? "N/A"}
- False positives: ${metrics.sanctionsFalsePositives ?? "N/A"}

DUE DILIGENCE:
- EDD reviews completed: ${metrics.eddReviewsCompleted ?? "N/A"}
- EDD reviews overdue: ${metrics.eddReviewsOverdue ?? "N/A"}
- CDD refreshes completed: ${metrics.cddRefreshesCompleted ?? "N/A"}

TRAINING:
- Staff trained: ${metrics.staffTrainedCount ?? "N/A"} of ${metrics.totalStaffCount ?? "N/A"} (${trainingCompletion !== null ? `${trainingCompletion}%` : "N/A"})
- Programmes: ${metrics.trainingProgrammes?.join(", ") ?? "N/A"}

AML HEALTH SCORE: ${metrics.amlHealthScore ?? "N/A"}/100 (${metrics.amlHealthBand ?? "N/A"})

OPEN CONTROL GAPS: ${metrics.openControlGaps?.length ?? "N/A"}
${metrics.openControlGaps?.map((g) => `- [${g.severity}] ${g.description} — target: ${g.targetDate}`).join("\n") ?? ""}

UPCOMING DEADLINES:
${metrics.upcomingDeadlines?.map((d) => `- ${d.item}: ${d.dueDate}`).join("\n") ?? "None provided"}

REGULATORY CHANGES IN PERIOD:
${metrics.regulatoryChanges?.join("\n") ?? "None noted"}
  `.trim();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    const anthropic = getAnthropicClient(apiKey, 60_000, "board-pack-auto");
    const prompt = `You are a senior UAE AML/CFT compliance advisor preparing a board-level AML report for a DPMS (gold/precious metals dealer). Write a professional, compliance-grade board AML report using the data below.

${dataContext}

Generate the following sections. Each section should be substantive (3-6 sentences or bullet points), professional in tone, and appropriate for board-level readers. Reference relevant UAE FDL 10/2025 articles where appropriate.

FORMAT YOUR RESPONSE AS JSON:
{
  "executiveSummary": "...",
  "regulatoryEnvironment": "...",
  "programmePerformance": "...",
  "keyRiskIndicators": "...",
  "strSummary": "...",
  "trainingAwareness": "...",
  "controlGapsRemediation": "...",
  "upcomingCommitments": "..."
}

Ensure each field is a complete, well-written paragraph or set of bullet points suitable for board presentation.`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";
    let sections: Record<string, string> = {};

    // Parse JSON response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        sections = JSON.parse(jsonMatch[0]) as Record<string, string>;
      } catch {
        // Fall through to plain text handling
      }
    }

    const sectionList = [
      { heading: "1. Executive Summary", content: sections["executiveSummary"] ?? "" },
      { heading: "2. Regulatory Environment Update", content: sections["regulatoryEnvironment"] ?? "" },
      { heading: "3. AML Programme Performance", content: sections["programmePerformance"] ?? "" },
      { heading: "4. Key Risk Indicators", content: sections["keyRiskIndicators"] ?? "" },
      { heading: "5. Suspicious Transaction Reporting", content: sections["strSummary"] ?? "" },
      { heading: "6. Training & Awareness", content: sections["trainingAwareness"] ?? "" },
      { heading: "7. Control Gaps & Remediation", content: sections["controlGapsRemediation"] ?? "" },
      { heading: "8. Upcoming Deadlines & Commitments", content: sections["upcomingCommitments"] ?? "" },
    ].filter((s) => s.content.length > 0);

    const period = `${metrics.periodStart} to ${metrics.periodEnd}`;
    const result: BoardPackResult = {
      title: `AML/CFT Board Report — ${metrics.entityName ?? "DPMS Entity"}`,
      period,
      sections: sectionList,
      attestation: `This report was prepared by the MLRO (${metrics.mlroName ?? "N/A"}) for the board of directors for the period ${period}. It is prepared in compliance with FDL 10/2025 Art.23 and the CBUAE AML/CFT Guidelines. The information contained herein is accurate and complete to the best of the MLRO's knowledge as of ${metrics.reportingDate ?? new Date().toISOString().split("T")[0]}.`,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    return NextResponse.json(
      { error: "Report generation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: gate.headers }
    );
  }
}
