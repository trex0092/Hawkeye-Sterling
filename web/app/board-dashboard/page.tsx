"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { BoardDashboardResponse, BoardPanel, BoardMetric } from "@/app/api/board-dashboard/route";

// ── Status helpers ────────────────────────────────────────────────────────────

function metricStatusCls(s: BoardMetric["status"]): string {
  switch (s) {
    case "ok":       return "text-emerald-300";
    case "warn":     return "text-amber-400";
    case "critical": return "text-red-400 font-semibold";
    default:         return "text-ink-1";
  }
}

function postureBadge(p: BoardDashboardResponse["overallPosture"]): {
  label: string;
  cls: string;
  dot: string;
} {
  switch (p) {
    case "healthy":
      return { label: "HEALTHY", cls: "bg-emerald-950/30 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-500" };
    case "attention":
      return { label: "ATTENTION", cls: "bg-amber-950/30 text-amber-300 border-amber-500/40", dot: "bg-amber-400" };
    case "critical":
      return { label: "CRITICAL", cls: "bg-red-950/30 text-red-300 border-red-500/40", dot: "bg-red-500 animate-pulse" };
  }
}

// ── Panel Card ────────────────────────────────────────────────────────────────

function PanelCard({ panel }: { panel: BoardPanel }) {
  const hasCritical = panel.metrics.some((m) => m.status === "critical");
  const hasWarn = panel.metrics.some((m) => m.status === "warn");
  const borderCls = hasCritical
    ? "border-red-500/40 bg-red-950/10"
    : hasWarn
    ? "border-amber-500/40 bg-amber-950/10"
    : "border-hair-2 bg-bg-panel";

  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-3 ${borderCls}`}>
      <div className="flex items-center gap-2">
        <span className="text-16">{panel.icon}</span>
        <div className="text-12 font-semibold text-ink-0">{panel.title}</div>
        {hasCritical && (
          <span className="ml-auto inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 bg-red-950/30 text-red-300 border-red-500/40">
            critical
          </span>
        )}
        {!hasCritical && hasWarn && (
          <span className="ml-auto inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 bg-amber-950/30 text-amber-300 border-amber-500/40">
            attention
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {panel.metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-2">
            <span className="text-11 text-ink-2">{m.label}</span>
            <span className={`text-12 font-mono tabular-nums ${metricStatusCls(m.status)}`}>
              {m.value}
              {m.unit ? <span className="text-10 font-normal text-ink-3 ml-0.5">{m.unit}</span> : null}
            </span>
          </div>
        ))}
      </div>

      {panel.summary && (
        <div className="text-11 text-ink-3 border-t border-hair-2 pt-2 leading-snug">
          {panel.summary}
        </div>
      )}
    </div>
  );
}

// ── Posture Banner ────────────────────────────────────────────────────────────

function PostureBanner({ posture, generatedAt }: { posture: BoardDashboardResponse["overallPosture"]; generatedAt: string }) {
  const badge = postureBadge(posture);
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-0.5">
          Overall compliance posture
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-12 font-semibold uppercase tracking-wide-2 ${badge.cls}`}
          >
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>
      </div>
      <div className="text-11 text-ink-3 font-mono">
        Generated {new Date(generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BoardDashboardPage() {
  const [data, setData] = useState<BoardDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/board-dashboard");
      if (!res.ok) { setError(apiErrorMessage(res.status, "Board dashboard")); return; }
      const json = await res.json() as BoardDashboardResponse;
      setData(json);
    } catch (err) {
      setError(caughtErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <ModuleLayout engineLabel="Board View">
      <ModuleHero
        eyebrow="Leadership · Executive View"
        title="Board"
        titleEm="dashboard."
        intro={
          <>
            <strong>Single-screen compliance posture for CRO, CCO, and Board members.</strong>{" "}
            Aggregates case backlog, KRI status, AI system health, upcoming regulatory
            obligations, and active alerts. No AML detail — senior-management signal only.
            Full case data available to MLRO via the Screening and Cases modules.
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

      <div className="flex justify-end mb-2">
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
          Loading board dashboard…
        </div>
      ) : error ? (
        <div className="bg-red-950/20 border border-red-500/40 rounded-lg p-4 text-13 text-red-300">
          Could not load board dashboard: {error}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <PostureBanner posture={data.overallPosture} generatedAt={data.generatedAt} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.panels.map((panel) => (
              <PanelCard key={panel.id} panel={panel} />
            ))}
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 flex flex-wrap gap-4 text-11 text-ink-3">
            <span>
              <span className="font-semibold text-ink-2">Scope:</span> Live case vault + platform configuration.
            </span>
            <span>
              <span className="font-semibold text-ink-2">Refresh:</span> On demand — click ↺ or reload page.
            </span>
            <span>
              <span className="font-semibold text-ink-2">Detail:</span>{" "}
              <a href="/kri-dashboard" className="underline">KRI Dashboard</a> · <a href="/screening" className="underline">Screening Queue</a> · <a href="/audit-trail" className="underline">Audit Trail</a>
            </span>
          </div>
        </div>
      ) : null}
    </ModuleLayout>
  );
}
