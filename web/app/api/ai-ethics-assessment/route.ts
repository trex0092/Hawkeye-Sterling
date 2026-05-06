export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
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

const FALLBACK: EthicsAssessmentResult = {
  overallScore: 74,
  rating: "good",
  unescoCompliancePct: 82,
  summary:
    "The AI governance programme demonstrates a solid foundation aligned with UNESCO Recommendation on AI Ethics and the EU AI Act. High-risk model inventory is comprehensive, human-in-the-loop controls are well-documented, and audit trails meet regulatory expectations. Gaps remain in bias monitoring frequency and incident-response SLAs.",
  findings: [
    {
      area: "Bias Monitoring",
      observation:
        "False-positive disparity between individual and organisational entity types (1.8× ratio) approaches the 2× alert threshold. Quarterly monitoring cadence may be insufficient for a high-frequency screening system.",
      severity: "medium",
      recommendation:
        "Increase bias monitoring to monthly. Set automated alerts at 1.5× ratio to provide earlier warning. Document and investigate any disparity exceeding 10 percentage points.",
    },
    {
      area: "Model Cards",
      observation:
        "Two models in the registry (claude-haiku-4-5 and GPT-4o-mini) lack published model cards or have model cards older than 12 months.",
      severity: "medium",
      recommendation:
        "Complete model cards for all registered models within 30 days. Establish annual model-card refresh cycle with MLRO sign-off.",
    },
    {
      area: "Incident Response",
      observation:
        "Current AI incident log shows 2 open incidents with no documented resolution date or escalation path. UNESCO Principle P9 (Accountability) requires defined response SLAs.",
      severity: "high",
      recommendation:
        "Define SLA tiers: Critical ≤ 4 hours, High ≤ 24 hours, Medium ≤ 5 business days. Assign incident owners and implement automated escalation.",
    },
    {
      area: "UNESCO P4 — Safety & Security",
      observation:
        "Adversarial testing and red-team exercises for LLM-based narrative generation are not documented in the incident log or audit trail.",
      severity: "medium",
      recommendation:
        "Schedule quarterly red-team assessments for all Tier-1 AI models. Log results in the AI Audit Trail with MLRO attestation.",
    },
    {
      area: "UNESCO P11 — Multi-Stakeholder Governance",
      observation:
        "AI governance decisions are currently confined to internal stakeholders. No mechanism exists for external expert review or customer feedback on AI-derived dispositions.",
      severity: "low",
      recommendation:
        "Establish an annual external AI ethics review with independent experts. Publish a transparency report on AI usage in AML/CFT operations.",
    },
    {
      area: "EU AI Act Conformity",
      observation:
        "All three high-risk AI systems (screening uplift, anomaly detection, narrative generation) have completed conformity self-assessments. Technical documentation meets Annex IV requirements.",
      severity: "info",
      recommendation: "Maintain current conformity posture. Schedule external conformity audit before next EU AI Act compliance deadline.",
    },
  ],
  strengths: [
    "Comprehensive model registry with risk-tier classification aligned to EU AI Act",
    "Human-in-the-loop mandatory for all adverse customer dispositions",
    "Immutable AI audit trail with 10-year retention aligned to FDL 10/2025 Art.24",
    "UNESCO P1 (Proportionality) and P6 (Transparency) fully implemented",
    "Bias audit programme covers both individual and organisational entity segments",
  ],
  priorities: [
    "Increase bias monitoring cadence to monthly and set automated disparity alerts",
    "Complete model cards for all registry entries within 30 days",
    "Define and enforce AI incident response SLA tiers with documented escalation paths",
    "Schedule quarterly red-team adversarial testing for Tier-1 LLM models",
    "Establish external AI ethics advisory review for annual transparency reporting",
  ],
  nextReviewDate: "2026-08-01",
};

export async function POST(req: Request) {
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
