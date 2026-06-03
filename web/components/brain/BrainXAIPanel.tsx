"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

// Matches the shape returned by /api/score-explain (src/brain/shap-decomposer.ts).
interface ShapContribution {
  feature: string;
  displayName?: string;
  shapValue: number; // points contributed to total score
  shapPercent?: number; // percentage of total score
  direction: "increases_risk" | "neutral";
}

interface ScoreExplainResponse {
  ok?: boolean;
  totalScore?: number;
  baseline?: number;
  contributions?: ShapContribution[];
  dominantFeature?: string;
}

export interface BrainXAIPanelProps {
  score: number;
  breakdown: Record<string, number>;
  runId?: string;
  className?: string;
}

export function BrainXAIPanel({ score, breakdown, runId, className = "" }: BrainXAIPanelProps) {
  const [data, setData] = useState<ScoreExplainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable key so an inline-changing breakdown object doesn't refetch forever.
  const breakdownKey = JSON.stringify(breakdown);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/score-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // API reads top-level { score, breakdown } — not { composite }.
      body: JSON.stringify({ score, breakdown, runId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(apiErrorMessage(res.status, "Score explanation"));
        return res.json() as Promise<ScoreExplainResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(caughtErrorMessage(err, "Failed to load explanation"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, breakdownKey, runId]);

  if (loading) {
    return (
      <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 animate-pulse ${className}`}>
        <div className="h-5 w-40 bg-slate-700 rounded mb-4" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div className="h-3 w-28 bg-slate-700 rounded" />
            <div className="h-5 flex-1 bg-slate-700 rounded" />
            <div className="h-3 w-10 bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data || data.ok === false) {
    return (
      <div className={`rounded-lg border border-red-800 bg-slate-900 p-4 ${className}`}>
        <span className="text-xs text-red-400 font-medium">⚠ XAI unavailable{error ? `: ${error}` : ""}</span>
      </div>
    );
  }

  const contributions = Array.isArray(data.contributions) ? data.contributions : [];
  const totalScore = data.totalScore ?? 0;
  const baseline = data.baseline ?? 0;

  if (contributions.length === 0) {
    return (
      <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">SHAP Feature Contributions</h3>
        <span className="text-xs text-slate-400">
          No feature contributions to explain (score {totalScore.toFixed(1)}).
        </span>
      </div>
    );
  }

  const sorted = [...contributions].sort(
    (a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue)
  );
  const maxAbs = Math.max(...sorted.map((s) => Math.abs(s.shapValue)), 1);
  const totalExplained = contributions.reduce((s, v) => s + v.shapValue, 0);

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-100">SHAP Feature Contributions</h3>
        <span className="text-xs text-slate-400">
          Score: <span className="text-slate-100 font-mono">{totalScore.toFixed(1)}</span>
          {" | "}Baseline: <span className="text-slate-100 font-mono">{baseline.toFixed(1)}</span>
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map((sv) => {
          const pct = Math.round((Math.abs(sv.shapValue) / maxAbs) * 100);
          const raisesRisk = sv.direction === "increases_risk";
          return (
            <div key={sv.feature} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 text-slate-300 truncate" title={sv.displayName ?? sv.feature}>
                {sv.displayName ?? sv.feature}
              </span>
              <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${raisesRisk ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`w-14 text-right font-mono shrink-0 ${raisesRisk ? "text-red-400" : "text-emerald-400"}`}>
                {sv.shapValue >= 0 ? "+" : ""}{sv.shapValue.toFixed(2)}
              </span>
              <span className="w-10 text-right text-slate-500 shrink-0">
                {(sv.shapPercent ?? 0).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Total explained: {totalExplained.toFixed(2)} of {totalScore.toFixed(2)}
      </p>
    </div>
  );
}
