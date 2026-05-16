export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { withLlmFallback } from "@/lib/server/llm-fallback";
import { writeAuditEvent } from "@/lib/audit";

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

const FALLBACK: EwraBoardReportResult = {
  overallRisk: "high",
  executiveSummary:
    "The Enterprise-Wide Risk Assessment (EWRA) for the current reporting period identifies an overall inherent risk rating of HIGH, with residual risk rated MEDIUM following application of existing controls. The assessment covers eight risk dimensions including customer base, products and services, geographic exposure, delivery channels, transaction types, TBML/trade finance, proliferation financing, and internal controls. Six of eight dimensions carry an inherent risk rating of High or Critical, reflecting the entity's profile as a UAE-based DPMS/gold sector participant with cross-border transaction exposure. Board approval and annual re-assessment are required under UAE FDL 10/2025 Art.4 and FATF R.1.",
  keyFindings: [
    "TBML / Trade Finance dimension carries the highest residual risk (Critical) due to limited automated monitoring of invoice price anomalies and HS code mismatches",
    "Geographic Exposure remains High inherent risk, driven by CAHRA-jurisdiction sourcing and FATF grey-list counterparty exposure",
    "Customer Base risk is High inherent: PEP client concentration and presence of DNFBP counterparties without full CDD verification",
    "Products & Services risk is elevated due to physical gold trading, refining, and bullion storage — sectors identified as priority ML vectors in FATF DPMS Guidance (2023)",
    "Internal Controls dimension shows the strongest control effectiveness (4/5), reflecting recent investments in training and MLRO independence",
    "Proliferation Financing controls are adequate but dependent on manual SGCL screening — automation gap identified",
  ],
  dimensionNarratives: [
    {
      dimension: "Customer Base",
      inherentRisk: "High (4/5)",
      residualRisk: "Medium (3/5)",
      narrative: "The customer portfolio includes politically exposed persons, high-net-worth individuals from FATF grey-list jurisdictions, and DNFBP counterparties. Enhanced due diligence is applied to high-risk segments, but gaps remain in periodic CDD refresh frequency for medium-risk corporate clients.",
      controlGaps: ["Biennial CDD review cycle for medium-risk corporates overdue in 18% of cases", "PEP screening tool does not capture all associate relationships"],
      recommendedActions: ["Accelerate CDD refresh for overdue medium-risk accounts within 90 days", "Upgrade PEP database to include associate and family member mapping"],
    },
    {
      dimension: "TBML / Trade Finance",
      inherentRisk: "High (4/5)",
      residualRisk: "Critical (4/5)",
      narrative: "Trade-based money laundering represents the most material control gap in the current assessment period. Manual invoice review processes are insufficient to detect systematic over/under-invoicing across the volume of trade finance transactions processed monthly. The FATF DPMS Guidance (2023) identifies gold sector participants as primary TBML vectors.",
      controlGaps: ["No automated price-benchmarking against world gold prices for trade invoices", "HS code consistency checks performed manually and sporadically", "No end-to-end shipment tracking for physical gold movements"],
      recommendedActions: ["Implement automated TBML detection for trade finance transactions within 6 months", "Subscribe to world price benchmarking data feed for commodity validation", "Mandate bill of lading cross-reference for all cross-border gold shipments > AED 500,000"],
    },
    {
      dimension: "Geographic Exposure",
      inherentRisk: "High (4/5)",
      residualRisk: "High (3/5)",
      narrative: "Exposure to CAHRA jurisdictions (Central African Republic, DRC, Mali, Sudan) through gold sourcing chains, combined with counterparties in FATF grey-list countries, sustains elevated geographic risk. Enhanced due diligence is applied to transactions with listed jurisdictions but monitoring frequency requires improvement.",
      controlGaps: ["CAHRA jurisdiction mapping not fully embedded in transaction monitoring rules", "Third-country routing through UAE Free Zones without enhanced monitoring"],
      recommendedActions: ["Update TM rules to flag all CAHRA-adjacent transactions for MLRO review", "Apply enhanced CDD to all Free Zone entities with CAHRA-jurisdiction UBOs"],
    },
  ],
  boardRecommendations: [
    "Board to formally approve this EWRA and record approval in Board Minutes — mandatory under FDL 10/2025 Art.4",
    "Allocate budget for automated TBML detection tool — highest priority remediation item",
    "Direct MLRO to present quarterly AML performance metrics to Board Risk Committee",
    "Approve accelerated CDD refresh programme for overdue medium-risk accounts",
    "Schedule next EWRA review date: 12 months from Board approval date",
    "Commission independent AML programme audit (second line) within 6 months to validate control effectiveness scores",
  ],
  regulatoryContext:
    "This EWRA is produced pursuant to UAE Federal Decree-Law No. 10/2025 Art.4 (annual EWRA obligation), FATF Recommendation 1 (risk-based approach), and CBUAE AML/CFT Guidelines 2021 §3. The assessment methodology applies the FATF risk-based approach framework: identify, assess, understand, and mitigate ML/TF/PF risks. Board approval and annual refresh are mandatory. Failure to maintain a current, Board-approved EWRA constitutes a reportable control deficiency under CBUAE inspection standards.",
  approvalStatement:
    "This Enterprise-Wide Risk Assessment has been prepared by the MLRO and approved by senior management. It is presented to the Board of Directors / Board Risk Committee for formal approval pursuant to UAE FDL 10/2025 Art.4. Upon Board approval, this document should be retained for a minimum of 8 years (FDL 10/2025 Art.16) and made available to the CBUAE on request.",
  nextSteps: [
    "Board formal approval and signature — record in Board Minutes",
    "Distribute to all business line heads for risk awareness",
    "Initiate TBML automated monitoring procurement process",
    "Update AML risk appetite statement to reflect EWRA findings",
    "Schedule follow-up MLRO presentation to Board Risk Committee in 90 days",
    "File EWRA summary with CBUAE if required by applicable circular",
  ],
};

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
      const client = getAnthropicClient(apiKey, 55_000);
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

  return NextResponse.json({
    ok: true,
    ...fallback.result,
    ...(fallback.degraded ? { degraded: true, degradedReason: fallback.degradedReason } : {}),
  }, { headers: gate.headers });
}
