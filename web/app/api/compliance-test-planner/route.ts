export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface ComplianceTestPlanResult {
  testPlan: Array<{
    testId: string;
    area: string;
    objective: string;
    methodology: string;
    sampleSize: string;
    frequency: string;
    outputRequired: string;
    legalBasis: string;
  }>;
  priorityAreas: string[];
  estimatedDuration: string;
  reportingRequirements: string[];
  managementResponseRequired: boolean;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    testingArea?: string;
    riskFocus?: string;
    staffCount?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "compliance-test-planner temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML compliance testing specialist with expertise in CBUAE testing expectations, FATF R.18 independent testing requirements, and sector-specific AML compliance testing methodologies. Design comprehensive compliance test plans with specific objectives, methodologies, sample sizes, frequencies, and output requirements. Plans should be practical and actionable for the institution's size and complexity. Reference UAE FDL 10/2025 and CBUAE Guidelines legal basis for each test. Respond ONLY with valid JSON matching the ComplianceTestPlanResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Institution Type: ${sanitizeField(body.institutionType, 100)}
Testing Area / Focus: ${sanitizeText(body.testingArea, 2000) ?? "comprehensive AML programme"}
Risk Focus: ${sanitizeText(body.riskFocus, 2000) ?? "general AML/CFT obligations"}
Staff Count: ${sanitizeField(body.staffCount, 50) ?? "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Design a comprehensive AML compliance testing plan for this institution. Return complete ComplianceTestPlanResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as ComplianceTestPlanResult;
    if (!Array.isArray(result.testPlan)) result.testPlan = [];
    if (!Array.isArray(result.priorityAreas)) result.priorityAreas = [];
    if (!Array.isArray(result.reportingRequirements)) result.reportingRequirements = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "compliance-test-planner temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
