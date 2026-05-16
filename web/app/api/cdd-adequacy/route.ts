// POST /api/cdd-adequacy
//
// AI adequacy assessment for periodic CDD reviews under FDL 10/2025 Art.11
// and FATF Recommendation 10.  Sends the full review portfolio to Claude
// Haiku and returns per-subject adequacy scores plus portfolio-level status.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ReviewInput {
  id: string;
  subject: string;
  tier: "high" | "medium" | "standard";
  lastReview: string;
  notes: string;
  lastOutcome?: string;
  daysOverdue: number;
  status: string;
}

interface AssessmentResult {
  id: string;
  adequacyScore: number;
  adequacyLevel: "adequate" | "marginal" | "inadequate";
  gaps: string[];
  recommendedActions: string[];
  enhancedMeasuresRequired: boolean;
  regulatoryRisk: string;
}

interface CddAdequacyResponse {
  assessments: AssessmentResult[];
  portfolioStatus: "compliant" | "attention_required" | "breach";
  criticalSubjects: string[];
  summary: string;
}

interface RequestBody {
  reviews: ReviewInput[];
}

const SYSTEM_PROMPT = `You are a UAE AML compliance officer assessing the adequacy of periodic CDD reviews under FDL 10/2025 Art.11 and FATF Recommendation 10. Review cadences: high risk = 90 days, medium = 180 days, standard = 365 days. For overdue or at-risk subjects, identify what enhanced measures are needed.

Return ONLY a JSON object with this exact structure:
{
  "assessments": [
    {
      "id": "string",
      "adequacyScore": 0-100,
      "adequacyLevel": "adequate" | "marginal" | "inadequate",
      "gaps": ["string array — specific CDD gaps"],
      "recommendedActions": ["string array — concrete next steps"],
      "enhancedMeasuresRequired": boolean,
      "regulatoryRisk": "string — specific FDL/FATF article at risk"
    }
  ],
  "portfolioStatus": "compliant" | "attention_required" | "breach",
  "criticalSubjects": ["string array of subject names needing immediate attention"],
  "summary": "string — 2-sentence portfolio CDD status"
}`;

const FALLBACK: CddAdequacyResponse = {
  assessments: [],
  portfolioStatus: "attention_required",
  criticalSubjects: [],
  summary: "API key not configured — manual review required",
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

  const reviews = body.reviews ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    writeAuditEvent("mlro", "cdd.ai-adequacy-check", `no-api-key — ${reviews.length} subjects skipped`);
    return NextResponse.json({ ok: false, error: "cdd-adequacy temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(reviews),
        },
      ],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();

    // Strip markdown fences before JSON.parse
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(stripped) as CddAdequacyResponse;

    // Normalize assessment arrays — LLM occasionally returns null or a
    // plain string instead of an array, which causes .map() crashes in the UI.
    if (Array.isArray(parsed.assessments)) {
      for (const a of parsed.assessments) {
        if (!Array.isArray(a.gaps)) a.gaps = [];
        if (!Array.isArray(a.recommendedActions)) a.recommendedActions = [];
      }
    }
    if (!Array.isArray(parsed.criticalSubjects)) parsed.criticalSubjects = [];

    writeAuditEvent(
      "mlro",
      "cdd.ai-adequacy-check",
      `${reviews.length} subjects assessed — portfolio: ${parsed.portfolioStatus} · critical: ${(parsed.criticalSubjects ?? []).length}`,
    );

    return NextResponse.json({ ok: true, ...parsed , headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("mlro", "cdd.ai-adequacy-check", `error — ${msg}`);
    return NextResponse.json({ ok: false, error: "cdd-adequacy temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
