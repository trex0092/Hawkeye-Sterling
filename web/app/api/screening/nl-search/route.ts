// POST /api/screening/nl-search
//
// Natural-language → structured screening query translator.
// Accepts a plain-English compliance query and uses Claude to extract
// structured screening parameters: name, identifiers, lists to check,
// entity type, jurisdiction.
//
// Returns:
//   { ok, query: { name, identifiers, lists, entityType, jurisdiction },
//     interpretation, confidence, auditRef }
//
// Charter P2: the interpretation field is always populated for auditor review.
// Charter P4: no subject data is persisted — query translation only.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { writeAuditEvent } from "@/lib/audit";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ScreeningQuery {
  name?: string;
  identifiers?: string[];
  lists?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  dob?: string;
  nationality?: string;
}

interface NlSearchResponse {
  ok: true;
  query: ScreeningQuery;
  interpretation: string;
  confidence: number;
  reasoning: string;
  degraded?: boolean;
  auditRef?: string;
}

const SYSTEM_PROMPT = `You are a UAE AML screening query parser. Parse a compliance officer's plain-English request into structured screening parameters.

OUTPUT FORMAT — return ONLY this JSON object:
{
  "query": {
    "name": "subject name to screen (string, required if determinable)",
    "identifiers": ["array of IDs: passport, Emirates ID, trade licence, LEI, etc."],
    "lists": ["array of list codes to check, e.g. ofac_sdn, un_consolidated, eu_fsf, uk_hmt, us_bis"],
    "entityType": "individual | organisation | vessel | aircraft | other (optional)",
    "jurisdiction": "ISO-2 country code or country name (optional)",
    "dob": "YYYY-MM-DD (optional)",
    "nationality": "ISO-2 country code (optional)"
  },
  "interpretation": "One sentence describing what the analyst is searching for",
  "confidence": 0.0-1.0,
  "reasoning": "One sentence explaining which fields were extracted and why"
}

IMPORTANT:
- "OFAC" → lists: ["ofac_sdn"]
- "UN" / "UNSC" / "Security Council" → lists: ["un_consolidated"]
- "EU" / "European" → lists: ["eu_fsf"]
- "UK" / "Britain" / "HMT" → lists: ["uk_hmt"]
- "all lists" / "full screen" → lists: ["ofac_sdn","un_consolidated","eu_fsf","uk_hmt","us_bis"]
- PEP / politically exposed → include lists: ["pep_global"]
- If name is ambiguous or not extractable, omit the name field
- Always populate interpretation and reasoning`;

function buildDeterministicQuery(userQuery: string): ScreeningQuery {
  const lower = userQuery.toLowerCase();
  const lists: string[] = [];
  if (lower.includes("ofac") || lower.includes("sdn")) lists.push("ofac_sdn");
  if (lower.includes("un ") || lower.includes("united nations") || lower.includes("unsc")) lists.push("un_consolidated");
  if (lower.includes(" eu ") || lower.includes("european")) lists.push("eu_fsf");
  if (lower.includes(" uk ") || lower.includes("britain") || lower.includes("hmt")) lists.push("uk_hmt");
  if (lists.length === 0) lists.push("ofac_sdn", "un_consolidated", "eu_fsf");
  return { lists };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { query?: string; q?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const userQuery = sanitizeText(body.query ?? body.q);
  if (!userQuery || userQuery.trim().length < 3) {
    return NextResponse.json(
      { ok: false, error: "query is required (min 3 characters)" },
      { status: 400, headers: gate.headers },
    );
  }

  writeAuditEvent("compliance_assistant", "screening.nl-search", userQuery.slice(0, 100));

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    const auditRef = await writeAuditChainEntry(
      { event: "screening.nl_search_degraded", actor: gate.keyId, query: userQuery.slice(0, 100) },
      tenantIdFromGate(gate),
    ).then(() => "degraded").catch(() => undefined);
    return NextResponse.json(
      {
        ok: true,
        query: buildDeterministicQuery(userQuery),
        interpretation: `Screening query: "${userQuery.slice(0, 80)}"`,
        confidence: 0.4,
        reasoning: "Deterministic keyword extraction — set ANTHROPIC_API_KEY for AI-powered parsing.",
        degraded: true,
        auditRef,
      } satisfies NlSearchResponse,
      { headers: gate.headers },
    );
  }

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sanitizeField(userQuery, 1000) }],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const parsed = JSON.parse(stripped) as {
      query: ScreeningQuery;
      interpretation: string;
      confidence: number;
      reasoning: string;
    };

    void writeAuditChainEntry(
      {
        event: "screening.nl_search_completed",
        actor: gate.keyId,
        query: userQuery.slice(0, 100),
        extractedName: parsed.query?.name?.slice(0, 100),
        listCount: parsed.query?.lists?.length ?? 0,
        confidence: parsed.confidence,
      },
      tenantIdFromGate(gate),
    ).catch(() => undefined);

    return NextResponse.json(
      {
        ok: true,
        query: parsed.query,
        interpretation: parsed.interpretation,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      } satisfies NlSearchResponse,
      { headers: gate.headers },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[screening/nl-search] LLM parse failed:", msg);
    return NextResponse.json(
      {
        ok: true,
        query: buildDeterministicQuery(userQuery),
        interpretation: `Screening query: "${userQuery.slice(0, 80)}"`,
        confidence: 0.3,
        reasoning: "LLM parse failed — using keyword fallback.",
        degraded: true,
      } satisfies NlSearchResponse,
      { headers: gate.headers },
    );
  }
}
