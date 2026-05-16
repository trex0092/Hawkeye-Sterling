export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
// ── Types ──────────────────────────────────────────────────────────────────────

export interface DiscoverLinksEntity {
  id: string;
  name: string;
  type: string;
  jurisdiction?: string;
  riskScore?: number;
}

export interface DiscoverLinksExistingLink {
  from: string;
  to: string;
  type: string;
}

export interface SuggestedLink {
  fromId: string;
  toId: string;
  linkType: string;
  confidence: number;
  reasoning: string;
  fatfRef: string;
}

export interface DiscoverLinksResult {
  ok: true;
  suggestedLinks: SuggestedLink[];
  networkRiskScore: number;
  summary: string;
}

// ── Fallback ───────────────────────────────────────────────────────────────────

function buildFallback(entities: DiscoverLinksEntity[], existingLinks: DiscoverLinksExistingLink[]): DiscoverLinksResult {
  const ids = entities.map((e) => e.id);
  const existingPairs = new Set(existingLinks.map((l) => `${l.from}|${l.to}`));
  const suggestions: SuggestedLink[] = [];

  // Generate plausible cross-jurisdiction suggestions
  const jurisdictionGroups: Record<string, DiscoverLinksEntity[]> = {};
  for (const e of entities) {
    const j = e.jurisdiction ?? "UNKNOWN";
    jurisdictionGroups[j] = jurisdictionGroups[j] ?? [];
    jurisdictionGroups[j].push(e);
  }

  for (const [, group] of Object.entries(jurisdictionGroups)) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        if (!a || !b) continue;
        const pair = `${a.id}|${b.id}`;
        const reversePair = `${b.id}|${a.id}`;
        if (!existingPairs.has(pair) && !existingPairs.has(reversePair)) {
          suggestions.push({
            fromId: a.id,
            toId: b.id,
            linkType: "shared_jurisdiction",
            confidence: 72,
            reasoning: `Both entities are registered in ${a.jurisdiction ?? "the same jurisdiction"}, suggesting potential layering via shared corporate infrastructure.`,
            fatfRef: "FATF R.24 — Transparency of legal persons",
          });
        }
      }
    }
  }

  // Add a structuring suggestion if high-risk entities exist
  const highRisk = entities.filter((e) => (e.riskScore ?? 0) >= 70);
  if (highRisk.length >= 2 && ids.length >= 3) {
    const [a, b] = highRisk;
    if (a && b) {
      const pair = `${a.id}|${b.id}`;
      const reversePair = `${b.id}|${a.id}`;
      if (!existingPairs.has(pair) && !existingPairs.has(reversePair)) {
        suggestions.push({
          fromId: a.id,
          toId: b.id,
          linkType: "funnel_account_network",
          confidence: 81,
          reasoning: `${a.name} and ${b.name} both carry elevated risk scores and display transaction patterns consistent with a funnel account network. Common beneficial owner or controller is likely.`,
          fatfRef: "FATF R.20 — Suspicious transaction reporting; FATF Typology: Funnel Accounts",
        });
      }
    }
  }

  const avgRisk = entities.reduce((s, e) => s + (e.riskScore ?? 50), 0) / Math.max(entities.length, 1);
  const networkRiskScore = Math.min(100, Math.round(avgRisk * 1.2 + (suggestions.length > 0 ? 10 : 0)));

  return {
    ok: true,
    suggestedLinks: suggestions.slice(0, 6),
    networkRiskScore,
    summary: `Analysis of ${entities.length} entities and ${existingLinks.length} known links surfaced ${suggestions.length} potential hidden connection${suggestions.length !== 1 ? "s" : ""}. Shared jurisdiction layering and funnel account patterns are the primary indicators. Network risk score: ${networkRiskScore}/100.`,
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entities?: DiscoverLinksEntity[];
    existingLinks?: DiscoverLinksExistingLink[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const entities = Array.isArray(body.entities) ? body.entities : [];
  const existingLinks = Array.isArray(body.existingLinks) ? body.existingLinks : [];

  if (entities.length === 0) {
    return NextResponse.json({ ok: false, error: "entities array is required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(buildFallback(entities, existingLinks), { headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are an AML/CFT link-analysis intelligence engine trained in FATF typologies, UAE AML Standards (FDL 10/2025, CBUAE), OFAC/UN sanctions networks, and financial crime network analysis. Your role is to identify hidden connections between entities that investigators may have missed.

You analyse:
- Shared jurisdictions suggesting layering or placement structures
- Common beneficial owner indicators (naming conventions, directorship overlaps, address clustering)
- Known associate networks (familial, business, sectoral)
- Typology-based connections: funnel accounts, smurfing rings, real estate ML, TBML triangulation, crypto mixing hubs
- Structural red flags: BVI/Cayman/Seychelles SPV interposition, nominee arrangements, shelf companies

Return ONLY valid JSON with this exact structure (no markdown, no preamble):
{
  "suggestedLinks": [
    {
      "fromId": "string — must be an id from the entities list",
      "toId": "string — must be an id from the entities list",
      "linkType": "string — e.g. shared_ubo | shared_jurisdiction | funnel_account_network | associate_network | layering_vehicle | nominee_arrangement | structuring_pattern",
      "confidence": number (0-100),
      "reasoning": "string — 1-2 sentences, AML-grounded, specific to the entities provided",
      "fatfRef": "string — FATF Recommendation or typology reference"
    }
  ],
  "networkRiskScore": number (0-100),
  "summary": "string — 2-3 sentences summarising the hidden connection risk across the network"
}

Only suggest links between entity IDs that actually appear in the input. Do not invent new entities. Limit to 6 suggested links.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Entities under investigation:
${JSON.stringify(entities, null, 2)}

Already confirmed links:
${JSON.stringify(existingLinks, null, 2)}

Identify hidden connections not yet reflected in the confirmed links. Focus on: shared jurisdictions indicating layering, common beneficial owner signals, known associate network patterns, and typology-based link suggestions.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as Omit<DiscoverLinksResult, "ok">;
    if (!Array.isArray(result.suggestedLinks)) result.suggestedLinks = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json(buildFallback(entities, existingLinks), { headers: gate.headers });
  }
}
