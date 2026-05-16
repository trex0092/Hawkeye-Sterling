// POST /api/exam-war-room
//
// Regulatory Examination War Room (Tier C).
// AI-powered preparation assistant for regulatory AML/CFT examinations.
// Generates examination-ready responses, identifies documentation gaps,
// predicts examiner focus areas, and produces a pre-exam action plan.
//
// Use cases:
//   - Pre-exam readiness assessment
//   - Examiner question anticipation and model answers
//   - Document request list (MRL) preparation
//   - "Hot spot" identification from examination trends
//   - Day-of-exam talking points for the MLRO
//
// Regulatory basis: FDL 10/2025 Art.26-27; CBUAE Supervisory Framework;
//                   FATF Methodology for Assessing Compliance

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

type ExamMode =
  | "readiness_assessment"      // overall prep status
  | "question_anticipation"     // likely examiner questions + model answers
  | "mrl_preparation"           // Model/Material Request List
  | "hot_spot_analysis"         // areas likely to receive examiner scrutiny
  | "mlro_briefing"             // day-of talking points for MLRO
  | "full_war_room";            // all of the above

interface ExamContext {
  // Exam details
  examinerBody?: string;           // e.g. "CBUAE", "MoE", "FIU"
  scheduledDate?: string;          // ISO date
  noticeDate?: string;             // ISO date when notice received
  daysUntilExam?: number;
  examScope?: string[];            // e.g. ["CDD", "TM", "STR", "Training"]
  previousExamFindings?: string[]; // findings from last exam

  // Programme status
  amlHealthScore?: number;
  amlHealthBand?: string;
  openControlGaps?: Array<{ description: string; severity: string }>;
  lastEwraDate?: string;
  lastAuditDate?: string;
  strsFiled12Months?: number;
  ctrsFiled12Months?: number;
  overdueEddCount?: number;
  trainingCompletionRate?: number;

  // Documentation status
  hasCurrentAmlPolicy?: boolean;
  hasBoardAmlReport?: boolean;
  hasMlroAppointmentLetter?: boolean;
  hasGoAmlRegistration?: boolean;
  hasDpmsLicence?: boolean;
  hasTransactionMonitoringPolicy?: boolean;
  hasCddProcedures?: boolean;

  // Context
  entityName?: string;
  entityType?: string;             // "gold_trader" | "jeweller" | "broker" etc.
  mlroName?: string;
  additionalContext?: string;
}

type ExamWarRoomMode = ExamMode;

interface WarRoomResult {
  mode: ExamWarRoomMode;
  entityName: string;
  examinerBody: string;
  scheduledDate?: string;
  daysUntilExam?: number;
  readinessScore?: number;         // 0-100 (for readiness_assessment mode)
  sections: Array<{
    title: string;
    content: string;
  }>;
  criticalActions: string[];
  generatedAt: string;
}

const EXAMINER_FOCUS_AREAS: Record<string, string[]> = {
  CBUAE: [
    "Customer risk rating methodology and documentation",
    "EDD procedures for high-risk customers and PEPs",
    "Transaction monitoring system calibration and alert management",
    "STR filing timeliness and quality",
    "Sanctions screening coverage and hit management",
    "MLRO qualifications and independence",
    "Board governance and oversight of AML programme",
    "AML training records and effectiveness testing",
  ],
  MoE: [
    "DPMS registration and licence validity",
    "CTR filing for cash transactions >= AED 55,000",
    "goAML registration and submission history",
    "Physical gold / precious metals transaction records",
    "Customer due diligence for high-value transactions",
    "EWRA completeness for gold/precious metals risks",
    "Beneficial ownership verification",
    "Record retention (10-year obligation)",
  ],
  FIU: [
    "STR quality and completeness",
    "Typology awareness and red flag identification",
    "Cooperation with FIU information requests",
    "goAML system proficiency",
    "Tipping-off controls",
    "Internal reporting chain (staff → MLRO → FIU)",
  ],
};

function buildReadinessScore(ctx: ExamContext): number {
  let score = 0;

  if (ctx.hasCurrentAmlPolicy) score += 10;
  if (ctx.hasBoardAmlReport) score += 10;
  if (ctx.hasMlroAppointmentLetter) score += 8;
  if (ctx.hasGoAmlRegistration) score += 8;
  if (ctx.hasDpmsLicence) score += 8;
  if (ctx.hasTransactionMonitoringPolicy) score += 8;
  if (ctx.hasCddProcedures) score += 8;

  if (ctx.lastEwraDate) {
    const age = Math.round((Date.now() - new Date(ctx.lastEwraDate).getTime()) / 86_400_000);
    if (age <= 365) score += 10;
    else if (age <= 730) score += 5;
  }

  if (ctx.amlHealthScore) score += Math.round(ctx.amlHealthScore * 0.15);

  const overdueEdd = ctx.overdueEddCount ?? 0;
  if (overdueEdd === 0) score += 5;
  else if (overdueEdd > 10) score -= 10;

  const trainingRate = ctx.trainingCompletionRate ?? 0;
  if (trainingRate >= 90) score += 5;

  return Math.max(0, Math.min(100, score));
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { context: ExamContext; mode: ExamMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { context: ctx, mode = "full_war_room" } = body;
  if (!ctx) {
    return NextResponse.json({ error: "context is required" }, { status: 400 , headers: gate.headers });
  }

  const examinerBody = ctx.examinerBody ?? "Regulatory Authority";
  const daysUntilExam = ctx.daysUntilExam ?? (
    ctx.scheduledDate
      ? Math.max(0, Math.round((new Date(ctx.scheduledDate).getTime() - Date.now()) / 86_400_000))
      : undefined
  );
  const focusAreas: string[] = EXAMINER_FOCUS_AREAS[examinerBody] ?? EXAMINER_FOCUS_AREAS["CBUAE"] ?? [];
  const readinessScore = buildReadinessScore(ctx);

  const openGaps = ctx.openControlGaps ?? [];
  const criticalGaps = openGaps.filter((g) => g.severity === "critical" || g.severity === "high");

  const criticalActions: string[] = [];
  if (daysUntilExam !== undefined && daysUntilExam <= 30) {
    criticalActions.push("URGENT: Exam is within 30 days — activate war room immediately");
  }
  if (!ctx.hasCurrentAmlPolicy) criticalActions.push("Obtain/update AML Policy before exam");
  if (!ctx.hasMlroAppointmentLetter) criticalActions.push("Prepare MLRO appointment letter with board signature");
  if (!ctx.hasGoAmlRegistration) criticalActions.push("Confirm goAML registration is active and accessible");
  if ((ctx.overdueEddCount ?? 0) > 0) criticalActions.push(`Clear ${ctx.overdueEddCount} overdue EDD review(s) before exam`);
  if (criticalGaps.length > 0) {
    criticalActions.push(`Remediate or document ${criticalGaps.length} critical/high control gap(s) with action plans`);
  }
  if (ctx.previousExamFindings && ctx.previousExamFindings.length > 0) {
    criticalActions.push("Prepare evidence that all prior exam findings have been fully remediated");
  }

  const contextSummary = `
Entity: ${ctx.entityName ?? "DPMS Entity"}
Type: ${ctx.entityType ?? "gold dealer"}
Examiner: ${examinerBody}
Exam date: ${ctx.scheduledDate ?? "TBC"} (${daysUntilExam !== undefined ? `${daysUntilExam} days away` : "date unknown"})
Exam scope: ${ctx.examScope?.join(", ") ?? "comprehensive"}
AML health score: ${ctx.amlHealthScore ?? "N/A"}/100
Open control gaps: ${openGaps.length} (${criticalGaps.length} critical/high)
Overdue EDD reviews: ${ctx.overdueEddCount ?? "N/A"}
STRs filed (12 months): ${ctx.strsFiled12Months ?? "N/A"}
Training completion: ${ctx.trainingCompletionRate ?? "N/A"}%
Previous exam findings: ${ctx.previousExamFindings?.join("; ") ?? "None on record"}
Readiness score: ${readinessScore}/100
Key documentation status:
- AML Policy: ${ctx.hasCurrentAmlPolicy ? "✓" : "MISSING"}
- Board AML Report: ${ctx.hasBoardAmlReport ? "✓" : "MISSING"}
- MLRO Letter: ${ctx.hasMlroAppointmentLetter ? "✓" : "MISSING"}
- goAML Registration: ${ctx.hasGoAmlRegistration ? "✓" : "MISSING"}
- DPMS Licence: ${ctx.hasDpmsLicence ? "✓" : "MISSING"}
- TM Policy: ${ctx.hasTransactionMonitoringPolicy ? "✓" : "MISSING"}
- CDD Procedures: ${ctx.hasCddProcedures ? "✓" : "MISSING"}
${ctx.additionalContext ? `Additional context: ${ctx.additionalContext}` : ""}
  `.trim();

  const modeInstructions: Record<ExamMode, string> = {
    readiness_assessment: `Generate a readiness assessment with:
1. Overall readiness evaluation (2-3 sentences)
2. Top 5 strengths to highlight to the examiner
3. Top 5 weaknesses to remediate before the exam
4. A 30-day pre-exam action plan`,

    question_anticipation: `Generate the top 15 questions a ${examinerBody} examiner is likely to ask about this entity's AML programme, with a model answer for each. Format as Q&A pairs. Focus on areas where the entity has gaps.`,

    mrl_preparation: `Generate a comprehensive Material/Document Request List (MRL) that the examiner will likely request. Group documents by category (policies, procedures, records, reports, etc.). Mark items as [READY], [IN PROGRESS], or [MISSING] based on the context.`,

    hot_spot_analysis: `Analyse the entity's specific risk profile and identify:
1. The 5 highest-risk areas the examiner will focus on
2. For each area: the likely examiner concern, the entity's current gap, and the recommended preparation
Base your analysis on the ${examinerBody}'s known examination priorities and the entity's specific profile.`,

    mlro_briefing: `Generate day-of-exam talking points for the MLRO. Include:
1. Opening statement (60 seconds) about the AML programme
2. Key messages to convey about programme improvements
3. How to handle questions about gaps or weaknesses
4. Questions to ask the examiner to clarify scope
5. Phrases to avoid`,

    full_war_room: `Generate a complete Exam War Room briefing with all sections:
1. READINESS ASSESSMENT: Overall score and status
2. DOCUMENT CHECKLIST: Ready vs missing documents
3. HOT SPOT ANALYSIS: Top 5 examiner focus areas with entity-specific risks
4. TOP 10 ANTICIPATED QUESTIONS with model answers
5. PRE-EXAM ACTION PLAN: Prioritised actions for remaining days
6. MLRO DAY-1 TALKING POINTS`,
  };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    const anthropic = getAnthropicClient(apiKey, 4_500, "exam-war-room");
    const prompt = `You are a specialist UAE AML examination preparation consultant with deep knowledge of ${examinerBody} examination methodology and UAE FDL 10/2025 requirements.

ENTITY CONTEXT:
${contextSummary}

KNOWN ${examinerBody} EXAMINATION FOCUS AREAS:
${focusAreas.map((f, i) => `${i + 1}. ${f}`).join("\n")}

TASK: ${(modeInstructions[mode as ExamMode] ?? modeInstructions["full_war_room"])}

Be specific to this entity's actual situation. Reference UAE FDL 10/2025 article numbers where relevant. Be practical and actionable — this is a real exam preparation exercise.`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const block = msg.content[0];
    const content = block?.type === "text" ? (block as { type: "text"; text: string }).text.trim() : "";

    // Parse sections from AI output — split on numbered headers or markdown headers
    const rawSections = content.split(/\n(?=#{1,3}\s|\d+\.\s+[A-Z])/);
    const sections = rawSections
      .map((s) => {
        const lines = s.trim().split("\n");
        const heading = (lines[0] ?? "").replace(/^#+\s*/, "").replace(/^\d+\.\s*/, "").trim();
        const body = lines.slice(1).join("\n").trim();
        return { title: heading, content: body || s.trim() };
      })
      .filter((s) => s.title.length > 0 && s.content.length > 0)
      .slice(0, 10);

    // Fallback: if parsing failed, return as single section
    const finalSections = sections.length > 0
      ? sections
      : [{ title: "War Room Briefing", content }];

    const result: WarRoomResult = {
      mode,
      entityName: ctx.entityName ?? "DPMS Entity",
      examinerBody,
      scheduledDate: ctx.scheduledDate,
      daysUntilExam,
      readinessScore,
      sections: finalSections,
      criticalActions,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    return NextResponse.json(
      { error: "War room generation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: gate.headers }
    );
  }
}
