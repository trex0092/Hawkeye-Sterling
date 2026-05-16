// Hawkeye Sterling — adverse-media ingestion service.
// Ingests from RSS feeds, regulator enforcement releases, sanctions
// announcements, court rulings, and official government publications.
// Normalizes into a common MediaArticle format for the NLP pipeline.
//
// Source categories:
//   - RSS: news agencies, financial press
//   - Regulatory: SEC, FCA, CFTC, FCA, UAE SCA, CBUAE, ADGM, DFSA
//   - Sanctions: OFAC, EU FSF, UK OFSI, UN, UAE Cabinet
//   - Courts: PACER, eCourts, UK Court Service
//   - Interpol: Red notices, diffusions

export interface MediaArticle {
  id: string;
  source: string;
  sourceType: MediaSourceType;
  title: string;
  content: string;
  url?: string | undefined;
  publishedAt: string;
  fetchedAt: string;
  language: string;
  jurisdiction?: string | undefined;
  reliability: number;
  tags: string[];
  rawXml?: string | undefined;
}

export type MediaSourceType =
  | 'rss'
  | 'regulator_enforcement'
  | 'sanctions_announcement'
  | 'court_ruling'
  | 'interpol_notice'
  | 'government_press_release'
  | 'financial_intelligence';

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  sourceType: MediaSourceType;
  jurisdiction?: string;
  language?: string;
  reliability?: number;
  pollIntervalMinutes: number;
  enabled: boolean;
}

export interface IngestionReport {
  feedId: string;
  feedName: string;
  startedAt: string;
  completedAt: string;
  articlesFound: number;
  articlesNew: number;
  articlesFailed: number;
  errors: string[];
  checksum: string;
}

// ── Feed registry ─────────────────────────────────────────────────────────────
// Production deployments should persist this in a database; the registry
// here defines the known feed catalog. Operators can enable/disable feeds.

export const FEED_REGISTRY: FeedConfig[] = [
  // ── RSS — International Financial Press ──────────────────────────────────
  {
    id: 'reuters_finance',
    name: 'Reuters Finance',
    url: 'https://feeds.reuters.com/reuters/businessNews',
    sourceType: 'rss',
    language: 'en',
    reliability: 0.95,
    pollIntervalMinutes: 30,
    enabled: true,
  },
  {
    id: 'ft_markets',
    name: 'Financial Times Markets',
    url: 'https://www.ft.com/myft/following/rss',
    sourceType: 'rss',
    language: 'en',
    reliability: 0.95,
    pollIntervalMinutes: 60,
    enabled: true,
  },
  {
    id: 'bloomberg_law',
    name: 'Bloomberg Law',
    url: 'https://news.bloomberglaw.com/rss',
    sourceType: 'rss',
    language: 'en',
    reliability: 0.95,
    pollIntervalMinutes: 30,
    enabled: true,
  },
  // ── Regulator Enforcement Releases ──────────────────────────────────────
  {
    id: 'sec_enforcement',
    name: 'SEC Enforcement Actions',
    url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=enforcement&dateb=&owner=include&count=40&search_text=&action=getcompany',
    sourceType: 'regulator_enforcement',
    jurisdiction: 'US',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 120,
    enabled: true,
  },
  {
    id: 'fca_enforcement',
    name: 'FCA Enforcement Actions',
    url: 'https://www.fca.org.uk/news/rss/all',
    sourceType: 'regulator_enforcement',
    jurisdiction: 'GB',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 120,
    enabled: true,
  },
  {
    id: 'cftc_enforcement',
    name: 'CFTC Enforcement',
    url: 'https://www.cftc.gov/rss/pressroom.xml',
    sourceType: 'regulator_enforcement',
    jurisdiction: 'US',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 120,
    enabled: true,
  },
  // ── UAE Regulatory Feeds ─────────────────────────────────────────────────
  {
    id: 'uae_cabinet_sanctions',
    name: 'UAE Cabinet Sanctions List',
    url: 'https://www.uaecabinet.ae/en/sanctions',
    sourceType: 'sanctions_announcement',
    jurisdiction: 'AE',
    language: 'ar',
    reliability: 1.00,
    pollIntervalMinutes: 240,
    enabled: true,
  },
  {
    id: 'cbuae_circulars',
    name: 'CBUAE Circulars & Notices',
    url: 'https://www.centralbank.ae/en/news',
    sourceType: 'regulator_enforcement',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 240,
    enabled: true,
  },
  {
    id: 'adgm_enforcement',
    name: 'ADGM Enforcement Notices',
    url: 'https://www.adgm.com/media/newsroom/press-releases',
    sourceType: 'regulator_enforcement',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 240,
    enabled: true,
  },
  {
    id: 'dfsa_enforcement',
    name: 'DFSA Enforcement',
    url: 'https://www.dfsa.ae/news-and-events/press-releases',
    sourceType: 'regulator_enforcement',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 240,
    enabled: true,
  },
  // ── Sanctions Announcements ───────────────────────────────────────────────
  {
    id: 'ofac_announcements',
    name: 'OFAC Sanctions Announcements',
    url: 'https://ofac.treasury.gov/recent-actions/recent-rss-actions',
    sourceType: 'sanctions_announcement',
    jurisdiction: 'US',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 60,
    enabled: true,
  },
  {
    id: 'eu_sanctions_map',
    name: 'EU Sanctions Map Announcements',
    url: 'https://www.sanctionsmap.eu/api/v1/news',
    sourceType: 'sanctions_announcement',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 120,
    enabled: true,
  },
  {
    id: 'un_sc_press',
    name: 'UN Security Council Press Releases',
    url: 'https://www.un.org/press/en/rss.xml',
    sourceType: 'sanctions_announcement',
    language: 'en',
    reliability: 1.00,
    pollIntervalMinutes: 120,
    enabled: true,
  },
  // ── Interpol Notices ─────────────────────────────────────────────────────
  {
    id: 'interpol_red_notices',
    name: 'Interpol Red Notices',
    url: 'https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices',
    sourceType: 'interpol_notice',
    language: 'en',
    reliability: 0.95,
    pollIntervalMinutes: 360,
    enabled: true,
  },
  // ── Financial Intelligence Units ─────────────────────────────────────────
  {
    id: 'fatf_publications',
    name: 'FATF Publications',
    url: 'https://www.fatf-gafi.org/en/publications/rss.xml',
    sourceType: 'financial_intelligence',
    language: 'en',
    reliability: 0.98,
    pollIntervalMinutes: 1440, // daily
    enabled: true,
  },
  {
    id: 'egmont_typologies',
    name: 'Egmont Group Typologies',
    url: 'https://egmontgroup.org/news',
    sourceType: 'financial_intelligence',
    language: 'en',
    reliability: 0.97,
    pollIntervalMinutes: 1440,
    enabled: true,
  },
];

// ── Ingestion result types ────────────────────────────────────────────────────

export interface IngestionResult {
  articles: MediaArticle[];
  report: IngestionReport;
}

// ── Checksum computation ──────────────────────────────────────────────────────
// FNV-1a 32-bit — fast, deterministic, sufficient for change detection.
// Not used for tamper-evidence; use SHA-256 audit chain for that.

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function articleChecksum(articles: MediaArticle[]): string {
  const concat = articles.map((a) => `${a.url ?? a.title}|${a.publishedAt}`).join('\n');
  return fnv1a(concat);
}

// ── XML/RSS parsing (lightweight) ────────────────────────────────────────────

interface RssFeedItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid?: string;
}

function parseRssXml(xml: string): RssFeedItem[] {
  const items: RssFeedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const tagRegex = (tag: string) =>
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>(.*?)<\\/${tag}>`, 'is');

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? '';
    const extract = (tag: string): string => {
      const m = tagRegex(tag).exec(block);
      return (m?.[1] ?? m?.[2] ?? '').trim();
    };

    items.push({
      title: extract('title'),
      link: extract('link'),
      pubDate: extract('pubDate'),
      description: extract('description'),
      guid: extract('guid'),
    });
  }
  return items;
}

function detectLanguage(url: string, content: string, config: FeedConfig): string {
  if (config.language) return config.language;
  if (/[؀-ۿ]/.test(content)) return 'ar';
  if (/[Ѐ-ӿ]/.test(content)) return 'ru';
  if (/[一-鿿]/.test(content)) return 'zh';
  return 'en';
}

// ── Core ingestion function ───────────────────────────────────────────────────
// In production, `fetchFn` is a retrying HTTP client. For tests, it is
// injected so the feed logic can be validated without network calls.

export type FetchFunction = (url: string, timeoutMs?: number) => Promise<{ text: () => Promise<string>; ok: boolean; status: number }>;

export async function ingestFeed(
  config: FeedConfig,
  fetchFn: FetchFunction,
  reliabilityOverride?: number,
): Promise<IngestionResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const articles: MediaArticle[] = [];

  let rawText = '';
  try {
    const res = await fetchFn(config.url, 15_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawText = await res.text();
  } catch (err) {
    errors.push(`Fetch error: ${String(err)}`);
    return {
      articles: [],
      report: {
        feedId: config.id,
        feedName: config.name,
        startedAt,
        completedAt: new Date().toISOString(),
        articlesFound: 0,
        articlesNew: 0,
        articlesFailed: 1,
        errors,
        checksum: fnv1a(''),
      },
    };
  }

  // Parse RSS/XML
  const items = parseRssXml(rawText);

  let articlesFailed = 0;
  for (const item of items) {
    try {
      const id = fnv1a(`${config.id}:${item.guid ?? item.link ?? item.title}:${item.pubDate}`);
      const language = detectLanguage(config.url, item.title + item.description, config);
      const article: MediaArticle = {
        id,
        source: config.name,
        sourceType: config.sourceType,
        title: item.title,
        content: item.description,
        url: item.link || undefined,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : startedAt,
        fetchedAt: startedAt,
        language,
        jurisdiction: config.jurisdiction,
        reliability: reliabilityOverride ?? config.reliability ?? 0.70,
        tags: [config.sourceType, config.jurisdiction ?? 'international'].filter(Boolean),
        rawXml: item.description,
      };
      articles.push(article);
    } catch (err) {
      articlesFailed++;
      errors.push(`Parse error on item "${item.title}": ${String(err)}`);
    }
  }

  const completedAt = new Date().toISOString();
  return {
    articles,
    report: {
      feedId: config.id,
      feedName: config.name,
      startedAt,
      completedAt,
      articlesFound: items.length,
      articlesNew: articles.length,
      articlesFailed,
      errors,
      checksum: articleChecksum(articles),
    },
  };
}

// ── Batch ingestion orchestration ─────────────────────────────────────────────

export interface BatchIngestionResult {
  totalArticles: number;
  totalErrors: number;
  feedReports: IngestionReport[];
  completedAt: string;
}

export async function ingestAllFeeds(
  fetchFn: FetchFunction,
  configs?: FeedConfig[],
): Promise<BatchIngestionResult> {
  const enabledFeeds = (configs ?? FEED_REGISTRY).filter((f) => f.enabled);
  const feedReports: IngestionReport[] = [];
  let totalArticles = 0;
  let totalErrors = 0;

  // Run feeds concurrently (max 5 at a time)
  const CONCURRENCY = 5;
  for (let i = 0; i < enabledFeeds.length; i += CONCURRENCY) {
    const batch = enabledFeeds.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((config) => ingestFeed(config, fetchFn)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalArticles += result.value.articles.length;
        totalErrors += result.value.report.articlesFailed;
        feedReports.push(result.value.report);
      } else {
        totalErrors++;
      }
    }
  }

  return {
    totalArticles,
    totalErrors,
    feedReports,
    completedAt: new Date().toISOString(),
  };
}
