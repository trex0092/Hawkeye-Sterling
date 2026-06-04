"use client";

import { useEffect, useState } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";

type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Mirrors ForecastResult from src/brain/temporal-forecast-engine.ts, returned
// by /api/temporal-threat-forecast as { ok: true, ...result }.
interface ThreatFactor {
  kind: "sanctions_exposure" | "cahra_reactivation" | "pep_transition" | "dormant_account";
  currentRisk: number;
  forecastRisk: number;
  peakDate: string;
  decayLambda: number;
  correlatedEvents: string[];
}

interface GeopoliticalTrigger {
  country: string;
  eventType: string;
  riskLevel: number;
  daysUntilEvent: number;
  description: string;
}

interface ThreatForecastResponse {
  ok?: boolean;
  caseId: string;
  forecastAt: string;
  factors: ThreatFactor[];
  overallThreatHorizonDays: number;
  peakRiskDate: string;
  confidenceInterval: { low: number; mean: number; high: number };
  triggeringEvents: GeopoliticalTrigger[];
  methodology: string;
}

export interface ThreatForecastWidgetProps {
  caseId: string;
  subject?: string;
  className?: string;
}

const LEVEL_STYLES: Record<ThreatLevel, { badge: string; ring: string; label: string }> = {
  LOW:      { badge: "bg-emerald-900 text-emerald-300 border-emerald-600", ring: "ring-emerald-500", label: "LOW" },
  MEDIUM:   { badge: "bg-yellow-900 text-yellow-300 border-yellow-600",   ring: "ring-yellow-500",  label: "MEDIUM" },
  HIGH:     { badge: "bg-orange-900 text-orange-300 border-orange-600",   ring: "ring-orange-500",  label: "HIGH" },
  CRITICAL: { badge: "bg-red-900 text-red-300 border-red-600",            ring: "ring-red-500",     label: "CRITICAL" },
};

const FACTOR_LABELS: Record<ThreatFactor["kind"], string> = {
  sanctions_exposure: "Sanctions exposure",
  cahra_reactivation: "CAHRA reactivation",
  pep_transition: "PEP transition",
  dormant_account: "Dormant account",
};

function levelFromRisk(risk: number): ThreatLevel {
  if (risk >= 0.75) return "CRITICAL";
  if (risk >= 0.5) return "HIGH";
  if (risk >= 0.25) return "MEDIUM";
  return "LOW";
}

const TRIGGER_ICONS: Record<string, string> = {
  default: "⚡",
  sanctions: "🚫",
  conflict: "💥",
  election: "🗳",
  financial_crisis: "💸",
  regulatory: "📜",
};

function getTriggerIcon(eventType: string): string {
  return TRIGGER_ICONS[eventType] ?? TRIGGER_ICONS["default"] ?? "⚡";
}

export function ThreatForecastWidget({ caseId, subject, className = "" }: ThreatForecastWidgetProps) {
  const [data, setData] = useState<ThreatForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/temporal-threat-forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, subject: subject ? { name: subject } : undefined }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ThreatForecastResponse>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err: unknown) => {
        if (!cancelled) setError(caughtErrorMessage(err, "Failed to load forecast"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [caseId, subject]);

  if (loading) {
    return (
      <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 animate-pulse ${className}`}>
        <div className="flex gap-4 mb-4">
          <div className="h-16 w-16 rounded-full bg-slate-700 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-slate-700 rounded" />
            <div className="h-3 w-48 bg-slate-700 rounded" />
            <div className="h-3 w-40 bg-slate-700 rounded" />
          </div>
        </div>
        <div className="h-3 w-full bg-slate-700 rounded mb-2" />
        <div className="h-3 w-4/5 bg-slate-700 rounded" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`rounded-lg border border-red-800 bg-slate-900 p-4 ${className}`}>
        <span className="text-xs text-red-400 font-medium">⚠ Forecast unavailable: {error}</span>
      </div>
    );
  }

  const factors = Array.isArray(data.factors) ? data.factors : [];
  const triggers = Array.isArray(data.triggeringEvents) ? data.triggeringEvents : [];
  const ci = data.confidenceInterval ?? { low: 0, mean: 0, high: 0 };
  const peakForecastRisk = factors.reduce((m, f) => Math.max(m, f.forecastRisk ?? 0), 0);
  const threatLevel = levelFromRisk(Math.max(peakForecastRisk, ci.mean ?? 0));
  const styles = LEVEL_STYLES[threatLevel];
  const probPct = Math.round((ci.mean ?? 0) * 100);
  const ciLow = Math.round((ci.low ?? 0) * 100);
  const ciHigh = Math.round((ci.high ?? 0) * 100);
  const horizonDays = data.overallThreatHorizonDays ?? 0;

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900 p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-100 mb-3">Temporal Threat Forecast</h3>

      <div className="flex items-start gap-4 mb-4">
        <div
          className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 ring-2 ${styles.badge} ${styles.ring}`}
        >
          <span className="text-xs font-bold leading-none">{styles.label}</span>
        </div>

        <div className="flex-1 space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Probability:</span>
            <div className="flex-1 h-2 bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full rounded ${threatLevel === "CRITICAL" ? "bg-red-500" : threatLevel === "HIGH" ? "bg-orange-500" : threatLevel === "MEDIUM" ? "bg-yellow-500" : "bg-emerald-500"}`}
                style={{ width: `${probPct}%` }}
              />
            </div>
            <span className="font-mono text-slate-200 w-8 text-right">{probPct}%</span>
          </div>
          <p className="text-slate-400">
            Horizon: <span className="text-slate-200 font-mono">{horizonDays}d</span>
          </p>
          <p className="text-slate-400">
            CI: <span className="text-slate-200 font-mono">{ciLow}%–{ciHigh}%</span>
          </p>
          <p className="text-slate-400">
            Peak risk date: <span className="text-slate-200 font-mono">{data.peakRiskDate}</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-4 bg-slate-800 rounded p-3 border border-slate-700">
        Across {factors.length} risk factor{factors.length === 1 ? "" : "s"}, peak materialisation is projected
        for {data.peakRiskDate}. {data.methodology}
      </p>

      {factors.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-400 mb-2">Risk factors</p>
          <ul className="space-y-1">
            {factors.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span>{FACTOR_LABELS[f.kind] ?? f.kind}</span>
                <span className="font-mono text-slate-400">
                  {Math.round((f.currentRisk ?? 0) * 100)}% → {Math.round((f.forecastRisk ?? 0) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {triggers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Triggering events</p>
          <ul className="space-y-1">
            {triggers.map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="shrink-0">{getTriggerIcon(t.eventType)}</span>
                <span>{t.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ThreatForecastWidget;
