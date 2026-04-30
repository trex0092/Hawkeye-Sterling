import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RiskDimensionInput {
  id: string;
  dimension: string;
  description: string;
  inherent: number;
  controls: number;
  notes: string;
}

interface EwraReportBody {
  dimensions: RiskDimensionInput[];
  overallInherent: number;
  overallResidual: number;
  approvedBy?: string;
  lastApproved?: string;
}

interface EwraReport {
  executiveSummary: string;
  overallRiskVerdict: "critical" | "high" | "medium" | "low";
  topControlGaps: Array<{
    dimension: string;
    gap: string;
    recommendation: string;
    urgency: "immediate" | "3months" | "annual";
  }>;
  immediateActions: string[];
  regulatoryExposure: string;
  boardNarrative: string;
  nextReviewDate: string;
}

const FALLBACK: EwraReport = {
  executiveSummary: "API key not configured",
  overallRiskVerdict: "medium",
  topControlGaps: [],
  immediateActions: [],
  regulatoryExposure: "",
  boardNarrative: "",
  nextReviewDate: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: EwraReportBody;
  try {
    body = (await req.json()) as EwraReportBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  writeAuditEvent("mlro", "ewra.ai-report-generated", `overallInherent=${body.overallInherent} overallResidual=${body.overallResidual}`);

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }

  const dimensionLines = (body.dimensions ?? []).map((d) =>
    `- ${d.dimension} (${d.description}): inherent=${d.inherent}, controls=${d.controls}${d.notes ? `, notes=${d.notes}` : ""}`,
  );

  const userContent = [
    `Overall inherent risk score: ${body.overallInherent}/5`,
    `Overall residual risk score: ${body.overallResidual}/5`,
    body.approvedBy ? `Last approved by: ${body.approvedBy}` : null,
    body.lastApproved ? `Last approval date: ${body.lastApproved}` : null,
    "",
    "Risk dimensions:",
    ...dimensionLines,
    "",
    `Return ONLY valid JSON matching this exact schema:`,
    `{`,
    `  "executiveSummary": "string — 2-3 sentences for board consumption, plain language",`,
    `  "overallRiskVerdict": "critical" | "high" | "medium" | "low",`,
    `  "topControlGaps": [{ "dimension": "string", "gap": "string", "recommendation": "string", "urgency": "immediate" | "3months" | "annual" }],`,
    `  "immediateActions": ["string"],`,
    `  "regulatoryExposure": "string",`,
    `  "boardNarrative": "string — 4-6 sentences",`,
    `  "nextReviewDate": "string"`,
    `}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  let report: EwraReport;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system:
          "You are a UAE AML compliance expert generating an EWRA/BWRA board report under FDL 10/2025 Art.4 and FATF Recommendation 1. Analyze the risk matrix and produce a board-grade assessment. Return ONLY valid JSON — no markdown fences, no commentary.",
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: true, ...FALLBACK });
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const text = data?.content?.[0]?.text ?? "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    report = JSON.parse(stripped) as EwraReport;
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }

  return NextResponse.json({ ok: true, ...report });
}
