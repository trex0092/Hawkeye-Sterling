// POST /api/ai-bias-monitor
//
// UNESCO Principle 3 (Fairness & Non-Discrimination): Monitors AML/CFT
// screening queues for demographic bias in AI-assisted risk scoring.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface SubjectInput {
  name: string;
  nationality?: string;
  riskScore: number;
  cddPosture?: string;
  status?: string;
  mostSerious?: string;
}

interface NationalityDistributionEntry {
  nationality: string;
  count: number;
  avgRiskScore: number;
  flag: string;
}

interface BiasMonitorResponse {
  biasRisk: "elevated" | "moderate" | "low";
  biasNarrative: string;
  nationalityDistribution: NationalityDistributionEntry[];
  potentialBiasIndicators: string[];
  falsePositiveRisk: string;
  recommendedActions: string[];
  unescoAlignment: string;
  monitoringFrequency: string;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content: AnthropicTextBlock[];
}

interface RequestBody {
  subjects: SubjectInput[];
}

const SYSTEM_PROMPT = `You are a UNESCO-aligned AI ethics auditor specializing in fairness and non-discrimination monitoring for AML/CFT screening systems. Analyze this screening queue for potential demographic bias in AI-assisted risk scoring, in accordance with UNESCO's Recommendation on the Ethics of AI (2021) Principle 3.

Output JSON (ONLY valid JSON, no markdown):
{
  "biasRisk": "elevated" | "moderate" | "low",
  "biasNarrative": "string — 2-3 sentence fairness assessment",
  "nationalityDistribution": [
    {
      "nationality": "string",
      "count": number,
      "avgRiskScore": number,
      "flag": "string — e.g. 'High average score may warrant review' or 'Normal distribution'"
    }
  ],
  "potentialBiasIndicators": ["string array — specific patterns that may indicate systematic bias"],
  "falsePositiveRisk": "string — assessment of whether common-name false positives skew results",
  "recommendedActions": ["string array — concrete steps to address any identified bias"],
  "unescoAlignment": "string — specific UNESCO Principle 3 alignment note",
  "monitoringFrequency": "string — recommended re-assessment frequency"
}`;

const FALLBACK: BiasMonitorResponse = {
  biasRisk: "low",
  biasNarrative: "API key not configured — manual bias review required.",
  nationalityDistribution: [],
  potentialBiasIndicators: [],
  falsePositiveRisk: "",
  recommendedActions: ["Manual demographic review of screening queue recommended"],
  unescoAlignment: "",
  monitoringFrequency: "Monthly",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subjects = body.subjects ?? [];

  writeAuditEvent("mlro", "ai.bias-monitor", "screening-queue");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ai-bias-monitor temporarily unavailable - please retry." }, { status: 503 });
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({ subjects, queueSize: subjects.length }),
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const raw = (data.content[0]?.text ?? "{}").trim();

    // Strip markdown fences before JSON.parse
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(stripped) as BiasMonitorResponse;

    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("mlro", "ai.bias-monitor.error", msg);
    return NextResponse.json({ ok: false, error: "ai-bias-monitor temporarily unavailable - please retry." }, { status: 503 });
  }
}
