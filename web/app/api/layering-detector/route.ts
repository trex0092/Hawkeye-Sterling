export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface LayeringResult {
  layeringRisk: "critical" | "high" | "medium" | "low" | "none";
  placementIndicators: string[];
  layeringIndicators: string[];
  integrationIndicators: string[];
  stageDetected: "placement" | "layering" | "integration" | "multiple" | "none";
  velocityAnalysis: string;
  accountHopping: boolean;
  jurisdictionHopping: boolean;
  roundTripSuspicion: boolean;
  structureComplexity: "high" | "medium" | "low";
  indicators: Array<{
    indicator: string;
    stage: string;
    severity: "critical" | "high" | "medium" | "low";
    detail: string;
  }>;
  recommendedAction: "file_str" | "escalate_mlro" | "enhanced_monitoring" | "clear";
  actionRationale: string;
  requiredActions: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  let body: {
    transactions: string;
    subjectName?: string;
    accountRefs?: string;
    periodDays?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.transactions?.trim()) return NextResponse.json({ ok: false, error: "transactions required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "layering-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE money laundering specialist identifying placement, layering, and integration stages per FATF typologies and UAE Federal Decree-Law 10/2025 (FDL 10/2025). Analyse transaction descriptions for all three ML stages, account/jurisdiction hopping, round-trip structures, and structuring patterns. Apply FATF typology guidance on layering schemes including wire layering, corporate vehicle misuse, and real estate integration. Provide actionable recommendations referencing UAE AML legal obligations. Respond ONLY with valid JSON matching the LayeringResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Transaction Description: ${sanitizeText(body.transactions, 2000)}
Subject Name: ${sanitizeField(body.subjectName, 500) ?? "not provided"}
Account References: ${sanitizeField(body.accountRefs, 500) ?? "not provided"}
Period Under Review: ${body.periodDays ? sanitizeField(body.periodDays, 50) + " days" : "not specified"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Analyse for money laundering placement, layering, and integration stages. Return complete LayeringResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as LayeringResult;
    if (!Array.isArray(result.placementIndicators)) result.placementIndicators = [];
    if (!Array.isArray(result.layeringIndicators)) result.layeringIndicators = [];
    if (!Array.isArray(result.integrationIndicators)) result.integrationIndicators = [];
    if (!Array.isArray(result.indicators)) result.indicators = [];
    if (!Array.isArray(result.requiredActions)) result.requiredActions = [];
    void writeAuditChainEntry({ event: "layering_detector.completed", actor: gate.keyId }, tenant).catch(() => {});
return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "layering-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
