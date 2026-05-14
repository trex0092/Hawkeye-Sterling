// POST /api/name-variants
//
// AI Name Variant Generator — beats World-Check's static alias database by
// generating transliterations, patronymics, maiden names and aliases dynamically
// for ANY name in ANY script (Arabic, Persian, Chinese, Russian, Latin).

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface NameVariantsResponse {
  canonicalName: string;
  variants: string[];
  transliterations: string[];
  patronymics: string[];
  maidenNames: string[];
  aliases: string[];
  entityVariants: string[];
  screeningStrings: string[];
  scriptVariants: string[];
  notes: string;
}

interface RequestBody {
  name: string;
  nationality?: string;
  dob?: string;
  context?: string;
}

const SYSTEM_PROMPT = `You are a UAE AML name screening specialist with expertise in transliteration, phonetic matching, and alias generation across Arabic, Persian, Chinese, Russian, Cyrillic, and Latin scripts. Generate comprehensive name variants for AML screening purposes to eliminate false negatives.

Output ONLY valid JSON, no markdown, no explanation:
{
  "canonicalName": "string — standardized canonical form",
  "variants": ["string array — all known/likely alternate spellings"],
  "transliterations": ["string array — romanizations from other scripts e.g. Arabic transliterations"],
  "patronymics": ["string array — patronymic/matronymic forms if applicable"],
  "maidenNames": ["string array — possible maiden/pre-marriage names"],
  "aliases": ["string array — known or likely aliases, nicknames, titles"],
  "entityVariants": ["string array — if this could be a company: legal suffixes, abbreviations"],
  "screeningStrings": ["string array — the exact strings to put into a screening system (prioritized, most critical first)"],
  "scriptVariants": ["string array — name written in original script if different from Latin"],
  "notes": "string — any special screening considerations e.g. 'Patronymic cultures: screen father name separately'"
}`;

function buildFallback(name: string): NameVariantsResponse {
  return {
    canonicalName: name,
    variants: [],
    transliterations: [],
    patronymics: [],
    maidenNames: [],
    aliases: [],
    entityVariants: [],
    screeningStrings: [name],
    scriptVariants: [],
    notes: "API key not configured.",
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 , headers: gate.headers});
  }

  const { name, nationality, dob, context } = body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 , headers: gate.headers});
  }

  const trimmedName = name.trim();
  writeAuditEvent("analyst", "screening.name-variants", trimmedName);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, ...buildFallback(trimmedName) }, { headers: gate.headers });
  }

  const userMessage = `Generate all name variants for AML screening: Name: ${trimmedName}, Nationality: ${nationality ?? "unknown"}, DOB: ${dob ?? "unknown"}, Context: ${context ?? "none"}`;

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();

    // Strip markdown fences before JSON.parse
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(stripped) as NameVariantsResponse;
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeAuditEvent("analyst", "screening.name-variants.error", `${trimmedName} — ${msg}`);
    return NextResponse.json({ ok: true, ...buildFallback(trimmedName) }, { headers: gate.headers });
  }
}
