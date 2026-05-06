// Hawkeye Sterling — URL-direct adverse-media ingestion.
//
// When the operator already has a known adverse-media URL (e.g. a
// Reuters/Reporter Brasil/Patronlar Dünyası article) we fetch + parse
// the page directly and emit it as a NewsArticle so it counts toward
// consensus + reasoning. Bypasses the discovery problem: GDELT may
// have missed a niche outlet, but if the operator points us at the
// URL we ingest it.

import type { NewsArticle } from "./newsAdapters";

const FETCH_TIMEOUT_MS = 12_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`url-ingest exceeded ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Extract title + meta description + publish date from an HTML document.
 * Pure-string parsing of OpenGraph / Twitter / standard meta tags —
 * works on 90%+ of news sites without a heavy DOM library.
 */
function extractFromHtml(html: string, url: string): NewsArticle | null {
  const meta = (name: string): string | undefined => {
    // Try multiple meta-tag patterns: name="..." property="..." content="..."
    const re = new RegExp(`<meta\\s+(?:[^>]*?(?:name|property)=["']${name}["'][^>]*?content=["']([^"']+)["']|[^>]*?content=["']([^"']+)["'][^>]*?(?:name|property)=["']${name}["'])[^>]*>`, "i");
    const m = re.exec(html);
    return m ? (m[1] ?? m[2])?.trim() : undefined;
  };
  const title =
    meta("og:title") ?? meta("twitter:title") ?? meta("title") ??
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  if (!title) return null;
  const snippet = meta("og:description") ?? meta("twitter:description") ?? meta("description");
  const publishedAt =
    meta("article:published_time") ?? meta("og:updated_time") ??
    meta("publishdate") ?? meta("date") ?? new Date().toISOString();
  let outlet = "url-ingest";
  try { outlet = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep default */ }
  return {
    source: "url-ingest",
    outlet,
    title: title.replace(/<[^>]+>/g, "").trim(),
    url,
    publishedAt,
    ...(snippet ? { snippet: snippet.slice(0, 500) } : {}),
  };
}

/**
 * Fetches one URL and returns it as a NewsArticle. Returns null on
 * fetch / parse failure rather than throwing — caller treats it as
 * "no evidence" and continues.
 */
export async function ingestUrl(url: string): Promise<NewsArticle | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await abortable(
      fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; adverse-media-ingest)",
          "accept-language": "*",
        },
        redirect: "follow",
      }),
    );
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/html/i.test(ct)) return null;
    const html = await res.text();
    return extractFromHtml(html, url);
  } catch (err) {
    console.warn("[url-ingest] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Bulk-ingest a list of operator-provided URLs. Returns one
 * NewsArticle per successful fetch; failures are skipped silently.
 */
export async function ingestUrls(urls: string[]): Promise<NewsArticle[]> {
  if (urls.length === 0) return [];
  const results = await Promise.all(urls.slice(0, 25).map((u) => ingestUrl(u)));
  return results.filter((r): r is NewsArticle => r !== null);
}
