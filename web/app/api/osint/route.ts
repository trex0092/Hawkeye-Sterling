// POST /api/osint
//
// OSINT gateway — general-purpose OSINT lookup with focus selection.
// Currently handles focus="social_media" (social media identity analysis).
// Backs the "Social Media Identity Analysis" panel in DeepIntelPanel.tsx.
//
// Body: { name, entityType, focus }
// Response: { ok: true, ...analysisFields }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";
const BUDGET_MS = 4_500;

interface Body {
  name?: string;
  entityType?: string;
  focus?: string;
}

const DEGRADED = {
  ok: true as const,
  focus: "unknown",
  summary: "OSINT analysis unavailable — AI service offline",
  findings: [] as string[],
  riskIndicators: [] as string[],
  degraded: true,
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(DEGRADED, { headers: gate.headers });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const name = sanitizeField(body.name, 200);
  const entityType = sanitizeField(body.entityType, 80);
  const focus = sanitizeField(body.focus, 80) || "general";

  let prompt: string;

  if (focus === "social_media") {
    prompt = `You are an OSINT analyst specialising in social media identity verification for AML/CFT investigations. Analyse the social media footprint of "${name || "unknown"}" (entity type: ${entityType || "unknown"}).

Return ONLY a JSON object (no prose, no markdown fences):
{
  "focus": "social_media",
  "summary": "<2-sentence overall social media risk summary>",
  "platforms": [
    {
      "platform": "<e.g. LinkedIn / X / Instagram>",
      "presenceConfidence": "confirmed" | "likely" | "possible" | "none",
      "accountAgeEstimate": "<e.g. 5+ years>",
      "followerAuthenticity": "high" | "medium" | "low" | "unknown",
      "riskNotes": "<1-sentence platform-specific note>"
    }
  ],
  "findings": ["<key finding 1>", "<key finding 2>", "<key finding 3>"],
  "riskIndicators": ["<AML/CFT risk indicator 1>", "<indicator 2>"],
  "narrativeConsistency": "consistent" | "inconsistent" | "insufficient-data",
  "botnetMarkers": true | false,
  "politicalMessagingFlags": true | false
}

Rules:
- If entity type is a corporation, focus on LinkedIn and corporate social presence.
- narrativeConsistency: whether stated business/professional history across platforms matches the risk profile.
- Be conservative — flag "unknown" where data would require actual platform queries.`;
  } else {
    prompt = `You are an OSINT analyst. Conduct a general open-source intelligence assessment for "${name || "unknown"}" (entity type: ${entityType || "unknown"}, focus: ${focus}).

Return ONLY a JSON object (no prose, no markdown fences):
{
  "focus": "${focus}",
  "summary": "<2-sentence OSINT summary>",
  "findings": ["<key finding 1>", "<key finding 2>", "<key finding 3>"],
  "riskIndicators": ["<AML/CFT risk indicator 1>", "<indicator 2>"],
  "confidence": "high" | "medium" | "low"
}`;
  }

  try {
    const client = getAnthropicClient(apiKey, BUDGET_MS);
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { type: string; text?: string }) => c.text ?? "")
      .join("");

    let parsed: Record<string, unknown> = {};
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
    } catch {
      return NextResponse.json(DEGRADED, { headers: gate.headers });
    }

    void writeAuditChainEntry(
      { event: "osint.social-media", actor: gate.keyId, subjectName: name?.slice(0, 40), entityType, focus },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] osint:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.error("[osint]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(DEGRADED, { headers: gate.headers });
  }
}
