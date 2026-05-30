export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface TypologyDetailResult {
  name: string;
  category: string;
  fullDescription: string;
  historicalBackground: string;
  mlProcess: Array<{
    step: number;
    phase: "placement" | "layering" | "integration";
    action: string;
    detail: string;
  }>;
  caseStudy: {
    title: string;
    jurisdiction: string;
    year: string;
    summary: string;
    outcome: string;
    lessonsLearned: string[];
  };
  detectionTechniques: Array<{
    technique: string;
    description: string;
    effectiveness: "high" | "medium" | "low";
  }>;
  regulatoryGuidance: Array<{
    body: string;
    reference: string;
    requirement: string;
  }>;
  relatedTypologies: string[];
  preventionMeasures: string[];
  estimatedGlobalVolume: string;
  trendDirection: "increasing" | "stable" | "decreasing";
  uaeRelevance: string;
}

const DEEP_DIVE_SYSTEM = `You are the world's leading expert on AML/CFT financial crime typologies with 30 years of experience across FATF, FinCEN, UAE FIU, Interpol, and major international banks. You have written definitive guidance on hundreds of money laundering typologies.

For any given typology name, provide an exhaustive deep-dive analysis covering:
- Historical background and evolution
- The complete money laundering process (placement, layering, integration phases)
- A detailed real case study
- Detection techniques with effectiveness ratings
- Regulatory guidance from multiple bodies
- UAE-specific relevance and examples
- Trend analysis

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "name": "string",
  "category": "string",
  "fullDescription": "string (4-6 sentences)",
  "historicalBackground": "string (3-5 sentences covering origin and evolution)",
  "mlProcess": [
    {
      "step": 1,
      "phase": "placement"|"layering"|"integration",
      "action": "string (short title)",
      "detail": "string (2-3 sentences explaining this step)"
    }
  ],
  "caseStudy": {
    "title": "string",
    "jurisdiction": "string",
    "year": "string",
    "summary": "string (4-6 sentences)",
    "outcome": "string (2-3 sentences)",
    "lessonsLearned": ["string"]
  },
  "detectionTechniques": [
    {
      "technique": "string",
      "description": "string",
      "effectiveness": "high"|"medium"|"low"
    }
  ],
  "regulatoryGuidance": [
    {
      "body": "string",
      "reference": "string",
      "requirement": "string"
    }
  ],
  "relatedTypologies": ["string"],
  "preventionMeasures": ["string"],
  "estimatedGlobalVolume": "string",
  "trendDirection": "increasing"|"stable"|"decreasing",
  "uaeRelevance": "string (2-3 sentences specific to UAE context)"
}`;


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { typologyName?: string };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "typology-library/detail temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: DEEP_DIVE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Provide a comprehensive deep-dive analysis of this AML/CFT typology: "${sanitizeField(body.typologyName ?? "Trade Invoice Fraud", 200)}"\n\nInclude historical background, step-by-step ML process (at least 4-6 steps across placement/layering/integration phases), a detailed real case study, detection techniques, and regulatory guidance. Make it expert-level and comprehensive.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TypologyDetailResult;
    if (!Array.isArray(result.mlProcess)) result.mlProcess = [];
    if (!Array.isArray(result.detectionTechniques)) result.detectionTechniques = [];
    if (!Array.isArray(result.regulatoryGuidance)) result.regulatoryGuidance = [];
    if (!Array.isArray(result.relatedTypologies)) result.relatedTypologies = [];
    if (!Array.isArray(result.preventionMeasures)) result.preventionMeasures = [];
    void writeAuditChainEntry(
      {
        event: "typology_detail_retrieved",
        actor: gate.keyId,
        typologyName: result.name,
        category: result.category,
        trendDirection: result.trendDirection,
      },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "typology-library/detail temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
