// Hawkeye Sterling — Global Adverse News Aggregator
//
// Wraps the existing news adapters (GDELT, NewsAPI, Google News RSS, and others
// registered in newsAdapters.ts) into a single ranked, deduplicated, source-
// attributed news feed for adverse-media screening.
//
// Design principles:
//   - Real sources only: LLM adapters (Claude/Groq/Gemini) are NOT called here
//     to prevent fabricated results. Those remain in the augmentation pipeline.
//   - Multilingual: if the subject name contains non-Latin script, both the
//     original and a transliterated Latin form are queried; results are merged.
//   - Per-instance cache: 60-minute TTL prevents redundant external API calls
//     within a Lambda warm window. Same-instance cache miss falls through.
//   - Timeout: providers are already bounded by newsAdapters.ts/searchAllNews;
//     this layer adds a 2.5s aggregate cap via Promise.race.
//   - Ranking: recency (40%) + source credibility (30%) + adverse keyword
//     density (30%) — only real API responses, never AI-generated.

import { searchAllNews, type NewsArticle } from "@/lib/intelligence/newsAdapters";
import { transliterate } from "@/lib/intelligence/transliteration";
import { matchAmlKeywords } from "@/lib/intelligence/amlKeywords";

// ── Output shape ──────────────────────────────────────────────────────────────

export interface AggregatedNewsArticle {
  title: string;
  url: string;
  source: string;         // provider id ("newsapi", "gdelt", "google-news-rss", etc.)
  publishedAt: string;    // ISO 8601
  snippet?: string;
  relevanceScore: number; // 0–1 composite (recency + credibility + adverse density)
  adverseCategories: string[];   // adverse-media keyword categories detected
  language?: string;
}

export interface NewsAggregatorResult {
  articles: AggregatedNewsArticle[];
  providersUsed: string[];
  transliteratedQuery?: string;  // Latin form used when name was non-Latin
  cachedAt?: number;             // epoch ms when this result was cached
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface _AggCacheEntry {
  result: NewsAggregatorResult;
  cachedAt: number;
}
const _aggCache = new Map<string, _AggCacheEntry>();
const _AGG_CACHE_TTL_MS = 60 * 60 * 1_000;  // 60 minutes
const _AGG_CACHE_MAX = 1_000;

function _cacheKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 200);
}

// ── Source credibility scoring ────────────────────────────────────────────────
// Tier 1 (1.0): Major global wire services and official sources
// Tier 2 (0.75): Established regional newspapers, recognised trade press
// Tier 3 (0.5): All other verified news outlets
const HIGH_REP_OUTLETS = new Set([
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "ft.com",
  "wsj.com", "nytimes.com", "bloomberg.com", "economist.com",
  "theguardian.com", "aljazeera.com", "scmp.com", "dw.com",
  "lemonde.fr", "spiegel.de", "elpais.com", "corriere.it",
  "euronews.com", "rferl.org", "voanews.com", "france24.com",
  "un.org", "fatf-gafi.org", "treasury.gov", "ofac.treasury.gov",
  "ec.europa.eu", "gov.uk", "justice.gov", "fincen.gov",
]);

const MED_REP_OUTLETS = new Set([
  "arabnews.com", "thenational.ae", "gulfnews.com", "zawya.com",
  "middleeasteye.net", "haaretz.com", "thetimes.co.uk",
  "independent.co.uk", "telegraph.co.uk", "washingtonpost.com",
  "politico.com", "axios.com", "theintercept.com",
  "occrp.org", "icij.org", "bellingcat.com",
  "complianceweek.com", "acamstoday.org", "globalwitness.org",
]);

function _sourceCredibility(article: NewsArticle): number {
  const outlet = article.outlet?.toLowerCase().replace(/^www\./, "");
  if (!outlet) return 0.5;
  if (HIGH_REP_OUTLETS.has(outlet)) return 1.0;
  if (MED_REP_OUTLETS.has(outlet)) return 0.75;
  return 0.5;
}

// ── Recency scoring ───────────────────────────────────────────────────────────
// 1.0 = published now; 0.0 = published ≥ 1 year ago; linear decay
function _recencyScore(publishedAt: string): number {
  const ms = Date.now() - new Date(publishedAt).getTime();
  if (!isFinite(ms) || ms < 0) return 0.5;
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1_000;
  return Math.max(0, 1 - ms / ONE_YEAR_MS);
}

// ── Adverse keyword density scoring ─────────────────────────────────────────
function _adverseScore(article: NewsArticle): { score: number; categories: string[] } {
  const text = [article.title, article.snippet].filter(Boolean).join(" ");
  const keywords = matchAmlKeywords(text);
  // Cap density at 1.0 for 5+ adverse keywords
  const score = Math.min(1, keywords.length / 5);
  return { score, categories: keywords };
}

// ── Title Jaccard deduplication ──────────────────────────────────────────────
// Two articles with title Jaccard similarity ≥ 0.85 are considered duplicates.
// URL deduplication happens earlier in searchAllNews; this catches same-story
// articles across different syndication domains.
function _titleTokens(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2));
}

function _jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) { if (b.has(t)) intersection++; }
  return intersection / (a.size + b.size - intersection);
}

function _deduplicateByTitle(articles: NewsArticle[]): NewsArticle[] {
  const kept: NewsArticle[] = [];
  const keptTokens: Set<string>[] = [];
  for (const article of articles) {
    const tokens = _titleTokens(article.title);
    const isDuplicate = keptTokens.some((kt) => _jaccard(tokens, kt) >= 0.85);
    if (!isDuplicate) {
      kept.push(article);
      keptTokens.push(tokens);
    }
  }
  return kept;
}

// ── Main API ──────────────────────────────────────────────────────────────────

const AGG_TIMEOUT_MS = 2_500;

export async function aggregateNews(
  subjectName: string,
  opts?: { limit?: number; noCache?: boolean },
): Promise<NewsAggregatorResult> {
  // Cache check
  if (!opts?.noCache) {
    const key = _cacheKey(subjectName);
    const cached = _aggCache.get(key);
    if (cached && Date.now() - cached.cachedAt < _AGG_CACHE_TTL_MS) {
      return { ...cached.result, cachedAt: cached.cachedAt };
    }
  }

  // Detect non-Latin script and build Latin transliteration for search.
  const tr = transliterate(subjectName);
  const isNonLatin = tr.scriptDetected !== "latin" && tr.scriptDetected !== "unknown";
  const transliteratedQuery = isNonLatin && tr.transliterated !== subjectName
    ? tr.transliterated
    : undefined;

  // Fire all provider queries in parallel, capped at AGG_TIMEOUT_MS.
  // For non-Latin names, query both the original and the Latin form.
  const queries: Promise<{ articles: NewsArticle[]; providersUsed: string[] }>[] = [
    searchAllNews(subjectName, { limit: opts?.limit ?? 50, since: undefined }),
  ];
  if (transliteratedQuery) {
    queries.push(searchAllNews(transliteratedQuery, { limit: opts?.limit ?? 50, since: undefined }));
  }

  const timeoutPromise = new Promise<{ articles: NewsArticle[]; providersUsed: string[] }[]>(
    (resolve) => setTimeout(() => resolve([{ articles: [], providersUsed: [] }]), AGG_TIMEOUT_MS),
  );

  const settled = await Promise.race([
    Promise.all(queries),
    timeoutPromise,
  ]);

  // Merge all results
  const allArticles: NewsArticle[] = settled.flatMap((r) => r.articles);
  const allProviders: string[] = [...new Set(settled.flatMap((r) => r.providersUsed))];

  // URL deduplication (should already be done by searchAllNews, but merge may create dupes)
  const seenUrls = new Set<string>();
  const urlDeduped = allArticles.filter((a) => {
    const k = a.url.toLowerCase();
    if (seenUrls.has(k)) return false;
    seenUrls.add(k);
    return true;
  });

  // Title Jaccard deduplication for cross-domain syndication
  const deduped = _deduplicateByTitle(urlDeduped);

  // Score and rank each article
  const scored: AggregatedNewsArticle[] = deduped.map((a) => {
    const recency = _recencyScore(a.publishedAt);
    const credibility = _sourceCredibility(a);
    const { score: adverseDensity, categories } = _adverseScore(a);
    const relevanceScore = recency * 0.40 + credibility * 0.30 + adverseDensity * 0.30;
    return {
      title: a.title,
      url: a.url,
      source: a.source,
      publishedAt: a.publishedAt,
      snippet: a.snippet,
      relevanceScore,
      adverseCategories: categories,
      language: a.language,
    };
  });

  // Sort by relevance descending
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const result: NewsAggregatorResult = {
    articles: scored,
    providersUsed: allProviders,
    ...(transliteratedQuery ? { transliteratedQuery } : {}),
  };

  // Cache result (FIFO eviction at cap)
  if (!opts?.noCache) {
    const key = _cacheKey(subjectName);
    if (_aggCache.size >= _AGG_CACHE_MAX) {
      const firstKey = _aggCache.keys().next().value;
      if (firstKey !== undefined) _aggCache.delete(firstKey);
    }
    const now = Date.now();
    _aggCache.set(key, { result, cachedAt: now });
    return { ...result, cachedAt: now };
  }

  return result;
}

export { _deduplicateByTitle as _testOnly_deduplicateByTitle };
export { _jaccard as _testOnly_jaccard };
export { _titleTokens as _testOnly_titleTokens };
export { _recencyScore as _testOnly_recencyScore };
export { _aggCache as _testOnly_aggCache };
export { _AGG_CACHE_TTL_MS as _testOnly_AGG_CACHE_TTL_MS };
