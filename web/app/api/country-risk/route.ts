export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Netlify Pro plan permits up to 60s per sync function. Country risk needs
// the room — Sonnet 4.6 with 3000 tokens routinely takes 30–45s.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface CountryRiskDimensions {
  amlRisk: number;
  baselScore: number;
  cpiScore: number;
  politicalRisk: number;
  sanctionsRisk: number;
  tfRisk: number;
}

export interface SanctionsProfile {
  ofac: boolean;
  eu: boolean;
  un: boolean;
  uk: boolean;
  details: string[];
}

export interface RegulatoryObligation {
  obligation: string;
  regulation: string;
}

export interface CountryRiskResult {
  ok: true;
  country: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  riskScore: number;
  dimensions: CountryRiskDimensions;
  fatfStatus: "member" | "grey_list" | "black_list" | "non_member";
  sanctionsProfile: SanctionsProfile;
  keyRisks: string[];
  recentDevelopments: string[];
  regulatoryObligations: RegulatoryObligation[];
  recommendation: "standard_dd" | "enhanced_dd" | "senior_approval" | "prohibited";
  summary: string;
}

const FALLBACK: CountryRiskResult = {
  ok: true,
  country: "United Arab Emirates",
  overallRisk: "medium",
  riskScore: 42,
  dimensions: {
    amlRisk: 38,
    baselScore: 44,
    cpiScore: 35,
    politicalRisk: 25,
    sanctionsRisk: 10,
    tfRisk: 40,
  },
  fatfStatus: "member",
  sanctionsProfile: {
    ofac: false,
    eu: false,
    un: false,
    uk: false,
    details: [],
  },
  keyRisks: [
    "FATF grey-list exit monitoring — UAE removed from grey list in Feb 2024 but remains under enhanced scrutiny",
    "High volume of cash-intensive gold and real estate transactions creating ML/TF exposure",
    "Free zone proliferation increases corporate opacity and beneficial ownership complexity",
    "Proximity to high-risk jurisdictions (Iran, Afghanistan) creates correspondent banking risk",
  ],
  recentDevelopments: [
    "Feb 2024: UAE removed from FATF grey list following significant AML/CFT reforms",
    "2025: FDL 10/2025 enacted — updated AML/CFT framework for DNFBPs and FIs",
    "Ongoing: CBUAE strengthening supervisory capacity and onsite inspection frequency",
    "Q1 2025: UAE-FATF bilateral engagement on continued technical assistance",
  ],
  regulatoryObligations: [
    {
      obligation: "Enhanced Due Diligence required for all customers",
      regulation: "UAE FDL 10/2025 Art.14 — EDD for high-risk jurisdictions",
    },
    {
      obligation: "Senior management sign-off on new business relationships",
      regulation: "CBUAE AML Standards §6.4 — governance accountability",
    },
    {
      obligation: "Quarterly monitoring and periodic CDD refresh",
      regulation: "CBUAE AML Standards §5.2 — ongoing monitoring",
    },
  ],
  recommendation: "enhanced_dd",
  summary:
    "The UAE presents a medium risk profile following its removal from the FATF grey list in February 2024. Significant regulatory reforms under FDL 10/2025 have strengthened the AML/CFT framework. However, structural vulnerabilities persist including gold/real estate sector exposure, free zone opacity, and regional proximity risks. Enhanced Due Diligence with senior oversight is recommended for UAE-based counterparties.",
};

export async function POST(req: Request) {
  let body: { country?: string; analysisDepth?: "quick" | "full" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const country = (body.country ?? "").trim();
  if (!country) {
    return NextResponse.json({ ok: false, error: "country is required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Country risk unavailable — ANTHROPIC_API_KEY not configured on server." },
      { status: 503 },
    );
  }

  const depth = body.analysisDepth ?? "quick";
  const detailInstruction =
    depth === "full"
      ? "Provide analysis with context for each dimension, regulatory obligations, and 3-5 recent developments."
      : "Provide a concise but complete analysis covering all required fields.";

  // Netlify edge gateway has a 26s inactivity timeout. Keep both modes well
  // under that ceiling: Haiku at ≤1800 tokens reliably responds in 8-15s.
  const sdkTimeoutMs = 22_000;

  try {
    const client = getAnthropicClient(apiKey, sdkTimeoutMs);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: depth === "full" ? 1800 : 1200,
      system: [
        {
          type: "text",
          text: `You are a Country Risk Intelligence expert specialising in AML/CFT, sanctions, and financial crime compliance. Your knowledge covers:

- Basel AML Index (annual country risk scoring 0-10, converted to 0-100 for output)
- Transparency International Corruption Perceptions Index (CPI, 0-100 where 100 = very clean)
- FATF grey list (Jurisdictions Under Increased Monitoring) and black list (High-Risk Jurisdictions Subject to a Call for Action)
- OFAC country-level sanctions and Specially Designated Nationals lists
- EU high-risk third countries (4AMLD/6AMLD lists)
- UN Security Council sanctions regimes
- UK OFSI sanctions designations
- Political stability and governance indicators (World Bank, Freedom House, EIU)
- ML/TF risk indicators including cash economy size, narcotics trafficking, terrorist financing typologies
- Regulatory obligations triggered by country risk under FATF Recommendations R.10, R.12, R.13, R.19

For riskScore: 0-100 where 0=no risk, 100=maximum risk.
For dimensions (all 0-100, higher = more risk):
- amlRisk: overall AML risk based on Basel AML Index and typology analysis
- baselScore: Basel AML Index score converted to 0-100 (Basel publishes 0-10, multiply by 10)
- cpiScore: Inverted CPI (100 - TI CPI score) so higher = more corrupt = more risk
- politicalRisk: political instability, conflict, governance deficit (0-100)
- sanctionsRisk: degree of sanctions exposure (0=no sanctions, 100=comprehensive sanctions)
- tfRisk: terrorist financing risk including proximity to conflict zones, extremist financing typologies

fatfStatus options: "member" (FATF member in good standing), "grey_list" (increased monitoring), "black_list" (call for action — Iran, North Korea, Myanmar), "non_member" (not a FATF member but assessed)

recommendation logic:
- standard_dd: riskScore < 35 and no sanctions and FATF member
- enhanced_dd: riskScore 35-65 or grey_list
- senior_approval: riskScore 66-85 or significant sanctions
- prohibited: riskScore > 85 or black_list or comprehensive OFAC/UN sanctions

${detailInstruction}

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "country": "string (full official name)",
  "overallRisk": "low"|"medium"|"high"|"critical",
  "riskScore": number,
  "dimensions": {
    "amlRisk": number,
    "baselScore": number,
    "cpiScore": number,
    "politicalRisk": number,
    "sanctionsRisk": number,
    "tfRisk": number
  },
  "fatfStatus": "member"|"grey_list"|"black_list"|"non_member",
  "sanctionsProfile": {
    "ofac": boolean,
    "eu": boolean,
    "un": boolean,
    "uk": boolean,
    "details": ["string"]
  },
  "keyRisks": ["string"],
  "recentDevelopments": ["string"],
  "regulatoryObligations": [{"obligation": "string", "regulation": "string"}],
  "recommendation": "standard_dd"|"enhanced_dd"|"senior_approval"|"prohibited",
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse country risk for: ${country}

Analysis depth: ${depth}

Provide a complete country risk intelligence assessment covering AML/CFT risk, FATF status, sanctions exposure (OFAC, EU, UN, UK), political stability, TF risk, and all regulatory obligations that would apply to a UAE-based DNFBP (gold trader/refinery) engaging with counterparties in or from this country.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    // Defensive JSON extraction — strip code-fences and find the first
    // top-level {...} object. Claude occasionally wraps JSON in prose
    // even when instructed not to; pulling the JSON out beats failing.
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
    let result: CountryRiskResult;
    try {
      result = JSON.parse(jsonStr) as CountryRiskResult;
    } catch (parseErr) {
      console.warn("[country-risk] JSON parse failed:", parseErr instanceof Error ? parseErr.message : parseErr, "raw:", cleaned.slice(0, 200));
      return NextResponse.json(
        {
          ok: false,
          error: `Country-risk analysis returned invalid JSON for ${country}. Retry, or escalate if persistent.`,
          detail: parseErr instanceof Error ? parseErr.message : String(parseErr),
        },
        { status: 502 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[country-risk] LLM call failed:", detail);
    // Honest 503 with surfaced detail so the operator sees the real
    // cause (timeout / rate-limit / auth) rather than a generic message.
    return NextResponse.json(
      {
        ok: false,
        error: `Real-time analysis temporarily unavailable for ${country}. ${detail.includes("timeout") ? "(timeout — try again with shorter depth)" : detail.includes("rate") ? "(rate limit — wait 60s)" : "Please retry in a moment."}`,
        detail,
      },
      { status: 503 },
    );
  }
}
