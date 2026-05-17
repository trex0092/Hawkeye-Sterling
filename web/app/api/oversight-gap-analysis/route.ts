// POST /api/oversight-gap-analysis
//
// Runs a UAE AML compliance gap analysis against the current oversight queue.
// Accepts pending/escalated approvals, open circulars, and open action items;
// returns a structured gap analysis result via Claude Haiku.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a UAE AML compliance gap analyzer. Analyze the provided compliance queue and return ONLY this JSON: { "gaps": string[], "overdueItems": string[], "breachRisks": string[], "deadlines": string[], "recommendation": string }. gaps = compliance gaps identified (max 5). overdueItems = items past SLA or due date (max 5). breachRisks = items that could constitute regulatory breach if not resolved (max 3). deadlines = critical upcoming deadlines with dates (max 4). recommendation = 1-2 sentence top priority action for the MLRO.`;

interface GapAnalysisResult {
  gaps: string[];
  overdueItems: string[];
  breachRisks: string[];
  deadlines: string[];
  recommendation: string;
}

const GAP_FALLBACK = {
  gaps: [] as string[],
  summary: "AI analysis unavailable — manual gap review required.",
  fallback: true,
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "oversight-gap-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 , headers: gate.headers });
  }

  let result: GapAnalysisResult;
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(body) }],
    });
    const text = response.content.find((b: { type: string; text?: string }) => b.type === "text")?.text ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: "oversight-gap-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
    }
    result = JSON.parse(jsonMatch[0]) as GapAnalysisResult;
    if (!Array.isArray(result.gaps)) result.gaps = [];
    if (!Array.isArray(result.overdueItems)) result.overdueItems = [];
    if (!Array.isArray(result.breachRisks)) result.breachRisks = [];
    if (!Array.isArray(result.deadlines)) result.deadlines = [];
  } catch {
    return NextResponse.json({ ok: false, error: "oversight-gap-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  return NextResponse.json({ ok: true, result }, { headers: gate.headers });
}
