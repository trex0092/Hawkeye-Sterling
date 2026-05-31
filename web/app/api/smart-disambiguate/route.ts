// POST /api/smart-disambiguate
//
// Smart Hit Disambiguation Engine — resolves hundreds of screening hits for
// high-frequency names (Mohamed, Ahmed, etc.) in seconds under UAE FDL 10/2025
// and FATF R.10 guidance.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { pickModel } from "../../../../src/integrations/model-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  client?: ClientInput;
  profile?: ClientInput;  // accepted alias — MCP tool sends { profile: { name: ... } }
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


export async function POST(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 , headers: gate.headers });
  }

  const { hits } = body;
  // Accept both { client: { name } } and { profile: { name } } shapes.
  const client: ClientInput = (body.client ?? body.profile) as ClientInput;
  if (!client?.name) {
    return NextResponse.json({ ok: false, error: "client.name or profile.name is required" }, { status: 400 , headers: gate.headers });
  }
  if (!Array.isArray(hits) || hits.length === 0) {
    return NextResponse.json({ ok: false, error: "hits array is required and must not be empty" }, { status: 400 , headers: gate.headers });
  }

  void writeAuditChainEntry(
    { event: "screening.disambiguation_started", actor: gate.keyId, clientName: client.name, hitCount: hits.length },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (hits.length > 20) {
    return NextResponse.json(
      { ok: false, error: `hits array exceeds maximum batch size of 20 (received ${hits.length}). Split into multiple requests.` },
      { status: 400, headers: gate.headers }
    );
  }
  // Deterministic template — applied when no API key is set OR the LLM fails.
  const buildTemplate = (): DisambiguationResult => ({
    overallAssessment: `Deterministic disambiguation for "${client.name}" against ${hits.length} hit(s). Set ANTHROPIC_API_KEY for AI-graded scoring.`,
    clientRiskProfile: `${client.name}${client.nationality ? ` (${client.nationality})` : ""} — supplied identifiers: ${[client.dob ? "DOB" : "", client.gender ? "gender" : "", client.occupation ? "role" : ""].filter(Boolean).join(", ") || "name only"}.`,
    disambiguationStrategy: "Score each hit on identifier overlap (name, DOB, country, role). Without DOB/passport the engine cannot definitively distinguish — refer to MLRO with all hits as 'possible'.",
    hits: hits.map((h) => ({
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
    return NextResponse.json({ ok: true, ...buildTemplate(), degraded: true, degradedReason: "ANTHROPIC_API_KEY not configured — deterministic template used.", latencyMs: Date.now() - t0 }, { headers: gate.headers });
  }

  const sanitizedClient = {
    name: sanitizeField(client.name),
    nationality: sanitizeField(client.nationality),
    dob: sanitizeField(client.dob),
    gender: sanitizeField(client.gender),
    idNumber: sanitizeField(client.idNumber),
    address: sanitizeField(client.address),
    occupation: sanitizeField(client.occupation),
    employer: sanitizeField(client.employer),
    businessType: sanitizeField(client.businessType),
    knownAliases: (client.knownAliases ?? []).map((a) => sanitizeField(a)),
    context: sanitizeText(client.context),
  };
  const sanitizedHits = hits.map((h) => ({
    hitId: sanitizeField(h.hitId),
    hitName: sanitizeField(h.hitName),
    hitCategory: sanitizeField(h.hitCategory),
    hitCountry: sanitizeField(h.hitCountry),
    hitDob: sanitizeField(h.hitDob),
    hitGender: sanitizeField(h.hitGender),
    hitRole: sanitizeField(h.hitRole),
    hitNationality: sanitizeField(h.hitNationality),
    matchScore: h.matchScore,
    additionalInfo: sanitizeText(h.additionalInfo),
  }));
  const userMessage = `Disambiguate these screening hits for client: ${JSON.stringify(sanitizedClient)}. Hits to assess: ${JSON.stringify(sanitizedHits)}`;

  try {
    const modelChoice = pickModel({ kind: "classification", costSensitivity: "balanced", latencyBudgetMs: 6_000 });
    const client = getAnthropicClient(apiKey, 6_000);
    const response = await client.messages.create({
      model: modelChoice.model,
      max_tokens: Math.min(1024, 200 + hits.length * 40), // ~40 tok/hit; scale with batch size (max 20 hits → 1000 tok)
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();

    // Strip markdown fences before JSON.parse. max_tokens=380 is tight — if
    // Claude truncates mid-JSON, parse throws; catch it and degrade gracefully.
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    let parsed: DisambiguationResult;
    try {
      parsed = JSON.parse(stripped) as DisambiguationResult;
    } catch {
      console.warn("[smart-disambiguate] JSON parse failed (likely truncated response) — using template fallback");
      void writeAuditChainEntry(
        {
          event: "screening.disambiguation_degraded",
          actor: gate.keyId,
          clientName: sanitizedClient.name,
          reason: "json_parse_failed",
        },
        tenantIdFromGate(gate),
      ).catch(() => undefined);
      return NextResponse.json({ ok: true, ...buildTemplate(), degraded: true, degradedReason: "LLM response truncated — deterministic template used", latencyMs: Date.now() - t0 }, { headers: gate.headers });
    }

    // Normalize arrays — LLM occasionally returns null instead of [].
    if (!Array.isArray(parsed.hits)) parsed.hits = [];
    if (!Array.isArray(parsed.clarificationQuestions)) parsed.clarificationQuestions = [];
    if (!Array.isArray(parsed.escalationItems)) parsed.escalationItems = [];

    void writeAuditChainEntry(
      {
        event: "screening.disambiguation_completed",
        actor: gate.keyId,
        clientName: sanitizedClient.name,
        verdict: (parsed as { verdict?: string }).verdict,
        hitCount: parsed.hits.length,
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn("[smart-disambiguate] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({ ok: true, ...parsed, latencyMs: Date.now() - t0 }, { headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[smart-disambiguate] LLM call failed:", msg);
    void writeAuditChainEntry(
      { event: "screening.disambiguation_error", actor: gate.keyId, clientName: sanitizedClient?.name ?? client.name, reason: msg },
      tenantIdFromGate(gate),
    ).catch(() => undefined);
    return NextResponse.json({ ok: true, ...buildTemplate(), degraded: true, degradedReason: "LLM service temporarily unavailable", latencyMs: Date.now() - t0 }, { headers: gate.headers });
  }
}
