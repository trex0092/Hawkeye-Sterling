// POST /api/adverse-media
// Weaponized adverse-media pipeline:
//   1. Fetch from Taranis AI (live OSINT news feed)
//   2. Classify each item against the 737-keyword taxonomy (12 categories)
//   3. Map to FATF predicate offenses + reasoning modes
//   4. Score severity (critical/high/medium/low/clear)
//   5. Evaluate SAR trigger (FATF R.20)
//   6. Generate MLRO investigation narrative
//
// Returns a full AdverseMediaSubjectVerdict — MLRO-grade intelligence report.
//
// Body: { subject: string, dateFrom?: string, dateTo?: string, limit?: number, minRelevance?: number }

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { searchAdverseMedia } from "../../../../dist/src/integrations/taranisAi.js";
import { analyseAdverseMediaResult } from "../../../../dist/src/brain/adverse-media-analyser.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface AdverseMediaBody {
  subject: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  minRelevance?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: AdverseMediaBody;
  try {
    body = (await req.json()) as AdverseMediaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400, headers: CORS });
  }

  const subject = body.subject.trim();

  const taranisResult = await searchAdverseMedia(subject, {
    ...(body.dateFrom !== undefined ? { dateFrom: body.dateFrom } : {}),
    ...(body.dateTo !== undefined ? { dateTo: body.dateTo } : {}),
    limit: body.limit ?? 50,
    minRelevance: body.minRelevance ?? 0,
  });

  if (!taranisResult.ok) {
    if (!taranisResult.error?.includes("not configured")) {
      console.error("[adverse-media] Taranis error:", taranisResult.error);
      // Taranis upstream failure — fall back to Claude-powered assessment
      const verdict = await claudeAdverseMedia(subject);
      return NextResponse.json({ ok: true, totalCount: verdict.totalItems, adverseCount: verdict.adverseItems, highRelevanceCount: verdict.criticalCount + verdict.highCount, verdict, note: "Taranis unavailable — Claude fallback used" }, { status: 200, headers: { ...CORS, ...gateHeaders } });
    }
    // Taranis not configured — fall back to Claude-powered adverse media assessment
    const verdict = await claudeAdverseMedia(subject);
    return NextResponse.json({ ok: true, totalCount: verdict.totalItems, adverseCount: verdict.adverseItems, highRelevanceCount: verdict.criticalCount + verdict.highCount, verdict }, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  // Run the weaponized analyser — full MLRO-grade intelligence pipeline
  const verdict = analyseAdverseMediaResult(subject, taranisResult);

  return NextResponse.json(
    {
      ok: true,
      // Raw Taranis counts for backward compat
      totalCount: taranisResult.totalCount,
      adverseCount: taranisResult.adverseCount,
      highRelevanceCount: taranisResult.highRelevanceCount,
      // Weaponized analysis
      verdict,
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}

async function claudeAdverseMedia(subject: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = getAnthropicClient(apiKey, 55_000);
  const now = new Date().toISOString();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `You are an MLRO adverse-media intelligence system. Assess "${subject}" for adverse media, sanctions, fraud, money laundering, enforcement actions, or reputational risk based on publicly known information.

Return ONLY valid JSON matching this exact shape (no markdown, no explanation):
{
  "subject": "${subject}",
  "riskTier": "clear|low|medium|high|critical",
  "riskDetail": "one sentence summary",
  "totalItems": number,
  "adverseItems": number,
  "criticalCount": number,
  "highCount": number,
  "mediumCount": number,
  "lowCount": number,
  "sarRecommended": boolean,
  "sarBasis": "reason or N/A",
  "confidenceTier": "high|medium|low",
  "confidenceBasis": "basis for confidence level",
  "counterfactual": "what would change the assessment",
  "investigationLines": ["line1", "line2"],
  "findings": [
    {
      "itemId": "1",
      "title": "headline",
      "source": "source name",
      "published": "YYYY-MM-DD",
      "severity": "critical|high|medium|low|clear",
      "categories": ["category"],
      "keywords": ["keyword"],
      "fatfRecommendations": ["R.20"],
      "fatfPredicates": ["predicate"],
      "reasoningModes": ["mode"],
      "narrative": "brief narrative",
      "relevanceScore": 0.8,
      "isSarCandidate": false
    }
  ],
  "fatfRecommendations": ["R.20"],
  "categoryBreakdown": [{"categoryId":"sanctions","displayName":"Sanctions","count":0,"severity":"clear"}],
  "analysedAt": "${now}",
  "modesCited": ["mode"]
}`,
    }],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean) as ReturnType<typeof analyseAdverseMediaResult>;
}
