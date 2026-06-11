"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import type { NewsArticle } from "@/lib/intelligence/newsAdapters";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorldwideNewsResponse {
  ok: true;
  articles: NewsArticle[];
  cachedAt: string;
  count: number;
}

// ── Category badges ───────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<NonNullable<NewsArticle["sourceCategory"]>, string> = {
  investigative: "Investigative",
  wire:          "Wire",
  regulatory:    "Regulatory",
  regional:      "Regional",
  social:        "Social",
};

const CATEGORY_CLS: Record<NonNullable<NewsArticle["sourceCategory"]>, string> = {
  investigative: "bg-amber-dim text-amber border border-amber/30",
  wire:          "bg-green-dim text-green border border-green/30",
  regulatory:    "bg-brand-dim text-brand border border-brand/30",
  regional:      "bg-bg-2 text-ink-2 border border-hair-2",
  social:        "bg-bg-2 text-ink-2 border border-hair-2",
};

// Fallback when sourceCategory is missing
const OUTLET_CATEGORY_CLS: Record<string, string> = {
  "occrp.org":     "bg-amber-dim text-amber border border-amber/30",
  "icij.org":      "bg-amber-dim text-amber border border-amber/30",
  "bellingcat.com":"bg-amber-dim text-amber border border-amber/30",
  "reuters.com":   "bg-green-dim text-green border border-green/30",
  "apnews.com":    "bg-green-dim text-green border border-green/30",
  "bbc.co.uk":     "bg-green-dim text-green border border-green/30",
};

function categoryBadgeCls(article: NewsArticle): string {
  if (article.sourceCategory && CATEGORY_CLS[article.sourceCategory]) {
    return CATEGORY_CLS[article.sourceCategory]!;
  }
  return OUTLET_CATEGORY_CLS[article.outlet] ?? "bg-bg-2 text-ink-2 border border-hair-2";
}

function categoryLabel(article: NewsArticle): string {
  if (article.sourceCategory && CATEGORY_LABEL[article.sourceCategory]) {
    return CATEGORY_LABEL[article.sourceCategory]!;
  }
  return "News";
}

function outletLabel(outlet: string): string {
  const map: Record<string, string> = {
    "occrp.org":     "OCCRP",
    "icij.org":      "ICIJ",
    "bellingcat.com":"Bellingcat",
    "reuters.com":   "Reuters",
    "apnews.com":    "AP",
    "bbc.co.uk":     "BBC",
  };
  return map[outlet] ?? outlet;
}

// ── Time-ago helper ───────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="px-4 py-3 border-b border-hair-2 last:border-b-0 animate-pulse">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-3 w-12 bg-bg-2 rounded" />
        <div className="h-3 w-16 bg-bg-2 rounded" />
        <div className="h-3 w-10 bg-bg-2 rounded ml-auto" />
      </div>
      <div className="h-3.5 bg-bg-2 rounded w-3/4 mb-1" />
      <div className="h-3 bg-bg-2 rounded w-full" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorldwideNewsFeed() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchJson<WorldwideNewsResponse>("/api/worldwide-news", {
      label: "Worldwide news feed failed",
      timeoutMs: 20_000,
    });
    if (res.ok && res.data?.ok) {
      setArticles(res.data.articles);
      setLastUpdated(new Date());
    } else {
      setError(res.error ?? "Could not load live news feed — check back shortly");
    }
    setLoading(false);
  }, []);

  // Initial load + auto-refresh every 5 minutes
  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  // "Last updated X min ago" — recompute every 30 s
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => {
      const diff = Math.round((Date.now() - lastUpdated.getTime()) / 60_000);
      setLastUpdatedLabel(diff === 0 ? "just now" : `${diff} min ago`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return (
    <div className="mb-4 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-hair-2">
        <div className="flex items-center gap-2">
          {/* Pulsing green "live" indicator */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green" />
          </span>
          <span className="text-11 font-semibold text-ink-0">Worldwide AML News</span>
          <span className="text-10 text-ink-3">— Live feed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            className="text-10 text-ink-3 hover:text-ink-0 transition-colors px-2 py-0.5 rounded border border-hair-2 hover:bg-bg-1"
            title={hidden ? "Show news feed" : "Hide news feed"}
          >
            {hidden ? "Show" : "Hide"}
          </button>
        </div>
      </div>

      {!hidden && (
        <>
          {/* Body */}
          {loading && articles.length === 0 ? (
            <div aria-live="polite" aria-label="Loading news articles">
              {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
            </div>
          ) : error && articles.length === 0 ? (
            <div role="alert" aria-live="assertive" className="px-4 py-6 text-center text-12 text-ink-3">
              {error.includes("401") || error.includes("API key") || error.includes("key required")
                ? "News feed temporarily unavailable — retrying automatically."
                : error}
            </div>
          ) : (
            <div className="overflow-y-auto" aria-live="polite" aria-label="AML news articles" style={{ maxHeight: "400px" }}>
              {articles.map((article) => (
                <div
                  key={article.url}
                  className="px-4 py-3 border-b border-hair-2 last:border-b-0 hover:bg-bg-1 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-10 font-semibold text-ink-2">
                      {outletLabel(article.outlet)}
                    </span>
                    <span className={`text-9 font-semibold px-1.5 py-px rounded ${categoryBadgeCls(article)}`}>
                      {categoryLabel(article)}
                    </span>
                    <span className="text-10 text-ink-3 ml-auto flex-shrink-0">
                      {timeAgo(article.publishedAt)}
                    </span>
                  </div>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-12 font-medium text-ink-0 hover:text-brand transition-colors leading-snug line-clamp-2 block"
                  >
                    {article.title}
                  </a>
                  {article.snippet && (
                    <p className="text-10 text-ink-3 mt-0.5 leading-relaxed">
                      {article.snippet.slice(0, 80)}{article.snippet.length > 80 ? "…" : ""}
                    </p>
                  )}
                </div>
              ))}

              {articles.length === 0 && (
                <div className="px-4 py-6 text-center text-12 text-ink-3">
                  No AML news articles available right now.
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 border-t border-hair-2 flex items-center justify-between">
            <span className="text-10 text-ink-3">
              {articles.length > 0
                ? `${articles.length} articles from OCCRP, ICIJ, Reuters, AP, BBC, Bellingcat`
                : "Fetching from public RSS feeds — no API key required"}
            </span>
            {lastUpdatedLabel && (
              <span className="text-10 text-ink-3">Updated {lastUpdatedLabel}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
