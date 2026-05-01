// POST /api/ethical-impact
//
// UNESCO Ethical Impact Assessment: mandatory assessment for high-risk AI
// systems, aligned with UAE Federal Decree-Law No. 45/2021 (PDPL) and
// UAE FDL 10/2025.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AiDecision {
  module: string;
  recommendation: string;
  humanDecision?: string;
  confidence?: string;
}

interface EthicalImpactResponse {
  impactLevel: "high" | "medium" | "low";
  impactNarrative: string;
  rightsImpacted: string[];
  proportionalityAssessment: string;
  humanOversightStatus: string;
  mitigationMeasures: string[];
  subjectRights: string[];
  documentationRequired: string[];
  unescoAlignment: string;
  reviewRecommendation: string;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content: AnthropicTextBlock[];
}

interface RequestBody {
  subjectName: string;
  aiDecisions: AiDecision[];
  riskScore: number;
  cddPosture?: string;
  nationality?: string;
  context?: string;
}

const SYSTEM_PROMPT = `You are a UNESCO Ethical Impact Assessment specialist. Conduct an ethical impact assessment for an AI-assisted compliance decision affecting a data subject, in accordance with UNESCO's Recommendation on the Ethics of AI (2021) and UAE Federal Decree-Law No. 45/2021 (PDPL).

Output JSON (ONLY valid JSON, no markdown):
{
  "impactLevel": "high" | "medium" | "low",
  "impactNarrative": "string — overall impact assessment on subject's rights",
  "rightsImpacted": ["string array — specific rights potentially affected e.g. 'Right to financial access', 'Right to privacy', 'Right to non-discrimination'"],
  "proportionalityAssessment": "string — is the AI-assisted screening proportionate to the risk?",
  "humanOversightStatus": "string — assessment of human oversight in this case",
  "mitigationMeasures": ["string array — steps taken or recommended to protect subject rights"],
  "subjectRights": ["string array — what this subject can request/exercise"],
  "documentationRequired": ["string array — what records must be kept per UAE PDPL + FDL 10/2025"],
  "unescoAlignment": "string — specific alignment with UNESCO AI Ethics principles",
  "reviewRecommendation": "string — recommended follow-up review timeline"
}`;

const FALLBACK: EthicalImpactResponse = {
  impactLevel: "medium",
  impactNarrative: "AI analysis unavailable — check ANTHROPIC_API_KEY.",
  rightsImpacted: [],
  proportionalityAssessment: "",
  humanOversightStatus: "",
  mitigationMeasures: [],
  subjectRights: ["Right to human review of AI decisions", "Right to data correction"],
  documentationRequired: ["AI decision log", "Human oversight record"],
  unescoAlignment: "",
  reviewRecommendation: "Manual review within 30 days",
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subjectName = body.subjectName ?? "unknown";

  writeAuditEvent("mlro", "ai.ethical-impact-assessment", subjectName);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, ...FALLBACK });
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
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              subjectName,
              aiDecisions: body.aiDecisions,
              riskScore: body.riskScore,
              cddPosture: body.cddPosture,
              nationality: body.nationality,
              context: body.context,
            }),
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

    const parsed = JSON.parse(stripped) as EthicalImpactResponse;

    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("mlro", "ai.ethical-impact-assessment.error", msg);
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
