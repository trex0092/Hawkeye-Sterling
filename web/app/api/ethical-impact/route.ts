// POST /api/ethical-impact
//
// UNESCO Ethical Impact Assessment: mandatory assessment for high-risk AI
// systems, aligned with UAE Federal Decree-Law No. 45/2021 (PDPL) and
// UAE FDL 10/2025.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { withLlmFallback } from "@/lib/server/llm-fallback";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  impactNarrative: "API key not configured — manual impact assessment required.",
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
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subjectName = body.subjectName ?? "unknown";

  writeAuditEvent("mlro", "ai.ethical-impact-assessment", subjectName);

  // Deterministic template — used when ANTHROPIC_API_KEY is missing OR
  // the live call fails. Produces a regulator-grade EIA shaped from the
  // input fields alone; the MLRO must still review and customise.
  const buildTemplate = (): EthicalImpactResponse => {
    const score = body.riskScore ?? 0;
    const impactLevel: "high" | "medium" | "low" =
      score >= 60 ? "high" : score >= 30 ? "medium" : "low";
    return {
      impactLevel,
      impactNarrative: `Automated ethical-impact assessment for "${subjectName}" (risk score ${score}/100, posture ${body.cddPosture ?? "CDD"}). Subject ${body.nationality ? `is a ${body.nationality} national. ` : ""}AI-driven decision-making materially affects this subject's access to financial services and warrants ${impactLevel}-impact governance.`,
      rightsImpacted: [
        "Right to non-discrimination (UAE PDPL Art.19, UNESCO Recommendation §22)",
        "Right to explanation of automated decision (UAE PDPL Art.20)",
        "Right to human review (FDL 10/2025 Art.16)",
        "Right to data correction (UAE PDPL Art.18)",
      ],
      proportionalityAssessment: `Risk-band ${impactLevel} — automated processing is proportionate to the AML/CFT compliance objective when combined with mandatory MLRO review at any escalation.`,
      humanOversightStatus: "All adverse dispositions require human MLRO sign-off; AI is advisory only (UNESCO §32).",
      mitigationMeasures: [
        "MLRO four-eyes review on every escalation",
        "10-year audit retention (FDL 10/2025 Art.24)",
        "Quarterly bias-monitoring across nationality / gender / age",
        "Right-to-explanation responses delivered within 30 days",
      ],
      subjectRights: [
        "Access — request the data the platform holds about you",
        "Correction — challenge inaccurate records",
        "Erasure — limited where AML retention applies",
        "Human review — every adverse decision is reviewed by an MLRO",
        "Complaint — escalate to the UAE Data Office",
      ],
      documentationRequired: [
        "AI decision log entry (auto-generated)",
        "MLRO sign-off (four-eyes)",
        "Bias-monitoring report (quarterly)",
      ],
      unescoAlignment: "Aligned with UNESCO Recommendation on the Ethics of AI (2021), §22 (non-discrimination), §32 (human oversight), §44 (transparency).",
      reviewRecommendation: impactLevel === "high"
        ? "Mandatory MLRO review before any disposition. Document the decision basis in the audit chain."
        : impactLevel === "medium"
          ? "Standard MLRO review. Bias-monitoring sample includes this case."
          : "Routine processing acceptable. Periodic review under the bias-monitoring sampling plan.",
    };
  };

  const fallback = await withLlmFallback<EthicalImpactResponse>({
    label: "ethical-impact",
    timeoutMs: 25_000,
    templateFallback: buildTemplate,
    aiCall: async () => {
      const apiKey = process.env["ANTHROPIC_API_KEY"]!;
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
          messages: [{
            role: "user",
            content: JSON.stringify({
              subjectName,
              aiDecisions: body.aiDecisions,
              riskScore: body.riskScore,
              cddPosture: body.cddPosture,
              nationality: body.nationality,
              context: body.context,
            }),
          }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
      const data = (await res.json()) as AnthropicResponse;
      const raw = (data.content[0]?.text ?? "{}").trim();
      const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      return JSON.parse(stripped) as EthicalImpactResponse;
    },
  });

  if (fallback.degraded) writeAuditEvent("mlro", "ai.ethical-impact-assessment.degraded", fallback.degradedReason ?? "");

  return NextResponse.json({
    ok: true,
    ...fallback.result,
    ...(fallback.degraded ? { degraded: true, degradedReason: fallback.degradedReason } : {}),
  });
}
