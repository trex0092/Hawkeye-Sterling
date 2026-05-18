export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface EnvCrimeCategory {
  category: string;
  risk: "low" | "medium" | "high" | "critical";
  indicators: string[];
  fatfRef: string;
  estimatedProceedsRisk: string;
}

export interface JurisdictionRiskEntry {
  jurisdiction: string;
  risk: string;
  reason: string;
}

export interface RegulatoryObligation {
  obligation: string;
  regulator: string;
  deadline: string;
}

export interface EnvironmentalCrimeResult {
  overallRisk: "low" | "medium" | "high" | "critical";
  riskScore: number;
  crimeCategories: EnvCrimeCategory[];
  jurisdictionRisk: JurisdictionRiskEntry[];
  shellCompanyAnalysis: string;
  financialFlowPatterns: string[];
  regulatoryObligations: RegulatoryObligation[];
  redFlags: string[];
  recommendation: "clear" | "monitor" | "edd" | "file_str" | "report_to_enforcement";
  recommendedActions: string[];
  internationalReferral: boolean;
  referralJustification: string;
  summary: string;
}


const SYSTEM_PROMPT = `You are a specialist AML analyst for environmental crime — one of the FATF-designated high-priority money laundering threats. You have deep expertise in:

LEGAL & REGULATORY FRAMEWORK:
- FATF "Money Laundering from Environmental Crime" (2021) — full typology analysis covering illegal wildlife trade (IWT), illegal logging, illegal gold/artisanal mining (ASGM), illegal fishing, carbon credit fraud, and waste trafficking
- Basel Convention on transboundary movement of hazardous waste
- CITES (Convention on International Trade in Endangered Species) — Appendix I, II, III controls and financial flows
- US Lacey Act — prohibition on trade in illegally sourced wildlife and timber
- EU Timber Regulation (995/2010) — due diligence obligations for timber importers
- EU Conflict Minerals Regulation (2017/821) — tin, tantalum, tungsten, gold (3TG)
- UN Environment Programme (UNEP) financial flows from environmental crime — USD 110–281 billion annually globally
- OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas (CAHRA) — 5-step framework

UAE-SPECIFIC CONTEXT:
- EOCN (Emirates Competitiveness Council) role in overseeing precious metals supply-chain declarations
- UAE as a major gold refining and re-export hub — DMCC (Dubai Multi Commodities Centre) traders and free zone exploitation risks
- LBMA Responsible Gold Guidance (RGG) v9 — Steps 1–5 compliance for UAE gold refiners
- UAE MoE DPMS supervision — cash transaction thresholds (AED 55,000) and STR obligations
- RMI Responsible Minerals Assurance Process (RMAP) — smelter/refiner certification
- UAE Federal Law 24/1999 on Environment Protection
- UAE CITES Management Authority — permits required for all listed species imports/exports
- Free zone exploitation: JAFZA, DMCC, RAKEZ used as transit/opacity points

ENVIRONMENTAL CRIME TYPOLOGIES (per FATF 2021):
1. ILLEGAL WILDLIFE TRADE (IWT): Misclassification of HS codes, CITES permit forgery, use of free zones as transit points, cash-intensive payments to wildlife brokers, shell company layering in jurisdictions with weak IWT enforcement
2. ILLEGAL LOGGING: Over/under-invoicing of timber shipments, false FSC/PEFC certificates, trade-based money laundering (TBML) through timber invoicing, payment flows through jurisdictions lacking EU Timber Regulation equivalents
3. ASGM (Artisanal/Small-Scale Gold Mining): Gold sourced from CAHRA regions, lack of OECD 5-step due diligence, physical gold smuggling, cash purchases at below-spot prices, DMCC shell trader layering, LBMA Good Delivery fraud
4. ILLEGAL FISHING (IUU): Beneficial ownership opacity in vessel registration, port shopping, flag-of-convenience vessels, misreporting of catch volumes, payment flows through offshore structures
5. CARBON CREDIT FRAUD: Double-counting, phantom offset projects, unverified registries, VCM (voluntary carbon market) manipulation, shell company issuers
6. WASTE TRAFFICKING: Basel Convention violations, illegal cross-border shipment of hazardous waste, false declarations on customs documentation

RED FLAG INDICATORS (FATF 2021 & UNEP):
- Commodity prices inconsistent with international market benchmarks
- Trade routes through jurisdictions with poor environmental enforcement (CAHRA regions, IUU-flagged flag states)
- Shell companies in free zones as intermediaries with no operational nexus
- Cash-intensive transactions inconsistent with entity type
- Circular payment flows back to originating jurisdiction
- Use of multiple invoices for single shipment
- Absence of required environmental permits, CITES documentation, or supply-chain declarations
- Beneficial ownership opacity across multiple jurisdictions
- Rapid turnover of natural resource commodity without apparent value addition

FINANCIAL INTELLIGENCE INDICATORS:
- Structuring of payments below AED 55,000 CTR threshold
- Trade finance instruments (LC, documentary collections) with commodity misrepresentation
- Virtual asset conversion as integration layer
- Real estate purchases in UAE by counterparties involved in natural resource extraction in high-risk regions
- Unexplained wealth accumulation by officials in resource-rich jurisdictions (UNCAC Art.20 illicit enrichment nexus)

You must produce a comprehensive, actionable environmental crime risk assessment. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "overallRisk": "low"|"medium"|"high"|"critical",
  "riskScore": <0-100>,
  "crimeCategories": [{"category":"string","risk":"low"|"medium"|"high"|"critical","indicators":["string"],"fatfRef":"string","estimatedProceedsRisk":"string"}],
  "jurisdictionRisk": [{"jurisdiction":"string","risk":"string","reason":"string"}],
  "shellCompanyAnalysis": "string",
  "financialFlowPatterns": ["string"],
  "regulatoryObligations": [{"obligation":"string","regulator":"string","deadline":"string"}],
  "redFlags": ["string"],
  "recommendation": "clear"|"monitor"|"edd"|"file_str"|"report_to_enforcement",
  "recommendedActions": ["string"],
  "internationalReferral": true|false,
  "referralJustification": "string",
  "summary": "string"
}`;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: {
    entity?: string;
    entityType?: string;
    commodities?: string[];
    tradeRoutes?: string[];
    jurisdictions?: string[];
    shellCompanyFlags?: boolean;
    cashIntensive?: boolean;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "environmental-crime temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Assess environmental crime money laundering risk for the following:

Entity: ${body.entity ?? "Unknown"}
Entity Type: ${body.entityType ?? "corporate"}
Commodities Involved: ${( Array.isArray(body.commodities) ? body.commodities : []).join(", ") || "Not specified"}
Trade Routes: ${( Array.isArray(body.tradeRoutes) ? body.tradeRoutes : []).join("; ") || "Not specified"}
Jurisdictions: ${( Array.isArray(body.jurisdictions) ? body.jurisdictions : []).join(", ") || "Not specified"}
Shell Company Flags: ${body.shellCompanyFlags ? "YES" : "NO"}
Cash Intensive: ${body.cashIntensive ? "YES" : "NO"}
Additional Context: ${body.context ?? "None provided"}

Produce a fully weaponized environmental crime risk assessment covering all applicable FATF 2021 typologies, CITES/Lacey/Basel/EU Timber obligations, UAE EOCN/DPMS/LBMA requirements, and concrete recommended actions including STR filing assessment.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EnvironmentalCrimeResult;
    if (!Array.isArray(result.crimeCategories)) result.crimeCategories = [];
    else for (const cat of result.crimeCategories) { if (!Array.isArray(cat.indicators)) cat.indicators = []; }
    if (!Array.isArray(result.jurisdictionRisk)) result.jurisdictionRisk = [];
    if (!Array.isArray(result.financialFlowPatterns)) result.financialFlowPatterns = [];
    if (!Array.isArray(result.regulatoryObligations)) result.regulatoryObligations = [];
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.recommendedActions)) result.recommendedActions = [];
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "environmental-crime temporarily unavailable - please retry." }, { status: 503 });
  }
}
