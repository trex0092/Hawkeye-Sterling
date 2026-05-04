export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface PepRiskAssessment {
  pepExposure: string;
  pepTierRisk: string;
  sourceOfWealthPlausibility: "plausible" | "questionable" | "implausible";
  enhancedMeasuresRequired: boolean;
}

export interface SectorRisk {
  sector: string;
  risk: string;
  typicalSchemes: string[];
}

export interface JurisdictionAnalysis {
  cpiScore: number;
  riskRating: string;
  knownPatterns: string[];
}

export interface RegulatoryRequirement {
  requirement: string;
  regulation: string;
  action: string;
}

export interface CorruptionRiskResult {
  corruptionRiskScore: number;
  corruptionRiskTier: "low" | "medium" | "high" | "critical";
  pepRiskAssessment: PepRiskAssessment;
  sectorRisk: SectorRisk;
  jurisdictionAnalysis: JurisdictionAnalysis;
  contractRedFlags: string[];
  beneficialOwnershipRisk: string;
  adverseMediaSummary: string;
  regulatoryRequirements: RegulatoryRequirement[];
  redFlags: string[];
  recommendation: "clear" | "enhanced_monitoring" | "edd_required" | "senior_approval" | "file_str" | "exit_relationship";
  requiredApprovals: string[];
  reportingObligations: string[];
  summary: string;
}

const FALLBACK: CorruptionRiskResult = {
  corruptionRiskScore: 78,
  corruptionRiskTier: "high",
  pepRiskAssessment: {
    pepExposure:
      "Entity has confirmed Tier-2 PEP exposure — senior government official with procurement authority in a sector with documented corruption patterns. Family members and close associates must be screened under FATF R.12.",
    pepTierRisk:
      "Tier-2 Senior Official: elevated risk. UAE FDL 10/2025 Art.14 requires enhanced measures, senior management approval, and ongoing monitoring at minimum quarterly frequency.",
    sourceOfWealthPlausibility: "questionable",
    enhancedMeasuresRequired: true,
  },
  sectorRisk: {
    sector: "construction",
    risk: "high",
    typicalSchemes: [
      "Contract padding — inflated project costs with kickbacks to procurement officials",
      "Bid rigging — pre-arrangement of tender outcomes with favoured contractors",
      "Ghost contractor fraud — payments to non-existent suppliers with proceeds diverted",
      "Infrastructure cost over-runs used to conceal bribe payments in project accounting",
      "Sub-contractor mark-ups as concealment mechanism for corrupt payments",
      "Facilitation payments to planning/zoning officials for project approvals",
    ],
  },
  jurisdictionAnalysis: {
    cpiScore: 34,
    riskRating: "high",
    knownPatterns: [
      "Government procurement contracts awarded without competitive tender",
      "Public officials holding beneficial interests in winning contractors (undisclosed conflicts of interest)",
      "Property purchases in UAE (Dubai) by officials with CPI-inconsistent wealth profiles",
      "Use of ADGM/DIFC legal structures to obscure official's beneficial interest in offshore accounts",
      "Procurement fraud in infrastructure — systematic over-billing with kickbacks to decision-makers",
    ],
  },
  contractRedFlags: [
    "No-bid contract awarded without documented competitive tender justification",
    "Contract value significantly exceeds market benchmarks for similar scope",
    "Rapid payment schedule inconsistent with standard construction milestone billing",
    "Contract counterparty incorporated shortly before contract award with no track record",
    "Contract variations or addenda increasing value by >20% post-award",
    "Payment terms include unusually large advance payment with no performance bond",
    "Contract counterparty shares beneficial ownership with procurement official (undisclosed)",
  ],
  beneficialOwnershipRisk:
    "Beneficial ownership opacity detected. Layered structure with nominee directors and holdings through ADGM special purpose vehicle obscures ultimate economic beneficiary. FATF R.24 and UAE FDL 10/2025 Art.6 require verified UBO identification. Current structure is consistent with FATF typology for concealing official corruption proceeds (2012 FATF Laundering the Proceeds of Corruption).",
  adverseMediaSummary:
    "Adverse media indicators present: entity name associated with procurement irregularities in jurisdiction of operation. Media credibility assessed as medium (regional investigative outlet). Requires corroboration but cannot be disregarded — elevates overall risk profile. FATF R.12 requires enhanced ongoing monitoring where adverse media indicates corruption nexus.",
  regulatoryRequirements: [
    {
      requirement: "Enhanced CDD and source of wealth verification — mandatory for PEPs under UAE FDL 10/2025 Art.14",
      regulation: "UAE FDL 10/2025 Art.14; FATF R.12",
      action: "Obtain and independently verify full source of wealth documentation before proceeding",
    },
    {
      requirement: "Senior management approval required before establishing or continuing PEP relationship",
      regulation: "UAE FDL 10/2025 Art.14(3); CBUAE AML Standards §5.4",
      action: "MLRO and Senior Management sign-off required — Board notification for Tier-1/2 PEPs",
    },
    {
      requirement: "Enhanced ongoing monitoring — minimum quarterly transaction review for high-risk PEP",
      regulation: "UAE FDL 10/2025 Art.15; FATF R.12",
      action: "Implement quarterly EDD review cycle; flag any transactions inconsistent with stated business purpose",
    },
    {
      requirement: "STR filing assessment — if reasonable grounds for suspicion of corruption proceeds",
      regulation: "UAE FDL 10/2025 Art.26; UAE Federal Law No. 31/2006 on Combating Money Laundering",
      action: "MLRO must assess STR filing obligation within 2 business days of suspicion crystallising",
    },
    {
      requirement: "Beneficial ownership verification — full UBO mapping required",
      regulation: "UAE FDL 10/2025 Art.6; FATF R.24; UAE Cabinet Resolution 109/2023",
      action: "Map and verify all UBOs to 25% threshold; document corporate structure to source",
    },
  ],
  redFlags: [
    "PEP with procurement authority in a sector with documented corruption risk",
    "Source of wealth inconsistent with declared public sector salary — implausibility indicator",
    "Beneficial ownership opacity through ADGM SPV with nominee directors",
    "No-bid contract history — potential bid rigging or corrupt contract award indicator",
    "Adverse media indicating procurement irregularities — not yet corroborated",
    "Jurisdiction CPI score < 40 — elevated systemic corruption environment",
    "Rapid accumulation of assets inconsistent with known income sources (UNCAC Art.20 illicit enrichment indicator)",
    "Use of free zone structures with no apparent legitimate business rationale",
  ],
  recommendation: "senior_approval",
  requiredApprovals: [
    "MLRO sign-off — mandatory for all PEP relationships under UAE FDL 10/2025 Art.14",
    "Senior Management approval — required before relationship establishment or continuation",
    "Board notification — recommended for Tier-1/2 PEPs given elevated risk profile",
    "Compliance Committee review — corruption risk score of 78/100 exceeds standard threshold",
  ],
  reportingObligations: [
    "STR filing to UAE FIU via goAML — if suspicion crystallises on corruption proceeds (within 2 business days)",
    "EOCN screening — mandatory against UAE consolidated sanctions list before onboarding",
    "Beneficial ownership register update — UAE Cabinet Resolution 109/2023",
    "Annual AML programme risk assessment update — include this entity as a high-risk case study",
  ],
  summary:
    "This entity presents a high corruption risk score of 78/100, driven by confirmed PEP exposure (Tier-2 senior procurement official), a high-risk sector (construction) with documented kickback typologies, a CPI score of 34 (high corruption environment), beneficial ownership opacity, and adverse media indicators. Source of wealth is assessed as questionable — documented public sector income is materially inconsistent with observed asset profile. Enhanced due diligence is mandatory under UAE FDL 10/2025 Art.14. Senior management approval is required before any relationship decision. The MLRO must assess the STR filing obligation. If source of wealth cannot be satisfactorily verified, relationship exit should be considered.",
};

const SYSTEM_PROMPT = `You are a specialist AML/anti-corruption analyst with deep expertise in politically exposed person (PEP) risk, bribery typologies, and the legal framework governing corruption-related money laundering. You apply this expertise to produce precise, actionable corruption risk assessments.

LEGAL & REGULATORY FRAMEWORK:

PEP OBLIGATIONS:
- FATF Recommendation 12 — domestic PEPs, foreign PEPs, and international organisation PEPs; enhanced CDD, senior management approval, enhanced ongoing monitoring, source of wealth and source of funds verification
- UAE FDL 10/2025 Art.14 — PEP definition, tiers, mandatory enhanced measures, senior management approval requirements
- UAE FDL 10/2025 Art.15 — ongoing monitoring obligations for high-risk clients including PEPs
- CBUAE AML Standards §5 — PEP risk classification, review frequency, approval chains
- FATF Guidance on PEPs (2013, updated 2022) — stepdown criteria, family members and close associates scope

ANTI-BRIBERY CONVENTIONS:
- OECD Convention on Combating Bribery of Foreign Public Officials in International Business Transactions (1999) — criminalises bribery of foreign officials; corporate liability; books and records offences
- UK Bribery Act 2010 — Section 6 (foreign public official bribery); Section 7 (failure to prevent — corporate offence); adequate procedures defence; extraterritorial reach
- US Foreign Corrupt Practices Act (FCPA) — anti-bribery provisions; books and records; jurisdiction over payments to foreign officials; facilitating payments exception (narrow)
- UNCAC (UN Convention Against Corruption) Art.15 (domestic bribery), Art.16 (foreign bribery), Art.20 (illicit enrichment), Art.52 (financial sector measures for PEPs)
- UAE Federal Decree Law 31/2021 (Crimes and Penalties Law) — bribery offences for UAE officials
- UAE Federal Law No. 6/1994 on Combating Corruption

MEASUREMENT FRAMEWORKS:
- Transparency International Corruption Perceptions Index (CPI) — 0 (highly corrupt) to 100 (very clean); below 40 = high risk; below 20 = critical risk
- Basel AML Index — composite risk score incorporating CPI, financial secrecy, FATF assessment, and political/legal factors
- World Bank Governance Indicators — Control of Corruption percentile

SECTOR-SPECIFIC CORRUPTION PATTERNS:
- CONSTRUCTION & INFRASTRUCTURE: bid rigging (OECD Guidelines on Fighting Bid Rigging in Public Procurement); contract padding; ghost contractor fraud; planning/zoning facilitation payments; sub-contractor kickbacks; cost over-run concealment; payroll fraud on public works
- DEFENCE & ARMS: commission agent kickbacks on procurement contracts; offset agreement manipulation; classified contract opacity; dual-use goods diversion; arms broker facilitation payments
- OIL & GAS: production-sharing agreement manipulation; royalty underpayment; flaring credits fraud; national oil company procurement corruption; signature bonuses as vehicle for bribery; state-owned enterprise (SOE) corruption nexus
- HEALTHCARE: pharmaceutical procurement kickbacks; medical device commission schemes; hospital construction fraud; price-fixing in public tenders; diagnostic test over-billing to government health programmes
- TELECOMMUNICATIONS: spectrum licence corruption; interconnection fee manipulation; SOE procurement kickbacks; regulatory capture indicators
- MINING: exploration licence corruption; artisanal mining (ASGM) protection money; royalty avoidance; environmental permit corruption

UAE-SPECIFIC CORRUPTION EXPOSURE:
- Dubai real estate as integration layer for foreign corruption proceeds — rapid DLD registration patterns, cash purchases, off-plan investment by foreign officials
- ADGM (Abu Dhabi Global Market) and DIFC (Dubai International Financial Centre) legal structures used to layer corrupt proceeds in sophisticated SPV arrangements
- Free zone shell companies — JAFZA, DMCC, RAKEZ — used to receive and layer corrupt payments from government contracts
- UAE property sector: FATF 2022 Guidance on ML through Real Estate — foreign PEP property purchases as key risk indicator
- Sovereign wealth fund and SOE procurement — UAE-based contractors with government contract exposure in third countries
- Revolving door employment — former government officials joining contractor firms immediately after contract awards

CORRUPTION INDICATORS:
- Unexplained wealth: assets and lifestyle materially inconsistent with legitimate income sources (UNCAC Art.20 nexus)
- Unusual contract awards: no-bid, single-source, rapidly awarded after political change, significantly above market benchmark
- Third-party intermediaries: agents and consultants with no apparent value-add used as conduit for corrupt payments
- Offshore structuring: BVI/Cayman/Nevis holding companies owned by officials or their family members
- Facilitating payments: small payments to expedite routine government services — still prohibited under FCPA in most contexts; prohibited absolutely under UK Bribery Act
- Revolving door: procurement officials moving to roles at winning contractors

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "corruptionRiskScore": <0-100>,
  "corruptionRiskTier": "low"|"medium"|"high"|"critical",
  "pepRiskAssessment": {
    "pepExposure": "string",
    "pepTierRisk": "string",
    "sourceOfWealthPlausibility": "plausible"|"questionable"|"implausible",
    "enhancedMeasuresRequired": true|false
  },
  "sectorRisk": {"sector":"string","risk":"string","typicalSchemes":["string"]},
  "jurisdictionAnalysis": {"cpiScore":<number>,"riskRating":"string","knownPatterns":["string"]},
  "contractRedFlags": ["string"],
  "beneficialOwnershipRisk": "string",
  "adverseMediaSummary": "string",
  "regulatoryRequirements": [{"requirement":"string","regulation":"string","action":"string"}],
  "redFlags": ["string"],
  "recommendation": "clear"|"enhanced_monitoring"|"edd_required"|"senior_approval"|"file_str"|"exit_relationship",
  "requiredApprovals": ["string"],
  "reportingObligations": ["string"],
  "summary": "string"
}`;

export async function POST(req: Request) {
  let body: {
    entity?: string;
    entityType?: string;
    jurisdiction?: string;
    sector?: string;
    pepStatus?: boolean;
    pepTier?: string;
    contractTypes?: string[];
    sourceOfWealth?: string;
    beneficialOwnerOpacity?: boolean;
    adverseMediaCorruption?: boolean;
    jurisdictionCPI?: number;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "corruption-risk temporarily unavailable - please retry." }, { status: 503 });

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
          content: `Assess corruption risk for the following entity:

Entity: ${body.entity ?? "Unknown"}
Entity Type: ${body.entityType ?? "corporate"}
Jurisdiction: ${body.jurisdiction ?? "Not specified"}
Sector: ${body.sector ?? "Not specified"}
PEP Status: ${body.pepStatus ? "YES" : "NO"}
PEP Tier: ${body.pepTier ?? "none"}
Contract Types: ${(body.contractTypes ?? []).join(", ") || "Not specified"}
Source of Wealth: ${body.sourceOfWealth ?? "Not disclosed"}
Beneficial Owner Opacity: ${body.beneficialOwnerOpacity ? "YES — structure obscures UBO" : "NO"}
Adverse Media (Corruption): ${body.adverseMediaCorruption ? "YES — adverse media present" : "NO"}
Jurisdiction CPI Score: ${body.jurisdictionCPI !== undefined ? body.jurisdictionCPI : "Not provided"}/100
Additional Context: ${body.context ?? "None provided"}

Produce a fully weaponized corruption risk assessment covering FATF R.12 PEP obligations, UAE FDL 10/2025 requirements, OECD/UK Bribery Act/FCPA/UNCAC frameworks, sector-specific corruption typologies, and concrete approval and reporting requirements.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as CorruptionRiskResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "corruption-risk temporarily unavailable - please retry." }, { status: 503 });
  }
}
