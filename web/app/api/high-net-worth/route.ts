export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface HnwRiskResult {
  riskScore: number;
  riskRating: "critical" | "high" | "medium" | "low";
  wealthSourceVerified: boolean;
  wealthSourceGaps: string[];
  keyRiskFactors: string[];
  eddRequirements: string[];
  ongoingMonitoringPlan: string;
  regulatoryBasis: string;
}

const FALLBACK: HnwRiskResult = {
  riskScore: 72,
  riskRating: "high",
  wealthSourceVerified: false,
  wealthSourceGaps: [
    "No independent corroboration of stated AED 45M in property portfolio — DLD check required",
    "Investment income from BVI entity — UBO and source of entity funds undocumented",
    "Cash gift of AED 2M from family member — gift deed and family SOW not obtained",
    "Prior business exit proceeds (AED 18M) — sale agreement and tax filing not reviewed",
  ],
  keyRiskFactors: [
    "PEP adjacent — spouse holds senior government position in MENA jurisdiction",
    "Maintains accounts in 4 jurisdictions including one FATF grey-list country",
    "Frequent large round-sum cash deposits at DPMS counter (AED 150–190K range)",
    "Property portfolio includes assets in jurisdictions with opaque ownership registers",
  ],
  eddRequirements: [
    "Independent property valuation for UAE holdings (RERA-certified valuer)",
    "Company search on BVI entity — registered agent confirmation of UBO",
    "Bank reference letters for primary banking relationships (minimum 2 years)",
    "Audited financial statements or tax returns covering 3-year wealth accumulation period",
    "Signed SOW declaration with supporting documentary evidence for each income stream",
  ],
  ongoingMonitoringPlan:
    "Monthly automated TM review. Quarterly relationship review by Compliance. Annual EDD refresh. PEP re-screening on each adverse political event. CBUAE high-value customer reporting per CR No.134/2025.",
  regulatoryBasis:
    "FATF R.10 (CDD), R.12 (PEP), UAE FDL 10/2025 Art.11, CBUAE AML Standards §3.4 (high-risk customers)",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    nationality: string;
    wealthEstimateAed: string;
    wealthSources: string;
    pepStatus: string;
    jurisdictions: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "high-net-worth temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in high-net-worth individual due diligence under FATF R.10, R.12, and UAE FDL 10/2025. Conduct EDD risk assessments and return a JSON object with exactly these fields: { "riskScore": number (0-100), "riskRating": "critical"|"high"|"medium"|"low", "wealthSourceVerified": boolean, "wealthSourceGaps": string[], "keyRiskFactors": string[], "eddRequirements": string[], "ongoingMonitoringPlan": string, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Conduct an EDD risk assessment for the following HNW individual:
- Subject Name: ${body.subjectName}
- Nationality: ${body.nationality}
- Wealth Estimate (AED): ${body.wealthEstimateAed}
- Wealth Sources: ${body.wealthSources}
- PEP Status: ${body.pepStatus}
- Jurisdictions: ${body.jurisdictions}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "high-net-worth temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as HnwRiskResult;
    if (!Array.isArray(parsed.wealthSourceGaps)) parsed.wealthSourceGaps = [];
    if (!Array.isArray(parsed.keyRiskFactors)) parsed.keyRiskFactors = [];
    if (!Array.isArray(parsed.eddRequirements)) parsed.eddRequirements = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "high-net-worth temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
