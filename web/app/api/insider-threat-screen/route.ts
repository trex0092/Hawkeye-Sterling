export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";


export interface InsiderThreatResult {
  threatRisk: "critical" | "high" | "medium" | "low" | "clear";
  threatCategories: Array<{
    category: "financial_crime_facilitation" | "data_theft" | "tipping_off" | "fraud" | "bribery" | "other";
    likelihood: "high" | "medium" | "low";
    indicators: string[];
    detail: string;
  }>;
  lifestyleRiskFlags: string[];
  accessRiskFlags: string[];
  behaviouralIndicators: string[];
  recommendedAction: "immediate_suspension" | "escalate_hr_mlro" | "enhanced_monitoring" | "review_access" | "clear";
  actionRationale: string;
  hrActions: string[];
  complianceActions: string[];
  regulatoryBasis: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    employeeName?: string;
    employeeRole?: string;
    observedBehaviours?: string;
    accessLevel?: string;
    financialCircumstances?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.observedBehaviours?.trim() && !body.employeeRole?.trim()) {
    return NextResponse.json({ ok: false, error: "observedBehaviours or employeeRole required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "insider-threat-screen temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1450,
      system: `You are a UAE financial crime insider threat specialist. Assess employee behaviour, lifestyle indicators, system access patterns, and financial circumstances for insider threat risk. Respond ONLY with valid JSON matching the InsiderThreatResult interface — no markdown fences.`,
      messages: [{
        role: "user",
        content: `Employee Name: ${body.employeeName ?? "not provided"}
Employee Role/Position: ${body.employeeRole ?? "not specified"}
Observed Behaviours: ${body.observedBehaviours ?? "not described"}
System Access Level: ${body.accessLevel ?? "not specified"}
Financial Circumstances: ${body.financialCircumstances ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Assess this employee for insider threat risk. Return complete InsiderThreatResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InsiderThreatResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "insider-threat-screen temporarily unavailable - please retry." }, { status: 503 });
  }
}
