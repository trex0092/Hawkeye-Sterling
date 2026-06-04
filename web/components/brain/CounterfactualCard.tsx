"use client";

import { useEffect, useState } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";

// Mirrors the brain's CounterfactualExplanation shape returned by
// /api/score-counterfactual (see src/brain/counterfactual-explainer.ts).
interface CounterfactualItem {
  driverId: string;
  currentValue: number;
  deltaRequired: number;
  counterfactualValue: number;
  description: string;
  wouldFlipTo: "clear" | "flag" | "escalate";
  plausibility: "high" | "medium" | "low";
  regulatoryDefence: string;
}

interface CounterfactualResponse {
  ok?: boolean;
  originalVerdict: string;
  originalScore: number;
  escalationThreshold: number;
  counterfactuals: CounterfactualItem[];
  immovableFactors: string[];
  regulatoryStatement: string;
  methodology: string;
}

export interface CounterfactualCardProps {
  caseId: string;
  verdict: string;
  score: number;
  breakdown?: Record<string, number>;
  className?: string;
}

const PLAUSIBILITY_STYLES: Record<CounterfactualItem["plausibility"], string> = {
  high: "bg-emerald-900 text-emerald-300 border-emerald-700",
  medium: "bg-yellow-900 text-yellow-300 border-yellow-700",
  low: "bg-orange-900 text-orange-300 border-orange-700",
};

const DRIVER_LABELS: Record<string, string> = {
  pepPenalty: "PEP salience",
  redlinesPenalty: "Redline conditions",
  adverseMediaPenalty: "Adverse media severity",
  jurisdictionPenalty: "Jurisdiction risk tier",
  regimesPenalty: "Sanctions regime exposure",
  quickScreen: "Sanctions-list proximity",
  adverseKeywordPenalty: "Adverse keyword signal",
};

function driverLabel(driverId: string): string {
  return DRIVER_LABELS[driverId] ?? driverId;
}

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

  const counterfactuals = Array.isArray(data.counterfactuals) ? data.counterfactuals : [];
  const immovableFactors = Array.isArray(data.immovableFactors) ? data.immovableFactors : [];
  const originalScore = data.originalScore ?? 0;
  const escalationThreshold = data.escalationThreshold ?? 0;

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Counterfactual Explainability</h3>
        <p className="text-xs text-slate-400 italic">
          What would need to change for this decision to be different?
        </p>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span>Current score: <span className="text-slate-200 font-mono">{originalScore.toFixed(1)}</span></span>
          <span>Escalation threshold: <span className="text-slate-200 font-mono">{escalationThreshold.toFixed(1)}</span></span>
        </div>
      </div>

      <div className="space-y-2">
        {counterfactuals.map((cf) => (
          <div
            key={cf.driverId}
            className="flex items-start gap-3 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs"
          >
            <div className="flex-1 min-w-0">
              <span className="font-medium text-slate-200 truncate">{driverLabel(cf.driverId)}</span>
              <p className="text-slate-400 mt-0.5">
                <span className="font-mono text-red-400">{(cf.currentValue ?? 0).toFixed(1)}</span>
                {" → "}
                <span className="font-mono text-emerald-400">{(cf.counterfactualValue ?? 0).toFixed(1)}</span>
                {" "}(would flip to <span className="text-slate-300">{cf.wouldFlipTo}</span>)
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${PLAUSIBILITY_STYLES[cf.plausibility] ?? PLAUSIBILITY_STYLES.medium}`}
              >
                {cf.plausibility}
              </span>
              <span className="text-slate-500 font-mono">
                −{(cf.deltaRequired ?? 0).toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {counterfactuals.length === 0 && (
        <p className="text-xs text-slate-500 py-2 text-center">No actionable counterfactual factors identified.</p>
      )}

      {immovableFactors.length > 0 && (
        <div className="mt-3 border-t border-slate-700 pt-3">
          <p className="text-xs font-medium text-slate-300 mb-1">🔒 Immovable factors</p>
          <ul className="space-y-1">
            {immovableFactors.map((f, i) => (
              <li key={i} className="text-xs text-slate-500 leading-relaxed">{f}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400 border-t border-slate-700 pt-3 leading-relaxed">
        {data.regulatoryStatement}
      </p>
    </div>
  );
}

export default CounterfactualCard;
