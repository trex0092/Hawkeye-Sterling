export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Netlify Pro plan permits up to 60s per sync function. Country risk needs
// the room — Sonnet 4.6 with 3000 tokens routinely takes 30–45s.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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

// ── Static FATF jurisdiction dataset ─────────────────────────────────────────
// Covers all FATF grey/black list jurisdictions + GCC/UAE + major global
// economies. Updated to reflect FATF February 2026 plenary outcomes.
// Served when the AI analysis is unavailable (no API key or API failure).

interface StaticCountryEntry {
  iso2: string;
  iso3: string;
  name: string;
  fatfStatus: "member" | "grey_list" | "black_list" | "non_member";
  cpiScore: number;          // Transparency International CPI 0-100 (higher = cleaner)
  sanctionsRegime: string;   // e.g. "OFAC SDN, EU, UN"
  dpmsRiskTier: "low" | "medium" | "high" | "critical";
  lastUpdated: string;
}

const STATIC_COUNTRY_DATASET: StaticCountryEntry[] = [
  // FATF Black list (High-risk jurisdictions — Call for Action) — Feb 2026
  { iso2: "IR", iso3: "IRN", name: "Iran",              fatfStatus: "black_list", cpiScore: 24, sanctionsRegime: "OFAC SDN, EU, UN, UK",     dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "KP", iso3: "PRK", name: "North Korea",       fatfStatus: "black_list", cpiScore: 11, sanctionsRegime: "OFAC SDN, EU, UN, UK",     dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "MM", iso3: "MMR", name: "Myanmar",           fatfStatus: "black_list", cpiScore: 23, sanctionsRegime: "OFAC SDN, EU, UK",         dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  // FATF Grey list (Jurisdictions under Increased Monitoring) — Feb 2026
  { iso2: "AF", iso3: "AFG", name: "Afghanistan",       fatfStatus: "grey_list", cpiScore: 20, sanctionsRegime: "OFAC SDN, EU, UN",          dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "AL", iso3: "ALB", name: "Albania",           fatfStatus: "grey_list", cpiScore: 37, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "BB", iso3: "BRB", name: "Barbados",          fatfStatus: "grey_list", cpiScore: 65, sanctionsRegime: "None",                       dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "BF", iso3: "BFA", name: "Burkina Faso",      fatfStatus: "grey_list", cpiScore: 36, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "CM", iso3: "CMR", name: "Cameroon",          fatfStatus: "grey_list", cpiScore: 27, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "CF", iso3: "CAF", name: "Central African Rep.", fatfStatus: "grey_list", cpiScore: 24, sanctionsRegime: "EU, UN",                  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "CD", iso3: "COD", name: "DR Congo",          fatfStatus: "grey_list", cpiScore: 22, sanctionsRegime: "OFAC SDN, EU, UN",          dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "GI", iso3: "GIB", name: "Gibraltar",         fatfStatus: "grey_list", cpiScore: 72, sanctionsRegime: "UK",                         dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "HT", iso3: "HTI", name: "Haiti",             fatfStatus: "grey_list", cpiScore: 17, sanctionsRegime: "OFAC SDN",                   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "JM", iso3: "JAM", name: "Jamaica",           fatfStatus: "grey_list", cpiScore: 44, sanctionsRegime: "None",                       dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "JO", iso3: "JOR", name: "Jordan",            fatfStatus: "grey_list", cpiScore: 46, sanctionsRegime: "None",                       dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "ML", iso3: "MLI", name: "Mali",              fatfStatus: "grey_list", cpiScore: 31, sanctionsRegime: "EU, UN",                     dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "MZ", iso3: "MOZ", name: "Mozambique",        fatfStatus: "grey_list", cpiScore: 26, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "NA", iso3: "NAM", name: "Namibia",           fatfStatus: "grey_list", cpiScore: 49, sanctionsRegime: "None",                       dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "NI", iso3: "NIC", name: "Nicaragua",         fatfStatus: "grey_list", cpiScore: 21, sanctionsRegime: "OFAC SDN",                   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "NG", iso3: "NGA", name: "Nigeria",           fatfStatus: "grey_list", cpiScore: 25, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "PK", iso3: "PAK", name: "Pakistan",          fatfStatus: "grey_list", cpiScore: 29, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "PA", iso3: "PAN", name: "Panama",            fatfStatus: "grey_list", cpiScore: 34, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "PH", iso3: "PHL", name: "Philippines",       fatfStatus: "grey_list", cpiScore: 34, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "SS", iso3: "SSD", name: "South Sudan",       fatfStatus: "grey_list", cpiScore: 13, sanctionsRegime: "OFAC SDN, EU, UN",          dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "SY", iso3: "SYR", name: "Syria",             fatfStatus: "grey_list", cpiScore: 13, sanctionsRegime: "OFAC SDN, EU, UN, UK",     dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "TZ", iso3: "TZA", name: "Tanzania",          fatfStatus: "grey_list", cpiScore: 36, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "TR", iso3: "TUR", name: "Turkey",            fatfStatus: "grey_list", cpiScore: 34, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "UG", iso3: "UGA", name: "Uganda",            fatfStatus: "grey_list", cpiScore: 27, sanctionsRegime: "None",                       dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "VN", iso3: "VNM", name: "Vietnam",           fatfStatus: "grey_list", cpiScore: 41, sanctionsRegime: "None",                       dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "YE", iso3: "YEM", name: "Yemen",             fatfStatus: "grey_list", cpiScore: 16, sanctionsRegime: "OFAC SDN, EU, UN",          dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  // UAE and GCC
  { iso2: "AE", iso3: "ARE", name: "United Arab Emirates", fatfStatus: "member", cpiScore: 68, sanctionsRegime: "None",                    dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "SA", iso3: "SAU", name: "Saudi Arabia",      fatfStatus: "member", cpiScore: 52, sanctionsRegime: "None",                          dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "KW", iso3: "KWT", name: "Kuwait",            fatfStatus: "member", cpiScore: 48, sanctionsRegime: "None",                          dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "QA", iso3: "QAT", name: "Qatar",             fatfStatus: "member", cpiScore: 56, sanctionsRegime: "None",                          dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "BH", iso3: "BHR", name: "Bahrain",           fatfStatus: "member", cpiScore: 45, sanctionsRegime: "None",                          dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "OM", iso3: "OMN", name: "Oman",              fatfStatus: "member", cpiScore: 52, sanctionsRegime: "None",                          dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  // Key FATF members
  { iso2: "RU", iso3: "RUS", name: "Russia",            fatfStatus: "member", cpiScore: 26, sanctionsRegime: "OFAC SDN, EU, UK",              dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "US", iso3: "USA", name: "United States",     fatfStatus: "member", cpiScore: 69, sanctionsRegime: "None",                          dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "GB", iso3: "GBR", name: "United Kingdom",    fatfStatus: "member", cpiScore: 73, sanctionsRegime: "None",                          dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "DE", iso3: "DEU", name: "Germany",           fatfStatus: "member", cpiScore: 78, sanctionsRegime: "None",                          dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "FR", iso3: "FRA", name: "France",            fatfStatus: "member", cpiScore: 71, sanctionsRegime: "None",                          dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "CN", iso3: "CHN", name: "China",             fatfStatus: "member", cpiScore: 45, sanctionsRegime: "None",                          dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "IN", iso3: "IND", name: "India",             fatfStatus: "member", cpiScore: 40, sanctionsRegime: "None",                          dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "CH", iso3: "CHE", name: "Switzerland",       fatfStatus: "member", cpiScore: 82, sanctionsRegime: "None",                          dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "SG", iso3: "SGP", name: "Singapore",         fatfStatus: "member", cpiScore: 83, sanctionsRegime: "None",                          dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "LB", iso3: "LBN", name: "Lebanon",           fatfStatus: "non_member", cpiScore: 24, sanctionsRegime: "OFAC SDN",                  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "VE", iso3: "VEN", name: "Venezuela",         fatfStatus: "non_member", cpiScore: 13, sanctionsRegime: "OFAC SDN, EU",             dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "CU", iso3: "CUB", name: "Cuba",              fatfStatus: "non_member", cpiScore: 47, sanctionsRegime: "OFAC SDN",                  dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
];

function lookupStaticCountry(country: string): StaticCountryEntry | undefined {
  const q = country.toLowerCase().trim();
  return STATIC_COUNTRY_DATASET.find(
    (e) =>
      e.name.toLowerCase() === q ||
      e.iso2.toLowerCase() === q ||
      e.iso3.toLowerCase() === q,
  );
}

function staticEntryToResult(entry: StaticCountryEntry): CountryRiskResult {
  const riskScore =
    entry.dpmsRiskTier === "critical" ? 90 :
    entry.dpmsRiskTier === "high" ? 72 :
    entry.dpmsRiskTier === "medium" ? 50 : 25;
  const overallRisk =
    entry.dpmsRiskTier === "critical" ? "critical" :
    entry.dpmsRiskTier === "high" ? "high" :
    entry.dpmsRiskTier === "medium" ? "medium" : "low";
  const hasSanctions = entry.sanctionsRegime !== "None" && entry.sanctionsRegime !== "";
  return {
    ok: true,
    country: entry.name,
    overallRisk,
    riskScore,
    dimensions: {
      amlRisk: riskScore,
      baselScore: Math.max(0, 100 - entry.cpiScore),
      cpiScore: Math.max(0, 100 - entry.cpiScore),
      politicalRisk: entry.dpmsRiskTier === "critical" ? 80 : entry.dpmsRiskTier === "high" ? 65 : 35,
      sanctionsRisk: hasSanctions ? (entry.fatfStatus === "black_list" ? 95 : 70) : 5,
      tfRisk: entry.dpmsRiskTier === "critical" ? 80 : entry.dpmsRiskTier === "high" ? 55 : 25,
    },
    fatfStatus: entry.fatfStatus,
    sanctionsProfile: {
      ofac: entry.sanctionsRegime.includes("OFAC"),
      eu: entry.sanctionsRegime.includes("EU"),
      un: entry.sanctionsRegime.includes("UN"),
      uk: entry.sanctionsRegime.includes("UK"),
      details: entry.sanctionsRegime !== "None" ? [entry.sanctionsRegime] : [],
    },
    keyRisks: [
      entry.fatfStatus === "black_list"
        ? "FATF Black List — high-risk jurisdiction subject to a call for action"
        : entry.fatfStatus === "grey_list"
          ? "FATF Grey List — jurisdiction under increased monitoring"
          : "FATF member in good standing",
      ...(hasSanctions ? [`Sanctions regime: ${entry.sanctionsRegime}`] : []),
    ],
    recentDevelopments: [`FATF status as of February 2026 plenary: ${entry.fatfStatus.replace("_", " ")}`],
    regulatoryObligations: [
      entry.fatfStatus === "black_list" || entry.fatfStatus === "grey_list"
        ? { obligation: "Enhanced Due Diligence required", regulation: "FDL 10/2025 Art.14 — FATF Rec. 19" }
        : { obligation: "Standard Customer Due Diligence applies", regulation: "FDL 10/2025 Art.12" },
    ],
    recommendation:
      entry.dpmsRiskTier === "critical" ? "prohibited" :
      entry.dpmsRiskTier === "high" ? "senior_approval" :
      entry.dpmsRiskTier === "medium" ? "enhanced_dd" : "standard_dd",
    summary: `Static risk profile for ${entry.name} (iso2: ${entry.iso2}). ` +
      `FATF status: ${entry.fatfStatus.replace("_", " ")}. ` +
      `DPMS risk tier: ${entry.dpmsRiskTier}. ` +
      `Sanctions: ${entry.sanctionsRegime}. ` +
      `Source: static_fallback — run with ANTHROPIC_API_KEY for live AI analysis.`,
  };
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
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { country?: string; analysisDepth?: "quick" | "full" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const country = (body.country ?? "").trim();
  if (!country) {
    return NextResponse.json({ ok: false, error: "country is required" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    // Try static dataset first, then fall back to UAE template
    const staticEntry = lookupStaticCountry(country);
    if (staticEntry) {
      return NextResponse.json(
        { ...staticEntryToResult(staticEntry), source: "static_fallback" },
        { status: 200, headers: gate.headers },
      );
    }
    return NextResponse.json(
      {
        ...FALLBACK,
        country: country || FALLBACK.country,
        source: "static_fallback",
        simulationWarning: "ANTHROPIC_API_KEY not configured — this is a simulated template for UAE, NOT a real country risk assessment. All scores and risk ratings are illustrative examples only. Obtain a real AI-generated assessment before making any compliance decisions.",
      },
      { status: 200, headers: gate.headers },
    );
  }

  const depth = body.analysisDepth ?? "quick";
  const detailInstruction =
    depth === "full"
      ? "Provide analysis with context for each dimension, regulatory obligations, and 3-5 recent developments."
      : "Provide a concise but complete analysis covering all required fields.";

  // Netlify edge gateway has a 26s inactivity timeout. Keep both modes well
  // under that ceiling: Haiku at ≤1800 tokens reliably responds in 8-15s.
  const sdkTimeoutMs = 10_000;

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
    const latencyMs = Date.now() - t0;
    if (latencyMs > 5000) console.warn(`[country-risk] slow response latencyMs=${latencyMs}`);
    return NextResponse.json({ ...result, latencyMs }, { headers: gate.headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[country-risk] LLM call failed:", detail);
    // Serve static fallback on LLM failure so tool never returns empty
    const staticEntry = lookupStaticCountry(country);
    if (staticEntry) {
      console.warn(`[country-risk] serving static_fallback for ${country} after LLM failure`);
      return NextResponse.json(
        {
          ...staticEntryToResult(staticEntry),
          source: "static_fallback",
          degraded: true,
          degradedReason: detail.includes("timeout") ? "LLM timeout" : detail.includes("rate") ? "LLM rate limit" : "LLM unavailable",
          latencyMs: Date.now() - t0,
        },
        { status: 200, headers: gate.headers },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: `Real-time analysis temporarily unavailable for ${country}. ${detail.includes("timeout") ? "(timeout — try again with shorter depth)" : detail.includes("rate") ? "(rate limit — wait 60s)" : "Please retry in a moment."}`,
        detail,
        latencyMs: Date.now() - t0,
      },
      { status: 503 },
    );
  }
}
