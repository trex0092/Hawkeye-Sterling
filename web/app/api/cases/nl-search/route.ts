// POST /api/cases/nl-search
//
// Natural-language case search. Accepts a plain-English query from the
// MLRO (e.g. "Turkey-linked VASPs with adverse media and no EDD") and
// uses Claude to parse it into structured filters, then applies those
// filters against the subjects array supplied by the client (which holds
// subjects in localStorage — not accessible server-side).
//
// Body: { query: string; subjects: SubjectSlim[] }
//   SubjectSlim is a minimal projection of Subject passed from the client.
//
// Response: { ok: true; matchIds: string[]; parsedFilters: ParsedFilters; interpretation: string }

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface SubjectSlim {
  id: string;
  name: string;
  meta: string;
  country: string;
  jurisdiction: string;
  entityType: string;
  riskScore: number;
  cddPosture: string;
  listCoverage: string[];
  status: string;
  pep?: { tier: string } | null;
  adverseMedia?: { reference?: string } | null;
  aliases?: string[];
}

interface ParsedFilters {
  jurisdiction?: string;
  entityType?: string;
  minScore?: number;
  maxScore?: number;
  hasAdverseMedia?: boolean;
  hasEdd?: boolean;
  hasPep?: boolean;
  hasSanctions?: boolean;
  status?: string;
  keywords?: string[];
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content: AnthropicTextBlock[];
}

async function parseQuery(query: string): Promise<{ filters: ParsedFilters; interpretation: string }> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return { filters: {}, interpretation: query };

  const systemPrompt = `You are an AML case filter parser for a compliance screening tool.
Given a compliance officer's natural language query, output ONLY a valid JSON object.
The JSON must have two top-level fields:
1. "filters" — an object with these optional fields:
   - jurisdiction: string (ISO-2 country code or country name)
   - entityType: "individual" | "organisation" | "vessel" | "aircraft" | "other"
   - minScore: number (0-100, minimum risk score)
   - maxScore: number (0-100, maximum risk score)
   - hasAdverseMedia: boolean
   - hasEdd: boolean (true = only subjects with EDD posture)
   - hasPep: boolean
   - hasSanctions: boolean (true = only subjects with list coverage hits)
   - status: "active" | "frozen" | "cleared"
   - keywords: string[] (terms to match against name/meta fields)
2. "interpretation": string (1 sentence explaining what was understood)

Output ONLY the JSON object — no markdown, no prose, no code fences.`;

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
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: query }],
      }),
    });
    if (!res.ok) return { filters: {}, interpretation: query };
    const data = (await res.json()) as AnthropicResponse;
    const text = data.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text.trim()) as { filters?: ParsedFilters; interpretation?: string };
    return {
      filters: parsed.filters ?? {},
      interpretation: parsed.interpretation ?? query,
    };
  } catch {
    return { filters: {}, interpretation: query };
  }
}

function applyFilters(subjects: SubjectSlim[], filters: ParsedFilters): string[] {
  return subjects
    .filter((s) => {
      if (filters.status && s.status !== filters.status) return false;
      if (filters.hasEdd && s.cddPosture !== "EDD") return false;
      if (filters.hasAdverseMedia && !s.adverseMedia) return false;
      if (filters.hasPep && !s.pep) return false;
      if (filters.hasSanctions && s.listCoverage.length === 0) return false;
      if (filters.minScore !== undefined && s.riskScore < filters.minScore) return false;
      if (filters.maxScore !== undefined && s.riskScore > filters.maxScore) return false;
      if (filters.entityType && s.entityType !== filters.entityType) return false;
      if (filters.jurisdiction) {
        const jLower = filters.jurisdiction.toLowerCase();
        if (
          !s.jurisdiction.toLowerCase().includes(jLower) &&
          !s.country.toLowerCase().includes(jLower) &&
          !s.meta.toLowerCase().includes(jLower)
        ) return false;
      }
      if (filters.keywords && filters.keywords.length > 0) {
        const haystack = `${s.name} ${s.meta} ${(s.aliases ?? []).join(" ")}`.toLowerCase();
        if (!filters.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) return false;
      }
      return true;
    })
    .map((s) => s.id);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { query?: string; subjects?: SubjectSlim[] };
    const query = (body.query ?? "").trim();
    const subjects = body.subjects ?? [];
    if (!query) {
      return NextResponse.json({ ok: false, error: "query required" }, { status: 400 });
    }

    const { filters, interpretation } = await parseQuery(query);
    const matchIds = applyFilters(subjects, filters);

    return NextResponse.json({ ok: true, matchIds, parsedFilters: filters, interpretation });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unexpected error" },
      { status: 500 },
    );
  }
}
