"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrierDataPoint {
  date: string;       // ISO date string e.g. "2025-04-01"
  brierScore: number; // 0–1, lower is better
  ece: number;        // Expected Calibration Error, 0–1
  sampleSize: number;
}

interface BrierResponse {
  ok: boolean;
  series: BrierDataPoint[];
  currentBrier: number;
  currentEce: number;
  alertThreshold: number;
}

interface ModePerformanceRow {
  mode: string;
  entityType: string;
  precision: number;       // 0–1
  ciLower: number;         // 95% CI lower bound
  ciUpper: number;         // 95% CI upper bound
  sampleSize: number;
  recall: number;
  f1: number;
}

interface ModePerformanceResponse {
  ok: boolean;
  rows: ModePerformanceRow[];
  updatedAt: string;
}

interface FairnessRow {
  entityType: string;
  falsePositiveRate: number;
  falseNegativeRate: number;
  disparateImpact: number;  // ratio vs reference group; 1.0 = parity
  sampleSize: number;
  status: "pass" | "watch" | "fail";
}

interface FairnessResponse {
  ok: boolean;
  rows: FairnessRow[];
  referenceGroup: string;
  updatedAt: string;
}

interface DriftAlert {
  alertId: string;
  detectedAt: string;
  metric: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  affectedMode: string;
  threshold: number;
  currentValue: number;
  investigated: boolean;
}

interface DriftAlertsResponse {
  ok: boolean;
  alerts: DriftAlert[];
  lastChecked: string;
}

type TabKey = "overview" | "leaderboard" | "fairness" | "alerts";

// ── Constants ─────────────────────────────────────────────────────────────────

const ECE_ALERT_THRESHOLD = 0.04;
const DRIFT_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Severity badge ────────────────────────────────────────────────────────────

const SEV_STYLE: Record<DriftAlert["severity"], string> = {
  critical: "bg-red-dim text-red border border-red/30",
  high:     "bg-red-dim text-red border border-red/20",
  medium:   "bg-amber-dim text-amber border border-amber/30",
  low:      "bg-blue-dim text-blue border border-blue/20",
};

function SeverityBadge({ severity }: { severity: DriftAlert["severity"] }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${SEV_STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}

// ── Fairness status badge ─────────────────────────────────────────────────────

const FAIRNESS_STYLE: Record<FairnessRow["status"], string> = {
  pass:  "bg-green-dim text-green",
  watch: "bg-amber-dim text-amber",
  fail:  "bg-red-dim text-red",
};

function FairnessBadge({ status }: { status: FairnessRow["status"] }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${FAIRNESS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────

interface LineChartProps {
  series: BrierDataPoint[];
  alertThreshold: number;
  width?: number;
  height?: number;
}

function BrierLineChart({ series, alertThreshold, width = 600, height = 160 }: LineChartProps) {
  const PADDING = { top: 16, right: 16, bottom: 32, left: 48 };
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  if (series.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-11 text-ink-3 font-mono border border-hair-2 rounded"
        style={{ height }}
      >
        No calibration data
      </div>
    );
  }

  const allValues = series.flatMap((d) => [d.brierScore, d.ece]);
  const minVal = Math.max(0, Math.min(...allValues) - 0.005);
  const maxVal = Math.min(1, Math.max(...allValues, alertThreshold) + 0.005);
  const range = maxVal - minVal || 0.01;

  const xScale = (i: number) => (i / Math.max(series.length - 1, 1)) * chartW;
  const yScale = (v: number) => chartH - ((v - minVal) / range) * chartH;

  const brierPath = series
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(d.brierScore).toFixed(1)}`)
    .join(" ");
  const ecePath = series
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(d.ece).toFixed(1)}`)
    .join(" ");

  const thresholdY = yScale(alertThreshold);
  const nTicks = 4;
  const yTicks = Array.from({ length: nTicks + 1 }, (_, i) => minVal + (range / nTicks) * i);

  // Show up to 6 date labels
  const labelStep = Math.max(1, Math.floor(series.length / 6));
  const dateLabels = series
    .map((d, i) => ({ i, label: fmtDate(d.date) }))
    .filter((_, i) => i % labelStep === 0 || i === series.length - 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className="overflow-visible"
      aria-label="Brier score and ECE trend chart"
      role="img"
    >
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {/* Grid lines + Y ticks */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={0} y1={yScale(v).toFixed(1)}
              x2={chartW} y2={yScale(v).toFixed(1)}
              stroke="var(--hair-2)" strokeDasharray="3 3"
            />
            <text
              x={-6} y={Number(yScale(v).toFixed(1)) + 4}
              textAnchor="end"
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="var(--ink-3)"
            >
              {v.toFixed(3)}
            </text>
          </g>
        ))}

        {/* Alert threshold line */}
        {alertThreshold >= minVal && alertThreshold <= maxVal && (
          <g>
            <line
              x1={0} y1={thresholdY.toFixed(1)}
              x2={chartW} y2={thresholdY.toFixed(1)}
              stroke="var(--amber)" strokeDasharray="5 3" strokeWidth={1.5} opacity={0.7}
            />
            <text
              x={chartW + 4} y={thresholdY + 4}
              fontSize={8} fontFamily="var(--font-mono)" fill="var(--amber)"
            >
              THRESHOLD
            </text>
          </g>
        )}

        {/* ECE line */}
        <path d={ecePath} fill="none" stroke="var(--violet)" strokeWidth={1.5} opacity={0.8} />

        {/* Brier score line */}
        <path d={brierPath} fill="none" stroke="var(--brand)" strokeWidth={2} />

        {/* Dots for Brier */}
        {series.map((d, i) => (
          <circle
            key={i}
            cx={xScale(i).toFixed(1)} cy={yScale(d.brierScore).toFixed(1)}
            r={2.5} fill="var(--brand)"
          >
            <title>{`${fmtDate(d.date)} · Brier ${d.brierScore.toFixed(4)} · n=${d.sampleSize}`}</title>
          </circle>
        ))}

        {/* X axis labels */}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="var(--hair-2)" />
        {dateLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i).toFixed(1)} y={chartH + 14}
            textAnchor="middle"
            fontSize={8} fontFamily="var(--font-mono)" fill="var(--ink-3)"
          >
            {label}
          </text>
        ))}
      </g>
    </svg>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-bg-2 rounded animate-pulse ${className}`} />
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-3">
      {children}
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-4 py-2 text-12 font-medium transition-colors border-b-2 ${
        active
          ? "border-brand text-ink-0"
          : "border-transparent text-ink-2 hover:text-ink-0 hover:border-hair-3"
      }`}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white font-mono text-9 font-bold">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  brierData,
  brierLoading,
  brierError,
}: {
  brierData: BrierResponse | null;
  brierLoading: boolean;
  brierError: string | null;
}) {
  const eceBreached =
    brierData != null && brierData.currentEce > (brierData.alertThreshold ?? ECE_ALERT_THRESHOLD);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {brierLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))
        ) : brierData ? (
          <>
            <KpiCard
              value={brierData.currentBrier.toFixed(4)}
              label="Brier Score"
              tone={brierData.currentBrier < 0.1 ? "green" : brierData.currentBrier < 0.2 ? "amber" : "red"}
            />
            <KpiCard
              value={brierData.currentEce.toFixed(4)}
              label="ECE"
              tone={eceBreached ? "red" : "green"}
              alert={eceBreached ? `Exceeds threshold (${brierData.alertThreshold})` : undefined}
            />
            <KpiCard
              value={brierData.alertThreshold.toString()}
              label="Alert Threshold"
              tone="amber"
            />
            <KpiCard
              value={brierData.series[brierData.series.length - 1]?.sampleSize.toLocaleString() ?? "—"}
              label="Latest Sample"
            />
          </>
        ) : brierError ? (
          <div className="col-span-4 text-12 text-red font-mono py-3">{brierError}</div>
        ) : null}
      </div>

      {/* Brier trend chart */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
        <SectionLabel>Brier Score Trend (calibration over time)</SectionLabel>
        {brierLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : brierData && brierData.series.length > 0 ? (
          <>
            <BrierLineChart
              series={brierData.series}
              alertThreshold={brierData.alertThreshold}
            />
            <div className="flex items-center gap-4 mt-3 text-10 font-mono text-ink-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 bg-brand rounded" /> Brier score
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 bg-violet rounded" /> ECE
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-px border-t border-amber border-dashed" /> Alert threshold ({brierData.alertThreshold})
              </span>
            </div>
          </>
        ) : brierError ? (
          <div className="py-6 text-12 text-ink-2 text-center font-mono">{brierError}</div>
        ) : (
          <div className="py-6 text-12 text-ink-2 text-center font-mono">No calibration series data.</div>
        )}
      </div>

      {eceBreached && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-dim border border-amber/30 rounded-lg">
          <span className="text-amber text-14 mt-0.5 shrink-0">!</span>
          <div>
            <div className="text-12 font-semibold text-amber mb-0.5">ECE Alert — threshold breached</div>
            <div className="text-11 text-ink-1">
              Current ECE ({brierData?.currentEce.toFixed(4)}) exceeds the alert threshold of{" "}
              {brierData?.alertThreshold}. Model re-calibration is recommended. Review the Drift Alerts
              tab for active alerts.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  value,
  label,
  tone = "brand",
  alert,
}: {
  value: string;
  label: string;
  tone?: "brand" | "green" | "amber" | "red";
  alert?: string;
}) {
  const toneBar: Record<string, string> = {
    brand: "bg-brand",
    green: "bg-green",
    amber: "bg-amber",
    red: "bg-red",
  };
  const toneText: Record<string, string> = {
    brand: "text-brand",
    green: "text-green",
    amber: "text-amber",
    red: "text-red",
  };
  return (
    <div className="relative bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 pl-5 overflow-hidden">
      <span className={`absolute top-0 left-0 bottom-0 w-[3px] ${toneBar[tone]} opacity-80`} />
      <div className={`font-display text-24 leading-none tracking-tightest ${toneText[tone]}`}>
        {value}
      </div>
      <div className="font-mono text-10 uppercase tracking-wide-3 text-ink-2 mt-1">{label}</div>
      {alert && (
        <div className="text-10 font-mono text-amber mt-1 leading-tight">{alert}</div>
      )}
    </div>
  );
}

// ── Mode Leaderboard tab ──────────────────────────────────────────────────────

function LeaderboardTab({
  data,
  loading,
  error,
}: {
  data: ModePerformanceResponse | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (error) {
    return <div className="py-8 text-center text-12 text-red font-mono">{error}</div>;
  }
  if (!data || data.rows.length === 0) {
    return (
      <div className="py-10 text-center text-12 text-ink-2">No mode performance data available.</div>
    );
  }

  const sorted = [...data.rows].sort((a, b) => b.precision - a.precision);
  const maxPrec = Math.max(...sorted.map((r) => r.ciUpper), 0.01);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionLabel>Mode Effectiveness — Ranked by Precision</SectionLabel>
        {data.updatedAt && (
          <span className="text-10 font-mono text-ink-3">Updated {fmtDateTime(data.updatedAt)}</span>
        )}
      </div>
      <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <table className="w-full border-collapse text-12">
          <thead className="bg-bg-1 border-b border-hair-2">
            <tr>
              <Th width="30px">#</Th>
              <Th>Mode</Th>
              <Th>Entity Type</Th>
              <Th width="220px">Precision (95% CI)</Th>
              <Th width="80px">Recall</Th>
              <Th width="70px">F1</Th>
              <Th width="80px">n</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const isLast = idx === sorted.length - 1;
              const barW = (row.precision / maxPrec) * 100;
              const ciLowW = (row.ciLower / maxPrec) * 100;
              const ciHighW = (row.ciUpper / maxPrec) * 100;
              return (
                <tr key={`${row.mode}-${row.entityType}`} className="hover:bg-bg-1">
                  <Td isLast={isLast}>
                    <span className="font-mono text-10 text-ink-3">{idx + 1}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="font-mono text-11 text-ink-0 font-semibold">{row.mode}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="text-11 text-ink-1">{row.entityType}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-11 font-semibold text-ink-0 w-14 shrink-0">
                          {pct(row.precision)}
                        </span>
                        {/* Inline bar chart with CI */}
                        <div className="flex-1 h-3 bg-bg-2 rounded-sm relative overflow-hidden">
                          {/* CI band */}
                          <div
                            className="absolute inset-y-0 bg-brand/20 rounded-sm"
                            style={{ left: `${ciLowW}%`, right: `${100 - ciHighW}%` }}
                          />
                          {/* Precision bar */}
                          <div
                            className="absolute inset-y-0 left-0 bg-brand rounded-sm"
                            style={{ width: `${barW}%` }}
                          />
                        </div>
                      </div>
                      <div className="font-mono text-9 text-ink-3 pl-[60px]">
                        [{pct(row.ciLower)}, {pct(row.ciUpper)}]
                      </div>
                    </div>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="font-mono text-11 text-ink-1">{pct(row.recall)}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="font-mono text-11 text-ink-1">{row.f1.toFixed(3)}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="font-mono text-11 text-ink-3">{row.sampleSize.toLocaleString()}</span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-10 text-ink-3 mt-2 font-mono leading-relaxed">
        CI = 95% Wilson confidence interval. Ranked by point-estimate precision descending.
        Sample sizes below 50 should be treated with caution.
      </p>
    </div>
  );
}

// ── Fairness tab ──────────────────────────────────────────────────────────────

function FairnessTab({
  data,
  loading,
  error,
}: {
  data: FairnessResponse | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (error) {
    return <div className="py-8 text-center text-12 text-red font-mono">{error}</div>;
  }
  if (!data || data.rows.length === 0) {
    return (
      <div className="py-10 text-center text-12 text-ink-2">No fairness data available.</div>
    );
  }

  const sorted = [...data.rows].sort((a, b) => {
    const order: Record<FairnessRow["status"], number> = { fail: 0, watch: 1, pass: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionLabel>Fairness by Entity Type — Ranked by Risk</SectionLabel>
        <div className="flex items-center gap-3">
          {data.referenceGroup && (
            <span className="text-10 font-mono text-ink-3">
              Reference group: <span className="text-ink-1">{data.referenceGroup}</span>
            </span>
          )}
          {data.updatedAt && (
            <span className="text-10 font-mono text-ink-3">Updated {fmtDateTime(data.updatedAt)}</span>
          )}
        </div>
      </div>
      <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <table className="w-full border-collapse text-12">
          <thead className="bg-bg-1 border-b border-hair-2">
            <tr>
              <Th>Entity Type</Th>
              <Th width="120px">FPR</Th>
              <Th width="120px">FNR</Th>
              <Th width="130px">Disparate Impact</Th>
              <Th width="80px">n</Th>
              <Th width="80px">Status</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const isLast = idx === sorted.length - 1;
              const diColor =
                row.disparateImpact < 0.8 || row.disparateImpact > 1.25
                  ? "text-red"
                  : row.disparateImpact < 0.9 || row.disparateImpact > 1.1
                  ? "text-amber"
                  : "text-green";
              return (
                <tr key={row.entityType} className="hover:bg-bg-1">
                  <Td isLast={isLast}>
                    <span className="text-12 font-medium text-ink-0">{row.entityType}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="font-mono text-11 text-ink-1">{pct(row.falsePositiveRate)}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="font-mono text-11 text-ink-1">{pct(row.falseNegativeRate)}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className={`font-mono text-11 font-semibold ${diColor}`}>
                      {row.disparateImpact.toFixed(3)}
                    </span>
                  </Td>
                  <Td isLast={isLast}>
                    <span className="font-mono text-11 text-ink-3">{row.sampleSize.toLocaleString()}</span>
                  </Td>
                  <Td isLast={isLast}>
                    <FairnessBadge status={row.status} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-10 text-ink-3 mt-2 font-mono leading-relaxed">
        FPR = false-positive rate. FNR = false-negative rate. Disparate Impact = group rate / reference group
        rate — values outside 0.8–1.25 ("80% rule") are flagged. Sorted worst-first.
      </p>
    </div>
  );
}

// ── Drift Alerts tab ──────────────────────────────────────────────────────────

function DriftAlertsTab({
  data,
  loading,
  error,
  onInvestigate,
  lastRefreshed,
}: {
  data: DriftAlertsResponse | null;
  loading: boolean;
  error: string | null;
  onInvestigate: (alertId: string) => void;
  lastRefreshed: Date | null;
}) {
  if (loading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-8 text-center">
        <div className="text-12 text-red font-mono mb-2">{error}</div>
        <div className="text-11 text-ink-3">Retrying every 5 minutes.</div>
      </div>
    );
  }

  const alerts = data?.alerts ?? [];
  const active = alerts.filter((a) => !a.investigated);
  const resolved = alerts.filter((a) => a.investigated);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionLabel>
          Active Drift Alerts
          {active.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red text-white font-mono text-9 font-bold">
              {active.length}
            </span>
          )}
        </SectionLabel>
        {lastRefreshed && (
          <span className="text-10 font-mono text-ink-3">
            Last checked {lastRefreshed.toLocaleTimeString("en-GB")} · auto-refresh every 5 min
          </span>
        )}
      </div>

      {active.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-4 bg-green-dim border border-green/25 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-green shadow-[0_0_6px_var(--green)]" />
          <span className="text-12 text-green font-medium">
            No active drift alerts — all metrics within normal bounds.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((alert) => (
            <DriftAlertCard key={alert.alertId} alert={alert} onInvestigate={onInvestigate} />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <SectionLabel>Investigated ({resolved.length})</SectionLabel>
          <div className="space-y-2">
            {resolved.map((alert) => (
              <DriftAlertCard key={alert.alertId} alert={alert} onInvestigate={onInvestigate} resolved />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DriftAlertCard({
  alert,
  onInvestigate,
  resolved = false,
}: {
  alert: DriftAlert;
  onInvestigate: (alertId: string) => void;
  resolved?: boolean;
}) {
  const borderLeft: Record<DriftAlert["severity"], string> = {
    critical: "border-l-red",
    high:     "border-l-red",
    medium:   "border-l-amber",
    low:      "border-l-blue",
  };
  return (
    <div
      className={`bg-bg-panel border border-hair-2 border-l-4 ${borderLeft[alert.severity]} rounded-lg p-4 ${resolved ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <SeverityBadge severity={alert.severity} />
            <span className="font-mono text-10.5 font-semibold text-ink-0">{alert.metric}</span>
            {alert.affectedMode && (
              <span className="font-mono text-10 text-ink-3">mode: {alert.affectedMode}</span>
            )}
            <span className="font-mono text-10 text-ink-3">{fmtDateTime(alert.detectedAt)}</span>
          </div>
          <p className="text-12 text-ink-1 mb-2 leading-snug">{alert.description}</p>
          <div className="flex items-center gap-4 text-10 font-mono text-ink-3 flex-wrap">
            <span>
              Current:{" "}
              <span className="text-red font-semibold">{alert.currentValue.toFixed(4)}</span>
            </span>
            <span>
              Threshold:{" "}
              <span className="text-ink-1">{alert.threshold.toFixed(4)}</span>
            </span>
            <span>
              ID: <span className="text-ink-2">{alert.alertId}</span>
            </span>
          </div>
        </div>
        {!resolved && (
          <button
            type="button"
            onClick={() => onInvestigate(alert.alertId)}
            className="shrink-0 font-mono text-10.5 uppercase tracking-wide-3 font-semibold px-3 py-1.5 rounded border border-brand bg-brand-dim text-brand hover:bg-brand hover:text-white transition-colors"
          >
            Investigate
          </button>
        )}
      </div>
    </div>
  );
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="text-left px-4 py-2.5 text-10.5 font-semibold tracking-wide-3 uppercase text-ink-2 whitespace-nowrap"
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  );
}

function Td({ children, isLast }: { children: React.ReactNode; isLast: boolean }) {
  return (
    <td className={`px-4 py-3 align-middle ${isLast ? "" : "border-b border-hair"}`}>
      {children}
    </td>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PerformanceMonitoringDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const [brierData, setBrierData] = useState<BrierResponse | null>(null);
  const [brierLoading, setBrierLoading] = useState(true);
  const [brierError, setBrierError] = useState<string | null>(null);

  const [modeData, setModeData] = useState<ModePerformanceResponse | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [modeFetched, setModeFetched] = useState(false);

  const [fairnessData, setFairnessData] = useState<FairnessResponse | null>(null);
  const [fairnessLoading, setFairnessLoading] = useState(false);
  const [fairnessError, setFairnessError] = useState<string | null>(null);
  const [fairnessFetched, setFairnessFetched] = useState(false);

  const [alertsData, setAlertsData] = useState<DriftAlertsResponse | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchBrier = useCallback(async () => {
    setBrierLoading(true);
    setBrierError(null);
    try {
      const res = await fetch("/api/mlro/brier");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as BrierResponse;
      if (mountedRef.current) setBrierData(json);
    } catch (err) {
      if (mountedRef.current) setBrierError(err instanceof Error ? err.message : "Failed to load calibration data");
    } finally {
      if (mountedRef.current) setBrierLoading(false);
    }
  }, []);

  const fetchModePerformance = useCallback(async () => {
    if (modeFetched) return;
    setModeLoading(true);
    setModeError(null);
    try {
      const res = await fetch("/api/mlro/mode-performance");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ModePerformanceResponse;
      if (!mountedRef.current) return;
      setModeData(json);
      setModeFetched(true);
    } catch (err) {
      if (mountedRef.current) setModeError(err instanceof Error ? err.message : "Failed to load mode performance data");
    } finally {
      if (mountedRef.current) setModeLoading(false);
    }
  }, [modeFetched]);

  const fetchFairness = useCallback(async () => {
    if (fairnessFetched) return;
    setFairnessLoading(true);
    setFairnessError(null);
    try {
      const res = await fetch("/api/mlro/fairness");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FairnessResponse;
      if (!mountedRef.current) return;
      setFairnessData(json);
      setFairnessFetched(true);
    } catch (err) {
      if (mountedRef.current) setFairnessError(err instanceof Error ? err.message : "Failed to load fairness data");
    } finally {
      if (mountedRef.current) setFairnessLoading(false);
    }
  }, [fairnessFetched]);

  const fetchDriftAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const res = await fetch("/api/mlro/drift-alerts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DriftAlertsResponse;
      if (!mountedRef.current) return;
      setAlertsData(json);
      setLastRefreshed(new Date());
    } catch (err) {
      if (mountedRef.current) setAlertsError(err instanceof Error ? err.message : "Failed to load drift alerts");
    } finally {
      if (mountedRef.current) setAlertsLoading(false);
    }
  }, []);

  // ── Initial load + polling ────────────────────────────────────────────────

  useEffect(() => {
    void fetchBrier();
    void fetchDriftAlerts();

    alertIntervalRef.current = setInterval(() => {
      void fetchDriftAlerts();
    }, DRIFT_POLL_INTERVAL_MS);

    return () => {
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    };
  }, [fetchBrier, fetchDriftAlerts]);

  // Lazy-fetch tab data on first visit
  useEffect(() => {
    if (activeTab === "leaderboard") void fetchModePerformance();
    if (activeTab === "fairness") void fetchFairness();
  }, [activeTab, fetchModePerformance, fetchFairness]);

  // ── Investigate handler ───────────────────────────────────────────────────

  const handleInvestigate = useCallback(
    async (alertId: string) => {
      // Optimistically mark investigated in local state
      setAlertsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          alerts: prev.alerts.map((a) =>
            a.alertId === alertId ? { ...a, investigated: true } : a,
          ),
        };
      });
      // Persist to server (best-effort)
      try {
        await fetch(`/api/mlro/drift-alerts/${alertId}/investigate`, { method: "POST" });
      } catch {
        // non-fatal — state update is already applied
      }
    },
    [],
  );

  const activeAlertCount = alertsData?.alerts.filter((a) => !a.investigated).length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-hair-2">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
          <h2 className="font-display font-normal text-24 leading-tight tracking-tightest text-ink-0 m-0">
            Performance Monitoring
          </h2>
          <span className="font-mono text-10 uppercase tracking-wide-3 px-2 py-1 rounded-full border border-hair-2 bg-bg-1 text-ink-2">
            MLRO Dashboard
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-end gap-0 -mb-px">
          <TabBtn active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
            Overview
          </TabBtn>
          <TabBtn active={activeTab === "leaderboard"} onClick={() => setActiveTab("leaderboard")}>
            Mode Leaderboard
          </TabBtn>
          <TabBtn active={activeTab === "fairness"} onClick={() => setActiveTab("fairness")}>
            Fairness
          </TabBtn>
          <TabBtn
            active={activeTab === "alerts"}
            onClick={() => setActiveTab("alerts")}
            badge={activeAlertCount}
          >
            Drift Alerts
          </TabBtn>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "overview" && (
          <OverviewTab
            brierData={brierData}
            brierLoading={brierLoading}
            brierError={brierError}
          />
        )}
        {activeTab === "leaderboard" && (
          <LeaderboardTab
            data={modeData}
            loading={modeLoading}
            error={modeError}
          />
        )}
        {activeTab === "fairness" && (
          <FairnessTab
            data={fairnessData}
            loading={fairnessLoading}
            error={fairnessError}
          />
        )}
        {activeTab === "alerts" && (
          <DriftAlertsTab
            data={alertsData}
            loading={alertsLoading}
            error={alertsError}
            onInvestigate={handleInvestigate}
            lastRefreshed={lastRefreshed}
          />
        )}
      </div>
    </div>
  );
}
