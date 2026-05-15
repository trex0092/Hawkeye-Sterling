export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export type EsgRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";
export type MlRiskLevel = "low" | "medium" | "high";

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
  redFlags: string[];
  recommendation: string;
  summary: string;
}

const FALLBACK: EsgRiskResult = {
  ok: true,
  overallEsgScore: 42,
  esgRating: "BB",
  dimensions: {
    environmental: {
      score: 38,
      risks: [
        "Operations in high water-stress regions without mitigation plan",
        "Suppliers located in jurisdictions with weak environmental enforcement",
        "Carbon footprint disclosure incomplete — Scope 3 emissions unreported",
      ],
      opportunities: [
        "Transition to renewable energy sourcing in manufacturing facilities",
        "TCFD-aligned climate risk disclosure would improve investor confidence",
      ],
    },
    social: {
      score: 45,
      risks: [
        "Supplier countries include jurisdictions with elevated forced labour risk (ITUC index)",
        "No third-party audit of tier-2 and tier-3 supply chain labour practices",
        "Gender pay gap reporting absent",
      ],
      opportunities: [
        "Implement supplier code of conduct with audit rights",
        "Join UN Global Compact to signal commitment to labour standards",
      ],
    },
    governance: {
      score: 44,
      risks: [
        "Board independence below recommended threshold (30%)",
        "No whistleblower protection policy published",
        "Related-party transactions not fully disclosed in annual report",
      ],
      opportunities: [
        "Appoint independent non-executive directors to strengthen oversight",
        "Publish anti-bribery and corruption policy aligned to ISO 37001",
      ],
    },
  },
  mlRiskOverlay: {
    environmentalCrimeLinkage:
      "Operations in extractive-adjacent sectors with weak environmental controls increase exposure to proceeds of environmental crime, which are increasingly treated as predicate offences under FATF Recommendation 3.",
    laborExploitationRisk:
      "Unaudited supply chains in high-risk labour jurisdictions create indirect exposure to trafficking-in-persons proceeds, a designated predicate money laundering offence under UAE FDL 10/2025.",
    corruptionRisk:
      "Governance gaps — including incomplete related-party disclosure and absence of a published anti-corruption policy — elevate the risk that facilitated corruption payments could constitute ML predicate offences.",
    overallMlRisk: "medium",
  },
  regulatoryExposure: [
    {
      regulation: "UAE FDL 10/2025 Art. 24 — Supply Chain Transparency",
      jurisdiction: "UAE",
      compliance: "Partial — tier-1 supplier data available; tiers 2-3 undisclosed",
    },
    {
      regulation: "EU Corporate Sustainability Due Diligence Directive (CSDDD)",
      jurisdiction: "EU",
      compliance: "Gap — no human-rights due diligence process documented",
    },
    {
      regulation: "UK Modern Slavery Act 2015",
      jurisdiction: "UK",
      compliance: "Partial — annual statement published but lacks specific supply chain risk assessment",
    },
    {
      regulation: "OECD MNE Guidelines — Environment Chapter",
      jurisdiction: "International",
      compliance: "Non-compliant — Scope 3 emissions not reported",
    },
  ],
  redFlags: [
    "Tier-2/3 supply chain not independently audited — forced labour risk unquantified",
    "Related-party transactions inadequately disclosed — governance opacity",
    "Environmental enforcement gap in two supplier jurisdictions",
    "No anti-corruption management system (ISO 37001 or equivalent)",
  ],
  recommendation:
    "Conduct a full supply chain ESG audit covering tiers 1-3 within 90 days. Publish an anti-corruption policy, strengthen board independence, and commission a TCFD-aligned climate risk assessment. These actions would likely improve the ESG rating to A or better.",
  summary:
    "The entity presents a BB ESG profile driven by governance transparency gaps and an unaudited supply chain with elevated labour and environmental risk exposure. The ML risk overlay indicates medium risk — supply chain opacity and governance weaknesses are the primary ML-adjacent concerns.",
};

export async function POST(req: Request) {
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
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
        { regulation: "UAE FDL 10/2025 Art.4 (EWRA)", jurisdiction: "UAE", compliance: "Required" },
        ...(sectorRisky ? [{ regulation: "OECD Due Diligence Guidance for Responsible Business Conduct", jurisdiction: "OECD", compliance: "Recommended" }] : []),
      ],
      redFlags: [
        ...(sectorRisky ? ["High-risk sector — verify supply-chain due diligence."] : []),
        ...(jurRisky ? ["High-risk jurisdiction — verify FATF posture and corruption controls."] : []),
      ],
      recommendation: ml === "high" ? "Apply EDD; require senior-management approval and ongoing monitoring." : ml === "medium" ? "Apply enhanced CDD; review annually." : "Standard CDD acceptable.",
      summary: `Baseline ESG assessment for ${body.entity ?? "the entity"}: rating ${rating}, ML overlay ${ml.toUpperCase()}. Set ANTHROPIC_API_KEY for AI-graded analysis.`,
    };
  };
  if (!apiKey) {
    return NextResponse.json({ ...buildTemplate(), degraded: true, degradedReason: "ANTHROPIC_API_KEY not configured — deterministic ESG baseline used." });
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3500,
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
Supplier Countries: ${sanitizeField((body.supplierCountries ?? []).join(", ") || "Not specified", 500)}
Employee Count: ${body.employeeCount ?? "Not specified"}
Publicly Listed: ${body.publiclyListed ?? false ? "Yes" : "No"}

Generate a comprehensive ESG risk assessment with ML risk overlay for this entity. Be specific to the sector and jurisdictions involved. Identify applicable regulatory frameworks.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EsgRiskResult;
    return NextResponse.json(result);
  } catch (err) {
    console.warn("[esg-risk] LLM failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ...buildTemplate(),
      degraded: true,
      degradedReason: `ESG AI call failed: ${err instanceof Error ? err.message : String(err)}.`,
    });
  }
}
