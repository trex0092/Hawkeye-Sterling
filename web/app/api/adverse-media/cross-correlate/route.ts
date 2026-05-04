export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export type CrossCorrelateTheme =
  | "fraud"
  | "sanctions"
  | "corruption"
  | "money_laundering"
  | "terrorism"
  | "regulatory";

export interface CrossCorrelateArticle {
  source: string;
  headline: string;
  date: string;
  snippet: string;
}

export interface CrossCorrelateResult {
  ok: true;
  confirmed: CrossCorrelateArticle[];
  dismissed: CrossCorrelateArticle[];
  themes: Record<string, CrossCorrelateArticle[]>;
  trend: "worsening" | "stable" | "improving";
  score: number;
  themeScores: Record<string, number>;
  recommendation: "Clear" | "Monitor" | "EDD" | "Exit Relationship" | "File STR";
  summary: string;
}

const FALLBACK: CrossCorrelateResult = {
  ok: true,
  confirmed: [],
  dismissed: [],
  themes: {},
  trend: "stable",
  score: 0,
  themeScores: {},
  recommendation: "Monitor",
  summary: "Unable to reach AI service — results are unavailable. Please retry.",
};

export async function POST(req: Request) {
  let body: { subjectName?: string; articles?: CrossCorrelateArticle[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { subjectName, articles } = body;
  if (!subjectName || !articles?.length) {
    return NextResponse.json(
      { ok: false, error: "subjectName and articles are required" },
      { status: 400 },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "adverse-media/cross-correlate temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a senior AML analyst specialising in adverse media analysis, entity disambiguation, and financial crime risk assessment. Your task is to:

1. DISAMBIGUATE: Determine which articles genuinely refer to the named subject vs. coincidental name-matches (same name, different person/entity).
2. THEME: Group confirmed articles by theme. Use exactly these theme keys: fraud, sanctions, corruption, money_laundering, terrorism, regulatory.
3. TREND: Assess whether the adverse media picture is worsening (recent articles are more serious), stable, or improving (older articles, situation resolved).
4. SCORE: Compute an overall adverse media score 0–100. Also provide a score per theme (0–100).
5. RECOMMEND: Based on score and themes, recommend one of: "Clear" (score <20, no serious themes), "Monitor" (score 20–39), "EDD" (score 40–59), "Exit Relationship" (score 60–79 with serious themes or confirmed sanctions/corruption), "File STR" (score ≥80 or confirmed terrorism/ML).

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "confirmed": [{"source":"string","headline":"string","date":"string","snippet":"string"}],
  "dismissed": [{"source":"string","headline":"string","date":"string","snippet":"string"}],
  "themes": {
    "fraud": [{"source":"string","headline":"string","date":"string","snippet":"string"}],
    "sanctions": [],
    "corruption": [],
    "money_laundering": [],
    "terrorism": [],
    "regulatory": []
  },
  "trend": "worsening"|"stable"|"improving",
  "score": 0-100,
  "themeScores": {"fraud":0-100,"sanctions":0-100,"corruption":0-100,"money_laundering":0-100,"terrorism":0-100,"regulatory":0-100},
  "recommendation": "Clear"|"Monitor"|"EDD"|"Exit Relationship"|"File STR",
  "summary": "string — 2-3 sentence narrative of findings"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Subject name: ${subjectName}

Articles to analyse (${articles.length} total):
${JSON.stringify(articles, null, 2)}

Perform entity disambiguation, theme grouping, trend analysis, score computation (0–100), and action recommendation. Return JSON only.`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as CrossCorrelateResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "adverse-media/cross-correlate temporarily unavailable - please retry." }, { status: 503 });
  }
}
