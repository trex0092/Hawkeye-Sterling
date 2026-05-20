// POST /api/adverse-media
// Weaponized adverse-media pipeline:
//   1. Fetch from Taranis AI (live OSINT news feed)
//   2. Classify each item against the 737-keyword taxonomy (12 categories)
//   3. Map to FATF predicate offenses + reasoning modes
//   4. Score severity (critical/high/medium/low/clear)
//   5. Evaluate SAR trigger (FATF R.20)
//   6. Generate MLRO investigation narrative
//
// Returns a full AdverseMediaSubjectVerdict — MLRO-grade intelligence report.
//
// Body: { subject: string, dateFrom?: string, dateTo?: string, limit?: number, minRelevance?: number }

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { searchAdverseMedia, type TaranisItem } from "../../../../dist/src/integrations/taranisAi.js";
import { analyseAdverseMediaResult, analyseAdverseMediaItems } from "../../../../dist/src/brain/adverse-media-analyser.js";
import { type GdeltArticle } from "@/lib/intelligence/gdelt-cache";
import { getStore } from "@netlify/blobs";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface AdverseMediaBody {
  subject: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  minRelevance?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: AdverseMediaBody;
  try {
    body = (await req.json()) as AdverseMediaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  const subject = sanitizeField(body.subject.trim(), 300);
  const routeStartMs = Date.now();

  // Bound the upstream call so a hung Taranis can't burn the whole 30s
  // function budget. Any timeout or thrown error short-circuits to the
  // GDELT live-feed fallback below — never a silent CLEAR verdict.
  const TARANIS_TIMEOUT_MS = 18_000;
  const taranisResult = await Promise.race([
    searchAdverseMedia(subject, {
      ...(body.dateFrom !== undefined ? { dateFrom: body.dateFrom } : {}),
      ...(body.dateTo !== undefined ? { dateTo: body.dateTo } : {}),
      limit: typeof body.limit === "number" ? Math.max(1, Math.min(body.limit, 100)) : 50,
      minRelevance: typeof body.minRelevance === "number" ? Math.max(0, Math.min(body.minRelevance, 1)) : 0,
    }),
    new Promise<{ ok: false; error: string }>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, error: `Taranis request exceeded ${TARANIS_TIMEOUT_MS}ms` }),
        TARANIS_TIMEOUT_MS,
      ),
    ),
  ]).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));

  if (!taranisResult.ok) {
    const taranisErr = taranisResult.error ?? "unknown";
    const isConfigError = taranisErr.includes("not configured");
    if (!isConfigError) console.error("[adverse-media] Taranis error:", taranisErr);
    // Taranis unavailable (or not configured) — fall back to live GDELT fetch.
    // liveAdverseMedia throws when ANTHROPIC_API_KEY is also missing; catch that
    // and return a properly-typed degraded verdict so the caller never sees a
    // silent CLEAR or an unhandled 500.
    try {
      const elapsedMs = Date.now() - routeStartMs;
      const remainingBudgetMs = Math.max(5_000, 27_000 - elapsedMs); // 27s safety buffer (30s maxDuration - 3s)
      const verdict = await liveAdverseMedia(subject, remainingBudgetMs);
      return NextResponse.json(
        {
          ok: true,
          totalCount: verdict.totalItems,
          adverseCount: verdict.adverseItems,
          highRelevanceCount: verdict.criticalCount + verdict.highCount,
          verdict,
          ...(isConfigError ? {} : { note: "Taranis unavailable — GDELT live feed used" }),
        },
        { status: 200, headers: { ...CORS, ...gateHeaders } },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[adverse-media] both Taranis and GDELT/Claude unavailable:", detail);
      const now = new Date().toISOString();
      const degraded = {
        subject,
        riskTier: "unknown" as const,
        riskDetail: `Adverse media unavailable — neither Taranis nor live GDELT/Claude path is reachable (${detail}). Manual MLRO review required.`,
        totalItems: 0,
        adverseItems: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        sarRecommended: false,
        sarBasis: "Cannot determine — adverse-media pipeline unavailable",
        confidenceTier: "low" as const,
        confidenceBasis: detail,
        counterfactual: "Restore Taranis or set ANTHROPIC_API_KEY and re-run",
        investigationLines: ["Perform manual adverse-media search via Google, Reuters, Bloomberg"],
        findings: [],
        fatfRecommendations: ["R.10", "R.20"],
        categoryBreakdown: [],
        analysedAt: now,
        modesCited: [],
      };
      return NextResponse.json(
        {
          ok: true,
          totalCount: 0,
          adverseCount: 0,
          highRelevanceCount: 0,
          verdict: degraded,
          degraded: true,
          degradedReason: detail,
        },
        { status: 200, headers: { ...CORS, ...gateHeaders } },
      );
    }
  }

  // Run the weaponized analyser — full MLRO-grade intelligence pipeline
  const verdict = analyseAdverseMediaResult(subject, taranisResult);

  // Write audit chain entry — every adverse-media query is a compliance action.
  // FDL 10/2025 Art.20 requires traceable records for SAR-triggering intelligence.
  void writeAuditChainEntry({
    event: "adverse_media.completed",
    actor: gate.keyId,
    subject,
    riskTier: (verdict as unknown as Record<string, unknown>).riskTier ?? "unknown",
    sarRecommended: (verdict as unknown as Record<string, unknown>).sarRecommended ?? false,
    totalCount: taranisResult.totalCount,
    adverseCount: taranisResult.adverseCount,
    aiGenerated: true,
  }).catch((err: unknown) => {
    console.error("[adverse-media] audit chain write failed:", err instanceof Error ? err.message : String(err));
  });

  return NextResponse.json(
    {
      ok: true,
      // Raw Taranis counts for backward compat
      totalCount: taranisResult.totalCount,
      adverseCount: taranisResult.adverseCount,
      highRelevanceCount: taranisResult.highRelevanceCount,
      // Weaponized analysis
      verdict,
      // Compliance disclosure: AI-generated content (FDL 10/2025 Art.22)
      aiGenerated: true,
      aiModel: "keyword-classifier+mlro-analyser",
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}

// ─── GDELT — served from Netlify Blobs cache only ────────────────────────────
// Live GDELT calls removed from the request path. Articles are now pre-warmed
// by netlify/functions/gdelt-prefetch.mts (every 6 h) and read from Blobs.
// If no cached result exists for a subject, GDELT is skipped entirely so the
// route never pays the 8 000+ ms live-fetch penalty.

function _parseSeen(s: string | undefined): string {
  if (!s) return new Date().toISOString().slice(0, 10);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
}

// Convert a GDELT article to the TaranisItem shape so the deterministic
// 737-keyword classifier can process it without requiring an LLM.
function gdeltToTaranisItem(a: GdeltArticle, index: number): TaranisItem {
  const published = (() => {
    if (!a.seendate) return new Date().toISOString();
    const m = a.seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : a.seendate;
  })();
  return {
    id: a.url ?? String(index),
    title: a.title ?? "",
    content: a.title ?? "",   // GDELT artlist mode has no body text; title is the best signal
    source: a.domain ?? "gdelt",
    published,
    ...(a.url ? { url: a.url } : {}),
    ...(a.language ? { language: a.language } : {}),
    tags: a.riskCategories ?? [],
    entities: [],
    ...(a.relevance !== undefined ? { relevanceScore: a.relevance } : {}),
  } as TaranisItem;
}

// Serve GDELT articles from Netlify Blobs cache (pre-warmed by gdelt-prefetch.mts).
// Primary analysis path: Claude provides narrative + structured findings.
// Fallback path: when ANTHROPIC_API_KEY is absent, the deterministic
// 737-keyword classifier runs directly on whatever articles are cached.
async function liveAdverseMedia(subject: string, _budgetMs = 20_000) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // 1. Read GDELT articles from Netlify Blobs cache.
  //    The gdelt-prefetch.mts scheduled function (every 6 h) pre-warms this cache.
  //    If no cached result exists for this subject, GDELT is skipped entirely —
  //    no live network call, zero latency impact.
  let items: GdeltArticle[] = [];
  try {
    const blobStore = getStore({ name: "gdelt-cache" });
    const cached = await blobStore.get(`gdelt:${subject}`, { type: "json" }) as {
      articles: GdeltArticle[];
      cachedAt: string;
    } | null;
    if (cached?.articles && Array.isArray(cached.articles)) {
      items = cached.articles;
    }
  } catch {
    // Blobs unavailable or key not yet cached for this subject — GDELT skipped.
  }

  // When no Anthropic key is configured, run the deterministic 737-keyword
  // classifier directly on the (possibly empty) cached articles.
  if (!apiKey) {
    const taranisItems = items.slice(0, 50).map(gdeltToTaranisItem);
    const verdict = analyseAdverseMediaItems(subject, taranisItems);
    return { ...verdict, gdeltSource: true, gdeltArticleCount: items.length, keywordClassifierOnly: true };
  }

  const now = new Date().toISOString();

  // 2. Build article block — Claude analyses REAL headlines with enriched metadata
  const articleBlock =
    items.length > 0
      ? items
          .slice(0, 50)
          .map((a, i) => {
            const date = _parseSeen(a.seendate);
            const tone = (a.tone ?? 0).toFixed(1);
            const srcScore = a.sourceScore != null ? ` | rep:${a.sourceScore.toFixed(2)}` : "";
            const cats = a.riskCategories?.length ? ` | [${a.riskCategories.join(",")}]` : "";
            return `[${i + 1}] ${date} | ${a.domain ?? "unknown"}${srcScore}${cats} | tone:${tone} | "${a.title}"`;
          })
          .join("\n")
      : "No articles found in GDELT 10-year corpus for this subject.";

  const client = getAnthropicClient(apiKey, 25_000);
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: `You are an MLRO adverse-media intelligence system operating for a UAE-regulated financial institution. You have been given REAL live news articles fetched from the GDELT global news corpus (Art.19 FDL 10/2025 — 10-year lookback).

CRITICAL INSTRUCTION: Base your assessment SOLELY on the articles provided by the user. Do NOT use your training knowledge to add, invent, or assume facts not present in the article list. If no articles were found, return riskTier "clear" with zero counts.

Return ONLY valid JSON matching this exact shape (no markdown, no explanation):
{
  "subject": "string",
  "riskTier": "clear|low|medium|high|critical",
  "riskDetail": "one sentence summary citing specific article dates/sources found above",
  "totalItems": number,
  "adverseItems": number,
  "criticalCount": number,
  "highCount": number,
  "mediumCount": number,
  "lowCount": number,
  "sarRecommended": boolean,
  "sarBasis": "reason or N/A",
  "confidenceTier": "high|medium|low",
  "confidenceBasis": "basis for confidence — note GDELT coverage and article count",
  "counterfactual": "what additional information would change this assessment",
  "investigationLines": ["line1", "line2"],
  "findings": [
    {
      "itemId": "1",
      "title": "exact headline from article list",
      "source": "domain from article list",
      "published": "YYYY-MM-DD from article list",
      "severity": "critical|high|medium|low|clear",
      "categories": ["sanctions|fraud|money_laundering|corruption|law_enforcement|investigation|terrorism|crypto|dpms|adverse_media"],
      "keywords": ["keyword"],
      "fatfRecommendations": ["R.20"],
      "fatfPredicates": ["predicate offense"],
      "reasoningModes": ["mode"],
      "narrative": "brief MLRO narrative for this specific article",
      "relevanceScore": 0.8,
      "isSarCandidate": false
    }
  ],
  "fatfRecommendations": ["R.20"],
  "categoryBreakdown": [{"categoryId":"sanctions","displayName":"Sanctions","count":0,"severity":"clear"}],
  "analysedAt": "ISO timestamp",
  "modesCited": ["mode"],
  "gdeltSource": true,
  "gdeltArticleCount": number
}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analyse adverse media for subject: "${subject}"
GDELT lookback anchored to: ${now.slice(0, 10)}
Live articles retrieved from GDELT (${items.length} total):
${articleBlock}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // Claude can occasionally return prose that doesn't parse — pull the
  // outermost {…} block as a recovery, then surface a degraded verdict
  // (NOT a silent CLEAR) if that still fails.
  const tryParse = (raw: string): ReturnType<typeof analyseAdverseMediaResult> | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ReturnType<typeof analyseAdverseMediaResult>;
    } catch {
      return null;
    }
  };
  const parsed = tryParse(clean) ?? (() => {
    const m = clean.match(/\{[\s\S]*\}/);
    return m ? tryParse(m[0]) : null;
  })();
  if (parsed) return parsed;

  console.warn(`[adverse-media] Claude returned non-JSON (subject redacted) — surfacing degraded verdict`);
  const degraded: ReturnType<typeof analyseAdverseMediaResult> & {
    gdeltSource: boolean;
    gdeltArticleCount: number;
    claudeParseFailed: boolean;
  } = {
    subject,
    riskTier: "unknown",
    riskDetail: `Adverse media analysis incomplete — Claude returned a non-JSON response (${items.length} GDELT articles fetched). Manual MLRO review required.`,
    totalItems: items.length,
    adverseItems: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    sarRecommended: false,
    sarBasis: "Cannot determine — Claude response could not be parsed",
    confidenceTier: "low",
    confidenceBasis: `Parser fallback; Claude raw length ${text.length} chars`,
    counterfactual: "Re-run the request — Claude responses are stochastic; the next call usually parses cleanly",
    investigationLines: ["Perform manual adverse-media review of the GDELT articles fetched for this subject"],
    findings: [],
    fatfRecommendations: ["R.10", "R.20"],
    categoryBreakdown: [],
    analysedAt: now,
    modesCited: [],
    gdeltSource: true,
    gdeltArticleCount: items.length,
    claudeParseFailed: true,
  };
  return degraded;
}
