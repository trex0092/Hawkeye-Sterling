import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

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
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
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
          content: `Subject: ${sanitizeField(subject)}
Known nodes: ${knownNodes.map((n) => sanitizeField(n)).join(", ")}
Known edges: ${JSON.stringify(knownEdges)}

What additional entities should investigators look for?`,
        }],
      });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
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
