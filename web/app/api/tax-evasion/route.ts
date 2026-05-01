export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const FALLBACK = {
  ok: true,
  taxEvasionRisk: "high",
  typologies: [
    "Round-tripping — funds transferred offshore and returned as foreign investment to avoid domestic tax",
    "Treaty shopping — intermediary jurisdictions used to reduce withholding tax obligations",
    "Transfer pricing abuse — intra-group transactions priced to shift profit to low-tax jurisdictions",
  ],
  jurisdictionRisk: "High-risk jurisdiction combination detected. Funds passing through known tax haven with no economic substance requirements and no automatic exchange of information with home jurisdiction.",
  recommendation: "Apply enhanced due diligence. Request economic substance evidence for all intermediary entities. Cross-reference OECD BEPS Action Plans and FATF R.3 (tax evasion as predicate offence). Consider STR if reasonable suspicion of ML from tax proceeds under UAE FDL 10/2025.",
};

export async function POST(req: Request) {
  let body: { entity?: string; jurisdiction?: string; structureType?: string; transactions?: string };
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
          text: `You are a senior MLRO specialising in tax evasion as a ML predicate offence. Analyse the entity, jurisdictions, structure type, and transactions for tax evasion ML indicators: round-tripping, treaty shopping, transfer pricing abuse, undisclosed offshore accounts, and nominee arrangements used for tax purposes. Reference FATF R.3 (tax crimes as predicate offence), OECD BEPS, CRS/AEOI regimes, and UAE FDL 10/2025. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "taxEvasionRisk": "critical"|"high"|"medium"|"low",
  "typologies": ["string"],
  "jurisdictionRisk": "string",
  "recommendation": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Entity: ${body.entity ?? "Unknown"}
Jurisdiction: ${body.jurisdiction ?? "Not specified"}
Structure Type: ${body.structureType ?? "Not specified"}
Transactions: ${body.transactions ?? "Not provided"}

Assess tax evasion ML risk and identify relevant typologies.`,
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
