export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export type RiskTheme =
  | "financial_crime"
  | "sanctions"
  | "corruption"
  | "regulatory"
  | "litigation"
  | "reputational"
  | "political";

export type TrendDirection = "escalating" | "stable" | "de-escalating";

export interface ArticleInput {
  source: string;
  headline: string;
  date: string;
  content: string;
  language?: string;
}

export interface AnalyzedArticle {
  headline: string;
  source: string;
  date: string;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number; // -100 to +100
  riskThemes: RiskTheme[];
  reason: string;
}

export interface NewsIntelResult {
  ok: true;
  confirmed: AnalyzedArticle[];
  dismissed: Array<{ headline: string; source: string; reason: string }>;
  sentimentScore: number; // -100 to +100 aggregate
  riskThemes: RiskTheme[];
  trend: TrendDirection;
  overallRiskScore: number; // 0-100
  keyFindings: string[];
  recommendation: string;
  summary: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { subject?: string; articles?: ArticleInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "news-intel/analyze temporarily unavailable - please retry." }, { status: 503 });

  const { subject = "Unknown subject", articles = [] } = body;

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are an AML/financial intelligence analyst specialising in adverse media screening. Analyse news articles about a named subject and produce a structured intelligence assessment. Return ONLY valid JSON with the NewsIntelResult structure (no markdown fences).`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Subject: ${subject}

Articles to analyse (${articles.length}):
${JSON.stringify(articles, null, 2)}

Perform comprehensive news intelligence analysis for "${subject}".`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as NewsIntelResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "news-intel/analyze temporarily unavailable - please retry." }, { status: 503 });
  }
}
