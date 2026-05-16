import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EmployeeBody {
  name: string;
  designation: string;
  nationality: string;
  emiratesIdExpiry: string;
  passportExpiry: string;
  dateOfJoining: string;
  businessUnits: string[];
  email: string;
}

interface RequestBody {
  employees: EmployeeBody[];
  today: string;
}

interface CriticalExpiry {
  name: string;
  issue: string;
  urgency: "immediate" | "this_week" | "this_month";
  action: string;
}

interface ScreeningAlert {
  name: string;
  reason: string;
  action: string;
}

interface EmployeeRiskResult {
  portfolioStatus: "critical" | "attention_required" | "compliant";
  summary: string;
  criticalExpiries: CriticalExpiry[];
  screeningAlerts: ScreeningAlert[];
  highRiskNationalities: string[];
  multiEntityRisk: string[];
  immediateActions: string[];
  regulatoryNote: string;
}

const FALLBACK: EmployeeRiskResult = {
  portfolioStatus: "compliant",
  summary: "API key not configured — manual review required.",
  criticalExpiries: [],
  screeningAlerts: [],
  highRiskNationalities: [],
  multiEntityRisk: [],
  immediateActions: [],
  regulatoryNote: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
    }

  const { employees, today } = body;
  if (!Array.isArray(employees)) {
    return NextResponse.json({ ok: false, error: "employees array is required" }, { status: 400 , headers: gate.headers});
  }

  try { writeAuditEvent("mlro", "employees.ai-risk-scan", "employee-portfolio"); }
  catch (err) { console.warn("[hawkeye] employee-risk writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "employee-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML compliance officer specializing in staff vetting and ongoing monitoring under FDL 10/2025 Art.21 (internal controls) and FATF R.18 (internal programs). Assess employee document compliance, identify screening risks, and flag staff requiring immediate attention. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Today: ${today}. Employees: ${JSON.stringify(employees)}. Return ONLY this JSON: { "portfolioStatus": "critical"|"attention_required"|"compliant", "summary": "string", "criticalExpiries": [{ "name": "string", "issue": "string", "urgency": "immediate"|"this_week"|"this_month", "action": "string" }], "screeningAlerts": [{ "name": "string", "reason": "string", "action": "string" }], "highRiskNationalities": ["string"], "multiEntityRisk": ["string"], "immediateActions": ["string"], "regulatoryNote": "string" }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as EmployeeRiskResult;
    if (!Array.isArray(parsed.criticalExpiries)) parsed.criticalExpiries = [];
    if (!Array.isArray(parsed.screeningAlerts)) parsed.screeningAlerts = [];
    if (!Array.isArray(parsed.highRiskNationalities)) parsed.highRiskNationalities = [];
    if (!Array.isArray(parsed.multiEntityRisk)) parsed.multiEntityRisk = [];
    if (!Array.isArray(parsed.immediateActions)) parsed.immediateActions = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "employee-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
