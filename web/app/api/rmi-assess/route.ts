import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SmelterInput {
  name: string;
  country: string;
  mineral: string;
  rmapStatus: string;
  cahraRisk: string;
  activeSupplier: boolean;
  annualVolumeKg?: number;
  flags: string[];
  lastAuditDate: string;
  nextAuditDue: string;
  notes: string;
}

interface RequestBody {
  smelters: SmelterInput[];
}

interface RecommendedAction {
  smelter: string;
  action: string;
  urgency: "immediate" | "3months" | "annual";
  oecdStep: number;
}

interface RmiAssessmentResult {
  portfolioRisk: "critical" | "high" | "medium" | "low";
  portfolioNarrative: string;
  criticalSmelters: string[];
  oecdGaps: string[];
  cahraExposure: string;
  lbmaAlignmentIssues: string[];
  recommendedActions: RecommendedAction[];
  regulatoryExposure: string;
  auditPriority: string[];
}

const FALLBACK: RmiAssessmentResult = {
  portfolioRisk: "medium",
  portfolioNarrative: "API key not configured — manual review required.",
  criticalSmelters: [],
  oecdGaps: [],
  cahraExposure: "",
  lbmaAlignmentIssues: [],
  recommendedActions: [],
  regulatoryExposure: "",
  auditPriority: [],
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

  const { smelters } = body;
  if (!smelters || !Array.isArray(smelters) || smelters.length === 0) {
    return NextResponse.json({ ok: false, error: "smelters array is required" }, { status: 400 , headers: gate.headers });
  }

  try { writeAuditEvent("analyst", "rmi.ai-supply-chain-assessment", "smelter-portfolio"); }
  catch (err) { console.warn("[hawkeye] rmi-assess writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "rmi-assess temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE precious-metals supply chain compliance expert specializing in RMI/OECD Due Diligence Guidance (DDG) and LBMA Responsible Gold Guidance v9. Assess this smelter/refiner portfolio for conflict minerals risk, CAHRA exposure, and OECD DDG compliance gaps. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Smelter portfolio: ${JSON.stringify(smelters)}. Return ONLY this JSON: { "portfolioRisk": "critical"|"high"|"medium"|"low", "portfolioNarrative": "string", "criticalSmelters": ["string"], "oecdGaps": ["string"], "cahraExposure": "string", "lbmaAlignmentIssues": ["string"], "recommendedActions": [{ "smelter": "string", "action": "string", "urgency": "immediate"|"3months"|"annual", "oecdStep": number }], "regulatoryExposure": "string", "auditPriority": ["string"] }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as RmiAssessmentResult;
    if (!Array.isArray(parsed.criticalSmelters)) parsed.criticalSmelters = [];
    if (!Array.isArray(parsed.oecdGaps)) parsed.oecdGaps = [];
    if (!Array.isArray(parsed.lbmaAlignmentIssues)) parsed.lbmaAlignmentIssues = [];
    if (!Array.isArray(parsed.recommendedActions)) parsed.recommendedActions = [];
    if (!Array.isArray(parsed.auditPriority)) parsed.auditPriority = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "rmi-assess temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
