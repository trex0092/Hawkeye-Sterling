// POST /api/smart-disambiguate
//
// Smart Hit Disambiguation Engine — resolves hundreds of screening hits for
// high-frequency names (Mohamed, Ahmed, etc.) in seconds under UAE FDL 10/2025
// and FATF R.10 guidance.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface ClientInput {
  name: string;
  nationality?: string;
  dob?: string;
  gender?: string;
  idNumber?: string;
  address?: string;
  occupation?: string;
  employer?: string;
  businessType?: string;
  knownAliases?: string[];
  context?: string;
}

interface HitInput {
  hitId: string;
  hitName: string;
  hitCategory: string;
  hitCountry?: string;
  hitDob?: string;
  hitGender?: string;
  hitRole?: string;
  hitNationality?: string;
  matchScore?: number;
  additionalInfo?: string;
}

interface RequestBody {
  client: ClientInput;
  hits: HitInput[];
}

interface DisambiguatedHit {
  hitId: string;
  verdict: "confirmed_false_positive" | "likely_false_positive" | "possible_match" | "likely_true_match";
  confidenceScore: number;
  primaryDifferentiator: string;
  canAutoDispose: boolean;
  dispositionText: string;
  requiresClientClarification: boolean;
  clarificationQuestion: string;
}

interface DisambiguationResult {
  overallAssessment: string;
  clientRiskProfile: string;
  disambiguationStrategy: string;
  hits: DisambiguatedHit[];
  clarificationQuestions: string[];
  bulkDispositionText: string;
  escalationItems: string[];
  regulatoryNote: string;
  processingTime: string;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content: AnthropicTextBlock[];
}

const SYSTEM_PROMPT = `You are a UAE AML screening specialist with expertise in name disambiguation for high-frequency names across South Asian, Arab, and African populations. Your goal is to help analysts efficiently resolve large volumes of screening hits for common names by applying systematic multi-factor analysis under FDL 10/2025 and FATF R.10.

For each hit, use ALL available differentiating factors:
- DOB comparison (even partial — year only is enough to clear many hits)
- Gender (male hit vs female client = confirmed false positive)
- Nationality/country (different nationality = strong differentiator for non-nationals)
- Role/profession (retired politician vs active gold trader)
- Geographic period (hit from 1990s, client born 1998)
- Match score (if < 70 and other factors differ = likely false positive)

Output ONLY valid JSON, no markdown, no explanation:
{
  "overallAssessment": "string",
  "clientRiskProfile": "string",
  "disambiguationStrategy": "string",
  "hits": [
    {
      "hitId": "string",
      "verdict": "confirmed_false_positive" | "likely_false_positive" | "possible_match" | "likely_true_match",
      "confidenceScore": number,
      "primaryDifferentiator": "string",
      "canAutoDispose": boolean,
      "dispositionText": "string",
      "requiresClientClarification": boolean,
      "clarificationQuestion": "string"
    }
  ],
  "clarificationQuestions": ["string array"],
  "bulkDispositionText": "string",
  "escalationItems": ["string array of hitIds"],
  "regulatoryNote": "string",
  "processingTime": "string"
}`;

const FALLBACK: DisambiguationResult & { ok: boolean } = {
  ok: true,
  overallAssessment: "API key not configured — manual review required.",
  clientRiskProfile: "",
  disambiguationStrategy: "",
  hits: [],
  clarificationQuestions: ["Please verify full name, DOB, nationality, and ID number with client"],
  bulkDispositionText: "",
  escalationItems: [],
  regulatoryNote: "",
  processingTime: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { client, hits } = body;
  if (!client?.name) {
    return NextResponse.json({ error: "client.name is required" }, { status: 400 });
  }
  if (!Array.isArray(hits) || hits.length === 0) {
    return NextResponse.json({ error: "hits array is required and must not be empty" }, { status: 400 });
  }

  writeAuditEvent("analyst", "screening.smart-disambiguate", client.name);

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Process max 20 hits
  const hitsToProcess = hits.slice(0, 20);
  const truncated = hits.length > 20;

  // Deterministic template — applied when no API key is set OR the LLM fails.
  const buildTemplate = (): DisambiguationResult => ({
    overallAssessment: `Deterministic disambiguation for "${client.name}" against ${hits.length} hit(s). Set ANTHROPIC_API_KEY for AI-graded scoring.`,
    clientRiskProfile: `${client.name}${client.nationality ? ` (${client.nationality})` : ""} — supplied identifiers: ${[client.dob ? "DOB" : "", client.gender ? "gender" : "", client.occupation ? "role" : ""].filter(Boolean).join(", ") || "name only"}.`,
    disambiguationStrategy: "Score each hit on identifier overlap (name, DOB, country, role). Without DOB/passport the engine cannot definitively distinguish — refer to MLRO with all hits as 'possible'.",
    hits: hitsToProcess.map((h) => ({
      hitId: h.hitId,
      verdict: "possible_match",
      confidenceScore: 50,
      primaryDifferentiator: client.dob ? "Compare DOB to disambiguate." : "DOB missing — request from client.",
      canAutoDispose: false,
      dispositionText: `Hit ${h.hitId} (${h.hitName}) requires manual review — strong identifiers absent.`,
      requiresClientClarification: !client.dob,
      clarificationQuestion: !client.dob ? "Could you confirm your full date of birth?" : "",
    })),
    clarificationQuestions: !client.dob ? ["Date of birth (full DD-MM-YYYY)"] : [],
    bulkDispositionText: "All hits require manual MLRO review — deterministic baseline cannot auto-dispose without strong identifiers.",
    escalationItems: [],
    regulatoryNote: "FATF R.10 — disambiguation must rely on decisive identifiers (DOB, passport, biometric).",
    processingTime: "deterministic",
  });

  if (!apiKey) {
    return NextResponse.json({ ...buildTemplate(), degraded: true, degradedReason: "ANTHROPIC_API_KEY not configured — deterministic template used." });
  }

  const userMessage = `Disambiguate these screening hits for client: ${JSON.stringify(client)}. Hits to assess: ${JSON.stringify(hitsToProcess)}${truncated ? ` (Note: only first 20 of ${hits.length} hits processed due to batch limit)` : ""}`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const raw = (data.content[0]?.text ?? "{}").trim();

    // Strip markdown fences before JSON.parse
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(stripped) as DisambiguationResult;

    // If truncated, amend overallAssessment
    if (truncated && parsed.overallAssessment) {
      parsed.overallAssessment = `[First 20 of ${hits.length} hits processed] ${parsed.overallAssessment}`;
    }

    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("analyst", "screening.smart-disambiguate.error", `${client.name} — ${msg}`);
    return NextResponse.json({ ...buildTemplate(), degraded: true, degradedReason: `LLM call failed: ${msg}` });
  }
}
