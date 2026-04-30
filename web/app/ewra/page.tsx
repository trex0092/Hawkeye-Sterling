"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface EwraReport {
  executiveSummary: string;
  overallRiskVerdict: "critical" | "high" | "medium" | "low";
  topControlGaps: Array<{
    dimension: string;
    gap: string;
    recommendation: string;
    urgency: "immediate" | "3months" | "annual";
  }>;
  immediateActions: string[];
  regulatoryExposure: string;
  boardNarrative: string;
  nextReviewDate: string;
}

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

export default function EwraPage() {
  const [state, setState] = useState<EwraState>(DEFAULT_STATE);
  const [report, setReport] = useState<EwraReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => { setState(load()); }, []);

  const update = (updated: EwraState) => { setState(updated); save(updated); };

  const generateReport = async () => {
    setReportLoading(true);
    setReport(null);
    try {
      const res = await fetch("/api/ewra-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dimensions: state.dimensions, overallInherent, overallResidual, approvedBy: state.approvedBy, lastApproved: state.lastApproved }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & EwraReport;
      if (data.ok) setReport(data);
    } catch { /* silent */ }
    finally { setReportLoading(false); }
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

        <div className="flex justify-end mb-2">
          <button type="button" onClick={() => void generateReport()} disabled={reportLoading}
            className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
            {reportLoading ? "Generating Board Report…" : "Generate AI Board Report"}
          </button>
        </div>

        {report && (
          <div className="mb-4 bg-bg-panel border border-brand/30 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-11 font-semibold uppercase tracking-wide-3 text-brand-deep">AI Board Report</span>
                <span className={`font-mono text-10 font-bold px-2 py-px rounded uppercase ${report.overallRiskVerdict === "critical" ? "bg-red text-white" : report.overallRiskVerdict === "high" ? "bg-red-dim text-red" : report.overallRiskVerdict === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>
                  {report.overallRiskVerdict} overall risk
                </span>
              </div>
              <button type="button" onClick={() => setReport(null)} className="text-11 text-ink-3 hover:text-ink-1">×</button>
            </div>
            <p className="text-13 text-ink-0 leading-relaxed font-medium">{report.executiveSummary}</p>
            {report.immediateActions.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide-3 text-red mb-1">Immediate actions required</div>
                <ul className="text-12 text-ink-0 space-y-1 list-disc list-inside">
                  {report.immediateActions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {report.topControlGaps.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Top control gaps</div>
                <div className="space-y-2">
                  {report.topControlGaps.map((g, i) => {
                    const urgCls = g.urgency === "immediate" ? "bg-red-dim text-red" : g.urgency === "3months" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2";
                    return (
                      <div key={i} className="border border-hair-2 rounded-lg p-3 bg-bg-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-12 font-semibold text-ink-0">{g.dimension}</span>
                          <span className={`font-mono text-9 px-1.5 py-px rounded uppercase ${urgCls}`}>{g.urgency}</span>
                        </div>
                        <div className="text-11 text-red mb-1">{g.gap}</div>
                        <div className="text-11 text-ink-2 italic">{g.recommendation}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="text-12 text-ink-1 leading-relaxed border-l-2 border-brand/40 pl-3">{report.boardNarrative}</div>
            {report.regulatoryExposure && <div className="text-10 font-mono text-ink-3">{report.regulatoryExposure}</div>}
            {report.nextReviewDate && <div className="text-10 font-mono text-ink-3">Recommended next review: {report.nextReviewDate}</div>}
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
