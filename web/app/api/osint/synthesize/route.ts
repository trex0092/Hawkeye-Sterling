export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface SynthesisSource {
  source: string;
  content: string;
  date?: string;
}

export type SubjectType = "individual" | "corporate" | "vessel" | "account";
export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";

export interface OsintSynthesisResult {
  ok: true;
  profile: string;
  corroborating: string[];
  contradicting: string[];
  confidenceScore: number;
  intelligenceGaps: string[];
  threatLevel: ThreatLevel;
  assessment: string;
  recommendedActions: string[];
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subject?: string;
    sources?: SynthesisSource[];
    subjectType?: SubjectType;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  if (!body.subject || !body.sources || body.sources.length === 0) {
    return NextResponse.json({ ok: false, error: "subject and sources are required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "osint/synthesize temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  const sourcesText = body.sources
    .map(
      (s, i) =>
        `--- Source ${i + 1}: ${s.source}${s.date ? ` (${s.date})` : ""} ---\n${s.content}`
    )
    .join("\n\n");

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a senior intelligence analyst specialising in open-source intelligence (OSINT) synthesis for AML/CFT compliance. Your role is to synthesise multi-source intelligence into a coherent subject profile, identify corroborating and contradicting signals, assess confidence and threat level, and detect intelligence gaps.

Return ONLY valid JSON with this exact structure (no markdown fences, no commentary):
{
  "ok": true,
  "profile": "Coherent narrative profile of the subject based on all sources (2-4 sentences)",
  "corroborating": ["Signal that multiple sources agree on", "..."],
  "contradicting": ["Discrepancy or contradiction between sources", "..."],
  "confidenceScore": 0-100,
  "intelligenceGaps": ["Gap description e.g. 'No beneficial owner data found'", "..."],
  "threatLevel": "none"|"low"|"medium"|"high"|"critical",
  "assessment": "Structured intelligence assessment narrative (3-5 sentences) including threat rationale",
  "recommendedActions": ["Action step 1", "Action step 2", "..."]
}

Scoring guidance:
- confidenceScore: 0-20 = minimal, 21-40 = low, 41-60 = moderate, 61-80 = high, 81-100 = very high
- threatLevel: none = clean / no indicators; low = minor concerns; medium = notable red flags requiring monitoring; high = significant AML/sanctions risk; critical = immediate action required
- corroborating: signals where two or more sources independently agree
- contradicting: signals where sources conflict or contradict each other
- intelligenceGaps: types of intelligence absent from the provided sources`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Subject: ${sanitizeField(body.subject, 500)}
Subject Type: ${sanitizeField(body.subjectType, 100) ?? "individual"}

Intelligence Sources (${body.sources.length} total):

${sourcesText}

Synthesise all source intelligence into a coherent subject profile. Identify corroborating signals, contradictions, intelligence gaps, and provide a structured assessment with recommended actions.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as OsintSynthesisResult;
    if (!Array.isArray(result.corroborating)) result.corroborating = [];
    if (!Array.isArray(result.contradicting)) result.contradicting = [];
    if (!Array.isArray(result.intelligenceGaps)) result.intelligenceGaps = [];
    if (!Array.isArray(result.recommendedActions)) result.recommendedActions = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "osint/synthesize temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
