"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

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

const RISK_STYLE: Record<BenfordRisk, { badge: string; border: string; bg: string }> = {
  "suspicious":        { badge: "bg-red-700 text-white",                    border: "border-red-600",  bg: "bg-red-50" },
  "marginal":          { badge: "bg-orange-100 text-orange-800 border border-orange-300", border: "border-orange-300", bg: "bg-white" },
  "clean":             { badge: "bg-green-100 text-green-800 border border-green-300",    border: "border-green-300",  bg: "bg-white" },
  "insufficient-data": { badge: "bg-gray-100 text-gray-600 border border-gray-300",       border: "border-gray-200",   bg: "bg-white" },
};

const BENFORD_EXPECTED: Record<number, number> = {
  1: 30.103, 2: 17.609, 3: 12.494, 4: 9.691,
  5: 7.918,  6: 6.695,  7: 5.799,  8: 5.115, 9: 4.576,
};

function Bar({ pct, expected, max }: { pct: number; expected: number; max: number }) {
  const obsFrac = (pct / max) * 100;
  const expFrac = (expected / max) * 100;
  const over = pct > expected + 2;
  return (
    <div className="relative h-5 bg-gray-100 rounded overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full rounded transition-all ${over ? "bg-red-400" : "bg-blue-400"}`}
        style={{ width: `${obsFrac}%` }}
      />
      <div
        className="absolute top-0 h-full border-r-2 border-gray-500 border-dashed"
        style={{ left: `${expFrac}%` }}
        title={`Benford expected: ${expected.toFixed(1)}%`}
      />
    </div>
  );
}

export default function BenfordPage() {
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BenfordResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const maxPct = result ? Math.max(...result.digits.map((d) => Math.max(d.observedPct, d.expectedPct))) : 35;
  const style = result ? RISK_STYLE[result.risk] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Benford&apos;s Law Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Forensic accounting digit test — chi-squared + MAD dual methodology (Nigrini 2012 / Ausloos 2025). Flags fabricated, rounded, or structured transaction amounts.
          </p>
        </div>

        {/* Input panel */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-3">
          <div className="flex gap-3">
            <input
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Dataset label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div className="text-xs text-gray-400 flex items-center">
              {parseAmounts().length} values parsed
            </div>
          </div>
          <textarea
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono h-40 resize-y"
            placeholder="Paste transaction amounts — one per line, comma-separated, or space-separated&#10;&#10;Example:&#10;125000&#10;87500&#10;340000, 12500, 56000"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400">Minimum 100 amounts for results; ≥ 500 for reliable Nigrini thresholds.</p>
            <button
              onClick={analyse}
              disabled={loading || input.trim().length === 0}
              className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? "Analysing…" : "Analyse"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-4">{error}</div>
        )}

        {result && style && (
          <div className="space-y-4">
            {/* Verdict card */}
            <div className={`rounded-lg border-2 p-5 ${style.border} ${style.bg}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{result.label}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{result.riskDetail}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded uppercase tracking-wide ${style.badge}`}>
                  {result.risk.replace("-", " ")}
                </span>
              </div>

              {/* Statistics grid */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                <div className="bg-white rounded border border-gray-100 p-3 text-center">
                  <div className="text-xl font-bold text-gray-700">{result.n.toLocaleString()}</div>
                  <div className="text-xs text-gray-400">Sample size</div>
                </div>
                <div className="bg-white rounded border border-gray-100 p-3 text-center">
                  <div className={`text-xl font-bold ${result.mad > 0.015 ? "text-red-700" : result.mad > 0.006 ? "text-orange-600" : "text-green-700"}`}>
                    {(result.mad * 100).toFixed(3)}%
                  </div>
                  <div className="text-xs text-gray-400">MAD</div>
                </div>
                <div className="bg-white rounded border border-gray-100 p-3 text-center">
                  <div className={`text-xl font-bold ${result.chiSquared > 20.09 ? "text-red-700" : result.chiSquared > 15.507 ? "text-orange-600" : "text-green-700"}`}>
                    {result.chiSquared.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-400">χ² (df=8)</div>
                </div>
                <div className="bg-white rounded border border-gray-100 p-3 text-center">
                  <div className={`text-xl font-bold ${result.chiSquaredPValue < 0.01 ? "text-red-700" : result.chiSquaredPValue < 0.05 ? "text-orange-600" : "text-green-700"}`}>
                    {result.chiSquaredPValue < 0.001 ? "<0.001" : result.chiSquaredPValue.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-400">p-value</div>
                </div>
              </div>

              {/* Flagged digits */}
              {result.flaggedDigits.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Over-represented digits (structuring signal):</span>
                  {result.flaggedDigits.map((d) => (
                    <span key={d} className="text-sm font-bold bg-red-100 text-red-700 w-7 h-7 rounded flex items-center justify-center">{d}</span>
                  ))}
                </div>
              )}

              {/* Nigrini thresholds legend */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>Nigrini thresholds:</span>
                <span className="text-green-700 font-medium">MAD ≤ 0.6% close conformity</span>
                <span className="text-orange-600 font-medium">0.6–1.2% acceptable</span>
                <span className="text-orange-700 font-medium">1.2–1.5% marginal</span>
                <span className="text-red-700 font-medium">&gt; 1.5% non-conformity</span>
              </div>
            </div>

            {/* Digit breakdown chart */}
            {result.digits.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Leading Digit Distribution</h3>
                <div className="space-y-3">
                  {result.digits.map((d) => (
                    <div key={d.digit} className="grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem] items-center gap-3">
                      <span className={`text-sm font-bold text-center ${result.flaggedDigits.includes(d.digit) ? "text-red-700" : "text-gray-700"}`}>
                        {d.digit}
                      </span>
                      <Bar pct={d.observedPct} expected={d.expectedPct} max={maxPct} />
                      <span className={`text-xs text-right font-mono ${d.deviation > 2 ? "text-red-600 font-bold" : d.deviation < -2 ? "text-blue-600" : "text-gray-600"}`}>
                        {d.observedPct.toFixed(1)}%
                      </span>
                      <span className="text-xs text-right font-mono text-gray-400">
                        {BENFORD_EXPECTED[d.digit]?.toFixed(1)}%
                      </span>
                      <span className={`text-xs text-right font-mono ${d.deviation > 0 ? "text-red-500" : "text-blue-500"}`}>
                        {d.deviation > 0 ? "+" : ""}{d.deviation.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem] gap-3 text-xs text-gray-400 pt-1 border-t border-gray-50">
                    <span />
                    <span><span className="inline-block w-3 h-2 bg-blue-400 rounded mr-1" />Observed  <span className="border-l-2 border-dashed border-gray-500 pl-1 ml-1">Benford expected</span></span>
                    <span className="text-right">Observed</span>
                    <span className="text-right">Expected</span>
                    <span className="text-right">Δ</span>
                  </div>
                </div>
              </div>
            )}

            {result.error && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-amber-700 text-sm">{result.error}</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
