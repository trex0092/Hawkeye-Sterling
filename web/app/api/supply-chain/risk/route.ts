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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "supply-chain/risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
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
Tier-1 Suppliers: ${JSON.stringify((body.tier1Suppliers ?? []).slice(0, 50))}
Key Source Countries: ${JSON.stringify((body.keySourceCountries ?? []).slice(0, 50))}
Commodities: ${JSON.stringify((body.commodities ?? []).slice(0, 50))}
Certifications held: ${JSON.stringify((body.certifications ?? []).slice(0, 50))}

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
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "supply-chain/risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
