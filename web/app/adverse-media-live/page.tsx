"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { AdverseMediaLiveResult } from "@/app/api/adverse-media-live/route";
import type { RegulatoryItem } from "@/app/api/regulatory-feed/route";

// Live Adverse Media Monitor — FDL 10/2025 Art.10 (ongoing CDD monitoring)
// and Art.19 (10-year lookback). Uses GDELT Project API (free, no key).

// ─────────────────────────────────────────────────────────────────────────────
// Styling helpers
// ─────────────────────────────────────────────────────────────────────────────

const RATING_STYLES: Record<
  AdverseMediaLiveResult["riskRating"],
  { badge: string; label: string }
> = {
  critical: { badge: "bg-red text-white border-red", label: "CRITICAL" },
  high: { badge: "bg-red-dim text-red border-red/40", label: "HIGH" },
  medium: { badge: "bg-amber-dim text-amber border-amber/40", label: "MEDIUM" },
  low: { badge: "bg-blue-dim text-blue border-blue/40", label: "LOW" },
  clear: { badge: "bg-green-dim text-green border-green/40", label: "CLEAR" },
};

const TONE_COLOR = (tone: number): string => {
  if (tone < -5) return "text-red";
  if (tone < -2) return "text-amber";
  if (tone > 2) return "text-green";
  return "text-ink-2";
};

const TONE_BAR_WIDTH = (tone: number): string => {
  // tone roughly -10 to +10 → width 0-100%
  const pct = Math.min(100, Math.max(0, Math.round(((Math.abs(tone)) / 10) * 100)));
  return `${pct}%`;
};

const TONE_BAR_COLOR = (tone: number): string => {
  if (tone < -5) return "bg-red";
  if (tone < -2) return "bg-amber";
  return "bg-green";
};

const CAT_BADGE =
  "inline-flex items-center px-1.5 py-px rounded-sm font-mono text-9 font-semibold uppercase tracking-wide-2 bg-bg-2 text-ink-2 border border-hair-2";

const SOURCE_BADGE: Record<string, string> = {
  "fatf-gafi.org": "bg-orange-dim text-orange",
  "centralbank.ae": "bg-brand-dim text-brand-deep",
  "moet.gov.ae": "bg-violet-dim text-violet",
  "uaefiu.gov.ae": "bg-red-dim text-red",
  GDELT: "bg-bg-2 text-ink-2",
};

function sourceBadge(s: string): string {
  return SOURCE_BADGE[s] ?? "bg-bg-2 text-ink-2";
}

const inputCls =
  "w-full bg-transparent border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand";

const selectCls =
  "bg-transparent border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory Feed Panel
// ─────────────────────────────────────────────────────────────────────────────

const TONE_DOT: Record<RegulatoryItem["tone"], string> = {
  green: "bg-green",
  amber: "bg-amber",
  red: "bg-red",
};

const TONE_BADGE_CLS: Record<RegulatoryItem["tone"], string> = {
  green: "bg-green-dim text-green",
  amber: "bg-amber-dim text-amber",
  red: "bg-red-dim text-red",
};

function RegulatoryFeedPanel() {
  const [items, setItems] = useState<RegulatoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [sources, setSources] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/regulatory-feed");
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        items: RegulatoryItem[];
        sources: string[];
        fetchedAt: string;
      };
      if (!data.ok) return;
      setItems(data.items ?? []);
      setSources(data.sources ?? []);
      setFetchedAt(data.fetchedAt ?? "");
    } catch {
      /* silently ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => {
      void load();
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mt-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hair-2 bg-bg-1">
        <div className="flex items-center gap-2">
          <span className="text-12 font-semibold text-ink-0">
            UAE Regulatory Live Feed
          </span>
          <span className="inline-flex items-center gap-1 text-10 font-mono text-green font-semibold">
            <span
              className="w-1.5 h-1.5 rounded-full bg-green shrink-0"
              style={{ animation: "live-pulse 2s ease-in-out infinite" }}
            />
            live · refreshes every 5 min
          </span>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-9 font-mono text-ink-3">
              synced{" "}
              {new Date(fetchedAt).toLocaleTimeString("en-GB", {
                timeZone: "Asia/Dubai",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-10 font-mono px-2 py-0.5 rounded border border-hair-2 bg-bg-panel text-ink-1 hover:bg-bg-1 disabled:opacity-40"
          >
            {loading ? "Fetching…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Source pills */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-hair bg-bg-panel">
          <span className="text-9 font-mono text-ink-3 uppercase tracking-wide-3 self-center mr-1">
            Live sources:
          </span>
          {sources.map((s) => (
            <span
              key={s}
              className="text-9 font-mono px-1.5 py-px rounded-sm font-semibold bg-bg-2 text-ink-2"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Items */}
      {loading && items.length === 0 ? (
        <div className="px-4 py-8 text-center text-11 font-mono text-ink-3">
          Polling MoET · CBUAE · FATF · GDELT…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-11 font-mono text-ink-3">
          No live items — showing static regulatory baseline.
        </div>
      ) : (
        <div className="divide-y divide-hair max-h-[420px] overflow-y-auto">
          {items.slice(0, 25).map((item) => (
            <a
              key={item.id}
              href={item.url || "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start gap-3 px-4 py-3 no-underline hover:bg-bg-1 transition-colors group"
            >
              <span
                className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[item.tone]}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-0.5">
                  <span className="text-12 font-medium text-ink-0 group-hover:text-brand leading-snug">
                    {item.title}
                  </span>
                </div>
                {item.snippet && (
                  <div className="text-10.5 text-ink-3 leading-snug mb-1">
                    {item.snippet}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold ${sourceBadge(item.source)}`}
                  >
                    {item.source}
                  </span>
                  <span
                    className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold uppercase ${TONE_BADGE_CLS[item.tone]}`}
                  >
                    {item.category}
                  </span>
                  {item.pubDate && (
                    <span className="text-9 font-mono text-ink-3">
                      {item.pubDate.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  "",
  "Individual",
  "Corporate",
  "Financial Institution",
  "VASP",
  "DPMS Dealer",
  "PEP",
  "NGO/NPO",
  "Trust / Foundation",
  "Partnership",
  "Government Entity",
];

const JURISDICTIONS = [
  "",
  "UAE",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Jordan",
  "Egypt",
  "Turkey",
  "Iran",
  "Russia",
  "China",
  "United Kingdom",
  "United States",
  "Switzerland",
  "Panama",
  "British Virgin Islands",
  "Cayman Islands",
  "Other",
];

export default function AdverseMediaLivePage() {
  const [subjectName, setSubjectName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdverseMediaLiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSearched, setLastSearched] = useState<{
    subjectName: string;
    entityType: string;
    jurisdiction: string;
  } | null>(null);
  const [liveRefreshCount, setLiveRefreshCount] = useState(0);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSearch = useCallback(
    async (params: {
      subjectName: string;
      entityType: string;
      jurisdiction: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/adverse-media-live", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subjectName: params.subjectName,
            entityType: params.entityType || undefined,
            jurisdiction: params.jurisdiction || undefined,
          }),
        });
        const data = (await res.json()) as AdverseMediaLiveResult;
        setResult(data);
        setLastSearched(params);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    await doSearch({ subjectName: subjectName.trim(), entityType, jurisdiction });
    setLiveRefreshCount(0);
  };

  // Auto-refresh every 60 seconds when a search is active
  useEffect(() => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    if (!lastSearched) return;
    liveIntervalRef.current = setInterval(async () => {
      await doSearch(lastSearched);
      setLiveRefreshCount((n) => n + 1);
    }, 60_000);
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [lastSearched, doSearch]);

  const ratingStyle = result
    ? RATING_STYLES[result.riskRating]
    : null;

  // KPIs derived live from result
  const kpis = result
    ? [
        { value: String(result.totalHits), label: "total hits" },
        {
          value: String(result.riskScore),
          label: "risk score /100",
          tone:
            result.riskScore >= 60
              ? ("red" as const)
              : result.riskScore >= 35
                ? ("amber" as const)
                : undefined,
        },
        { value: String(result.articles.length), label: "articles retrieved" },
      ]
    : [
        { value: "—", label: "total hits" },
        { value: "—", label: "risk score /100" },
        { value: "—", label: "articles retrieved" },
      ];

  return (
    <ModuleLayout asanaModule="adverse-media-live" asanaLabel="Live Adverse Media Feed">
      <ModuleHero
        eyebrow="Module · Live Intelligence"
        title="Adverse media"
        titleEm="live monitor."
        intro={
          <>
            <strong>FATF R.10</strong> (ongoing CDD monitoring) ·{" "}
            <strong>FDL 10/2025 Art.10</strong> (continuous monitoring
            obligation) · <strong>Art.19</strong> (10-year lookback). Search
            for adverse media on any subject using GDELT Project's real-time
            global news index. Results are scored by hit volume, negative tone,
            and recency. Auto-refreshes every 60 seconds when a search is
            active.
          </>
        }
        kpis={kpis}
      />

      {/* Search form */}
      <form
        onSubmit={(e) => void handleSearch(e)}
        className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-6"
      >
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          Subject search
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="md:col-span-1">
            <label className="block font-mono text-10 uppercase tracking-wide-3 text-ink-2 mb-1">
              Subject name <span className="text-red">*</span>
            </label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder='e.g. "Acme Trading LLC" or "John Smith"'
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="block font-mono text-10 uppercase tracking-wide-3 text-ink-2 mb-1">
              Entity type
            </label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className={`${selectCls} w-full`}
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t || "— Any —"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-10 uppercase tracking-wide-3 text-ink-2 mb-1">
              Jurisdiction
            </label>
            <select
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              className={`${selectCls} w-full`}
            >
              {JURISDICTIONS.map((j) => (
                <option key={j} value={j}>
                  {j || "— Any —"}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !subjectName.trim()}
            className="font-mono text-10.5 uppercase tracking-wide-3 font-medium px-5 py-2 rounded border bg-brand text-white border-brand hover:bg-brand-hover hover:border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? "Searching…" : "Search"}
          </button>
          {lastSearched && !loading && (
            <span className="inline-flex items-center gap-1.5 text-10 font-mono text-green font-semibold">
              <span
                className="w-1.5 h-1.5 rounded-full bg-green shrink-0"
                style={{ animation: "live-pulse 2s ease-in-out infinite" }}
              />
              Live · auto-refreshes every 60s
              {liveRefreshCount > 0 && (
                <span className="text-ink-3">
                  ({liveRefreshCount} refresh{liveRefreshCount !== 1 ? "es" : ""})
                </span>
              )}
            </span>
          )}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-dim border border-red/30 rounded-lg px-4 py-3 mb-4 text-12 text-red">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Risk rating + summary */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-start gap-5 flex-wrap">
              {/* Large risk badge */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span
                  className={`px-5 py-3 rounded-lg border-2 font-mono text-14 font-bold uppercase tracking-wide-3 ${ratingStyle?.badge ?? ""}`}
                >
                  {ratingStyle?.label ?? "—"}
                </span>
                <span className="font-mono text-10 text-ink-3 uppercase tracking-wide-2">
                  risk rating
                </span>
              </div>

              {/* Stats */}
              <div className="flex gap-6 items-start flex-wrap">
                <div>
                  <div className="font-mono text-20 font-semibold text-ink-0">
                    {result.totalHits}
                  </div>
                  <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-medium">
                    total hits
                  </div>
                </div>
                <div>
                  <div
                    className={`font-mono text-20 font-semibold ${
                      result.riskScore >= 60
                        ? "text-red"
                        : result.riskScore >= 35
                          ? "text-amber"
                          : "text-green"
                    }`}
                  >
                    {result.riskScore}
                    <span className="text-12 text-ink-3 font-normal">/100</span>
                  </div>
                  <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-medium">
                    risk score
                  </div>
                </div>
                <div>
                  <div className="font-mono text-20 font-semibold text-ink-0">
                    {result.articles.length}
                  </div>
                  <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-medium">
                    articles
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="flex-1 min-w-[280px]">
                <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 mb-1.5 font-semibold">
                  AI summary
                </div>
                <p className="text-13 text-ink-1 leading-relaxed m-0">
                  {result.summary}
                </p>
                <p className="text-10 text-ink-3 font-mono mt-2 m-0">
                  {result.regulatoryBasis}
                </p>
              </div>
            </div>
          </div>

          {/* Articles table */}
          {result.articles.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center justify-between">
                <span className="text-12 font-semibold text-ink-0">
                  Articles
                </span>
                <span className="text-10 font-mono text-ink-3">
                  sorted by negative tone
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-11">
                  <thead className="bg-bg-1 border-b border-hair-2">
                    <tr>
                      {[
                        "Title",
                        "Source",
                        "Date",
                        "Tone",
                        "Relevance",
                        "Categories",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {result.articles.map((article, i) => (
                      <tr
                        key={`${article.url}-${i}`}
                        className="hover:bg-bg-1 transition-colors"
                      >
                        {/* Title */}
                        <td className="px-3 py-2.5 max-w-[300px]">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-ink-0 hover:text-brand font-medium leading-snug line-clamp-2"
                          >
                            {article.title}
                          </a>
                        </td>
                        {/* Source */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold ${sourceBadge(article.source)}`}
                          >
                            {article.source}
                          </span>
                        </td>
                        {/* Date */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-mono text-10 text-ink-2">
                            {article.publishedAt
                              ? article.publishedAt.slice(0, 10)
                              : "—"}
                          </span>
                        </td>
                        {/* Tone bar */}
                        <td className="px-3 py-2.5 min-w-[90px]">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-bg-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${TONE_BAR_COLOR(article.tone)}`}
                                style={{
                                  width: TONE_BAR_WIDTH(article.tone),
                                }}
                              />
                            </div>
                            <span
                              className={`font-mono text-10 ${TONE_COLOR(article.tone)}`}
                            >
                              {article.tone.toFixed(1)}
                            </span>
                          </div>
                        </td>
                        {/* Relevance */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-mono text-10 text-ink-1">
                            {article.relevanceScore}%
                          </span>
                        </td>
                        {/* Categories */}
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {article.categories.map((cat) => (
                              <span key={cat} className={CAT_BADGE}>
                                {cat.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.articles.length === 0 && (
            <div className="bg-green-dim border border-green/20 rounded-lg px-5 py-6 text-center">
              <div className="text-green font-mono text-11 uppercase tracking-wide-3 font-semibold mb-1">
                No adverse media found
              </div>
              <p className="text-12 text-ink-2 m-0">
                No articles retrieved from GDELT for &ldquo;{result.subject}
                &rdquo; in the last 7 days. Document this negative finding in
                the 10-year lookback log (Art.19).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Regulatory Feed Panel */}
      <RegulatoryFeedPanel />
    </ModuleLayout>
  );
}
