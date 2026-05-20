"use client";

import { useEffect, useState } from "react";

interface DashboardData {
  hsCases?: {
    total: number;
    bySeverity: { critical: number; high: number; medium: number; low: number; clear: number };
    byStatus: Record<string, number>;
    slaNearing: number;
    slaBreach: number;
    pendingFourEyes: number;
    reviewDueSoon: number;
  };
  listHealth?: {
    uaeEocnAgeHours: number | null;
    uaeLtlAgeHours: number | null;
    uaeEocnStale: boolean;
    uaeLtlStale: boolean;
  };
  breachSummary?: {
    total: number;
    open: number;
    critical: number;
    significant: number;
    moderate: number;
    minor: number;
  };
}

export function HsCasesDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard", { headers: { accept: "application/json" } });
        if (!res.ok) { if (!cancelled) setError(`${res.status}`); return; }
        const json = (await res.json()) as DashboardData;
        if (!cancelled) { setData(json); setError(null); }
      } catch { if (!cancelled) setError("unavailable"); }
    };
    void load();
    const t = window.setInterval(() => { void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  if (error) return (
    <div className="text-11 text-red bg-red-dim border border-red/30 rounded p-2 mt-4">
      Dashboard data unavailable: {error}
    </div>
  );
  if (!data) return (
    <div className="text-11 text-ink-3 mt-4">Loading compliance dashboard…</div>
  );

  const hs = data.hsCases;
  const lh = data.listHealth;
  const bs = data.breachSummary;

  return (
    <div className="mt-6 space-y-4">
      {/* ── HS Cases panel ─────────────────────────────────────── */}
      {hs && (
        <div className="border border-hair-2 rounded-lg p-4 bg-bg-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-1">
                Compliance Cases
              </span>
            </div>
            <span className="font-mono text-11 text-ink-3">{hs.total} total</span>
          </div>

          {/* Severity counts */}
          <div className="flex gap-4 flex-wrap mb-3">
            <SeverityBadge label="CRITICAL" count={hs.bySeverity.critical} tone="red" />
            <SeverityBadge label="HIGH"     count={hs.bySeverity.high}     tone="orange" />
            <SeverityBadge label="MEDIUM"   count={hs.bySeverity.medium}   tone="amber" />
            <SeverityBadge label="LOW"      count={hs.bySeverity.low}      tone="green" />
          </div>

          {/* Alerts row */}
          <div className="flex gap-4 flex-wrap border-t border-hair-2 pt-3">
            <AlertPill
              label="SLA breach"
              count={hs.slaBreach}
              tone={hs.slaBreach > 0 ? "red" : "ok"}
            />
            <AlertPill
              label="SLA nearing (24h)"
              count={hs.slaNearing}
              tone={hs.slaNearing > 0 ? "orange" : "ok"}
            />
            <AlertPill
              label="Pending four-eyes"
              count={hs.pendingFourEyes}
              tone={hs.pendingFourEyes > 0 ? "amber" : "ok"}
            />
            <AlertPill
              label="Review due (7d)"
              count={hs.reviewDueSoon}
              tone={hs.reviewDueSoon > 0 ? "amber" : "ok"}
            />
          </div>
        </div>
      )}

      {/* ── UAE List Health ─────────────────────────────────────── */}
      {lh && (lh.uaeEocnStale || lh.uaeLtlStale) && (
        <div className="border border-red/30 bg-red-dim rounded-lg p-3 flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-red shrink-0 mt-0.5" />
          <div>
            <div className="text-11 font-semibold text-red uppercase tracking-wide-3">
              UAE List Staleness Warning
            </div>
            <div className="text-10.5 text-ink-1 mt-0.5 font-mono">
              {lh.uaeEocnStale && `UAE EOCN: ${lh.uaeEocnAgeHours}h old (threshold 36h).`}
              {lh.uaeEocnStale && lh.uaeLtlStale && " "}
              {lh.uaeLtlStale  && `UAE LTL: ${lh.uaeLtlAgeHours}h old (threshold 36h).`}
              {" "}New screenings are marked provisional. Re-screen required after refresh.
            </div>
          </div>
        </div>
      )}

      {/* ── Breach Register summary ─────────────────────────────── */}
      {bs && bs.open > 0 && (
        <div className="border border-hair-2 rounded-lg p-4 bg-bg-panel">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-red shrink-0" />
            <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-1">
              Breach Register
            </span>
            <span className="font-mono text-11 text-red ml-auto">{bs.open} open</span>
          </div>
          <div className="flex gap-4 flex-wrap">
            {bs.critical    > 0 && <BreachPill label="Critical"    count={bs.critical}    tone="red" />}
            {bs.significant > 0 && <BreachPill label="Significant" count={bs.significant} tone="orange" />}
            {bs.moderate    > 0 && <BreachPill label="Moderate"    count={bs.moderate}    tone="amber" />}
            {bs.minor       > 0 && <BreachPill label="Minor"       count={bs.minor}       tone="grey" />}
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ label, count, tone }: { label: string; count: number; tone: "red"|"orange"|"amber"|"green" }) {
  const colors = {
    red:    { text: "text-red",    bg: "bg-red-dim",   border: "border-red/30" },
    orange: { text: "text-orange", bg: "bg-amber-dim", border: "border-amber/30" },
    amber:  { text: "text-amber",  bg: "bg-amber-dim", border: "border-amber/30" },
    green:  { text: "text-green",  bg: "bg-green-dim", border: "border-green/30" },
  }[tone];
  return (
    <div className={`border ${colors.border} ${colors.bg} rounded px-2.5 py-1.5`}>
      <div className={`font-mono text-16 font-semibold ${colors.text}`}>{count}</div>
      <div className="text-10 uppercase tracking-wide-3 text-ink-2 font-medium">{label}</div>
    </div>
  );
}

function AlertPill({ label, count, tone }: { label: string; count: number; tone: "red"|"orange"|"amber"|"ok" }) {
  const colors =
    tone === "red"    ? "text-red bg-red-dim border-red/30" :
    tone === "orange" ? "text-orange bg-amber-dim border-amber/30" :
    tone === "amber"  ? "text-amber bg-amber-dim border-amber/30" :
    "text-ink-3 border-hair-2";
  return (
    <div className={`border ${colors} rounded px-2 py-1 flex items-center gap-1.5`}>
      <span className="font-mono text-12 font-semibold">{count}</span>
      <span className="text-10.5 uppercase tracking-wide-2">{label}</span>
    </div>
  );
}

function BreachPill({ label, count, tone }: { label: string; count: number; tone: "red"|"orange"|"amber"|"grey" }) {
  const colors = {
    red:    "text-red bg-red-dim border-red/30",
    orange: "text-orange bg-amber-dim border-amber/30",
    amber:  "text-amber bg-amber-dim border-amber/30",
    grey:   "text-ink-2 border-hair-2",
  }[tone];
  return (
    <div className={`border ${colors} rounded px-2.5 py-1 flex items-center gap-1.5`}>
      <span className="font-mono text-13 font-semibold">{count}</span>
      <span className="text-10.5 uppercase tracking-wide-2">{label}</span>
    </div>
  );
}
