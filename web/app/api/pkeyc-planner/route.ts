export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PkycPlannerResult {
  reviewFrequency: "monthly" | "quarterly" | "bi-annual" | "annual";
  triggerEvents: string[];
  nextReviewDate: string;
  overdueItems: string[];
  automationOpportunities: string[];
  kycRefreshPlan: Array<{
    customer: string;
    priority: "critical" | "high" | "medium";
    dueDate: string;
    action: string;
  }>;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    customerCount: string;
    highRiskCount: string;
    pepCount: string;
    overdueCount: string;
    institutionType: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "pkeyc-planner temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in periodic KYC review planning. Generate structured KYC refresh plans under UAE FDL and FATF standards. Return valid JSON only matching the PkycPlannerResult interface.",
        messages: [
          {
            role: "user",
            content: `Generate a periodic KYC review plan.\n\nCustomer Count: ${body.customerCount}\nHigh-Risk Count: ${body.highRiskCount}\nPEP Count: ${body.pepCount}\nOverdue Count: ${body.overdueCount}\nInstitution Type: ${sanitizeField(body.institutionType, 100)}\nContext: ${sanitizeText(body.context, 2000)}\n\nReturn JSON with fields: reviewFrequency, triggerEvents[], nextReviewDate, overdueItems[], automationOpportunities[], kycRefreshPlan[] (each with customer, priority, dueDate, action), regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as PkycPlannerResult;
    if (!Array.isArray(result.triggerEvents)) result.triggerEvents = [];
    if (!Array.isArray(result.overdueItems)) result.overdueItems = [];
    if (!Array.isArray(result.automationOpportunities)) result.automationOpportunities = [];
    if (!Array.isArray(result.kycRefreshPlan)) result.kycRefreshPlan = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "pkeyc-planner temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
