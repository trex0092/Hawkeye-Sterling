export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { enforce } from "@/lib/server/enforce";
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface SupplierRisk {
  name: string;
  country: string;
  riskTier: "critical" | "high" | "medium" | "low";
  specificRisks: string[];
  sanctionsExposure: boolean;
  environmentalFlags: string[];
  labourFlags: string[];
  recommendation: string;
}

export interface ComplianceGap {
  regulation: string;
  gap: string;
  severity: "critical" | "high" | "medium" | "low";
  deadline: string;
}

export interface SupplyChainRiskResult {
  ok: true;
  overallRisk: "critical" | "high" | "medium" | "low";
  riskScore: number; // 0–100
  tier1Risk: SupplierRisk[];
  geographicConcentration: {
    dominantCountry: string;
    concentrationPercent: number;
    risk: "critical" | "high" | "medium" | "low";
    riskCountries: string[];
    details: string;
  };
  sanctionsExposure: {
    level: "critical" | "high" | "medium" | "low";
    sanctionedJurisdictions: string[];
    affectedSuppliers: string[];
    details: string;
  };
  environmentalCrimeRisk: {
    level: "critical" | "high" | "medium" | "low";
    conflictMinerals: boolean;
    illegalTimber: boolean;
    illegalGold: boolean;
    details: string;
  };
  labourRisk: {
    level: "critical" | "high" | "medium" | "low";
    forcedLabourRisk: boolean;
    childLabourRisk: boolean;
    forcedLabourCountries: string[];
    details: string;
  };
  corruptionRisk: {
    level: "critical" | "high" | "medium" | "low";
    highCPIJurisdictions: string[];
    cpiScores: Record<string, number>;
    details: string;
  };
  complianceGaps: ComplianceGap[];
  regulatoryObligations: Array<{
    regulation: string;
    obligation: string;
    deadline?: string;
  }>;
  redFlags: string[];
  recommendation: string;
  actionPlan: Array<{
    step: number;
    action: string;
    priority: "immediate" | "short-term" | "medium-term";
    owner: string;
    deadline: string;
  }>;
}

const FALLBACK: SupplyChainRiskResult = {
  ok: true,
  overallRisk: "high",
  riskScore: 72,
  tier1Risk: [
    {
      name: "Example Supplier Co.",
      country: "China",
      riskTier: "high",
      specificRisks: ["Xinjiang forced labour nexus", "Single-source dependency"],
      sanctionsExposure: false,
      environmentalFlags: [],
      labourFlags: ["Forced labour risk — UFLPA jurisdiction"],
      recommendation: "Document UFLPA rebuttable presumption evidence package for CBP. Obtain supply chain transparency report.",
    },
    {
      name: "Africa Minerals Ltd",
      country: "DRC",
      riskTier: "critical",
      specificRisks: ["Conflict minerals (Dodd-Frank §1502)", "Gold smuggling routes"],
      sanctionsExposure: true,
      environmentalFlags: ["Illegal artisanal mining", "Deforestation"],
      labourFlags: ["Child labour documented in region"],
      recommendation: "Commission OECD DDG / RMAP audit immediately. Suspend shipments until conflict minerals certification obtained.",
    },
  ],
  geographicConcentration: {
    dominantCountry: "China",
    concentrationPercent: 65,
    risk: "high",
    riskCountries: ["China", "DRC", "Myanmar"],
    details: "65% of tier-1 supply sourced from a single jurisdiction. US-China trade tensions and UFLPA compliance create material disruption risk.",
  },
  sanctionsExposure: {
    level: "high",
    sanctionedJurisdictions: ["DRC (partial)", "Myanmar"],
    affectedSuppliers: ["Africa Minerals Ltd"],
    details: "One tier-1 supplier operates in a jurisdiction with active OFAC SDN designations. Enhanced due diligence required.",
  },
  environmentalCrimeRisk: {
    level: "critical",
    conflictMinerals: true,
    illegalTimber: false,
    illegalGold: true,
    details: "DRC-sourced minerals carry documented conflict mineral risk under Dodd-Frank §1502. No chain-of-custody certification on file.",
  },
  labourRisk: {
    level: "high",
    forcedLabourRisk: true,
    childLabourRisk: true,
    forcedLabourCountries: ["China (Xinjiang)", "DRC"],
    details: "Xinjiang-nexus supplier triggers UFLPA rebuttable presumption. DRC supplier operates in region with documented child labour (ILO Convention 182).",
  },
  corruptionRisk: {
    level: "high",
    highCPIJurisdictions: ["DRC (CPI 20)", "Myanmar (CPI 23)"],
    cpiScores: { DRC: 20, Myanmar: 23 },
    details: "Two source jurisdictions rank in the bottom quartile of Transparency International CPI 2024.",
  },
  complianceGaps: [
    {
      regulation: "US Uyghur Forced Labor Prevention Act (UFLPA)",
      gap: "No due diligence documentation for Xinjiang-nexus supplier. Rebuttable presumption of forced labour applies.",
      severity: "critical",
      deadline: "Immediate",
    },
    {
      regulation: "Dodd-Frank §1502 (Conflict Minerals)",
      gap: "No RCOI or independent audit for DRC-sourced tantalum. SEC Form SD filing may be required.",
      severity: "critical",
      deadline: "Next SEC filing cycle",
    },
    {
      regulation: "EU Corporate Sustainability Due Diligence Directive (CSDDD)",
      gap: "No human rights or environmental due diligence policy in place covering tier-1 suppliers.",
      severity: "high",
      deadline: "2026-07-26",
    },
  ],
  regulatoryObligations: [
    {
      regulation: "US UFLPA",
      obligation: "Maintain clear and convincing evidence that goods were not produced with forced labour. File rebuttable presumption documentation with CBP.",
      deadline: "Ongoing — per shipment",
    },
    {
      regulation: "Dodd-Frank §1502",
      obligation: "Conduct Reasonable Country of Origin Inquiry (RCOI) annually. File SEC Form SD if conflict minerals are necessary to functionality.",
      deadline: "Annual",
    },
    {
      regulation: "EU CSDDD",
      obligation: "Implement human rights and environmental due diligence across value chain. Report annually from 2027 (phased by company size).",
      deadline: "2027-01-01 (phased)",
    },
  ],
  redFlags: [
    "CRITICAL: DRC-sourced minerals without chain-of-custody certification (Dodd-Frank §1502)",
    "CRITICAL: Xinjiang-nexus supplier triggers UFLPA rebuttable presumption — CBP may detain shipments",
    "HIGH: Single-country dependency (65%) creates regulatory and operational concentration risk",
    "HIGH: No supplier audit programme documented",
    "MEDIUM: No UK Modern Slavery Act s.54 transparency statement on file",
  ],
  recommendation: "Immediate remediation required for DRC and Xinjiang-nexus supply chains. Commission independent supply chain audit, obtain RMAP/iTSCi certification for minerals, and diversify sourcing to reduce geographic concentration.",
  actionPlan: [
    {
      step: 1,
      action: "Commission independent conflict minerals RCOI and audit for DRC supplier (Dodd-Frank §1502 compliance). Suspend new orders pending audit.",
      priority: "immediate",
      owner: "Head of Procurement",
      deadline: "Within 10 business days",
    },
    {
      step: 2,
      action: "Document UFLPA rebuttable presumption evidence package for CBP submission. Engage trade compliance counsel.",
      priority: "immediate",
      owner: "Trade Compliance Team",
      deadline: "Within 5 business days",
    },
    {
      step: 3,
      action: "Engage RMAP or iTSCi certification programme for tantalum, tin, tungsten and gold sourcing from DRC.",
      priority: "immediate",
      owner: "Compliance Officer",
      deadline: "Within 30 days",
    },
    {
      step: 4,
      action: "Develop supplier diversification plan to reduce single-country dependency below 40%.",
      priority: "short-term",
      owner: "Chief Procurement Officer",
      deadline: "Within 90 days",
    },
    {
      step: 5,
      action: "Implement human rights and environmental due diligence policy aligned to EU CSDDD requirements including grievance mechanism.",
      priority: "medium-term",
      owner: "Legal & Compliance",
      deadline: "Within 6 months",
    },
  ],
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    company?: string;
    sector?: string;
    tier1Suppliers?: string[];
    keySourceCountries?: string[];
    commodities?: string[];
    certifications?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "supply-chain/risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 22_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: `You are a leading supply chain risk and ESG due diligence expert specialising in EU CSDDD, US Uyghur Forced Labor Prevention Act (UFLPA), Dodd-Frank Section 1502, OECD Due Diligence Guidance for Responsible Minerals, FATF typologies, and international sanctions frameworks (OFAC, EU, UK, UN). Assess the supply chain provided and return a comprehensive risk analysis covering all dimensions.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "overallRisk": "critical"|"high"|"medium"|"low",
  "riskScore": number (0-100, higher = riskier),
  "tier1Risk": [{"name":"string","country":"string","riskTier":"critical"|"high"|"medium"|"low","specificRisks":["string"],"sanctionsExposure":boolean,"environmentalFlags":["string"],"labourFlags":["string"],"recommendation":"string"}],
  "geographicConcentration": {"dominantCountry":"string","concentrationPercent":number,"risk":"critical"|"high"|"medium"|"low","riskCountries":["string"],"details":"string"},
  "sanctionsExposure": {"level":"critical"|"high"|"medium"|"low","sanctionedJurisdictions":["string"],"affectedSuppliers":["string"],"details":"string"},
  "environmentalCrimeRisk": {"level":"critical"|"high"|"medium"|"low","conflictMinerals":boolean,"illegalTimber":boolean,"illegalGold":boolean,"details":"string"},
  "labourRisk": {"level":"critical"|"high"|"medium"|"low","forcedLabourRisk":boolean,"childLabourRisk":boolean,"forcedLabourCountries":["string"],"details":"string"},
  "corruptionRisk": {"level":"critical"|"high"|"medium"|"low","highCPIJurisdictions":["string"],"cpiScores":{},"details":"string"},
  "complianceGaps": [{"regulation":"string","gap":"string","severity":"critical"|"high"|"medium"|"low","deadline":"string"}],
  "regulatoryObligations": [{"regulation":"string","obligation":"string","deadline":"string"}],
  "redFlags": ["string"],
  "recommendation": "string",
  "actionPlan": [{"step":number,"action":"string","priority":"immediate"|"short-term"|"medium-term","owner":"string","deadline":"string"}]
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Company: ${sanitizeField(body.company ?? "Unknown", 200)}
Sector: ${sanitizeField(body.sector ?? "Unknown", 200)}
Tier-1 Suppliers: ${JSON.stringify(body.tier1Suppliers ?? [])}
Key Source Countries: ${JSON.stringify(body.keySourceCountries ?? [])}
Commodities: ${JSON.stringify(body.commodities ?? [])}
Certifications held: ${JSON.stringify(body.certifications ?? [])}

Perform a comprehensive supply chain risk assessment covering: geographic concentration risk (single country dependency), sanctions exposure across supply chain, environmental crime risk (conflict minerals, illegal timber/gold), labour exploitation risk (forced labour, child labour), corruption risk in source jurisdictions, and regulatory compliance gaps (EU CSDDD, US Uyghur Forced Labor Prevention Act, Dodd-Frank 1502). Assess each tier-1 supplier individually and provide a complete action plan.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SupplyChainRiskResult;
    if (!Array.isArray(result.tier1Risk)) result.tier1Risk = [];
    else for (const s of result.tier1Risk) { if (!Array.isArray(s.specificRisks)) s.specificRisks = []; if (!Array.isArray(s.environmentalFlags)) s.environmentalFlags = []; if (!Array.isArray(s.labourFlags)) s.labourFlags = []; }
    if (!Array.isArray(result.complianceGaps)) result.complianceGaps = [];
    if (!Array.isArray(result.regulatoryObligations)) result.regulatoryObligations = [];
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.actionPlan)) result.actionPlan = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "supply-chain/risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
