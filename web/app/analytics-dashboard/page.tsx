"use client";

import { useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { AnalyticsDashboardResponse, KpiTile, RiskBucket, GoamlPipelineItem } from "@/app/api/analytics-dashboard/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: KpiTile["status"]): string {
  switch (s) {
    case "green": return "text-emerald-300 bg-emerald-950/30 border-emerald-500/30";
    case "amber": return "text-amber-300 bg-amber-950/30 border-amber-500/30";
    case "red":   return "text-red-400 bg-red-950/30 border-red-500/30";
    default:      return "text-sky-300 bg-sky-950/30 border-sky-500/30";
  }
}

function statusDot(s: KpiTile["status"]): string {
  switch (s) {
    case "green": return "bg-emerald-500";
    case "amber": return "bg-amber-400";
    case "red":   return "bg-red-500";
    default:      return "bg-sky-400";
  }
}

function riskColor(tier: RiskBucket["tier"]): string {
  switch (tier) {
    case "high":   return "bg-red-500";
    case "medium": return "bg-amber-400";
    case "low":    return "bg-emerald-500";
  }
}

// ── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: KpiTile }) {
  return (
    <div className={`border rounded-xl p-4 flex flex-col gap-2 ${statusColor(kpi.status)}`}>
      <div className="flex items-center justify-between">
        <div className="text-10 font-semibold uppercase tracking-wide-3 opacity-70 leading-snug flex-1">
          {kpi.label}
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(kpi.status)}`} />
      </div>
      <div className="text-28 font-display font-bold tabular-nums leading-none">
        {kpi.value}
        {kpi.unit && <span className="text-13 font-normal opacity-60 ml-1">{kpi.unit}</span>}
      </div>
      {kpi.detail && <div className="text-10 opacity-60 leading-snug">{kpi.detail}</div>}
    </div>
  );
}

// ── Risk Distribution Bar ─────────────────────────────────────────────────────

function RiskDistributionBar({ data }: { data: RiskBucket[] }) {
  const total = data.reduce((s, b) => s + b.count, 0);
  if (total === 0) return <div className="text-12 text-ink-3 py-4">No cases in vault</div>;

  return (
    <div className="space-y-3">
      {data.map((b) => (
        <div key={b.tier} className="flex items-center gap-3">
          <div className="w-16 text-right text-11 font-semibold uppercase tracking-wide-2 text-ink-2">
            {b.tier}
          </div>
          <div className="flex-1 h-5 bg-bg-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${riskColor(b.tier)}`}
              style={{ width: `${Math.max(b.pct, b.count > 0 ? 1 : 0)}%` }}
            />
          </div>
          <div className="w-20 text-11 font-mono text-ink-2 text-right">
            {b.count} <span className="text-ink-4">({b.pct}%)</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── goAML Pipeline ────────────────────────────────────────────────────────────

function GoamlPipeline({ items }: { items: GoamlPipelineItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3 bg-bg-panel border border-hair-2 rounded-lg px-4 py-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            item.status === "green" ? "bg-emerald-500" :
            item.status === "amber" ? "bg-amber-400" : "bg-red-500"
          }`} />
          <div className="flex-1 text-12 font-medium text-ink-1">{item.stage}</div>
          <div className="font-mono text-16 font-bold text-ink-0 tabular-nums">{item.count}</div>
        </div>
      ))}
    </div>
  );
}

// ── Gauge (simple CSS arc) ────────────────────────────────────────────────────

function GaugeTile({ label, value, max, unit, status }: {
  label: string;
  value: number | null;
  max: number;
  unit: string;
  status: "green" | "amber" | "red" | "info";
}) {
  const pct = value !== null ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  const color = status === "green" ? "#10b981" : status === "amber" ? "#f59e0b" : status === "red" ? "#ef4444" : "#0ea5e9";

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 flex flex-col items-center gap-2">
      <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">{label}</div>
      <div className="relative w-24 h-12 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path d="M 5 50 A 45 45 0 0 1 95 50" fill="none" stroke="var(--bg-2)" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M 5 50 A 45 45 0 0 1 95 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 141.4} 141.4`}
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 text-center font-mono text-14 font-bold tabular-nums" style={{ color }}>
          {value !== null ? `${value}` : "—"}
        </div>
      </div>
      <div className="text-10 text-ink-4">{unit}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState<AnalyticsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/analytics-dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(apiErrorMessage(r.status, r.statusText));
        return r.json();
      })
      .then((d: AnalyticsDashboardResponse) => { setData(d); setRefreshedAt(new Date()); })
      .catch((e) => setError(caughtErrorMessage(e, "Failed to load analytics")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <ModuleLayout asanaModule="analytics-dashboard" asanaLabel="Analytics Dashboard" onRun={load} onSync={load}>
      <div className="mb-6 border-b-2 border-ink-0 pb-4 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-10.5 font-semibold uppercase tracking-wide-4 text-brand mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
            Finance & Compliance Analytics
          </div>
          <h1 className="font-display text-28 md:text-48 text-ink-0 m-0 leading-tight">
            Analytics <em className="italic text-brand">dashboard.</em>
          </h1>
          <p className="text-13 text-ink-2 mt-1 max-w-[70ch]">
            Risk distribution · KPIs · goAML pipeline · bias ratio · model drift — live from the metrics store.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-12 font-semibold border border-hair-2 bg-bg-panel hover:bg-bg-1 text-ink-1 transition-colors disabled:opacity-40"
        >
          {loading ? "Loading…" : "↺ Refresh"}
        </button>
      </div>

      {refreshedAt && (
        <div className="text-10 text-ink-4 mb-4">
          Last refreshed: {refreshedAt.toLocaleTimeString()}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-13 p-4 border border-red-500/30 rounded-xl bg-red-950/20 mb-6">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-bg-1 rounded-xl" />)}
          </div>
          <div className="h-48 bg-bg-1 rounded-xl" />
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {/* KPI grid */}
          <div>
            <h2 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-3 mb-3">Key Performance Indicators</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.kpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
            </div>
          </div>

          {/* Risk distribution + goAML side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
              <h2 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-3 mb-4">Risk Distribution</h2>
              <RiskDistributionBar data={data.riskDistribution} />
              <div className="mt-3 text-10 text-ink-4">
                Total cases: {data.riskDistribution.reduce((s, b) => s + b.count, 0)}
              </div>
            </div>

            <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
              <h2 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-3 mb-4">goAML Pipeline</h2>
              <GoamlPipeline items={data.goamlPipeline} />
            </div>
          </div>

          {/* Gauge metrics */}
          <div>
            <h2 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-3 mb-3">AI System Health</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <GaugeTile
                label="Bias Ratio"
                value={data.biasRatio}
                max={2}
                unit="target ≤ 1.15"
                status={data.biasRatio === null ? "info" : data.biasRatio <= 1.15 ? "green" : data.biasRatio <= 1.5 ? "amber" : "red"}
              />
              <GaugeTile
                label="Drift Score"
                value={data.driftScore}
                max={0.5}
                unit="target < 0.10"
                status={data.driftScore === null ? "info" : data.driftScore < 0.1 ? "green" : data.driftScore < 0.2 ? "amber" : "red"}
              />
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 flex flex-col items-center gap-2 justify-center">
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">FDL Reference</div>
                <div className="text-11 text-center text-ink-2">Federal Decree-Law No. 10 of 2025 Art.18</div>
                <div className="text-9 text-ink-4 text-center">Human oversight on all AI outputs</div>
              </div>
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 flex flex-col items-center gap-2 justify-center">
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">FATF R.10</div>
                <div className="text-11 text-center text-ink-2">Non-discrimination</div>
                <div className="text-9 text-ink-4 text-center">Bias floor: biasRatio ≤ 1.5</div>
              </div>
            </div>
          </div>

          <div className="text-10 text-ink-4">
            Generated {new Date(data.generatedAt).toLocaleString()} · Tenant: {data.tenantId}
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
