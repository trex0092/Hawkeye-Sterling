"use client";

import { useEffect, useState, useCallback } from "react";

type FatigueLevel = "optimal" | "moderate" | "elevated" | "critical";

interface FatigueSignal {
  type: string;
  severity: string;
  description: string;
}

interface CognitiveLoadResponse {
  actorId: string;
  fatigueLevel: FatigueLevel;
  fatigueScore: number;
  signals: FatigueSignal[];
  reviewedCount: number;
  windowHours: number;
}

export interface CognitiveLoadBadgeProps {
  actorId: string;
  className?: string;
  compact?: boolean;
}

const LEVEL_STYLES: Record<FatigueLevel, { dot: string; text: string; bar: string; label: string }> = {
  optimal:  { dot: "bg-emerald-500", text: "text-emerald-400", bar: "bg-emerald-500", label: "Optimal" },
  moderate: { dot: "bg-yellow-500",  text: "text-yellow-400",  bar: "bg-yellow-500",  label: "Moderate" },
  elevated: { dot: "bg-orange-500",  text: "text-orange-400",  bar: "bg-orange-500",  label: "Elevated" },
  critical: { dot: "bg-red-500",     text: "text-red-400",     bar: "bg-red-500",     label: "Critical" },
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function isFatigueLevel(val: string): val is FatigueLevel {
  return ["optimal", "moderate", "elevated", "critical"].includes(val);
}

export function CognitiveLoadBadge({ actorId, className = "", compact = false }: CognitiveLoadBadgeProps) {
  const [data, setData] = useState<CognitiveLoadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/cognitive-load?actorId=${encodeURIComponent(actorId)}`)
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          setHidden(true);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CognitiveLoadResponse>;
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch((err: unknown) => {
        console.warn("[CognitiveLoadBadge] fetch error:", err);
      })
      .finally(() => setLoading(false));
  }, [actorId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (hidden) return null;

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 animate-pulse ${className}`}>
        <div className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        <div className="h-3 w-16 bg-slate-700 rounded" />
      </div>
    );
  }

  if (!data) return null;

  const level = isFatigueLevel(data.fatigueLevel) ? data.fatigueLevel : "optimal";
  const styles = LEVEL_STYLES[level];

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${styles.dot}`} />
        <span className={`text-xs font-medium ${styles.text}`}>{styles.label}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900 p-3 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${styles.dot}`} />
          <span className="text-sm font-medium text-slate-100">Cognitive Load</span>
        </div>
        <span className={`text-xs font-semibold ${styles.text}`}>{styles.label}</span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Fatigue score</span>
          <span className="font-mono text-slate-200">{data.fatigueScore.toFixed(0)}/100</span>
        </div>
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${styles.bar}`}
            style={{ width: `${Math.min(data.fatigueScore, 100)}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-2">
        {data.reviewedCount} cases reviewed in {data.windowHours}h window
      </p>

      {data.signals.length > 0 && (
        <ul className="space-y-1">
          {data.signals.map((sig, i) => (
            <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">
                {sig.severity === "high" ? "🔴" : sig.severity === "medium" ? "🟡" : "🟢"}
              </span>
              <span>{sig.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CognitiveLoadBadge;
