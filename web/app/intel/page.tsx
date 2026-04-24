"use client";

import { useEffect, useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { RegulatoryItem } from "@/app/api/regulatory-feed/route";

// Intel — two panels:
//   1. UAE Regulatory Live Feed — polls MoET, UAE IEC, CBUAE, Google News
//      for the latest circulars, enforcement actions, and guidance.
//   2. Adverse-media watchlist — sweeps Google News for named subjects.

// ── Adverse-media types ──────────────────────────────────────────────────────
interface Article {
  url: string;
  title: string;
  snippet?: string;
  pubDate?: string;
  source?: string;
  severity: "clear" | "low" | "medium" | "high" | "critical";
}

const STORAGE_KEY = "hawkeye.intel.watchlist";
const DEFAULTS = ["Nicolas Maduro", "Donald Trump", "Vladimir Putin"];

const SEV_TONE: Record<Article["severity"], string> = {
  clear: "bg-green-dim text-green",
  low: "bg-blue-dim text-blue",
  medium: "bg-amber-dim text-amber",
  high: "bg-orange-dim text-orange",
  critical: "bg-red text-white",
};

const TONE_BADGE: Record<RegulatoryItem["tone"], string> = {
  green:  "bg-green-dim text-green",
  amber:  "bg-amber-dim text-amber",
  red:    "bg-red-dim text-red",
};

const TONE_DOT: Record<RegulatoryItem["tone"], string> = {
  green:  "bg-green",
  amber:  "bg-amber",
  red:    "bg-red",
};

const SOURCE_BADGE: Record<string, string> = {
  MoET:          "bg-violet-dim text-violet",
  "UAE IEC":     "bg-blue-dim text-blue",
  CBUAE:         "bg-brand-dim text-brand-deep",
  UAEFIU:        "bg-red-dim text-red",
  "FIU UAE":     "bg-red-dim text-red",
  FATF:          "bg-orange-dim text-orange",
  VARA:          "bg-amber-dim text-amber",
  OECD:          "bg-teal-dim text-teal",
  LBMA:          "bg-teal-dim text-teal",
  RMI:           "bg-orange-dim text-orange",
  "EOCN UAE":    "bg-red-dim text-red",
  "UAE Cabinet": "bg-red-dim text-red",
  "UAE PDPL":    "bg-violet-dim text-violet",
  "UAE Digital": "bg-blue-dim text-blue",
  "MoET / DPMS": "bg-violet-dim text-violet",
};

function sourceBadgeClass(source: string): string {
  return SOURCE_BADGE[source] ?? "bg-bg-2 text-ink-2";
}

// ── Regulatory Feed Panel ────────────────────────────────────────────────────

function RegulatoryFeedPanel() {
  const [items, setItems] = useState<RegulatoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterTone, setFilterTone] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/regulatory-feed");
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; items: RegulatoryItem[]; sources: string[]; fetchedAt: string };
      if (!data.ok) return;
      setItems(data.items ?? []);
      setSources(data.sources ?? []);
      setFetchedAt(data.fetchedAt ?? "");
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30 minutes
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const categories = ["all", ...Array.from(new Set(items.map((i) => i.category))).sort()];
  const tones = ["all", "red", "amber", "green"];

  const filtered = items.filter((item) => {
    if (filterCat !== "all" && item.category !== filterCat) return false;
    if (filterTone !== "all" && item.tone !== filterTone) return false;
    return true;
  });

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hair-2 bg-bg-1">
        <div className="flex items-center gap-2">
          <span className="text-12 font-semibold text-ink-0">UAE Regulatory Live Feed</span>
          <span className="inline-flex items-center gap-1 text-10 font-mono text-green font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" style={{ animation: "live-pulse 2s ease-in-out infinite" }} />
            live
          </span>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-9 font-mono text-ink-3">
              synced {new Date(fetchedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" })}
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
          <span className="text-9 font-mono text-ink-3 uppercase tracking-wide-3 self-center mr-1">Live sources:</span>
          {sources.map((s) => (
            <span key={s} className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold ${sourceBadgeClass(s)}`}>{s}</span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-hair bg-bg-1">
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="text-10 font-mono bg-bg-panel border border-hair-2 rounded px-2 py-0.5 text-ink-1"
        >
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </select>
        <select
          value={filterTone}
          onChange={(e) => setFilterTone(e.target.value)}
          className="text-10 font-mono bg-bg-panel border border-hair-2 rounded px-2 py-0.5 text-ink-1"
        >
          {tones.map((t) => <option key={t} value={t}>{t === "all" ? "All priorities" : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <span className="ml-auto text-9 font-mono text-ink-3">{filtered.length} items</span>
      </div>

      {/* Items */}
      {loading && items.length === 0 ? (
        <div className="px-4 py-8 text-center text-11 font-mono text-ink-3">
          Polling MoET · UAE IEC · CBUAE · UAEFIU · FATF…
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-6 text-center text-11 font-mono text-ink-3">No items match the current filter.</div>
      ) : (
        <div className="divide-y divide-hair max-h-[520px] overflow-y-auto">
          {filtered.map((item) => (
            <a
              key={item.id}
              href={item.url || "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start gap-3 px-4 py-3 no-underline hover:bg-bg-1 transition-colors group"
            >
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[item.tone]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-0.5">
                  <span className="text-12 font-medium text-ink-0 group-hover:text-brand leading-snug">{item.title}</span>
                </div>
                {item.snippet && (
                  <div className="text-10.5 text-ink-3 leading-snug mb-1">{item.snippet}</div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold ${sourceBadgeClass(item.source)}`}>{item.source}</span>
                  <span className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold uppercase ${TONE_BADGE[item.tone]}`}>{item.category}</span>
                  {item.pubDate && (
                    <span className="text-9 font-mono text-ink-3">{item.pubDate.slice(0, 10)}</span>
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

// ── Adverse-media Watchlist Panel ────────────────────────────────────────────

function AdverseMediaPanel() {
  const [watch, setWatch] = useState<string[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setWatch(raw ? JSON.parse(raw) : DEFAULTS);
    } catch {
      setWatch(DEFAULTS);
    }
  }, []);

  const save = (list: string[]) => {
    setWatch(list);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* */ }
  };

  const add = () => {
    if (!draft.trim()) return;
    save([...watch, draft.trim()]);
    setDraft("");
  };

  const remove = (name: string) => save(watch.filter((n) => n !== name));

  const sweep = async () => {
    setLoading(true);
    try {
      const all: Article[] = [];
      for (const name of watch) {
        const res = await fetch(`/api/news-search?q=${encodeURIComponent(name)}`, { headers: { accept: "application/json" } });
        if (!res.ok) continue;
        const body = (await res.json()) as { articles?: Article[] };
        for (const a of body.articles ?? []) all.push(a);
      }
      all.sort((a, b) => {
        const order = ["clear", "low", "medium", "high", "critical"];
        return order.indexOf(b.severity) - order.indexOf(a.severity);
      });
      setArticles(all.slice(0, 60));
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-hair-2 bg-bg-1">
        <span className="text-12 font-semibold text-ink-0">Adverse-media watchlist</span>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">Subjects</span>
          <button
            type="button"
            onClick={() => void sweep()}
            disabled={loading || watch.length === 0}
            className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40"
          >
            {loading ? "Sweeping…" : "Run sweep"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {watch.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-11 bg-brand-dim text-brand-deep">
              {n}
              <button type="button" onClick={() => remove(n)} className="text-ink-3 hover:text-red" aria-label={`Remove ${n}`}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="+ Add subject to watch"
            className="flex-1 text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
          />
          <button type="button" onClick={add} className="text-11 font-medium px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 hover:bg-bg-1">Add</button>
        </div>
      </div>

      {articles.length > 0 && (
        <div className="border-t border-hair-2 divide-y divide-hair max-h-[400px] overflow-y-auto">
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 px-4 py-3 no-underline hover:bg-bg-1 transition-colors"
            >
              <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-9 font-semibold uppercase shrink-0 mt-0.5 ${SEV_TONE[a.severity]}`}>
                {a.severity}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-12 font-medium text-ink-0 mb-0.5 leading-snug">{a.title}</div>
                {a.snippet && <div className="text-10.5 text-ink-2 leading-snug mb-1">{a.snippet}</div>}
                <div className="flex gap-3 font-mono text-9 text-ink-3">
                  {a.source && <span>{a.source}</span>}
                  {a.pubDate && <span>{a.pubDate}</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {articles.length === 0 && (
        <div className="px-4 pb-4 text-11 text-ink-3 text-center">
          Run a sweep to pull adverse-media articles matching your watchlist.
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntelPage() {
  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="Module 10 · Intelligence & Regulatory Feed"
        title="Intel"
        titleEm="feed."
        intro={
          <>
            <strong>Two live panels.</strong> The UAE Regulatory Feed polls
            MoET, UAE IEC, CBUAE, FIU UAE, FATF, LBMA, OECD, RMI and EOCN UAE
            via Google News every 30 minutes for circulars, enforcement actions
            and guidance updates. The adverse-media panel sweeps any named
            subject across 7 language feeds and surfaces HIGH / CRITICAL items first.
          </>
        }
        kpis={[
          { value: "4", label: "live government sources" },
          { value: "15", label: "Google News queries" },
          { value: "7", label: "adverse-media languages" },
          { value: "30m", label: "regulatory refresh cadence" },
        ]}
      />

      <div className="mt-6 space-y-6">
        <RegulatoryFeedPanel />
        <AdverseMediaPanel />
      </div>
    </ModuleLayout>
  );
}
