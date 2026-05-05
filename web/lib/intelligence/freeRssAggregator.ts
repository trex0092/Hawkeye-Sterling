// Hawkeye Sterling — free public-RSS adverse-media aggregator.
//
// Fans out across ~40 public RSS feeds from major wire services + global
// news outlets and substring-filters titles/descriptions for the subject
// name. ZERO API keys required — all toggled by FREE_RSS_ENABLED=1.
//
// Per-feed timeout 8s, total fan-out parallel; failed feeds are silently
// skipped. Output deduped by URL and emitted as NewsArticle for the
// existing searchAllNews aggregator to merge.

import type { NewsArticle, NewsAdapter } from "./newsAdapters";
import { NULL_NEWS_ADAPTER } from "./newsAdapters";

const FETCH_TIMEOUT_MS = 8_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`rss feed exceeded ${ms}ms`)), ms),
    ),
  ]);
}

interface RssFeed {
  source: string;        // provider id ("reuters", "bbc-rss" etc.)
  outlet: string;        // domain
  url: string;           // RSS endpoint
}

// Curated free public RSS feeds — wire services + global news outlets.
// All public, no key required, terms-of-service permit aggregation
// when properly attributed (we always preserve the canonical link).
const FREE_RSS_FEEDS: RssFeed[] = [
  // ── Wire services
  { source: "reuters-rss", outlet: "reuters.com", url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best" },
  { source: "ap-rss", outlet: "apnews.com", url: "https://feeds.apnews.com/rss/apf-topnews" },
  { source: "ap-business-rss", outlet: "apnews.com", url: "https://feeds.apnews.com/rss/apf-business" },
  { source: "afp-rss", outlet: "afp.com", url: "https://www.afp.com/en/rss.xml" },

  // ── UK
  { source: "bbc-rss", outlet: "bbc.co.uk", url: "http://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "bbc-world-rss", outlet: "bbc.co.uk", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "guardian-rss", outlet: "theguardian.com", url: "https://www.theguardian.com/business/rss" },
  { source: "guardian-world-rss", outlet: "theguardian.com", url: "https://www.theguardian.com/world/rss" },
  { source: "independent-rss", outlet: "independent.co.uk", url: "https://www.independent.co.uk/news/business/rss" },
  { source: "telegraph-rss", outlet: "telegraph.co.uk", url: "https://www.telegraph.co.uk/business/rss.xml" },

  // ── US
  { source: "nyt-business-rss", outlet: "nytimes.com", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { source: "nyt-world-rss", outlet: "nytimes.com", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { source: "wapo-rss", outlet: "washingtonpost.com", url: "https://feeds.washingtonpost.com/rss/business" },
  { source: "npr-rss", outlet: "npr.org", url: "https://feeds.npr.org/1006/rss.xml" },
  { source: "cnn-rss", outlet: "cnn.com", url: "http://rss.cnn.com/rss/money_news_international.rss" },
  { source: "cbs-rss", outlet: "cbsnews.com", url: "https://www.cbsnews.com/latest/rss/business" },
  { source: "axios-rss", outlet: "axios.com", url: "https://api.axios.com/feed/" },
  { source: "politico-rss", outlet: "politico.com", url: "https://rss.politico.com/economy.xml" },
  { source: "thehill-rss", outlet: "thehill.com", url: "https://thehill.com/feed/" },

  // ── Europe (continental)
  { source: "dw-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-en-bus" },
  { source: "france24-rss", outlet: "france24.com", url: "https://www.france24.com/en/business/rss" },
  { source: "rfi-rss", outlet: "rfi.fr", url: "https://www.rfi.fr/en/rss" },
  { source: "euractiv-rss", outlet: "euractiv.com", url: "https://www.euractiv.com/feed" },
  { source: "politico-eu-rss", outlet: "politico.eu", url: "https://www.politico.eu/feed/" },
  { source: "yle-rss", outlet: "yle.fi", url: "https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_NEWS" },

  // ── Middle East
  { source: "aljazeera-rss", outlet: "aljazeera.com", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "alarabiya-rss", outlet: "alarabiya.net", url: "https://english.alarabiya.net/.mrss/en.xml" },
  { source: "thenational-rss", outlet: "thenationalnews.com", url: "https://www.thenationalnews.com/business/rss" },

  // ── Asia
  { source: "nhk-rss", outlet: "nhk.or.jp", url: "https://www3.nhk.or.jp/nhkworld/en/news/feeds/" },
  { source: "scmp-rss", outlet: "scmp.com", url: "https://www.scmp.com/rss/91/feed" },
  { source: "asiatimes-rss", outlet: "asiatimes.com", url: "https://asiatimes.com/feed/" },
  { source: "thehindu-rss", outlet: "thehindu.com", url: "https://www.thehindu.com/business/feeder/default.rss" },
  { source: "indiatoday-rss", outlet: "indiatoday.in", url: "https://www.indiatoday.in/rss/1206577" },
  { source: "hindustantimes-rss", outlet: "hindustantimes.com", url: "https://www.hindustantimes.com/feeds/rss/business/index.xml" },

  // ── Americas + Oceania
  { source: "globalnews-rss", outlet: "globalnews.ca", url: "https://globalnews.ca/feed/" },
  { source: "cbc-rss", outlet: "cbc.ca", url: "https://www.cbc.ca/cmlink/rss-business" },
  { source: "abc-au-rss", outlet: "abc.net.au", url: "https://www.abc.net.au/news/feed/51892/rss.xml" },

  // ── Africa
  { source: "africanews-rss", outlet: "africanews.com", url: "https://www.africanews.com/rss" },
  { source: "allafrica-rss", outlet: "allafrica.com", url: "https://allafrica.com/tools/headlines/rdf/business/headlines.rdf" },

  // ── International / agencies
  { source: "un-news-rss", outlet: "news.un.org", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml" },
  { source: "ec-press-rss", outlet: "ec.europa.eu", url: "https://ec.europa.eu/commission/presscorner/api/rss?language=en&pageType=press_release" },
];

// Cheap RSS / Atom parser — extracts <item> or <entry> blocks; we don't
// need a full XML parser since we only consume well-formed feed roots.
function parseFeed(xml: string, source: string, outlet: string): NewsArticle[] {
  const items = xml.match(/<(?:item|entry)>[\s\S]*?<\/(?:item|entry)>/g) ?? [];
  const out: NewsArticle[] = [];
  for (const it of items) {
    const title = stripCdata(/<title[^>]*>([\s\S]*?)<\/title>/.exec(it)?.[1])?.trim();
    let link =
      /<link[^>]*href="([^"]+)"/.exec(it)?.[1]?.trim()
      ?? stripCdata(/<link>([\s\S]*?)<\/link>/.exec(it)?.[1])?.trim();
    if (!title || !link) continue;
    // Some feeds wrap link in atom self-closing; ensure absolute URL.
    if (!/^https?:\/\//i.test(link)) {
      const base = new URL(`https://${outlet}`);
      link = new URL(link, base).toString();
    }
    const pub =
      /<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1]?.trim()
      ?? /<updated>([\s\S]*?)<\/updated>/.exec(it)?.[1]?.trim()
      ?? /<published>([\s\S]*?)<\/published>/.exec(it)?.[1]?.trim();
    const desc =
      stripCdata(/<description>([\s\S]*?)<\/description>/.exec(it)?.[1])?.trim()
      ?? stripCdata(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(it)?.[1])?.trim();
    const cleanedDesc = desc ? desc.replace(/<[^>]+>/g, "").trim().slice(0, 240) : undefined;
    out.push({
      source,
      outlet,
      title: title.replace(/<[^>]+>/g, "").trim(),
      url: link,
      publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      ...(cleanedDesc ? { snippet: cleanedDesc } : {}),
    });
  }
  return out;
}

function stripCdata(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

async function fetchOne(feed: RssFeed): Promise<string | null> {
  try {
    const res = await abortable(
      fetch(feed.url, {
        headers: { accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*", "user-agent": "HawkeyeSterling/1.0 (compatible; adverse-media)" },
        redirect: "follow",
      }),
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Free RSS aggregator. Fans out across all curated public feeds and
 * substring-filters items mentioning the subject name in title or
 * snippet. Returns a single NewsAdapter so the caller can plug it
 * into searchAllNews's flow.
 *
 * Toggle with FREE_RSS_ENABLED=1.
 */
export function freeRssAdapter(): NewsAdapter {
  const enabled = process.env["FREE_RSS_ENABLED"];
  if (!enabled || enabled === "0" || enabled.toLowerCase() === "false") return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      const needle = subjectName.toLowerCase();
      // Fan-out parallel; each feed's failure is independent.
      const xmls = await Promise.all(FREE_RSS_FEEDS.map((f) => fetchOne(f).then((x) => ({ feed: f, xml: x }))));
      const articles: NewsArticle[] = [];
      for (const { feed, xml } of xmls) {
        if (!xml) continue;
        const parsed = parseFeed(xml, feed.source, feed.outlet);
        for (const a of parsed) {
          const hay = `${a.title} ${a.snippet ?? ""}`.toLowerCase();
          if (hay.includes(needle)) articles.push(a);
        }
      }
      // Dedupe by URL
      const seen = new Set<string>();
      const deduped = articles.filter((a) => {
        const k = a.url.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      // Cap return at limit
      return deduped.slice(0, opts?.limit ?? 50);
    },
  };
}

/** List of feeds for UI surfaces that want to show coverage. */
export function listFreeRssFeeds(): Array<{ source: string; outlet: string }> {
  return FREE_RSS_FEEDS.map((f) => ({ source: f.source, outlet: f.outlet }));
}
