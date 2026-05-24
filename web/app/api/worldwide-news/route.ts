// Hawkeye Sterling — worldwide AML news feed.
//
// Fetches global AML/financial-crime news from a focused set of public RSS
// feeds (OCCRP, ICIJ, Reuters, AP, BBC, Bellingcat). No API key required.
// Results are cached in-process for 5 minutes to avoid hammering upstream
// servers on every page load.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { textMentionsAml } from "@/lib/intelligence/amlKeywords";
import type { NewsArticle } from "@/lib/intelligence/newsAdapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── In-process 5-minute cache ───────────────────────────────────────────────
interface CacheEntry {
  articles: NewsArticle[];
  cachedAt: string;
  ts: number;
}

// eslint-disable-next-line no-var
declare global { var __hsWorldwideNewsCache: CacheEntry | undefined; }

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const FEED_TIMEOUT_MS = 4_000;
const MAX_ARTICLES = 30;

// ── Target feeds ─────────────────────────────────────────────────────────────
interface FeedDef {
  url: string;
  source: string;
  outlet: string;
  /** When true, all parsed articles are included without AML keyword filtering */
  alwaysInclude?: boolean;
}

const WORLDWIDE_AML_FEEDS: FeedDef[] = [
  // Tier-1 investigative — always include (every article is AML-relevant)
  { url: "https://www.occrp.org/en/feed/rss",                                    source: "occrp",          outlet: "occrp.org",           alwaysInclude: true },
  { url: "https://www.icij.org/feed/",                                           source: "icij",           outlet: "icij.org",            alwaysInclude: true },
  { url: "https://www.bellingcat.com/feed/",                                     source: "bellingcat",     outlet: "bellingcat.com",      alwaysInclude: true },
  // Wire services — AML keyword filtered
  { url: "https://www.reutersagency.com/feed/?best-topics=world&post_type=best", source: "reuters-world",  outlet: "reuters.com" },
  { url: "https://www.reutersagency.com/feed/?best-topics=regulation&post_type=best", source: "reuters-regulation", outlet: "reuters.com" },
  { url: "https://feeds.apnews.com/rss/apf-business",                            source: "ap-business",    outlet: "apnews.com" },
  { url: "http://feeds.bbci.co.uk/news/world/rss.xml",                           source: "bbc-world",      outlet: "bbc.co.uk" },
];

// ── RSS helpers (self-contained — no dependency on internal parseFeed) ──────

function stripCdata(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return "";
}

function parseFeedXml(xml: string, feed: FeedDef): NewsArticle[] {
  // Match both <item> (RSS 2.0) and <entry> (Atom 1.0) blocks.
  const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  const out: NewsArticle[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1] ?? "";

    const rawTitle =
      stripCdata(/<title[^>]*>([\s\S]*?)<\/title>/.exec(block)?.[1])?.trim();
    if (!rawTitle) continue;
    const title = stripHtml(rawTitle);
    if (!title) continue;

    // Link: Atom uses href attribute; RSS uses text content.
    const rawLink =
      /<link[^>]+href="([^"]+)"/.exec(block)?.[1]?.trim() ??
      stripCdata(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1])?.trim();
    if (!rawLink) continue;
    const link = sanitizeUrl(rawLink);
    if (!link) {
      // Try to resolve relative link against feed outlet
      try {
        const base = `https://${feed.outlet}`;
        const resolved = new URL(rawLink, base).toString();
        if (!/^https?:\/\//i.test(resolved)) continue;
        // fallthrough with resolved
        out.push(buildArticle(feed, title, resolved, block));
        continue;
      } catch {
        continue;
      }
    }

    out.push(buildArticle(feed, title, link, block));
  }
  return out;
}

function buildArticle(feed: FeedDef, title: string, link: string, block: string): NewsArticle {
  const pub =
    /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1]?.trim() ??
    /<updated>([\s\S]*?)<\/updated>/.exec(block)?.[1]?.trim() ??
    /<published>([\s\S]*?)<\/published>/.exec(block)?.[1]?.trim();

  const rawDesc =
    stripCdata(/<description>([\s\S]*?)<\/description>/.exec(block)?.[1])?.trim() ??
    stripCdata(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(block)?.[1])?.trim() ??
    stripCdata(/<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(block)?.[1])?.trim();
  const snippet = rawDesc ? stripHtml(rawDesc).slice(0, 240) : undefined;

  // Determine source category for UI display
  let sourceCategory: NewsArticle["sourceCategory"] = undefined;
  if (feed.alwaysInclude) {
    sourceCategory = "investigative";
  } else if (feed.outlet === "reuters.com" || feed.outlet === "apnews.com" || feed.outlet === "bbc.co.uk") {
    sourceCategory = "wire";
  }

  return {
    source: feed.source,
    outlet: feed.outlet,
    title,
    url: link,
    publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
    ...(snippet ? { snippet } : {}),
    ...(sourceCategory ? { sourceCategory } : {}),
  };
}

async function fetchFeed(feed: FeedDef): Promise<NewsArticle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      headers: {
        accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8",
        "user-agent": "HawkeyeSterling/1.0 (compatible; worldwide-aml-news)",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[worldwide-news] ${feed.source} HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseFeedXml(xml, feed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("aborted") && !msg.includes("AbortError")) {
      console.warn(`[worldwide-news] ${feed.source} threw: ${msg}`);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Main aggregator ──────────────────────────────────────────────────────────

export async function fetchGlobalAmlNews(limit: number): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(
    WORLDWIDE_AML_FEEDS.map((feed) => fetchFeed(feed)),
  );

  const seenUrls = new Set<string>();
  const articles: NewsArticle[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const feed = WORLDWIDE_AML_FEEDS[i]!;
    if (r.status !== "fulfilled") continue;
    for (const a of (r as PromiseFulfilledResult<NewsArticle[]>).value) {
      const key = a.url.toLowerCase();
      if (seenUrls.has(key)) continue;

      // Filter: always include investigative sources; for wire services,
      // require AML keywords in title + snippet.
      const hay = `${a.title} ${a.snippet ?? ""}`;
      if (!feed.alwaysInclude && !textMentionsAml(hay)) continue;

      seenUrls.add(key);
      articles.push(a);
    }
  }

  // Sort by date descending; invalid dates sort to the end.
  articles.sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return tb - ta;
  });

  return articles.slice(0, limit);
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const headers: Record<string, string> = gate.ok ? gate.headers : {};

  // Serve from cache if fresh.
  const cached = globalThis.__hsWorldwideNewsCache;
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ok: true, articles: cached.articles, cachedAt: cached.cachedAt, count: cached.articles.length },
      { headers },
    );
  }

  try {
    const articles = await fetchGlobalAmlNews(MAX_ARTICLES);
    const cachedAt = new Date().toISOString();
    globalThis.__hsWorldwideNewsCache = { articles, cachedAt, ts: Date.now() };
    return NextResponse.json(
      { ok: true, articles, cachedAt, count: articles.length },
      { headers },
    );
  } catch (err) {
    console.error("[worldwide-news] fetch failed:", err);
    // Serve stale cache on error rather than 500.
    if (cached) {
      return NextResponse.json(
        { ok: true, articles: cached.articles, cachedAt: cached.cachedAt, count: cached.articles.length },
        { headers },
      );
    }
    return NextResponse.json(
      { ok: true, articles: [], cachedAt: new Date().toISOString(), count: 0 },
      { headers },
    );
  }
}
