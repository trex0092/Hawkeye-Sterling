// POST /api/false-positive
//
// AI False Positive Disambiguator — beats World-Check's match % by reasoning
// about whether a screening hit is actually the same person as the client,
// using full contextual analysis under UAE FDL/FATF guidance.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Verdict =
  | "likely_true_match"
  | "possible_match"
  | "likely_false_positive"
  | "confirmed_false_positive";

type Confidence = "high" | "medium" | "low";

type RecommendedAction =
  | "escalate_to_mlro"
  | "request_client_clarification"
  | "document_and_clear"
  | "enhanced_dd"
  | "reject_onboarding";

interface FalsePositiveResponse {
  verdict: Verdict;
  confidence: Confidence;
  confidenceScore: number;
  reasoning: string;
  matchingFactors: string[];
  differentiatingFactors: string[];
  additionalChecksRequired: string[];
  recommendedAction: RecommendedAction;
  regulatoryNote: string;
  dispositionText: string;
}

interface RequestBody {
  screenedName: string;
  hitName: string;
  hitCategory: string;
  hitCountry: string;
  hitDob?: string;
  hitRole?: string;
  clientNationality?: string;
  clientDob?: string;
  clientRole?: string;
  clientContext?: string;
  matchScore?: number;
}

const SYSTEM_PROMPT = `You are a UAE AML screening analyst specializing in false positive reduction for name-matching screening systems. Assess whether a screening hit is likely the same person as the client, or a false positive, using all available contextual information.

Output ONLY valid JSON, no markdown, no explanation:
{
  "verdict": "likely_true_match" | "possible_match" | "likely_false_positive" | "confirmed_false_positive",
  "confidence": "high" | "medium" | "low",
  "confidenceScore": number,
  "reasoning": "string — detailed reasoning for the determination",
  "matchingFactors": ["string array — factors supporting it IS the same person"],
  "differentiatingFactors": ["string array — factors suggesting it is NOT the same person"],
  "additionalChecksRequired": ["string array — what additional information would confirm/deny"],
  "recommendedAction": "escalate_to_mlro" | "request_client_clarification" | "document_and_clear" | "enhanced_dd" | "reject_onboarding",
  "regulatoryNote": "string — UAE FDL/FATF guidance on false positive documentation",
  "dispositionText": "string — ready-to-use disposition text for the compliance file"
}`;

const FALLBACK: FalsePositiveResponse = {
  verdict: "possible_match",
  confidence: "low",
  confidenceScore: 50,
  reasoning: "API key not configured — manual review required.",
  matchingFactors: [],
  differentiatingFactors: [],
  additionalChecksRequired: ["Manual review required"],
  recommendedAction: "escalate_to_mlro",
  regulatoryNote: "",
  dispositionText: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 , headers: gate.headers });
  }

  const { screenedName, hitName, hitCategory, hitCountry } = body;
  if (!screenedName || !hitName || !hitCategory || !hitCountry) {
    return NextResponse.json(
      { error: "screenedName, hitName, hitCategory, and hitCountry are required" },
      { status: 400, headers: gate.headers }
    );
  }

  writeAuditEvent("analyst", "screening.false-positive-assess", screenedName);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "false-positive temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  const userMessage = [
    `Screened Name: ${screenedName}`,
    `Hit Name: ${hitName}`,
    `Hit Category: ${hitCategory}`,
    `Hit Country: ${hitCountry}`,
    body.hitDob ? `Hit DOB: ${body.hitDob}` : null,
    body.hitRole ? `Hit Role/Title: ${body.hitRole}` : null,
    body.clientNationality ? `Client Nationality: ${body.clientNationality}` : null,
    body.clientDob ? `Client DOB: ${body.clientDob}` : null,
    body.clientRole ? `Client Role: ${body.clientRole}` : null,
    body.clientContext ? `Client Context: ${body.clientContext}` : null,
    body.matchScore !== undefined ? `Match Score: ${body.matchScore}/100` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();

    // Strip markdown fences before JSON.parse
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(stripped) as FalsePositiveResponse;
    if (!Array.isArray(parsed.matchingFactors)) parsed.matchingFactors = [];
    if (!Array.isArray(parsed.differentiatingFactors)) parsed.differentiatingFactors = [];
    if (!Array.isArray(parsed.additionalChecksRequired)) parsed.additionalChecksRequired = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("analyst", "screening.false-positive-assess.error", `${screenedName} — ${msg}`);
    return NextResponse.json({ ok: false, error: "false-positive temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
