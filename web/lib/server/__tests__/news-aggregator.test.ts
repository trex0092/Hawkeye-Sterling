// Hawkeye Sterling — news-aggregator unit tests.
// Tests deduplication, ranking, multilingual querying, caching, and timeout handling.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies before importing the module under test.
vi.mock("@/lib/intelligence/newsAdapters", () => ({
  searchAllNews: vi.fn(),
}));
vi.mock("@/lib/intelligence/transliteration", () => ({
  transliterate: vi.fn((input: string) => ({
    original: input,
    transliterated: input,
    scriptDetected: "latin",
  })),
}));
vi.mock("@/lib/intelligence/amlKeywords", () => ({
  matchAmlKeywords: vi.fn(() => []),
}));

import {
  aggregateNews,
  _testOnly_deduplicateByTitle,
  _testOnly_jaccard,
  _testOnly_titleTokens,
  _testOnly_recencyScore,
  _testOnly_aggCache,
  _testOnly_AGG_CACHE_TTL_MS,
} from "../news-aggregator.js";
import { searchAllNews } from "@/lib/intelligence/newsAdapters";
import { transliterate } from "@/lib/intelligence/transliteration";
import { matchAmlKeywords } from "@/lib/intelligence/amlKeywords";

const mockSearchAllNews = vi.mocked(searchAllNews);
const mockTransliterate = vi.mocked(transliterate);
const mockMatchAmlKeywords = vi.mocked(matchAmlKeywords);

function makeArticle(overrides: {
  title?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  outlet?: string;
  snippet?: string;
}) {
  return {
    title: overrides.title ?? "Test Article",
    url: overrides.url ?? "https://example.com/article",
    source: overrides.source ?? "newsapi",
    outlet: overrides.outlet ?? "example.com",
    publishedAt: overrides.publishedAt ?? new Date().toISOString(),
    snippet: overrides.snippet,
  };
}

describe("_testOnly_titleTokens", () => {
  it("returns tokens from title", () => {
    const tokens = _testOnly_titleTokens("Money Laundering Probe");
    expect(tokens.has("money")).toBe(true);
    expect(tokens.has("laundering")).toBe(true);
    expect(tokens.has("probe")).toBe(true);
  });

  it("filters short tokens", () => {
    const tokens = _testOnly_titleTokens("Al Said in Fraud Case");
    expect(tokens.has("al")).toBe(false);
    expect(tokens.has("in")).toBe(false);
  });
});

describe("_testOnly_jaccard", () => {
  it("returns 1 for identical sets", () => {
    const a = new Set(["money", "fraud"]);
    const b = new Set(["money", "fraud"]);
    expect(_testOnly_jaccard(a, b)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["money"]);
    const b = new Set(["fraud"]);
    expect(_testOnly_jaccard(a, b)).toBe(0);
  });

  it("returns 0.5 for 50% overlap", () => {
    const a = new Set(["money", "fraud"]);
    const b = new Set(["money", "laundering"]);
    expect(_testOnly_jaccard(a, b)).toBeCloseTo(1 / 3, 5);
  });

  it("handles empty sets", () => {
    expect(_testOnly_jaccard(new Set(), new Set())).toBe(1);
  });
});

describe("_testOnly_deduplicateByTitle", () => {
  it("keeps both articles when titles are dissimilar", () => {
    const articles = [
      makeArticle({ title: "Money Laundering Ring Busted", url: "https://a.com/1" }),
      makeArticle({ title: "Central Bank Raises Rates", url: "https://b.com/2" }),
    ];
    const result = _testOnly_deduplicateByTitle(articles);
    expect(result).toHaveLength(2);
  });

  it("deduplicates articles with Jaccard similarity >= 0.85", () => {
    const title = "Money Laundering Ring Busted In Dubai Investigation";
    const articles = [
      makeArticle({ title, url: "https://a.com/1" }),
      makeArticle({ title: title + " Report", url: "https://b.com/2" }),
    ];
    const result = _testOnly_deduplicateByTitle(articles);
    // The second article is near-identical — should be deduped
    expect(result.length).toBeLessThan(2);
  });

  it("preserves the first article when deduplicating", () => {
    const title = "Sanctions Violation Probe Fraud Case Corruption";
    const a1 = makeArticle({ title, url: "https://first.com/1", source: "newsapi" });
    const a2 = makeArticle({ title, url: "https://second.com/2", source: "gdelt" });
    const result = _testOnly_deduplicateByTitle([a1, a2]);
    expect(result[0]!.url).toBe("https://first.com/1");
  });
});

describe("_testOnly_recencyScore", () => {
  it("returns close to 1 for very recent articles", () => {
    const score = _testOnly_recencyScore(new Date().toISOString());
    expect(score).toBeGreaterThan(0.99);
  });

  it("returns 0 for articles older than 1 year", () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const score = _testOnly_recencyScore(twoYearsAgo);
    expect(score).toBe(0);
  });

  it("returns 0.5 for articles 6 months old", () => {
    const sixMonthsAgo = new Date(Date.now() - 182.5 * 24 * 60 * 60 * 1000).toISOString();
    const score = _testOnly_recencyScore(sixMonthsAgo);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
  });

  it("returns 0.5 for invalid dates", () => {
    expect(_testOnly_recencyScore("not-a-date")).toBe(0.5);
  });
});

describe("aggregateNews", () => {
  beforeEach(() => {
    _testOnly_aggCache.clear();
    mockSearchAllNews.mockReset();
    mockTransliterate.mockReset();
    mockMatchAmlKeywords.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty result when no articles found", async () => {
    mockSearchAllNews.mockResolvedValue({ articles: [], providersUsed: [] });
    mockTransliterate.mockReturnValue({ original: "Test", transliterated: "Test", scriptDetected: "latin" });
    const result = await aggregateNews("Test Name", { noCache: true });
    expect(result.articles).toHaveLength(0);
  });

  it("returns ranked articles for a Latin-script name", async () => {
    const now = new Date().toISOString();
    const oldDate = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString();
    mockTransliterate.mockReturnValue({ original: "John Smith", transliterated: "John Smith", scriptDetected: "latin" });
    mockSearchAllNews.mockResolvedValue({
      articles: [
        makeArticle({ title: "Old Article", publishedAt: oldDate, url: "https://old.com/1" }),
        makeArticle({ title: "Fresh Sanctions Article", publishedAt: now, url: "https://new.com/1", outlet: "reuters.com" }),
      ],
      providersUsed: ["newsapi"],
    });
    const result = await aggregateNews("John Smith", { noCache: true });
    expect(result.articles).toHaveLength(2);
    // More recent + high-credibility article should rank first
    expect(result.articles[0]!.url).toBe("https://new.com/1");
  });

  it("deduplicates articles with same URL across queries", async () => {
    mockTransliterate.mockReturnValue({ original: "Test", transliterated: "Test", scriptDetected: "latin" });
    mockSearchAllNews.mockResolvedValue({
      articles: [
        makeArticle({ url: "https://same.com/1" }),
        makeArticle({ url: "https://same.com/1" }),  // same URL
      ],
      providersUsed: ["newsapi"],
    });
    const result = await aggregateNews("Test", { noCache: true });
    expect(result.articles).toHaveLength(1);
  });

  it("caches results and returns cache on second call without API calls", async () => {
    mockTransliterate.mockReturnValue({ original: "Cached Name", transliterated: "Cached Name", scriptDetected: "latin" });
    mockSearchAllNews.mockResolvedValue({
      articles: [makeArticle({ title: "Cached Article" })],
      providersUsed: ["newsapi"],
    });
    await aggregateNews("Cached Name");  // first call populates cache
    mockSearchAllNews.mockReset();  // if called again, test will detect it
    mockSearchAllNews.mockResolvedValue({ articles: [], providersUsed: [] });

    const result2 = await aggregateNews("Cached Name");
    // Cache should have been used — no new API calls should have been needed
    expect(result2.cachedAt).toBeDefined();
    expect(result2.articles).toHaveLength(1);
  });

  it("respects cache expiry and re-fetches after TTL", async () => {
    mockTransliterate.mockReturnValue({ original: "Expiry Test", transliterated: "Expiry Test", scriptDetected: "latin" });
    mockSearchAllNews.mockResolvedValue({
      articles: [makeArticle({ title: "Fresh" })],
      providersUsed: ["newsapi"],
    });
    await aggregateNews("Expiry Test");  // populate cache

    // Manually expire the cache entry
    const key = "expiry test";
    const entry = _testOnly_aggCache.get(key);
    if (entry) {
      _testOnly_aggCache.set(key, {
        ...entry,
        cachedAt: Date.now() - _testOnly_AGG_CACHE_TTL_MS - 1,
      });
    }
    // Second call should re-fetch
    mockSearchAllNews.mockResolvedValue({
      articles: [makeArticle({ title: "Refreshed" })],
      providersUsed: ["newsapi"],
    });
    const result = await aggregateNews("Expiry Test");
    expect(result.articles[0]!.title).toBe("Refreshed");
  });

  it("issues transliterated query for non-Latin name", async () => {
    mockTransliterate.mockReturnValue({
      original: "محمد علي",
      transliterated: "Muhammad Ali",
      scriptDetected: "arabic",
    });
    mockSearchAllNews.mockResolvedValue({ articles: [], providersUsed: [] });
    await aggregateNews("محمد علي", { noCache: true });
    // Should have been called twice: original + transliterated
    expect(mockSearchAllNews).toHaveBeenCalledTimes(2);
    const calls = mockSearchAllNews.mock.calls.map((c) => c[0]);
    expect(calls).toContain("محمد علي");
    expect(calls).toContain("Muhammad Ali");
  });

  it("returns results even when news search times out", async () => {
    mockTransliterate.mockReturnValue({ original: "Slow Name", transliterated: "Slow Name", scriptDetected: "latin" });
    // Simulate slow provider that resolves after the 2.5s timeout
    mockSearchAllNews.mockImplementation(() =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ articles: [makeArticle({ title: "Late Article" })], providersUsed: ["slow"] }), 3000),
      ),
    );
    const start = Date.now();
    const result = await aggregateNews("Slow Name", { noCache: true });
    const elapsed = Date.now() - start;
    // Should return within ~2.6s (not 3s)
    expect(elapsed).toBeLessThan(2700);
    // Result may be empty (timeout) — that is acceptable; what matters is it didn't hang
    expect(Array.isArray(result.articles)).toBe(true);
  });

  it("includes adverse categories from AML keyword matching", async () => {
    mockTransliterate.mockReturnValue({ original: "Fraud Corp", transliterated: "Fraud Corp", scriptDetected: "latin" });
    mockMatchAmlKeywords.mockReturnValue(["money_laundering", "corruption"]);
    mockSearchAllNews.mockResolvedValue({
      articles: [makeArticle({ snippet: "Fraud Corp investigated for laundering" })],
      providersUsed: ["newsapi"],
    });
    const result = await aggregateNews("Fraud Corp", { noCache: true });
    expect(result.articles[0]!.adverseCategories).toContain("money_laundering");
  });
});
