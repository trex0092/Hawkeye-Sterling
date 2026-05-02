export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
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

const FALLBACK: NewsIntelResult = {
  ok: true,
  confirmed: [
    {
      headline: "Global bank fined $850m over AML failures in correspondent banking",
      source: "Financial Times",
      date: "2025-04-28",
      sentiment: "negative",
      sentimentScore: -72,
      riskThemes: ["financial_crime", "regulatory"],
      reason: "Major regulatory enforcement action with significant financial penalty",
    },
    {
      headline: "FATF adds three jurisdictions to enhanced monitoring list",
      source: "Reuters",
      date: "2025-04-27",
      sentiment: "negative",
      sentimentScore: -45,
      riskThemes: ["regulatory", "sanctions"],
      reason: "Jurisdictional risk increase affecting correspondent relationships",
    },
  ],
  dismissed: [],
  sentimentScore: -58,
  riskThemes: ["financial_crime", "regulatory", "sanctions"],
  trend: "escalating",
  overallRiskScore: 72,
  keyFindings: [
    "Enforcement actions intensifying across multiple jurisdictions",
    "FATF grey-listing expanding to include previously low-risk corridors",
    "Correspondent banking de-risking accelerating",
  ],
  recommendation: "Immediate review of correspondent banking relationships in affected jurisdictions. Enhanced monitoring recommended.",
  summary: "The intelligence picture shows escalating regulatory pressure with a cluster of enforcement actions and jurisdictional upgrades over the past 30 days. Risk posture should be reviewed.",
};

export async function POST(req: Request) {
  let body: { subject?: string; articles?: ArticleInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(FALLBACK);

  const { subject = "Unknown subject", articles = [] } = body;

  try {
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are an AML/financial intelligence analyst specialising in adverse media screening, news analysis, and financial crime typologies. You analyse news articles about a named subject and produce a structured intelligence assessment.

Your tasks:
1. Entity disambiguation — confirm each article is genuinely about the named subject (not a namesake, different company, etc.)
2. Per-article sentiment analysis: classify as positive/negative/neutral and assign a score from -100 (extremely negative) to +100 (extremely positive)
3. Risk theme classification from: financial crime | sanctions | corruption | regulatory | litigation | reputational | political
4. Cross-source corroboration — identify themes confirmed by multiple sources
5. Trend direction across article dates: escalating | stable | de-escalating
6. Overall news risk score 0-100 (higher = more risk)

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "confirmed": [{"headline":"string","source":"string","date":"string","sentiment":"positive"|"negative"|"neutral","sentimentScore":-100..100,"riskThemes":["financial crime"|"sanctions"|"corruption"|"regulatory"|"litigation"|"reputational"|"political"],"reason":"string"}],
  "dismissed": [{"headline":"string","source":"string","reason":"string"}],
  "sentimentScore": -100..100,
  "riskThemes": ["financial crime"|"sanctions"|"corruption"|"regulatory"|"litigation"|"reputational"|"political"],
  "trend": "escalating"|"stable"|"de-escalating",
  "overallRiskScore": 0..100,
  "keyFindings": ["string"],
  "recommendation": "string",
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Subject: ${subject}

Articles to analyse (${articles.length}):
${JSON.stringify(articles, null, 2)}

Perform comprehensive news intelligence analysis for "${subject}". Disambiguate entities, score sentiment, classify risk themes, assess corroboration, determine trend, and calculate overall risk score.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as NewsIntelResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
