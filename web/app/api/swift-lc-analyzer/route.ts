export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface SwiftLcResult {
  tbmlRisk: "critical" | "high" | "medium" | "low" | "clear";
  messageType: string;
  fieldAnalysis: Array<{
    field: string;
    value: string;
    risk: "high" | "medium" | "low" | "clear";
    finding: string;
  }>;
  priceManipulation: boolean;
  goodsConsistency: "consistent" | "inconsistent" | "unknown";
  routingRisk: "high" | "medium" | "low" | "none";
  amendmentSuspicion: boolean;
  beneficiaryRisk: string;
  indicators: Array<{
    indicator: string;
    severity: "critical" | "high" | "medium" | "low";
    detail: string;
  }>;
  recommendedAction: "reject" | "escalate_mlro" | "enhanced_dd" | "clear";
  actionRationale: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    swiftMessage: string;
    messageType?: string;
    beneficiaryCountry?: string;
    applicantCountry?: string;
    goodsDescription?: string;
    lcValue?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.swiftMessage?.trim()) return NextResponse.json({ ok: false, error: "swiftMessage required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "swift-lc-analyzer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a trade finance TBML specialist with expertise in SWIFT MT700/710/720 field-by-field analysis, FATF trade-based money laundering guidance, documentary credit structures, and world commodity price benchmarking. Analyse SWIFT messages and LC terms for TBML indicators including vague goods descriptions, over/under-invoicing, suspicious routing, amendment patterns, and beneficiary/applicant risk. Apply ICC UCP 600 standards and FATF 2021 trade finance risk guidance. Reference specific SWIFT field numbers in your analysis. Respond ONLY with valid JSON matching the SwiftLcResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `SWIFT Message / LC Terms: ${sanitizeText(body.swiftMessage, 2000)}
Message Type: ${sanitizeField(body.messageType, 100) ?? "to be determined"}
Beneficiary Country: ${sanitizeField(body.beneficiaryCountry, 100) ?? "not specified"}
Applicant Country: ${sanitizeField(body.applicantCountry, 100) ?? "not specified"}
Goods Description: ${sanitizeField(body.goodsDescription, 500) ?? "as per message"}
LC Value: ${sanitizeField(body.lcValue, 100) ?? "as per message"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Analyse this SWIFT/LC for TBML indicators. Return complete SwiftLcResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SwiftLcResult;
    if (!Array.isArray(result.fieldAnalysis)) result.fieldAnalysis = [];
    if (!Array.isArray(result.indicators)) result.indicators = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "swift-lc-analyzer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
