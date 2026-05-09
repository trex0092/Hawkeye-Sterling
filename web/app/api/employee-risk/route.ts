import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

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
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { employees, today } = body;
  if (!Array.isArray(employees)) {
    return NextResponse.json({ ok: false, error: "employees array is required" }, { status: 400 });
  }

  try { writeAuditEvent("mlro", "employees.ai-risk-scan", "employee-portfolio"); }
  catch (err) { console.warn("[hawkeye] employee-risk writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "employee-risk temporarily unavailable - please retry." }, { status: 503 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML compliance officer specializing in staff vetting and ongoing monitoring under FDL 10/2025 Art.21 (internal controls) and FATF R.18 (internal programs). Assess employee document compliance, identify screening risks, and flag staff requiring immediate attention. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Today: ${today}. Employees: ${JSON.stringify(employees)}. Return ONLY this JSON: { "portfolioStatus": "critical"|"attention_required"|"compliant", "summary": "string", "criticalExpiries": [{ "name": "string", "issue": "string", "urgency": "immediate"|"this_week"|"this_month", "action": "string" }], "screeningAlerts": [{ "name": "string", "reason": "string", "action": "string" }], "highRiskNationalities": ["string"], "multiEntityRisk": ["string"], "immediateActions": ["string"], "regulatoryNote": "string" }`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "employee-risk temporarily unavailable - please retry." }, { status: 503 });
    }

    const data = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = data?.content?.[0]?.text ?? "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as EmployeeRiskResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "employee-risk temporarily unavailable - please retry." }, { status: 503 });
  }
}
