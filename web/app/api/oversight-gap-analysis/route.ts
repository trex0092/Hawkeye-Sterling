// POST /api/oversight-gap-analysis
//
// Runs a UAE AML compliance gap analysis against the current oversight queue.
// Accepts pending/escalated approvals, open circulars, and open action items;
// returns a structured gap analysis result via Claude Haiku.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `You are a UAE AML compliance gap analyzer. Analyze the provided compliance queue and return ONLY this JSON: { "gaps": string[], "overdueItems": string[], "breachRisks": string[], "deadlines": string[], "recommendation": string }. gaps = compliance gaps identified (max 5). overdueItems = items past SLA or due date (max 5). breachRisks = items that could constitute regulatory breach if not resolved (max 3). deadlines = critical upcoming deadlines with dates (max 4). recommendation = 1-2 sentence top priority action for the MLRO.`;

interface GapAnalysisResult {
  gaps: string[];
  overdueItems: string[];
  breachRisks: string[];
  deadlines: string[];
  recommendation: string;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content: AnthropicTextBlock[];
}

const GAP_FALLBACK = {
  gaps: [] as string[],
  summary: "AI analysis unavailable — manual gap review required.",
  fallback: true,
};

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: true, ...GAP_FALLBACK });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(body) }],
      }),
    });
  } catch {
    return NextResponse.json({ ok: true, ...GAP_FALLBACK });
  }

  if (!anthropicRes.ok) {
    return NextResponse.json({ ok: true, ...GAP_FALLBACK });
  }

  let result: GapAnalysisResult;
  try {
    const data = (await anthropicRes.json()) as AnthropicResponse;
    const text = data.content.find((b) => b.type === "text")?.text ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: true, ...GAP_FALLBACK });
    }
    result = JSON.parse(jsonMatch[0]) as GapAnalysisResult;
  } catch {
    return NextResponse.json({ ok: true, ...GAP_FALLBACK });
  }

  return NextResponse.json({ ok: true, result });
}
