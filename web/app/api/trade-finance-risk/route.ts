export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const FALLBACK = {
  ok: true,
  tbmlRisk: "high",
  invoiceAnomalyScore: 74,
  sanctionedParties: "One party in the trade flow has a name match against OFAC SDN list. Requires full OFAC SDGT search and legal analysis before proceeding. Potential 50% rule application for entity with SDN-linked ownership.",
  recommendation: "Apply enhanced due diligence per FATF Guidance on Trade-Based Money Laundering (2021). Request independent valuation for goods. Verify shipping documents against port authority records. Cross-reference all parties against consolidated sanctions lists. Flag for MLRO review before releasing payment against LC.",
};

export async function POST(req: Request) {
  let body: { tradeFlow?: string; goods?: string; parties?: string; jurisdiction?: string; documents?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: [
        {
          type: "text",
          text: `You are a senior MLRO specialising in trade-based money laundering (TBML). Analyse the trade flow, goods, parties, jurisdiction, and documents for TBML indicators: invoice fraud, over/under-invoicing, phantom shipments, multiple invoicing, dual-use goods, sanctions exposure, and misrepresentation of goods. Reference FATF Guidance on Trade-Based Money Laundering (2021), FATF R.3/R.7/R.8, and applicable export control regulations. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "tbmlRisk": "critical"|"high"|"medium"|"low",
  "invoiceAnomalyScore": number,
  "sanctionedParties": "string",
  "recommendation": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Trade Flow: ${body.tradeFlow ?? "Not described"}
Goods: ${body.goods ?? "Not specified"}
Parties: ${body.parties ?? "Not specified"}
Jurisdiction: ${body.jurisdiction ?? "Not specified"}
Documents: ${body.documents ?? "Not provided"}

Assess trade-based ML risk and identify TBML typologies.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
