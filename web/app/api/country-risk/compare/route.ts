export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Side-by-side comparison emits up to 5 country profiles in one call; needs
// the full 60s budget to fit Sonnet 4.6 + 6000 tokens.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import type { CountryRiskResult } from "../route";

export interface CountryCompareResult {
  ok: true;
  countries: CountryRiskResult[];
  comparedAt: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { countries?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const countries = (body.countries ?? []).slice(0, 5).map((c) => c.trim()).filter(Boolean);
  if (countries.length < 2) {
    return NextResponse.json(
      { ok: false, error: "At least 2 countries required for comparison" },
      { status: 400 },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    // Return deterministic fallback for up to 5 countries
    const fallbacks = countries.map((c) => buildFallback(c));
    return NextResponse.json({ ok: true, countries: fallbacks, comparedAt: new Date().toISOString() }, { headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 22_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      // 4500 tokens covers up to 5 country profiles concisely; 6000 routinely
      // pushed Sonnet past the 55s budget.
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: `You are a Country Risk Intelligence expert specialising in AML/CFT, sanctions, and financial crime compliance. Your knowledge covers the Basel AML Index, TI CPI, FATF grey/black lists, OFAC/EU/UN/UK sanctions, political stability indicators, and ML/TF risk typologies.

For riskScore: 0-100 where 0=no risk, 100=maximum risk.
For dimensions (all 0-100, higher = more risk):
- amlRisk: overall AML risk
- baselScore: Basel AML Index × 10
- cpiScore: 100 - TI CPI (higher = more corrupt = more risk)
- politicalRisk: political instability and governance deficit
- sanctionsRisk: degree of sanctions exposure
- tfRisk: terrorist financing risk

fatfStatus: "member" | "grey_list" | "black_list" | "non_member"
recommendation: "standard_dd" | "enhanced_dd" | "senior_approval" | "prohibited"

Return ONLY valid JSON array — an array of country risk objects, one per requested country, with no markdown fences:
[
  {
    "ok": true,
    "country": "string",
    "overallRisk": "low"|"medium"|"high"|"critical",
    "riskScore": number,
    "dimensions": {"amlRisk": number, "baselScore": number, "cpiScore": number, "politicalRisk": number, "sanctionsRisk": number, "tfRisk": number},
    "fatfStatus": "member"|"grey_list"|"black_list"|"non_member",
    "sanctionsProfile": {"ofac": boolean, "eu": boolean, "un": boolean, "uk": boolean, "details": ["string"]},
    "keyRisks": ["string"],
    "recentDevelopments": ["string"],
    "regulatoryObligations": [{"obligation": "string", "regulation": "string"}],
    "recommendation": "standard_dd"|"enhanced_dd"|"senior_approval"|"prohibited",
    "summary": "string"
  }
]`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Provide side-by-side country risk assessments for the following countries. Return a JSON array with one object per country in the same order as requested:

Countries: ${countries.join(", ")}

For each country provide complete risk scoring, FATF status, sanctions profile (OFAC, EU, UN, UK), key risks, recent developments, regulatory obligations applicable to a UAE-based DNFBP, and recommendation. Keep summaries concise (2-3 sentences each) to fit the comparison format.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "[]";
    const results = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as CountryRiskResult[];
    // Normalize arrays in each country result — LLM may return null instead of [].
    for (const r of Array.isArray(results) ? results : []) {
      if (!Array.isArray(r.keyRisks)) r.keyRisks = [];
      if (!Array.isArray(r.recentDevelopments)) r.recentDevelopments = [];
      if (!Array.isArray(r.regulatoryObligations)) r.regulatoryObligations = [];
    }
    return NextResponse.json({
      ok: true,
      countries: results,
      comparedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: `Real-time comparison temporarily unavailable for: ${countries.join(", ")}. Please retry in a moment.`,
      },
      { status: 503 },
    );
  }
}

function buildFallback(country: string): CountryRiskResult {
  return {
    ok: true,
    country,
    overallRisk: "medium",
    riskScore: 50,
    dimensions: {
      amlRisk: 50,
      baselScore: 50,
      cpiScore: 50,
      politicalRisk: 50,
      sanctionsRisk: 20,
      tfRisk: 45,
    },
    fatfStatus: "non_member",
    sanctionsProfile: { ofac: false, eu: false, un: false, uk: false, details: [] },
    keyRisks: ["Risk data unavailable — API key not configured"],
    recentDevelopments: ["No live data available"],
    regulatoryObligations: [
      { obligation: "Enhanced Due Diligence", regulation: "FATF Recommendation 19" },
    ],
    recommendation: "enhanced_dd",
    summary: `Fallback data for ${country}. Configure ANTHROPIC_API_KEY for live AI-powered analysis.`,
  };
}
