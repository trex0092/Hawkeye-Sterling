"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { GeopoliticalEvent } from "@/app/api/geopolitical/events/route";
import type {
  PortfolioClient,
  PortfolioImpactResult,
} from "@/app/api/geopolitical/portfolio-impact/route";

// ─── helpers ────────────────────────────────────────────────────────────────

const REGION_FLAGS: Record<string, string> = {
  "Middle East": "🌍",
  Europe: "🌍",
  Asia: "🌏",
  Africa: "🌍",
  Americas: "🌎",
};

const COUNTRY_FLAGS: Record<string, string> = {
  Sudan: "🇸🇩",
  Iran: "🇮🇷",
  Myanmar: "🇲🇲",
  Venezuela: "🇻🇪",
  Turkey: "🇹🇷",
  Pakistan: "🇵🇰",
  Russia: "🇷🇺",
  Ethiopia: "🇪🇹",
  Lebanon: "🇱🇧",
  Nigeria: "🇳🇬",
  Georgia: "🇬🇪",
  Bangladesh: "🇧🇩",
  Israel: "🇮🇱",
  Peru: "🇵🇪",
  Ukraine: "🇺🇦",
  China: "🇨🇳",
  "North Korea": "🇰🇵",
  Libya: "🇱🇾",
  Syria: "🇸🇾",
  Yemen: "🇾🇪",
  Somalia: "🇸🇴",
  Mali: "🇲🇱",
  "DR Congo": "🇨🇩",
  Zimbabwe: "🇿🇼",
};

function countryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? "🏳️";
}

const RISK_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border border-red-500/30",
  high: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  medium: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
};

const RISK_LABEL: Record<string, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
};

const EVENT_CHIP_COLOR: Record<string, string> = {
  conflict: "bg-red-900/30 text-red-300",
  sanctions: "bg-purple-900/30 text-purple-300",
  coup: "bg-orange-900/30 text-orange-300",
  election: "bg-yellow-900/30 text-yellow-300",
  "financial-crisis": "bg-blue-900/30 text-blue-300",
  diplomatic: "bg-teal-900/30 text-teal-300",
  "Conflict": "bg-red-900/30 text-red-300",
  "Sanctions": "bg-purple-900/30 text-purple-300",
  "Coup": "bg-orange-900/30 text-orange-300",
  "Election Risk": "bg-yellow-900/30 text-yellow-300",
  "Financial Crisis": "bg-blue-900/30 text-blue-300",
  "Diplomatic Incident": "bg-teal-900/30 text-teal-300",
  "Civil Unrest": "bg-pink-900/30 text-pink-300",
};

const REGIONS = ["All", "Middle East", "Europe", "Asia", "Africa", "Americas"] as const;
const RISK_FILTERS = ["All", "critical", "high", "medium"] as const;

// ─── Risk Map regions ────────────────────────────────────────────────────────

const MAP_REGIONS = [
  { name: "Americas", emoji: "🌎", countries: ["Venezuela", "Peru", "Colombia", "Cuba", "Nicaragua"] },
  { name: "Europe", emoji: "🌍", countries: ["Russia", "Turkey", "Georgia", "Ukraine", "Belarus"] },
  { name: "Middle East", emoji: "🌍", countries: ["Iran", "Yemen", "Syria", "Lebanon", "Israel"] },
  { name: "Africa", emoji: "🌍", countries: ["Sudan", "Ethiopia", "Nigeria", "Libya", "Mali", "Somalia", "DR Congo", "Zimbabwe"] },
  { name: "Asia", emoji: "🌏", countries: ["Myanmar", "Pakistan", "Bangladesh", "North Korea", "Afghanistan"] },
];

// ─── Default portfolio ────────────────────────────────────────────────────────

const DEFAULT_PORTFOLIO: PortfolioClient[] = [
  { clientName: "Al-Noor Trading LLC", country: "Pakistan", sector: "Trade Finance", exposureAmount: 450000 },
  { clientName: "Istanbul Metals FZC", country: "Turkey", sector: "Gold & Metals", exposureAmount: 1200000 },
  { clientName: "West Africa Commodities", country: "Nigeria", sector: "Commodities", exposureAmount: 320000 },
  { clientName: "Beirut Investments Ltd", country: "Lebanon", sector: "Banking", exposureAmount: 780000 },
  { clientName: "Dhaka Garments Export", country: "Bangladesh", sector: "Trade", exposureAmount: 190000 },
];

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = "events" | "portfolio" | "map";

export default function GeopoliticalPage() {
  const [tab, setTab] = useState<Tab>("events");
  const [events, setEvents] = useState<GeopoliticalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("All");
  const [riskFilter, setRiskFilter] = useState<string>("All");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Portfolio tab state
  const [portfolio, setPortfolio] = useState<PortfolioClient[]>(DEFAULT_PORTFOLIO);
  const [portfolioRaw, setPortfolioRaw] = useState(
    DEFAULT_PORTFOLIO.map((c) => `${c.clientName},${c.country},${c.sector},${c.exposureAmount}`).join("\n")
  );
  const [impactResult, setImpactResult] = useState<PortfolioImpactResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/geopolitical/events");
      const data = await res.json() as GeopoliticalEvent[] | { ok: boolean; events: GeopoliticalEvent[] };
      if (Array.isArray(data)) {
        setEvents(data);
      } else if (data && "events" in data) {
        setEvents(data.events);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("[hawkeye] geopolitical fetchEvents threw — keeping existing events:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
    const id = setInterval(() => { void fetchEvents(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  const filteredEvents = events.filter((e) => {
    if (regionFilter !== "All" && e.region !== regionFilter) return false;
    if (riskFilter !== "All" && e.riskLevel !== riskFilter) return false;
    return true;
  });

  const kpiActiveEvents = events.length;
  const kpiCritical = events.filter((e) => e.riskLevel === "critical").length;
  const kpiExposure = impactResult
    ? `AED ${(impactResult.totalExposure / 1_000_000).toFixed(1)}M`
    : `${portfolio.length} clients`;
  const kpiRegions = [...new Set(events.map((e) => e.region))].length;

  function parsePortfolio(raw: string): PortfolioClient[] {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(",");
        return {
          clientName: parts[0]?.trim() ?? "Unknown",
          country: parts[1]?.trim() ?? "",
          sector: parts[2]?.trim() ?? "",
          exposureAmount: parseFloat(parts[3] ?? "0") || 0,
        };
      })
      .filter((c) => c.clientName && c.country);
  }

  async function assessImpact() {
    const parsed = parsePortfolio(portfolioRaw);
    setPortfolio(parsed);
    setImpactLoading(true);
    setImpactError(null);
    try {
      const res = await fetch("/api/geopolitical/portfolio-impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events, portfolio: parsed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Impact assessment failed (HTTP ${res.status}) — please retry`);
      }
      const data = await res.json() as PortfolioImpactResult;
      if (mountedRef.current) setImpactResult(data);
    } catch (err) {
      if (mountedRef.current) setImpactError(err instanceof Error ? err.message : "Impact assessment failed — please retry");
    } finally {
      if (mountedRef.current) setImpactLoading(false);
    }
  }

  return (
    <ModuleLayout engineLabel="Geopolitical intelligence">
      <ModuleHero
        eyebrow="Intelligence · AML · Sanctions"
        title="Geopolitical"
        titleEm="risk."
        moduleNumber={44}
        kpis={[
          { value: String(kpiActiveEvents || "—"), label: "Active events" },
          { value: String(kpiCritical || "—"), label: "Critical alerts", tone: kpiCritical > 0 ? "red" : undefined },
          { value: kpiExposure, label: "Portfolio exposure" },
          { value: String(kpiRegions || "—"), label: "Regions monitored" },
        ]}
      />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-hair">
        {(["events", "portfolio", "map"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-13 font-medium rounded-t transition-colors ${
              tab === t
                ? "bg-bg-2 text-ink-0 border-b-2 border-brand"
                : "text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {t === "events" && "🌐 Live Events"}
            {t === "portfolio" && "📊 Portfolio Impact"}
            {t === "map" && "🗺️ Risk Map"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          {lastRefresh && (
            <span className="text-10 font-mono text-ink-3">
              Refreshed {lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => { void fetchEvents(); }}
            disabled={loading}
            className="px-2 py-0.5 text-12 font-mono border border-green/40 rounded text-green bg-green-dim hover:bg-green-dim/70 transition-colors disabled:opacity-50"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── TAB 1: Live Events ── */}
      {tab === "events" && (
        <>
          {/* Filters */}
          <div className="flex gap-3 mb-5 flex-wrap">
            <div className="flex gap-1">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRegionFilter(r)}
                  className={`px-3 py-1 text-11 rounded border transition-colors ${
                    regionFilter === r
                      ? "bg-brand text-white border-brand"
                      : "border-hair-2 text-ink-2 hover:border-brand hover:text-ink-0"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {RISK_FILTERS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskFilter(r)}
                  className={`px-3 py-1 text-11 rounded border transition-colors capitalize ${
                    riskFilter === r
                      ? "bg-brand text-white border-brand"
                      : "border-hair-2 text-ink-2 hover:border-brand hover:text-ink-0"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {loading && !events.length ? (
            <div className="flex items-center justify-center h-48 text-ink-3">
              <span className="animate-pulse font-mono text-13">Loading geopolitical intelligence…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className="border border-hair-2 rounded-lg p-4 bg-bg-1 hover:border-brand/40 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl leading-none">{countryFlag(event.country)}</span>
                      <div>
                        <div className="text-13 font-semibold text-ink-0">{event.country}</div>
                        <div className="text-10 font-mono text-ink-3 uppercase tracking-wide">
                          {REGION_FLAGS[event.region]} {event.region}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 rounded text-10 font-mono font-semibold ${RISK_BADGE[event.riskLevel]}`}>
                        {RISK_LABEL[event.riskLevel]}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-10 font-mono ${EVENT_CHIP_COLOR[event.eventType] ?? "bg-bg-2 text-ink-2"}`}>
                        {event.eventType}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-13 font-semibold text-ink-0 mb-1 leading-snug">{event.headline}</h3>
                  <p className="text-12 text-ink-2 mb-3 leading-relaxed">{event.impact}</p>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {event.affectedSectors.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded bg-bg-2 text-10 font-mono text-ink-2 border border-hair">
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="bg-brand-dim/50 border border-brand/20 rounded p-2.5">
                    <div className="text-10 font-mono font-semibold text-brand uppercase tracking-wide mb-1">
                      Recommendation
                    </div>
                    <div className="text-11 text-ink-1 leading-relaxed">{event.recommendation}</div>
                  </div>

                  <div className="mt-2 text-10 font-mono text-ink-3 text-right">{event.date}</div>
                </div>
              ))}
              {filteredEvents.length === 0 && (
                <div className="col-span-2 text-center py-12 text-ink-3 text-13">
                  No events match the current filters.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── TAB 2: Portfolio Impact ── */}
      {tab === "portfolio" && (
        <div className="space-y-6">
          <div className="border border-hair-2 rounded-lg p-5 bg-bg-1">
            <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-3">
              Portfolio — paste CSV (clientName, country, sector, exposureAmount)
            </div>
            <textarea
              value={portfolioRaw}
              onChange={(e) => setPortfolioRaw(e.target.value)}
              rows={8}
              className="w-full bg-bg-0 border border-hair-2 rounded p-3 font-mono text-12 text-ink-0 outline-none focus:border-brand resize-y"
              placeholder="Al-Noor Trading LLC,Pakistan,Trade Finance,450000&#10;Istanbul Metals FZC,Turkey,Gold & Metals,1200000"
            />
            <button
              type="button"
              onClick={() => { void assessImpact(); }}
              disabled={impactLoading || !events.length}
              className="mt-3 px-5 py-2 bg-brand text-white rounded font-semibold text-13 hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {impactLoading ? "⟳ Assessing…" : "🎯 Assess Impact"}
            </button>
            {!events.length && (
              <p className="text-11 text-amber mt-2">Load events first (switch to Live Events tab to refresh)</p>
            )}
            {impactError && (
              <div className="mt-3 rounded border border-red/30 bg-red-dim px-3 py-2 text-12 text-red">
                ⚠ {impactError}
              </div>
            )}
          </div>

          {impactResult && (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-hair-2 rounded-lg p-4 bg-bg-1 text-center">
                  <div className="text-28 font-semibold text-ink-0">{impactResult.exposedClients.length}</div>
                  <div className="text-11 text-ink-3 font-mono uppercase tracking-wide">Exposed clients</div>
                </div>
                <div className="border border-hair-2 rounded-lg p-4 bg-bg-1 text-center">
                  <div className="text-28 font-semibold text-red-400">
                    AED {(impactResult.totalExposure / 1_000_000).toFixed(2)}M
                  </div>
                  <div className="text-11 text-ink-3 font-mono uppercase tracking-wide">Total exposure</div>
                </div>
                <div className="border border-hair-2 rounded-lg p-4 bg-bg-1 text-center">
                  <div className="text-28 font-semibold text-amber">
                    {impactResult.immediateActions.length}
                  </div>
                  <div className="text-11 text-ink-3 font-mono uppercase tracking-wide">Immediate actions</div>
                </div>
              </div>

              {/* Immediate Actions */}
              {impactResult.immediateActions.length > 0 && (
                <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
                  <div className="font-mono text-11 uppercase tracking-wide text-red-400 mb-2">
                    ⚡ Immediate Actions Required
                  </div>
                  <ul className="space-y-1">
                    {impactResult.immediateActions.map((action, i) => (
                      <li key={i} className="text-12 text-ink-1 flex gap-2">
                        <span className="text-red-400 shrink-0">→</span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Exposure table */}
              <div className="border border-hair-2 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-hair-2 bg-bg-1">
                  <span className="text-12 font-semibold text-ink-0">Exposure Detail</span>
                </div>
                <div className="divide-y divide-hair">
                  {impactResult.exposedClients.map((ec, idx) => (
                    <div key={idx} className="p-4 bg-bg-0">
                      <div className="flex items-start justify-between mb-2 gap-3">
                        <div>
                          <div className="text-13 font-semibold text-ink-0">{ec.client.clientName}</div>
                          <div className="text-11 text-ink-3 font-mono">
                            {ec.client.country} · {ec.client.sector} · AED {ec.client.exposureAmount.toLocaleString()}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-10 font-mono font-semibold shrink-0 ${RISK_BADGE[ec.exposureLevel] ?? "bg-bg-2 text-ink-2"}`}>
                          {(ec.exposureLevel ?? "").toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {ec.events.map((ev) => (
                          <span key={ev.eventId} className="px-2 py-0.5 rounded bg-bg-2 text-10 font-mono text-ink-2 border border-hair" title={ev.linkReason}>
                            {ev.eventId}: {ev.headline.slice(0, 50)}…
                          </span>
                        ))}
                      </div>
                      <ul className="space-y-0.5">
                        {ec.requiredActions.map((a, ai) => (
                          <li key={ai} className="text-11 text-ink-2 flex gap-1.5">
                            <span className="text-brand shrink-0">›</span>{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {impactResult.exposedClients.length === 0 && (
                    <div className="p-8 text-center text-ink-3 text-13">No portfolio clients exposed to current events.</div>
                  )}
                </div>
              </div>

              {/* Risk heat map — CSS only */}
              <div className="border border-hair-2 rounded-lg p-4 bg-bg-1">
                <div className="font-mono text-11 uppercase tracking-wide text-ink-3 mb-3">Risk Heat Map</div>
                <div className="space-y-2">
                  {impactResult.exposedClients
                    .sort((a, b) => b.client.exposureAmount - a.client.exposureAmount)
                    .map((ec) => {
                      const pct = Math.min(100, (ec.client.exposureAmount / impactResult.totalExposure) * 100);
                      const bg =
                        ec.exposureLevel === "critical"
                          ? "bg-red-500"
                          : ec.exposureLevel === "high"
                          ? "bg-amber-500"
                          : ec.exposureLevel === "medium"
                          ? "bg-blue-500"
                          : "bg-green-500";
                      return (
                        <div key={ec.client.clientName} className="flex items-center gap-3">
                          <div className="w-36 text-11 font-mono text-ink-2 truncate">{ec.client.clientName}</div>
                          <div className="flex-1 h-5 bg-bg-2 rounded overflow-hidden">
                            <div
                              className={`h-full rounded ${bg} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="w-24 text-10 font-mono text-ink-3 text-right">
                            AED {(ec.client.exposureAmount / 1000).toFixed(0)}K
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 3: Risk Map ── */}
      {tab === "map" && (
        <div className="space-y-4">
          <div className="font-mono text-11 text-ink-3 uppercase tracking-wide mb-4">
            Global risk distribution — live events by region
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MAP_REGIONS.map((region) => {
              const regionEvents = events.filter((e) => e.region === region.name);
              const critical = regionEvents.filter((e) => e.riskLevel === "critical").length;
              const high = regionEvents.filter((e) => e.riskLevel === "high").length;
              const medium = regionEvents.filter((e) => e.riskLevel === "medium").length;
              const borderColor =
                critical > 0
                  ? "border-red-500/50"
                  : high > 0
                  ? "border-amber-500/50"
                  : medium > 0
                  ? "border-blue-500/50"
                  : "border-hair-2";
              const headerBg =
                critical > 0
                  ? "bg-red-500/10"
                  : high > 0
                  ? "bg-amber-500/10"
                  : medium > 0
                  ? "bg-blue-500/10"
                  : "bg-bg-1";

              return (
                <div key={region.name} className={`border rounded-lg overflow-hidden ${borderColor}`}>
                  <div className={`px-4 py-3 ${headerBg} border-b ${borderColor} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{region.emoji}</span>
                      <span className="font-semibold text-13 text-ink-0">{region.name}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {critical > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-10 font-mono font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                          {critical} CRIT
                        </span>
                      )}
                      {high > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-10 font-mono font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {high} HIGH
                        </span>
                      )}
                      {medium > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-10 font-mono font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          {medium} MED
                        </span>
                      )}
                      {regionEvents.length === 0 && (
                        <span className="px-1.5 py-0.5 rounded text-10 font-mono text-ink-3 bg-bg-2">
                          CLEAR
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-bg-0">
                    {regionEvents.length > 0 ? (
                      <div className="space-y-2">
                        {regionEvents.map((e) => (
                          <div key={e.id} className="flex items-start gap-2">
                            <span className="text-lg leading-none mt-0.5">{countryFlag(e.country)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="text-11 font-semibold text-ink-0">{e.country}</span>
                                <span className={`px-1.5 py-0.5 rounded text-9 font-mono font-semibold ${RISK_BADGE[e.riskLevel]}`}>
                                  {e.riskLevel.toUpperCase()}
                                </span>
                              </div>
                              <div className="text-10 text-ink-2 leading-snug truncate">{e.headline}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {region.countries.slice(0, 4).map((c) => (
                          <div key={c} className="flex items-center gap-2 opacity-40">
                            <span>{countryFlag(c)}</span>
                            <span className="text-11 text-ink-3">{c}</span>
                            <span className="text-9 font-mono text-ink-3 ml-auto">MONITORING</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-4 pt-4 border-t border-hair flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              <span className="text-11 text-ink-2">Critical — immediate compliance action required</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
              <span className="text-11 text-ink-2">High — enhanced monitoring</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
              <span className="text-11 text-ink-2">Medium — standard vigilance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-bg-2 border border-hair inline-block" />
              <span className="text-11 text-ink-2">Clear — no active events</span>
            </div>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
