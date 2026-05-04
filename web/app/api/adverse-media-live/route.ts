// POST /api/adverse-media-live
// Real-time adverse media lookup via GDELT Project API (free, no key required).
// Searches for a named subject combined with AML/financial-crime keywords,
// returns scored results with risk rating.
//
// If ANTHROPIC_API_KEY is set, Claude generates a structured summary and
// per-article category tags.
//
// Body: { subjectName: string; entityType?: string; jurisdiction?: string }

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AdverseMediaLiveResult {
  ok: true;
  subject: string;
  totalHits: number;
  riskScore: number; // 0-100
  riskRating: "critical" | "high" | "medium" | "low" | "clear";
  articles: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string;
    tone: number;
    relevanceScore: number;
    categories: string[]; // e.g. ["sanctions", "fraud", "corruption"]
    snippet: string;
  }>;
  summary: string;
  regulatoryBasis: string;
}

interface AdverseMediaLiveBody {
  subjectName: string;
  entityType?: string;
  jurisdiction?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GDELT helpers
// ─────────────────────────────────────────────────────────────────────────────

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 10_000;

// FDL 10/2025 Art.19 mandates a 10-year adverse-media lookback for every
// CDD/EDD screening event. The window is rolling — anchored to the moment
// the screening request lands on the server, not to a fixed cutoff — so
// "today minus ten years" shifts forward each calendar day.
const ART19_LOOKBACK_YEARS = 10;
const GDELT_MAX_RECORDS = 75; // 7d→10y window expands result volume; cap at 75

function mkAbort(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string; // "20250501T120000Z"
  domain?: string;
  tone?: number;
  relevance?: number;
  socialimage?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

function gdeltDate(seendate: string | undefined): string {
  if (!seendate) return new Date().toISOString();
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return seendate;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

// GDELT DOC 2.0 startdatetime / enddatetime expect YYYYMMDDHHMMSS in UTC.
function gdeltDateTime(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

// Returns { start, end } where end is "now" and start is exactly N years
// earlier on the same calendar date. Calendar arithmetic (setUTCFullYear)
// handles leap years correctly — Feb 29 → Feb 28 / Mar 1 transitions are
// resolved by the JS Date object the same way regulators expect.
function art19Window(years = ART19_LOOKBACK_YEARS): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  return { start, end };
}

// Infer broad categories from title/domain text
function inferCategories(title: string, domain: string): string[] {
  const text = (title + " " + domain).toLowerCase();
  const cats: string[] = [];
  if (/sanction|ofac|sdn|designation/.test(text)) cats.push("sanctions");
  if (/fraud|scam|ponzi|embezzl/.test(text)) cats.push("fraud");
  if (/money.launder|aml|ml\b/.test(text)) cats.push("money_laundering");
  if (/corrupt|brib/.test(text)) cats.push("corruption");
  if (/arrest|indict|convict|guilty|prosecut/.test(text)) cats.push("law_enforcement");
  if (/investigat/.test(text)) cats.push("investigation");
  if (/terror|militant/.test(text)) cats.push("terrorism");
  if (/crypto|bitcoin|virtual.asset/.test(text)) cats.push("crypto");
  if (/gold|silver|precious|dpms/.test(text)) cats.push("dpms");
  if (cats.length === 0) cats.push("adverse_media");
  return cats;
}

async function queryGdelt(subjectName: string): Promise<GdeltArticle[]> {
  const rawQuery = `"${subjectName}" AND (sanctions OR fraud OR "money laundering" OR corruption OR crime OR arrest OR investigation)`;
  // Art.19 rolling 10-year window — anchored to "now" at request time
  // so the lookback advances day-by-day. Earlier revisions hard-coded
  // timespan=7d, which silently scored decade-old prosecutions as CLEAR
  // (e.g. the Reuters Istanbul Gold Refinery arrest reporting).
  const { start, end } = art19Window();
  const params = new URLSearchParams({
    query: rawQuery,
    mode: "artlist",
    maxrecords: String(GDELT_MAX_RECORDS),
    format: "json",
    sort: "DateDesc",
    startdatetime: gdeltDateTime(start),
    enddatetime: gdeltDateTime(end),
  });
  const url = `${GDELT_BASE}?${params.toString()}`;
  const { signal, clear } = mkAbort(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; adverse-media-live)",
        accept: "application/json",
      },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as GdeltResponse;
    return Array.isArray(data.articles) ? data.articles.filter((a) => a.url && a.title) : [];
  } catch {
    return [];
  } finally {
    clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk scoring
// ─────────────────────────────────────────────────────────────────────────────

function computeRiskScore(
  articles: GdeltArticle[],
  totalHits: number,
): number {
  if (totalHits === 0) return 0;

  // Hit volume weight (0-40 pts)
  const hitScore = Math.min(40, totalHits * 4);

  // Average negative tone (0-40 pts) — GDELT tone ranges roughly -10 to +10
  const tones = articles.map((a) => a.tone ?? 0).filter((t) => t < 0);
  const avgNegTone = tones.length > 0 ? tones.reduce((s, t) => s + t, 0) / tones.length : 0;
  const toneScore = Math.min(40, Math.abs(avgNegTone) * 4);

  // Recency (0-20 pts) — count articles in last 24h
  const oneDayAgo = Date.now() - 86_400_000;
  const recentCount = articles.filter((a) => {
    if (!a.seendate) return false;
    return new Date(gdeltDate(a.seendate)).getTime() > oneDayAgo;
  }).length;
  const recencyScore = Math.min(20, recentCount * 5);

  return Math.min(100, Math.round(hitScore + toneScore + recencyScore));
}

function scoreToRating(score: number): AdverseMediaLiveResult["riskRating"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 10) return "low";
  return "clear";
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude enrichment (optional)
// ─────────────────────────────────────────────────────────────────────────────

async function enrichWithClaude(
  subjectName: string,
  entityType: string | undefined,
  articles: AdverseMediaLiveResult["articles"],
  riskScore: number,
  riskRating: string,
): Promise<{ summary: string; articlesWithCategories: AdverseMediaLiveResult["articles"] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || articles.length === 0) {
    return { summary: buildFallbackSummary(subjectName, articles, riskScore, riskRating), articlesWithCategories: articles };
  }

  const client = getAnthropicClient(apiKey, 55_000);

  const articleSummaries = articles
    .slice(0, 8)
    .map((a, i) => `[${i + 1}] "${a.title}" (${a.source}, tone: ${a.tone.toFixed(1)})`)
    .join("\n");

  const systemPrompt = `You are an AML compliance analyst at a UAE-regulated financial institution.
Your task is to analyse adverse media results from GDELT for a named subject.
Respond ONLY with valid JSON matching this exact schema, no commentary:
{
  "summary": "string (2-4 sentences, professional AML tone, cite FATF R.10 and FDL 10/2025 Art.10)",
  "articleCategories": [
    {"index": 1, "categories": ["sanctions","fraud",...]}
  ]
}
Categories must be from: sanctions, fraud, money_laundering, corruption, law_enforcement, investigation, terrorism, crypto, dpms, adverse_media, regulatory_action, asset_seizure, political_risk`;

  const userPrompt = `Subject: "${subjectName}"${entityType ? ` (${entityType})` : ""}
Risk Score: ${riskScore}/100 (${riskRating})
Articles found:\n${articleSummaries}

Generate the JSON response.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      articleCategories?: Array<{ index: number; categories: string[] }>;
    };

    const catMap = new Map<number, string[]>();
    for (const ac of parsed.articleCategories ?? []) {
      catMap.set(ac.index, ac.categories ?? []);
    }

    const enrichedArticles = articles.map((a, i) => ({
      ...a,
      categories: catMap.get(i + 1) ?? a.categories,
    }));

    return {
      summary: parsed.summary ?? buildFallbackSummary(subjectName, articles, riskScore, riskRating),
      articlesWithCategories: enrichedArticles,
    };
  } catch {
    return {
      summary: buildFallbackSummary(subjectName, articles, riskScore, riskRating),
      articlesWithCategories: articles,
    };
  }
}

function buildFallbackSummary(
  subjectName: string,
  articles: AdverseMediaLiveResult["articles"],
  riskScore: number,
  riskRating: string,
): string {
  if (articles.length === 0) {
    return `No adverse media identified for "${subjectName}" across the GDELT 10-year corpus (FDL 10/2025 Art.19 lookback). Ongoing monitoring per FATF R.10 and FDL 10/2025 Art.10 continues; document this negative finding to the Art.19 audit log.`;
  }
  const sourceList = [...new Set(articles.slice(0, 3).map((a) => a.source))].join(", ");
  return `Adverse media search for "${subjectName}" returned ${articles.length} article(s) (risk score: ${riskScore}/100 — ${riskRating}). ` +
    `Sources include: ${sourceList}. ` +
    `Per FATF R.10 and FDL 10/2025 Art.10, these findings require review as part of ongoing CDD monitoring. ` +
    `Escalate to MLRO if any sanctioned-entity or predicate-offence nexus is confirmed.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback result
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK: Omit<AdverseMediaLiveResult, "subject"> = {
  ok: true,
  totalHits: 0,
  riskScore: 0,
  riskRating: "clear",
  articles: [],
  summary: "No adverse media found in GDELT index for this subject.",
  regulatoryBasis: "FATF R.10 (CDD), FDL 10/2025 Art.10 (ongoing monitoring)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key",
    },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: AdverseMediaLiveBody;
  try {
    body = (await req.json()) as AdverseMediaLiveBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const subjectName = body.subjectName?.trim();
  if (!subjectName) {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400 },
    );
  }

  // Query GDELT — fallback gracefully on any failure
  let rawArticles: GdeltArticle[] = [];
  try {
    rawArticles = await queryGdelt(subjectName);
  } catch {
    // Return fallback on complete failure
    return NextResponse.json({
      ...FALLBACK,
      subject: subjectName,
    } satisfies AdverseMediaLiveResult);
  }

  if (rawArticles.length === 0) {
    return NextResponse.json({
      ...FALLBACK,
      subject: subjectName,
    } satisfies AdverseMediaLiveResult);
  }

  const totalHits = rawArticles.length;

  // Map GDELT articles to our schema
  const articles: AdverseMediaLiveResult["articles"] = rawArticles.map((a) => ({
    title: a.title ?? "",
    source: a.domain ?? "GDELT",
    url: a.url ?? "",
    publishedAt: gdeltDate(a.seendate),
    tone: a.tone ?? 0,
    relevanceScore: a.relevance != null ? Math.round(a.relevance * 100) : 50,
    categories: inferCategories(a.title ?? "", a.domain ?? ""),
    snippet: "", // GDELT artlist mode doesn't return snippets
  }));

  // Sort by tone ascending (most negative first)
  articles.sort((a, b) => a.tone - b.tone);

  const riskScore = computeRiskScore(rawArticles, totalHits);
  const riskRating = scoreToRating(riskScore);

  // Optionally enrich with Claude
  const { summary, articlesWithCategories } = await enrichWithClaude(
    subjectName,
    body.entityType,
    articles,
    riskScore,
    riskRating,
  );

  const result: AdverseMediaLiveResult = {
    ok: true,
    subject: subjectName,
    totalHits,
    riskScore,
    riskRating,
    articles: articlesWithCategories,
    summary,
    regulatoryBasis: "FATF R.10 (CDD), FDL 10/2025 Art.10 (ongoing monitoring)",
  };

  return NextResponse.json(result);
}
