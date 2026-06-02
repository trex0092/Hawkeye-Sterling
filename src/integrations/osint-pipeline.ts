// Hawkeye Sterling — OSINT pipeline (audit follow-up #12).
//
// Auto-discover adverse-media references on a subject by querying:
//   · NewsAPI / NewsData / GDELT (configurable; first available wins)
//   · DuckDuckGo search → top 5 result URLs (fallback when no key)
//   · Twitter/X v2 Recent Search (additive; requires TWITTER_BEARER_TOKEN)
// Returns TaranisItem-shaped articles ready for analyseAdverseMediaItems.
// Charter P2: items are emitted with their source URLs; the analyser
// then classifies severity. Never synthesises news content.

import { createHash } from 'node:crypto';
import type { CorporateRegistryRecord } from '../brain/bo-graph-builder.js';
import { searchTwitter } from './SocialMediaCollector.js';

export interface OsintQuery {
  subjectName: string;
  jurisdictionIso2?: string;
  fromDate?: string;
  pageSize?: number;
}

export interface OsintItem {
  id: string;
  url: string;
  title: string;
  content: string;
  publishedAt?: string;
  language?: string;
  source: string;
}

export interface OsintOutcome {
  ok: boolean;
  provider: 'newsapi' | 'newsdata' | 'gdelt' | 'duckduckgo' | 'none';
  items: OsintItem[];
  error?: string;
}

const TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// ─── NewsAPI ────────────────────────────────────────────────────────────────

async function newsApi(q: OsintQuery): Promise<OsintOutcome> {
  const key = process.env['OSINT_NEWSAPI_KEY'] ?? "ea607b9e29e44c7f8173dc0375ab72aa";
  try {
    const params = new URLSearchParams({
      q: q.subjectName,
      apiKey: key,
      pageSize: String(q.pageSize ?? 25),
      sortBy: 'relevancy',
      language: 'en',
    });
    if (q.fromDate) params.set('from', q.fromDate);
    const res = await fetchWithTimeout(`https://newsapi.org/v2/everything?${params.toString()}`);
    if (!res.ok) return { ok: false, provider: 'newsapi', items: [], error: `HTTP ${res.status}` };
    const json = (await res.json()) as { articles?: Array<Record<string, unknown>> };
    const items = (json.articles ?? []).map((a, i): OsintItem => ({
      id: `newsapi_${i}_${createHash('sha256').update(String(a['url'] ?? i)).digest('hex').slice(0, 8)}`,
      url: String(a['url'] ?? ''),
      title: String(a['title'] ?? ''),
      content: String(a['description'] ?? a['content'] ?? ''),
      ...(typeof a['publishedAt'] === 'string' ? { publishedAt: a['publishedAt'] as string } : {}),
      language: 'en',
      source: typeof a['source'] === 'object' && a['source'] !== null ? String((a['source'] as Record<string, unknown>)['name'] ?? '') : '',
    }));
    return { ok: true, provider: 'newsapi', items };
  } catch (err) {
    return { ok: false, provider: 'newsapi', items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── GDELT (free, no key) ──────────────────────────────────────────────────

async function gdelt(q: OsintQuery): Promise<OsintOutcome> {
  try {
    const params = new URLSearchParams({
      query: q.subjectName,
      mode: 'artlist',
      maxrecords: String(q.pageSize ?? 25),
      format: 'json',
    });
    const res = await fetchWithTimeout(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`);
    if (!res.ok) return { ok: false, provider: 'gdelt', items: [], error: `HTTP ${res.status}` };
    const json = (await res.json()) as { articles?: Array<Record<string, unknown>> };
    const items = (json.articles ?? []).map((a, i): OsintItem => ({
      id: `gdelt_${i}_${createHash('sha256').update(String(a['url'] ?? i)).digest('hex').slice(0, 8)}`,
      url: String(a['url'] ?? ''),
      title: String(a['title'] ?? ''),
      content: String(a['title'] ?? ''),
      ...(typeof a['seendate'] === 'string' ? { publishedAt: a['seendate'] as string } : {}),
      language: typeof a['language'] === 'string' ? (a['language'] as string) : 'en',
      source: typeof a['domain'] === 'string' ? (a['domain'] as string) : '',
    }));
    return { ok: true, provider: 'gdelt', items };
  } catch (err) {
    return { ok: false, provider: 'gdelt', items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── DuckDuckGo HTML fallback ──────────────────────────────────────────────

async function duckduckgo(q: OsintQuery): Promise<OsintOutcome> {
  try {
    const res = await fetchWithTimeout(`https://duckduckgo.com/html/?q=${encodeURIComponent(q.subjectName + ' adverse media OR sanctions OR investigation')}`);
    if (!res.ok) return { ok: false, provider: 'duckduckgo', items: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    const items: OsintItem[] = [];
    const linkRx = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = linkRx.exec(html)) !== null && items.length < (q.pageSize ?? 5)) {
      const url = (m[1] ?? '').replace(/&amp;/g, '&');
      const title = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
      if (url && title) {
        items.push({
          id: `ddg_${i}_${createHash('sha256').update(url).digest('hex').slice(0, 8)}`,
          url, title, content: title, source: 'duckduckgo',
        });
        i++;
      }
    }
    return { ok: true, provider: 'duckduckgo', items };
  } catch (err) {
    return { ok: false, provider: 'duckduckgo', items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Discover adverse-media items for a subject. Tries providers in
 *  preference order; first successful (non-empty) wins. Twitter/X
 *  SOCMINT runs in parallel and is merged additively into the result. */
export async function discoverAdverseMedia(q: OsintQuery): Promise<OsintOutcome> {
  // Start Twitter in parallel so it doesn't add latency to the primary path
  const twitterP = process.env['TWITTER_BEARER_TOKEN']
    ? searchTwitter(q).catch(() => null)
    : Promise.resolve<null>(null);

  let out: OsintOutcome = { ok: false, provider: 'none', items: [], error: 'no provider returned items' };
  for (const fn of [newsApi, gdelt, duckduckgo]) {
    const result = await fn(q);
    if (result.ok && result.items.length > 0) { out = result; break; }
  }

  const tw = await twitterP;
  if (tw?.ok && tw.items.length > 0) {
    out = { ...out, ok: true, items: [...out.items, ...tw.items] };
  }

  return out;
}

/** Convenience: derive OSINT query from a registry record. */
export function osintQueryFromRegistry(r: CorporateRegistryRecord, opts: { fromDate?: string } = {}): OsintQuery {
  const out: OsintQuery = { subjectName: r.entityName };
  if (r.jurisdiction) out.jurisdictionIso2 = r.jurisdiction;
  if (opts.fromDate) out.fromDate = opts.fromDate;
  return out;
}
