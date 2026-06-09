export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export type EsgRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";
export type MlRiskLevel = "low" | "medium" | "high";

export interface FatfTypology {
  typology: string;
  fatfRef: string;
  recommendation: string;
}

export interface SdgViolation {
  sdgNumber: number;
  sdgName: string;
  concern: string;
}

export interface SupplyChainRisk {
  country: string;
  riskLevel: "low" | "medium" | "high";
  concern: string;
}

export interface SectorBenchmark {
  sectorAvgScore: number;
  entityVsAvg: "above" | "at" | "below";
  percentile: number;
}

export interface EsgDimension {
  score: number; // 0-100
  risks: string[];
  opportunities: string[];
}

export interface MlRiskOverlay {
  environmentalCrimeLinkage: string;
  laborExploitationRisk: string;
  corruptionRisk: string;
  overallMlRisk: MlRiskLevel;
}

export interface RegulatoryExposure {
  regulation: string;
  jurisdiction: string;
  compliance: string;
}

export interface EsgRiskResult {
  ok: true;
  overallEsgScore: number; // 0-100 (higher = better)
  esgRating: EsgRating;
  dimensions: {
    environmental: EsgDimension;
    social: EsgDimension;
    governance: EsgDimension;
  };
  mlRiskOverlay: MlRiskOverlay;
  regulatoryExposure: RegulatoryExposure[];
  fatfTypologies: FatfTypology[];
  sdgViolations: SdgViolation[];
  supplyChainRisks: SupplyChainRisk[];
  sectorBenchmark: SectorBenchmark;
  redFlags: string[];
  recommendation: string;
  summary: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: {
    entity?: string;
    sector?: string;
    jurisdiction?: string;
    operations?: string;
    supplierCountries?: string[];
    employeeCount?: number;
    publiclyListed?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  // Deterministic fallback — produces a defensible baseline ESG when no key.
  const buildTemplate = (): EsgRiskResult => {
    const sector = (body.sector ?? "").toLowerCase();
    const jurisdiction = (body.jurisdiction ?? "").toUpperCase();
    const HIGH_RISK_SECTORS = ["mining","extractives","oil","gas","textile","apparel","palm oil","cobalt","tobacco"];
    const HIGH_RISK_JUR = ["MM","KP","IR","SY","SD","SS","CD","CF","ER","YE","AF","SO","LY","ZW","CU"];
    const sectorRisky = HIGH_RISK_SECTORS.some((s) => sector.includes(s));
    const jurRisky = HIGH_RISK_JUR.some((j) => jurisdiction.includes(j));
    const score = sectorRisky && jurRisky ? 35 : sectorRisky || jurRisky ? 55 : 75;
    const rating: EsgRiskResult["esgRating"] = score >= 80 ? "AA" : score >= 70 ? "A" : score >= 60 ? "BBB" : score >= 50 ? "BB" : score >= 40 ? "B" : "CCC";
    const ml: "low" | "medium" | "high" = score < 50 ? "high" : score < 65 ? "medium" : "low";
    return {
      ok: true,
      overallEsgScore: score,
      esgRating: rating,
      dimensions: {
        environmental: { score, risks: sectorRisky ? ["Sector inherently high environmental impact — verify EITI / ISO 14001 / RBA compliance."] : [], opportunities: [] },
        social: { score, risks: sectorRisky || jurRisky ? ["Possible labour-rights / community-impact exposure — review SA8000, RBA, UN Guiding Principles."] : [], opportunities: [] },
        governance: { score, risks: jurRisky ? ["Jurisdictional governance concerns — verify FATF posture, Corruption Perceptions Index."] : [], opportunities: [] },
      },
      mlRiskOverlay: {
        environmentalCrimeLinkage: sectorRisky ? "Sector commonly linked to environmental-crime proceeds (illegal logging / mining / fishing) — apply FATF 2021 Environmental Crime Guidance." : "Not directly linked.",
        laborExploitationRisk: jurRisky ? "Forced-labour proceeds risk — apply UN Palermo Protocol + UFLPA reasoning." : "Standard risk profile.",
        corruptionRisk: jurRisky ? "Elevated corruption perceptions — apply enhanced PEP screening and senior-management approval." : "Standard.",
        overallMlRisk: ml,
      },
      regulatoryExposure: [
        { regulation: "FATF R.1 (risk-based approach)", jurisdiction: "Global", compliance: "Required" },
        { regulation: "UAE Federal Decree-Law No. 10 of 2025 Art.4 (EWRA)", jurisdiction: "UAE", compliance: "Required" },
        ...(sectorRisky ? [{ regulation: "OECD Due Diligence Guidance for Responsible Business Conduct", jurisdiction: "OECD", compliance: "Recommended" }] : []),
      ],
      fatfTypologies: sectorRisky ? [
        { typology: "Environmental crime proceeds", fatfRef: "FATF 2021 Environmental Crime Guidance", recommendation: "Apply enhanced due diligence for nature-based transactions." },
      ] : [],
      sdgViolations: (sectorRisky || jurRisky) ? [
        { sdgNumber: 16, sdgName: "Peace, Justice and Strong Institutions", concern: "Governance gaps linked to weak rule-of-law jurisdictions." },
      ] : [],
      supplyChainRisks: sectorRisky ? [
        { country: "Unknown", riskLevel: "medium" as const, concern: "Supply-chain due diligence not yet verified — OECD 5-step DDG applies." },
      ] : [],
      sectorBenchmark: { sectorAvgScore: 62, entityVsAvg: score >= 65 ? "above" as const : score >= 59 ? "at" as const : "below" as const, percentile: Math.min(99, Math.round((score / 100) * 100)) },
      redFlags: [
        ...(sectorRisky ? ["High-risk sector — verify supply-chain due diligence."] : []),
        ...(jurRisky ? ["High-risk jurisdiction — verify FATF posture and corruption controls."] : []),
      ],
      recommendation: ml === "high" ? "Apply EDD; require senior-management approval and ongoing monitoring." : ml === "medium" ? "Apply enhanced CDD; review annually." : "Standard CDD acceptable.",
      summary: `Baseline ESG assessment for ${body.entity ?? "the entity"}: rating ${rating}, ML overlay ${ml.toUpperCase()}. Set ANTHROPIC_API_KEY for AI-graded analysis.`,
    };
  };
  if (!apiKey) {
    return NextResponse.json({ ...buildTemplate(), degraded: true, degradedReason: "ANTHROPIC_API_KEY not configured — deterministic ESG baseline used." }, { headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1400,
      system: [
        {
          type: "text",
          text: `You are an expert ESG (Environmental, Social, Governance) risk analyst specialising in the intersection of ESG failures and money laundering (ML) / financial crime risk. You produce structured ESG risk assessments for AML compliance purposes.

Your assessment must:
1. Score each ESG dimension 0-100 (higher = better ESG performance)
2. Assign an overall ESG score and letter rating (AAA best → CCC worst)
3. Identify specific ESG risks and opportunities per dimension
4. Map ESG failures to ML risk vectors (environmental crime proceeds, forced labour proceeds, corruption-facilitated ML)
5. Identify applicable regulatory frameworks and compliance status
6. Flag red flags requiring immediate remediation
7. Provide a clear compliance recommendation

ESG ratings map: AAA=90+, AA=80-89, A=70-79, BBB=60-69, BB=50-59, B=40-49, CCC=below 40

Return ONLY valid JSON (no markdown fences):
{
  "ok": true,
  "overallEsgScore": 0..100,
  "esgRating": "AAA"|"AA"|"A"|"BBB"|"BB"|"B"|"CCC",
  "dimensions": {
    "environmental": {"score":0,"risks":[],"opportunities":[]},
    "social": {"score":0,"risks":[],"opportunities":[]},
    "governance": {"score":0,"risks":[],"opportunities":[]}
  },
  "mlRiskOverlay": {
    "environmentalCrimeLinkage": "string",
    "laborExploitationRisk": "string",
    "corruptionRisk": "string",
    "overallMlRisk": "low"|"medium"|"high"
  },
  "regulatoryExposure": [{"regulation":"string","jurisdiction":"string","compliance":"string"}],
  "fatfTypologies": [{"typology":"string","fatfRef":"string","recommendation":"string"}],
  "sdgViolations": [{"sdgNumber":1,"sdgName":"string","concern":"string"}],
  "supplyChainRisks": [{"country":"string","riskLevel":"low|medium|high","concern":"string"}],
  "sectorBenchmark": {"sectorAvgScore":60,"entityVsAvg":"above|at|below","percentile":50},
  "redFlags": ["string"],
  "recommendation": "string",
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Entity: ${sanitizeField(body.entity ?? "Unknown entity", 500)}
Sector: ${sanitizeField(body.sector ?? "Not specified", 100)}
Primary Jurisdiction: ${sanitizeField(body.jurisdiction ?? "Not specified", 100)}
Operations Description: ${sanitizeText(body.operations ?? "Not specified", 2000)}
Supplier Countries: ${sanitizeField(( Array.isArray(body.supplierCountries) ? body.supplierCountries : []).join(", ") || "Not specified", 500)}
Employee Count: ${body.employeeCount ?? "Not specified"}
Publicly Listed: ${body.publiclyListed ?? false ? "Yes" : "No"}

Generate a comprehensive ESG risk assessment with ML risk overlay for this entity. Be specific to the sector and jurisdictions involved. Identify applicable regulatory frameworks.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EsgRiskResult;
    if (result.dimensions?.environmental) {
      if (!Array.isArray(result.dimensions.environmental.risks)) result.dimensions.environmental.risks = [];
      if (!Array.isArray(result.dimensions.environmental.opportunities)) result.dimensions.environmental.opportunities = [];
    }
    if (result.dimensions?.social) {
      if (!Array.isArray(result.dimensions.social.risks)) result.dimensions.social.risks = [];
      if (!Array.isArray(result.dimensions.social.opportunities)) result.dimensions.social.opportunities = [];
    }
    if (result.dimensions?.governance) {
      if (!Array.isArray(result.dimensions.governance.risks)) result.dimensions.governance.risks = [];
      if (!Array.isArray(result.dimensions.governance.opportunities)) result.dimensions.governance.opportunities = [];
    }
    if (!Array.isArray(result.regulatoryExposure)) result.regulatoryExposure = [];
    if (!Array.isArray(result.fatfTypologies)) result.fatfTypologies = [];
    if (!Array.isArray(result.sdgViolations)) result.sdgViolations = [];
    if (!Array.isArray(result.supplyChainRisks)) result.supplyChainRisks = [];
    if (!result.sectorBenchmark) result.sectorBenchmark = { sectorAvgScore: 62, entityVsAvg: "at", percentile: 50 };
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    void writeAuditChainEntry(
      { event: "esg_risk_assessed", actor: gate.keyId, overallEsgScore: result.overallEsgScore, esgRating: result.esgRating, overallMlRisk: result.mlRiskOverlay?.overallMlRisk },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[esg-risk] LLM failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ...buildTemplate(),
      degraded: true,
      degradedReason: `ESG AI call failed: ${err instanceof Error ? err.message : String(err)}.`,
    }, { headers: gate.headers });
  }
}
