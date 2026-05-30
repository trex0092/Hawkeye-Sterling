export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface ImpactAssessmentResult {
  ok: true;
  regulation: string;
  overallImpact: "low" | "medium" | "high" | "critical";
  impactScore: number; // 0–100
  businessImpact: {
    operationalChanges: string[];
    systemChanges: string[];
    staffingNeeds: string[];
    estimatedCost: string;
    implementationMonths: number;
  };
  legalRisk: {
    penaltyExposure: string;
    reputationalRisk: string;
    licenceRisk: boolean;
    details: string;
  };
  keyObligations: Array<{
    obligation: string;
    deadline: string;
    owner: string;
    complexity: "low" | "medium" | "high";
  }>;
  implementationRoadmap: Array<{
    phase: string;
    duration: string;
    actions: string[];
    dependencies: string[];
  }>;
  gaps: string[];
  quickWins: string[];
  executiveSummary: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    regulation?: string;
    institution?: {
      type?: string;
      jurisdictions?: string[];
      products?: string[];
      clientTypes?: string[];
    };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "reg-change/impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a financial services regulatory implementation expert. Produce a deep-dive impact assessment for a specific regulation as it applies to the given institution. Be precise, practical and actionable. Today's date is 2025-05-01.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "regulation": "string",
  "overallImpact": "low"|"medium"|"high"|"critical",
  "impactScore": number (0-100),
  "businessImpact": {
    "operationalChanges": ["string"],
    "systemChanges": ["string"],
    "staffingNeeds": ["string"],
    "estimatedCost": "string",
    "implementationMonths": number
  },
  "legalRisk": {
    "penaltyExposure": "string",
    "reputationalRisk": "string",
    "licenceRisk": boolean,
    "details": "string"
  },
  "keyObligations": [{"obligation":"string","deadline":"string","owner":"string","complexity":"low"|"medium"|"high"}],
  "implementationRoadmap": [{"phase":"string","duration":"string","actions":["string"],"dependencies":["string"]}],
  "gaps": ["string"],
  "quickWins": ["string"],
  "executiveSummary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Regulation: ${sanitizeField(body.regulation ?? "Unknown regulation", 500)}

Institution profile:
Type: ${sanitizeField(body.institution?.type ?? "Financial institution", 200)}
Jurisdictions: ${sanitizeField(JSON.stringify(body.institution?.jurisdictions ?? []), 500)}
Products: ${sanitizeField(JSON.stringify(body.institution?.products ?? []), 500)}
Client Types: ${sanitizeField(JSON.stringify(body.institution?.clientTypes ?? []), 500)}

Produce a comprehensive impact assessment for how this regulation affects this specific institution. Include all material obligations, implementation roadmap, cost/resource estimates, legal risk exposure, gaps to remediate, and quick wins.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as ImpactAssessmentResult;
    if (!result.businessImpact || typeof result.businessImpact !== "object") result.businessImpact = { operationalChanges: [], systemChanges: [], staffingNeeds: [], estimatedCost: "", implementationMonths: 0 };
    if (!Array.isArray(result.businessImpact.operationalChanges)) result.businessImpact.operationalChanges = [];
    if (!Array.isArray(result.businessImpact.systemChanges)) result.businessImpact.systemChanges = [];
    if (!Array.isArray(result.businessImpact.staffingNeeds)) result.businessImpact.staffingNeeds = [];
    if (!Array.isArray(result.keyObligations)) result.keyObligations = [];
    if (!Array.isArray(result.implementationRoadmap)) result.implementationRoadmap = [];
    else for (const r of result.implementationRoadmap) { if (!Array.isArray(r.actions)) r.actions = []; if (!Array.isArray(r.dependencies)) r.dependencies = []; }
    if (!Array.isArray(result.gaps)) result.gaps = [];
    if (!Array.isArray(result.quickWins)) result.quickWins = [];
    void writeAuditChainEntry(
      { event: "reg_change_impact_assessed", actor: gate.keyId, overallImpact: result.overallImpact, impactScore: result.impactScore, gapCount: result.gaps.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "reg-change/impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
