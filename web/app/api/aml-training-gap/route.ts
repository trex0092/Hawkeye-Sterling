export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "aml-training-gap temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in AML training programme management. Identify training gaps and generate remediation plans under UAE FDL and FATF standards. Return valid JSON only matching the AmlTrainingGapResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess AML training gaps and generate a remediation plan.\n\nStaff Count: ${body.staffCount}\nCompletion Rate: ${body.completionRate}\nHigh-Risk Roles: ${sanitizeField(body.highRiskRoles, 500)}\nOverdue Count: ${body.overdueCount}\nLast Training Date: ${sanitizeField(body.lastTrainingDate, 50)}\nContext: ${sanitizeText(body.context, 2000)}\n\nReturn JSON with fields: completionRate (0-100), gapRating, overdueStaff[], highRiskRoleGaps[], mandatoryModules[], trainingPlan[] (each with module, audience, deadline, deliveryMethod), regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as AmlTrainingGapResult;
    if (!Array.isArray(result.overdueStaff)) result.overdueStaff = [];
    if (!Array.isArray(result.highRiskRoleGaps)) result.highRiskRoleGaps = [];
    if (!Array.isArray(result.mandatoryModules)) result.mandatoryModules = [];
    if (!Array.isArray(result.trainingPlan)) result.trainingPlan = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "aml-training-gap temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
