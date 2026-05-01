"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
import type { CrossCorrelateResult, CrossCorrelateArticle } from "@/app/api/adverse-media/cross-correlate/route";

interface AmAssessment {
  ok: boolean;
  overallRisk: "critical" | "high" | "medium" | "low" | "clear";
  threatNarrative: string;
  topConcerns: string[];
  fatfTypologies: string[];
  regulatoryLinks: string;
  recommendedAction: "file_str" | "edd_required" | "exit_relationship" | "enhanced_monitoring" | "standard_monitoring" | "clear";
  actionRationale: string;
  uaeSpecificRisks: string[];
}

// Adverse Media 10-Year Lookback — FDL 10/2025 Art.19 requires adverse
// media analysis to cover a 10-year window. This module provides a
// structured log of manually verified adverse media findings per subject,
// with year-by-year coverage tracking and gap detection.

type AmSeverity = "critical" | "high" | "medium" | "low" | "clear";
type AmCategory =
  | "fraud_forgery"
  | "law_enforcement"
  | "money_laundering"
  | "sanctions"
  | "proliferation"
  | "corruption"
  | "terrorism"
  | "environmental"
  | "labour"
  | "tax_evasion"
  | "drug_trafficking"
  | "human_trafficking"
  | "cybercrime"
  | "insider_trading"
  | "embezzlement"
  | "regulatory_action"
  | "asset_seizure"
  | "reputational"
  | "insolvency"
  | "data_breach"
  | "market_manipulation"
  | "trade_sanctions"
  | "weapons"
  | "organised_crime"
  | "real_estate_ml"
  | "pf_nuclear"
  | "political_risk"
  | "conflict_minerals"
  | "vasp_crypto"
  | "document_fraud"
  | "extortion"
  | "illegal_mining"
  | "wildlife_crime"
  | "illegal_fishing"
  | "deforestation"
  | "antitrust"
  | "counterfeit"
  | "insurance_fraud"
  | "healthcare_fraud"
  | "procurement_fraud"
  | "piracy"
  | "ngo_misuse"
  | "privacy_gdpr"
  | "bribery_public"
  | "securities_fraud"
  | "ponzi_scheme"
  | "bankruptcy_fraud"
  | "identity_theft"
  | "smuggling"
  | "other";

interface AmEntry {
  id: string;
  subject: string;
  source: string;
  url: string;
  articleDate: string; // dd/mm/yyyy
  category: AmCategory;
  severity: AmSeverity;
  headline: string;
  loggedBy: string;
  loggedAt: string; // ISO
}

const STORAGE = "hawkeye.am-lookback.v1";
const CURRENT_YEAR = new Date().getFullYear();
const LOOKBACK_YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

const CAT_LABELS: Record<AmCategory, string> = {
  fraud_forgery:      "Fraud / Forgery",
  law_enforcement:    "Law Enforcement",
  money_laundering:   "Money Laundering",
  sanctions:          "Sanctions / Watchlist",
  proliferation:      "Proliferation / WMD",
  corruption:         "Corruption / Bribery",
  terrorism:          "Terrorism / TF",
  environmental:      "Environmental Crime",
  labour:             "Labour / Human Rights",
  tax_evasion:        "Tax Evasion / Tax Crime",
  drug_trafficking:   "Drug Trafficking / Narcotics",
  human_trafficking:  "Human Trafficking / Modern Slavery",
  cybercrime:         "Cybercrime / Hacking",
  insider_trading:    "Insider Trading",
  embezzlement:       "Embezzlement / Misappropriation",
  regulatory_action:  "Regulatory Action / Fine",
  asset_seizure:      "Asset Seizure / Confiscation",
  reputational:       "Reputational / Misconduct",
  insolvency:         "Insolvency / Bankruptcy",
  data_breach:        "Data Breach / Privacy Violation",
  market_manipulation:"Market Manipulation / Price Fixing",
  trade_sanctions:    "Trade Sanctions / Export Control",
  weapons:            "Weapons / Arms Trade",
  organised_crime:    "Organised Crime / Racketeering",
  real_estate_ml:     "Real Estate Money Laundering",
  pf_nuclear:         "Nuclear / Radiological / CBRN",
  political_risk:     "Political Risk / State Actors",
  conflict_minerals:  "Conflict Minerals / EOCN",
  vasp_crypto:        "Crypto / Virtual Asset Fraud",
  document_fraud:     "Document Fraud / Identity Theft",
  extortion:          "Extortion / Blackmail",
  illegal_mining:     "Illegal Mining / Extraction",
  wildlife_crime:     "Wildlife Trafficking / CITES",
  illegal_fishing:    "Illegal Fishing / IUU",
  deforestation:      "Deforestation / Forestry Crime",
  antitrust:          "Antitrust / Cartel / Competition",
  counterfeit:        "Counterfeit Goods / IP Crime",
  insurance_fraud:    "Insurance Fraud",
  healthcare_fraud:   "Healthcare / Pharmaceutical Fraud",
  procurement_fraud:  "Construction / Procurement Fraud",
  piracy:             "Maritime Piracy / Smuggling",
  ngo_misuse:         "NGO / Charity Misuse",
  privacy_gdpr:       "Privacy / GDPR / Data Protection",
  bribery_public:     "Public Official Bribery / FCPA",
  securities_fraud:   "Securities Fraud / Capital Markets",
  ponzi_scheme:       "Ponzi / Pyramid Scheme",
  bankruptcy_fraud:   "Bankruptcy / Creditor Fraud",
  identity_theft:     "Identity Theft / Impersonation",
  smuggling:          "Smuggling / Customs Fraud",
  other:              "Other",
};

const SEV_TONE: Record<AmSeverity, string> = {
  critical: "bg-red-dim text-red",
  high: "bg-orange-dim text-orange",
  medium: "bg-amber-dim text-amber",
  low: "bg-blue-dim text-blue",
  clear: "bg-green-dim text-green",
};

function load(): AmEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as AmEntry[]) : [];
  } catch { return []; }
}

function save(rows: AmEntry[]) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(rows)); } catch { /* */ }
}

/** "dd/mm/yyyy" → year number */
function yearOf(dmy: string): number | null {
  const m = dmy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? parseInt(m[3]!, 10) : null;
}

const BLANK = {
  subject: "", source: "", url: "", articleDate: "", category: "law_enforcement" as AmCategory,
  severity: "medium" as AmSeverity, headline: "", loggedBy: "",
};

const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0";

const RISK_TONE: Record<AmAssessment["overallRisk"], string> = {
  critical: "bg-red-dim text-red",
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  low: "bg-green-dim text-green",
  clear: "bg-green-dim text-green",
};

const ACTION_TONE: Record<AmAssessment["recommendedAction"], string> = {
  file_str: "bg-red-dim text-red",
  edd_required: "bg-red-dim text-red",
  exit_relationship: "bg-red-dim text-red",
  enhanced_monitoring: "bg-amber-dim text-amber",
  standard_monitoring: "bg-blue-dim text-blue",
  clear: "bg-green-dim text-green",
};

export default function AdverseMediaLookbackPage() {
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

  useEffect(() => { setEntries(load()); }, []);

  const assessSubject = async (subject: string) => {
    if (assessing[subject]) return;
    setAssessing((prev) => ({ ...prev, [subject]: true }));
    try {
      const subjectEntries = entries
        .filter((e) => e.subject === subject)
        .map((e) => ({
          headline: e.headline,
          category: CAT_LABELS[e.category] ?? e.category,
          severity: e.severity,
          source: e.source,
          articleDate: e.articleDate,
        }));
      const res = await fetch("/api/adverse-media-assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, entries: subjectEntries }),
      });
      if (res.ok) {
        const data = (await res.json()) as AmAssessment;
        setAssessment((prev) => ({ ...prev, [subject]: data }));
      }
    } catch { /* non-fatal */ } finally {
      setAssessing((prev) => ({ ...prev, [subject]: false }));
    }
  };

  const crossCorrelateSubject = async (subject: string) => {
    if (correlating[subject]) return;
    setCorrelating((prev) => ({ ...prev, [subject]: true }));
    try {
      const articles: CrossCorrelateArticle[] = entries
        .filter((e) => e.subject === subject)
        .map((e) => ({
          source: e.source || "Unknown",
          headline: e.headline,
          date: e.articleDate,
          snippet: `Category: ${CAT_LABELS[e.category] ?? e.category}. Severity: ${e.severity}.${e.url ? ` URL: ${e.url}` : ""}`,
        }));
      const res = await fetch("/api/adverse-media/cross-correlate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject, articles }),
      });
      if (res.ok) {
        const data = (await res.json()) as CrossCorrelateResult;
        setCorrelations((prev) => ({ ...prev, [subject]: data }));
      }
    } catch { /* non-fatal */ } finally {
      setCorrelating((prev) => ({ ...prev, [subject]: false }));
    }
  };

  const set = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  const setE = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditDraft((d) => ({ ...d, [k]: e.target.value }));

  const add = () => {
    if (!draft.subject || !draft.headline || !draft.articleDate) return;
    const entry: AmEntry = {
      ...draft,
      id: `am-${Date.now()}`,
      loggedAt: new Date().toISOString(),
    };
    const next = [entry, ...entries];
    save(next);
    setEntries(next);
    setDraft(BLANK);
  };

  const remove = (id: string) => {
    const next = entries.filter((e) => e.id !== id);
    save(next);
    setEntries(next);
  };

  const startEdit = (e: AmEntry) => {
    setEditingId(e.id);
    setEditDraft({ subject: e.subject, source: e.source, url: e.url, articleDate: e.articleDate, category: e.category, severity: e.severity, headline: e.headline, loggedBy: e.loggedBy });
  };

  const saveEntryEdit = (id: string) => {
    const next = entries.map((e) => e.id !== id ? e : { ...e, ...editDraft });
    save(next);
    setEntries(next);
    setEditingId(null);
  };

  const visible = filterSubject
    ? entries.filter((e) => e.subject.toLowerCase().includes(filterSubject.toLowerCase()))
    : entries;

  // Coverage map: for visible/filtered subject, which years have entries?
  const subjects = Array.from(new Set(entries.map((e) => e.subject)));
  const selectedSubject = filterSubject
    ? entries.find((e) => e.subject.toLowerCase().includes(filterSubject.toLowerCase()))?.subject ?? null
    : null;

  const coverageYears = new Set(
    (selectedSubject
      ? entries.filter((e) => e.subject === selectedSubject)
      : entries
    ).map((e) => yearOf(e.articleDate)).filter(Boolean) as number[],
  );

  return (
    <ModuleLayout asanaModule="adverse-media-lookback" asanaLabel="Adverse Media Lookback">
        <ModuleHero
          moduleNumber={29}
          eyebrow="Module 21 · Historical Adverse Media"
          title="Adverse media"
          titleEm="lookback."
          intro={
            <>
              <strong>10-year window per FDL 10/2025 Art.19.</strong> Every
              adverse media finding manually verified by an analyst is logged
              here with source, date, and severity. Year-by-year coverage
              tracks gaps in the lookback so auditors can verify the full
              10-year horizon was reviewed.
            </>
          }
          kpis={[
            { value: String(entries.length), label: "entries logged" },
            { value: String(subjects.length), label: "subjects covered" },
            {
              value: String(entries.filter((e) => e.severity === "critical" || e.severity === "high").length),
              label: "high / critical",
              tone: entries.some((e) => e.severity === "critical" || e.severity === "high") ? "red" : undefined,
            },
          ]}
        />

        {/* 10-year coverage heatmap */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6">
          <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
            10-year coverage {selectedSubject ? `— ${selectedSubject}` : "(all subjects)"}
          </div>
          <div className="flex gap-1 flex-wrap">
            {LOOKBACK_YEARS.map((y) => {
              const hasData = coverageYears.has(y);
              return (
                <div key={y}
                  className={`flex flex-col items-center px-3 py-2 rounded text-center min-w-[52px] ${
                    hasData ? "bg-green-dim text-green" : "bg-red-dim text-red"
                  }`}>
                  <span className="font-mono text-11 font-semibold">{y}</span>
                  <span className="font-mono text-9 mt-0.5">{hasData ? "covered" : "gap"}</span>
                </div>
              );
            })}
          </div>
          <p className="text-10 text-ink-3 mt-2">
            Gaps indicate years with no logged findings. Document "no adverse media found" explicitly for each gap year to satisfy Art.19 audit trail requirements.
          </p>
        </div>

        {/* Log new entry */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-4">
          <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
            Log new finding
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input value={draft.subject} onChange={set("subject")}
              placeholder="Subject name" className={inputCls} />
            <input value={draft.headline} onChange={set("headline")}
              placeholder="Article headline" className={inputCls} />
            <input value={draft.source} onChange={set("source")}
              placeholder="Source (e.g. Reuters)" className={inputCls} />
          </div>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <input value={draft.articleDate} onChange={set("articleDate")}
              placeholder="Article date dd/mm/yyyy" className={inputCls} />
            <select value={draft.category} onChange={set("category")} className={inputCls}>
              {Object.entries(CAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={draft.severity} onChange={set("severity")} className={inputCls}>
              {(["critical", "high", "medium", "low", "clear"] as AmSeverity[]).map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <input value={draft.loggedBy} onChange={set("loggedBy")}
              placeholder="Logged by (analyst name)" className={inputCls} />
          </div>
          <div className="mb-2">
            <input value={draft.url} onChange={set("url")}
              placeholder="URL / reference (optional)" className={`${inputCls}`} />
          </div>
          <button type="button" onClick={add}
            disabled={!draft.subject || !draft.headline || !draft.articleDate}
            className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
            + Log finding
          </button>
        </div>

        {/* Filter */}
        <div className="mt-4 flex gap-2 items-center">
          <input value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}
            placeholder="Filter by subject name…"
            className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 w-64" />
          {filterSubject && (
            <button type="button" onClick={() => setFilterSubject("")}
              className="text-11 text-ink-3 hover:text-ink-0">clear</button>
          )}
          <span className="text-11 text-ink-3 ml-auto">{visible.length} finding{visible.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Per-subject AI Assessment */}
        {subjects.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">
              AI threat assessment per subject
            </div>
            {subjects.map((subject) => {
              const a = assessment[subject];
              const isAssessing = assessing[subject] === true;
              const corr = correlations[subject];
              const isCorrelating = correlating[subject] === true;
              const subjectCount = entries.filter((e) => e.subject === subject).length;
              const isDismissedOpen = dismissedOpen[subject] === true;

              const THEME_TONE: Record<string, string> = {
                fraud: "bg-red-dim text-red",
                sanctions: "bg-red-dim text-red",
                corruption: "bg-red-dim text-red",
                money_laundering: "bg-amber-dim text-amber",
                terrorism: "bg-red-dim text-red",
                regulatory: "bg-blue-dim text-blue",
              };
              const THEME_LABEL: Record<string, string> = {
                fraud: "Fraud",
                sanctions: "Sanctions",
                corruption: "Corruption",
                money_laundering: "ML",
                terrorism: "Terrorism",
                regulatory: "Regulatory",
              };
              const TREND_ICON: Record<string, string> = {
                worsening: "↑",
                stable: "→",
                improving: "↓",
              };
              const TREND_TONE: Record<string, string> = {
                worsening: "text-red",
                stable: "text-amber",
                improving: "text-green",
              };
              const RECOM_TONE: Record<string, string> = {
                Clear: "bg-green-dim text-green",
                Monitor: "bg-blue-dim text-blue",
                EDD: "bg-amber-dim text-amber",
                "Exit Relationship": "bg-red-dim text-red",
                "File STR": "bg-red-dim text-red",
              };
              const scoreColor = corr
                ? corr.score < 30
                  ? "text-green"
                  : corr.score <= 60
                  ? "text-amber"
                  : "text-red"
                : "";

              return (
                <div key={subject} className="bg-bg-panel border border-hair-2 rounded-lg p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-12 font-semibold text-ink-0">{subject}</span>
                    <span className="text-10 text-ink-3 font-mono">{subjectCount} finding{subjectCount !== 1 ? "s" : ""}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isCorrelating}
                        onClick={() => void crossCorrelateSubject(subject)}
                        className="text-11 font-semibold px-3 py-1 rounded border border-hair-2 bg-bg-1 text-ink-1 hover:bg-bg-2 disabled:opacity-40"
                      >
                        {isCorrelating ? "Correlating…" : "🔗 Cross-Correlate & Score"}
                      </button>
                      <button
                        type="button"
                        disabled={isAssessing}
                        onClick={() => void assessSubject(subject)}
                        className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40"
                      >
                        {isAssessing ? "Assessing…" : "AI Assess"}
                      </button>
                    </div>
                  </div>

                  {/* Cross-Correlate Result Panel */}
                  {corr && (
                    <div className="mt-3 border border-hair-2 rounded-lg overflow-hidden">
                      <div className="bg-bg-1 px-3 py-2 border-b border-hair-2 flex items-center gap-3 flex-wrap">
                        <span className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2">Cross-Correlate Score</span>
                        {/* Large score */}
                        <span className={`font-mono text-24 font-bold leading-none ${scoreColor}`}>{corr.score}</span>
                        <span className="text-10 text-ink-3 font-mono">/100</span>
                        {/* Trend */}
                        <span className={`font-mono text-16 font-bold ${TREND_TONE[corr.trend] ?? "text-ink-2"}`}>
                          {TREND_ICON[corr.trend] ?? "→"} {corr.trend}
                        </span>
                        {/* Recommendation badge */}
                        <span className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded font-mono text-11 font-bold uppercase ${RECOM_TONE[corr.recommendation] ?? "bg-bg-2 text-ink-2"}`}>
                          {corr.recommendation}
                        </span>
                      </div>

                      <div className="px-3 py-3 space-y-3">
                        {/* Confirmed / dismissed counts */}
                        <div className="flex gap-4 text-11 font-mono">
                          <span className="text-green font-semibold">{corr.confirmed.length} confirmed</span>
                          <span className="text-ink-3">{corr.dismissed.length} dismissed</span>
                        </div>

                        {/* Theme breakdown */}
                        {Object.keys(corr.themes).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(corr.themes)
                              .filter(([, arts]) => arts.length > 0)
                              .map(([theme, arts]) => (
                                <span key={theme} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-10 font-semibold ${THEME_TONE[theme] ?? "bg-bg-2 text-ink-2"}`}>
                                  {THEME_LABEL[theme] ?? theme}
                                  <span className="opacity-70">×{arts.length}</span>
                                  {corr.themeScores[theme] !== undefined && (
                                    <span className="opacity-70">· {corr.themeScores[theme]}</span>
                                  )}
                                </span>
                              ))}
                          </div>
                        )}

                        {/* Summary */}
                        {corr.summary && (
                          <p className="text-11 text-ink-1 leading-relaxed">{corr.summary}</p>
                        )}

                        {/* Dismissed articles (collapsed) */}
                        {corr.dismissed.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setDismissedOpen((prev) => ({ ...prev, [subject]: !prev[subject] }))}
                              className="text-10 font-semibold text-ink-3 hover:text-ink-1 flex items-center gap-1"
                            >
                              {isDismissedOpen ? "▾" : "▸"} {corr.dismissed.length} excluded article{corr.dismissed.length !== 1 ? "s" : ""} (name-match only)
                            </button>
                            {isDismissedOpen && (
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
                      {/* Risk + Action badges */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${RISK_TONE[a.overallRisk]}`}>
                          {a.overallRisk} risk
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${ACTION_TONE[a.recommendedAction]}`}>
                          {a.recommendedAction.replace(/_/g, " ")}
                        </span>
                      </div>
                      {/* Threat narrative */}
                      <p className="text-12 text-ink-1">{a.threatNarrative}</p>
                      {/* Top concerns */}
                      {a.topConcerns.length > 0 && (
                        <div>
                          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Top concerns</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {a.topConcerns.map((c, idx) => (
                              <li key={idx} className="text-11 text-ink-1">{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* FATF typologies */}
                      {a.fatfTypologies.length > 0 && (
                        <div>
                          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">FATF typologies</div>
                          <div className="flex flex-wrap gap-1">
                            {a.fatfTypologies.map((t, idx) => (
                              <span key={idx} className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-1">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Regulatory links */}
                      {a.regulatoryLinks && (
                        <p className="text-10 font-mono text-ink-2">{a.regulatoryLinks}</p>
                      )}
                      {/* Action rationale */}
                      {a.actionRationale && (
                        <p className="text-11 italic text-ink-2">{a.actionRationale}</p>
                      )}
                      {/* UAE-specific risks */}
                      {a.uaeSpecificRisks.length > 0 && (
                        <div>
                          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">UAE-specific risks</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {a.uaeSpecificRisks.map((r, idx) => (
                              <li key={idx} className="text-11 text-ink-1">{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Entries table */}
        {visible.length > 0 && (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mt-2">
            <table className="w-full text-11">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["Subject", "Date", "Category", "Severity", "Headline", "Source", "Logged by", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((e, i) => (
                  editingId === e.id ? (
                    <tr key={e.id} className={i < visible.length - 1 ? "border-b border-hair" : ""}>
                      <td colSpan={8} className="px-3 py-2">
                        <div className="grid grid-cols-4 gap-2 mb-1.5">
                          <input value={editDraft.subject} onChange={setE("subject")} placeholder="Subject" className="text-12 px-2 py-1 rounded border border-brand bg-bg-0 text-ink-0" />
                          <input value={editDraft.headline} onChange={setE("headline")} placeholder="Headline" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 col-span-2" />
                          <input value={editDraft.source} onChange={setE("source")} placeholder="Source" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-1.5">
                          <input value={editDraft.articleDate} onChange={setE("articleDate")} placeholder="dd/mm/yyyy" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                          <select value={editDraft.category} onChange={setE("category")} className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">
                            {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <select value={editDraft.severity} onChange={setE("severity")} className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">
                            {(["critical", "high", "medium", "low", "clear"] as AmSeverity[]).map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <input value={editDraft.loggedBy} onChange={setE("loggedBy")} placeholder="Logged by" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                        </div>
                        <div className="flex gap-2 items-center">
                          <input value={editDraft.url} onChange={setE("url")} placeholder="URL (optional)" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 w-64" />
                          <button type="button" onClick={() => saveEntryEdit(e.id)} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">Save</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-11 font-medium px-3 py-1 rounded text-ink-2">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                  <tr key={e.id} className={i < visible.length - 1 ? "border-b border-hair" : ""}>
                    <td className="px-3 py-2 text-ink-0 font-medium">{e.subject}</td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2">{e.articleDate}</td>
                    <td className="px-3 py-2 text-ink-2">{CAT_LABELS[e.category]}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${SEV_TONE[e.severity]}`}>
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-1 max-w-[220px] truncate" title={e.headline}>{e.headline}</td>
                    <td className="px-3 py-2 text-ink-2">{e.source || "—"}</td>
                    <td className="px-3 py-2 text-ink-3">{e.loggedBy || "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <RowActions
                        label={`event ${e.id}`}
                        onEdit={() => startEdit(e)}
                        onDelete={() => remove(e.id)}
                        confirmDelete={false}
                      />
                    </td>
                  </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}

        {visible.length === 0 && entries.length > 0 && (
          <p className="text-12 text-ink-3 text-center py-8">No findings match the current filter.</p>
        )}

        {entries.length === 0 && (
          <div className="text-center py-10 text-ink-3 text-12 mt-4 border border-dashed border-hair-2 rounded-lg">
            No adverse media findings logged yet.<br />
            <span className="text-11">Use the form above to start building the 10-year audit trail.</span>
          </div>
        )}
    </ModuleLayout>
  );
}
