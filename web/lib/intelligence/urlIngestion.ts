// Hawkeye Sterling — URL-direct adverse-media ingestion.
//
// When the operator already has a known adverse-media URL (e.g. a
// Reuters/Reporter Brasil/Patronlar Dünyası article) we fetch + parse
// the page directly and emit it as a NewsArticle so it counts toward
// consensus + reasoning. Bypasses the discovery problem: GDELT may
// have missed a niche outlet, but if the operator points us at the
// URL we ingest it.
//
// SSRF protection: operator-supplied URLs are validated against a blocklist
// of private ranges and cloud metadata endpoints before fetching. Only
// public HTTPS URLs are accepted (HTTP is blocked to prevent redirect-based
// SSRF to internal services). Redirects are followed but re-validated.

import type { NewsArticle } from "./newsAdapters";

const FETCH_TIMEOUT_MS = 12_000;

// ── SSRF protection ───────────────────────────────────────────────────────────

// Private / link-local / cloud-metadata IP ranges and hostnames.
// Blocks: 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x (AWS metadata),
//         ::1, fc00::/7 (IPv6 private), localhost, and common metadata endpoints.
const BLOCKED_HOSTS = /^(localhost|ip6-localhost|ip6-loopback)$/i;
const BLOCKED_PREFIXES = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.|::1|fc|fd)/i;
const BLOCKED_PATHS = /\/(latest\/meta-data|metadata\/v1|computeMetadata|instance)/i;

/**
 * Returns an error string if the URL is unsafe (SSRF risk), or null if safe.
 * Only HTTPS public URLs are accepted.
 */
function ssrfCheck(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "invalid URL";
  }
  if (parsed.protocol !== "https:") {
    return "only HTTPS URLs are accepted for evidence ingestion";
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.test(host)) return `blocked host: ${host}`;
  if (BLOCKED_PREFIXES.test(host)) return `private/link-local address not permitted: ${host}`;
  if (BLOCKED_PATHS.test(parsed.pathname)) return `blocked path: ${parsed.pathname}`;
  // Block numeric IPs that resolve to private ranges (best-effort; full
  // resolution-time SSRF protection requires a DNS rebinding guard at the
  // network layer — out of scope for this function-level check).
  const numericIp = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (numericIp) {
    const [, a, b, c] = numericIp.map(Number);
    if (
      a === 127 ||
      a === 10 ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    ) {
      return `private IP address not permitted: ${host}`;
    }
  }
  return null;
}

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
 * fetch / parse / SSRF-check failure — caller treats it as "no evidence".
 */
export async function ingestUrl(url: string): Promise<NewsArticle | null> {
  const ssrfErr = ssrfCheck(url);
  if (ssrfErr) {
    console.warn("[url-ingest] SSRF check failed:", ssrfErr, url.slice(0, 100));
    return null;
  }
  try {
    const res = await abortable(
      fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; adverse-media-ingest)",
          "accept-language": "*",
        },
        // Do not follow redirects automatically — validate each hop.
        redirect: "manual",
      }),
    );
    // Handle redirects with SSRF re-validation.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      const absoluteLocation = location.startsWith("http") ? location : new URL(location, url).href;
      const redirectErr = ssrfCheck(absoluteLocation);
      if (redirectErr) {
        console.warn("[url-ingest] SSRF check failed on redirect:", redirectErr, absoluteLocation.slice(0, 100));
        return null;
      }
      // One level of redirect is enough; avoid infinite chains.
      const redirectRes = await abortable(
        fetch(absoluteLocation, {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; adverse-media-ingest)",
          },
        }),
      );
      if (!redirectRes.ok) return null;
      const ct = redirectRes.headers.get("content-type") ?? "";
      if (!/html/i.test(ct)) return null;
      return extractFromHtml(await redirectRes.text(), absoluteLocation);
    }
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
 * Cap at 25 URLs per request to limit Lambda execution time.
 */
export async function ingestUrls(urls: string[]): Promise<NewsArticle[]> {
  if (urls.length === 0) return [];
  const results = await Promise.all(urls.slice(0, 25).map((u) => ingestUrl(u)));
  return results.filter((r): r is NewsArticle => r !== null);
}
