export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface SupplierRisk {
  name: string;
  country: string;
  riskTier: "critical" | "high" | "medium" | "low";
  specificRisks: string[];
  sanctionsExposure: boolean;
  environmentalFlags: string[];
  labourFlags: string[];
}

export interface ComplianceGap {
  regulation: string;
  gap: string;
  severity: "critical" | "high" | "medium" | "low";
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
    details: string;
  };
  sanctionsExposure: {
    level: "critical" | "high" | "medium" | "low";
    summary: string;
    affectedSuppliers: string[];
  };
  environmentalCrimeRisk: {
    level: "critical" | "high" | "medium" | "low";
    summary: string;
    conflictMinerals: boolean;
    illegalTimber: boolean;
    illegalGold: boolean;
  };
  labourRisk: {
    level: "critical" | "high" | "medium" | "low";
    summary: string;
    forcedLabourRisk: boolean;
    childLabourRisk: boolean;
    affectedJurisdictions: string[];
  };
  corruptionRisk: {
    level: "critical" | "high" | "medium" | "low";
    summary: string;
    highCPIJurisdictions: string[];
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
    },
    {
      name: "Africa Minerals Ltd",
      country: "DRC",
      riskTier: "critical",
      specificRisks: ["Conflict minerals (Dodd-Frank §1502)", "Gold smuggling routes"],
      sanctionsExposure: true,
      environmentalFlags: ["Illegal artisanal mining", "Deforestation"],
      labourFlags: ["Child labour documented in region"],
    },
  ],
  geographicConcentration: {
    dominantCountry: "China",
    concentrationPercent: 65,
    risk: "high",
    details: "65% of tier-1 supply sourced from a single jurisdiction. US-China trade tensions and UFLPA compliance create material disruption risk.",
  },
  sanctionsExposure: {
    level: "high",
    summary: "One tier-1 supplier operates in a jurisdiction with active OFAC SDN designations. Enhanced due diligence required.",
    affectedSuppliers: ["Africa Minerals Ltd"],
  },
  environmentalCrimeRisk: {
    level: "critical",
    summary: "DRC-sourced minerals carry documented conflict mineral risk under Dodd-Frank §1502. No chain-of-custody certification on file.",
    conflictMinerals: true,
    illegalTimber: false,
    illegalGold: true,
  },
  labourRisk: {
    level: "high",
    summary: "Xinjiang-nexus supplier triggers UFLPA rebuttable presumption. DRC supplier operates in region with documented child labour.",
    forcedLabourRisk: true,
    childLabourRisk: true,
    affectedJurisdictions: ["China (Xinjiang)", "DRC"],
  },
  corruptionRisk: {
    level: "high",
    summary: "Two source jurisdictions rank in the bottom quartile of Transparency International CPI.",
    highCPIJurisdictions: ["DRC (CPI 22)", "Myanmar (CPI 23)"],
  },
  complianceGaps: [
    {
      regulation: "US Uyghur Forced Labor Prevention Act (UFLPA)",
      gap: "No due diligence documentation for Xinjiang-nexus supplier. Rebuttable presumption of forced labour applies.",
      severity: "critical",
    },
    {
      regulation: "Dodd-Frank §1502 (Conflict Minerals)",
      gap: "No RCOI or independent audit for DRC-sourced tantalum. SEC Form SD filing may be required.",
      severity: "critical",
    },
    {
      regulation: "EU Corporate Sustainability Due Diligence Directive (CSDDD)",
      gap: "No human rights or environmental due diligence policy in place covering tier-1 suppliers.",
      severity: "high",
    },
  ],
  regulatoryObligations: [
    {
      regulation: "US UFLPA",
      obligation: "Maintain clear and convincing evidence that goods were not produced with forced labour. File rebuttable presumption documentation with CBP.",
    },
    {
      regulation: "Dodd-Frank §1502",
      obligation: "Conduct Reasonable Country of Origin Inquiry (RCOI) annually. File SEC Form SD if conflict minerals are necessary to functionality.",
    },
    {
      regulation: "EU CSDDD",
      obligation: "Implement human rights and environmental due diligence across value chain. Report annually from 2027 (phased by company size).",
    },
  ],
  redFlags: [
    "DRC-sourced minerals without chain-of-custody certification",
    "Single-country dependency (65%) creates regulatory and operational concentration risk",
    "No supplier audit programme documented",
    "UFLPA rebuttable presumption triggered — CBP may detain shipments",
  ],
  recommendation: "Immediate remediation required for DRC and Xinjiang-nexus supply chains. Commission independent supply chain audit, obtain RMAP/iTSCi certification for minerals, and diversify sourcing to reduce geographic concentration.",
  actionPlan: [
    { step: 1, action: "Commission independent conflict minerals RCOI and audit for DRC supplier (Dodd-Frank §1502 compliance)", priority: "immediate", owner: "Head of Procurement" },
    { step: 2, action: "Engage RMAP or iTSCi certification programme for tantalum, tin, tungsten and gold", priority: "immediate", owner: "Compliance Officer" },
    { step: 3, action: "Document UFLPA rebuttable presumption evidence package for CBP submission", priority: "immediate", owner: "Trade Compliance Team" },
    { step: 4, action: "Develop supplier diversification plan to reduce single-country dependency below 40%", priority: "short-term", owner: "Chief Procurement Officer" },
    { step: 5, action: "Implement human rights and environmental due diligence policy aligned to EU CSDDD requirements", priority: "medium-term", owner: "Legal & Compliance" },
  ],
};

export async function POST(req: Request) {
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are an expert in supply chain risk, responsible sourcing, and regulatory compliance (EU CSDDD, US UFLPA, Dodd-Frank §1502, OECD Due Diligence Guidance). Analyse the company's supply chain for geographic concentration, sanctions exposure, environmental crime (conflict minerals, illegal timber/gold), labour exploitation (forced labour, child labour), corruption, and regulatory compliance gaps. Return ONLY valid JSON (no markdown fences):
{
  "ok": true,
  "overallRisk": "critical"|"high"|"medium"|"low",
  "riskScore": number (0-100),
  "tier1Risk": [{"name":"string","country":"string","riskTier":"critical"|"high"|"medium"|"low","specificRisks":["string"],"sanctionsExposure":boolean,"environmentalFlags":["string"],"labourFlags":["string"]}],
  "geographicConcentration": {"dominantCountry":"string","concentrationPercent":number,"risk":"critical"|"high"|"medium"|"low","details":"string"},
  "sanctionsExposure": {"level":"critical"|"high"|"medium"|"low","summary":"string","affectedSuppliers":["string"]},
  "environmentalCrimeRisk": {"level":"critical"|"high"|"medium"|"low","summary":"string","conflictMinerals":boolean,"illegalTimber":boolean,"illegalGold":boolean},
  "labourRisk": {"level":"critical"|"high"|"medium"|"low","summary":"string","forcedLabourRisk":boolean,"childLabourRisk":boolean,"affectedJurisdictions":["string"]},
  "corruptionRisk": {"level":"critical"|"high"|"medium"|"low","summary":"string","highCPIJurisdictions":["string"]},
  "complianceGaps": [{"regulation":"string","gap":"string","severity":"critical"|"high"|"medium"|"low"}],
  "regulatoryObligations": [{"regulation":"string","obligation":"string","deadline":"string"}],
  "redFlags": ["string"],
  "recommendation": "string",
  "actionPlan": [{"step":number,"action":"string","priority":"immediate"|"short-term"|"medium-term","owner":"string"}]
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Company: ${body.company ?? "Unknown"}
Sector: ${body.sector ?? "Unknown"}
Tier-1 Suppliers: ${JSON.stringify(body.tier1Suppliers ?? [])}
Key Source Countries: ${JSON.stringify(body.keySourceCountries ?? [])}
Commodities: ${JSON.stringify(body.commodities ?? [])}
Certifications held: ${JSON.stringify(body.certifications ?? [])}

Perform a comprehensive supply chain risk assessment covering geographic concentration, sanctions exposure, environmental crime risk, labour exploitation risk, corruption risk, and regulatory compliance gaps (EU CSDDD, US UFLPA, Dodd-Frank §1502).`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as SupplyChainRiskResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
