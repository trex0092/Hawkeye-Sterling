export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export interface RiskAppetiteResult {
  riskAppetiteStatement: string;
  riskTolerances: Array<{
    category: string;
    tolerance: "zero" | "low" | "medium" | "high";
    statement: string;
    kri: string;
    threshold: string;
  }>;
  prohibitedActivities: string[];
  escalationTriggers: string[];
  reviewFrequency: string;
  boardApprovalNote: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    riskProfile?: string;
    boardPosition?: string;
    keyProducts?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "risk-appetite-builder temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML governance specialist with expertise in Board-level risk appetite frameworks, UAE FDL 10/2025 governance requirements, and CBUAE AML programme expectations. Draft comprehensive AML/CFT Risk Appetite Statements including risk tolerances (zero/low/medium/high) with specific KRIs and thresholds, prohibited activities, escalation triggers, and board approval requirements. Ensure statements are legally grounded, operationally actionable, and reflect UAE regulatory expectations. Respond ONLY with valid JSON matching the RiskAppetiteResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Institution Type: ${sanitizeField(body.institutionType, 100)}
Current Risk Profile: ${sanitizeText(body.riskProfile, 2000) ?? "not specified"}
Board's Stated Position on Risk: ${sanitizeText(body.boardPosition, 2000) ?? "not specified"}
Key Products/Services: ${sanitizeText(body.keyProducts, 2000) ?? "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Draft a comprehensive AML/CFT Risk Appetite Statement for this institution. Return complete RiskAppetiteResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RiskAppetiteResult;
    if (!Array.isArray(result.riskTolerances)) result.riskTolerances = [];
    if (!Array.isArray(result.prohibitedActivities)) result.prohibitedActivities = [];
    if (!Array.isArray(result.escalationTriggers)) result.escalationTriggers = [];
    void writeAuditChainEntry(
      { event: "risk_appetite_built", actor: gate.keyId, institutionType: body.institutionType, toleranceCount: result.riskTolerances.length, prohibitedCount: result.prohibitedActivities.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "risk-appetite-builder temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
