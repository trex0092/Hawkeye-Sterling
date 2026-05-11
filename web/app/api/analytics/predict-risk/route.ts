export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
interface HistoricalData {
  strFilingsThisMonth?: number;
  avgRiskScore?: number;
  screeningHits?: number;
  eddCases?: number;
  slaBreaches?: number;
}

interface RiskPeriod {
  period: string;
  predictedScore: number;
  confidence: "high" | "medium" | "low";
}

interface Intervention {
  action: string;
  expectedImpact: string;
  urgency: "immediate" | "short-term" | "medium-term";
}

interface PredictRiskResult {
  ok: true;
  forecast: "Stable" | "Elevated" | "Critical Trajectory";
  riskTrajectory: RiskPeriod[];
  acceleratingRisks: string[];
  interventions: Intervention[];
  summary: string;
}

const FALLBACK: PredictRiskResult = {
  ok: true,
  forecast: "Stable",
  riskTrajectory: [
    { period: "30 days", predictedScore: 45, confidence: "medium" },
    { period: "60 days", predictedScore: 47, confidence: "medium" },
    { period: "90 days", predictedScore: 50, confidence: "low" },
  ],
  acceleratingRisks: ["Insufficient data for accurate prediction"],
  interventions: [
    {
      action: "Configure Anthropic API key to enable AI-powered risk prediction",
      expectedImpact: "Full predictive analytics capability",
      urgency: "immediate",
    },
  ],
  summary: "Anthropic API key not configured. Showing placeholder forecast.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { historicalData?: HistoricalData; timeframe?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const historicalData = body.historicalData ?? {};
  const timeframe = body.timeframe ?? "90";

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "analytics/predict-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: `You are a quantitative AML risk analyst specialising in predictive compliance modelling under FATF Recommendations, UAE FDL 10/2025, CBUAE AML Standards, and FinCEN guidance.

Your task: analyse the provided compliance KPI snapshot and predict the risk trajectory over the requested timeframe. Consider:

1. STR filing trends — rising filings indicate either better detection (positive) or worsening customer risk profile (negative context-dependent)
2. Average risk score trends — upward drift signals portfolio risk escalation
3. Screening hit rate — increasing hits may indicate new sanctions exposure
4. EDD case volume — growing EDD cases signal elevated risk across the portfolio
5. SLA breaches — operational failures increase regulatory and conduct risk
6. Correlation patterns — combinations of high hits + rising risk scores + SLA breaches are a Critical Trajectory signal
7. Regulatory calendar context — FATF plenary cycles, OFAC listing patterns, CBUAE inspection timing

Risk trajectory thresholds:
- "Stable": metrics flat or improving across all dimensions, no compounding factors
- "Elevated": 1-2 metrics deteriorating OR mild upward drift in risk score
- "Critical Trajectory": 3+ metrics deteriorating, or any single metric in alarming territory (e.g. SLA breaches >5%, risk score >75, hit rate >10%)

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "forecast": "Stable"|"Elevated"|"Critical Trajectory",
  "riskTrajectory": [
    {"period": "30 days", "predictedScore": number (0-100), "confidence": "high"|"medium"|"low"},
    {"period": "60 days", "predictedScore": number (0-100), "confidence": "high"|"medium"|"low"},
    {"period": "90 days", "predictedScore": number (0-100), "confidence": "high"|"medium"|"low"}
  ],
  "acceleratingRisks": ["string — specific risk category that is accelerating, e.g. 'Sanctions exposure: OFAC SDN list expansions targeting relevant jurisdictions'"],
  "interventions": [
    {
      "action": "string — specific, actionable intervention",
      "expectedImpact": "string — quantified or qualified expected reduction, e.g. 'Reduce SLA breach rate by ~40%'",
      "urgency": "immediate"|"short-term"|"medium-term"
    }
  ],
  "summary": "string — 3-4 sentences covering overall trajectory, primary drivers, biggest risk if unaddressed, and confidence level"
}

Always return exactly 3 interventions. The riskTrajectory must always have exactly 3 periods (30, 60, 90 days) regardless of the requested timeframe — include all three but weight the confidence scores by the requested timeframe.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Current compliance KPI snapshot:
- STR filings this month: ${historicalData.strFilingsThisMonth ?? "N/A"}
- Average risk score (portfolio): ${historicalData.avgRiskScore ?? "N/A"}
- Screening hits this month: ${historicalData.screeningHits ?? "N/A"}
- EDD cases open: ${historicalData.eddCases ?? "N/A"}
- SLA breaches this month: ${historicalData.slaBreaches ?? "N/A"}

Requested forecast timeframe: ${timeframe} days
Report date: ${new Date().toISOString().slice(0, 10)}

Predict the risk trajectory. Identify which categories are accelerating. Suggest 3 proactive interventions that would most materially reduce predicted risk, with expected impact quantified where possible.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PredictRiskResult;
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "analytics/predict-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
