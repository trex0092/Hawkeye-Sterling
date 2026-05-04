export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface RegChange {
  regulation: string;
  jurisdiction: string;
  effectiveDate: string;
  changeType: "new" | "amendment" | "repeal";
  impactLevel: "low" | "medium" | "high" | "critical";
  affectedProducts: string[];
  affectedClientTypes: string[];
  requiredActions: string[];
  implementationDeadline: string;
  summary: string;
}

export interface ComplianceRoadmapMonth {
  month: string;
  actions: string[];
}

export interface RegChangeResult {
  ok: true;
  upcomingChanges: RegChange[];
  immediateActions: string[];
  totalChanges: number;
  criticalCount: number;
  complianceRoadmap: ComplianceRoadmapMonth[];
}

const FALLBACK: RegChangeResult = {
  ok: true,
  totalChanges: 8,
  criticalCount: 2,
  immediateActions: [
    "Review DORA ICT risk management requirements — application to operational resilience programme due within 30 days",
    "Update AML/CFT policies to reflect FATF 2024 Guidance on Virtual Assets — effective for VASPs immediately",
    "Commence MiCA Article 45 whitepaper update for all crypto-asset services — deadline approaching",
  ],
  upcomingChanges: [
    {
      regulation: "EU Markets in Crypto-Assets Regulation (MiCA) — Full Application",
      jurisdiction: "EU",
      effectiveDate: "2024-12-30",
      changeType: "new",
      impactLevel: "critical",
      affectedProducts: ["Crypto-asset trading", "VASP services", "Stablecoin issuance"],
      affectedClientTypes: ["Retail", "Institutional", "Professional"],
      requiredActions: [
        "Obtain CASP licence from national competent authority",
        "Publish updated crypto-asset whitepapers",
        "Implement MiCA-compliant AML/CFT programme",
        "Establish complaints handling procedure per Art. 71",
        "Appoint MiCA compliance officer",
      ],
      implementationDeadline: "2024-12-30",
      summary: "Full application of MiCA to crypto-asset service providers. All VASPs must hold CASP authorisation and comply with prudential, conduct, and AML requirements. Critical for any institution offering crypto-asset services in the EU.",
    },
    {
      regulation: "EU Digital Operational Resilience Act (DORA)",
      jurisdiction: "EU",
      effectiveDate: "2025-01-17",
      changeType: "new",
      impactLevel: "critical",
      affectedProducts: ["All digital financial services"],
      affectedClientTypes: ["All client types"],
      requiredActions: [
        "Implement ICT risk management framework per Art. 5-16",
        "Establish ICT-related incident reporting process",
        "Conduct digital operational resilience testing (TLPT for significant firms)",
        "Register and manage ICT third-party providers",
        "Document ICT concentration risk across providers",
      ],
      implementationDeadline: "2025-01-17",
      summary: "DORA establishes harmonised ICT risk management requirements for EU financial entities. All in-scope entities must have comprehensive ICT risk frameworks, incident reporting, resilience testing and third-party ICT oversight.",
    },
    {
      regulation: "Basel III Final Rules — Credit Risk Capital",
      jurisdiction: "Global",
      effectiveDate: "2025-01-01",
      changeType: "amendment",
      impactLevel: "high",
      affectedProducts: ["Commercial lending", "Retail mortgages", "Trade finance"],
      affectedClientTypes: ["Corporate", "Retail", "SME"],
      requiredActions: [
        "Recalculate RWA using new standardised approach",
        "Review internal model eligibility under revised IRB constraints",
        "Update capital planning models for output floor (72.5%)",
        "Assess impact on product pricing and capital allocation",
      ],
      implementationDeadline: "2025-01-01",
      summary: "Final Basel III revisions introduce revised standardised credit risk weights, constraints on internal models, and a 72.5% output floor. Material impact on RWA calculations for banks with large mortgage or corporate lending portfolios.",
    },
    {
      regulation: "EU Anti-Money Laundering Package (6AMLD / AMLA Regulation)",
      jurisdiction: "EU",
      effectiveDate: "2027-07-01",
      changeType: "new",
      impactLevel: "high",
      affectedProducts: ["All products", "Cross-border payments", "Crypto-assets"],
      affectedClientTypes: ["All client types"],
      requiredActions: [
        "Review and update AML/CFT policies for harmonised EU rulebook",
        "Prepare for direct supervision by AMLA for highest-risk cross-border institutions",
        "Update beneficial ownership verification procedures",
        "Implement enhanced due diligence for crypto-asset transfers",
        "Review and update PEP list screening procedures to AMLA standards",
      ],
      implementationDeadline: "2027-07-01",
      summary: "The EU AML Package creates a single AML/CFT rulebook, establishes AMLA as direct supervisor for highest-risk cross-border entities, and expands scope to include crypto-asset service providers and new obliged entities.",
    },
    {
      regulation: "FCA Consumer Duty — Annual Board Report",
      jurisdiction: "UK",
      effectiveDate: "2025-07-31",
      changeType: "amendment",
      impactLevel: "high",
      affectedProducts: ["Retail banking", "Investments", "Insurance", "Mortgages"],
      affectedClientTypes: ["Retail"],
      requiredActions: [
        "Prepare annual Consumer Duty board report for July 2025",
        "Evidence outcomes monitoring across four outcomes (products, price, consumer understanding, support)",
        "Review and update fair value assessments",
        "Document vulnerable customer identification and support processes",
      ],
      implementationDeadline: "2025-07-31",
      summary: "FCA Consumer Duty requires annual board review and sign-off of consumer outcomes monitoring. Firms must evidence that products and services deliver good outcomes for retail customers across all four outcome areas.",
    },
    {
      regulation: "UAE FDL 10/2025 — Designated Non-Financial Businesses & Professions",
      jurisdiction: "UAE",
      effectiveDate: "2025-01-01",
      changeType: "new",
      impactLevel: "high",
      affectedProducts: ["Gold trading", "Real estate", "High-value goods"],
      affectedClientTypes: ["Corporate", "HNW", "PEP"],
      requiredActions: [
        "Update AML/CFT programme to FDL 10/2025 standards",
        "Implement enhanced PEP screening per Art. 16",
        "Register with relevant UAE supervisory authority",
        "File annual EWRA with board approval",
        "Ensure MLRO meets new qualification requirements",
      ],
      implementationDeadline: "2025-01-01",
      summary: "UAE Federal Decree-Law No. 10 of 2025 on AML/CFT replaces FDL 20/2018. Introduces strengthened obligations for DNFBPs including gold dealers, enhanced PEP requirements, and new governance accountability provisions.",
    },
    {
      regulation: "FATF Guidance on Virtual Assets (Updated 2024)",
      jurisdiction: "Global",
      effectiveDate: "2024-11-01",
      changeType: "amendment",
      impactLevel: "medium",
      affectedProducts: ["Crypto-asset services", "DeFi", "NFT platforms"],
      affectedClientTypes: ["Retail", "Institutional"],
      requiredActions: [
        "Update VASP risk assessment for DeFi and NFT risks",
        "Review travel rule implementation for crypto transfers",
        "Enhance transaction monitoring for red flags identified in guidance",
      ],
      implementationDeadline: "2024-11-01",
      summary: "FATF updated guidance clarifies virtual asset red flags, DeFi compliance expectations, and travel rule implementation. VASPs and financial institutions offering crypto services must update risk assessments and controls.",
    },
    {
      regulation: "EU Regulation on Transfer of Funds (Recast) — Travel Rule",
      jurisdiction: "EU",
      effectiveDate: "2024-12-30",
      changeType: "new",
      impactLevel: "medium",
      affectedProducts: ["Crypto-asset transfers", "Wire transfers"],
      affectedClientTypes: ["All client types"],
      requiredActions: [
        "Implement travel rule for all crypto-asset transfers regardless of amount",
        "Integrate with VASP directory for counterparty identification",
        "Update customer data collection for originator/beneficiary information",
      ],
      implementationDeadline: "2024-12-30",
      summary: "The recast Transfer of Funds Regulation extends the travel rule to crypto-asset transfers, requiring originator and beneficiary information for all crypto transfers, removing the EUR 1,000 threshold that applied to wire transfers.",
    },
  ],
  complianceRoadmap: [
    {
      month: "May 2025",
      actions: [
        "Complete DORA ICT risk management framework gap analysis",
        "Initiate MiCA CASP licence application preparation",
        "File EOCN annual mineral supply-chain declaration (DNFBP)",
      ],
    },
    {
      month: "June 2025",
      actions: [
        "Submit DORA ICT incident classification and reporting procedures",
        "Update AML/CFT policies for FDL 10/2025 compliance",
        "Complete travel rule implementation testing",
      ],
    },
    {
      month: "July 2025",
      actions: [
        "Submit FCA Consumer Duty annual board report (deadline 31 July)",
        "Finalise DORA third-party ICT provider register",
        "Complete Basel III RWA recalculation and capital planning update",
      ],
    },
    {
      month: "Q3 2025",
      actions: [
        "Complete MiCA whitepaper updates and publication",
        "Conduct DORA resilience testing (tabletop exercises)",
        "Implement AMLA preparation programme — gap analysis against new AML package",
      ],
    },
    {
      month: "Q4 2025",
      actions: [
        "Finalise MiCA CASP licence application submission",
        "Annual AML/CFT programme review incorporating FATF 2024 guidance",
        "Board approval of updated EWRA (FDL 10/2025 requirement)",
      ],
    },
    {
      month: "2026",
      actions: [
        "Ongoing DORA TLPT for significant firms",
        "Continue AMLA transition programme",
        "Annual Consumer Duty board report preparation",
      ],
    },
  ],
};

export async function POST(req: Request) {
  let body: {
    institution?: {
      type?: string;
      jurisdictions?: string[];
      products?: string[];
      clientTypes?: string[];
    };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "reg-change temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      system: [
        {
          type: "text",
          text: `You are a financial services regulatory change expert with deep knowledge of global financial regulation including EU (MiCA, DORA, AML Package, MiFID II, CRR/CRD VI, CSRD), UK (FCA Consumer Duty, PRA rules, UK Basel III), UAE (FDL 10/2025, CBUAE regulations, VARA, DFSA), US (Dodd-Frank, BSA/AML, SEC/CFTC rules), and FATF/Basel standards. Today's date is 2025-05-01.

Generate a comprehensive regulatory change management report for the institution described. Focus on regulations with impact in the next 24 months from today. Include only regulations genuinely applicable to the institution's type, jurisdictions, products, and client types.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "upcomingChanges": [
    {
      "regulation": "string",
      "jurisdiction": "string",
      "effectiveDate": "YYYY-MM-DD",
      "changeType": "new"|"amendment"|"repeal",
      "impactLevel": "low"|"medium"|"high"|"critical",
      "affectedProducts": ["string"],
      "affectedClientTypes": ["string"],
      "requiredActions": ["string"],
      "implementationDeadline": "string",
      "summary": "string"
    }
  ],
  "immediateActions": ["string"],
  "totalChanges": number,
  "criticalCount": number,
  "complianceRoadmap": [
    {"month": "string", "actions": ["string"]}
  ]
}

Sort upcomingChanges by effectiveDate ascending. immediateActions are those due within 30 days. complianceRoadmap should cover month-by-month through end of 2026.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Institution profile:
Type: ${body.institution?.type ?? "Financial institution"}
Jurisdictions: ${JSON.stringify(body.institution?.jurisdictions ?? [])}
Products: ${JSON.stringify(body.institution?.products ?? [])}
Client Types: ${JSON.stringify(body.institution?.clientTypes ?? [])}

Generate a comprehensive regulatory change roadmap covering all material upcoming regulatory changes affecting this institution across its jurisdictions and product set. Include EU, UK, UAE, US, and global (FATF/Basel) changes as applicable. Produce a month-by-month compliance implementation roadmap.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RegChangeResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "reg-change temporarily unavailable - please retry." }, { status: 503 });
  }
}
