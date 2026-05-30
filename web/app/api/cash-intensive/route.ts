export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface CashIntensiveResult {
  riskRating: "critical" | "high" | "medium" | "low";
  cashRiskScore: number;
  redFlags: string[];
  typologiesMatched: string[];
  controlGaps: string[];
  enhancedMeasures: string[];
  reportingObligations: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    businessName: string;
    businessType: string;
    monthlyRevenue: string;
    cashPct: string;
    depositPattern: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "cash-intensive temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in cash-intensive business risk assessment under MoE Circular 2/2024 and UAE FDL 10/2025. Assess cash-intensive business scenarios and return a JSON object with exactly these fields: { "riskRating": "critical"|"high"|"medium"|"low", "cashRiskScore": number (0-100), "redFlags": string[], "typologiesMatched": string[], "controlGaps": string[], "enhancedMeasures": string[], "reportingObligations": string[], "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Assess the following cash-intensive business scenario:
- Business Name: ${sanitizeField(body.businessName, 200)}
- Business Type: ${sanitizeField(body.businessType, 100)}
- Monthly Revenue: ${sanitizeField(body.monthlyRevenue, 50)}
- Cash Percentage: ${sanitizeField(body.cashPct, 20)}
- Deposit Pattern: ${body.depositPattern}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "cash-intensive temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as CashIntensiveResult;
    if (!Array.isArray(parsed.redFlags)) parsed.redFlags = [];
    if (!Array.isArray(parsed.typologiesMatched)) parsed.typologiesMatched = [];
    if (!Array.isArray(parsed.controlGaps)) parsed.controlGaps = [];
    if (!Array.isArray(parsed.enhancedMeasures)) parsed.enhancedMeasures = [];
    if (!Array.isArray(parsed.reportingObligations)) parsed.reportingObligations = [];
    void writeAuditChainEntry(
      { event: "cash_intensive.assessed", actor: gate.keyId, riskRating: parsed.riskRating, cashRiskScore: parsed.cashRiskScore, redFlagCount: parsed.redFlags.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "cash-intensive temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
