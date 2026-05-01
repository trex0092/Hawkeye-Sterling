"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { EwraBoardReportResult } from "@/app/api/ewra-report/route";
import { exportEwraBoardReport } from "@/lib/pdf/exporters";

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
}

const STORAGE = "hawkeye.ewra.v1";

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

  useEffect(() => { setState(load()); }, []);

  const update = (updated: EwraState) => { setState(updated); save(updated); };

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
      });
      const data = (await res.json()) as { ok: boolean; error?: string } & EwraBoardReportResult;
      if (!data.ok) { setBoardError(data.error ?? "Report generation failed"); return; }
      setBoardReport(data);
      setBoardOpen(true);
    } catch {
      setBoardError("Network error — try again");
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
        <div className="mt-5 flex items-center gap-3">
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
          {boardReport && !boardOpen && (
            <button
              type="button"
              onClick={() => setBoardOpen(true)}
              className="text-11 text-brand underline font-medium"
            >
              View last report ↗
            </button>
          )}
          {boardError && (
            <span className="text-11 text-red">{boardError}</span>
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
                  onClick={() => exportEwraBoardReport(boardReport, state.dimensions)}
                  className="text-11 font-mono text-brand hover:text-brand/80"
                >
                  ↓ Export PDF
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

        {/* Approval metadata */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6">
          <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Board approval</div>
          <div className="grid grid-cols-4 gap-3">
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
                <div className="grid grid-cols-3 gap-4">
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
    </ModuleLayout>
  );
}
