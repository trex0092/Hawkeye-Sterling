export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface RealEstateMlResult {
  mlRisk: "critical" | "high" | "medium" | "low" | "clear";
  dldRegistrationRisk: string;
  priceManipulation: boolean;
  priceDeviationPct?: number;
  allCashTransaction: boolean;
  thirdPartyPayment: boolean;
  rapidFlipping: boolean;
  offPlanRisk: boolean;
  indicators: Array<{
    indicator: string;
    severity: "critical" | "high" | "medium" | "low";
    category: "price" | "payment" | "identity" | "structure" | "pattern";
    fatfRef: string;
    detail: string;
  }>;
  recommendedAction: "reject" | "escalate_mlro" | "enhanced_dd" | "verify_and_monitor" | "clear";
  actionRationale: string;
  requiredDocumentation: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    propertyDetails: string;
    buyerName?: string;
    buyerNationality?: string;
    paymentMethod?: string;
    purchasePrice?: string;
    marketValue?: string;
    agentName?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.propertyDetails?.trim()) return NextResponse.json({ ok: false, error: "propertyDetails required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "real-estate-ml temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE real estate money laundering specialist with expertise in DLD/RERA transaction patterns, off-plan ML typologies, and FATF Recommendation 22 DNFBP obligations. Analyse real estate transactions for ML red flags including price manipulation, all-cash purchases, third-party payments, rapid flipping, and beneficial ownership opacity. Apply UAE FDL 10/2025 DNFBP requirements and FATF 2022 Real Estate Guidance. Respond ONLY with valid JSON matching the RealEstateMlResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Property Details: ${sanitizeText(body.propertyDetails, 2000)}
Buyer Name: ${sanitizeField(body.buyerName, 500) ?? "not provided"}
Buyer Nationality: ${sanitizeField(body.buyerNationality, 100) ?? "not provided"}
Payment Method: ${sanitizeField(body.paymentMethod, 100) ?? "not specified"}
Purchase Price: ${sanitizeField(body.purchasePrice, 100) ?? "not disclosed"}
Market Value / Benchmark: ${sanitizeField(body.marketValue, 100) ?? "not provided"}
Agent/Broker Name: ${sanitizeField(body.agentName, 500) ?? "not provided"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Assess this real estate transaction for money laundering risk indicators. Return complete RealEstateMlResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RealEstateMlResult;
    if (!Array.isArray(result.indicators)) result.indicators = [];
    if (!Array.isArray(result.requiredDocumentation)) result.requiredDocumentation = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "real-estate-ml temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
