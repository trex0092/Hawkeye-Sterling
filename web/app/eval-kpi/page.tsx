"use client";

// MLRO Advisor evaluation dashboard.
//
// Reads the KPI snapshot produced by the nightly regression runner
// (scripts/registry-nightly-eval.mjs) via GET /api/eval-kpi. Renders
// the six build-spec KPIs, per-cluster breakdown, per-mode latency,
// and any acceptance-band breaches as alert chips.
//
// Empty state: when no snapshot has been written yet (fresh deploy /
// no nightly run), shows a clear "no data" panel that explains the
// nightly cadence rather than rendering placeholder zeros.

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface KpiBreach {
  kpi: string;
  detail: string;
}

interface KpiSnapshot {
  generatedAt: string;
  totalRuns: number;
  byCluster: Record<string, number>;
  byMode: Record<string, number>;
  citationAccuracy: number;
  hallucinationRatePer100: number;
  completionRateDeep: number;
  escalationPrecision: number;
  timeToDecisionP50Ms: Record<string, number>;
  counterArgumentQualityMean: number | null;
  breaches: KpiBreach[];
}

interface ApiResponse {
  ok: boolean;
  snapshot: KpiSnapshot | null;
  message?: string;
  error?: string;
}

const ACCEPTANCE = {
  citationAccuracyMin: 0.95,
  hallucinationRatePer100Max: 0,
  completionRateDeepMin: 0.98,
  escalationPrecisionMin: 0.85,
  counterArgumentQualityMin: 3.5,
};

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function tierClassFor(passed: boolean): string {
  return passed
    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
    : "bg-amber-50 text-amber-700 border-amber-300";
}

interface KpiCardProps {
  label: string;
  value: string;
  acceptable: boolean;
  band: string;
  detail?: string;
}

function KpiCard({ label, value, acceptable, band, detail }: KpiCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        acceptable
          ? "bg-bg-1 border-hair-2"
          : "bg-amber-50/30 border-amber-300"
      }`}
    >
      <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
        {label}
      </div>
      <div className="text-22 font-semibold text-ink-0 leading-tight">{value}</div>
      <div
        className={`mt-2 text-9 font-mono uppercase tracking-wide-2 px-1.5 py-px rounded inline-flex items-center border ${tierClassFor(
          acceptable,
        )}`}
      >
        {acceptable ? "✓ in band" : "⚠ breach"} · band: {band}
      </div>
      {detail ? (
        <div className="mt-2 text-11 text-ink-2 leading-snug">{detail}</div>
      ) : null}
    </div>
  );
}

export default function EvalKpiPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/eval-kpi", { signal: ctl.signal });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, []);

  return (
    <ModuleLayout asanaModule="eval-kpi" asanaLabel="Eval KPIs" engineLabel="MLRO Eval">
      <ModuleHero
        moduleNumber={10}
        eyebrow="Module 09 · Evaluation"
        title="MLRO Advisor"
        titleEm="evaluation."
        intro={
          <>
            <strong>Six KPIs sampled nightly</strong> from a curated regression set —
            citation accuracy, hallucination rate, completion rate, escalation precision,
            time-to-decision, counter-argument quality. Each KPI has an acceptance band;
            a breach surfaces as an amber chip. Snapshot read-only — produced by{" "}
            <code className="font-mono text-11">scripts/registry-nightly-eval.mjs</code>.
          </>
        }
      />

      {loading ? (
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 text-13 text-ink-2">
          Loading the latest KPI snapshot…
        </div>
      ) : error ? (
        <div className="bg-amber-50/30 border border-amber-300 rounded-lg p-4 text-13 text-amber-700">
          Could not reach <code className="font-mono">/api/eval-kpi</code>: {error}
        </div>
      ) : !data?.snapshot ? (
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-6">
          <div className="text-13 font-semibold text-ink-0 mb-2">
            No KPI snapshot available yet
          </div>
          <div className="text-12 text-ink-2 leading-relaxed">
            {data?.message ??
              "The nightly regression runner has not produced a snapshot yet. Once scheduled, the runner replays every scenario in the eval corpus through /api/mlro-advisor in each mode, grades the output, and writes the snapshot file the dashboard reads."}
          </div>
          <div className="mt-3 text-11 text-ink-3 font-mono">
            Run on demand: <code>npm run brain:nightly-eval -- --base-url …</code>
          </div>
        </div>
      ) : (
        <KpiDashboard snapshot={data.snapshot} />
      )}
    </ModuleLayout>
  );
}

function KpiDashboard({ snapshot }: { snapshot: KpiSnapshot }) {
  const ts = new Date(snapshot.generatedAt);
  const totalClusterEntries = Object.values(snapshot.byCluster).reduce((a, b) => a + b, 0);
  const totalModeEntries = Object.values(snapshot.byMode).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-4">
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-11 text-ink-2">
          <span className="font-semibold text-ink-0">Snapshot</span> generated{" "}
          <span className="font-mono text-10">{ts.toISOString()}</span> · runs:{" "}
          <span className="font-mono">{snapshot.totalRuns}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {snapshot.breaches.length === 0 ? (
            <span className="inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 bg-emerald-50 text-emerald-700 border-emerald-300">
              ✓ all KPIs in band
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 bg-amber-50 text-amber-700 border-amber-300">
              ⚠ {snapshot.breaches.length} breach{snapshot.breaches.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          label="Citation accuracy"
          value={fmtPct(snapshot.citationAccuracy)}
          acceptable={snapshot.citationAccuracy >= ACCEPTANCE.citationAccuracyMin}
          band={`≥ ${fmtPct(ACCEPTANCE.citationAccuracyMin)}`}
          detail="% of cited articles that match real text in the retrieval set"
        />
        <KpiCard
          label="Hallucination rate"
          value={`${snapshot.hallucinationRatePer100.toFixed(2)} / 100`}
          acceptable={snapshot.hallucinationRatePer100 <= ACCEPTANCE.hallucinationRatePer100Max}
          band={`≤ ${ACCEPTANCE.hallucinationRatePer100Max} per 100`}
          detail="invented articles / timing / cadences per 100 runs — target zero"
        />
        <KpiCard
          label="Completion rate (Deep)"
          value={fmtPct(snapshot.completionRateDeep)}
          acceptable={snapshot.completionRateDeep >= ACCEPTANCE.completionRateDeepMin}
          band={`≥ ${fmtPct(ACCEPTANCE.completionRateDeepMin)}`}
          detail="% Deep-mode answers passing the 8-section completion gate"
        />
        <KpiCard
          label="Escalation precision"
          value={fmtPct(snapshot.escalationPrecision)}
          acceptable={snapshot.escalationPrecision >= ACCEPTANCE.escalationPrecisionMin}
          band={`≥ ${fmtPct(ACCEPTANCE.escalationPrecisionMin)}`}
          detail="% of escalations the human MLRO confirmed needed escalation"
        />
        <KpiCard
          label="Counter-argument quality"
          value={snapshot.counterArgumentQualityMean === null ? "—" : snapshot.counterArgumentQualityMean.toFixed(2)}
          acceptable={
            snapshot.counterArgumentQualityMean === null
              ? true
              : snapshot.counterArgumentQualityMean >= ACCEPTANCE.counterArgumentQualityMin
          }
          band={`≥ ${ACCEPTANCE.counterArgumentQualityMin.toFixed(1)} / 5`}
          detail="MLRO grade — did the regulator-perspective section identify a real weakness or was it pro-forma"
        />
        <KpiCard
          label="Time to decision"
          value={renderModeMedians(snapshot.timeToDecisionP50Ms)}
          acceptable
          band="median per mode"
          detail="rendered as <mode>:<ms>"
        />
      </div>

      {snapshot.breaches.length > 0 ? (
        <div className="bg-amber-50/30 border border-amber-300 rounded-lg p-3">
          <div className="text-11 font-semibold uppercase tracking-wide-3 text-amber-700 mb-2">
            Breaches ({snapshot.breaches.length})
          </div>
          <ul className="space-y-1 text-12 text-ink-1">
            {snapshot.breaches.map((b) => (
              <li key={b.kpi} className="flex flex-col">
                <span className="font-mono text-10 text-ink-3">{b.kpi}</span>
                <span>{b.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
          <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
            Runs by cluster ({totalClusterEntries})
          </div>
          {Object.keys(snapshot.byCluster).length === 0 ? (
            <div className="text-12 text-ink-2">No runs yet.</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(snapshot.byCluster).map(([cluster, count]) => (
                <div key={cluster} className="flex items-center justify-between text-12">
                  <span className="text-ink-1 capitalize">{cluster.replace(/_/g, " ")}</span>
                  <span className="font-mono text-ink-0">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
          <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
            Runs by mode ({totalModeEntries})
          </div>
          {Object.keys(snapshot.byMode).length === 0 ? (
            <div className="text-12 text-ink-2">No runs yet.</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(snapshot.byMode).map(([mode, count]) => (
                <div key={mode} className="flex items-center justify-between text-12">
                  <span className="text-ink-1 capitalize">{mode}</span>
                  <span className="font-mono text-ink-0">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderModeMedians(byMode: Record<string, number>): string {
  const entries = Object.entries(byMode);
  if (entries.length === 0) return "—";
  return entries.map(([m, ms]) => `${m}:${Math.round(ms)}ms`).join(" · ");
}
