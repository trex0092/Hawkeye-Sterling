export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
export interface RegChange {
  regulation: string;
  jurisdiction: string;
  effectiveDate: string;
  changeType: "new" | "amendment" | "repeal";
  impactLevel: "low" | "medium" | "high" | "critical";
  affectedProducts: string[];
  affectedClientTypes: string[];
  requiredActions: string[];
  implementationDeadline: string;
  summary: string;
}

export interface ComplianceRoadmapMonth {
  month: string;
  actions: string[];
}

export interface RegChangeResult {
  ok: true;
  upcomingChanges: RegChange[];
  immediateActions: string[];
  totalChanges: number;
  criticalCount: number;
  complianceRoadmap: ComplianceRoadmapMonth[];
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "reg-change temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5000,
      system: [
        {
          type: "text",
          text: `You are a financial services regulatory change expert with deep knowledge of global financial regulation including EU (MiCA, DORA, AML Package, MiFID II, CRR/CRD VI, CSRD), UK (FCA Consumer Duty, PRA rules, UK Basel III), UAE (FDL 10/2025, CBUAE regulations, VARA, DFSA), US (Dodd-Frank, BSA/AML, SEC/CFTC rules), and FATF/Basel standards. Today's date is 2025-05-01.

Generate a comprehensive regulatory change management report for the institution described. Focus on regulations with impact in the next 24 months from today. Include only regulations genuinely applicable to the institution's type, jurisdictions, products, and client types.

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "upcomingChanges": [
    {
      "regulation": "string",
      "jurisdiction": "string",
      "effectiveDate": "YYYY-MM-DD",
      "changeType": "new"|"amendment"|"repeal",
      "impactLevel": "low"|"medium"|"high"|"critical",
      "affectedProducts": ["string"],
      "affectedClientTypes": ["string"],
      "requiredActions": ["string"],
      "implementationDeadline": "string",
      "summary": "string"
    }
  ],
  "immediateActions": ["string"],
  "totalChanges": number,
  "criticalCount": number,
  "complianceRoadmap": [
    {"month": "string", "actions": ["string"]}
  ]
}

Sort upcomingChanges by effectiveDate ascending. immediateActions are those due within 30 days. complianceRoadmap should cover month-by-month through end of 2026.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Institution profile:
Type: ${sanitizeField(body.institution?.type, 100) || "Financial institution"}
Jurisdictions: ${JSON.stringify(body.institution?.jurisdictions ?? [])}
Products: ${JSON.stringify(body.institution?.products ?? [])}
Client Types: ${JSON.stringify(body.institution?.clientTypes ?? [])}

Generate a comprehensive regulatory change roadmap covering all material upcoming regulatory changes affecting this institution across its jurisdictions and product set. Include EU, UK, UAE, US, and global (FATF/Basel) changes as applicable. Produce a month-by-month compliance implementation roadmap.`,
        },
      ],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RegChangeResult;
    if (!Array.isArray(result.upcomingChanges)) result.upcomingChanges = [];
    else for (const c of result.upcomingChanges) {
      if (!Array.isArray(c.affectedProducts)) c.affectedProducts = [];
      if (!Array.isArray(c.affectedClientTypes)) c.affectedClientTypes = [];
      if (!Array.isArray(c.requiredActions)) c.requiredActions = [];
    }
    if (!Array.isArray(result.immediateActions)) result.immediateActions = [];
    if (!Array.isArray(result.complianceRoadmap)) result.complianceRoadmap = [];
    else for (const m of result.complianceRoadmap) { if (!Array.isArray(m.actions)) m.actions = []; }
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "reg-change temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
