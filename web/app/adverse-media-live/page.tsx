"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
import type { AdverseMediaLiveResult } from "@/app/api/adverse-media-live/route";
import type { RegulatoryItem } from "@/app/api/regulatory-feed/route";
import type { CrossCorrelateResult, CrossCorrelateArticle } from "@/app/api/adverse-media/cross-correlate/route";

// ─── Shared styling ───────────────────────────────────────────────────────────

const RATING_STYLES: Record<
  AdverseMediaLiveResult["riskRating"],
  { badge: string; label: string }
> = {
  critical: { badge: "bg-red text-white border-red", label: "CRITICAL" },
  high:     { badge: "bg-red-dim text-red border-red/40", label: "HIGH" },
  medium:   { badge: "bg-amber-dim text-amber border-amber/40", label: "MEDIUM" },
  low:      { badge: "bg-blue-dim text-blue border-blue/40", label: "LOW" },
  clear:    { badge: "bg-green-dim text-green border-green/40", label: "CLEAR" },
};

const TONE_COLOR = (t: number) => t < -5 ? "text-red" : t < -2 ? "text-amber" : t > 2 ? "text-green" : "text-ink-2";
const TONE_BAR_WIDTH = (t: number) => `${Math.min(100, Math.max(0, Math.round((Math.abs(t) / 10) * 100)))}%`;
const TONE_BAR_COLOR = (t: number) => t < -5 ? "bg-red" : t < -2 ? "bg-amber" : "bg-green";

const CAT_BADGE = "inline-flex items-center px-1.5 py-px rounded-sm font-mono text-9 font-semibold uppercase tracking-wide-2 bg-bg-2 text-ink-2 border border-hair-2";

const SOURCE_BADGE: Record<string, string> = {
  "fatf-gafi.org": "bg-orange-dim text-orange",
  "centralbank.ae": "bg-brand-dim text-brand-deep",
  "moet.gov.ae": "bg-violet-dim text-violet",
  "uaefiu.gov.ae": "bg-red-dim text-red",
  GDELT: "bg-bg-2 text-ink-2",
};
const sourceBadge = (s: string) => SOURCE_BADGE[s] ?? "bg-bg-2 text-ink-2";

const inputCls = "w-full bg-transparent border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand";
const selectCls = "bg-transparent border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

// ─── Regulatory Feed Panel ────────────────────────────────────────────────────

const TONE_DOT: Record<RegulatoryItem["tone"], string> = { green: "bg-green", amber: "bg-amber", red: "bg-red" };
const TONE_BADGE_CLS: Record<RegulatoryItem["tone"], string> = { green: "bg-green-dim text-green", amber: "bg-amber-dim text-amber", red: "bg-red-dim text-red" };

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
      const data = (await res.json()) as { ok: boolean; items: RegulatoryItem[]; sources: string[]; fetchedAt: string };
      if (!data.ok) return;
      setItems(data.items ?? []);
      setSources(data.sources ?? []);
      setFetchedAt(data.fetchedAt ?? "");
    } catch { /* silently ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mt-8">
      <div className="flex items-center justify-between px-4 py-3 border-b border-hair-2 bg-bg-1">
        <div className="flex items-center gap-2">
          <span className="text-12 font-semibold text-ink-0">UAE Regulatory Live Feed</span>
          <span className="inline-flex items-center gap-1 text-10 font-mono text-green font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" style={{ animation: "live-pulse 2s ease-in-out infinite" }} />
            live · refreshes every 5 min
          </span>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-9 font-mono text-ink-3">
              synced {new Date(fetchedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" onClick={() => void load()} disabled={loading}
            className="text-10 font-mono px-2 py-0.5 rounded border border-hair-2 bg-bg-panel text-ink-1 hover:bg-bg-1 disabled:opacity-40">
            {loading ? "Fetching…" : "↻ Refresh"}
          </button>
        </div>
      </div>
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-hair bg-bg-panel">
          <span className="text-9 font-mono text-ink-3 uppercase tracking-wide-3 self-center mr-1">Live sources:</span>
          {sources.map((s) => <span key={s} className="text-9 font-mono px-1.5 py-px rounded-sm font-semibold bg-bg-2 text-ink-2">{s}</span>)}
        </div>
      )}
      {loading && items.length === 0 ? (
        <div className="px-4 py-8 text-center text-11 font-mono text-ink-3">Polling MoET · CBUAE · FATF · GDELT…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-11 font-mono text-ink-3">No live items — showing static regulatory baseline.</div>
      ) : (
        <div className="divide-y divide-hair max-h-[420px] overflow-y-auto">
          {items.slice(0, 25).map((item) => (
            <a key={item.id} href={item.url || "#"} target="_blank" rel="noreferrer noopener"
              className="flex items-start gap-3 px-4 py-3 no-underline hover:bg-bg-1 transition-colors group">
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[item.tone]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-0.5">
                  <span className="text-12 font-medium text-ink-0 group-hover:text-brand leading-snug">{item.title}</span>
                </div>
                {item.snippet && <div className="text-10.5 text-ink-3 leading-snug mb-1">{item.snippet}</div>}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold ${sourceBadge(item.source)}`}>{item.source}</span>
                  <span className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold uppercase ${TONE_BADGE_CLS[item.tone]}`}>{item.category}</span>
                  {item.pubDate && <span className="text-9 font-mono text-ink-3">{item.pubDate.slice(0, 10)}</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Live Search Tab ──────────────────────────────────────────────────────────

const ENTITY_TYPES = ["", "Individual", "Corporate", "Financial Institution", "VASP", "DPMS Dealer", "PEP", "NGO/NPO", "Trust / Foundation", "Partnership", "Government Entity"];
const JURISDICTIONS = ["", "UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Jordan", "Egypt", "Turkey", "Iran", "Russia", "China", "United Kingdom", "United States", "Switzerland", "Panama", "British Virgin Islands", "Cayman Islands", "Other"];

function LiveSearchTab() {
  const [subjectName, setSubjectName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdverseMediaLiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSearched, setLastSearched] = useState<{ subjectName: string; entityType: string; jurisdiction: string } | null>(null);
  const [liveRefreshCount, setLiveRefreshCount] = useState(0);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSearch = useCallback(async (params: { subjectName: string; entityType: string; jurisdiction: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/adverse-media-live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: params.subjectName, entityType: params.entityType || undefined, jurisdiction: params.jurisdiction || undefined }),
      });
      const data = (await res.json()) as AdverseMediaLiveResult;
      setResult(data);
      setLastSearched(params);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    await doSearch({ subjectName: subjectName.trim(), entityType, jurisdiction });
    setLiveRefreshCount(0);
  };

  useEffect(() => {
    if (liveIntervalRef.current) { clearInterval(liveIntervalRef.current); liveIntervalRef.current = null; }
    if (!lastSearched) return;
    liveIntervalRef.current = setInterval(async () => {
      await doSearch(lastSearched);
      setLiveRefreshCount((n) => n + 1);
    }, 60_000);
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
  }, [lastSearched, doSearch]);

  const ratingStyle = result ? RATING_STYLES[result.riskRating] : null;

  return (
    <>
      <form onSubmit={(e) => void handleSearch(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-6">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Subject search</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="md:col-span-1">
            <label className="block font-mono text-10 uppercase tracking-wide-3 text-ink-2 mb-1">Subject name <span className="text-red">*</span></label>
            <input type="text" value={subjectName} onChange={(e) => setSubjectName(e.target.value)}
              placeholder='"Acme Trading LLC" or "John Smith"' className={inputCls} required />
          </div>
          <div>
            <label className="block font-mono text-10 uppercase tracking-wide-3 text-ink-2 mb-1">Entity type</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className={`${selectCls} w-full`}>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t || "— Any —"}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-10 uppercase tracking-wide-3 text-ink-2 mb-1">Jurisdiction</label>
            <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className={`${selectCls} w-full`}>
              {JURISDICTIONS.map((j) => <option key={j} value={j}>{j || "— Any —"}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading || !subjectName.trim()}
            className="font-mono text-10.5 uppercase tracking-wide-3 font-medium px-5 py-2 rounded border bg-brand text-white border-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
            {loading ? "Searching…" : "Search"}
          </button>
          {lastSearched && !loading && (
            <span className="inline-flex items-center gap-1.5 text-10 font-mono text-green font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" style={{ animation: "live-pulse 2s ease-in-out infinite" }} />
              Live · auto-refreshes every 60s
              {liveRefreshCount > 0 && <span className="text-ink-3">({liveRefreshCount} refresh{liveRefreshCount !== 1 ? "es" : ""})</span>}
            </span>
          )}
        </div>
      </form>

      {error && <div className="bg-red-dim border border-red/30 rounded-lg px-4 py-3 mb-4 text-12 text-red">{error}</div>}

      {result && (
        <div className="space-y-4">
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-start gap-5 flex-wrap">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className={`px-5 py-3 rounded-lg border-2 font-mono text-14 font-bold uppercase tracking-wide-3 ${ratingStyle?.badge ?? ""}`}>
                  {ratingStyle?.label ?? "—"}
                </span>
                <span className="font-mono text-10 text-ink-3 uppercase tracking-wide-2">risk rating</span>
              </div>
              <div className="flex gap-6 items-start flex-wrap">
                <div>
                  <div className="font-mono text-20 font-semibold text-ink-0">{result.totalHits}</div>
                  <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-medium">total hits</div>
                </div>
                <div>
                  <div className={`font-mono text-20 font-semibold ${result.riskScore >= 60 ? "text-red" : result.riskScore >= 35 ? "text-amber" : "text-green"}`}>
                    {result.riskScore}<span className="text-12 text-ink-3 font-normal">/100</span>
                  </div>
                  <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-medium">risk score</div>
                </div>
                <div>
                  <div className="font-mono text-20 font-semibold text-ink-0">{result.articles.length}</div>
                  <div className="text-10 uppercase tracking-wide-4 text-ink-2 font-medium">articles</div>
                </div>
              </div>
              <div className="flex-1 min-w-[280px]">
                <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 mb-1.5 font-semibold">AI summary</div>
                <p className="text-13 text-ink-1 leading-relaxed m-0">{result.summary}</p>
                <p className="text-10 text-ink-3 font-mono mt-2 m-0">{result.regulatoryBasis}</p>
              </div>
            </div>
          </div>

          {result.articles.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-hair-2 bg-bg-1 flex items-center justify-between">
                <span className="text-12 font-semibold text-ink-0">Articles</span>
                <span className="text-10 font-mono text-ink-3">sorted by negative tone</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-11">
                  <thead className="bg-bg-1 border-b border-hair-2">
                    <tr>
                      {["Title", "Source", "Date", "Tone", "Relevance", "Categories"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {result.articles.map((article, i) => (
                      <tr key={`${article.url}-${i}`} className="hover:bg-bg-1 transition-colors">
                        <td className="px-3 py-2.5 max-w-[300px]">
                          <a href={article.url} target="_blank" rel="noreferrer noopener"
                            className="text-ink-0 hover:text-brand font-medium leading-snug line-clamp-2">{article.title}</a>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-9 font-mono px-1.5 py-px rounded-sm font-semibold ${sourceBadge(article.source)}`}>{article.source}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-mono text-10 text-ink-2">{article.publishedAt ? article.publishedAt.slice(0, 10) : "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 min-w-[90px]">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-bg-2 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${TONE_BAR_COLOR(article.tone)}`} style={{ width: TONE_BAR_WIDTH(article.tone) }} />
                            </div>
                            <span className={`font-mono text-10 ${TONE_COLOR(article.tone)}`}>{article.tone.toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-mono text-10 text-ink-1">{article.relevanceScore}%</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {article.categories.map((cat) => <span key={cat} className={CAT_BADGE}>{cat.replace(/_/g, " ")}</span>)}
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
              <div className="text-green font-mono text-11 uppercase tracking-wide-3 font-semibold mb-1">No adverse media found</div>
              <p className="text-12 text-ink-2 m-0">
                No articles from GDELT for &ldquo;{result.subject}&rdquo; in the last 7 days.
                Log this negative finding in the 10-Year Audit Trail tab (Art.19).
              </p>
            </div>
          )}
        </div>
      )}

      <RegulatoryFeedPanel />
    </>
  );
}

// ─── 10-Year Audit Trail Tab ──────────────────────────────────────────────────

type AmSeverity = "critical" | "high" | "medium" | "low" | "clear";
type AmCategory = "fraud_forgery" | "law_enforcement" | "money_laundering" | "sanctions" | "proliferation" | "corruption" | "terrorism" | "environmental" | "labour" | "tax_evasion" | "drug_trafficking" | "human_trafficking" | "cybercrime" | "insider_trading" | "embezzlement" | "regulatory_action" | "asset_seizure" | "reputational" | "insolvency" | "data_breach" | "market_manipulation" | "trade_sanctions" | "weapons" | "organised_crime" | "real_estate_ml" | "pf_nuclear" | "political_risk" | "conflict_minerals" | "vasp_crypto" | "document_fraud" | "extortion" | "illegal_mining" | "wildlife_crime" | "illegal_fishing" | "deforestation" | "antitrust" | "counterfeit" | "insurance_fraud" | "healthcare_fraud" | "procurement_fraud" | "piracy" | "ngo_misuse" | "privacy_gdpr" | "bribery_public" | "securities_fraud" | "ponzi_scheme" | "bankruptcy_fraud" | "identity_theft" | "smuggling" | "other";

interface AmEntry { id: string; subject: string; source: string; url: string; articleDate: string; category: AmCategory; severity: AmSeverity; headline: string; loggedBy: string; loggedAt: string; }
interface AmAssessment { ok: boolean; overallRisk: "critical" | "high" | "medium" | "low" | "clear"; threatNarrative: string; topConcerns: string[]; fatfTypologies: string[]; regulatoryLinks: string; recommendedAction: "file_str" | "edd_required" | "exit_relationship" | "enhanced_monitoring" | "standard_monitoring" | "clear"; actionRationale: string; uaeSpecificRisks: string[]; }

const STORAGE = "hawkeye.am-lookback.v1";
const CURRENT_YEAR = new Date().getFullYear();
const LOOKBACK_YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

const CAT_LABELS: Record<AmCategory, string> = {
  fraud_forgery: "Fraud / Forgery", law_enforcement: "Law Enforcement", money_laundering: "Money Laundering", sanctions: "Sanctions / Watchlist", proliferation: "Proliferation / WMD", corruption: "Corruption / Bribery", terrorism: "Terrorism / TF", environmental: "Environmental Crime", labour: "Labour / Human Rights", tax_evasion: "Tax Evasion", drug_trafficking: "Drug Trafficking", human_trafficking: "Human Trafficking", cybercrime: "Cybercrime", insider_trading: "Insider Trading", embezzlement: "Embezzlement", regulatory_action: "Regulatory Action", asset_seizure: "Asset Seizure", reputational: "Reputational", insolvency: "Insolvency", data_breach: "Data Breach", market_manipulation: "Market Manipulation", trade_sanctions: "Trade Sanctions", weapons: "Weapons / Arms", organised_crime: "Organised Crime", real_estate_ml: "Real Estate ML", pf_nuclear: "Nuclear / CBRN", political_risk: "Political Risk", conflict_minerals: "Conflict Minerals", vasp_crypto: "Crypto / VA Fraud", document_fraud: "Document Fraud", extortion: "Extortion", illegal_mining: "Illegal Mining", wildlife_crime: "Wildlife Trafficking", illegal_fishing: "Illegal Fishing", deforestation: "Deforestation", antitrust: "Antitrust / Cartel", counterfeit: "Counterfeit Goods", insurance_fraud: "Insurance Fraud", healthcare_fraud: "Healthcare Fraud", procurement_fraud: "Procurement Fraud", piracy: "Maritime Piracy", ngo_misuse: "NGO / Charity Misuse", privacy_gdpr: "Privacy / GDPR", bribery_public: "Public Official Bribery", securities_fraud: "Securities Fraud", ponzi_scheme: "Ponzi / Pyramid", bankruptcy_fraud: "Bankruptcy Fraud", identity_theft: "Identity Theft", smuggling: "Smuggling", other: "Other",
};

const SEV_TONE: Record<AmSeverity, string> = { critical: "bg-red-dim text-red", high: "bg-orange-dim text-orange", medium: "bg-amber-dim text-amber", low: "bg-blue-dim text-blue", clear: "bg-green-dim text-green" };
const RISK_TONE: Record<AmAssessment["overallRisk"], string> = { critical: "bg-red-dim text-red", high: "bg-red-dim text-red", medium: "bg-amber-dim text-amber", low: "bg-green-dim text-green", clear: "bg-green-dim text-green" };
const ACTION_TONE: Record<AmAssessment["recommendedAction"], string> = { file_str: "bg-red-dim text-red", edd_required: "bg-red-dim text-red", exit_relationship: "bg-red-dim text-red", enhanced_monitoring: "bg-amber-dim text-amber", standard_monitoring: "bg-blue-dim text-blue", clear: "bg-green-dim text-green" };

const BLANK = { subject: "", source: "", url: "", articleDate: "", category: "law_enforcement" as AmCategory, severity: "medium" as AmSeverity, headline: "", loggedBy: "" };
const iCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0";

function loadEntries(): AmEntry[] {
  if (typeof window === "undefined") return [];
  try { const r = window.localStorage.getItem(STORAGE); return r ? (JSON.parse(r) as AmEntry[]) : []; } catch { return []; }
}
function saveEntries(rows: AmEntry[]) { try { window.localStorage.setItem(STORAGE, JSON.stringify(rows)); } catch { /* */ } }
function yearOf(dmy: string): number | null { const m = dmy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? parseInt(m[3]!, 10) : null; }

function AuditTrailTab() {
  const [entries, setEntries] = useState<AmEntry[]>([]);
  const [draft, setDraft] = useState(BLANK);
  const [filterSubject, setFilterSubject] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(BLANK);
  const [assessment, setAssessment] = useState<Record<string, AmAssessment>>({});
  const [assessing, setAssessing] = useState<Record<string, boolean>>({});
  const [correlations, setCorrelations] = useState<Record<string, CrossCorrelateResult>>({});
  const [correlating, setCorrelating] = useState<Record<string, boolean>>({});
  const [dismissedOpen, setDismissedOpen] = useState<Record<string, boolean>>({});

  useEffect(() => { setEntries(loadEntries()); }, []);

  const assessSubject = async (subject: string) => {
    if (assessing[subject]) return;
    setAssessing((p) => ({ ...p, [subject]: true }));
    try {
      const res = await fetch("/api/adverse-media-assess", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, entries: entries.filter((e) => e.subject === subject).map((e) => ({ headline: e.headline, category: CAT_LABELS[e.category] ?? e.category, severity: e.severity, source: e.source, articleDate: e.articleDate })) }),
      });
      if (res.ok) { const data = (await res.json()) as AmAssessment; setAssessment((p) => ({ ...p, [subject]: data })); }
    } catch { /* non-fatal */ } finally { setAssessing((p) => ({ ...p, [subject]: false })); }
  };

  const crossCorrelate = async (subject: string) => {
    if (correlating[subject]) return;
    setCorrelating((p) => ({ ...p, [subject]: true }));
    try {
      const articles: CrossCorrelateArticle[] = entries.filter((e) => e.subject === subject).map((e) => ({ source: e.source || "Unknown", headline: e.headline, date: e.articleDate, snippet: `Category: ${CAT_LABELS[e.category] ?? e.category}. Severity: ${e.severity}.${e.url ? ` URL: ${e.url}` : ""}` }));
      const res = await fetch("/api/adverse-media/cross-correlate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject, articles }),
      });
      if (res.ok) { const data = (await res.json()) as CrossCorrelateResult; setCorrelations((p) => ({ ...p, [subject]: data })); }
    } catch { /* non-fatal */ } finally { setCorrelating((p) => ({ ...p, [subject]: false })); }
  };

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const setE = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditDraft((d) => ({ ...d, [k]: e.target.value }));

  const add = () => {
    if (!draft.subject || !draft.headline || !draft.articleDate) return;
    const next = [{ ...draft, id: `am-${Date.now()}`, loggedAt: new Date().toISOString() }, ...entries];
    saveEntries(next); setEntries(next); setDraft(BLANK);
  };
  const remove = (id: string) => { const next = entries.filter((e) => e.id !== id); saveEntries(next); setEntries(next); };
  const startEdit = (e: AmEntry) => { setEditingId(e.id); setEditDraft({ subject: e.subject, source: e.source, url: e.url, articleDate: e.articleDate, category: e.category, severity: e.severity, headline: e.headline, loggedBy: e.loggedBy }); };
  const saveEdit = (id: string) => { const next = entries.map((e) => e.id !== id ? e : { ...e, ...editDraft }); saveEntries(next); setEntries(next); setEditingId(null); };

  const visible = filterSubject ? entries.filter((e) => e.subject.toLowerCase().includes(filterSubject.toLowerCase())) : entries;
  const subjects = Array.from(new Set(entries.map((e) => e.subject)));
  const selectedSubject = filterSubject ? entries.find((e) => e.subject.toLowerCase().includes(filterSubject.toLowerCase()))?.subject ?? null : null;
  const coverageYears = new Set((selectedSubject ? entries.filter((e) => e.subject === selectedSubject) : entries).map((e) => yearOf(e.articleDate)).filter(Boolean) as number[]);

  const RECOM_TONE: Record<string, string> = { Clear: "bg-green-dim text-green", Monitor: "bg-blue-dim text-blue", EDD: "bg-amber-dim text-amber", "Exit Relationship": "bg-red-dim text-red", "File STR": "bg-red-dim text-red" };
  const TREND_TONE: Record<string, string> = { worsening: "text-red", stable: "text-amber", improving: "text-green" };
  const TREND_ICON: Record<string, string> = { worsening: "↑", stable: "→", improving: "↓" };
  const THEME_TONE: Record<string, string> = { fraud: "bg-red-dim text-red", sanctions: "bg-red-dim text-red", corruption: "bg-red-dim text-red", money_laundering: "bg-amber-dim text-amber", terrorism: "bg-red-dim text-red", regulatory: "bg-blue-dim text-blue" };
  const THEME_LABEL: Record<string, string> = { fraud: "Fraud", sanctions: "Sanctions", corruption: "Corruption", money_laundering: "ML", terrorism: "Terrorism", regulatory: "Regulatory" };

  return (
    <>
      {/* 10-year heatmap */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-4">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          10-year coverage {selectedSubject ? `— ${selectedSubject}` : "(all subjects)"}
        </div>
        <div className="flex gap-1 flex-wrap">
          {LOOKBACK_YEARS.map((y) => {
            const hasData = coverageYears.has(y);
            return (
              <div key={y} className={`flex flex-col items-center px-3 py-2 rounded text-center min-w-[52px] ${hasData ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>
                <span className="font-mono text-11 font-semibold">{y}</span>
                <span className="font-mono text-9 mt-0.5">{hasData ? "covered" : "gap"}</span>
              </div>
            );
          })}
        </div>
        <p className="text-10 text-ink-3 mt-2">Gaps indicate years with no logged findings. Document "no adverse media found" for each gap year to satisfy Art.19 audit trail requirements.</p>
      </div>

      {/* Log new entry */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-4">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Log new finding</div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <input value={draft.subject} onChange={set("subject")} placeholder="Subject name" className={iCls} />
          <input value={draft.headline} onChange={set("headline")} placeholder="Article headline" className={iCls} />
          <input value={draft.source} onChange={set("source")} placeholder="Source (e.g. Reuters)" className={iCls} />
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <input value={draft.articleDate} onChange={set("articleDate")} placeholder="Article date dd/mm/yyyy" className={iCls} />
          <select value={draft.category} onChange={set("category")} className={iCls}>
            {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={draft.severity} onChange={set("severity")} className={iCls}>
            {(["critical", "high", "medium", "low", "clear"] as AmSeverity[]).map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <input value={draft.loggedBy} onChange={set("loggedBy")} placeholder="Logged by (analyst)" className={iCls} />
        </div>
        <div className="mb-2"><input value={draft.url} onChange={set("url")} placeholder="URL / reference (optional)" className={iCls} /></div>
        <button type="button" onClick={add} disabled={!draft.subject || !draft.headline || !draft.articleDate}
          className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
          + Log finding
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4 flex gap-2 items-center">
        <input value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} placeholder="Filter by subject name…"
          className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 w-64" />
        {filterSubject && <button type="button" onClick={() => setFilterSubject("")} className="text-11 text-ink-3 hover:text-ink-0">clear</button>}
        <span className="text-11 text-ink-3 ml-auto">{visible.length} finding{visible.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Per-subject AI assessment */}
      {subjects.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">AI threat assessment per subject</div>
          {subjects.map((subject) => {
            const a = assessment[subject];
            const isAssessing = assessing[subject] === true;
            const corr = correlations[subject];
            const isCorrelating = correlating[subject] === true;
            const subjectCount = entries.filter((e) => e.subject === subject).length;
            const scoreColor = corr ? (corr.score < 30 ? "text-green" : corr.score <= 60 ? "text-amber" : "text-red") : "";
            return (
              <div key={subject} className="bg-bg-panel border border-hair-2 rounded-lg p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-12 font-semibold text-ink-0">{subject}</span>
                  <span className="text-10 text-ink-3 font-mono">{subjectCount} finding{subjectCount !== 1 ? "s" : ""}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" disabled={isCorrelating} onClick={() => void crossCorrelate(subject)}
                      className="text-11 font-semibold px-3 py-1 rounded border border-hair-2 bg-bg-1 text-ink-1 hover:bg-bg-2 disabled:opacity-40">
                      {isCorrelating ? "Correlating…" : "🔗 Cross-Correlate & Score"}
                    </button>
                    <button type="button" disabled={isAssessing} onClick={() => void assessSubject(subject)}
                      className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                      {isAssessing ? "Assessing…" : "AI Assess"}
                    </button>
                  </div>
                </div>
                {corr && (
                  <div className="mt-3 border border-hair-2 rounded-lg overflow-hidden">
                    <div className="bg-bg-1 px-3 py-2 border-b border-hair-2 flex items-center gap-3 flex-wrap">
                      <span className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2">Cross-Correlate Score</span>
                      <span className={`font-mono text-24 font-bold leading-none ${scoreColor}`}>{corr.score}</span>
                      <span className="text-10 text-ink-3 font-mono">/100</span>
                      <span className={`font-mono text-16 font-bold ${TREND_TONE[corr.trend] ?? "text-ink-2"}`}>{TREND_ICON[corr.trend] ?? "→"} {corr.trend}</span>
                      <span className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded font-mono text-11 font-bold uppercase ${RECOM_TONE[corr.recommendation] ?? "bg-bg-2 text-ink-2"}`}>{corr.recommendation}</span>
                    </div>
                    <div className="px-3 py-3 space-y-3">
                      <div className="flex gap-4 text-11 font-mono">
                        <span className="text-green font-semibold">{corr.confirmed.length} confirmed</span>
                        <span className="text-ink-3">{corr.dismissed.length} dismissed</span>
                      </div>
                      {Object.keys(corr.themes).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(corr.themes).filter(([, arts]) => arts.length > 0).map(([theme, arts]) => (
                            <span key={theme} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-10 font-semibold ${THEME_TONE[theme] ?? "bg-bg-2 text-ink-2"}`}>
                              {THEME_LABEL[theme] ?? theme} <span className="opacity-70">×{arts.length}</span>
                              {corr.themeScores[theme] !== undefined && <span className="opacity-70">· {corr.themeScores[theme]}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                      {corr.summary && <p className="text-11 text-ink-1 leading-relaxed">{corr.summary}</p>}
                      {corr.dismissed.length > 0 && (
                        <div>
                          <button type="button" onClick={() => setDismissedOpen((p) => ({ ...p, [subject]: !p[subject] }))}
                            className="text-10 font-semibold text-ink-3 hover:text-ink-1 flex items-center gap-1">
                            {dismissedOpen[subject] ? "▾" : "▸"} {corr.dismissed.length} excluded article{corr.dismissed.length !== 1 ? "s" : ""} (name-match only)
                          </button>
                          {dismissedOpen[subject] && (
                            <div className="mt-2 space-y-1 pl-3 border-l border-hair-2">
                              {corr.dismissed.map((art, idx) => (
                                <div key={idx} className="text-10 text-ink-3">
                                  <span className="font-mono">{art.date}</span> · <span className="text-ink-2">{art.headline}</span>
                                  {art.source && <span className="text-ink-3"> ({art.source})</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {a && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${RISK_TONE[a.overallRisk]}`}>{a.overallRisk} risk</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${ACTION_TONE[a.recommendedAction]}`}>{a.recommendedAction.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-12 text-ink-1">{a.threatNarrative}</p>
                    {a.topConcerns.length > 0 && <div><div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Top concerns</div><ul className="list-disc list-inside space-y-0.5">{a.topConcerns.map((c, i) => <li key={i} className="text-11 text-ink-1">{c}</li>)}</ul></div>}
                    {a.fatfTypologies.length > 0 && <div><div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">FATF typologies</div><div className="flex flex-wrap gap-1">{a.fatfTypologies.map((t, i) => <span key={i} className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-1">{t}</span>)}</div></div>}
                    {a.regulatoryLinks && <p className="text-10 font-mono text-ink-2">{a.regulatoryLinks}</p>}
                    {a.actionRationale && <p className="text-11 italic text-ink-2">{a.actionRationale}</p>}
                    {a.uaeSpecificRisks.length > 0 && <div><div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">UAE-specific risks</div><ul className="list-disc list-inside space-y-0.5">{a.uaeSpecificRisks.map((r, i) => <li key={i} className="text-11 text-ink-1">{r}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Entries table */}
      {visible.length > 0 && (
        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
          <table className="w-full text-11">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>{["Subject", "Date", "Category", "Severity", "Headline", "Source", "Logged by", ""].map((h) => <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>)}</tr>
            </thead>
            <tbody>
              {visible.map((e, i) => editingId === e.id ? (
                <tr key={e.id} className={i < visible.length - 1 ? "border-b border-hair" : ""}>
                  <td colSpan={8} className="px-3 py-2">
                    <div className="grid grid-cols-4 gap-2 mb-1.5">
                      <input value={editDraft.subject} onChange={setE("subject")} placeholder="Subject" className="text-12 px-2 py-1 rounded border border-brand bg-bg-0 text-ink-0" />
                      <input value={editDraft.headline} onChange={setE("headline")} placeholder="Headline" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 col-span-2" />
                      <input value={editDraft.source} onChange={setE("source")} placeholder="Source" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                    </div>
                    <div className="grid grid-cols-4 gap-2 mb-1.5">
                      <input value={editDraft.articleDate} onChange={setE("articleDate")} placeholder="dd/mm/yyyy" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                      <select value={editDraft.category} onChange={setE("category")} className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">{Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <select value={editDraft.severity} onChange={setE("severity")} className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">{(["critical", "high", "medium", "low", "clear"] as AmSeverity[]).map((s) => <option key={s} value={s}>{s}</option>)}</select>
                      <input value={editDraft.loggedBy} onChange={setE("loggedBy")} placeholder="Logged by" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                    </div>
                    <div className="flex gap-2 items-center">
                      <input value={editDraft.url} onChange={setE("url")} placeholder="URL (optional)" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 w-64" />
                      <button type="button" onClick={() => saveEdit(e.id)} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-11 font-medium px-3 py-1 rounded text-ink-2">Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={e.id} className={i < visible.length - 1 ? "border-b border-hair" : ""}>
                  <td className="px-3 py-2 text-ink-0 font-medium">{e.subject}</td>
                  <td className="px-3 py-2 font-mono text-10 text-ink-2">{e.articleDate}</td>
                  <td className="px-3 py-2 text-ink-2">{CAT_LABELS[e.category]}</td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${SEV_TONE[e.severity]}`}>{e.severity}</span></td>
                  <td className="px-3 py-2 text-ink-1 max-w-[220px] truncate" title={e.headline}>{e.headline}</td>
                  <td className="px-3 py-2 text-ink-2">{e.source || "—"}</td>
                  <td className="px-3 py-2 text-ink-3">{e.loggedBy || "—"}</td>
                  <td className="px-2 py-2 text-right"><RowActions label={`event ${e.id}`} onEdit={() => startEdit(e)} onDelete={() => remove(e.id)} confirmDelete={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length === 0 && entries.length > 0 && <p className="text-12 text-ink-3 text-center py-8">No findings match the current filter.</p>}
      {entries.length === 0 && (
        <div className="text-center py-10 text-ink-3 text-12 mt-4 border border-dashed border-hair-2 rounded-lg">
          No adverse media findings logged yet.<br />
          <span className="text-11">Use the form above to build the 10-year audit trail.</span>
        </div>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = ["📡 Live Search", "📋 10-Year Audit Trail"] as const;
type TabId = typeof TABS[number];

export default function AdverseMediaPage() {
  const [activeTab, setActiveTab] = useState<TabId>("📡 Live Search");

  return (
    <ModuleLayout asanaModule="adverse-media-live" asanaLabel="Adverse Media">
      <ModuleHero
        eyebrow="Module · Adverse Media Intelligence"
        title="Adverse media"
        titleEm="monitor."
        moduleNumber={25}
        intro={
          <>
            <strong>FATF R.10</strong> (ongoing CDD monitoring) · <strong>FDL 10/2025 Art.10</strong> (continuous monitoring) · <strong>Art.19</strong> (10-year lookback).
            Real-time GDELT global news search plus a structured 10-year audit trail with AI risk assessment and cross-correlation scoring.
          </>
        }
        kpis={[
          { value: "GDELT", label: "live news source" },
          { value: "10yr", label: "lookback window" },
          { value: "Art.19", label: "FDL compliance" },
        ]}
      />

      {/* Tab strip */}
      <div className="flex border-b border-hair-2 mb-6 mt-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-12 font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink-1"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "📡 Live Search" && <LiveSearchTab />}
      {activeTab === "📋 10-Year Audit Trail" && <AuditTrailTab />}
    </ModuleLayout>
  );
}
