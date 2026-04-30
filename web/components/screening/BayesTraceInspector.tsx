// Hawkeye Sterling — BayesTraceInspector (audit follow-up #30).
//
// Renders BrainVerdict.bayesTrace as a step-by-step audit-grade table
// with rawLR / effectiveWeight / weightedLR / posteriorOdds / posterior.
// Charter P6 (transparent scoring) — every step the Bayesian update
// took is now MLRO-inspectable, not just the final posterior.

"use client";

import { useState } from "react";

interface BayesTraceStep {
  evidenceId: string;
  lr: number;
  priorOdds: number;
  posteriorOdds: number;
  posterior: number;
  rawLR?: number;
  effectiveWeight?: number;
  weightedLR?: number;
}

interface BayesTrace {
  prior: number;
  posterior: number;
  steps: BayesTraceStep[];
}

interface Props {
  trace?: BayesTrace | null;
}

function fmt(n: number | undefined, digits = 3): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function cls(weight: number | undefined): string {
  if (weight === undefined) return "";
  if (weight >= 0.85) return "bg-emerald-50";
  if (weight >= 0.5) return "bg-amber-50";
  if (weight >= 0.2) return "bg-orange-50";
  return "bg-red-50";
}

export function BayesTraceInspector({ trace }: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (!trace || trace.steps.length === 0) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Bayesian trace</div>
          <div className="text-sm">
            <span className="opacity-60">prior </span>
            <span className="font-mono tabular-nums">{fmt(trace.prior)}</span>
            <span className="opacity-60"> → posterior </span>
            <span className="font-mono tabular-nums font-semibold">{fmt(trace.posterior)}</span>
            <span className="opacity-60"> · {trace.steps.length} step(s)</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-xs underline text-zinc-600 hover:text-zinc-900"
        >
          {expanded ? "hide steps" : "show steps"}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[11px]">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-left">evidence</th>
                <th className="px-2 py-1 text-right">rawLR</th>
                <th className="px-2 py-1 text-right">weight</th>
                <th className="px-2 py-1 text-right">weightedLR</th>
                <th className="px-2 py-1 text-right">priorOdds</th>
                <th className="px-2 py-1 text-right">posteriorOdds</th>
                <th className="px-2 py-1 text-right">posterior</th>
              </tr>
            </thead>
            <tbody>
              {trace.steps.map((s, i) => (
                <tr key={i} className={`border-b border-zinc-100 ${cls(s.effectiveWeight)}`}>
                  <td className="px-2 py-1 text-zinc-500 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-zinc-700">{s.evidenceId}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{fmt(s.rawLR, 2)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{fmt(s.effectiveWeight, 2)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums font-semibold">{fmt(s.weightedLR ?? s.lr, 2)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums opacity-70">{fmt(s.priorOdds, 3)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums opacity-70">{fmt(s.posteriorOdds, 3)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums font-medium">{fmt(s.posterior)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-[10px] text-zinc-400">
            Row tint = evidence quality (green ≥ 0.85, amber ≥ 0.5, orange ≥ 0.2, red &lt; 0.2). weightedLR = rawLR ^ weight (Charter P6).
          </div>
        </div>
      )}
    </div>
  );
}

export default BayesTraceInspector;
