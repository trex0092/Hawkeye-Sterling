export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface InterAgencyReferralResult {
  referralAgency: string;
  referralBasis: string;
  urgencyLevel: "immediate" | "priority" | "standard";
  referralPackage: {
    coverLetter: string;
    factsSummary: string;
    evidenceList: string[];
    legalBasis: string;
    requestedActions: string[];
  };
  parallelNotifications: Array<{
    agency: string;
    reason: string;
    timeline: string;
  }>;
  domesticLegalBasis: string;
  internationalCooperationBasis?: string;
  mulatRequired: boolean;
  evidencePreservationSteps: string[];
  tippingOffWarning: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    caseDescription: string;
    suspectedOffence?: string;
    subjectName?: string;
    subjectId?: string;
    evidenceSummary?: string;
    urgency?: "immediate" | "standard";
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.caseDescription?.trim()) return NextResponse.json({ ok: false, error: "caseDescription required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "inter-agency-referral temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE law enforcement referral specialist with expertise in UAE Public Prosecution (PPO) and CID liaison procedures, FIU reporting via goAML, inter-agency notification requirements, MLAT procedures, and Egmont Group information sharing. Draft comprehensive inter-agency referral packages including cover letters, facts summaries, evidence lists, legal basis statements, and parallel notification requirements. Always include tipping off warnings (FDL 10/2025 Art.20) and evidence preservation steps. Respond ONLY with valid JSON matching the InterAgencyReferralResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Case Description: ${sanitizeText(body.caseDescription, 2000)}
Suspected Offence: ${sanitizeField(body.suspectedOffence, 100) ?? "money laundering"}
Subject Name: ${sanitizeField(body.subjectName, 500) ?? "not identified"}
Subject ID/Reference: ${sanitizeField(body.subjectId, 100) ?? "not provided"}
Evidence Summary: ${sanitizeText(body.evidenceSummary, 2000) ?? "not provided"}
Urgency Level: ${sanitizeField(body.urgency, 50) ?? "standard"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Prepare a comprehensive inter-agency referral package. Return complete InterAgencyReferralResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InterAgencyReferralResult;
    if (!result.referralPackage || typeof result.referralPackage !== "object") result.referralPackage = { coverLetter: "", factsSummary: "", evidenceList: [], legalBasis: "", requestedActions: [] };
    if (!Array.isArray(result.referralPackage.evidenceList)) result.referralPackage.evidenceList = [];
    if (!Array.isArray(result.referralPackage.requestedActions)) result.referralPackage.requestedActions = [];
    if (!Array.isArray(result.parallelNotifications)) result.parallelNotifications = [];
    if (!Array.isArray(result.evidencePreservationSteps)) result.evidencePreservationSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "inter-agency-referral temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
