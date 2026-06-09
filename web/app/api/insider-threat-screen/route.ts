export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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
  const tenant = tenantIdFromGate(gate);
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.observedBehaviours?.trim() && !body.employeeRole?.trim()) {
    return NextResponse.json({ ok: false, error: "observedBehaviours or employeeRole required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "insider-threat-screen temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE financial crime insider threat specialist with expertise in employee conduct risk, tipping off indicators (Federal Decree-Law No. 10 of 2025 Art.20), financial crime facilitation patterns, and CBUAE internal controls requirements. Assess employee behaviour, lifestyle indicators, system access patterns, and financial circumstances for insider threat risk. Identify threat categories (financial crime facilitation, data theft, tipping off, fraud, bribery) with specific indicators. Provide coordinated HR and compliance action recommendations. Respond ONLY with valid JSON matching the InsiderThreatResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Employee Name: ${sanitizeField(body.employeeName ?? "not provided", 200)}
Employee Role/Position: ${sanitizeField(body.employeeRole ?? "not specified", 200)}
Observed Behaviours: ${sanitizeText(body.observedBehaviours ?? "not described", 2000)}
System Access Level: ${sanitizeField(body.accessLevel ?? "not specified", 200)}
Financial Circumstances: ${sanitizeText(body.financialCircumstances ?? "not provided", 1000)}
Additional Context: ${sanitizeText(body.context ?? "none", 500)}

Assess this employee for insider threat risk. Return complete InsiderThreatResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InsiderThreatResult;
    if (!Array.isArray(result.threatCategories)) result.threatCategories = [];
    else for (const c of result.threatCategories) { if (!Array.isArray(c.indicators)) c.indicators = []; }
    if (!Array.isArray(result.lifestyleRiskFlags)) result.lifestyleRiskFlags = [];
    if (!Array.isArray(result.accessRiskFlags)) result.accessRiskFlags = [];
    if (!Array.isArray(result.behaviouralIndicators)) result.behaviouralIndicators = [];
    if (!Array.isArray(result.hrActions)) result.hrActions = [];
    if (!Array.isArray(result.complianceActions)) result.complianceActions = [];
    void writeAuditChainEntry({ event: "insider_threat_screen.completed", actor: gate.keyId }, tenant).catch(() => {});
return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "insider-threat-screen temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
