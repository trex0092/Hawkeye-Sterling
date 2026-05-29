"use client";

import { useEffect, useState } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";

interface FlipFactor {
  factor: string;
  currentValue: string;
  targetValue: string;
  scoreImpact: number;
  feasibility: "easy" | "moderate" | "hard" | "immovable";
}

interface CounterfactualResponse {
  flips: FlipFactor[];
  explanationText: string;
  currentScore: number;
  targetScore: number;
}

export interface CounterfactualCardProps {
  caseId: string;
  verdict: string;
  score: number;
  breakdown?: Record<string, number>;
  className?: string;
}

const FEASIBILITY_STYLES: Record<FlipFactor["feasibility"], string> = {
  easy: "bg-emerald-900 text-emerald-300 border-emerald-700",
  moderate: "bg-yellow-900 text-yellow-300 border-yellow-700",
  hard: "bg-orange-900 text-orange-300 border-orange-700",
  immovable: "bg-slate-800 text-slate-400 border-slate-600",
};

export function CounterfactualCard({
  caseId,
  verdict,
  score,
  breakdown,
  className = "",
}: CounterfactualCardProps) {
  const [data, setData] = useState<CounterfactualResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/score-counterfactual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, verdict, score, breakdown }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CounterfactualResponse>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err: unknown) => {
        if (!cancelled) setError(caughtErrorMessage(err, "Failed to load counterfactual"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [caseId, verdict, score, breakdown]);

  if (loading) {
    return (
      <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 animate-pulse ${className}`}>
        <div className="h-4 w-64 bg-slate-700 rounded mb-4" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3 mb-3">
            <div className="h-10 flex-1 bg-slate-700 rounded" />
            <div className="h-10 w-20 bg-slate-700 rounded" />
          </div>
        ))}
        <div className="h-3 w-full bg-slate-700 rounded mt-4" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`rounded-lg border border-red-800 bg-slate-900 p-4 ${className}`}>
        <span className="text-xs text-red-400 font-medium">⚠ Counterfactual unavailable: {error}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Counterfactual Explainability</h3>
        <p className="text-xs text-slate-400 italic">
          What would need to change for this decision to be different?
        </p>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span>Current score: <span className="text-slate-200 font-mono">{data.currentScore.toFixed(1)}</span></span>
          <span>Target score: <span className="text-slate-200 font-mono">{data.targetScore.toFixed(1)}</span></span>
        </div>
      </div>

      <div className="space-y-2">
        {data.flips.map((flip) => (
          <div
            key={flip.factor}
            className="flex items-start gap-3 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                {flip.feasibility === "immovable" && <span title="Immovable factor">🔒</span>}
                <span className="font-medium text-slate-200 truncate">{flip.factor}</span>
              </div>
              <p className="text-slate-400 mt-0.5">
                <span className="font-mono text-red-400">{flip.currentValue}</span>
                {" → "}
                <span className="font-mono text-emerald-400">{flip.targetValue}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${FEASIBILITY_STYLES[flip.feasibility]}`}
              >
                {flip.feasibility}
              </span>
              <span className="text-slate-500 font-mono">
                {flip.scoreImpact > 0 ? "+" : ""}{flip.scoreImpact.toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {data.flips.length === 0 && (
        <p className="text-xs text-slate-500 py-2 text-center">No actionable counterfactual factors identified.</p>
      )}

      <p className="mt-4 text-xs text-slate-400 border-t border-slate-700 pt-3 leading-relaxed">
        {data.explanationText}
      </p>
    </div>
  );
}

export default CounterfactualCard;
