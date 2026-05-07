"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { EwraBoardReportResult } from "@/app/api/ewra-report/route";
import type { ThreatIntelResult } from "@/app/api/ewra/threat-intel/route";
import { openReportWindow } from "@/lib/reportOpen";

// Entity-Wide Risk Assessment (EWRA) / Business-Wide Risk Assessment (BWRA)
// Required annually under FDL 10/2025 Art.4 and FATF R.1.
// Five risk dimensions scored 1–5 for inherent risk; controls effectiveness
// rated 1–5; residual risk = inherent − controls reduction.

interface RiskDimension {
  id: string;
  dimension: string;
  description: string;
  inherent: number; // 1–5
  controls: number; // 1–5 (effectiveness of mitigants)
  notes: string;
}

interface EwraState {
  dimensions: RiskDimension[];
  lastApproved: string; // dd/mm/yyyy
  approvedBy: string;
  nextReview: string; // dd/mm/yyyy
  boardMinutes: string;
  unit: string;
}

const STORAGE = "hawkeye.ewra.v1";
const HISTORY_STORAGE = "hawkeye.ewra.history.v1";
const MAX_HISTORY = 5;

const DEFAULT_DIMENSIONS: RiskDimension[] = [
  {
    id: "customers",
    dimension: "Customer Base",
    description: "PEP exposure, high-risk nationals, shell-company clients, DNFBP counterparties",
    inherent: 4, controls: 3, notes: "",
  },
  {
    id: "products",
    dimension: "Products & Services",
    description: "Physical gold trading, DPMS retail, refining, bullion storage, wire transfers",
    inherent: 4, controls: 3, notes: "",
  },
  {
    id: "geography",
    dimension: "Geographic Exposure",
    description: "CAHRA jurisdictions, FATF grey-list countries, sanctioned regimes, transit routes",
    inherent: 4, controls: 3, notes: "",
  },
  {
    id: "channels",
    dimension: "Delivery Channels",
    description: "Cash transactions, virtual assets, correspondent relationships, third-party payments",
    inherent: 3, controls: 3, notes: "",
  },
  {
    id: "transactions",
    dimension: "Transaction Types",
    description: "Cross-border wires, trade finance, bulk cash, high-value single transactions",
    inherent: 4, controls: 3, notes: "",
  },
  {
    id: "tbml",
    dimension: "TBML / Trade Finance",
    description: "Over/under-invoicing, phantom shipments, complex intermediary chains",
    inherent: 4, controls: 2, notes: "",
  },
  {
    id: "pf",
    dimension: "Proliferation Financing",
    description: "Dual-use goods, DPRK/Iran nexus, UN Security Council sanctions exposure",
    inherent: 3, controls: 3, notes: "",
  },
  {
    id: "staff",
    dimension: "Internal Controls & Staff",
    description: "Training currency, segregation of duties, MLRO independence, IT system resilience",
    inherent: 2, controls: 4, notes: "",
  },
];

const DEFAULT_STATE: EwraState = {
  dimensions: DEFAULT_DIMENSIONS,
  lastApproved: "",
  approvedBy: "",
  nextReview: "",
  boardMinutes: "",
  unit: "",
};

function load(): EwraState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as EwraState) : DEFAULT_STATE;
  } catch { return DEFAULT_STATE; }
}

function save(s: EwraState) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(s)); } catch { /* */ }
}

interface EwraSnapshot {
  id: string;
  timestamp: string; // ISO
  overallResidual: number;
  overallInherent: number;
  keyChanges: string[];
  dimensions: Array<{ id: string; dimension: string; inherent: number; controls: number }>;
}

function loadHistory(): EwraSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE);
    return raw ? (JSON.parse(raw) as EwraSnapshot[]) : [];
  } catch { return []; }
}

function saveSnapshot(s: EwraState, overallInherent: number, overallResidual: number, keyChanges: string[]) {
  try {
    const history = loadHistory();
    const snap: EwraSnapshot = {
      id: `ewra-snap-${Date.now()}`,
      timestamp: new Date().toISOString(),
      overallResidual,
      overallInherent,
      keyChanges,
      dimensions: s.dimensions.map((d) => ({ id: d.id, dimension: d.dimension, inherent: d.inherent, controls: d.controls })),
    };
    const next = [snap, ...history].slice(0, MAX_HISTORY);
    window.localStorage.setItem(HISTORY_STORAGE, JSON.stringify(next));
  } catch { /* */ }
}

function residual(d: RiskDimension): number {
  return Math.max(1, Math.round(d.inherent - (d.controls - 1) * 0.75));
}

const RISK_LABEL: Record<number, string> = { 1: "Very Low", 2: "Low", 3: "Medium", 4: "High", 5: "Critical" };
const RISK_TONE = (score: number) =>
  score >= 4 ? "bg-red-dim text-red" :
  score === 3 ? "bg-amber-dim text-amber" :
  "bg-green-dim text-green";

const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0";

function ScoreSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`w-7 h-7 rounded text-11 font-semibold font-mono border transition-colors ${
            value === n
              ? n >= 4 ? "bg-red text-white border-red"
                : n === 3 ? "bg-amber text-white border-amber"
                : "bg-green text-white border-green"
              : "border-hair-2 text-ink-2 hover:bg-bg-2"
          }`}>
          {n}
        </button>
      ))}
    </div>
  );
}

const RISK_OVERALL: Record<number, EwraBoardReportResult["overallRisk"]> = {
  1: "low", 2: "low", 3: "medium", 4: "high", 5: "critical",
};

export default function EwraPage() {
  const [state, setState] = useState<EwraState>(DEFAULT_STATE);
  const [boardReport, setBoardReport] = useState<EwraBoardReportResult | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);

  // Threat intel state
  const [threatIntel, setThreatIntel] = useState<ThreatIntelResult | null>(null);
  const [threatLoading, setThreatLoading] = useState(false);
  const [threatError, setThreatError] = useState<string | null>(null);
  const [threatOpen, setThreatOpen] = useState(false);

  // Version history state
  const [history, setHistory] = useState<EwraSnapshot[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => { setState(load()); setHistory(loadHistory()); }, []);

  const update = (updated: EwraState) => { setState(updated); save(updated); };

  const runThreatIntel = async () => {
    setThreatLoading(true);
    setThreatError(null);
    try {
      const res = await fetch("/api/ewra/threat-intel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sector: "Precious Metals / DPMS",
          jurisdiction: state.unit ? `UAE — ${state.unit}` : "UAE",
          reportingPeriod: state.lastApproved
            ? state.lastApproved
            : new Date().getFullYear().toString(),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string } & ThreatIntelResult;
      if (!data.ok) { setThreatError(data.error ?? "Threat intel generation failed"); return; }
      setThreatIntel(data);
      setThreatOpen(true);
    } catch {
      setThreatError("Network error — try again");
    } finally {
      setThreatLoading(false);
    }
  };

  const captureSnapshot = (keyChanges: string[] = []) => {
    const inh = Math.round(state.dimensions.reduce((a, d) => a + d.inherent, 0) / state.dimensions.length);
    const res = Math.round(state.dimensions.reduce((a, d) => a + residual(d), 0) / state.dimensions.length);
    saveSnapshot(state, inh, res, keyChanges);
    setHistory(loadHistory());
  };

  const runBoardReport = async () => {
    setBoardLoading(true);
    setBoardError(null);
    try {
      const res = await fetch("/api/ewra-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dimensions: state.dimensions.map((d) => ({
            dimension: d.dimension,
            inherent: d.inherent,
            controls: d.controls,
            notes: d.notes,
          })),
          institutionName: "Hawkeye Sterling DPMS",
          reportingPeriod: new Date().getFullYear().toString(),
          context: `Last approved: ${state.lastApproved || "not recorded"}. Approved by: ${state.approvedBy || "pending"}. Board minutes ref: ${state.boardMinutes || "none"}.`,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      // Read body once — Lambda 502 returns HTML; we surface a clean error
      // rather than the raw "Unexpected token <" parse failure.
      const raw = await res.text().catch(() => "");
      const isHtml = raw.trimStart().toLowerCase().startsWith("<");
      if (!res.ok || isHtml) {
        setBoardError(
          res.status === 503
            ? "Board-report service temporarily unavailable. Set ANTHROPIC_API_KEY on the deployment, or retry in a moment."
            : isHtml
              ? `Board-report server returned HTML (HTTP ${res.status}) — likely a Netlify 502 / function timeout. Please retry.`
              : `Board-report failed (HTTP ${res.status}). Please retry.`,
        );
        return;
      }
      let data: { ok: boolean; error?: string } & EwraBoardReportResult;
      try { data = JSON.parse(raw); }
      catch { setBoardError("Board-report returned a malformed response. Please retry."); return; }
      if (!data.ok) { setBoardError(data.error ?? "Report generation failed"); return; }
      setBoardReport(data);
      setBoardOpen(true);
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      setBoardError(isTimeout
        ? "Board-report timed out after 60s — please retry."
        : `Network error — ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setBoardLoading(false);
    }
  };

  const updateDim = (id: string, patch: Partial<RiskDimension>) => {
    update({
      ...state,
      dimensions: state.dimensions.map((d) => d.id === id ? { ...d, ...patch } : d),
    });
  };

  const overallInherent = Math.round(
    state.dimensions.reduce((a, d) => a + d.inherent, 0) / state.dimensions.length,
  );
  const overallResidual = Math.round(
    state.dimensions.reduce((a, d) => a + residual(d), 0) / state.dimensions.length,
  );
  const highRiskCount = state.dimensions.filter((d) => residual(d) >= 4).length;

  return (
    <ModuleLayout asanaModule="ewra" asanaLabel="Enterprise-Wide Risk Assessment">
        <ModuleHero
          moduleNumber={20}
          eyebrow="Module 23 · Risk Assessment"
          title="EWRA / BWRA"
          titleEm="dashboard."
          intro={
            <>
              <strong>Entity-Wide & Business-Wide Risk Assessment.</strong>{" "}
              Annual requirement under FDL 10/2025 Art.4 and FATF R.1. Score
              inherent risk per dimension (1–5), rate control effectiveness,
              and derive residual risk. Board reviews and approves annually.
            </>
          }
          kpis={[
            {
              value: RISK_LABEL[overallInherent] ?? String(overallInherent),
              label: "inherent risk",
              tone: overallInherent >= 4 ? "red" : overallInherent === 3 ? "amber" : undefined,
            },
            {
              value: RISK_LABEL[overallResidual] ?? String(overallResidual),
              label: "residual risk",
              tone: overallResidual >= 4 ? "red" : overallResidual === 3 ? "amber" : undefined,
            },
            {
              value: String(highRiskCount),
              label: "high / critical dimensions",
              tone: highRiskCount > 0 ? "red" : undefined,
            },
          ]}
        />

        {/* AI Board Report button */}
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => { void runBoardReport(); }}
            disabled={boardLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-50 transition-colors"
          >
            {boardLoading ? (
              <>
                <span className="animate-spin font-mono">◌</span>
                Generating…
              </>
            ) : (
              <>
                <span>✦</span>
                Generate AI Board Report
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => { void runThreatIntel(); }}
            disabled={threatLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded border border-hair-2 bg-bg-panel text-ink-1 text-12 font-semibold hover:bg-bg-2 disabled:opacity-50 transition-colors"
          >
            {threatLoading ? (
              <>
                <span className="animate-spin font-mono">◌</span>
                Loading…
              </>
            ) : (
              <>
                <span>🌐</span>
                Inject Threat Intelligence
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => { captureSnapshot(["Manual snapshot"]); setHistoryOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded border border-hair-2 bg-bg-panel text-ink-2 text-12 font-medium hover:bg-bg-2 transition-colors"
          >
            <span>🕓</span>
            Save Snapshot
          </button>
          {boardReport && !boardOpen && (
            <button
              type="button"
              onClick={() => setBoardOpen(true)}
              className="text-11 text-brand underline font-medium"
            >
              View last report ↗
            </button>
          )}
          {threatIntel && !threatOpen && (
            <button
              type="button"
              onClick={() => setThreatOpen(true)}
              className="text-11 text-ink-1 underline font-medium"
            >
              View threat intel ↗
            </button>
          )}
          {boardError && (
            <span className="text-11 text-red">{boardError}</span>
          )}
          {threatError && (
            <span className="text-11 text-red">{threatError}</span>
          )}
        </div>

        {/* Board Report Panel */}
        {boardOpen && boardReport && (
          <div className="mt-4 bg-bg-panel border border-brand/30 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-hair-2 bg-brand-dim">
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-brand">✦ AI Board Report · FDL 10/2025 Art.4</div>
                <div className="text-13 font-bold text-ink-0 mt-0.5">Enterprise-Wide Risk Assessment — Board Narrative</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-sm font-mono text-11 font-bold uppercase ${
                  boardReport.overallRisk === "critical" ? "bg-red text-white" :
                  boardReport.overallRisk === "high" ? "bg-red-dim text-red" :
                  boardReport.overallRisk === "medium" ? "bg-amber-dim text-amber" :
                  "bg-green-dim text-green"
                }`}>
                  {boardReport.overallRisk} risk
                </span>
                <button type="button" onClick={() => setBoardOpen(false)} className="text-ink-3 hover:text-ink-0 text-16 px-1">✕</button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Executive Summary */}
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Executive Summary</div>
                <p className="text-12 text-ink-1 leading-relaxed whitespace-pre-wrap">{boardReport.executiveSummary}</p>
              </div>

              {/* Key Findings */}
              {boardReport.keyFindings?.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Key Findings</div>
                  <ul className="space-y-1.5">
                    {boardReport.keyFindings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-12 text-ink-1">
                        <span className="text-brand font-mono shrink-0">•</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dimension Narratives */}
              {boardReport.dimensionNarratives?.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Dimension Narratives</div>
                  <div className="space-y-3">
                    {boardReport.dimensionNarratives.map((dn, i) => (
                      <div key={i} className="border border-hair-2 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-12 font-semibold text-ink-0">{dn.dimension}</div>
                          <div className="flex gap-2">
                            <span className="text-10 font-mono px-1.5 py-px rounded bg-bg-2 text-ink-2">Inherent: {dn.inherentRisk}</span>
                            <span className="text-10 font-mono px-1.5 py-px rounded bg-bg-2 text-ink-2">Residual: {dn.residualRisk}</span>
                          </div>
                        </div>
                        <p className="text-11 text-ink-1 mb-2">{dn.narrative}</p>
                        {dn.controlGaps?.length > 0 && (
                          <div className="text-10 text-red font-semibold mb-1">Control gaps:</div>
                        )}
                        {dn.controlGaps?.map((g, j) => (
                          <div key={j} className="text-11 text-red ml-2">• {g}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Board Recommendations */}
              {boardReport.boardRecommendations?.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Board Recommendations</div>
                  <ol className="space-y-1.5 list-decimal pl-5">
                    {boardReport.boardRecommendations.map((r, i) => (
                      <li key={i} className="text-12 text-ink-1">{r}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Regulatory Context */}
              {boardReport.regulatoryContext && (
                <div className="bg-bg-1 border border-hair-2 rounded p-3">
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1.5">Regulatory Context</div>
                  <p className="text-11 text-ink-2 leading-relaxed">{boardReport.regulatoryContext}</p>
                </div>
              )}

              {/* Approval Statement */}
              {boardReport.approvalStatement && (
                <div className="bg-brand-dim border border-brand/20 rounded p-3">
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-brand mb-1.5">Approval Statement</div>
                  <p className="text-11 text-ink-1 leading-relaxed">{boardReport.approvalStatement}</p>
                </div>
              )}

              {/* Next Steps */}
              {boardReport.nextSteps?.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Next Steps</div>
                  <ul className="space-y-1">
                    {boardReport.nextSteps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-12 text-ink-1">
                        <span className="font-mono text-10 text-brand shrink-0 mt-0.5">{i + 1}.</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-hair-2 bg-bg-panel flex justify-between items-center">
              <span className="text-10 text-ink-3 font-mono">Draft narrative — MLRO review required before Board presentation</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openReportWindow("/api/ewra-board-report", { boardReport, dimensions: state.dimensions })}
                  className="text-11 font-mono"
                  style={{ color: "#7c3aed", fontWeight: 600 }}
                >
                  PDF
                </button>
                <button
                type="button"
                onClick={() => {
                  const text = [
                    `EWRA BOARD REPORT — ${new Date().toLocaleDateString("en-GB")}`,
                    `Overall Risk: ${boardReport.overallRisk.toUpperCase()}`,
                    "",
                    "EXECUTIVE SUMMARY",
                    boardReport.executiveSummary,
                    "",
                    "BOARD RECOMMENDATIONS",
                    ...(boardReport.boardRecommendations?.map((r, i) => `${i + 1}. ${r}`) ?? []),
                    "",
                    boardReport.approvalStatement,
                  ].join("\n");
                  void navigator.clipboard.writeText(text);
                }}
                className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2 transition-colors"
              >
                Copy to clipboard
              </button>
              </div>
            </div>
          </div>
        )}

        {/* Threat Intel Panel */}
        {threatOpen && threatIntel && (
          <div className="mt-4 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-hair-2 bg-bg-1">
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2">🌐 Threat Intelligence · Auto-Inject</div>
                <div className="text-13 font-bold text-ink-0 mt-0.5">Current ML/TF Typologies & Regulatory Changes</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-10 font-mono text-ink-3">
                  {new Date(threatIntel.generatedAt).toLocaleString("en-GB")}
                </span>
                <button type="button" onClick={() => setThreatOpen(false)} className="text-ink-3 hover:text-ink-0 text-16 px-1">✕</button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Active Typologies */}
              {threatIntel.typologies?.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Active ML/TF Typologies</div>
                  <div className="grid grid-cols-1 gap-3">
                    {threatIntel.typologies.map((t, i) => (
                      <div key={i} className="border border-hair-2 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-12 font-semibold text-ink-0">{t.name}</span>
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded font-mono text-10 font-bold ml-auto ${
                            t.trend === "rising" ? "bg-red-dim text-red" :
                            t.trend === "stable" ? "bg-amber-dim text-amber" :
                            "bg-green-dim text-green"
                          }`}>
                            {t.trend === "rising" ? "↑" : t.trend === "stable" ? "→" : "↓"} {t.trend}
                          </span>
                        </div>
                        <p className="text-11 text-ink-2 mb-1.5">{t.description}</p>
                        {t.fatfRef && (
                          <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-3">{t.fatfRef}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regulatory Changes Timeline */}
              {threatIntel.regulatoryChanges?.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Regulatory Changes (last 90 days)</div>
                  <div className="relative pl-5">
                    <div className="absolute left-1.5 top-1 bottom-1 w-px bg-hair-2" />
                    {threatIntel.regulatoryChanges.map((rc, i) => (
                      <div key={i} className="relative mb-4 last:mb-0">
                        <div className="absolute -left-3.5 top-1 w-2 h-2 rounded-full bg-brand" />
                        <div className="font-mono text-10 text-brand mb-0.5">{rc.effectiveDate}</div>
                        <div className="text-12 font-semibold text-ink-0 mb-0.5">{rc.change}</div>
                        <div className="text-11 text-ink-2">{rc.impact}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Score Adjustment Suggestions */}
              {threatIntel.scoreAdjustments?.length > 0 && (
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Recommended Score Adjustments</div>
                  <div className="space-y-2">
                    {threatIntel.scoreAdjustments.map((adj, i) => {
                      const dim = state.dimensions.find((d) =>
                        d.dimension.toLowerCase().includes(adj.dimension.toLowerCase()) ||
                        adj.dimension.toLowerCase().includes(d.dimension.toLowerCase())
                      );
                      const alreadyApplied = dim ? dim.inherent === adj.suggestedScore : false;
                      return (
                        <div key={i} className="border border-hair-2 rounded-lg p-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-12 font-semibold text-ink-0">{adj.dimension}</span>
                              <span className="font-mono text-10 text-ink-3">
                                {adj.currentScore} → <span className={adj.suggestedScore > adj.currentScore ? "text-red font-bold" : "text-green font-bold"}>{adj.suggestedScore}</span>
                              </span>
                            </div>
                            <p className="text-11 text-ink-2">{adj.reason}</p>
                          </div>
                          {dim && !alreadyApplied && (
                            <button
                              type="button"
                              onClick={() => {
                                const patch = { inherent: adj.suggestedScore };
                                updateDim(dim.id, patch);
                              }}
                              className="shrink-0 text-11 font-semibold px-3 py-1 rounded bg-brand text-white hover:bg-brand/90 transition-colors"
                            >
                              Apply
                            </button>
                          )}
                          {alreadyApplied && (
                            <span className="shrink-0 text-11 font-mono text-green px-3 py-1">Applied ✓</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Version History */}
        <div className="mt-4 bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-2 transition-colors"
          >
            <span className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2">
              🕓 Version History ({history.length} snapshot{history.length !== 1 ? "s" : ""})
            </span>
            <span className="text-ink-3 font-mono text-12">{historyOpen ? "▾" : "▸"}</span>
          </button>
          {historyOpen && (
            <div className="border-t border-hair-2 divide-y divide-hair">
              {history.length === 0 && (
                <div className="px-4 py-4 text-12 text-ink-3 text-center">
                  No snapshots yet. Click "Save Snapshot" to capture the current state.
                </div>
              )}
              {history.map((snap, i) => (
                <div key={snap.id} className="px-4 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-10 text-ink-3">{new Date(snap.timestamp).toLocaleString("en-GB")}</span>
                    {i === 0 && <span className="text-10 font-mono bg-brand-dim text-brand px-1.5 py-px rounded">latest</span>}
                    <div className="ml-auto flex items-center gap-3 text-11 font-mono">
                      <span className={`px-1.5 py-px rounded text-10 font-semibold ${
                        snap.overallInherent >= 4 ? "bg-red-dim text-red" :
                        snap.overallInherent === 3 ? "bg-amber-dim text-amber" :
                        "bg-green-dim text-green"
                      }`}>
                        Inherent {RISK_LABEL[snap.overallInherent] ?? snap.overallInherent}
                      </span>
                      <span className={`px-1.5 py-px rounded text-10 font-semibold ${
                        snap.overallResidual >= 4 ? "bg-red-dim text-red" :
                        snap.overallResidual === 3 ? "bg-amber-dim text-amber" :
                        "bg-green-dim text-green"
                      }`}>
                        Residual {RISK_LABEL[snap.overallResidual] ?? snap.overallResidual}
                      </span>
                    </div>
                  </div>
                  {snap.keyChanges.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {snap.keyChanges.map((c, j) => (
                        <span key={j} className="text-10 text-ink-3 bg-bg-1 px-1.5 py-px rounded font-mono">{c}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {snap.dimensions.map((d) => (
                      <span key={d.id} className="text-10 font-mono text-ink-3">
                        {d.dimension}: I={d.inherent} C={d.controls}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approval metadata */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6">
          <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Board approval</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Unit</label>
              <input value={state.unit}
                onChange={(e) => update({ ...state, unit: e.target.value })}
                placeholder="e.g. AML Compliance" className={inputCls} />
            </div>
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Last Approved</label>
              <input value={state.lastApproved}
                onChange={(e) => update({ ...state, lastApproved: e.target.value })}
                placeholder="dd/mm/yyyy" className={inputCls} />
            </div>
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Approved By</label>
              <input value={state.approvedBy}
                onChange={(e) => update({ ...state, approvedBy: e.target.value })}
                placeholder="Board Chair / MLRO" className={inputCls} />
            </div>
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Next Review</label>
              <input value={state.nextReview}
                onChange={(e) => update({ ...state, nextReview: e.target.value })}
                placeholder="dd/mm/yyyy" className={inputCls} />
            </div>
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Board Minutes Ref</label>
              <input value={state.boardMinutes}
                onChange={(e) => update({ ...state, boardMinutes: e.target.value })}
                placeholder="e.g. BM-2026-04-01" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Risk matrix */}
        <div className="mt-4 space-y-2">
          {state.dimensions.map((d) => {
            const res = residual(d);
            return (
              <div key={d.id} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="text-13 font-semibold text-ink-0">{d.dimension}</div>
                    <div className="text-11 text-ink-3 mt-0.5">{d.description}</div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10 font-semibold uppercase whitespace-nowrap ${RISK_TONE(res)}`}>
                    Residual: {RISK_LABEL[res]}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-10 text-ink-3 font-mono uppercase tracking-wide-2 mb-1">
                      Inherent risk — {RISK_LABEL[d.inherent]}
                    </div>
                    <ScoreSelector value={d.inherent} onChange={(n) => updateDim(d.id, { inherent: n })} />
                  </div>
                  <div>
                    <div className="text-10 text-ink-3 font-mono uppercase tracking-wide-2 mb-1">
                      Controls effectiveness — {RISK_LABEL[d.controls]}
                    </div>
                    <ScoreSelector value={d.controls} onChange={(n) => updateDim(d.id, { controls: n })} />
                  </div>
                  <div>
                    <div className="text-10 text-ink-3 font-mono uppercase tracking-wide-2 mb-1">Notes</div>
                    <input value={d.notes}
                      onChange={(e) => updateDim(d.id, { notes: e.target.value })}
                      placeholder="Mitigants, gaps, action items…"
                      className="w-full text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
          Scoring guide — Inherent risk: 1 = very low, 5 = critical. Controls effectiveness: 1 = no controls, 5 = strong mitigants.
          Residual risk is derived automatically. Board must review and re-approve annually per FDL 10/2025 Art.4 and FATF R.1.
          Changes auto-save to local storage.
        </p>

        {/* ─── DPMS-Specific BWRA Supplement ──────────────────────────────── */}
        <DpmsBwraSection />
    </ModuleLayout>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* DPMS Business-Wide Risk Assessment supplement                               */
/* Legal basis: FDL 10/2025 Art.19(1)(a) + CR134/2025 Art.5                   */
/* Sector baseline: UAE NRA 2024 DPMS = Medium-High                            */
/* ─────────────────────────────────────────────────────────────────────────── */

const DPMS_BWRA_CHECKLIST = [
  { id: "nra-baseline", label: "NRA 2024 sector baseline (DPMS = Medium-High) reviewed and documented" },
  { id: "cash-threshold", label: "AED 55,000 cash-transaction threshold controls implemented (CR134/2025 Art.3)" },
  { id: "dual-use", label: "Dual-use goods screening integrated per CR 156/2025 categories" },
  { id: "fiu-typologies", label: "All 9 FIU Sept 2025 DPMS typologies mapped to detection logic" },
  { id: "supply-chain", label: "Supply chain due diligence aligned to OECD DDG 5-step framework (MD 68/2024)" },
  { id: "goaml-reporting", label: "goAML reporting channels tested and MLRO-authorised" },
  { id: "eocn-nas-ars", label: "NAS and ARS registration confirmed on uaeiec.gov.ae" },
  { id: "training-dpms", label: "DPMS-specific AML/CFT training completed within past 12 months" },
  { id: "moe-survey", label: "MoE 2026 survey (MOET/AML/001/2026) completed and submitted" },
  { id: "board-approved", label: "BWRA signed off by senior management / Board and documented in minutes" },
];

const BWRA_STORAGE = "hawkeye.ewra.dpms-bwra.v1";

interface DpmsBwraState {
  checklist: Record<string, boolean>;
  entityNarrative: string;
  lastUpdated: string;
}

function loadBwra(): DpmsBwraState {
  if (typeof window === "undefined") return { checklist: {}, entityNarrative: "", lastUpdated: "" };
  try {
    const raw = window.localStorage.getItem(BWRA_STORAGE);
    return raw ? (JSON.parse(raw) as DpmsBwraState) : { checklist: {}, entityNarrative: "", lastUpdated: "" };
  } catch { return { checklist: {}, entityNarrative: "", lastUpdated: "" }; }
}

function saveBwra(s: DpmsBwraState) {
  try { window.localStorage.setItem(BWRA_STORAGE, JSON.stringify(s)); } catch { /* */ }
}

function DpmsBwraSection() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DpmsBwraState>({ checklist: {}, entityNarrative: "", lastUpdated: "" });

  // Lazy load from localStorage on first expand
  const handleOpen = () => {
    if (!open) { setState(loadBwra()); }
    setOpen((o) => !o);
  };

  const update = (patch: Partial<DpmsBwraState>) => {
    const next = { ...state, ...patch, lastUpdated: new Date().toISOString() };
    setState(next);
    saveBwra(next);
  };

  const toggleCheck = (id: string) => {
    update({ checklist: { ...state.checklist, [id]: !state.checklist[id] } });
  };

  const checkedCount = DPMS_BWRA_CHECKLIST.filter((c) => state.checklist[c.id]).length;
  const total = DPMS_BWRA_CHECKLIST.length;
  const pct = Math.round((checkedCount / total) * 100);
  const wordCount = state.entityNarrative.trim().split(/\s+/).filter(Boolean).length;
  const narrativeOk = wordCount >= 150;

  return (
    <div className="mt-6 border border-brand/20 rounded-xl bg-bg-panel overflow-hidden">
      {/* Accordion header */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg-2 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono text-10 font-bold uppercase tracking-wide-4 text-brand">DPMS BWRA Supplement</span>
              <span className="font-mono text-10 px-1.5 py-px rounded bg-brand/10 text-brand border border-brand/20">FDL 10/2025 Art.19(1)(a) · CR134/2025 Art.5</span>
            </div>
            <span className="text-12 text-ink-0 mt-0.5 font-semibold">Business-Wide Risk Assessment — DPMS Sector Specifics</span>
          </div>
          {open && (
            <div className="flex items-center gap-3 text-11 font-mono">
              <span className={pct === 100 ? "text-green" : pct >= 60 ? "text-amber" : "text-red"}>
                {checkedCount}/{total} checks
              </span>
              <span className={narrativeOk ? "text-green" : "text-amber"}>
                {wordCount} words {narrativeOk ? "✓" : "(min 150)"}
              </span>
            </div>
          )}
        </div>
        <span className="text-ink-3 font-mono text-12 shrink-0">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-hair px-5 pb-6 space-y-6">
          {/* NRA 2024 Sector Baseline */}
          <div className="mt-5 rounded-lg border border-amber/30 bg-amber-dim/20 p-4">
            <div className="font-mono text-10 font-bold uppercase tracking-wide-4 text-amber mb-2">UAE NRA 2024 — DPMS Sector Baseline</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="rounded bg-bg-panel border border-hair p-3">
                <div className="font-mono text-18 font-bold text-amber">MH</div>
                <div className="text-10 text-ink-3 mt-1">ML Threat</div>
              </div>
              <div className="rounded bg-bg-panel border border-hair p-3">
                <div className="font-mono text-18 font-bold text-amber">MH</div>
                <div className="text-10 text-ink-3 mt-1">ML Vulnerability</div>
              </div>
              <div className="rounded bg-bg-panel border border-hair p-3">
                <div className="font-mono text-18 font-bold text-red">H</div>
                <div className="text-10 text-ink-3 mt-1">TF Threat</div>
              </div>
              <div className="rounded bg-bg-panel border border-hair p-3">
                <div className="font-mono text-18 font-bold text-amber">MH</div>
                <div className="text-10 text-ink-3 mt-1">Overall DPMS Risk</div>
              </div>
            </div>
            <p className="text-11 text-ink-2 mt-3 leading-relaxed">
              The 2024 UAE National Risk Assessment classifies the DPMS sector as <strong>Medium-High</strong> overall. High cash intensity, CAHRA exposure, opaque supply chains, and cross-border bullion movement are the primary drivers. Entity-specific assessments must document how individual risk factors compare to this baseline and justify any departure.
            </p>
          </div>

          {/* Compliance checklist */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-10 font-bold uppercase tracking-wide-4 text-ink-2">CR134/2025 Art.5 — BWRA Compliance Checklist</div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-bg-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green" : pct >= 60 ? "bg-amber" : "bg-red"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`font-mono text-11 font-semibold ${pct === 100 ? "text-green" : pct >= 60 ? "text-amber" : "text-red"}`}>
                  {pct}%
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {DPMS_BWRA_CHECKLIST.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    state.checklist[item.id] ? "border-green/30 bg-green-dim/20" : "border-hair bg-bg-1 hover:border-brand/20"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!state.checklist[item.id]}
                    onChange={() => toggleCheck(item.id)}
                    className="mt-0.5 shrink-0 accent-green"
                  />
                  <span className={`text-12 leading-snug ${state.checklist[item.id] ? "text-ink-0 line-through decoration-green/50" : "text-ink-1"}`}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Entity-specific narrative */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-10 font-bold uppercase tracking-wide-4 text-ink-2">Entity-Specific Narrative</div>
              <div className={`font-mono text-11 px-2 py-0.5 rounded border ${narrativeOk ? "text-green border-green/30 bg-green-dim" : "text-amber border-amber/30 bg-amber-dim"}`}>
                {wordCount} / 150 words minimum
              </div>
            </div>
            <p className="text-11 text-ink-3 mb-2">
              This narrative must be entity-specific. Describe how your particular business model, customer base, geographies, and product mix affect the risk profile relative to the NRA 2024 DPMS baseline. Generic or copy-pasted text does not satisfy FDL 10/2025 Art.19(1)(a) — MoE inspectors check for specificity.
            </p>
            <textarea
              value={state.entityNarrative}
              onChange={(e) => update({ entityNarrative: e.target.value })}
              rows={8}
              placeholder={`Example structure:\n• Our customer base is [describe]. PEP exposure is [level] because [reason].\n• Our geographic exposure includes [countries/zones] with [specific risk factors].\n• Products/services include [list] with DPMS-specific risks [describe].\n• Key controls include [list]. Known gaps are [list].\n• How our residual risk compares to the DPMS Medium-High NRA baseline: [explain].`}
              className="w-full text-12 px-3 py-2.5 rounded-lg border border-hair-2 bg-bg-panel text-ink-0 resize-y placeholder-ink-3 outline-none focus:border-brand transition-colors"
            />
            {!narrativeOk && wordCount > 0 && (
              <p className="text-10.5 text-amber mt-1">
                {150 - wordCount} more words needed. MoE 2026 guidance flags assessments under 150 words as insufficient.
              </p>
            )}
            {narrativeOk && (
              <p className="text-10.5 text-green mt-1">✓ Narrative length meets minimum requirement.</p>
            )}
          </div>

          {/* Cross-links */}
          <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-hair">
            <span className="text-11 text-ink-3">Related modules:</span>
            <a href="/moe-survey" className="text-11 text-brand hover:underline">MoE 2026 Survey →</a>
            <a href="/eocn" className="text-11 text-brand hover:underline">EOCN / NAS+ARS →</a>
            <a href="/typology-library" className="text-11 text-brand hover:underline">FIU Typology Alignment →</a>
            <a href="/cnmr" className="text-11 text-brand hover:underline">CNMR Workflow →</a>
          </div>

          {state.lastUpdated && (
            <p className="text-10 text-ink-3 font-mono">
              Last saved: {new Date(state.lastUpdated).toLocaleString("en-GB")} — changes auto-save to local storage.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
