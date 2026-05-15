// POST /api/deep-research
//
// Iterative deep-research intelligence engine for AML investigations.
// Architecture inspired by deep-research-web-ui (AnotiaWang/deep-research-web-ui):
//   1. Generate 3-5 targeted search queries for the subject
//   2. Execute all queries via Tavily (or fallback to Exa / free RSS)
//   3. Synthesise findings with Claude Haiku
//   4. Generate follow-up queries from gaps in round 1
//   5. Repeat for N rounds (default 3)
//   6. Produce a structured intelligence brief with citations
//
// Use cases:
//   - Pre-onboarding deep-dive on high-risk subjects
//   - EDD background research
//   - Investigation support for STR decisions
//   - PEP / adverse media deep scan
//
// Input:
//   { subject: string; jurisdiction?: string; entityType?: string;
//     rounds?: number; focusAreas?: string[] }
//
// Output:
//   { brief: string; citations: { url, title, relevance }[];
//     riskIndicators: string[]; suggestedFollowUp: string[];
//     roundCount: number; queryCount: number; latencyMs: number }
//
// Requires TAVILY_API_KEY (preferred) or EXA_API_KEY for search.
// Falls back to Serper/SerpAPI if neither is configured.
// Always requires ANTHROPIC_API_KEY for synthesis.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResearchRequest {
  subject: string;
  jurisdiction?: string;
  entityType?: string;
  rounds?: number;
  focusAreas?: string[];
}

interface Citation {
  url: string;
  title: string;
  snippet?: string;
  relevanceScore?: number;
  round: number;
}

interface ResearchResult {
  ok: true;
  brief: string;
  riskIndicators: string[];
  suggestedFollowUp: string[];
  citations: Citation[];
  roundCount: number;
  queryCount: number;
  searchProvider: string;
  latencyMs: number;
}

// ── Search provider wrappers ──────────────────────────────────────────────────

interface SearchResult { title: string; url: string; snippet?: string; score?: number }

async function tavilySearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      topic: "general",
      search_depth: "advanced",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };
  return (json.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content?.slice(0, 400),
    score: r.score,
  }));
}

async function exaSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      query,
      type: "neural",
      numResults: 8,
      contents: { text: { maxCharacters: 400 } },
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; text?: string; score?: number }> };
  return (json.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.text?.slice(0, 400),
    score: r.score,
  }));
}

async function serpSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ api_key: apiKey, q: query, tbm: "nws", num: "8" });
  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { news_results?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (json.news_results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: r.snippet,
  }));
}

function getSearchProvider(): { name: string; search: (q: string) => Promise<SearchResult[]> } | null {
  const tavily = process.env["TAVILY_API_KEY"];
  if (tavily) return { name: "tavily", search: (q) => tavilySearch(q, tavily) };
  const exa = process.env["EXA_API_KEY"];
  if (exa) return { name: "exa", search: (q) => exaSearch(q, exa) };
  const serp = process.env["SERPAPI_API_KEY"];
  if (serp) return { name: "serpapi", search: (q) => serpSearch(q, serp) };
  return null;
}

// ── Query generation ─────────────────────────────────────────────────────────

async function generateQueries(
  anthropic: ReturnType<typeof getAnthropicClient>,
  subject: string,
  jurisdiction: string,
  entityType: string,
  focusAreas: string[],
  previousFindings: string,
  round: number,
): Promise<string[]> {
  const focusStr = focusAreas.length > 0 ? `Focus on: ${focusAreas.join(", ")}.` : "";
  const prevStr = previousFindings
    ? `Previous research found: ${previousFindings.slice(0, 500)}. Generate follow-up queries to fill gaps.`
    : "";

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Generate ${round === 1 ? "5" : "3"} specific web search queries to research this subject for AML/compliance due diligence.

Subject: ${subject}
Jurisdiction: ${jurisdiction || "unknown"}
Entity type: ${entityType || "unknown"}
${focusStr}
${prevStr}

Return ONLY a JSON array of strings — no explanation:
["query1", "query2", "query3"]

Queries must target: sanctions, criminal proceedings, adverse media, regulatory actions, beneficial ownership, financial crime history, PEP links.`,
      },
    ],
  });

  const raw = msg.content[0]?.type === "text" ? (msg.content[0] as { type: "text"; text: string }).text.trim() : "[]";
  try {
    const queries = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as string[];
    return Array.isArray(queries) ? queries.slice(0, 5) : [];
  } catch {
    return [`"${subject}" sanctions`, `"${subject}" financial crime`, `"${subject}" criminal`];
  }
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

async function synthesise(
  anthropic: ReturnType<typeof getAnthropicClient>,
  subject: string,
  jurisdiction: string,
  allFindings: Array<{ query: string; results: SearchResult[] }>,
): Promise<{ brief: string; riskIndicators: string[]; suggestedFollowUp: string[] }> {
  const findingsText = allFindings
    .map((f) => `Query: ${f.query}\nResults:\n${f.results.map((r) => `- ${r.title}: ${r.snippet ?? ""}`).join("\n")}`)
    .join("\n\n");

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: `You are a senior AML investigator producing intelligence briefs for a UAE DPMS gold dealer's MLRO. Be factual, cite sources, flag risks clearly. Return valid JSON only.`,
    messages: [
      {
        role: "user",
        content: `Produce an intelligence brief for this subject based on the research findings below.

Subject: ${subject}
Jurisdiction: ${jurisdiction || "unknown"}

Research findings:
${findingsText.slice(0, 4000)}

Return ONLY valid JSON:
{
  "brief": "2-4 paragraph narrative intelligence summary covering AML risk profile, adverse media, regulatory history, and any PEP/sanctions exposure",
  "riskIndicators": ["specific red flag 1", "specific red flag 2"],
  "suggestedFollowUp": ["suggested action or additional inquiry 1", "suggested action 2"]
}`,
      },
    ],
  });

  const raw = msg.content[0]?.type === "text" ? (msg.content[0] as { type: "text"; text: string }).text.trim() : "{}";
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as {
      brief: string;
      riskIndicators: string[];
      suggestedFollowUp: string[];
    };
  } catch {
    return {
      brief: "Synthesis failed — see raw citations.",
      riskIndicators: [],
      suggestedFollowUp: ["Manual review required"],
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: ResearchRequest;
  try {
    body = (await req.json()) as ResearchRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "deep-research temporarily unavailable" }, { status: 503, headers: gate.headers });
  }

  const provider = getSearchProvider();
  if (!provider) {
    return NextResponse.json(
      { ok: false, error: "No search provider configured. Set TAVILY_API_KEY, EXA_API_KEY, or SERPAPI_API_KEY." },
      { status: 503, headers: gate.headers },
    );
  }

  const subject = sanitizeField(body.subject, 200);
  const jurisdiction = sanitizeField(body.jurisdiction ?? "", 100);
  const entityType = sanitizeField(body.entityType ?? "", 50);
  const rounds = Math.min(Math.max(body.rounds ?? 3, 1), 4);
  const focusAreas = (body.focusAreas ?? []).map((f) => sanitizeField(f, 100)).slice(0, 5);

  const t0 = Date.now();
  const anthropic = getAnthropicClient(apiKey, 55_000, "deep-research");
  const allFindings: Array<{ query: string; results: SearchResult[] }> = [];
  const citations: Citation[] = [];
  const seenUrls = new Set<string>();
  let totalQueries = 0;
  let previousFindings = "";

  for (let round = 1; round <= rounds; round++) {
    // Stop if we've used 45s — leave 10s for synthesis
    if (Date.now() - t0 > 45_000) break;

    let queries: string[];
    try {
      queries = await generateQueries(anthropic, subject, jurisdiction, entityType, focusAreas, previousFindings, round);
    } catch {
      queries = [`"${subject}" money laundering`, `"${subject}" sanctions criminal`];
    }

    totalQueries += queries.length;

    // Execute all queries in parallel
    const roundResults = await Promise.all(
      queries.map(async (query) => {
        try {
          const results = await provider.search(query);
          return { query, results };
        } catch {
          return { query, results: [] as SearchResult[] };
        }
      }),
    );

    for (const { query, results } of roundResults) {
      allFindings.push({ query, results });
      for (const r of results) {
        if (r.url && !seenUrls.has(r.url) && r.title) {
          seenUrls.add(r.url);
          citations.push({ url: r.url, title: r.title, snippet: r.snippet, relevanceScore: r.score, round });
        }
      }
    }

    // Build summary of this round for follow-up query generation
    previousFindings = allFindings
      .slice(-3)
      .map((f) => f.results.slice(0, 2).map((r) => r.title).join("; "))
      .join(" | ");
  }

  // Final synthesis
  let synthesis: { brief: string; riskIndicators: string[]; suggestedFollowUp: string[] };
  try {
    synthesis = await synthesise(anthropic, subject, jurisdiction, allFindings);
  } catch {
    synthesis = {
      brief: `Deep research completed for ${subject}. ${citations.length} sources found across ${totalQueries} queries. Manual review of citations recommended.`,
      riskIndicators: [],
      suggestedFollowUp: ["Review citations manually"],
    };
  }

  const result: ResearchResult = {
    ok: true,
    brief: synthesis.brief,
    riskIndicators: synthesis.riskIndicators,
    suggestedFollowUp: synthesis.suggestedFollowUp,
    citations: citations.slice(0, 30),
    roundCount: rounds,
    queryCount: totalQueries,
    searchProvider: provider.name,
    latencyMs: Date.now() - t0,
  };

  return NextResponse.json(result, { headers: gate.headers });
}
