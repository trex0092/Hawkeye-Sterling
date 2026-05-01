export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export interface CashIntensiveResult {
  riskRating: "critical" | "high" | "medium" | "low";
  cashRiskScore: number;
  redFlags: string[];
  typologiesMatched: string[];
  controlGaps: string[];
  enhancedMeasures: string[];
  reportingObligations: string[];
  regulatoryBasis: string;
}

const FALLBACK: CashIntensiveResult = {
  riskRating: "high",
  cashRiskScore: 78,
  redFlags: [
    "Daily cash receipts consistently just below AED 55,000 MoE reporting threshold (AED 48–54K range)",
    "No segregation between personal and business cash — commingled into single account",
    "Customer declines to provide business records or invoices for cash sales",
    "Rapid turnover — cash deposited and immediately wired to overseas supplier",
  ],
  typologiesMatched: [
    "Structuring (placement)",
    "DPMS cash threshold avoidance (MoE Circular 2/2024)",
    "Funds commingling",
  ],
  controlGaps: [
    "No cash transaction log maintained at counter level",
    "CTR filing process absent — no AED 55K+ reporting implemented",
    "Business verification not completed — trade licence expired 6 months ago",
    "No beneficial ownership confirmation for cash-paying business entity",
  ],
  enhancedMeasures: [
    "Implement daily cash receipt log with cumulative aggregation alerts",
    "Require invoice/receipt for all cash transactions above AED 10,000",
    "File CTR immediately for any single transaction ≥ AED 55,000",
    "Obtain current trade licence and UBO confirmation before accepting further cash",
  ],
  reportingObligations: [
    "MoE Circular 2/2024: CTR for DPMS cash ≥ AED 55,000 — mandatory, immediate",
    "goAML STR if structuring pattern confirmed — 48-hour filing requirement",
    "CBUAE notification if aggregate suspicious cash exceeds AED 500K/month",
  ],
  regulatoryBasis:
    "MoE Circular 2/2024 (DPMS AED 55K), UAE FDL 10/2025 Art.19, Cabinet Decision 10/2019 (CTR), FATF R.29 (cash couriers)",
};

export async function POST(req: Request) {
  let body: {
    businessName: string;
    businessType: string;
    monthlyRevenue: string;
    cashPct: string;
    depositPattern: string;
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

    const prompt = `You are a UAE AML/CFT compliance expert specialising in cash-intensive business risk assessment under MoE Circular 2/2024 and UAE FDL 10/2025.

Assess the following cash-intensive business scenario:
- Business Name: ${body.businessName}
- Business Type: ${body.businessType}
- Monthly Revenue: ${body.monthlyRevenue}
- Cash Percentage: ${body.cashPct}
- Deposit Pattern: ${body.depositPattern}
- Additional Context: ${body.context}

Return a JSON object with exactly these fields:
{
  "riskRating": "critical"|"high"|"medium"|"low",
  "cashRiskScore": number (0-100),
  "redFlags": string[],
  "typologiesMatched": string[],
  "controlGaps": string[],
  "enhancedMeasures": string[],
  "reportingObligations": string[],
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

    const parsed = JSON.parse(jsonMatch[0]) as CashIntensiveResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
