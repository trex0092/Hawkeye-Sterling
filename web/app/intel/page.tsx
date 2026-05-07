"use client";

import { useEffect, useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
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
  MoET:       "bg-violet-dim text-violet",
  "UAE IEC":  "bg-blue-dim text-blue",
  CBUAE:      "bg-brand-dim text-brand-deep",
  UAEFIU:     "bg-red-dim text-red",
  FATF:       "bg-orange-dim text-orange",
  VARA:       "bg-amber-dim text-amber",
  OECD:       "bg-bg-2 text-ink-2",
  LBMA:       "bg-bg-2 text-ink-2",
  RMI:        "bg-green-dim text-green",
  "EOCN UAE": "bg-red-dim text-red",
  "UAE Cabinet": "bg-red-dim text-red",
  "UAE PDPL": "bg-violet-dim text-violet",
  "UAE Digital": "bg-blue-dim text-blue",
  "MoET / DPMS": "bg-violet-dim text-violet",
  "Mining":      "bg-amber-dim text-amber",
};

function sourceBadgeClass(source: string): string {
  return SOURCE_BADGE[source] ?? "bg-bg-2 text-ink-2";
}

// ── Regulatory Feed Panel ────────────────────────────────────────────────────

interface TriageEntry {
  relevance: number;
  impact: "high" | "medium" | "low";
  actionRequired: string;
  deadline?: string;
}

async function fetchTriage(items: RegulatoryItem[]): Promise<Record<string, TriageEntry>> {
  const compact = items.slice(0, 20).map((i) => ({
    id: i.id,
    title: i.title,
    summary: i.snippet ?? "",
    tone: i.tone,
    source: i.source,
  }));

  const res = await fetch("/api/regulatory-triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: compact }),
  });

  if (!res.ok) throw new Error(`Triage API error: ${res.status}`);
  const data = await res.json() as {
    ok: boolean;
    results: Array<{ id: string; relevance: number; impact: "high" | "medium" | "low"; actionRequired: string; deadline: string }>;
    error?: string;
  };
  if (!data.ok) throw new Error(data.error ?? "Unknown error");

  const map: Record<string, TriageEntry> = {};
  for (const r of data.results ?? []) {
    map[r.id] = { relevance: r.relevance, impact: r.impact, actionRequired: r.actionRequired, deadline: r.deadline || undefined };
  }
  return map;
}

function RegulatoryFeedPanel() {
  const [items, setItems] = useState<RegulatoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterTone, setFilterTone] = useState<string>("all");
  const [triageMap, setTriageMap] = useState<Record<string, TriageEntry>>({});
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);

  const runTriage = async (feedItems: RegulatoryItem[]) => {
    if (feedItems.length === 0) return;
    setTriageLoading(true);
    setTriageError(null);
    try {
      const map = await fetchTriage(feedItems);
      setTriageMap(map);
    } catch (err) {
      console.error("Triage failed:", err);
      setTriageError("AI triage unavailable — API key not configured.");
    } finally {
      setTriageLoading(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/regulatory-feed");
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; items: RegulatoryItem[]; sources: string[]; fetchedAt: string };
      if (!data.ok) return;
      const loadedItems = data.items ?? [];
      setItems(loadedItems);
      setSources(data.sources ?? []);
      setFetchedAt(data.fetchedAt ?? "");
      void runTriage(loadedItems);
    } catch (err) {
      console.error("[hawkeye] intel/news-search threw — feed empty until next refresh:", err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 5 * 60_000);
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
          <div className="flex flex-col items-end gap-0.5">
            <button
              type="button"
              onClick={() => void runTriage(items)}
              disabled={triageLoading || items.length === 0}
              className="text-10 font-mono px-2 py-0.5 rounded border border-brand/50 bg-brand-dim text-brand-deep hover:bg-brand-dim/70 disabled:opacity-40"
            >
              {triageLoading ? "Triaging…" : "✦AI"}
            </button>
            {triageError && (
              <span className="text-9 font-mono text-red-400">{triageError}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-11 font-mono px-2 py-0.5 rounded border border-green/40 bg-green-dim text-green hover:bg-green-dim/70 disabled:opacity-40"
          >
            {loading ? "↻" : "↻"}
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
                {/* Triage chips */}
                {triageMap[item.id] && (() => {
                  const t = triageMap[item.id] as TriageEntry;
                  const relevanceCls = t.relevance >= 70 ? "bg-green-dim text-green" : t.relevance >= 40 ? "bg-amber-dim text-amber" : "bg-red-dim text-red";
                  const impactCls = t.impact === "high" ? "bg-red-dim text-red" : t.impact === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className={`font-mono text-9 px-1.5 py-px rounded-sm font-semibold ${relevanceCls}`}>rel: {t.relevance}</span>
                      <span className={`font-mono text-9 px-1.5 py-px rounded-sm font-semibold uppercase ${impactCls}`}>{t.impact}</span>
                      <span className="text-10 text-ink-3 italic leading-snug">{t.actionRequired}</span>
                      {t.deadline && (
                        <span className="font-mono text-9 px-1.5 py-px rounded-sm bg-bg-2 text-ink-2">{t.deadline}</span>
                      )}
                    </div>
                  );
                })()}
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
              <RowActions label={n} onDelete={() => remove(n)} confirmDelete={false} />
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
          {articles.map((a) => (
            <a
              key={a.url}
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

// ── Jurisdiction Intelligence Panel ─────────────────────────────────────────

interface SanctionsExposure { uae: string; un: string; ofac: string; eu: string; uk: string; }
interface JurisdictionIntel {
  ok: boolean;
  countryName: string;
  overallRisk: "critical" | "high" | "medium" | "low";
  fatfStatus: string;
  fatfDetail: string;
  sanctionsExposure: SanctionsExposure;
  cahraStatus: string;
  keyRisks: string[];
  dpmsSpecificRisks: string[];
  typologiesPrevalent: string[];
  cddImplications: string;
  transactionRisks: string;
  recentDevelopments: string;
  uaeRegulatoryRequirement: string;
  riskMitigation: string[];
}

const JRISK_TONE: Record<string, string> = {
  critical: "bg-red text-white",
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  low: "bg-green-dim text-green",
};

function JurisdictionIntelPanel() {
  const [country, setCountry] = useState("");
  const [context, setContext] = useState("");
  const [intel, setIntel] = useState<JurisdictionIntel | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!country.trim()) return;
    setLoading(true);
    setIntel(null);
    try {
      const res = await fetch("/api/jurisdiction-intel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ country: country.trim(), context: context.trim() }),
      });
      if (res.ok) {
        const data = await res.json() as JurisdictionIntel;
        if (data.ok) setIntel(data);
      } else {
        console.error(`[hawkeye] jurisdiction-intel HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("[hawkeye] jurisdiction-intel threw:", err);
    } finally { setLoading(false); }
  };

  const inputCls = "text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand";

  return (
    <div className="border border-hair-2 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-bg-panel border-b border-hair">
        <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Jurisdiction Intelligence</span>
        <span className="text-10 text-ink-3 font-mono">Beats World-Check 3-tier ratings</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Country</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="e.g. Iran, Sudan, DRC, Russia…" className={`${inputCls} w-full`} />
          </div>
          <div className="flex-1">
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Context (optional)</label>
            <input value={context} onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. gold supplier, client nationality, wire destination"
              className={`${inputCls} w-full`} />
          </div>
          <button type="button" onClick={() => void run()} disabled={loading || !country.trim()}
            className="text-11 font-semibold px-4 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40 whitespace-nowrap">
            {loading ? "Analyzing…" : "Analyze Jurisdiction"}
          </button>
        </div>

        {intel && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-15 font-bold text-ink-0">{intel.countryName}</span>
              <span className={`font-mono text-10 font-bold px-2 py-px rounded uppercase ${JRISK_TONE[intel.overallRisk] ?? ""}`}>
                {intel.overallRisk} risk
              </span>
              <span className={`font-mono text-10 px-2 py-px rounded ${
                intel.fatfStatus.toLowerCase().includes("grey") ? "bg-amber-dim text-amber" :
                intel.fatfStatus.toLowerCase().includes("black") ? "bg-red text-white" : "bg-green-dim text-green"
              }`}>{intel.fatfStatus}</span>
            </div>

            {intel.fatfDetail && <p className="text-12 text-ink-1">{intel.fatfDetail}</p>}

            {intel.cahraStatus && (
              <div className="flex items-center gap-2">
                <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">CAHRA:</span>
                <span className={`text-11 font-mono ${intel.cahraStatus.toLowerCase().includes("conflict") || intel.cahraStatus.toLowerCase().includes("high") ? "text-red" : "text-ink-1"}`}>{intel.cahraStatus}</span>
              </div>
            )}

            <div>
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-2">Sanctions Exposure</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {(["uae", "un", "ofac", "eu", "uk"] as const).map((regime) => (
                  <div key={regime} className="bg-bg-1 rounded p-2">
                    <div className="text-9 font-mono font-bold uppercase text-ink-3 mb-1">{regime.toUpperCase()}</div>
                    <div className="text-10 text-ink-1">{intel.sanctionsExposure[regime] || "—"}</div>
                  </div>
                ))}
              </div>
            </div>

            {intel.keyRisks.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-1">Key Risks</div>
                <div className="flex flex-wrap gap-1">
                  {intel.keyRisks.map((r, i) => <span key={i} className="text-10 px-2 py-px rounded bg-red-dim text-red">{r}</span>)}
                </div>
              </div>
            )}

            {intel.dpmsSpecificRisks.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-1">DPMS-Specific Risks</div>
                <div className="flex flex-wrap gap-1">
                  {intel.dpmsSpecificRisks.map((r, i) => <span key={i} className="text-10 px-2 py-px rounded bg-amber-dim text-amber">{r}</span>)}
                </div>
              </div>
            )}

            {intel.typologiesPrevalent.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-1">Prevalent Typologies</div>
                <div className="flex flex-wrap gap-1">
                  {intel.typologiesPrevalent.map((t, i) => <span key={i} className="text-10 px-2 py-px rounded bg-bg-2 text-ink-1">{t}</span>)}
                </div>
              </div>
            )}

            {intel.cddImplications && (
              <div className="border border-brand/30 rounded-lg p-3 bg-bg-panel">
                <div className="text-10 uppercase tracking-wide-3 text-brand-deep font-semibold mb-1">CDD Implications</div>
                <p className="text-12 text-ink-0">{intel.cddImplications}</p>
              </div>
            )}

            {intel.uaeRegulatoryRequirement && (
              <div className="border-l-2 border-red/50 pl-3">
                <div className="text-10 uppercase tracking-wide-3 text-red font-semibold mb-1">UAE Regulatory Requirement</div>
                <p className="text-12 font-semibold text-ink-0">{intel.uaeRegulatoryRequirement}</p>
              </div>
            )}

            {intel.transactionRisks && <p className="text-11 text-ink-2 italic">{intel.transactionRisks}</p>}

            {intel.recentDevelopments && (
              <p className="text-11 text-ink-1 border-t border-hair pt-2"><strong>Recent developments:</strong> {intel.recentDevelopments}</p>
            )}

            {intel.riskMitigation.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide-3 text-green font-semibold mb-1">Risk Mitigation</div>
                <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                  {intel.riskMitigation.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntelPage() {
  return (
    <ModuleLayout asanaModule="intel" asanaLabel="OSINT Intelligence">
      <ModuleHero
        moduleNumber={8}
        eyebrow="Module 10 · Intelligence & Regulatory Feed"
        title="Intel"
        titleEm="feed."
        intro={
          <>
            <strong>Three live panels.</strong> The UAE Regulatory Feed polls
            MoET, UAE IEC, CBUAE, UAEFIU, FATF and Google News every 30 minutes
            for circulars, enforcement actions and guidance updates.
            The adverse-media panel sweeps any named subject across 7 language
            feeds and surfaces HIGH / CRITICAL items first.
            Jurisdiction Intelligence delivers deep FATF/sanctions/CAHRA briefs
            that go far beyond World-Check 3-tier country ratings.
          </>
        }
        kpis={[
          { value: "4", label: "live government sources" },
          { value: "30", label: "live news queries" },
          { value: "7", label: "adverse-media languages" },
          { value: "5m", label: "live refresh cadence" },
        ]}
      />

      <div className="mt-6 space-y-6">
        <RegulatoryFeedPanel />
        <AdverseMediaPanel />
        <JurisdictionIntelPanel />
      </div>
    </ModuleLayout>
  );
}
