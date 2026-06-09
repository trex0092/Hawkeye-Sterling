export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeLlmInput } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface GapFinding {
  area: string;
  finding: string;
  severity: "critical" | "high" | "medium" | "low";
  regulatoryRef: string;
}

export interface GapRecommendation {
  priority: "immediate" | "short-term" | "medium-term";
  action: string;
  owner: string;
  deadline: string;
}

export interface RegulatoryRisk {
  risk: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigant: string;
}

export interface GovernanceGapResult {
  ok: true;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  gradeRationale: string;
  criticalGaps: string[];
  findings: GapFinding[];
  recommendations: GapRecommendation[];
  regulatoryRisks: RegulatoryRisk[];
  summary: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    approvals?: unknown[];
    minutes?: unknown[];
    circulars?: unknown[];
    institutionName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    void writeAuditChainEntry(
      { event: "governance_gap_unavailable", actor: gate.keyId, error: "missing_anthropic_key" },
      tenantIdFromGate(gate),
    ).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "governance-gap temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML governance expert specialising in CBUAE AML Standards, UAE FDL 10/2025, LBMA RGG, and FATF Recommendations. Analyse governance data (approvals, meeting minutes, regulatory circulars) and produce a comprehensive gap analysis. Identify critical gaps, assign severity ratings, and provide prioritised recommendations. Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "overallGrade": "A"|"B"|"C"|"D"|"F",
  "gradeRationale": "string",
  "criticalGaps": ["string"],
  "findings": [{"area":"string","finding":"string","severity":"critical"|"high"|"medium"|"low","regulatoryRef":"string"}],
  "recommendations": [{"priority":"immediate"|"short-term"|"medium-term","action":"string","owner":"string","deadline":"string"}],
  "regulatoryRisks": [{"risk":"string","likelihood":"high"|"medium"|"low","impact":"high"|"medium"|"low","mitigant":"string"}],
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Institution: ${sanitizeField(body.institutionName ?? "Hawkeye Sterling", 200)}
Approvals: ${sanitizeLlmInput(JSON.stringify((body.approvals ?? []).slice(0, 50), null, 2), 8000)}
Meeting Minutes: ${sanitizeLlmInput(JSON.stringify((body.minutes ?? []).slice(0, 50), null, 2), 8000)}
Regulatory Circulars: ${sanitizeLlmInput(JSON.stringify((body.circulars ?? []).slice(0, 50), null, 2), 8000)}

Perform a comprehensive AML governance gap analysis. Identify all gaps, risks, and remediation actions.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as GovernanceGapResult;
    if (!Array.isArray(result.criticalGaps)) result.criticalGaps = [];
    if (!Array.isArray(result.findings)) result.findings = [];
    if (!Array.isArray(result.recommendations)) result.recommendations = [];
    if (!Array.isArray(result.regulatoryRisks)) result.regulatoryRisks = [];
    void writeAuditChainEntry(
      { event: "governance_gap_assessed", actor: gate.keyId, overallGrade: result.overallGrade, criticalGapCount: result.criticalGaps.length, findingCount: result.findings.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "governance-gap temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
