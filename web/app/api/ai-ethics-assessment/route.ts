export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ai-ethics-assessment temporarily unavailable - please retry." }, { status: 503 });

  const modelSummary = (body.models ?? [])
    .map((m) => `${m.name} (${m.riskTier} risk, purpose: ${m.purpose}, bias audit: ${m.biasAuditStatus})`)
    .join("; ");

  const incidentSummary = (body.incidents ?? [])
    .map((i) => `${i.severity} — ${i.type} (${i.model})`)
    .join("; ");

  const biasSummary = (body.biasData ?? [])
    .map((b) => `${b.segment}: ${b.fprPct}% FPR`)
    .join("; ");

  try {
    const client = getAnthropicClient(apiKey, 22_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
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
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "ai-ethics-assessment temporarily unavailable - please retry." }, { status: 503 });
  }
}
