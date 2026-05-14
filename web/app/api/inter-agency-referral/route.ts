export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";


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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.caseDescription?.trim()) return NextResponse.json({ ok: false, error: "caseDescription required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "inter-agency-referral temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: `You are a UAE law enforcement referral specialist. Draft comprehensive inter-agency referral packages. Always include tipping off warnings (FDL 10/2025 Art.20) and evidence preservation steps. Respond ONLY with valid JSON matching the InterAgencyReferralResult interface — no markdown fences.`,
      messages: [{
        role: "user",
        content: `Case Description: ${body.caseDescription}
Suspected Offence: ${body.suspectedOffence ?? "money laundering"}
Subject Name: ${body.subjectName ?? "not identified"}
Subject ID/Reference: ${body.subjectId ?? "not provided"}
Evidence Summary: ${body.evidenceSummary ?? "not provided"}
Urgency Level: ${body.urgency ?? "standard"}
Additional Context: ${body.context ?? "none"}

Prepare a comprehensive inter-agency referral package. Return complete InterAgencyReferralResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as InterAgencyReferralResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "inter-agency-referral temporarily unavailable - please retry." }, { status: 503 });
  }
}
