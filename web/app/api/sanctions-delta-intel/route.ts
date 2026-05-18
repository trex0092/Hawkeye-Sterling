// POST /api/sanctions-delta-intel
//
// Given a NEW sanctions designation event, this intelligence module:
//   1. Analyses WHY the entity was sanctioned (predicate offenses, network)
//   2. Extracts the "signature" of the designation pattern
//   3. Scans current customer base for the same signature
//   4. Returns a prioritised list of customers who match the pattern
//      BEFORE they themselves get listed — proactive risk intelligence
//
// This converts reactive sanctions screening into proactive threat hunting.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DesignationEvent {
  entityName: string;
  listId: string;               // "OFAC-SDN" | "UN-SC" | "EU-FSF" | "UAE-EOCN" etc.
  designationDate: string;
  predicateOffenses?: string[]; // ["drug trafficking", "proliferation financing"]
  associatedEntities?: string[];
  jurisdictions?: string[];
  narrative?: string;           // full designation narrative if available
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: DesignationEvent;
  try { body = await req.json() as DesignationEvent; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.entityName || !body.listId) {
    return NextResponse.json({ ok: false, error: "entityName and listId required" }, { status: 400, headers: gate.headers });
  }

  const tenant = tenantIdFromGate(gate);
  const allCases = await loadAllCases(tenant);

  const caseDigests = allCases.map((c) => ({
    id: (c as { id?: string }).id ?? "?",
    subjectName: (c as { subjectName?: string }).subjectName ?? "",
    jurisdiction: (c as { jurisdiction?: string }).jurisdiction ?? "",
    riskScore: (c as { riskScore?: number }).riskScore ?? 0,
    status: (c as { status?: string }).status ?? "",
    counterparty: (c as { counterparty?: string }).counterparty ?? "",
    typology: (c as { typology?: string }).typology ?? "",
    sector: (c as { sector?: string }).sector ?? "",
  }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      designationAnalysis: { predicatePattern: body.predicateOffenses ?? [], riskSignature: "Set ANTHROPIC_API_KEY for AI analysis" },
      customerMatches: [],
      threatLevel: "unknown",
      summary: "ANTHROPIC_API_KEY not configured — deterministic analysis unavailable for this module.",
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55_000, "sanctions-delta-intel");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: `You are an AML sanctions intelligence analyst. Given a new designation event and a customer base, you:
1. Extract the "risk signature" of the designation (what pattern of behaviour led to listing)
2. Score each customer in the base for how closely they match that signature
3. Identify any customers who share jurisdictions, sector, or counterparty with the designated entity

Return ONLY valid JSON:
{
  "designationAnalysis": {
    "predicatePattern": ["<pattern>"],
    "riskSignature": "<description of what makes this entity a sanctions target>",
    "networkIndicators": ["<indicator>"],
    "jurisdictionRisk": ["<jurisdiction>"]
  },
  "customerMatches": [
    {
      "caseId": "<id>",
      "matchScore": <0-100>,
      "matchReasons": ["<reason>"],
      "recommendedAction": "immediate_review|enhanced_monitoring|note_on_file"
    }
  ],
  "threatLevel": "critical|high|medium|low",
  "summary": "<2-3 sentences>",
  "proactiveActions": ["<action>"]
}`,
    messages: [{
      role: "user",
      content: `Designation Event:\n${JSON.stringify(body, null, 2)}\n\nCustomer Base (${caseDigests.length} cases):\n${JSON.stringify(caseDigests, null, 2)}\n\nAnalyse pattern and score customers.`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  try {
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    if (!Array.isArray(result.customerMatches)) result.customerMatches = [];
    if (!Array.isArray(result.proactiveActions)) result.proactiveActions = [];
    return NextResponse.json({ ok: true, ...result, customerCount: caseDigests.length }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "delta analysis failed — retry" }, { status: 500, headers: gate.headers });
  }
}
