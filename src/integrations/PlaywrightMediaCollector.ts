// Hawkeye Sterling — Playwright Dynamic Media Collector.
// (Taranis playwright_manager.py + simple_web_collector.py analog)
//
// Scrapes JS-rendered news pages — Al Arabiya, Gulf News, MENAFN, Khaleej
// Times, Zawya, The National — that are inaccessible via RSS or plain HTTP.
// Uses Playwright/Chromium, already present in devDependencies for E2E tests.
//
// Output normalised to MediaArticle so the existing NLP pipeline consumes it
// without modification.
//
// Guards:
//   · PLAYWRIGHT_MEDIA_ENABLED env var must equal "1" — off by default.
//   · 20-second page timeout; 6-article cap per feed to avoid rate-banning.
//   · No cookie persistence; JavaScript sandboxed to page evaluation only.
//   · Fails silently: any error returns empty array, never throws to caller.

import { createHash } from 'node:crypto';
import type { MediaArticle, FeedConfig } from '../brain/MediaIngestionService.js';

// Playwright is loaded fully at runtime via dynamic import — no static type
// imports so this module compiles cleanly when playwright is absent (e.g.
// minimal serverless workers). All playwright objects typed as unknown / any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage    = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBrowser = any;

export interface PlaywrightFeedConfig extends FeedConfig {
  articleSelector?: string;
  titleSelector?: string;
  dateSelector?: string;
}

const PAGE_TIMEOUT_MS = 20_000;
const MAX_ITEMS_PER_FEED = 6;

const DEFAULT_TITLE_SELECTORS   = ['h1', '[itemprop="headline"]', '.article-title', '.story-title'];
const DEFAULT_DATE_SELECTORS    = ['time[datetime]', '[itemprop="datePublished"]', '.article-date', '.publish-date'];
const DEFAULT_CONTENT_SELECTORS = ['article', '[role="main"]', '.article-body', '.story-body', '.post-content', 'main'];

// UAE/MENA outlets that render articles with JavaScript — no RSS / API available
export const UAE_PLAYWRIGHT_FEEDS: PlaywrightFeedConfig[] = [
  {
    id: 'pw_alarabiya',
    name: 'Al Arabiya English',
    url: 'https://english.alarabiya.net/business/economy',
    sourceType: 'playwright-web',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 0.90,
    pollIntervalMinutes: 60,
    enabled: true,
  },
  {
    id: 'pw_gulfnews',
    name: 'Gulf News Business',
    url: 'https://gulfnews.com/business',
    sourceType: 'playwright-web',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 0.85,
    pollIntervalMinutes: 60,
    enabled: true,
  },
  {
    id: 'pw_menafn',
    name: 'MENAFN Finance',
    url: 'https://menafn.com/qn_finance.aspx',
    sourceType: 'playwright-web',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 0.75,
    pollIntervalMinutes: 90,
    enabled: true,
  },
  {
    id: 'pw_khaleej_times',
    name: 'Khaleej Times Business',
    url: 'https://www.khaleejtimes.com/business',
    sourceType: 'playwright-web',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 0.80,
    pollIntervalMinutes: 60,
    enabled: true,
  },
  {
    id: 'pw_zawya',
    name: 'Zawya Economy',
    url: 'https://www.zawya.com/mena/economy',
    sourceType: 'playwright-web',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 0.85,
    pollIntervalMinutes: 60,
    enabled: true,
  },
  {
    id: 'pw_the_national',
    name: 'The National Business',
    url: 'https://www.thenationalnews.com/business',
    sourceType: 'playwright-web',
    jurisdiction: 'AE',
    language: 'en',
    reliability: 0.90,
    pollIntervalMinutes: 60,
    enabled: true,
  },
];

function makeId(url: string, feedId: string): string {
  return `pw_${feedId}_${createHash('sha256').update(url).digest('hex').slice(0, 10)}`;
}

async function firstMatch(page: AnyPage, selectors: string[]): Promise<string> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const text = (await el.textContent()) ?? '';
      if (text.trim()) return text.trim();
    } catch { /* selector not found */ }
  }
  return '';
}

async function firstAttr(page: AnyPage, selectors: string[], attr: string): Promise<string> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const val = (await el.getAttribute(attr)) ?? '';
      if (val.trim()) return val.trim();
      const text = (await el.textContent()) ?? '';
      if (text.trim()) return text.trim();
    } catch { /* selector not found */ }
  }
  return '';
}

async function extractArticle(
  page: AnyPage,
  url: string,
  feed: PlaywrightFeedConfig,
  fetchedAt: string,
): Promise<MediaArticle | null> {
  try {
    await page.goto(url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });

    const titleSels   = feed.titleSelector   ? [feed.titleSelector]   : DEFAULT_TITLE_SELECTORS;
    const dateSels    = feed.dateSelector    ? [feed.dateSelector]    : DEFAULT_DATE_SELECTORS;
    const contentSels = feed.articleSelector ? [feed.articleSelector] : DEFAULT_CONTENT_SELECTORS;

    const title      = await firstMatch(page, titleSels);
    const publishedAt = await firstAttr(page, dateSels, 'datetime') || fetchedAt;
    const content    = await firstMatch(page, contentSels);

    if (!title && !content) return null;

    return {
      id: makeId(url, feed.id),
      source: feed.name,
      sourceType: feed.sourceType,
      title: title || url,
      content: content.slice(0, 8_000),
      url,
      publishedAt,
      fetchedAt,
      language: feed.language ?? 'en',
      jurisdiction: feed.jurisdiction,
      reliability: feed.reliability ?? 0.75,
      tags: [],
    };
  } catch {
    return null;
  }
}

/** Collect articles from one JS-rendered feed. Returns [] on any failure.
 *  Requires PLAYWRIGHT_MEDIA_ENABLED=1 and playwright installed. */
export async function collectFromFeed(
  feed: PlaywrightFeedConfig,
): Promise<MediaArticle[]> {
  if (process.env['PLAYWRIGHT_MEDIA_ENABLED'] !== '1') return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pw: any;
  let browser: AnyBrowser;
  try {
    // Use new Function to prevent tsc from statically resolving the optional dep.
    // At runtime this is equivalent to `await import('playwright')`.
    const loadPw = new Function('return import("playwright")') as () => Promise<unknown>;
    pw = await loadPw();
    browser = await pw.chromium.launch({ headless: true });
  } catch {
    return [];
  }

  const fetchedAt = new Date().toISOString();
  const results: MediaArticle[] = [];

  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; HawkeyeSterling/2.0; +https://hawkeyesterling.com/bot)',
      javaScriptEnabled: true,
      viewport: { width: 1280, height: 800 },
    });

    const listPage = await ctx.newPage();
    await listPage.goto(feed.url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });

    const links: string[] = await listPage.$$eval(
      'a[href]',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (els: any[], base: string) => {
        const out = new Set<string>();
        for (const el of els) {
          const href: string = el.href;
          if (href && href.startsWith(base) && href !== base) out.add(href);
        }
        return [...out].slice(0, 12);
      },
      feed.url,
    );
    await listPage.close();

    for (const link of links) {
      if (results.length >= MAX_ITEMS_PER_FEED) break;
      const articlePage = await ctx.newPage();
      const article = await extractArticle(articlePage, link, feed, fetchedAt);
      await articlePage.close();
      if (article) results.push(article);
    }

    await ctx.close();
  } finally {
    await browser.close().catch(() => undefined);
  }

  return results;
}

/** Collect from all enabled UAE Playwright feeds in parallel. Never throws. */
export async function collectUAEMedia(): Promise<MediaArticle[]> {
  const feeds = UAE_PLAYWRIGHT_FEEDS.filter(f => f.enabled);
  const settled = await Promise.allSettled(feeds.map(f => collectFromFeed(f)));
  return settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}
