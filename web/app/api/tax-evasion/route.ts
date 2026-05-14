export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface TaxEvasionRequest {
  entity: string;
  entityType: "individual" | "corporate" | "trust" | "foundation";
  jurisdiction: string;
  offshoreJurisdictions: string[];
  structureType: "direct" | "holding_company" | "trust_structure" | "foundation" | "hybrid";
  declaredIncome: string;
  estimatedWealth: string;
  transactionPatterns: string;
  taxTreatyAbuse: boolean;
  transferPricingConcerns: boolean;
  shellCompanies: boolean;
  crsReporting: boolean;
  fatcaStatus: "compliant" | "non_compliant" | "unknown";
  context: string;
}

export interface IdentifiedScheme {
  scheme: string;
  description: string;
  estimatedImpact: string;
  detectabilityRisk: "low" | "medium" | "high";
  legalRef: string;
}

export interface JurisdictionAnalysisItem {
  jurisdiction: string;
  role: "tax_haven" | "conduit" | "sink" | "clean";
  bepsRisk: string;
  taxTreatyAbuse: boolean;
}

export interface WealthIncomeDiscrepancy {
  declared: string;
  estimated: string;
  plausibility: "plausible" | "questionable" | "implausible";
  explanation: string;
}

export interface TaxEvasionResult {
  taxEvasionRiskScore: number;
  riskTier: "low" | "medium" | "high" | "critical";
  identifiedSchemes: IdentifiedScheme[];
  jurisdictionAnalysis: JurisdictionAnalysisItem[];
  wealthIncomeDiscrepancy: WealthIncomeDiscrepancy;
  crsGaps: string[];
  transferPricingFlags: string[];
  roundTrippingIndicators: string[];
  regulatoryRequirements: Array<{ obligation: string; regulation: string }>;
  redFlags: string[];
  recommendation: "clear" | "monitor" | "request_tax_docs" | "file_str" | "report_to_tax_authority";
  taxAuthorityReferral: boolean;
  estimatedTaxLiability: string;
  summary: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: TaxEvasionRequest;
  try {
    body = (await req.json()) as TaxEvasionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "tax-evasion temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are an elite UAE MLRO and tax crime specialist. Analyse entity profiles for tax evasion risk as a money laundering predicate offence. Return ONLY valid JSON matching TaxEvasionResult — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse the following entity for tax evasion risk as a money laundering predicate offence:

Entity: ${body.entity}
Entity Type: ${body.entityType}
Home Jurisdiction: ${body.jurisdiction}
Offshore Jurisdictions: ${body.offshoreJurisdictions.join(", ") || "None specified"}
Structure Type: ${body.structureType}
Declared Annual Income: ${body.declaredIncome || "Not provided"}
Estimated Total Wealth: ${body.estimatedWealth || "Not provided"}
Transaction Patterns: ${body.transactionPatterns || "Not provided"}
Tax Treaty Abuse Indicators: ${body.taxTreatyAbuse ? "YES" : "NO"}
Transfer Pricing Concerns: ${body.transferPricingConcerns ? "YES" : "NO"}
Shell Company Involvement: ${body.shellCompanies ? "YES" : "NO"}
CRS Reporting Compliant: ${body.crsReporting ? "YES" : "NO"}
FATCA Status: ${body.fatcaStatus}
Additional Context: ${body.context || "None"}

Perform a comprehensive tax evasion ML risk assessment.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TaxEvasionResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "tax-evasion temporarily unavailable - please retry." }, { status: 503 });
  }
}
