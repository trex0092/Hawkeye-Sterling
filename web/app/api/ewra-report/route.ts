export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { withLlmFallback } from "@/lib/server/llm-fallback";
import { writeAuditEvent } from "@/lib/audit";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export interface EwraBoardReportResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  executiveSummary: string;
  keyFindings: string[];
  dimensionNarratives: Array<{
    dimension: string;
    inherentRisk: string;
    residualRisk: string;
    narrative: string;
    controlGaps: string[];
    recommendedActions: string[];
  }>;
  boardRecommendations: string[];
  regulatoryContext: string;
  approvalStatement: string;
  nextSteps: string[];
  // Additional fields from main branch schema
  overallRiskVerdict?: "critical" | "high" | "medium" | "low";
  topControlGaps?: Array<{
    dimension: string;
    gap: string;
    recommendation: string;
    urgency: "immediate" | "3months" | "annual";
  }>;
  immediateActions?: string[];
  regulatoryExposure?: string;
  boardNarrative?: string;
  nextReviewDate?: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    dimensions?: Array<{ id?: string; dimension: string; description?: string; inherent: number; controls: number; notes: string }>;
    institutionName?: string;
    reportingPeriod?: string;
    context?: string;
    overallInherent?: number;
    overallResidual?: number;
    approvedBy?: string;
    lastApproved?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  // Audit the report generation
  try {
    writeAuditEvent(
      "mlro",
      "ewra.ai-report-generated",
      `overallInherent=${body.overallInherent ?? "?"} overallResidual=${body.overallResidual ?? "?"}`,
    );
  } catch { /* non-blocking */ }

  const dimensionText = body.dimensions
    ?.map((d) => `${d.dimension}: inherent ${d.inherent}/5, controls ${d.controls}/5${d.notes ? `, notes: ${d.notes}` : ""}`)
    .join("\n") ?? "No dimension data provided";

  // Deterministic template — used whenever ANTHROPIC_API_KEY is missing or
  // the live call fails. Builds a defensible board EWRA from the dimension
  // scores alone so the operator never sees a 503.
  const buildTemplate = (): EwraBoardReportResult => {
    const inh = body.overallInherent ?? 0;
    const res = body.overallResidual ?? 0;
    const overallRisk: EwraBoardReportResult["overallRisk"] =
      res >= 4 ? "critical" : res >= 3 ? "high" : res >= 2 ? "medium" : "low";
    return {
      overallRisk,
      executiveSummary: `Enterprise-Wide Risk Assessment for ${body.institutionName ?? "the institution"} — reporting period ${body.reportingPeriod ?? new Date().getFullYear()}. Overall inherent risk scored ${inh}/5; overall residual risk ${res}/5 (band: ${overallRisk.toUpperCase()}). Assessment performed across ${body.dimensions?.length ?? 0} dimensions in line with FATF R.1 and FDL 10/2025 Art.4. The Board is asked to note residual exposure and approve the action plan below.`,
      keyFindings: (Array.isArray(body.dimensions) ? body.dimensions : []).slice(0, 5).map((d) => `${d.dimension} — inherent ${d.inherent}/5, controls ${d.controls}/5${d.notes ? ` (${d.notes})` : ""}`),
      dimensionNarratives: (Array.isArray(body.dimensions) ? body.dimensions : []).map((d) => ({
        dimension: d.dimension,
        inherentRisk: d.inherent >= 4 ? "high" : d.inherent >= 3 ? "medium" : "low",
        residualRisk: Math.max(0, d.inherent - d.controls) >= 3 ? "elevated" : "tolerable",
        narrative: `${d.dimension} carries inherent risk ${d.inherent}/5 with control effectiveness ${d.controls}/5; residual exposure ${Math.max(0, d.inherent - d.controls)}/5.${d.notes ? ` Note: ${d.notes}` : ""}`,
        controlGaps: d.controls < 3 ? ["Control coverage below Board appetite — strengthen procedures."] : [],
        recommendedActions: d.controls < 3 ? ["Tighten policy, update training, increase monitoring frequency."] : ["Maintain current control posture."],
      })),
      boardRecommendations: [
        "Approve the EWRA as presented and acknowledge the residual exposure.",
        "Direct management to address any control gap identified within the next quarter.",
        "Receive a follow-up report at the next Board meeting.",
      ],
      regulatoryContext: "This assessment satisfies the EWRA obligations under UAE FDL 10/2025 Art.4 and FATF Recommendation 1.",
      approvalStatement: `Approved on behalf of the Board on ${new Date().toLocaleDateString()}.`,
      nextSteps: ["File this EWRA in the regulatory record.", "Action the gap-remediation plan.", "Refresh annually."],
      immediateActions: overallRisk === "critical" ? ["Convene an MLRO emergency review.", "Suspend onboarding in critical-residual segments until controls are uplifted."] : [],
      regulatoryExposure: `Residual exposure ${res}/5 — the institution remains within the Board's stated risk appetite${overallRisk === "critical" || overallRisk === "high" ? " but at the upper bound; remediation actions are required." : "."}`,
      boardNarrative: `The institution's AML/CFT control environment delivered residual risk of ${res}/5 against an inherent risk of ${inh}/5 across ${body.dimensions?.length ?? 0} dimensions during ${body.reportingPeriod ?? "the reporting period"}. The Board notes the assessment, approves the EWRA, and instructs management to action the remediation plan tabled.`,
      nextReviewDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    };
  };

  const fallback = await withLlmFallback<EwraBoardReportResult>({
    label: "ewra-report",
    timeoutMs: 55_000,
    templateFallback: buildTemplate,
    aiCall: async () => {
      const apiKey = process.env["ANTHROPIC_API_KEY"]!;
      const client = getAnthropicClient(apiKey, 4_500);
      const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance specialist generating a formal Enterprise-Wide Risk Assessment (EWRA) board report under UAE FDL 10/2025 Art.4 and FATF R.1.

Generate a professional, board-ready EWRA report based on the risk dimension scores provided. The report must:
- Be written in formal, regulatory-grade English suitable for Board presentation
- Reference UAE FDL 10/2025 and FATF R.1 specifically
- Identify the overall risk level from the dimension scores
- Provide specific, actionable board recommendations
- Include an approval statement

Respond ONLY with valid JSON — no markdown fences:
{
  "overallRisk": "critical"|"high"|"medium"|"low",
  "executiveSummary": "<2-3 paragraph board-level summary>",
  "keyFindings": ["<finding>"],
  "dimensionNarratives": [{"dimension":"<name>","inherentRisk":"<label>","residualRisk":"<label>","narrative":"<paragraph>","controlGaps":["<gap>"],"recommendedActions":["<action>"]}],
  "boardRecommendations": ["<recommendation>"],
  "regulatoryContext": "<paragraph citing UAE law>",
  "approvalStatement": "<formal approval paragraph>",
  "nextSteps": ["<step>"],
  "immediateActions": ["<immediate action>"],
  "regulatoryExposure": "<regulatory exposure summary>",
  "boardNarrative": "<4-6 sentence board narrative>",
  "nextReviewDate": "<recommended review date>"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Institution: ${sanitizeField(body.institutionName ?? "UAE Financial Institution", 200)}
Reporting Period: ${sanitizeField(body.reportingPeriod ?? "Current year", 100)}
${body.overallInherent !== undefined ? `Overall Inherent Risk: ${body.overallInherent}/5` : ""}
${body.overallResidual !== undefined ? `Overall Residual Risk: ${body.overallResidual}/5` : ""}
${body.approvedBy ? `Last Approved By: ${sanitizeField(body.approvedBy, 200)}` : ""}
${body.lastApproved ? `Last Approval Date: ${sanitizeField(body.lastApproved, 100)}` : ""}

Risk Dimension Scores:
${dimensionText}

Additional Context: ${sanitizeField(body.context ?? "none", 500)}

Generate the board EWRA report.`,
      }],
    });

      const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EwraBoardReportResult;
      if (!Array.isArray(parsed.keyFindings)) parsed.keyFindings = [];
      if (!Array.isArray(parsed.dimensionNarratives)) parsed.dimensionNarratives = [];
      else for (const d of parsed.dimensionNarratives) { if (!Array.isArray(d.controlGaps)) d.controlGaps = []; if (!Array.isArray(d.recommendedActions)) d.recommendedActions = []; }
      if (!Array.isArray(parsed.boardRecommendations)) parsed.boardRecommendations = [];
      if (!Array.isArray(parsed.nextSteps)) parsed.nextSteps = [];
      if (!Array.isArray(parsed.immediateActions)) parsed.immediateActions = [];
      return parsed;
    },
  });

  // FATF R.1 / FDL 10/2025 Art.4 — board EWRA report generation is a
  // compliance-critical event that must appear on the tamper-evident chain.
  void writeAuditChainEntry(
    {
      event: "ewra.board_report_generated",
      actor: gate.keyId,
      overallRisk: fallback.result.overallRisk,
      institutionName: body.institutionName,
      reportingPeriod: body.reportingPeriod,
      degraded: fallback.degraded ?? false,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn("[ewra-report] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );
  return NextResponse.json({
    ok: true,
    ...fallback.result,
    ...(fallback.degraded ? { degraded: true, degradedReason: fallback.degradedReason } : {}),
  }, { headers: gate.headers });
}
