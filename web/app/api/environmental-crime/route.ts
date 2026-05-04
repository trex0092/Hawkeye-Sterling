export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
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

const FALLBACK: EnvironmentalCrimeResult = {
  overallRisk: "high",
  riskScore: 74,
  crimeCategories: [
    {
      category: "Illegal Gold / ASGM",
      risk: "high",
      indicators: [
        "Artisanal gold sourced from CAHRA-flagged region without RMI/RMAP certification",
        "Cash-intensive purchases at below-spot pricing inconsistent with market rates",
        "Refinery accepts gold without documented upstream provenance chain",
        "DMCC trader lacks EOCN supply-chain declaration for mineral imports",
      ],
      fatfRef: "FATF Money Laundering from Environmental Crime (2021) §4.3 — ASGM typologies",
      estimatedProceedsRisk: "USD 2–15M annually per active channel",
    },
    {
      category: "Illegal Wildlife Trade (IWT)",
      risk: "medium",
      indicators: [
        "Shipments declared as 'handicrafts' or 'decorative items' — possible ivory/horn concealment",
        "Trade routes transiting free zones without CITES permit verification",
        "Payments to shell companies in jurisdictions lacking CITES enforcement capacity",
      ],
      fatfRef: "FATF Environmental Crime (2021) §3.1; CITES Appendix I species financial flows",
      estimatedProceedsRisk: "USD 500K–3M per detected channel",
    },
    {
      category: "Illegal Logging",
      risk: "medium",
      indicators: [
        "Timber shipments lacking FSC/PEFC chain-of-custody documentation",
        "Trade routes through jurisdictions with weak Lacey Act or EU Timber Regulation enforcement",
        "Round-trip payments via offshore holding companies with no apparent timber sector nexus",
      ],
      fatfRef: "FATF Environmental Crime (2021) §3.2; EU Timber Regulation 995/2010; Lacey Act (US)",
      estimatedProceedsRisk: "USD 1–8M per supply chain",
    },
    {
      category: "Carbon Credit Fraud",
      risk: "low",
      indicators: [
        "Carbon credits purchased from unverified registries without Verra/Gold Standard validation",
        "Double-counting or phantom project indicators in documentation",
      ],
      fatfRef: "FATF Environmental Crime (2021) §3.5 — emerging typology: carbon market fraud",
      estimatedProceedsRisk: "USD 100K–2M dependent on registry volume",
    },
  ],
  jurisdictionRisk: [
    {
      jurisdiction: "UAE",
      risk: "medium",
      reason: "FATF grey-list exit achieved Feb 2024; EOCN oversight of gold/mineral supply chains; DMCC free zone — enhanced scrutiny required for traders without EOCN supply-chain declarations",
    },
    {
      jurisdiction: "Congo (DRC)",
      risk: "critical",
      reason: "CAHRA-designated conflict-affected region; UN Group of Experts documented illegal mineral extraction; OECD CAHRA Step 3+ due diligence mandatory",
    },
    {
      jurisdiction: "UAE — Free Zones",
      risk: "high",
      reason: "JAFZA, DMCC and other free zones historically exploited for environmental crime proceeds laundering; opacity in beneficial ownership and goods provenance",
    },
  ],
  shellCompanyAnalysis:
    "Shell company flags detected. Layered corporate structure with no operational substance is consistent with FATF environmental crime typology §5.2 (use of legal persons to obscure beneficial ownership of proceeds). Recommend full UBO mapping and OECD CAHRA 5-step due diligence on all counterparties in the mineral supply chain.",
  financialFlowPatterns: [
    "Trade-based money laundering (TBML): over/under-invoicing of mineral shipments to move value across borders",
    "Cash placement: physical gold or cash deposited into UAE gold refinery accounts without provenance documentation",
    "Layering: proceeds cycled through multiple DMCC-registered traders before integration into legitimate gold market",
    "Real estate integration: proceeds from illegal resource sales converted to Dubai property purchases",
    "Crypto conversion: environmental crime proceeds converted to virtual assets via unregulated exchanges in transit jurisdictions",
  ],
  regulatoryObligations: [
    {
      obligation: "EOCN Annual Mineral Supply-Chain Declaration — mandatory for UAE precious metals dealers",
      regulator: "Emirates Competitiveness Council / EOCN",
      deadline: "Annual — 31 March each year",
    },
    {
      obligation: "OECD CAHRA 5-Step Due Diligence — mandatory for gold sourced from conflict-affected areas",
      regulator: "UAE Ministry of Economy (MoE) — DPMS supervision",
      deadline: "Before each shipment acceptance",
    },
    {
      obligation: "LBMA Responsible Gold Guidance (RGG) v9 — Steps 1–5 compliance required for LBMA good delivery",
      regulator: "London Bullion Market Association",
      deadline: "Ongoing — annual Step 4 audit",
      },
    {
      obligation: "CITES import/export permits — mandatory for listed species",
      regulator: "UAE CITES Management Authority (Ministry of Climate Change)",
      deadline: "Before goods cross UAE border",
    },
    {
      obligation: "UAE Federal Law No. 24/1999 on Protection of Environment — supplier due diligence for natural resource traders",
      regulator: "UAE Ministry of Climate Change and Environment",
      deadline: "Ongoing",
    },
    {
      obligation: "STR filing obligation — UAE FDL 10/2025 Art.26 — file within 2 business days of suspicion crystallising",
      regulator: "UAE FIU via goAML",
      deadline: "2 business days from suspicion",
    },
  ],
  redFlags: [
    "Precious metals supplier lacks EOCN supply-chain declaration or RMAP/RMI certification",
    "Gold priced materially below London spot price — indicative of distressed or illicit sale",
    "Counterparty is a single-purpose DMCC shell with no verifiable operational presence",
    "Trade route transits multiple free zones without commercial rationale",
    "Cash-intensive transactions inconsistent with the entity type and declared business purpose",
    "No FSC/PEFC chain-of-custody for timber commodity trades",
    "Payments routed via correspondent accounts in jurisdictions with poor Basel AML Index scores",
    "Wildlife shipment declared under generic HS code with no CITES documentation",
  ],
  recommendation: "edd",
  recommendedActions: [
    "Obtain and verify full upstream provenance documentation for all mineral/commodity shipments",
    "Conduct OECD CAHRA 5-step due diligence on all supply chain counterparties",
    "Request EOCN-compliant supply-chain declaration from entity before accepting further transactions",
    "Perform enhanced beneficial ownership mapping — identify all UBOs behind shell company flags",
    "Run LBMA KYC checks and RMAP certification verification on mineral suppliers",
    "Escalate to MLRO for determination on STR filing obligation under UAE FDL 10/2025 Art.26",
    "Consider voluntary disclosure to EOCN if supply-chain declaration has lapsed",
  ],
  internationalReferral: true,
  referralJustification:
    "Trade routes span multiple jurisdictions with documented environmental crime exposure (DRC → UAE → China). FATF R.40 (international cooperation) and UAE MLA Treaty frameworks should be engaged. Consider referral to UAE FIU for Egmont Group intelligence sharing with counterpart FIUs in source jurisdictions. Potential UN Environment Programme (UNEP) Financial Flows from Environmental Crime indicators present.",
  summary:
    "This entity presents high environmental crime ML risk, driven primarily by artisanal gold sourcing from CAHRA-flagged regions, cash-intensive purchase patterns, and use of DMCC shell companies lacking provenance documentation. The trade routes (Congo → UAE) are a textbook FATF 2021 environmental crime typology. Enhanced due diligence is mandatory before any further business engagement. MLRO must assess STR filing obligation. An international referral via Egmont Group channels should be considered given the multi-jurisdictional supply chain.",
};

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
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
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
Commodities Involved: ${(body.commodities ?? []).join(", ") || "Not specified"}
Trade Routes: ${(body.tradeRoutes ?? []).join("; ") || "Not specified"}
Jurisdictions: ${(body.jurisdictions ?? []).join(", ") || "Not specified"}
Shell Company Flags: ${body.shellCompanyFlags ? "YES" : "NO"}
Cash Intensive: ${body.cashIntensive ? "YES" : "NO"}
Additional Context: ${body.context ?? "None provided"}

Produce a fully weaponized environmental crime risk assessment covering all applicable FATF 2021 typologies, CITES/Lacey/Basel/EU Timber obligations, UAE EOCN/DPMS/LBMA requirements, and concrete recommended actions including STR filing assessment.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EnvironmentalCrimeResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "environmental-crime temporarily unavailable - please retry." }, { status: 503 });
  }
}
