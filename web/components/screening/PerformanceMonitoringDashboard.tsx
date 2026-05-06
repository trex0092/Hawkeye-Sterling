// PerformanceMonitoringDashboard — live calibration / drift / mode
// performance dashboard for the MLRO. Required by HS-OPS-003 Day 2 PM
// ("How do you know the system is working correctly?") and HS-MC-001
// §6.1 (operational metrics surface).
//
// Wires three endpoints into one panel:
//   · /api/mlro/brier            — overall + per-mode calibration
//   · /api/mlro/mode-performance — leaderboard + drift bucket
//   · /api/mlro/drift-alerts     — current vs baseline alerts
//
// Accessibility:
//   · tablist / tab / tabpanel pattern (WAI-ARIA APG)
//   · arrow-key navigation between tabs (WCAG 2.1.1, 2.4.3)
//   · aria-live region for refresh status (WCAG 4.1.3)
//   · semantic <table> with <caption> + scope on headers
//   · color is never the only signal — every status carries a label

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface BrierMode {
  modeId: string;
  total: number;
  resolved: number;
  brierMean: number;
  logScoreMean: number;
  agreementRate: number;
  drift: "stable" | "drifting" | "uncalibrated";
}

interface BrierResponse {
  ok: boolean;
  total: number;
  modes: BrierMode[];
}

interface ModePerfRow {
  rank: number;
  modeId: string;
  total: number;
  resolved: number;
  brierMean: number;
  logScoreMean: number;
  agreementRate: number;
  drift: "stable" | "drifting" | "uncalibrated";
}

interface ModePerfResponse {
  ok: boolean;
  total: number;
  returned: number;
  recordsConsidered: number;
  modes: ModePerfRow[];
}

interface DriftAlert {
  id: string;
  modeId: string;
  severity: "info" | "warn" | "critical";
  category: string;
  current: number;
  baseline: number;
  delta: number;
  message: string;
}

interface DriftResponse {
  ok: boolean;
  generatedAt: string;
  window: { since: string; until: string; days: number };
  baseline: { since: string; until: string; days: number };
  modesEvaluated: number;
  modesAlerting: number;
  alertsByCategory: Record<string, number>;
  alerts: DriftAlert[];
}

type TabId = "calibration" | "modes" | "alerts";

interface Props {
  className?: string;
  /** Auto-refresh interval in ms; 0 disables. Default 60_000 (1 min). */
  refreshMs?: number;
}

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "calibration", label: "Calibration" },
  { id: "modes", label: "Mode performance" },
  { id: "alerts", label: "Drift alerts" },
];

const ECE_TARGET = 0.04; // HS-GOV-001 §3 — ECE ≤ 4% tolerance

function formatPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function formatNum(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function severityTone(sev: DriftAlert["severity"]): string {
  if (sev === "critical") return "bg-rose-100 text-rose-900 border-rose-200";
  if (sev === "warn") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-sky-100 text-sky-900 border-sky-200";
}

function driftTone(d: BrierMode["drift"]): string {
  if (d === "stable") return "bg-emerald-100 text-emerald-900 border-emerald-200";
  if (d === "drifting") return "bg-rose-100 text-rose-900 border-rose-200";
  return "bg-bg-2 text-ink-1 border-hair-2";
}

export function PerformanceMonitoringDashboard({
  className,
  refreshMs = 60_000,
}: Props): JSX.Element {
  const [tab, setTab] = useState<TabId>("calibration");
  const [brier, setBrier] = useState<BrierResponse | null>(null);
  const [modes, setModes] = useState<ModePerfResponse | null>(null);
  const [drift, setDrift] = useState<DriftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    calibration: null,
    modes: null,
    alerts: null,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brierRes, modesRes, driftRes] = await Promise.all([
        fetch("/api/mlro/brier", { headers: { accept: "application/json" } }),
        fetch("/api/mlro/mode-performance?sort=brier&direction=desc&limit=200", {
          headers: { accept: "application/json" },
        }),
        fetch("/api/mlro/drift-alerts", { headers: { accept: "application/json" } }),
      ]);
      if (!brierRes.ok) throw new Error(`Calibration endpoint HTTP ${brierRes.status}`);
      if (!modesRes.ok) throw new Error(`Mode performance endpoint HTTP ${modesRes.status}`);
      if (!driftRes.ok) throw new Error(`Drift alerts endpoint HTTP ${driftRes.status}`);
      setBrier((await brierRes.json()) as BrierResponse);
      setModes((await modesRes.json()) as ModePerfResponse);
      setDrift((await driftRes.json()) as DriftResponse);
      setRefreshedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load performance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (refreshMs <= 0) return;
    const handle = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(handle);
  }, [refresh, refreshMs]);

  const overallEce = useMemo(() => {
    if (!brier?.modes?.length) return null;
    const resolved = brier.modes.filter((m) => m.resolved > 0);
    if (resolved.length === 0) return null;
    const sum = resolved.reduce((s, m) => s + m.brierMean * m.resolved, 0);
    const denom = resolved.reduce((s, m) => s + m.resolved, 0);
    return denom > 0 ? sum / denom : null;
  }, [brier]);

  const overallStatus = useMemo(() => {
    if (overallEce === null) return { label: "No data", tone: "bg-bg-2 text-ink-1" };
    if (overallEce <= ECE_TARGET) return { label: "Within tolerance", tone: "bg-emerald-100 text-emerald-900" };
    if (overallEce <= ECE_TARGET * 1.5) return { label: "Watch", tone: "bg-amber-100 text-amber-900" };
    return { label: "Drift — pause threshold", tone: "bg-rose-100 text-rose-900" };
  }, [overallEce]);

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const idx = TABS.findIndex((t) => t.id === tab);
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const nextIdx = (idx + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
      const nextTab = TABS[nextIdx]!.id;
      setTab(nextTab);
      tabRefs.current[nextTab]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = TABS[0]!.id;
      setTab(first);
      tabRefs.current[first]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = TABS[TABS.length - 1]!.id;
      setTab(last);
      tabRefs.current[last]?.focus();
    }
  };

  const containerClass = ["bg-bg-panel border border-hair-2 rounded-xl p-4", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-labelledby="perf-dashboard-title"
      className={containerClass}
    >
      <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 id="perf-dashboard-title" className="font-display text-20 leading-none tracking-tightest text-ink-0 m-0">
            Performance monitoring
          </h2>
          <p className="font-mono text-10 uppercase tracking-wide-3 text-ink-2 mt-1">
            Calibration · drift · mode effectiveness
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-10 text-ink-2" aria-live="polite">
            {refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString()}` : "Loading…"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 text-ink-1 hover:border-brand hover:text-brand rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <SummaryStrip
        ece={overallEce}
        status={overallStatus}
        modesEvaluated={drift?.modesEvaluated ?? brier?.total ?? 0}
        alerts={drift?.alerts ?? []}
      />

      {error ? (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-900 text-12 px-3 py-2 rounded-md mb-3 mt-3">
          {error}
        </div>
      ) : null}

      <div role="tablist" aria-label="Performance views" className="flex gap-1 border-b border-hair-2 mb-3 mt-4">
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              role="tab"
              aria-selected={selected}
              aria-controls={`perf-panel-${t.id}`}
              id={`perf-tab-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onKeyDown={onTabKey}
              onClick={() => setTab(t.id)}
              className={`text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border-b-2 -mb-px font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${
                selected
                  ? "border-brand text-brand-deep"
                  : "border-transparent text-ink-2 hover:text-ink-1"
              }`}
            >
              {t.label}
              {t.id === "alerts" && drift?.alerts.length ? (
                <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-100 text-rose-900 text-9 font-mono">
                  {drift.alerts.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id={`perf-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`perf-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 rounded"
      >
        {tab === "calibration" ? <CalibrationPanel data={brier} loading={loading} /> : null}
        {tab === "modes" ? <ModesPanel data={modes} loading={loading} /> : null}
        {tab === "alerts" ? <AlertsPanel data={drift} loading={loading} /> : null}
      </div>
    </section>
  );
}

function SummaryStrip({
  ece,
  status,
  modesEvaluated,
  alerts,
}: {
  ece: number | null;
  status: { label: string; tone: string };
  modesEvaluated: number;
  alerts: readonly DriftAlert[];
}): JSX.Element {
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warn = alerts.filter((a) => a.severity === "warn").length;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-12">
      <SummaryCard
        label="Overall ECE"
        value={ece === null ? "—" : formatPct(ece, 2)}
        helper={`Target ≤ ${formatPct(ECE_TARGET, 0)} (HS-GOV-001 §3)`}
      />
      <SummaryCard label="Status" value={status.label} tone={status.tone} />
      <SummaryCard
        label="Modes evaluated"
        value={String(modesEvaluated)}
        helper="From calibration window"
      />
      <SummaryCard
        label="Drift alerts"
        value={alerts.length === 0 ? "0 — clear" : `${critical} critical · ${warn} warn`}
        tone={
          critical > 0
            ? "bg-rose-100 text-rose-900"
            : warn > 0
              ? "bg-amber-100 text-amber-900"
              : "bg-emerald-100 text-emerald-900"
        }
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: string;
}): JSX.Element {
  return (
    <div className={`border border-hair-2 rounded-lg p-3 ${tone ?? "bg-bg-1"}`}>
      <div className="font-mono text-9 uppercase tracking-wide-4 text-ink-2">{label}</div>
      <div className="font-display text-20 tracking-tightest text-ink-0 leading-none mt-1">{value}</div>
      {helper ? <div className="font-mono text-10 text-ink-2 mt-1">{helper}</div> : null}
    </div>
  );
}

function CalibrationPanel({
  data,
  loading,
}: {
  data: BrierResponse | null;
  loading: boolean;
}): JSX.Element {
  if (loading && !data) return <SkeletonTable rows={6} columns={5} />;
  if (!data || data.modes.length === 0) {
    return (
      <EmptyState
        title="No calibration data yet"
        body="Calibration scores accrue once outcome feedback (groundTruth: confirmed | reversed) is recorded for screened modes."
      />
    );
  }
  const sorted = [...data.modes].sort((a, b) => b.brierMean - a.brierMean);
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-12 border-collapse">
        <caption className="sr-only">Per-mode Brier and log-score calibration results</caption>
        <thead>
          <tr className="text-left border-b border-hair-2">
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2">Mode</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Total</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Resolved</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Brier</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Log-score</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Agreement</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2">Drift</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.modeId} className="border-b border-hair-2 last:border-0 hover:bg-bg-2/50">
              <td className="font-mono text-11 text-ink-0 py-1.5 px-2 break-all">{m.modeId}</td>
              <td className="font-mono text-11 text-ink-1 py-1.5 px-2 text-right tabular-nums">{m.total}</td>
              <td className="font-mono text-11 text-ink-1 py-1.5 px-2 text-right tabular-nums">{m.resolved}</td>
              <td className="font-mono text-11 text-ink-0 py-1.5 px-2 text-right tabular-nums">{formatNum(m.brierMean)}</td>
              <td className="font-mono text-11 text-ink-1 py-1.5 px-2 text-right tabular-nums">{formatNum(m.logScoreMean)}</td>
              <td className="font-mono text-11 text-ink-1 py-1.5 px-2 text-right tabular-nums">{formatPct(m.agreementRate, 0)}</td>
              <td className="py-1.5 px-2">
                <span className={`font-mono text-9 uppercase tracking-wide-3 px-2 py-0.5 rounded border ${driftTone(m.drift)}`}>
                  {m.drift}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModesPanel({
  data,
  loading,
}: {
  data: ModePerfResponse | null;
  loading: boolean;
}): JSX.Element {
  if (loading && !data) return <SkeletonTable rows={8} columns={6} />;
  if (!data || data.modes.length === 0) {
    return (
      <EmptyState
        title="No mode performance data"
        body="Once outcome feedback is recorded, the per-mode leaderboard ranks reasoning modes by Brier (lower is better)."
      />
    );
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-12 border-collapse">
        <caption className="sr-only">Reasoning mode effectiveness leaderboard</caption>
        <thead>
          <tr className="text-left border-b border-hair-2">
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2">#</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2">Mode</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Runs</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Resolved</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Brier</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2 text-right">Agree</th>
            <th scope="col" className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 py-1.5 px-2">Drift</th>
          </tr>
        </thead>
        <tbody>
          {data.modes.map((m) => (
            <tr key={m.modeId} className="border-b border-hair-2 last:border-0 hover:bg-bg-2/50">
              <td className="font-mono text-11 text-ink-2 py-1.5 px-2 tabular-nums">{m.rank}</td>
              <td className="font-mono text-11 text-ink-0 py-1.5 px-2 break-all">{m.modeId}</td>
              <td className="font-mono text-11 text-ink-1 py-1.5 px-2 text-right tabular-nums">{m.total}</td>
              <td className="font-mono text-11 text-ink-1 py-1.5 px-2 text-right tabular-nums">{m.resolved}</td>
              <td className="font-mono text-11 text-ink-0 py-1.5 px-2 text-right tabular-nums">{formatNum(m.brierMean)}</td>
              <td className="font-mono text-11 text-ink-1 py-1.5 px-2 text-right tabular-nums">{formatPct(m.agreementRate, 0)}</td>
              <td className="py-1.5 px-2">
                <span className={`font-mono text-9 uppercase tracking-wide-3 px-2 py-0.5 rounded border ${driftTone(m.drift)}`}>
                  {m.drift}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="font-mono text-10 text-ink-2 mt-2">
        Showing {data.returned} of {data.total} modes · {data.recordsConsidered} feedback records considered.
      </div>
    </div>
  );
}

function AlertsPanel({
  data,
  loading,
}: {
  data: DriftResponse | null;
  loading: boolean;
}): JSX.Element {
  if (loading && !data) return <SkeletonTable rows={4} columns={3} />;
  if (!data) return <EmptyState title="No alert data" body="Drift alert evaluator returned no result." />;
  if (data.alerts.length === 0) {
    return (
      <EmptyState
        title="No active drift alerts"
        body={`Compared current ${data.window.days}-day window against ${data.baseline.days}-day baseline · ${data.modesEvaluated} modes evaluated · all within tolerance.`}
      />
    );
  }
  return (
    <ul aria-label="Drift alerts" className="space-y-2">
      {data.alerts.map((a) => (
        <li
          key={a.id}
          className={`border rounded-md px-3 py-2 ${severityTone(a.severity)}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-9 uppercase tracking-wide-3 px-1.5 py-0.5 border border-current rounded">
              {a.severity}
            </span>
            <span className="font-mono text-10 uppercase tracking-wide-3 opacity-70">{a.category}</span>
            <span className="font-mono text-11 break-all">{a.modeId}</span>
          </div>
          <p className="text-12 mt-1">{a.message}</p>
          <div className="font-mono text-10 mt-1 opacity-80 tabular-nums">
            current {formatNum(a.current)} · baseline {formatNum(a.baseline)} · Δ {a.delta >= 0 ? "+" : ""}
            {formatNum(a.delta)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div className="text-center py-8 border border-dashed border-hair-2 rounded-md">
      <div className="font-display text-16 text-ink-1 tracking-tightest">{title}</div>
      <p className="text-12 text-ink-2 mt-1 max-w-prose mx-auto px-4">{body}</p>
    </div>
  );
}

function SkeletonTable({ rows, columns }: { rows: number; columns: number }): JSX.Element {
  return (
    <div className="space-y-1.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, j) => (
            <div key={j} className="h-3 rounded bg-bg-2 animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
