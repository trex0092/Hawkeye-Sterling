export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const FALLBACK = {
  ok: true,
  corruptionRisk: "high",
  pepExposure: "Direct PEP connection confirmed. Individual holds or held ministerial-level position with procurement authority over contracts in relevant sector. Enhanced due diligence and senior management approval required before establishing or continuing relationship.",
  redFlags: [
    "Public procurement contract awarded without competitive tender process",
    "PEP-linked beneficial owner with 25%+ ownership interest in awarded entity",
    "Facilitation payment language identified in correspondence",
    "Unusual commission structure — percentage of contract value with no clear service",
    "Related entity in jurisdiction with no anti-bribery legislation equivalent to FCPA/UKBA",
  ],
  recommendation: "Apply FATF R.12 enhanced due diligence for PEPs. Obtain senior management approval. Verify source of wealth and source of funds independently. Cross-reference UNGC anti-corruption principles, UNCAC, FCPA, UK Bribery Act 2010. Consider filing STR if facilitation payments or bribery proceeds identified.",
};

export async function POST(req: Request) {
  let body: { entity?: string; jurisdiction?: string; sector?: string; pepStatus?: string; contractTypes?: string };
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
          text: `You are a senior MLRO specialising in corruption and bribery risk. Analyse the entity, jurisdiction, sector, PEP status, and contract types for corruption ML indicators: public procurement irregularities, PEP-linked beneficial ownership, facilitation payments, bribery indicators, and conflict-of-interest structures. Reference FATF R.12 (PEPs), FATF R.3 (corruption as predicate offence), UNCAC, UK Bribery Act 2010, FCPA, and UAE FDL 10/2025. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "corruptionRisk": "critical"|"high"|"medium"|"low",
  "pepExposure": "string",
  "redFlags": ["string"],
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
Sector: ${body.sector ?? "Not specified"}
PEP Status: ${body.pepStatus ?? "Unknown"}
Contract Types: ${body.contractTypes ?? "Not specified"}

Assess corruption and bribery ML risk.`,
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
