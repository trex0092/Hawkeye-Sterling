import { NextResponse } from "next/server";

export interface DiscoveredEntity {
  label: string;
  kind: "ubo" | "counterparty" | "ai_discovered";
  relationship: string;
  confidence: number;
  reasoning: string;
}

const DEMO_DISCOVERIES: DiscoveredEntity[] = [
  { label: "Halac Holding FZE",     kind: "ai_discovered", relationship: "controlled entity",   confidence: 89, reasoning: "Name-match corporate vehicle — common FZCO → FZE holding structure in UAE." },
  { label: "Turquoise Gate DMCC",   kind: "ai_discovered", relationship: "associated company",  confidence: 76, reasoning: "DMCC entity active in gold / precious metals; directorship overlap likely." },
  { label: "UBO 3 · 15%",           kind: "ubo",           relationship: "beneficial owner",    confidence: 71, reasoning: "Residual ownership tranche typical for 3-UBO structure; nominee likely." },
  { label: "Offshore SPV — BVI",    kind: "ai_discovered", relationship: "layering vehicle",    confidence: 68, reasoning: "BVI SPV commonly interposed between MENA principal and UAE operating entity." },
  { label: "Al-Noor Trading LLC",   kind: "counterparty",  relationship: "trade counterparty",  confidence: 63, reasoning: "Gold refinery customer; matching trade-document patterns in TM alerts." },
];

export async function POST(req: Request) {
  let body: { subject: string; knownNodes: string[]; knownEdges: Array<{ from: string; to: string; label?: string }> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { subject, knownNodes, knownEdges } = body;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: true, discovered: DEMO_DISCOVERIES });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
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
      return NextResponse.json({ ok: true, discovered: DEMO_DISCOVERIES });
    }

    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as { discovered: DiscoveredEntity[] };
    return NextResponse.json({ ok: true, discovered: result.discovered ?? [] });
  } catch {
    return NextResponse.json({ ok: true, discovered: DEMO_DISCOVERIES });
  }
}
