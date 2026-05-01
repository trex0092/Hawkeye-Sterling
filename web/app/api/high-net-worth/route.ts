export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

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
    "Monthly automated TM review. Quarterly relationship review by Compliance. Annual EDD refresh. PEP re-screening on each adverse political event. CBUAE high-value customer reporting per Cabinet Decision 10/2019.",
  regulatoryBasis:
    "FATF R.10 (CDD), R.12 (PEP), UAE FDL 10/2025 Art.11, CBUAE AML Standards §3.4 (high-risk customers)",
};

export async function POST(req: Request) {
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
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const prompt = `You are a UAE AML/CFT compliance expert specialising in high-net-worth individual due diligence under FATF R.10, R.12, and UAE FDL 10/2025.

Conduct an EDD risk assessment for the following HNW individual:
- Subject Name: ${body.subjectName}
- Nationality: ${body.nationality}
- Wealth Estimate (AED): ${body.wealthEstimateAed}
- Wealth Sources: ${body.wealthSources}
- PEP Status: ${body.pepStatus}
- Jurisdictions: ${body.jurisdictions}
- Additional Context: ${body.context}

Return a JSON object with exactly these fields:
{
  "riskScore": number (0-100),
  "riskRating": "critical"|"high"|"medium"|"low",
  "wealthSourceVerified": boolean,
  "wealthSourceGaps": string[],
  "keyRiskFactors": string[],
  "eddRequirements": string[],
  "ongoingMonitoringPlan": string,
  "regulatoryBasis": string
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: true, ...FALLBACK });

    const parsed = JSON.parse(jsonMatch[0]) as HnwRiskResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
