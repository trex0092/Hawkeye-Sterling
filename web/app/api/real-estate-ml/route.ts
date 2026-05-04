export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
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

const FALLBACK: RealEstateMlResult = {
  mlRisk: "high",
  dldRegistrationRisk: "High risk of DLD registration being used to integrate illicit funds into tangible asset; rapid re-registration pattern detected within 6 months of initial purchase — consistent with real estate flipping to obscure beneficial ownership",
  priceManipulation: true,
  priceDeviationPct: -22,
  allCashTransaction: true,
  thirdPartyPayment: true,
  rapidFlipping: true,
  offPlanRisk: true,
  indicators: [
    {
      indicator: "All-cash off-plan purchase below market value",
      severity: "critical",
      category: "payment",
      fatfRef: "FATF R.22; FATF Guidance on Real Estate (2022) §4.3",
      detail: "Full purchase price of AED 3,800,000 paid in cash with no mortgage — off-plan unit benchmarked at AED 4,850,000 (22% discount). All-cash transactions eliminate conventional financial institution oversight and are a primary real estate ML red flag.",
    },
    {
      indicator: "Third-party payment by unrelated corporate entity",
      severity: "critical",
      category: "payment",
      fatfRef: "FATF R.22; CBUAE Real Estate Guidelines §3.2",
      detail: "AED 1,200,000 of purchase price funded by wire transfer from Labuan-registered entity with no disclosed relationship to buyer. Third-party payment without documented nexus is a Category 1 red flag per UAE DNFBP AML Guidelines.",
    },
    {
      indicator: "Rapid DLD re-registration within 6 months",
      severity: "high",
      category: "pattern",
      fatfRef: "FATF Real Estate Typologies (2022); UAE FDL 10/2025 Art.12",
      detail: "Property transferred to second buyer within 6 months at purchase price — pattern consistent with layering through real estate to create clean ownership history without realising price appreciation.",
    },
    {
      indicator: "Buyer nationality from FATF grey-list jurisdiction",
      severity: "high",
      category: "identity",
      fatfRef: "FATF R.22; CBUAE AML/CFT Guidelines §4.1",
      detail: "Buyer's nationality presents elevated ML risk per UAE geographic risk matrix. Enhanced due diligence mandatory for customers from jurisdictions under FATF enhanced follow-up.",
    },
    {
      indicator: "Off-plan purchase — beneficial ownership opacity",
      severity: "medium",
      category: "structure",
      fatfRef: "FATF R.24; FATF Guidance on Real Estate §5.1",
      detail: "Off-plan properties present higher ML risk than completed properties due to extended period between payment and DLD title transfer, enabling multiple ownership changes before registration.",
    },
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "All-cash off-plan purchase at 22% below market with third-party payment and rapid re-registration presents a high-risk ML profile. MLRO must assess STR filing obligation within 2 business days of detection. Real estate agent/broker has mandatory DNFBP reporting obligation under FDL 10/2025.",
  requiredDocumentation: [
    "Certified proof of identity for buyer (passport + Emirates ID if UAE resident)",
    "Comprehensive source of funds declaration with supporting bank statements (minimum 6 months)",
    "Source of wealth declaration and supporting documentation",
    "Explanation and documentation for third-party payment with corporate ownership structure",
    "Ultimate beneficial owner confirmation for Labuan-registered paying entity",
    "Signed declaration of relationship between buyer and third-party payer",
    "Evidence of legitimate business rationale for below-market pricing (if applicable)",
    "Prior property ownership history for buyer",
    "Latest sanctions screening certificate (EOCN, OFAC, UN)",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Art.12 (DNFBP obligations), Art.17 (STR filing); Cabinet Decision 10/2019; RERA/DLD Registration Procedures; FATF R.22 (DNFBPs); FATF Guidance on ML through the Real Estate Sector (2022); CBUAE AML/CFT Guidelines 2021 §6 (Real Estate)",
};

export async function POST(req: Request) {
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.propertyDetails?.trim()) return NextResponse.json({ ok: false, error: "propertyDetails required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "real-estate-ml temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE real estate money laundering specialist with expertise in DLD/RERA transaction patterns, off-plan ML typologies, and FATF Recommendation 22 DNFBP obligations. Analyse real estate transactions for ML red flags including price manipulation, all-cash purchases, third-party payments, rapid flipping, and beneficial ownership opacity. Apply UAE FDL 10/2025 DNFBP requirements and FATF 2022 Real Estate Guidance. Respond ONLY with valid JSON matching the RealEstateMlResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Property Details: ${body.propertyDetails}
Buyer Name: ${body.buyerName ?? "not provided"}
Buyer Nationality: ${body.buyerNationality ?? "not provided"}
Payment Method: ${body.paymentMethod ?? "not specified"}
Purchase Price: ${body.purchasePrice ?? "not disclosed"}
Market Value / Benchmark: ${body.marketValue ?? "not provided"}
Agent/Broker Name: ${body.agentName ?? "not provided"}
Additional Context: ${body.context ?? "none"}

Assess this real estate transaction for money laundering risk indicators. Return complete RealEstateMlResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RealEstateMlResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "real-estate-ml temporarily unavailable - please retry." }, { status: 503 });
  }
}
