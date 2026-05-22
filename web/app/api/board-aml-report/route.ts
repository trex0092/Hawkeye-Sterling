export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface BoardAmlReportResult {
  executiveSummary: string;
  keyMetrics: Array<{
    metric: string;
    value: string;
    trend: "improving" | "stable" | "deteriorating" | "n/a";
    commentary: string;
  }>;
  mlroUpdate: string;
  regulatoryHighlights: string[];
  openAuditFindings: Array<{
    finding: string;
    severity: "critical" | "high" | "medium" | "low";
    status: "open" | "in_progress" | "closed";
    dueDate: string;
  }>;
  upcomingObligations: string[];
  boardRecommendations: string[];
  attestationStatement: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionName?: string;
    reportingPeriod?: string;
    strCount?: string;
    ctrCount?: string;
    trainingCompletion?: string;
    openFindings?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.reportingPeriod?.trim() && !body.institutionName?.trim()) {
    return NextResponse.json({ ok: false, error: "reportingPeriod or institutionName required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "board-aml-report temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML governance specialist with expertise in Board-level MIS reporting, CBUAE quarterly reporting requirements, and AML programme performance metrics. Generate comprehensive quarterly Board AML/CFT reports including executive summaries, KPI commentary, MLRO updates, regulatory highlights, open findings, upcoming obligations, and board recommendations. Reports must comply with UAE FDL 10/2025 Art.5(2) Board accountability requirements and CBUAE AML/CFT Guidelines quarterly reporting expectations. Use professional, regulator-facing language. Respond ONLY with valid JSON matching the BoardAmlReportResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Institution Name: ${sanitizeField(body.institutionName, 300) || "not specified"}
Reporting Period: ${sanitizeField(body.reportingPeriod, 50) || "current quarter"}
STR Count: ${body.strCount ?? "not provided"}
CTR Count: ${body.ctrCount ?? "not provided"}
Training Completion: ${body.trainingCompletion ?? "not provided"}
Open Audit Findings: ${body.openFindings ?? "not provided"}
Additional Context: ${sanitizeText(body.context, 2000) || "none"}

Generate a comprehensive quarterly Board AML/CFT report. Return complete BoardAmlReportResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    let result: BoardAmlReportResult;
    try {
      result = JSON.parse(cleaned) as BoardAmlReportResult;
    } catch {
      console.warn("[board-aml-report] JSON parse failed, raw length:", cleaned.length, "stop_reason:", response.stop_reason);
      return NextResponse.json({ ok: false, error: "Report generation incomplete — the model response was truncated. Please retry." }, { status: 503, headers: gate.headers });
    }
    if (!Array.isArray(result.keyMetrics)) result.keyMetrics = [];
    if (!Array.isArray(result.regulatoryHighlights)) result.regulatoryHighlights = [];
    if (!Array.isArray(result.openAuditFindings)) result.openAuditFindings = [];
    if (!Array.isArray(result.upcomingObligations)) result.upcomingObligations = [];
    if (!Array.isArray(result.boardRecommendations)) result.boardRecommendations = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "board-aml-report temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
