export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
export interface AmlProgrammeGapResult {
  overallMaturity: "advanced" | "adequate" | "developing" | "inadequate";
  cbuaeReadinessScore: number;
  gaps: Array<{
    pillar: string;
    gap: string;
    severity: "critical" | "high" | "medium" | "low";
    legalBasis: string;
    remediationAction: string;
    timeline: string;
  }>;
  strengths: string[];
  criticalFindings: string[];
  priorityRemediation: string[];
  inspectionRiskRating: "high" | "medium" | "low";
  nextSteps: string[];
  regulatoryBasis: string;
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    programmeDescription?: string;
    currentControls?: string;
    lastAuditDate?: string;
    staffCount?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "aml-programme-gap temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a CBUAE AML inspection specialist with deep knowledge of UAE FDL 10/2025 AML/CFT programme requirements, CBUAE inspection methodology, and common regulatory findings. Assess AML programme descriptions for gaps across the key pillars: EWRA, governance, CDD/KYC, transaction monitoring, STR/CTR reporting, training, sanctions screening, and record-keeping. Score programmes against CBUAE readiness criteria (0-100). Identify critical, high, medium and low gaps with specific legal basis and remediation timelines. Respond ONLY with valid JSON matching the AmlProgrammeGapResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Institution Type: ${sanitizeField(body.institutionType, 500)}
AML Programme Description: ${sanitizeText(body.programmeDescription, 2000) ?? "not provided"}
Current Controls in Place: ${sanitizeText(body.currentControls, 2000) ?? "not described"}
Last Audit/Review Date: ${sanitizeField(body.lastAuditDate, 50) ?? "unknown"}
Staff Count: ${sanitizeField(body.staffCount, 100) ?? "not provided"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Conduct a comprehensive AML programme gap analysis. Return complete AmlProgrammeGapResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as AmlProgrammeGapResult;
    if (!Array.isArray(result.gaps)) result.gaps = [];
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.criticalFindings)) result.criticalFindings = [];
    if (!Array.isArray(result.priorityRemediation)) result.priorityRemediation = [];
    if (!Array.isArray(result.nextSteps)) result.nextSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "aml-programme-gap temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
