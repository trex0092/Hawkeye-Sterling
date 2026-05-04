export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

export interface AmlTrainingGapResult {
  completionRate: number;
  gapRating: "critical" | "high" | "medium" | "low";
  overdueStaff: string[];
  highRiskRoleGaps: string[];
  mandatoryModules: string[];
  trainingPlan: Array<{
    module: string;
    audience: string;
    deadline: string;
    deliveryMethod: string;
  }>;
  regulatoryBasis: string;
}

const FALLBACK: AmlTrainingGapResult = {
  completionRate: 86,
  gapRating: "medium",
  overdueStaff: [
    "R. Fontaine (Relationship Manager) — AML Fundamentals overdue 45 days",
    "J. Kapoor (Cashier) — Cash Transaction Reporting overdue 20 days",
    "3 new joiners (March 2025) — induction AML training not yet scheduled",
  ],
  highRiskRoleGaps: [
    "Gold counter staff: 2 of 6 have not completed DPMS-specific AML module (MoE requirement)",
    "Senior management: Board Risk Committee — FATF R.1 responsibilities training not conducted this year",
    "IT team: no AML data handling/privacy training — risk of inadvertent tipping-off via system changes",
  ],
  mandatoryModules: [
    "AML/CFT Fundamentals (all staff — annual)",
    "DPMS-Specific ML Typologies (gold counter, customer-facing)",
    "Cash Transaction Reporting & MoE Circular 2/2024 (cashiers, RM)",
    "STR/SAR Filing — goAML (compliance team, MLRO)",
    "Sanctions Screening (all customer-facing)",
    "Board AML Responsibilities (senior management, board — biennial)",
  ],
  trainingPlan: [
    {
      module: "AML Fundamentals Refresher",
      audience: "R. Fontaine, J. Kapoor + 3 new joiners",
      deadline: "15/05/2025",
      deliveryMethod:
        "E-learning platform — 2 hours, auto-graded assessment",
    },
    {
      module: "DPMS ML Typologies",
      audience: "Gold counter staff (all 6)",
      deadline: "31/05/2025",
      deliveryMethod:
        "In-person workshop with MLRO — 3 hours, sign-off required",
    },
    {
      module: "Board AML Responsibilities",
      audience: "Board Risk Committee (5 members)",
      deadline: "30/06/2025",
      deliveryMethod:
        "External trainer — ACAMS-certified, 4-hour session",
    },
  ],
  regulatoryBasis:
    "UAE FDL 10/2025 Art.22 (training obligation), FATF R.18 (training), CBUAE AML Standards §6.3, MoE Circular 2/2024 (DPMS training requirements)",
};

export async function POST(req: Request) {
  let body: {
    staffCount: string;
    completionRate: string;
    highRiskRoles: string;
    overdueCount: string;
    lastTrainingDate: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "aml-training-gap temporarily unavailable - please retry." }, { status: 503 });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in AML training programme management. Identify training gaps and generate remediation plans under UAE FDL and FATF standards. Return valid JSON only matching the AmlTrainingGapResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess AML training gaps and generate a remediation plan.\n\nStaff Count: ${body.staffCount}\nCompletion Rate: ${body.completionRate}\nHigh-Risk Roles: ${body.highRiskRoles}\nOverdue Count: ${body.overdueCount}\nLast Training Date: ${body.lastTrainingDate}\nContext: ${body.context}\n\nReturn JSON with fields: completionRate (0-100), gapRating, overdueStaff[], highRiskRoleGaps[], mandatoryModules[], trainingPlan[] (each with module, audience, deadline, deliveryMethod), regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "aml-training-gap temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as AmlTrainingGapResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "aml-training-gap temporarily unavailable - please retry." }, { status: 503 });
  }
}
