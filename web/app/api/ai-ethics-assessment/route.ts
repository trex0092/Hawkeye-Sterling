export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface EthicsAssessmentResult {
  overallScore: number; // 0–100
  rating: "exemplary" | "good" | "adequate" | "needs-improvement" | "critical";
  unescoCompliancePct: number;
  summary: string;
  findings: Array<{
    area: string;
    observation: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    recommendation: string;
  }>;
  strengths: string[];
  priorities: string[];
  nextReviewDate: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: {
    models?: Array<{ name: string; riskTier: string; purpose: string; biasAuditStatus: string }>;
    incidents?: Array<{ type: string; severity: string; model: string }>;
    biasData?: Array<{ segment: string; fprPct: number }>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ai-ethics-assessment temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  const modelSummary = (Array.isArray(body.models) ? body.models : [])
    .map((m) => `${sanitizeField(m.name, 100)} (${sanitizeField(m.riskTier, 50)} risk, purpose: ${sanitizeField(m.purpose, 200)}, bias audit: ${sanitizeField(m.biasAuditStatus, 50)})`)
    .join("; ");

  const incidentSummary = (Array.isArray(body.incidents) ? body.incidents : [])
    .map((i) => `${sanitizeField(i.severity, 50)} — ${sanitizeField(i.type, 100)} (${sanitizeField(i.model, 100)})`)
    .join("; ");

  const biasSummary = (Array.isArray(body.biasData) ? body.biasData : [])
    .map((b) => `${sanitizeField(b.segment, 100)}: ${b.fprPct}% FPR`)
    .join("; ");

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a Responsible AI governance expert specialising in AML/CFT systems. You assess AI programmes against the UNESCO Recommendation on the Ethics of Artificial Intelligence (2021), the EU AI Act, and UAE AI governance frameworks. Evaluate model registries, incident logs, and bias metrics. Score 0–100. Return ONLY valid JSON matching EthicsAssessmentResult — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Conduct an AI ethics assessment for an AML/CFT compliance platform.

Registered AI Models: ${modelSummary || "none provided"}
Recent Incidents: ${incidentSummary || "none logged"}
Bias Monitoring Data (FPR by segment): ${biasSummary || "not provided"}

Return complete EthicsAssessmentResult JSON with overallScore (0-100), rating, unescoCompliancePct, summary, findings array, strengths, priorities, and nextReviewDate.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EthicsAssessmentResult;
    if (!Array.isArray(result.findings)) result.findings = [];
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.priorities)) result.priorities = [];
    void writeAuditChainEntry(
      { event: "ai_ethics.assessed", actor: gate.keyId, overallScore: result.overallScore, rating: result.rating, findingsCount: result.findings.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "ai-ethics-assessment temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
