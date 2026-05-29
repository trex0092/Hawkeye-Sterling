"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

interface ShapValue {
  feature: string;
  contribution: number;
  direction: "positive" | "negative";
  percentageOfScore: number;
}

interface ScoreExplainResponse {
  shapValues: ShapValue[];
  totalScore: number;
  baseline: number;
  confidence: number;
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/score-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ composite: { score, breakdown }, runId }),
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
  }, [score, breakdown, runId]);

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

  if (error || !data) {
    return (
      <div className={`rounded-lg border border-red-800 bg-slate-900 p-4 ${className}`}>
        <span className="text-xs text-red-400 font-medium">⚠ XAI unavailable: {error}</span>
      </div>
    );
  }

  const sorted = [...data.shapValues].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );
  const maxAbs = Math.max(...sorted.map((s) => Math.abs(s.contribution)), 1);

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-100">SHAP Feature Contributions</h3>
        <span className="text-xs text-slate-400">
          Score: <span className="text-slate-100 font-mono">{data.totalScore.toFixed(1)}</span>
          {" | "}Baseline: <span className="text-slate-100 font-mono">{data.baseline.toFixed(1)}</span>
          {" | "}Conf: <span className="text-slate-100 font-mono">{(data.confidence * 100).toFixed(0)}%</span>
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map((sv) => {
          const pct = Math.round((Math.abs(sv.contribution) / maxAbs) * 100);
          const isPos = sv.direction === "positive";
          return (
            <div key={sv.feature} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 text-slate-300 truncate" title={sv.feature}>
                {sv.feature}
              </span>
              <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${isPos ? "bg-emerald-500" : "bg-red-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`w-14 text-right font-mono shrink-0 ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                {isPos ? "+" : ""}{sv.contribution.toFixed(2)}
              </span>
              <span className="w-10 text-right text-slate-500 shrink-0">
                {sv.percentageOfScore.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Total explained: {data.shapValues.reduce((s, v) => s + v.contribution, 0).toFixed(2)} of {data.totalScore.toFixed(2)}
      </p>
    </div>
  );
}

export default BrainXAIPanel;
