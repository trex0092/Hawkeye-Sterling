export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const FALLBACK = {
  ok: true,
  environmentalRisk: "high",
  crimeTypes: [
    "Illegal wildlife trafficking — cash-intensive proceeds funnelled through front companies",
    "Illegal logging — under-invoiced timber exports used for trade-based ML",
    "Carbon credit fraud — inflated credits sold to legitimate buyers, proceeds laundered through offshore accounts",
  ],
  fatfRef: "FATF R.3 (ML offences — environmental crime as predicate), FATF Guidance on ML from Environmental Crime (2021), UNODC Green Finance Guidelines",
  recommendation: "Apply enhanced due diligence. Map commodity trade routes against known high-risk corridors. Cross-reference counterparties against CITES permit databases and Interpol environmental crime notifications. File SAR if transaction patterns are inconsistent with stated legitimate business.",
};

export async function POST(req: Request) {
  let body: { entity?: string; commodities?: string; tradeRoutes?: string; jurisdiction?: string };
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
          text: `You are a senior MLRO specialising in environmental crime money laundering risk. Analyse the provided entity, commodities, trade routes, and jurisdiction against known environmental crime ML typologies: illegal wildlife trade, illegal logging, illegal mining, carbon credit fraud, and illegal fishing. Reference FATF Guidance on ML from Environmental Crime (2021), FATF R.3 (predicate offences), CITES, UNODC, and applicable national law. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "environmentalRisk": "critical"|"high"|"medium"|"low",
  "crimeTypes": ["string"],
  "fatfRef": "string",
  "recommendation": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Entity: ${body.entity ?? "Unknown"}
Commodities: ${body.commodities ?? "Not specified"}
Trade Routes: ${body.tradeRoutes ?? "Not specified"}
Jurisdiction: ${body.jurisdiction ?? "Not specified"}

Assess environmental crime ML risk and identify relevant crime typologies.`,
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
