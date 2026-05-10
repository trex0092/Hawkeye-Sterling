// POST /api/ongoing-monitor-ai
//
// AI pattern analysis for the ongoing monitoring portfolio under
// FDL 10/2025 Art.11 and FATF R.10/R.12.  Detects escalating risk
// patterns, cadence mismatches, and subjects requiring MLRO escalation.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface SubjectInput {
  id: string;
  name: string;
  tier: string;
  cadence: string;
  status: string;
  lastRun: string;
  nextDue: string;
  notes: string;
}

interface AlertResult {
  subjectId: string;
  subjectName: string;
  alertType: "overdue_escalation" | "cadence_mismatch" | "pattern_detected" | "tier_upgrade_recommended" | "immediate_review_required";
  severity: "critical" | "high" | "medium";
  description: string;
  recommendedAction: string;
  regulatoryBasis: string;
}

interface CadenceRecommendation {
  subjectId: string;
  currentCadence: string;
  recommendedCadence: string;
  reason: string;
}

interface MonitorAlertsResponse {
  alerts: AlertResult[];
  portfolioHealth: "healthy" | "attention_required" | "critical";
  immediateEscalations: string[];
  cadenceRecommendations: CadenceRecommendation[];
  summary: string;
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

const SYSTEM_PROMPT = `You are a UAE AML compliance analyst reviewing the ongoing monitoring portfolio. Analyze all monitored subjects for: escalating risk patterns (subjects overdue multiple cycles), behavioral anomalies based on tier mismatch (high-risk subject on weekly instead of daily cadence), subjects whose notes suggest increased risk, and subjects that should be escalated to MLRO review. This is ongoing monitoring under FDL 10/2025 Art.11 and FATF R.10/R.12.

Return ONLY a JSON object with this exact structure:
{
  "alerts": [
    {
      "subjectId": "string",
      "subjectName": "string",
      "alertType": "overdue_escalation" | "cadence_mismatch" | "pattern_detected" | "tier_upgrade_recommended" | "immediate_review_required",
      "severity": "critical" | "high" | "medium",
      "description": "string — specific finding",
      "recommendedAction": "string",
      "regulatoryBasis": "string"
    }
  ],
  "portfolioHealth": "healthy" | "attention_required" | "critical",
  "immediateEscalations": ["string array of subject names"],
  "cadenceRecommendations": [{"subjectId": "string", "currentCadence": "string", "recommendedCadence": "string", "reason": "string"}],
  "summary": "string — 2-sentence monitoring portfolio assessment"
}`;

const FALLBACK: MonitorAlertsResponse = {
  alerts: [],
  portfolioHealth: "healthy",
  immediateEscalations: [],
  cadenceRecommendations: [],
  summary: "API key not configured",
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

  if (subjects.length === 0) {
    writeAuditEvent("mlro", "ongoing-monitor.ai-analysis", "no subjects — skipped");
    return NextResponse.json({ ok: false, error: "ongoing-monitor-ai temporarily unavailable - please retry." }, { status: 503 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writeAuditEvent("mlro", "ongoing-monitor.ai-analysis", `no-api-key — ${subjects.length} subjects skipped`);
    return NextResponse.json({ ok: false, error: "ongoing-monitor-ai temporarily unavailable - please retry." }, { status: 503 });
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify(subjects),
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

    const parsed = JSON.parse(stripped) as MonitorAlertsResponse;

    writeAuditEvent(
      "mlro",
      "ongoing-monitor.ai-analysis",
      `${subjects.length} subjects scanned — health: ${parsed.portfolioHealth} · alerts: ${(parsed.alerts ?? []).length} · escalations: ${(parsed.immediateEscalations ?? []).length}`,
    );

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("mlro", "ongoing-monitor.ai-analysis", `error — ${msg}`);
    return NextResponse.json({ ok: false, error: "ongoing-monitor-ai temporarily unavailable - please retry." }, { status: 503 });
  }
}
