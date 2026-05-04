// Hawkeye Sterling — OSINT pipeline (audit follow-up #12).
//
// Auto-discover adverse-media references on a subject by querying:
//   · NewsAPI / NewsData / GDELT (configurable; first available wins)
//   · DuckDuckGo search → top 5 result URLs (fallback when no key)
// Returns TaranisItem-shaped articles ready for analyseAdverseMediaItems.
// Charter P2: items are emitted with their source URLs; the analyser
// then classifies severity. Never synthesises news content.

import type { CorporateRegistryRecord } from '../brain/bo-graph-builder.js';

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
  const key = process.env['OSINT_NEWSAPI_KEY'];
  if (!key) return { ok: false, provider: 'newsapi', items: [], error: 'OSINT_NEWSAPI_KEY not configured' };
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
      id: `newsapi_${i}_${Math.random().toString(36).slice(2, 8)}`,
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
      id: `gdelt_${i}_${Math.random().toString(36).slice(2, 8)}`,
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
          id: `ddg_${i++}_${Math.random().toString(36).slice(2, 8)}`,
          url, title, content: title, source: 'duckduckgo',
        });
      }
    }
    return { ok: true, provider: 'duckduckgo', items };
  } catch (err) {
    return { ok: false, provider: 'duckduckgo', items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Discover adverse-media items for a subject. Tries providers in
 *  preference order; first successful (non-empty) wins. */
export async function discoverAdverseMedia(q: OsintQuery): Promise<OsintOutcome> {
  for (const fn of [newsApi, gdelt, duckduckgo]) {
    const out = await fn(q);
    if (out.ok && out.items.length > 0) return out;
  }
  return { ok: false, provider: 'none', items: [], error: 'no provider returned items' };
}

/** Convenience: derive OSINT query from a registry record. */
export function osintQueryFromRegistry(r: CorporateRegistryRecord, opts: { fromDate?: string } = {}): OsintQuery {
  const out: OsintQuery = { subjectName: r.entityName };
  if (r.jurisdiction) out.jurisdictionIso2 = r.jurisdiction;
  if (opts.fromDate) out.fromDate = opts.fromDate;
  return out;
}
