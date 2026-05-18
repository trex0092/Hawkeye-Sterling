export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface ThreatTypology {
  name: string;
  trend: "rising" | "stable" | "declining";
  description: string;
  fatfRef: string;
}

export interface RegulatoryChange {
  change: string;
  impact: string;
  effectiveDate: string;
}

export interface ScoreAdjustment {
  dimension: string;
  currentScore: number;
  suggestedScore: number;
  reason: string;
}

export interface ThreatIntelResult {
  ok: true;
  typologies: ThreatTypology[];
  regulatoryChanges: RegulatoryChange[];
  scoreAdjustments: ScoreAdjustment[];
  generatedAt: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { sector?: string; jurisdiction?: string; reportingPeriod?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { sector, jurisdiction, reportingPeriod } = body;
  if (!sector || !jurisdiction) {
    return NextResponse.json(
      { ok: false, error: "sector and jurisdiction are required" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ewra/threat-intel temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a financial crime threat intelligence analyst specialising in AML typologies, FATF guidance, and regulatory developments. Your knowledge covers FATF mutual evaluations, CBUAE guidance, UAE FDL 10/2025, LBMA RGG, and emerging financial crime trends globally.

Generate current, accurate threat intelligence for an EWRA (Entity-Wide Risk Assessment). Focus on:
1. Top 5 ML/TF typologies active in the specified sector and jurisdiction
2. Regulatory changes in the last 90 days
3. FATF mutual evaluation findings if relevant to the jurisdiction
4. Recommended EWRA score adjustments with precise justification

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "typologies": [
    {"name":"string","trend":"rising"|"stable"|"declining","description":"string","fatfRef":"string"}
  ],
  "regulatoryChanges": [
    {"change":"string","impact":"string","effectiveDate":"dd/mm/yyyy or yyyy-mm-dd"}
  ],
  "scoreAdjustments": [
    {"dimension":"string","currentScore":1-5,"suggestedScore":1-5,"reason":"string"}
  ],
  "generatedAt": "ISO-8601 timestamp"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Sector: ${sector}
Jurisdiction: ${jurisdiction}
Reporting period: ${reportingPeriod ?? new Date().getFullYear().toString()}

Generate threat intelligence for the EWRA. Focus on the top 5 current ML/TF typologies, recent regulatory changes (last 90 days), and specific EWRA dimension score adjustment recommendations. Return JSON only.`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as ThreatIntelResult;
    if (!Array.isArray(parsed.typologies)) parsed.typologies = [];
    if (!Array.isArray(parsed.regulatoryChanges)) parsed.regulatoryChanges = [];
    if (!Array.isArray(parsed.scoreAdjustments)) parsed.scoreAdjustments = [];
    const result: ThreatIntelResult = {
      ...parsed,
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
    };
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ewra/threat-intel temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
