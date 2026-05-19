export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface WhistleblowerResult {
  caseUrgency: "critical" | "high" | "medium" | "low";
  allegationCategories: string[];
  protectionMeasures: string[];
  investigationSteps: string[];
  regulatoryReportingRequired: boolean;
  hrEngagementPlan: string;
  timelineRequirements: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    allegation: string;
    reportSource: string;
    accusedRole: string;
    evidenceDescribed: string;
    affectedCustomers: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }
  if (!body.allegation?.trim()) {
    return NextResponse.json({ ok: false, error: "allegation is required" }, { status: 400, headers: gate.headers });
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "whistleblower temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in whistleblower case management and internal investigations. Assess whistleblower allegations and generate investigation/protection plans under UAE law. Return valid JSON only matching the WhistleblowerResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess this whistleblower case and generate an action plan.\n\nAllegation: ${sanitizeText(body.allegation)}\nReport Source: ${sanitizeField(body.reportSource)}\nAccused Role: ${sanitizeField(body.accusedRole)}\nEvidence Described: ${sanitizeText(body.evidenceDescribed)}\nAffected Customers: ${sanitizeField(body.affectedCustomers)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: caseUrgency, allegationCategories[], protectionMeasures[], investigationSteps[], regulatoryReportingRequired, hrEngagementPlan, timelineRequirements, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as WhistleblowerResult;
    if (!Array.isArray(result.allegationCategories)) result.allegationCategories = [];
    if (!Array.isArray(result.protectionMeasures)) result.protectionMeasures = [];
    if (!Array.isArray(result.investigationSteps)) result.investigationSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "whistleblower temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
