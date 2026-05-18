export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface GeopoliticalEvent {
  id: string;
  country: string;
  region: "Middle East" | "Europe" | "Asia" | "Africa" | "Americas";
  eventType:
    | "conflict"
    | "sanctions"
    | "coup"
    | "election"
    | "financial-crisis"
    | "diplomatic";
  riskLevel: "critical" | "high" | "medium";
  headline: string;
  impact: string;
  affectedSectors: string[];
  date: string;
  recommendation: string;
}


export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "geopolitical/events temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a geopolitical risk intelligence analyst specialising in AML/CFT implications for UAE-based financial institutions. Generate 12 current, realistic geopolitical risk events that are relevant to compliance teams in the UAE. Each event should have direct AML/CFT or sanctions implications.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "ok": true,
  "events": [
    {
      "id": "GEO-001",
      "country": "string",
      "region": "Middle East"|"Europe"|"Asia"|"Africa"|"Americas",
      "eventType": "conflict"|"sanctions"|"coup"|"election"|"financial-crisis"|"diplomatic",
      "riskLevel": "critical"|"high"|"medium",
      "headline": "string (concise news-style headline)",
      "impact": "string (AML/CFT impact for UAE firms, 1-2 sentences)",
      "affectedSectors": ["string"],
      "date": "YYYY-MM-DD",
      "recommendation": "string (specific compliance action, 1-2 sentences)"
    }
  ]
}

Include a mix of: 2-3 critical events, 5-6 high events, 3-4 medium events. Make events realistic and topical for 2025.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Generate 12 current geopolitical risk events with AML/CFT implications for UAE compliance teams. Focus on conflicts, sanctions updates, financial crises, elections with risk implications, and diplomatic developments affecting trade and finance.",
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as { ok: boolean; events: GeopoliticalEvent[] };
    if (!Array.isArray(result.events)) result.events = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "geopolitical/events temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
