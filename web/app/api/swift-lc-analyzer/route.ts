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

const FALLBACK: SwiftLcResult = {
  tbmlRisk: "high",
  messageType: "MT700 — Issue of a Documentary Credit",
  fieldAnalysis: [
    {
      field: "Field 45A — Description of Goods/Services",
      value: "GENERAL MERCHANDISE AND INDUSTRIAL GOODS",
      risk: "high",
      finding: "Goods description is impermissibly vague — 'general merchandise and industrial goods' provides no commodity specificity. FATF TBML guidance identifies vague goods descriptions as a primary red flag. Compliant LCs should specify commodity, grade, specification, and quantity. This description cannot be benchmarked against world prices and prevents HS code verification.",
    },
    {
      field: "Field 32B — Currency Code/Amount",
      value: "USD 2,850,000",
      risk: "medium",
      finding: "LC value of USD 2,850,000 is a large round-number amount — while not conclusive, ML-related LCs frequently use round or near-round values. Assess against declared quantity and implied unit price once goods description is clarified.",
    },
    {
      field: "Field 59 — Beneficiary",
      value: "GLOBAL TRADE SOLUTIONS FZE, SHARJAH FREE ZONE, UAE",
      risk: "high",
      finding: "UAE free zone beneficiary with no independent trading history identifiable. Free zone entities used as TBML intermediaries present elevated risk — they may serve as pass-through vehicles with no actual goods handling. Beneficiary's business registration date and trading activity should be verified.",
    },
    {
      field: "Field 50 — Applicant",
      value: "AL-BARAKA IMPORT EXPORT LLC, LAHORE, PAKISTAN",
      risk: "high",
      finding: "Applicant is a Pakistani entity — Pakistan is currently on the FATF grey-list (enhanced follow-up). Pakistani trade finance transactions require enhanced due diligence per CBUAE geographic risk classification. Applicant's business registration and actual commodity trading activity should be verified.",
    },
    {
      field: "Field 42C — Drafts at / Field 42A",
      value: "180 DAYS AFTER BILL OF LADING DATE",
      risk: "medium",
      finding: "Deferred payment of 180 days creates an extended exposure period. Deferred payment LCs are commonly used in TBML to create time gaps that obscure the relationship between goods shipment and fund transfer. Combined with vague goods description, elevated concern.",
    },
    {
      field: "Field 46A — Documents Required",
      value: "SIGNED COMMERCIAL INVOICE / PACKING LIST / CERTIFICATE OF ORIGIN",
      risk: "medium",
      finding: "No independent inspection certificate or bill of lading required beyond packing list. For a USD 2.85M transaction, absence of third-party inspection certificate (SGS, Bureau Veritas) is unusual and reduces verification of actual goods shipped.",
    },
  ],
  priceManipulation: true,
  goodsConsistency: "inconsistent",
  routingRisk: "high",
  amendmentSuspicion: false,
  beneficiaryRisk: "High — UAE free zone entity with no verifiable trading history; free zone location used for TBML intermediation in multiple FATF typology cases; beneficial ownership of FZE not confirmed",
  indicators: [
    {
      indicator: "Impermissibly vague goods description",
      severity: "critical",
      detail: "'General merchandise and industrial goods' prevents price benchmarking, HS code verification, or assessment of goods consistency with declared trade relationship — FATF TBML red flag Category 1. Bank should request amended LC with specific commodity description before processing.",
    },
    {
      indicator: "FATF grey-list applicant jurisdiction (Pakistan)",
      severity: "high",
      detail: "Pakistani applicant requires EDD per CBUAE geographic risk classification and FATF R.19. Standard LC processing is insufficient — enhanced due diligence on applicant's business, trading relationship with UAE beneficiary, and source of funds for LC issuance is required.",
    },
    {
      indicator: "UAE free zone beneficiary with unverifiable trading history",
      severity: "high",
      detail: "Free zone entities (FZE/FZCO) are commonly used as TBML pass-through vehicles. The UAE free zone beneficiary should be verified for: actual business premises, trading history, goods handling capability, and UBO confirmation before the LC is confirmed.",
    },
    {
      indicator: "Implied price cannot be verified — no unit price or quantity specified",
      severity: "high",
      detail: "Without commodity specifics, unit price benchmarking against world prices (the primary TBML detection mechanism) is impossible. The LC structure is designed to prevent price verification — this is a deliberate TBML technique.",
    },
    {
      indicator: "Absence of independent inspection certificate requirement",
      severity: "medium",
      detail: "For a USD 2.85M trade transaction with an unknown commodity, absence of a third-party inspection certificate (which would verify quantity and quality of goods) reduces the documentary verification available to the bank.",
    },
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "Combination of vague goods description, grey-list applicant jurisdiction, unverifiable free zone beneficiary, and deferred payment structure presents a high TBML risk profile. MLRO should assess STR filing obligation. Bank should request LC amendment with specific goods description before confirmation. Transaction should not proceed until EDD on both parties is completed.",
  regulatoryBasis: "FATF Trade-Based ML Typologies (2006, updated 2020); FATF Guidance for a Risk-Based Approach — Trade Finance (2021); UAE FDL 10/2025 Art.12 (DNFBP — trade finance); CBUAE AML/CFT Guidelines §6 (trade finance); FATF R.4 (TBML offence); SWIFT MT700 Field Specifications; ICC Uniform Customs and Practice for Documentary Credits (UCP 600)",
};

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
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
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
