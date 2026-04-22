// Hawkeye Sterling — adverse-media ingestion (Phase 6).
// Three pluggable providers: NewsAPI, GDELT DOC API, generic RSS. Each
// returns normalised AdverseMediaArticle items the brain can score via
// classifyAdverseMedia() (from src/brain/adverse-media.ts).

declare const process: { env?: Record<string, string | undefined> } | undefined;

import { ADVERSE_MEDIA_QUERY, classifyAdverseMedia, type AdverseMediaHit } from '../brain/adverse-media.js';

export interface AdverseMediaArticle {
  source: 'newsapi' | 'gdelt' | 'rss';
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
