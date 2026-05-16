import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DQRow {
  subject: string;
  score: number;
  missing: string[];
  screeningOverdue: boolean;
  daysSinceScreen: number | null;
  status: string;
}

interface RequestBody {
  rows: DQRow[];
}

interface RemediationItem {
  subject: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  requiredActions: string[];
  regulatoryRisk: string;
  deadline: string;
}

interface DataQualityPlanResult {
  remediationPlan: RemediationItem[];
  criticalCount: number;
  portfolioRisk: string;
  topGaps: string[];
  regulatoryExposure: string;
}

const FALLBACK: DataQualityPlanResult = {
  remediationPlan: [],
  criticalCount: 0,
  portfolioRisk: "API key not configured — manual review required.",
  topGaps: [],
  regulatoryExposure: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
    }

  const { rows } = body;

  // Non-blocking audit event
  try { writeAuditEvent("mlro", "data-quality.ai-remediation", "portfolio"); }
  catch (err) { console.warn("[hawkeye] data-quality-fix writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "data-quality-fix temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML data governance expert. Analyze these CDD data quality gaps for a licensed DPMS/VASP and provide a prioritized remediation plan for the MLRO. Focus on regulatory risk from incomplete records under FDL 10/2025 and FATF R.10. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Analyze these data quality rows: ${JSON.stringify(rows)}. Return ONLY this JSON: { "remediationPlan": [{ "subject": "string", "priority": "critical"|"high"|"medium"|"low", "reason": "string", "requiredActions": ["string"], "regulatoryRisk": "string", "deadline": "string" }], "criticalCount": number, "portfolioRisk": "string", "topGaps": ["string"], "regulatoryExposure": "string" }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as DataQualityPlanResult;
    if (!Array.isArray(parsed.remediationPlan)) parsed.remediationPlan = [];
    else for (const r of parsed.remediationPlan) { if (!Array.isArray(r.requiredActions)) r.requiredActions = []; }
    if (!Array.isArray(parsed.topGaps)) parsed.topGaps = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "data-quality-fix temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
