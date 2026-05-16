import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AmEntry {
  headline: string;
  category: string;
  severity: string;
  source: string;
  articleDate: string;
}

interface RequestBody {
  subject: string;
  entries: AmEntry[];
}

interface AmAssessmentResult {
  overallRisk: "critical" | "high" | "medium" | "low" | "clear";
  threatNarrative: string;
  topConcerns: string[];
  fatfTypologies: string[];
  regulatoryLinks: string;
  recommendedAction: "file_str" | "edd_required" | "exit_relationship" | "enhanced_monitoring" | "standard_monitoring" | "clear";
  actionRationale: string;
  uaeSpecificRisks: string[];
}

const FALLBACK: AmAssessmentResult = {
  overallRisk: "medium",
  threatNarrative: "API key not configured — manual review required.",
  topConcerns: [],
  fatfTypologies: [],
  regulatoryLinks: "",
  recommendedAction: "standard_monitoring",
  actionRationale: "Manual assessment required.",
  uaeSpecificRisks: [],
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

  const { subject, entries } = body;
  if (!subject) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400 , headers: gate.headers });
  }

  // Non-blocking audit event
  try { writeAuditEvent("analyst", "adverse-media.ai-assessment", subject); }
  catch (err) { console.warn("[hawkeye] adverse-media-assess writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "adverse-media-assess temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system:
          "You are a UAE AML/CFT senior compliance analyst specializing in adverse media assessment for DPMS/VASP regulated entities. Assess the overall risk profile of this subject based on all adverse media findings and provide FATF-aligned compliance guidance for the MLRO. Return ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Subject: ${subject}. Adverse media entries: ${JSON.stringify(entries)}. Return ONLY this JSON: { "overallRisk": "critical"|"high"|"medium"|"low"|"clear", "threatNarrative": "string", "topConcerns": ["string"], "fatfTypologies": ["string"], "regulatoryLinks": "string", "recommendedAction": "file_str"|"edd_required"|"exit_relationship"|"enhanced_monitoring"|"standard_monitoring"|"clear", "actionRationale": "string", "uaeSpecificRisks": ["string"] }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as AmAssessmentResult;
    if (!Array.isArray(parsed.topConcerns)) parsed.topConcerns = [];
    if (!Array.isArray(parsed.fatfTypologies)) parsed.fatfTypologies = [];
    if (!Array.isArray(parsed.uaeSpecificRisks)) parsed.uaeSpecificRisks = [];
    return NextResponse.json({ ok: true, ...parsed , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "adverse-media-assess temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
