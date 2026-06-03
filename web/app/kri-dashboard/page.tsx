"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { KriDashboardResponse, KriResult, KriStatus } from "@/app/api/kri-dashboard/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: KriStatus): string {
  switch (s) {
    case "green":   return "text-emerald-300 bg-emerald-950/30 border-emerald-500/40";
    case "amber":   return "text-amber-300 bg-amber-950/30 border-amber-500/40";
    case "red":     return "text-red-300 bg-red-950/30 border-red-500/40";
    default:        return "text-ink-3 bg-bg-1 border-hair-2";
  }
}

function statusDot(s: KriStatus): string {
  switch (s) {
    case "green":  return "bg-emerald-500";
    case "amber":  return "bg-amber-400";
    case "red":    return "bg-red-500";
    default:       return "bg-ink-4";
  }
}

function statusLabel(s: KriStatus): string {
  switch (s) {
    case "green":   return "GREEN";
    case "amber":   return "AMBER";
    case "red":     return "RED";
    default:        return "NO DATA";
  }
}

function fmtBand(b: [number, number | null], unit: string): string {
  const hi = b[1] == null || b[1] === Infinity ? "∞" : String(b[1]);
  return `${b[0]}–${hi} ${unit}`;
}

// ── KRI Card ─────────────────────────────────────────────────────────────────

function KriCard({ kri }: { kri: KriResult }) {
  const isLowerBetter = kri.direction === "lower_better";

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 leading-snug flex-1">
          {kri.label}
        </div>
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 shrink-0 ${statusColor(kri.status)}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot(kri.status)}`} />
          {statusLabel(kri.status)}
        </span>
      </div>

      <div className="text-24 font-semibold text-ink-0 leading-none tabular-nums">
        {kri.value !== null ? (
          <>
            {kri.value}
            <span className="text-13 font-normal text-ink-3 ml-1">{kri.unit}</span>
          </>
        ) : (
          <span className="text-16 text-ink-4">—</span>
        )}
      </div>

      <div className="flex flex-col gap-0.5 mt-auto">
        <div className="flex gap-1 text-9 font-mono">
          <span className={`px-1 rounded ${kri.status === "green" ? "bg-emerald-950/30 text-emerald-300" : "bg-bg-1 text-ink-3"}`}>
            G {fmtBand(kri.band.green, kri.unit)}
          </span>
          <span className={`px-1 rounded ${kri.status === "amber" ? "bg-amber-950/30 text-amber-300" : "bg-bg-1 text-ink-3"}`}>
            A {fmtBand(kri.band.amber, kri.unit)}
          </span>
          <span className={`px-1 rounded ${kri.status === "red" ? "bg-red-950/30 text-red-300" : "bg-bg-1 text-ink-3"}`}>
            R {fmtBand(kri.band.red, kri.unit)}
          </span>
        </div>
        <div className="text-9 text-ink-4 truncate" title={kri.derivedFrom}>
          {isLowerBetter ? "↓ lower is better" : "↑ higher is better"} · {kri.derivedFrom}
        </div>
      </div>
    </div>
  );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: KriDashboardResponse["summary"] }) {
  const total = summary.green + summary.amber + summary.red + summary.no_data;
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 flex flex-wrap items-center gap-4">
      <div className="text-11 text-ink-2">
        <span className="font-semibold text-ink-0">{total}</span> key risk indicators
      </div>
      <div className="flex gap-2 flex-wrap">
        {(
          [
            { key: "green", label: "Green", cls: "bg-emerald-950/30 text-emerald-300 border-emerald-500/40" },
            { key: "amber", label: "Amber", cls: "bg-amber-950/30 text-amber-300 border-amber-500/40" },
            { key: "red", label: "Red", cls: "bg-red-950/30 text-red-300 border-red-500/40" },
            { key: "no_data", label: "No data", cls: "bg-bg-1 text-ink-3 border-hair-2" },
          ] as const
        ).map(({ key, label, cls }) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-10 font-semibold uppercase tracking-wide-2 ${cls}`}
          >
            {summary[key]} {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KriDashboardPage() {
  const [data, setData] = useState<KriDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kri-dashboard");
      if (!res.ok) { setError(apiErrorMessage(res.status)); return; }
      const json = await res.json() as KriDashboardResponse;
      setData(json);
      setRefreshedAt(new Date());
    } catch (err) {
      setError(caughtErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <ModuleLayout asanaModule="kri-dashboard" asanaLabel="KRI Dashboard" engineLabel="Risk Indicators">
      <ModuleHero
        eyebrow=""
        title="KRI"
        titleEm="dashboard."
        intro={
          <>
            <strong>14 forward-looking key risk indicators</strong> across customer exposure,
            transaction behaviour, operational controls, and data quality. Each KRI is classified
            green / amber / red against the risk-appetite band. KRIs sourced from the live case vault
            update in real time; external-signal KRIs show &ldquo;no data&rdquo; until the relevant
            feed is connected.
          </>
        }
      />
      <ModuleFamilyBar
        suiteName="Leadership Tools"
        modules={[
          { label: "KRI Dashboard", href: "/kri-dashboard", icon: "📊" },
          { label: "Board Dashboard", href: "/board-dashboard", icon: "🏛️" },
        ]}
      />

      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        {refreshedAt && (
          <div className="text-11 text-ink-3 font-mono">
            Last refreshed {refreshedAt.toLocaleTimeString()}
          </div>
        )}
        <button
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-12 font-medium text-ink-1 hover:bg-bg-1 disabled:opacity-50 transition-colors"
        >
          {loading ? "Refreshing…" : "↺ Refresh"}
        </button>
      </div>

      {loading && !data ? (
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 text-13 text-ink-2">
          Loading KRI values…
        </div>
      ) : error ? (
        <div className="bg-red-950/20 border border-red-500/40 rounded-lg p-4 text-13 text-red-300">
          Could not load KRI dashboard: {error}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <SummaryBar summary={data.summary} />

          {(data.summary.red > 0) && (
            <div className="bg-red-950/20 border border-red-500/40 rounded-lg px-4 py-2 flex items-center gap-2 text-12 text-red-300 font-medium">
              <span>⚠</span>
              <span>{data.summary.red} KRI{data.summary.red > 1 ? "s" : ""} in the RED band — immediate MLRO review required.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(data.kris ?? []).map((kri) => (
              <KriCard key={kri.id} kri={kri} />
            ))}
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 text-11 text-ink-3">
            <span className="font-semibold text-ink-2">Data sources:</span> KRIs marked &ldquo;no data&rdquo;
            require an external signal feed. Connect the relevant Hawkeye module (DPMS transaction
            monitor, training tracker, crypto risk feed, supply-chain DD) to populate live values.
            KRIs derived from the case vault update on every refresh.
          </div>
        </div>
      ) : null}
    </ModuleLayout>
  );
}
