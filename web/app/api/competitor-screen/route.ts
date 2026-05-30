// POST /api/competitor-screen
//
// Typology & peer comparison. Given a subject's name, industry, and
// jurisdiction, generates a peer-group risk comparison using Claude.
// Backs the "Typology / Peer Comparison" panel in DeepIntelPanel.tsx.
//
// Body: { subjectName?, name?, entityType?, industry, jurisdiction }
// Response: {
//   ok: true,
//   competitors: [{ name, riskScore, riskLevel, jurisdiction, flags, similarity }],
//   peerGroupAvgRisk: number,
//   peerGroupRiskLevel: string,
//   methodology: string
// }

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
  subjectName?: string;
  name?: string;
  entityType?: string;
  industry?: string;
  jurisdiction?: string;
}

interface Competitor {
  name: string;
  riskScore: number;
  riskLevel: string;
  jurisdiction: string;
  flags: string[];
  similarity: number;
}

interface ParsedPayload {
  competitors?: Competitor[];
  peerGroupAvgRisk?: number;
  peerGroupRiskLevel?: string;
  methodology?: string;
}

const DEGRADED: { ok: true; competitors: Competitor[]; peerGroupAvgRisk: number; peerGroupRiskLevel: string; methodology: string; degraded: true } = {
  ok: true,
  competitors: [],
  peerGroupAvgRisk: 0,
  peerGroupRiskLevel: "unknown",
  methodology: "Peer comparison unavailable — AI service offline",
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

  const subjectName = sanitizeField(body.subjectName ?? body.name, 200);
  const entityType = sanitizeField(body.entityType, 80);
  const industry = sanitizeField(body.industry, 100);
  const jurisdiction = sanitizeField(body.jurisdiction, 100);

  const prompt = `You are an AML typology analyst. Generate a peer-group comparison for a subject in the "${industry || "unknown"}" industry operating in "${jurisdiction || "unknown"}", entity type "${entityType || "unknown"}".

Return ONLY a JSON object (no prose, no markdown fences):
{
  "competitors": [
    {
      "name": "<representative peer name — generic, not a real named entity>",
      "riskScore": <integer 0–100>,
      "riskLevel": "low" | "medium" | "high" | "critical",
      "jurisdiction": "<country>",
      "flags": ["<AML flag 1>", "<AML flag 2>"],
      "similarity": <float 0.0–1.0 — similarity to subject>
    }
  ],
  "peerGroupAvgRisk": <integer 0–100>,
  "peerGroupRiskLevel": "low" | "medium" | "high" | "critical",
  "methodology": "<one sentence describing comparison basis>"
}

Rules:
- Generate 3–5 representative peers typical for this industry/jurisdiction.
- Use generic industry descriptions as names (e.g. "Mid-size UAE bullion dealer", "Regional DPMS operator").
- peerGroupAvgRisk: arithmetic mean of competitor risk scores.
- flags: 2 realistic AML risk flags per peer appropriate to the sector.
- methodology: cite the typology framework used (e.g. FATF Guidance on DPMS, MENAFATF sector risk).`;

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

    let parsed: ParsedPayload = {};
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1)) as ParsedPayload;
    } catch {
      return NextResponse.json(DEGRADED, { headers: gate.headers });
    }

    void writeAuditChainEntry(
      { event: "screening.competitor", actor: gate.keyId, subjectName: subjectName?.slice(0, 40), industry, jurisdiction, peersCount: parsed.competitors?.length ?? 0 },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] competitor-screen:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json(
      {
        ok: true,
        competitors: parsed.competitors ?? [],
        peerGroupAvgRisk: parsed.peerGroupAvgRisk ?? 0,
        peerGroupRiskLevel: parsed.peerGroupRiskLevel ?? "unknown",
        methodology: parsed.methodology ?? "Peer comparison generated via AI typology analysis",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error("[competitor-screen]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(DEGRADED, { headers: gate.headers });
  }
}
