export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface AmlKpiDashboardResult {
  overallHealth: "excellent" | "good" | "needs-attention" | "critical";
  healthScore: number;
  kpis: Array<{
    name: string;
    value: string;
    target: string;
    status: "green" | "amber" | "red";
    trend: "improving" | "stable" | "deteriorating";
  }>;
  topRisks: string[];
  recommendations: string[];
  regulatoryBasis: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    strCount: string;
    falsePositiveRate: string;
    trainingCompletion: string;
    openFindings: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "aml-kpi-dashboard temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in AML programme KPI measurement and dashboard reporting. Assess AML programme health and generate KPI dashboards under UAE FDL and FATF effectiveness standards. Return valid JSON only matching the AmlKpiDashboardResult interface.",
        messages: [
          {
            role: "user",
            content: `Generate an AML KPI dashboard assessment.\n\nInstitution Type: ${sanitizeField(body.institutionType, 100)}\nSTR Count: ${body.strCount}\nFalse Positive Rate: ${body.falsePositiveRate}\nTraining Completion: ${body.trainingCompletion}\nOpen Findings: ${body.openFindings}\nContext: ${sanitizeText(body.context, 2000)}\n\nReturn JSON with fields: overallHealth, healthScore (0-100), kpis[] (each with name, value, target, status, trend), topRisks[], recommendations[], regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as AmlKpiDashboardResult;
    if (!Array.isArray(result.kpis)) result.kpis = [];
    if (!Array.isArray(result.topRisks)) result.topRisks = [];
    if (!Array.isArray(result.recommendations)) result.recommendations = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "aml-kpi-dashboard temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
