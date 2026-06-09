// POST /api/disposition-predict
//
// Heuristic ML disposition predictor. Given a subject's risk profile
// (score, jurisdiction, entityType, adverse-media hits, PEP tier),
// returns 3-4 disposition probabilities + a primary recommendation and
// regulatory basis. Backs the "ML Disposition Predictor" panel in
// DeepIntelPanel.tsx.
//
// Body: { score, jurisdiction, entityType, industry, amHits, pepTier }
// Response: {
//   ok: true,
//   predictions: [{ disposition, probability, confidence, drivers }],
//   primaryRecommendation: string,
//   regulatoryBasis: string
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
  score?: number;
  jurisdiction?: string;
  entityType?: string;
  industry?: string;
  amHits?: number;
  pepTier?: string;
}

interface Prediction {
  disposition: string;
  probability: number;
  confidence: string;
  drivers: string[];
}

const DEGRADED_PAYLOAD = {
  ok: true as const,
  predictions: [
    { disposition: "manual-review", probability: 1, confidence: "low", drivers: ["AI analysis unavailable"] },
  ],
  primaryRecommendation: "Refer to senior MLRO for manual disposition decision.",
  regulatoryBasis: "Federal Decree-Law No. (10) of 2025 Art.18 — risk-based due diligence",
  degraded: true,
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(DEGRADED_PAYLOAD, { headers: gate.headers });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const score = Number(body.score ?? 50);
  const jurisdiction = sanitizeField(body.jurisdiction, 100);
  const entityType = sanitizeField(body.entityType, 80);
  const industry = sanitizeField(body.industry, 100);
  const amHits = Number(body.amHits ?? 0);
  const pepTier = sanitizeField(body.pepTier, 50);

  const prompt = `You are an AML disposition expert for UAE-regulated financial institutions. Given the following subject risk profile, produce a JSON disposition analysis.

Risk profile:
- Composite risk score: ${score}/100
- Jurisdiction: ${jurisdiction || "unknown"}
- Entity type: ${entityType || "unknown"}
- Industry/sector: ${industry || "unknown"}
- Adverse media hits: ${amHits}
- PEP tier: ${pepTier || "none"}

Produce ONLY a single JSON object (no prose, no markdown fences) matching this schema exactly:
{
  "predictions": [
    {
      "disposition": "clear" | "flag-for-review" | "escalate-to-mlro" | "block",
      "probability": <float 0.0–1.0, probabilities must sum to 1.0>,
      "confidence": "high" | "medium" | "low",
      "drivers": ["<key driver 1>", "<key driver 2>"]
    }
  ],
  "primaryRecommendation": "<single concise action sentence>",
  "regulatoryBasis": "<UAE FDL / FATF article reference>"
}

Rules:
- Include all four dispositions; assign realistic probabilities based on the profile.
- High score (≥70) or PEP tier 1 → escalate/block must have highest combined probability.
- drivers: 2–3 bullet factors that most influenced each disposition.
- regulatoryBasis: cite the single most relevant UAE Federal Decree-Law No. (10) of 2025 or FATF Recommendation.`;

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

    let parsed: { predictions?: Prediction[]; primaryRecommendation?: string; regulatoryBasis?: string } = {};
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1)) as typeof parsed;
    } catch {
      return NextResponse.json(DEGRADED_PAYLOAD, { headers: gate.headers });
    }

    void writeAuditChainEntry(
      { event: "disposition.predict", actor: gate.keyId, score, entityType, jurisdiction, predictionsCount: parsed.predictions?.length ?? 0 },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] disposition.predict:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json(
      {
        ok: true,
        predictions: parsed.predictions ?? DEGRADED_PAYLOAD.predictions,
        primaryRecommendation: parsed.primaryRecommendation ?? DEGRADED_PAYLOAD.primaryRecommendation,
        regulatoryBasis: parsed.regulatoryBasis ?? DEGRADED_PAYLOAD.regulatoryBasis,
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error("[disposition-predict]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(DEGRADED_PAYLOAD, { headers: gate.headers });
  }
}
