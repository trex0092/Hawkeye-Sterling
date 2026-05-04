"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { NewsIntelResult, ArticleInput, RiskTheme } from "@/app/api/news-intel/analyze/route";
import type { FeedItem, NewsFeedResult } from "@/app/api/news-intel/feed/route";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "analysis" | "feed" | "watchlist";
type FeedFilter = "all" | RiskTheme;

interface WatchlistEntry {
  id: string;
  entity: string;
  addedAt: string;
  lastArticle: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  trend: "escalating" | "stable" | "de-escalating";
  alertCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FEED_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

const RISK_THEME_LABELS: Record<RiskTheme, string> = {
  financial_crime: "Financial Crime",
  sanctions: "Sanctions",
  corruption: "Corruption",
  regulatory: "Regulatory",
  litigation: "Litigation",
  reputational: "Reputational",
  political: "Political",
};

const RISK_THEME_COLORS: Record<RiskTheme, string> = {
  financial_crime: "bg-red/10 text-red border-red/20",
  sanctions: "bg-orange/10 text-orange border-orange/20",
  corruption: "bg-amber/10 text-amber border-amber/20",
  regulatory: "bg-blue/10 text-blue border-blue/20",
  litigation: "bg-violet/10 text-violet border-violet/20",
  reputational: "bg-pink/10 text-[#ff2d92] border-pink/20",
  political: "bg-green/10 text-green border-green/20",
};

const FILTER_TABS: Array<{ key: FeedFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "financial_crime", label: "Financial Crime" },
  { key: "sanctions", label: "Sanctions" },
  { key: "corruption", label: "Corruption" },
  { key: "regulatory", label: "Regulatory" },
  { key: "litigation", label: "Litigation" },
];

const DEMO_WATCHLIST: WatchlistEntry[] = [
  {
    id: "wl-001",
    entity: "Sunrise Trading LLC",
    addedAt: "2025-04-20T10:00:00Z",
    lastArticle: "Sunrise Trading under probe for undisclosed PEP ties",
    riskLevel: "high",
    trend: "escalating",
    alertCount: 4,
  },
  {
    id: "wl-002",
    entity: "Global Metals Group",
    addedAt: "2025-04-15T14:00:00Z",
    lastArticle: "Global Metals reports record Q1 revenue amid market uncertainty",
    riskLevel: "medium",
    trend: "stable",
    alertCount: 1,
  },
  {
    id: "wl-003",
    entity: "Alpine Finance AG",
    addedAt: "2025-04-10T09:30:00Z",
    lastArticle: "Alpine Finance AG settles regulatory dispute with FINMA",
    riskLevel: "low",
    trend: "de-escalating",
    alertCount: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return dateStr;
  }
}

function sentimentColor(score: number): string {
  if (score <= -50) return "text-red font-semibold";
  if (score < 0) return "text-amber";
  if (score === 0) return "text-ink-2";
  return "text-green";
}

function sentimentBar(score: number): string {
  // normalise -100..+100 → 0..100 width
  const pct = Math.round((score + 100) / 2);
  if (score <= -50) return `bg-red`;
  if (score < 0) return `bg-amber`;
  if (score === 0) return `bg-ink-3`;
  return `bg-green`;
}

function riskLevelBadge(level: WatchlistEntry["riskLevel"]): string {
  return {
    low: "bg-green/10 text-green",
    medium: "bg-amber/10 text-amber",
    high: "bg-orange/10 text-orange",
    critical: "bg-red/10 text-red",
  }[level];
}

function trendIcon(trend: WatchlistEntry["trend"]): string {
  return { escalating: "↑", stable: "→", "de-escalating": "↓" }[trend];
}

function trendColor(trend: WatchlistEntry["trend"]): string {
  return { escalating: "text-red", stable: "text-ink-2", "de-escalating": "text-green" }[trend];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function RiskChip({ theme }: { theme: RiskTheme }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-10 font-semibold border ${RISK_THEME_COLORS[theme]}`}
    >
      {RISK_THEME_LABELS[theme]}
    </span>
  );
}

function SentimentGauge({ score }: { score: number }) {
  const pct = Math.round((score + 100) / 2);
  const barClass = sentimentBar(score);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-bg-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-12 w-12 text-right ${sentimentColor(score)}`}>
        {score > 0 ? `+${score}` : score}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Entity Analysis
// ─────────────────────────────────────────────────────────────────────────────

function ArticleRow({
  idx,
  article,
  onChange,
  onRemove,
}: {
  idx: number;
  article: Partial<ArticleInput>;
  onChange: (field: keyof ArticleInput, val: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-11 font-mono text-ink-3">Article {idx + 1}</span>
        <button type="button" onClick={onRemove} className="text-10 text-red hover:text-red/80">
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          placeholder="Source (e.g. Reuters)"
          value={article.source ?? ""}
          onChange={(e) => onChange("source", e.target.value)}
          className="bg-bg-panel border border-hair-2 rounded px-2 py-1.5 text-12 text-ink-0 outline-none focus:border-brand"
        />
        <input
          placeholder="Date (YYYY-MM-DD)"
          value={article.date ?? ""}
          onChange={(e) => onChange("date", e.target.value)}
          className="bg-bg-panel border border-hair-2 rounded px-2 py-1.5 text-12 text-ink-0 outline-none focus:border-brand"
        />
        <input
          placeholder="Language (e.g. en)"
          value={article.language ?? "en"}
          onChange={(e) => onChange("language", e.target.value)}
          className="bg-bg-panel border border-hair-2 rounded px-2 py-1.5 text-12 text-ink-0 outline-none focus:border-brand"
        />
      </div>
      <input
        placeholder="Headline"
        value={article.headline ?? ""}
        onChange={(e) => onChange("headline", e.target.value)}
        className="w-full bg-bg-panel border border-hair-2 rounded px-2 py-1.5 text-12 text-ink-0 outline-none focus:border-brand"
      />
      <textarea
        placeholder="Article content or summary..."
        rows={3}
        value={article.content ?? ""}
        onChange={(e) => onChange("content", e.target.value)}
        className="w-full bg-bg-panel border border-hair-2 rounded px-2 py-1.5 text-12 text-ink-0 outline-none focus:border-brand resize-none"
      />
    </div>
  );
}

function AnalysisTab() {
  const [subject, setSubject] = useState("");
  const [articles, setArticles] = useState<Partial<ArticleInput>[]>([
    { source: "", headline: "", date: "", content: "", language: "en" },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NewsIntelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addArticle = () => {
    setArticles((a) => [...a, { source: "", headline: "", date: "", content: "", language: "en" }]);
  };

  const updateArticle = (idx: number, field: keyof ArticleInput, val: string) => {
    setArticles((arr) => arr.map((a, i) => (i === idx ? { ...a, [field]: val } : a)));
  };

  const removeArticle = (idx: number) => {
    setArticles((arr) => arr.filter((_, i) => i !== idx));
  };

  const analyse = async () => {
    if (!subject.trim()) {
      setError("Please enter a subject entity name.");
      return;
    }
    const valid = articles.filter((a) => a.headline?.trim() && a.content?.trim());
    if (!valid.length) {
      setError("Please fill in at least one article with a headline and content.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/news-intel/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), articles: valid }),
      });
      const data = (await res.json()) as NewsIntelResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Subject Input */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6">
        <h2 className="text-14 font-semibold text-ink-0 mb-4">Subject Entity</h2>
        <div className="flex gap-3">
          <input
            placeholder="e.g. Sunrise Trading LLC, John Smith, ACME Corp..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* Articles */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-14 font-semibold text-ink-0">Articles</h2>
          <button
            type="button"
            onClick={addArticle}
            className="text-12 font-medium text-brand hover:text-brand/80 border border-brand/30 rounded px-3 py-1 hover:bg-brand/5"
          >
            + Add Article
          </button>
        </div>
        <div className="space-y-3">
          {articles.map((a, i) => (
            <ArticleRow
              key={i}
              idx={i}
              article={a}
              onChange={(f, v) => updateArticle(i, f, v)}
              onRemove={() => removeArticle(i)}
            />
          ))}
        </div>
        {error && (
          <div className="mt-3 px-3 py-2 bg-red/10 border border-red/20 rounded text-12 text-red">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => void analyse()}
          disabled={loading}
          className="mt-4 w-full py-2.5 rounded-lg bg-brand text-white text-13 font-semibold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Analysing with Claude..." : "🔍 Analyse Articles"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
                Overall Risk Score
              </div>
              <div
                className={`text-36 font-display font-semibold ${
                  result.overallRiskScore >= 70
                    ? "text-red"
                    : result.overallRiskScore >= 40
                      ? "text-amber"
                      : "text-green"
                }`}
              >
                {result.overallRiskScore}
                <span className="text-14 text-ink-3 font-mono">/100</span>
              </div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-2">
                Sentiment Score
              </div>
              <SentimentGauge score={result.sentimentScore} />
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
                Trend
              </div>
              <div
                className={`text-20 font-semibold capitalize ${
                  result.trend === "escalating"
                    ? "text-red"
                    : result.trend === "de-escalating"
                      ? "text-green"
                      : "text-ink-2"
                }`}
              >
                {result.trend === "escalating"
                  ? "↑ Escalating"
                  : result.trend === "de-escalating"
                    ? "↓ De-escalating"
                    : "→ Stable"}
              </div>
            </div>
          </div>

          {/* Risk Themes */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
            <div className="text-11 font-semibold text-ink-0 mb-3">Active Risk Themes</div>
            <div className="flex flex-wrap gap-2">
              {result.riskThemes.map((t) => (
                <RiskChip key={t} theme={t} />
              ))}
            </div>
          </div>

          {/* Confirmed Articles */}
          {result.confirmed.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="text-11 font-semibold text-ink-0 mb-3">
                Confirmed Articles ({result.confirmed.length})
              </div>
              <div className="space-y-3">
                {result.confirmed.map((a, i) => (
                  <div key={i} className="bg-bg-1 rounded-lg p-3 border border-hair">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-12 font-medium text-ink-0">{a.headline}</span>
                      <span
                        className={`shrink-0 font-mono text-11 ${sentimentColor(a.sentimentScore)}`}
                      >
                        {a.sentimentScore > 0 ? `+${a.sentimentScore}` : a.sentimentScore}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-10 text-ink-3 mb-2">
                      <span className="font-semibold text-ink-2">{a.source}</span>
                      <span>·</span>
                      <span>{a.date}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {a.riskThemes.map((t) => (
                        <RiskChip key={t} theme={t} />
                      ))}
                    </div>
                    {a.reason && <p className="text-11 text-ink-2 mt-2">{a.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dismissed Articles */}
          {result.dismissed.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="text-11 font-semibold text-ink-0 mb-3">
                Dismissed Articles ({result.dismissed.length})
                <span className="text-10 text-ink-3 font-normal ml-2">
                  Not about this subject
                </span>
              </div>
              <div className="space-y-2">
                {result.dismissed.map((a, i) => (
                  <div key={i} className="bg-bg-1 rounded p-2.5 border border-hair opacity-60">
                    <div className="text-12 text-ink-1">{a.headline}</div>
                    <div className="text-10 text-ink-3 mt-0.5">
                      {a.source} · {a.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Findings */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
            <div className="text-11 font-semibold text-ink-0 mb-3">Key Findings</div>
            <ul className="space-y-2">
              {result.keyFindings.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-brand font-mono text-12 mt-0.5 shrink-0">▸</span>
                  <span className="text-13 text-ink-1">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendation */}
          <div className="bg-amber/5 border border-amber/20 rounded-lg p-4">
            <div className="text-11 font-semibold text-amber mb-1">Recommendation</div>
            <p className="text-13 text-ink-0">{result.recommendation}</p>
          </div>

          {/* Summary */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
            <div className="text-11 font-semibold text-ink-0 mb-1">Summary</div>
            <p className="text-13 text-ink-1 leading-relaxed">{result.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Live Feed
// ─────────────────────────────────────────────────────────────────────────────

function FeedTab({
  watchlist,
  onWatch,
}: {
  watchlist: WatchlistEntry[];
  onWatch: (entity: string) => void;
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/news-intel/feed");
      const data = (await res.json()) as NewsFeedResult;
      if (data.ok) {
        setItems(data.items);
        setFetchedAt(data.fetchedAt);
      }
    } catch {
      // keep existing items
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFeed();
    intervalRef.current = setInterval(() => void fetchFeed(), FEED_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchFeed]);

  const filtered =
    filter === "all" ? items : items.filter((it) => it.riskThemes.includes(filter as typeof it.riskThemes[number]));

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTER_TABS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-11 font-medium border transition-colors ${
              filter === f.key
                ? "bg-brand text-white border-brand"
                : "bg-bg-1 text-ink-2 border-hair-2 hover:border-hair hover:text-ink-0"
            }`}
          >
            {f.label}
          </button>
        ))}
        {fetchedAt && (
          <span className="ml-auto text-10 font-mono text-ink-3">
            Updated {timeAgo(fetchedAt)}
          </span>
        )}
      </div>

      {loading && (
        <div className="py-16 text-center text-ink-3 text-13">
          <div className="mb-2 text-24">📰</div>
          Loading intelligence feed...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center text-ink-3 text-13">No items match this filter.</div>
      )}

      {/* Feed Items */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-bg-panel border border-hair-2 rounded-lg p-4 hover:border-hair transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-13 font-semibold text-ink-0 mb-1 leading-snug">
                  {item.headline}
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold bg-bg-2 text-ink-2">
                    {item.source}
                  </span>
                  <span className="text-10 text-ink-3 font-mono">{timeAgo(item.date)}</span>
                  <span className="text-10 text-ink-3">{item.region}</span>
                  {item.language !== "en" && (
                    <span className="text-10 font-mono text-ink-3 uppercase">[{item.language}]</span>
                  )}
                </div>
                <p className="text-12 text-ink-2 leading-relaxed mb-3">{item.snippet}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {item.riskThemes.map((t) => (
                    <RiskChip key={t} theme={t} />
                  ))}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      item.sentimentScore <= -50
                        ? "bg-red"
                        : item.sentimentScore < 0
                          ? "bg-amber"
                          : "bg-green"
                    }`}
                  />
                  <span className={`font-mono text-11 ${sentimentColor(item.sentimentScore)}`}>
                    {item.sentimentScore > 0 ? `+${item.sentimentScore}` : item.sentimentScore}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onWatch(item.source)}
                  className="text-10 font-medium text-brand border border-brand/30 rounded px-2 py-0.5 hover:bg-brand/5 whitespace-nowrap"
                >
                  🔔 Watch
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Watchlist
// ─────────────────────────────────────────────────────────────────────────────

function WatchlistTab({
  entries,
  onRemove,
}: {
  entries: WatchlistEntry[];
  onRemove: (id: string) => void;
}) {
  if (!entries.length) {
    return (
      <div className="py-24 text-center">
        <div className="text-32 mb-3">🔔</div>
        <div className="text-14 font-semibold text-ink-0 mb-1">No entities on watchlist</div>
        <p className="text-13 text-ink-3">
          Use the Live Feed tab to add entities for ongoing monitoring.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <div
          key={e.id}
          className="bg-bg-panel border border-hair-2 rounded-lg p-5 flex items-start gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-14 font-semibold text-ink-0">{e.entity}</span>
              <span className={`px-2 py-0.5 rounded text-10 font-semibold ${riskLevelBadge(e.riskLevel)}`}>
                {e.riskLevel.toUpperCase()}
              </span>
              <span className={`text-13 font-semibold ${trendColor(e.trend)}`}>
                {trendIcon(e.trend)} {e.trend}
              </span>
            </div>
            <div className="text-12 text-ink-2 mb-1">
              <span className="text-ink-3">Last article: </span>
              {e.lastArticle}
            </div>
            <div className="flex items-center gap-4 text-10 text-ink-3 font-mono">
              <span>Added {timeAgo(e.addedAt)}</span>
              {e.alertCount > 0 && (
                <span className="text-amber font-semibold">{e.alertCount} alerts</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(e.id)}
            className="shrink-0 text-11 text-red/70 hover:text-red border border-red/20 rounded px-2 py-1"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs (static for demo)
// ─────────────────────────────────────────────────────────────────────────────

const KPIS = [
  { value: "3", label: "Entities Monitored" },
  { value: "47", label: "Articles Analyzed" },
  { value: "2", label: "Critical Alerts", tone: "red" as const },
  { value: "18", label: "Sources Tracked" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function NewsIntelPage() {
  const [activeTab, setActiveTab] = useState<Tab>("analysis");
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(DEMO_WATCHLIST);

  const addToWatchlist = (entity: string) => {
    if (watchlist.some((e) => e.entity === entity)) return;
    setWatchlist((w) => [
      ...w,
      {
        id: `wl-${Date.now()}`,
        entity,
        addedAt: new Date().toISOString(),
        lastArticle: "Monitoring started",
        riskLevel: "medium",
        trend: "stable",
        alertCount: 0,
      },
    ]);
  };

  const removeFromWatchlist = (id: string) => {
    setWatchlist((w) => w.filter((e) => e.id !== id));
  };

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "analysis", label: "Entity Analysis" },
    { key: "feed", label: `Live Feed` },
    { key: "watchlist", label: `Watchlist (${watchlist.length})` },
  ];

  return (
    <ModuleLayout engineLabel="News intelligence engine">
      <ModuleHero
        moduleNumber={40}
        eyebrow="Hawkeye Sterling · Financial Crime Intelligence"
        title="News"
        titleEm="intelligence."
        kpis={KPIS}
        intro="AI-powered news analysis engine that performs entity disambiguation, sentiment scoring, and risk theme classification across multi-source, multilingual article feeds."
      />

      {/* Tab Navigation */}
      <div className="flex gap-0.5 mb-6 border-b border-hair-2 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-12.5 font-medium rounded-t transition-colors relative top-[1px] ${
              activeTab === tab.key
                ? "bg-bg-panel border border-hair-2 border-b-bg-panel text-ink-0"
                : "text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "analysis" && <AnalysisTab />}
      {activeTab === "feed" && (
        <FeedTab watchlist={watchlist} onWatch={addToWatchlist} />
      )}
      {activeTab === "watchlist" && (
        <WatchlistTab entries={watchlist} onRemove={removeFromWatchlist} />
      )}
    </ModuleLayout>
  );
}
