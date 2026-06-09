"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { RegulatoryItem } from "@/app/api/regulatory-feed/route";

// Intel — UAE Regulatory Live Feed: polls MoET, UAE IEC, CBUAE, UAEFIU, FATF
// and Google News for the latest circulars, enforcement actions, and guidance,
// then AI-triages each item by relevance, impact, and required action.

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
  "UAE PDPL":    "bg-violet-dim text-violet",
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
    credentials: "same-origin",
  });

  if (!res.ok) {
    // Surface the actual upstream reason so the caller's UI message reflects
    // what really failed (401/403 = session aged out; 5xx = upstream).
    const body = await res.json().catch(() => ({} as { error?: string }));
    const reason = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    const err = new Error(reason);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const data = await res.json().catch(() => ({})) as {
    ok: boolean;
    results?: Array<{ id: string; relevance: number; impact: "high" | "medium" | "low"; actionRequired: string; deadline: string }>;
    status?: string;
    reason?: string;
    error?: string;
  };
  if (!data.ok) throw new Error(data.error ?? "Unknown error");

  if (data.status === "degraded") {
    const degradedErr = new Error(data.reason ?? "AI triage degraded");
    (degradedErr as Error & { degraded?: boolean }).degraded = true;
    throw degradedErr;
  }

  const map: Record<string, TriageEntry> = {};
  for (const r of data.results ?? []) {
    map[r.id] = { relevance: r.relevance, impact: r.impact, actionRequired: r.actionRequired, deadline: r.deadline || undefined };
  }
  return map;
}

function RegulatoryFeedPanel() {
  const [items, setItems] = useState<RegulatoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterTone, setFilterTone] = useState<string>("all");
  const [triageMap, setTriageMap] = useState<Record<string, TriageEntry>>({});
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const runTriage = async (feedItems: RegulatoryItem[]) => {
    if (feedItems.length === 0) return;
    setTriageLoading(true);
    setTriageError(null);
    try {
      const map = await fetchTriage(feedItems);
      if (!mountedRef.current) return;
      setTriageMap(map);
    } catch (err) {
      console.error("Triage failed:", err);
      if (!mountedRef.current) return;
      const status = (err as { status?: number }).status;
      const isDegraded = (err as { degraded?: boolean }).degraded;
      const msg = err instanceof Error ? err.message : String(err);
      if (isDegraded) {
        setTriageError(`AI triage running in degraded mode — ${msg}`);
      } else if (status === 401 || status === 403) {
        setTriageError("AI triage paused — please sign in again to refresh your session.");
      } else if (status && status >= 500) {
        setTriageError(`AI triage upstream error (HTTP ${status}) — retrying on next feed refresh.`);
      } else {
        setTriageError(`AI triage unavailable — ${msg}`);
      }
    } finally {
      if (mountedRef.current) setTriageLoading(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setFeedError(null);
    try {
      const res = await fetch("/api/regulatory-feed");
      if (!res.ok) {
        console.error(`[hawkeye] intel regulatory-feed HTTP ${res.status}`);
        if (!mountedRef.current) return;
        setFeedError(`Feed unavailable (HTTP ${res.status}) — retrying automatically`);
        return;
      }
      const data = await res.json().catch(() => ({})) as { ok: boolean; items: RegulatoryItem[]; sources: string[]; fetchedAt: string };
      if (!mountedRef.current) return;
      if (!data.ok) {
        setFeedError("Feed returned an error — retrying automatically");
        return;
      }
      const loadedItems = data.items ?? [];
      setItems(loadedItems);
      setSources(data.sources ?? []);
      setFetchedAt(data.fetchedAt ?? "");
      void runTriage(loadedItems);
    } catch (err) {
      console.error("[hawkeye] intel/news-search threw — feed empty until next refresh:", err);
      if (mountedRef.current) setFeedError("Network error fetching regulatory feed — retrying automatically");
    } finally { if (mountedRef.current) setLoading(false); }
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

      {feedError && (
        <div className="mx-4 mt-3 rounded border border-red/30 bg-red-dim px-3 py-2 flex items-center gap-2">
          <span className="text-red text-13 shrink-0">⚠</span>
          <span className="text-11 text-red">{feedError}</span>
        </div>
      )}

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


// Intel tools previously surfaced via the inline "Live Intelligence Feed"
// dropdown now live in the global "More" mega-menu's Intelligence section
// (see Header.tsx). This page focuses on the UAE Regulatory Live Feed below.

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntelPage() {
  return (
    <ModuleLayout asanaModule="intel" asanaLabel="OSINT Intelligence" hideDetailPanel>
      <ModuleHero
        eyebrow=""
        title="Intel"
        titleEm="feed."
        intro={
          <>
            <strong>UAE Regulatory Live Feed.</strong> Polls MoET, UAE IEC,
            CBUAE, UAEFIU, FATF and Google News every 5 minutes for circulars,
            enforcement actions and guidance updates — each item AI-triaged by
            relevance, impact and required action.
          </>
        }
        kpis={[
          { value: "4", label: "live government sources" },
          { value: "30", label: "live news queries" },
          { value: "5m", label: "live refresh cadence" },
          { value: "AI", label: "relevance triage" },
        ]}
      />

      <div className="mt-6 space-y-6">
        <RegulatoryFeedPanel />
      </div>
    </ModuleLayout>
  );
}
