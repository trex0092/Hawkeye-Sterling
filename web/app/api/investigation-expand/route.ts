import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface DiscoveredEntity {
  label: string;
  kind: "ubo" | "counterparty" | "ai_discovered";
  relationship: string;
  confidence: number;
  reasoning: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { subject: string; knownNodes: string[]; knownEdges: Array<{ from: string; to: string; label?: string }> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  const { subject, knownNodes, knownEdges } = body;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Investigation expand unavailable — ANTHROPIC_API_KEY not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: `You are an AML/CFT link-analysis intelligence engine. Given a subject and their known network, infer additional entities that investigators should look for. Base your reasoning on:
- Corporate naming / holding patterns common to UAE/MENA structures
- UBO residual tranches and nominee arrangements
- Sector exposure (gold, real estate, DNFBP, crypto)
- Shell entity typologies (BVI, Cayman, Seychelles SPVs)
- Counterparty clustering around known flagged entities

Respond ONLY with valid JSON — no markdown fences, no explanation outside the JSON:
{ "discovered": [ { "label": string, "kind": "ubo"|"counterparty"|"ai_discovered", "relationship": string, "confidence": number, "reasoning": string } ] }

Limit to 5 entities. Be specific, AML-grounded, and plausible.`,
        messages: [{
          role: "user",
          content: `Subject: ${subject}
Known nodes: ${knownNodes.join(", ")}
Known edges: ${JSON.stringify(knownEdges)}

What additional entities should investigators look for?`,
        }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "Investigation expand temporarily unavailable — please retry." },
        { status: 503 },
      );
    }

    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as { discovered: DiscoveredEntity[] };
    return NextResponse.json({ ok: true, discovered: result.discovered ?? [] }, { headers: gate.headers });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Investigation expand temporarily unavailable — please retry." },
      { status: 503 },
    );
  }
}
