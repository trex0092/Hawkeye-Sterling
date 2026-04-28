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

/** GDELT DOC API — no key required; free tier. */
export async function searchGdelt(opts: SearchOptions): Promise<AdverseMediaArticle[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const q = opts.subjectName ? `"${opts.subjectName.replace(/"/g, '')}" AND (${ADVERSE_MEDIA_QUERY})` : ADVERSE_MEDIA_QUERY;
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', q);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', String(Math.min(opts.limit ?? 25, 250)));
  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
  const json = (await res.json()) as { articles?: Array<{ title?: string; url?: string; seendate?: string; language?: string; domain?: string; sourcecountry?: string }> };
  return (json.articles ?? []).map((a) => {
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
    const res = await fetchImpl(url.toString());
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
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
    if (!m) return undefined;
    return m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
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
    try { sourceDomain = new URL(it.link).hostname; } catch (_) { /* ignore */ }
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
