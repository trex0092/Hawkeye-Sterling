export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface MlroDecision {
  caseId: string;
  subject: string;
  matchScore: number;
  listName: string;
  mlroDecision: "true_positive" | "false_positive";
  decisionReason: string;
  clientType: string;
  jurisdiction: string;
  riskScore: number;
}

export interface FpPattern {
  pattern: string;
  fpPct: number;
  recommendation: string;
}

export interface ThresholdSuggestion {
  list: string;
  clientType: string;
  currentThreshold: number;
  suggestedThreshold: number;
  expectedFpReduction: number;
}

export interface FpAnalysisResult {
  ok: true;
  fpRate: number;
  tpRate: number;
  patterns: FpPattern[];
  thresholdSuggestions: ThresholdSuggestion[];
  systemicIssues: string[];
  estimatedTimeSaving: string;
  summary: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { decisions?: MlroDecision[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  if (!Array.isArray(body.decisions) || body.decisions.length === 0) {
    return NextResponse.json({ ok: false, error: "decisions must be a non-empty array" }, { status: 400, headers: gate.headers });
  }
  const decisions = body.decisions;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "fp-optimizer/analyze temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a machine learning expert specialising in AML sanctions screening optimisation for UAE financial institutions. Analyse historical MLRO (Money Laundering Reporting Officer) decisions to identify false positive patterns and suggest threshold optimisations.

Your task:
1. Calculate FP rate and TP rate from the decision history
2. Identify patterns in false positives (name patterns, client types, jurisdictions, list types)
3. Suggest threshold adjustments per list/client type combination
4. Flag systemic issues (e.g. common name patterns causing bulk FPs)
5. Estimate time savings from suggested optimisations

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "ok": true,
  "fpRate": number (percentage 0-100),
  "tpRate": number (percentage 0-100),
  "patterns": [
    {
      "pattern": "string (describe the FP pattern clearly)",
      "fpPct": number (percentage of this pattern that are FPs),
      "recommendation": "string (specific actionable recommendation)"
    }
  ],
  "thresholdSuggestions": [
    {
      "list": "string (sanctions list name)",
      "clientType": "string",
      "currentThreshold": number (0-100),
      "suggestedThreshold": number (0-100),
      "expectedFpReduction": number (percentage reduction)
    }
  ],
  "systemicIssues": ["string"],
  "estimatedTimeSaving": "string (e.g. '12.4 hours/month')",
  "summary": "string (executive summary, 3-4 sentences)"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Historical MLRO Decisions (${decisions.length} records):
${JSON.stringify(decisions, null, 2)}

Analyse these decisions to identify false positive patterns, suggest threshold optimisations, and flag systemic issues. Calculate the overall FP/TP rates and estimate time savings from improvements.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as FpAnalysisResult;
    if (!Array.isArray(result.patterns)) result.patterns = [];
    if (!Array.isArray(result.thresholdSuggestions)) result.thresholdSuggestions = [];
    if (!Array.isArray(result.systemicIssues)) result.systemicIssues = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "fp-optimizer/analyze temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
