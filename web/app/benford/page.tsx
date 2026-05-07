"use client";

import { useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

type BenfordRisk = "clean" | "marginal" | "suspicious" | "insufficient-data";

interface DigitEntry {
  digit: number;
  observed: number;
  observedPct: number;
  expectedPct: number;
  deviation: number;
}

interface BenfordResult {
  ok: boolean;
  label: string;
  n: number;
  mad: number;
  chiSquared: number;
  chiSquaredPValue: number;
  risk: BenfordRisk;
  riskDetail: string;
  digits: DigitEntry[];
  flaggedDigits: number[];
  error?: string;
}

const RISK_TONE: Record<BenfordRisk, string> = {
  suspicious:        "bg-red-dim text-red border border-red/30",
  marginal:          "bg-amber-dim text-amber border border-amber/30",
  clean:             "bg-green-dim text-green border border-green/30",
  "insufficient-data": "bg-bg-2 text-ink-3 border border-hair-2",
};

const RISK_BORDER: Record<BenfordRisk, string> = {
  suspicious:        "border-red/40",
  marginal:          "border-amber/40",
  clean:             "border-hair-2",
  "insufficient-data": "border-hair-2",
};

const BENFORD_EXPECTED: Record<number, number> = {
  1: 30.103, 2: 17.609, 3: 12.494, 4: 9.691,
  5: 7.918,  6: 6.695,  7: 5.799,  8: 5.115, 9: 4.576,
};

const inputCls = "px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand text-ink-0";
const btnCls   = "px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity";

function Bar({ pct, expected, max, flagged }: { pct: number; expected: number; max: number; flagged: boolean }) {
  const obsFrac = (pct / max) * 100;
  const expFrac = (expected / max) * 100;
  return (
    <div className="relative h-5 bg-bg-2 rounded overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full rounded transition-all ${flagged ? "bg-red" : "bg-brand"}`}
        style={{ width: `${obsFrac}%`, opacity: 0.7 }}
      />
      <div
        className="absolute top-0 h-full border-r-2 border-ink-2 border-dashed opacity-60"
        style={{ left: `${expFrac}%` }}
        title={`Benford expected: ${expected.toFixed(1)}%`}
      />
    </div>
  );
}

interface BenfordInterpretation {
  interpretation: string;
  financialCrimeIndicators: string[];
  regulatoryRelevance: string;
  confidence: "high" | "medium" | "low";
  recommendedActions: string[];
  mlTypologies: string[];
  verdict: "refer_to_mlro" | "enhanced_review" | "monitor" | "clear";
}

export default function BenfordPage() {
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BenfordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiInterp, setAiInterp] = useState<BenfordInterpretation | null>(null);
  const [interpLoading, setInterpLoading] = useState(false);

  const interpretResult = async (r: BenfordResult) => {
    setInterpLoading(true);
    setAiInterp(null);
    try {
      const res = await fetch("/api/benford-interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: r.label, n: r.n, mad: r.mad, chiSquared: r.chiSquared, risk: r.risk, riskDetail: r.riskDetail, flaggedDigits: r.flaggedDigits, digits: r.digits }),
      });
      if (!res.ok) {
        console.error(`[hawkeye] benford-interpret HTTP ${res.status}`);
        return;
      }
      const data = await res.json() as { ok: boolean } & BenfordInterpretation;
      if (data.ok) setAiInterp(data);
    } catch (err) {
      console.error("[hawkeye] benford-interpret threw:", err);
    } finally { setInterpLoading(false); }
  };

  function parseAmounts(): number[] {
    return input
      .split(/[\n;|\t\s]+/)
      .map((s) => parseFloat(s.replace(/[^0-9.-]/g, "")))
      .filter((n) => isFinite(n) && n > 0);
  }

  async function analyse() {
    const amounts = parseAmounts();
    if (amounts.length === 0) { setError("No valid positive numbers found."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const body: Record<string, unknown> = { amounts };
      if (label.trim()) body.label = label.trim();
      const res = await fetch("/api/benford", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as BenfordResult;
      setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  const parsedCount = parseAmounts().length;
  const maxPct = result ? Math.max(...result.digits.map((d) => Math.max(d.observedPct, d.expectedPct))) : 35;

  return (
    <ModuleLayout asanaModule="benford" asanaLabel="Benford Analysis" engineLabel="Benford Analysis">
      <ModuleHero
        moduleNumber={39}
        eyebrow="Module · Forensic Accounting"
        title="Benford's Law"
        titleEm="analysis."
        intro="Chi-squared + MAD dual methodology (Nigrini 2012 / Ausloos 2025). Flags fabricated, rounded, or structured transaction amounts."
      />

      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4">
        <div>
          <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
            Forensic Accounting · Digit Test
          </div>
          <div className="text-12 text-ink-2">
            Leading-digit distribution vs. Benford's expected curve — MAD + χ² dual signal
          </div>
        </div>

        {/* Input area */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              className={`flex-1 ${inputCls}`}
              placeholder="Dataset label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <span className="text-12 text-ink-3 font-mono whitespace-nowrap">
              {parsedCount} values parsed
            </span>
          </div>
          <textarea
            className={`w-full h-40 resize-y font-mono ${inputCls}`}
            placeholder={"Paste transaction amounts — one per line, comma-separated, or space-separated\n\nExample:\n125000\n87500\n340000, 12500, 56000"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <p className="text-11 text-ink-3">
              Minimum 100 amounts for results; ≥ 500 for reliable Nigrini thresholds.
            </p>
            <button
              type="button"
              onClick={analyse}
              disabled={loading || input.trim().length === 0}
              className={btnCls}
            >
              {loading ? "Analysing…" : "Analyse"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Verdict card */}
            <div className={`border-2 rounded-xl p-5 ${RISK_BORDER[result.risk]}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-16 font-semibold text-ink-0">{result.label || "Dataset"}</h2>
                  <p className="text-12 text-ink-2 mt-0.5">{result.riskDetail}</p>
                  <div className="mt-2">
                    <AsanaReportButton payload={{
                      module: "benford",
                      label: result.label || "Dataset",
                      summary: `Benford analysis: n=${result.n}, MAD=${(result.mad * 100).toFixed(3)}%, χ²=${result.chiSquared.toFixed(2)}, p=${result.chiSquaredPValue.toFixed(3)}, risk=${result.risk}`,
                      metadata: { n: result.n, mad: result.mad, chiSquared: result.chiSquared, risk: result.risk, flaggedDigits: result.flaggedDigits.join(", ") || "none" },
                    }} />
                  </div>
                </div>
                <span className={`text-11 font-bold px-2.5 py-1 rounded uppercase ${RISK_TONE[result.risk]}`}>
                  {result.risk.replace("-", " ")}
                </span>
              </div>

              {/* Statistics grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-bg-1 border border-hair-2 rounded p-3 text-center">
                  <div className="text-18 font-mono font-semibold text-ink-0">{result.n.toLocaleString()}</div>
                  <div className="text-10 text-ink-3 uppercase tracking-wide-3">Sample size</div>
                </div>
                <div className="bg-bg-1 border border-hair-2 rounded p-3 text-center">
                  <div className={`text-18 font-mono font-semibold ${result.mad > 0.015 ? "text-red" : result.mad > 0.006 ? "text-amber" : "text-green"}`}>
                    {(result.mad * 100).toFixed(3)}%
                  </div>
                  <div className="text-10 text-ink-3 uppercase tracking-wide-3">MAD</div>
                </div>
                <div className="bg-bg-1 border border-hair-2 rounded p-3 text-center">
                  <div className={`text-18 font-mono font-semibold ${result.chiSquared > 20.09 ? "text-red" : result.chiSquared > 15.507 ? "text-amber" : "text-green"}`}>
                    {result.chiSquared.toFixed(2)}
                  </div>
                  <div className="text-10 text-ink-3 uppercase tracking-wide-3">χ² (df=8)</div>
                </div>
                <div className="bg-bg-1 border border-hair-2 rounded p-3 text-center">
                  <div className={`text-18 font-mono font-semibold ${result.chiSquaredPValue < 0.01 ? "text-red" : result.chiSquaredPValue < 0.05 ? "text-amber" : "text-green"}`}>
                    {result.chiSquaredPValue < 0.001 ? "<0.001" : result.chiSquaredPValue.toFixed(3)}
                  </div>
                  <div className="text-10 text-ink-3 uppercase tracking-wide-3">p-value</div>
                </div>
              </div>

              {/* Flagged digits */}
              {result.flaggedDigits.length > 0 && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <span className="text-11 text-ink-2 font-medium">Over-represented digits (structuring signal):</span>
                  {result.flaggedDigits.map((d) => (
                    <span key={d} className="text-12 font-bold bg-red-dim text-red border border-red/30 w-7 h-7 rounded flex items-center justify-center">
                      {d}
                    </span>
                  ))}
                </div>
              )}

              {/* Nigrini thresholds legend */}
              <div className="mt-4 pt-4 border-t border-hair flex flex-wrap gap-x-4 gap-y-1 text-11 text-ink-3">
                <span className="font-semibold text-ink-2">Nigrini thresholds:</span>
                <span className="text-green font-medium">MAD ≤ 0.6% close conformity</span>
                <span className="text-amber font-medium">0.6–1.2% acceptable</span>
                <span className="text-amber font-medium">1.2–1.5% marginal</span>
                <span className="text-red font-medium">&gt; 1.5% non-conformity</span>
              </div>
            </div>

            {/* Leading digit distribution chart */}
            {result.digits.length > 0 && (
              <div className="border border-hair-2 rounded-xl p-5">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-4">
                  Leading Digit Distribution
                </div>
                <div className="space-y-3">
                  {result.digits.map((d) => {
                    const flagged = result.flaggedDigits.includes(d.digit);
                    return (
                      <div key={d.digit} className="grid items-center gap-3" style={{ gridTemplateColumns: "1.5rem 1fr 4.5rem 4.5rem 4.5rem" }}>
                        <span className={`text-13 font-bold text-center ${flagged ? "text-red" : "text-ink-1"}`}>
                          {d.digit}
                        </span>
                        <Bar pct={d.observedPct} expected={d.expectedPct} max={maxPct} flagged={flagged} />
                        <span className={`text-11 text-right font-mono ${d.deviation > 2 ? "text-red font-bold" : d.deviation < -2 ? "text-brand" : "text-ink-2"}`}>
                          {d.observedPct.toFixed(1)}%
                        </span>
                        <span className="text-11 text-right font-mono text-ink-3">
                          {BENFORD_EXPECTED[d.digit]?.toFixed(1)}%
                        </span>
                        <span className={`text-11 text-right font-mono ${d.deviation > 0 ? "text-red" : "text-brand"}`}>
                          {d.deviation > 0 ? "+" : ""}{d.deviation.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}

                  {/* Legend row */}
                  <div className="grid gap-3 text-11 text-ink-3 pt-2 border-t border-hair" style={{ gridTemplateColumns: "1.5rem 1fr 4.5rem 4.5rem 4.5rem" }}>
                    <span />
                    <span className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-2 rounded bg-brand opacity-70" />
                        Observed
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-0 border-l-2 border-dashed border-ink-2 h-3 opacity-60" />
                        Benford expected
                      </span>
                    </span>
                    <span className="text-right">Observed</span>
                    <span className="text-right">Expected</span>
                    <span className="text-right">Δ</span>
                  </div>
                </div>
              </div>
            )}

            {result.error && (
              <div className="bg-amber-dim border border-amber/30 rounded-lg p-3 text-12 text-amber">
                {result.error}
              </div>
            )}
          </div>
        )}

        {result && result.ok && (
          <div className="mt-4">
            <button type="button" onClick={() => void interpretResult(result)} disabled={interpLoading}
              className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
              {interpLoading ? "Interpreting…" : "✦AI"}
            </button>
            {aiInterp && (() => {
              const verdictCls = aiInterp.verdict === "refer_to_mlro" ? "bg-red text-white" : aiInterp.verdict === "enhanced_review" ? "bg-red-dim text-red" : aiInterp.verdict === "monitor" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
              const confCls = aiInterp.confidence === "high" ? "text-green" : aiInterp.confidence === "medium" ? "text-amber" : "text-red";
              return (
                <div className="mt-3 bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`font-mono text-11 font-bold px-2 py-px rounded uppercase ${verdictCls}`}>{aiInterp.verdict.replace(/_/g," ")}</span>
                    <span className={`text-11 font-mono ${confCls}`}>{aiInterp.confidence} confidence</span>
                  </div>
                  <p className="text-12 text-ink-0 leading-relaxed">{aiInterp.interpretation}</p>
                  {aiInterp.financialCrimeIndicators.length > 0 && (
                    <div>
                      <div className="text-10 uppercase tracking-wide-3 text-red mb-1">Financial crime indicators</div>
                      <ul className="text-11 text-ink-1 list-disc list-inside space-y-0.5">{aiInterp.financialCrimeIndicators.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    </div>
                  )}
                  {aiInterp.mlTypologies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">{aiInterp.mlTypologies.map((t, i) => <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-brand-dim text-brand-deep">{t}</span>)}</div>
                  )}
                  {aiInterp.regulatoryRelevance && <div className="text-10 font-mono text-ink-3">{aiInterp.regulatoryRelevance}</div>}
                  {aiInterp.recommendedActions.length > 0 && (
                    <ul className="text-11 text-ink-2 list-disc list-inside space-y-0.5">{aiInterp.recommendedActions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
