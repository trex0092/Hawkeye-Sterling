// Hawkeye Sterling — adverse-media ingestion (Phase 6).
// Four pluggable providers: NewsAPI, GDELT DOC API, Google Programmable
// Search (CSE), and generic RSS. Each returns normalised
// AdverseMediaArticle items the brain can score via
// classifyAdverseMedia() (from src/brain/adverse-media.ts).

declare const process: { env?: Record<string, string | undefined> } | undefined;

import { ADVERSE_MEDIA_QUERY, classifyAdverseMedia, type AdverseMediaHit } from '../brain/adverse-media.js';

export interface AdverseMediaArticle {
  source: 'newsapi' | 'gdelt' | 'google_cse' | 'rss';
  sourceDomain?: string;
  headline: string;
  url: string;
  publishedAt?: string;
  excerpt?: string;
  language?: string;
  hits: AdverseMediaHit[];
}

export interface SearchOptions {
  subjectName?: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}

/** NewsAPI.org v2 — requires NEWSAPI_KEY. */
export async function searchNewsApi(opts: SearchOptions): Promise<AdverseMediaArticle[]> {
  const apiKey = (typeof process !== 'undefined' ? process.env?.NEWSAPI_KEY : undefined);
  if (!apiKey) throw new Error('NEWSAPI_KEY not set');
  const fetchImpl = opts.fetchImpl ?? fetch;
  const q = opts.subjectName ? `"${opts.subjectName.replace(/"/g, '')}" AND (${ADVERSE_MEDIA_QUERY})` : ADVERSE_MEDIA_QUERY;
  const url = new URL('https://newsapi.org/v2/everything');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', String(opts.limit ?? 25));
  if (opts.fromIso) url.searchParams.set('from', opts.fromIso);
  if (opts.toIso) url.searchParams.set('to', opts.toIso);
  url.searchParams.set('language', 'en');
  url.searchParams.set('sortBy', 'publishedAt');
  const res = await fetchImpl(url.toString(), { headers: { 'x-api-key': apiKey } });
  if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);
  const json = (await res.json()) as { articles?: Array<{ title?: string; url?: string; publishedAt?: string; description?: string; source?: { name?: string } }> };
  return (json.articles ?? []).map((a) => {
    const text = `${a.title ?? ''} ${a.description ?? ''}`;
    const rawDomain = a.source?.name ?? (a.url ? new URL(a.url).hostname : undefined);
    const rawExcerpt = a.description ?? undefined;
    return {
      source: 'newsapi' as const,
      ...(rawDomain !== undefined ? { sourceDomain: rawDomain } : {}),
      headline: a.title ?? '',
      url: a.url ?? '',
      ...(a.publishedAt !== undefined ? { publishedAt: a.publishedAt } : {}),
      ...(rawExcerpt !== undefined ? { excerpt: rawExcerpt } : {}),
      language: 'en',
      hits: classifyAdverseMedia(text),
    };
  });
}

/** GDELT DOC API — no key required; free tier.
 *
 * Runs 5 parallel GDELT queries: one English default plus four native-script
 * multilingual queries (Arabic, Russian/Cyrillic, Spanish/Portuguese, CJK).
 * All fire simultaneously via Promise.allSettled — zero added latency versus
 * a single query. Results are deduplicated by URL and merged.
 */
export async function searchGdelt(opts: SearchOptions): Promise<AdverseMediaArticle[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRecords = String(Math.min(opts.limit ?? 25, 250));
  const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
  const TIMEOUT_MS = 4_000;

  const subject = opts.subjectName ? opts.subjectName.replace(/"/g, '') : '';

  // Build a GDELT query string for the given keyword OR-list
  function buildQuery(keywords: string): string {
    return subject ? `"${subject}" AND (${keywords})` : keywords;
  }

  // Multilingual native-script keyword groups — each targets a distinct
  // non-English corpus that the English ADVERSE_MEDIA_QUERY misses entirely.
  const MULTILINGUAL_QUERIES = [
    // Arabic (MENA, Gulf, North Africa)
    buildQuery(
      'اعتقال OR "غسيل أموال" OR غسيل OR فساد OR احتيال OR رشوة OR تهريب OR عقوبات OR تحقيق OR "تمويل الإرهاب"'
    ),
    // Russian/Cyrillic (Russia, Ukraine, Central Asia)
    buildQuery(
      'арест OR коррупция OR отмывание OR "отмывание денег" OR мошенничество OR взятка OR контрабанда OR санкции OR следствие OR "уголовное дело"'
    ),
    // Spanish & Portuguese (LatAm, Iberian press)
    buildQuery(
      '"lavado de dinero" OR "lavagem de dinheiro" OR corrupción OR corrupção OR fraude OR detenido OR preso OR tráfico OR blanqueo OR lavagem OR malversación OR "desvio de verbas" OR soborno OR suborno OR sanciones OR sanções OR narcotráfico OR contrabando'
    ),
    // CJK — Chinese, Japanese, Korean
    buildQuery(
      '洗钱 OR 腐败 OR 欺诈 OR 逮捕 OR 走私 OR 贿赂 OR 制裁 OR マネーロンダリング OR 汚職 OR 詐欺 OR 密輸 OR 자금세탁 OR 부패 OR 사기 OR 체포 OR 밀수 OR 제재'
    ),
  ];

  type GdeltRaw = { title?: string; url?: string; seendate?: string; language?: string; domain?: string; sourcecountry?: string };

  async function fetchGdeltQuery(query: string): Promise<GdeltRaw[]> {
    const url = new URL(GDELT_BASE);
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxrecords', maxRecords);
    url.searchParams.set('timespan', '10y');
    const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
    const json = (await res.json()) as { articles?: GdeltRaw[] };
    return json.articles ?? [];
  }

  // Default English query (original behaviour)
  const defaultQuery = buildQuery(ADVERSE_MEDIA_QUERY);

  // Fire all 5 queries in parallel
  const settled = await Promise.allSettled([
    fetchGdeltQuery(defaultQuery),
    ...MULTILINGUAL_QUERIES.map((q) => fetchGdeltQuery(q)),
  ]);

  // Merge and deduplicate by URL
  const seenUrls = new Set<string>();
  const merged: GdeltRaw[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const a of result.value) {
      const key = (a.url ?? '').toLowerCase();
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      merged.push(a);
    }
  }

  if (merged.length === 0 && settled.every((r) => r.status === 'rejected')) {
    // All queries failed — re-throw the first error so the caller can surface it
    const first = settled[0];
    throw (first as PromiseRejectedResult).reason instanceof Error
      ? (first as PromiseRejectedResult).reason
      : new Error('All GDELT multilingual queries failed');
  }

  return merged.map((a) => {
    const rawDomain = a.domain;
    return {
      source: 'gdelt' as const,
      ...(rawDomain !== undefined ? { sourceDomain: rawDomain } : {}),
      headline: a.title ?? '',
      url: a.url ?? '',
      ...(a.seendate !== undefined ? { publishedAt: a.seendate } : {}),
      ...(a.language !== undefined ? { language: a.language } : {}),
      hits: classifyAdverseMedia(a.title ?? ''),
    };
  });
}

/** Google Programmable Search Engine (CSE) — requires GOOGLE_CSE_KEY +
 *  GOOGLE_CSE_CX. Indexes the open web rather than a curated news corpus,
 *  so it surfaces enforcement-agency pages, court dockets, regulator
 *  press-releases, and NGO reports that NewsAPI/GDELT miss. Pass
 *  `dateRestrict` (e.g. "d30") to bound recency. */
export async function searchGoogleCse(
  opts: SearchOptions & { dateRestrict?: string },
): Promise<AdverseMediaArticle[]> {
  const apiKey = (typeof process !== 'undefined' ? process.env?.GOOGLE_CSE_KEY : undefined);
  const cx = (typeof process !== 'undefined' ? process.env?.GOOGLE_CSE_CX : undefined);
  if (!apiKey) throw new Error('GOOGLE_CSE_KEY not set');
  if (!cx) throw new Error('GOOGLE_CSE_CX not set');
  const fetchImpl = opts.fetchImpl ?? fetch;
  const q = opts.subjectName
    ? `"${opts.subjectName.replace(/"/g, '')}" (${ADVERSE_MEDIA_QUERY})`
    : ADVERSE_MEDIA_QUERY;
  // CSE caps `num` at 10 per call. Page through up to 50 results.
  const want = Math.min(opts.limit ?? 25, 50);
  const out: AdverseMediaArticle[] = [];
  for (let start = 1; start <= want; start += 10) {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', q);
    url.searchParams.set('num', String(Math.min(10, want - (start - 1))));
    url.searchParams.set('start', String(start));
    if (opts.dateRestrict) url.searchParams.set('dateRestrict', opts.dateRestrict);
    const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      // 429 = quota exhausted; 400 = bad query — return what we have.
      if (out.length > 0) break;
      throw new Error(`Google CSE HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      items?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
        displayLink?: string;
        pagemap?: { metatags?: Array<{ 'article:published_time'?: string; 'og:updated_time'?: string }> };
      }>;
    };
    const items = json.items ?? [];
    for (const a of items) {
      const text = `${a.title ?? ''} ${a.snippet ?? ''}`;
      const meta = a.pagemap?.metatags?.[0];
      const publishedAt = meta?.['article:published_time'] ?? meta?.['og:updated_time'];
      const sourceDomain = a.displayLink ?? (a.link ? safeHost(a.link) : undefined);
      const article: AdverseMediaArticle = {
        source: 'google_cse',
        headline: a.title ?? '',
        url: a.link ?? '',
        hits: classifyAdverseMedia(text),
      };
      if (sourceDomain !== undefined) article.sourceDomain = sourceDomain;
      if (publishedAt !== undefined) article.publishedAt = publishedAt;
      if (a.snippet !== undefined) article.excerpt = a.snippet;
      out.push(article);
    }
    if (items.length < 10) break; // no more pages
  }
  return out;
}

function safeHost(u: string): string | undefined {
  try { return new URL(u).hostname; } catch { return undefined; }
}

/** Generic RSS — pass a feed URL. Uses DOMParser if present, regex fallback otherwise. */
export async function searchRss(feedUrl: string, opts: SearchOptions = {}): Promise<AdverseMediaArticle[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(feedUrl);
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items: Array<{ title: string; link: string; pubDate?: string; description?: string }> = [];
  const itemRx = /<item[\s>][^]*?<\/item>/gi;
  const extract = (block: string, tag: string): string | undefined => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block); // nosemgrep: detect-non-literal-regexp -- safe: controlled internal value, not user-HTTP-input; no ReDoS risk
    if (!m) return undefined;
    return (m[1] ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  };
  let m;
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[0];
    const title = extract(block, 'title');
    const link = extract(block, 'link');
    if (!title || !link) continue;
    const pubDate = extract(block, 'pubDate');
    const description = extract(block, 'description');
    const itemOut: { title: string; link: string; pubDate?: string; description?: string } = { title, link };
    if (pubDate !== undefined) itemOut.pubDate = pubDate;
    if (description !== undefined) itemOut.description = description;
    items.push(itemOut);
  }
  return items.slice(0, opts.limit ?? 25).map((it) => {
    const text = `${it.title} ${it.description ?? ''}`;
    let sourceDomain: string | undefined;
    try { sourceDomain = new URL(it.link).hostname; } catch { /* ignore */ }
    return {
      source: 'rss' as const,
      ...(sourceDomain !== undefined ? { sourceDomain } : {}),
      headline: it.title,
      url: it.link,
      ...(it.pubDate !== undefined ? { publishedAt: it.pubDate } : {}),
      ...(it.description !== undefined ? { excerpt: it.description } : {}),
      hits: classifyAdverseMedia(text),
    };
  });
}

/** Combine two result streams and filter to only items that produced
 *  at least one adverse-media taxonomy hit. */
export function combineAndFilter(
  streams: readonly AdverseMediaArticle[][],
): AdverseMediaArticle[] {
  const seen = new Set<string>();
  const out: AdverseMediaArticle[] = [];
  for (const s of streams) {
    for (const a of s) {
      if (!a.url || seen.has(a.url)) continue;
      if (a.hits.length === 0) continue;
      seen.add(a.url);
      out.push(a);
    }
  }
  out.sort((x, y) => (Date.parse(y.publishedAt ?? '') || 0) - (Date.parse(x.publishedAt ?? '') || 0));
  return out;
}
