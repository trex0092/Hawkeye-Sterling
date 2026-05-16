// POST /api/analytics-insights
//
// AI-generated compliance insights for the analytics dashboard.
// Analyzes KPIs for UAE-licensed DPMS/VASP and provides MLRO/Board guidance.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface KpiInput {
  totalScreenings?: number;
  criticalHits?: number;
  strFiled?: number;
  pepCount?: number;
  sanctionsHits?: number;
  avgRiskScore?: number;
  eddCount?: number;
  overdueReviews?: number;
}

interface InsightItem {
  finding: string;
  implication: string;
  action: string;
  urgency: "immediate" | "this_month" | "quarterly";
}

interface AnalyticsInsightsResponse {
  headline: string;
  riskTrend: "deteriorating" | "stable" | "improving";
  insights: InsightItem[];
  regulatoryExposure: string;
  boardTalkingPoints: string[];
  benchmarkComment: string;
}

interface RequestBody {
  kpis: KpiInput;
  period?: string;
}

const SYSTEM_PROMPT = `You are a UAE AML compliance analytics expert. Analyze these compliance KPIs for a UAE-licensed DPMS/VASP and provide actionable insights for the MLRO and Board.

Return ONLY a JSON object with this exact structure:
{
  "headline": "string — one sentence that captures the most important takeaway",
  "riskTrend": "deteriorating",
  "insights": [
    {
      "finding": "string — specific finding from the data",
      "implication": "string — what this means for compliance",
      "action": "string — recommended action",
      "urgency": "immediate"
    }
  ],
  "regulatoryExposure": "string — what regulatory provisions are at risk based on these numbers",
  "boardTalkingPoints": ["string array — 3 bullet points suitable for board reporting"],
  "benchmarkComment": "string — how this compares to typical UAE DPMS/VASP compliance posture"
}

riskTrend must be one of: "deteriorating", "stable", "improving".
urgency must be one of: "immediate", "this_month", "quarterly".
Provide exactly 3 boardTalkingPoints and 2-4 insights.`;

const FALLBACK: AnalyticsInsightsResponse = {
  headline: "API key not configured",
  riskTrend: "stable",
  insights: [],
  regulatoryExposure: "",
  boardTalkingPoints: [],
  benchmarkComment: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 , headers: gate.headers });
  }

  const kpis = body.kpis ?? {};
  const period = body.period ?? "current";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writeAuditEvent("analyst", "analytics.ai-insights", `no-api-key — period: ${period}`);
    return NextResponse.json({ ok: false, error: "analytics-insights temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ kpis, period }),
        },
      ],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();

    // Strip markdown fences before JSON.parse
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(stripped) as AnalyticsInsightsResponse;
    if (!Array.isArray(parsed.insights)) parsed.insights = [];
    if (!Array.isArray(parsed.boardTalkingPoints)) parsed.boardTalkingPoints = [];

    writeAuditEvent(
      "analyst",
      "analytics.ai-insights",
      `period: ${period} · trend: ${parsed.riskTrend} · insights: ${(parsed.insights ?? []).length}`,
    );

    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("analyst", "analytics.ai-insights", `error — ${msg}`);
    return NextResponse.json({ ok: false, error: "analytics-insights temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
