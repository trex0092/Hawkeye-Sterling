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

const SYSTEM_PROMPT = `You are a specialist AML analyst for environmental crime. Produce a comprehensive, actionable environmental crime risk assessment. Return ONLY valid JSON with this exact structure (no markdown fences):
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
