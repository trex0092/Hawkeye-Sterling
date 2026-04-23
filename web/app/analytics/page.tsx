"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { fetchJson } from "@/lib/api/fetchWithRetry";

interface Analytics {
  ok: true;
  generatedAt: string;
  commercial: {
    totalApiKeys: number;
    tierBreakdown: Record<string, number>;
    totalScreeningsThisMonth: number;
  };
  monitoring: {
    enrolledSubjects: number;
    scheduledSubjects: number;
    cadenceBreakdown: Record<string, number>;
  };
  quality: {
    falsePositiveCount: number;
    trueMatchCount: number;
    falsePositiveRate: number;
    verdictsLast24h: number;
    totalVerdicts: number;
  };
  kpis: { defined: number; sample: Array<Record<string, unknown>> };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await fetchJson<Analytics>("/api/analytics", {
        cache: "no-store",
        label: "Analytics load failed",
      });
      if (!active) return;
      if (!result.ok || !result.data) {
        setErr(result.error ?? `status ${result.status}`);
        return;
      }
      if (!result.data.commercial || !result.data.monitoring || !result.data.quality || !result.data.kpis) {
        setErr("analytics payload missing required sections");
        return;
      }
      setData(result.data);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="font-display text-36 text-ink-0 mb-1">Analytics</h1>
        <p className="text-12 text-ink-2 mb-8">
          Live operational KPIs: commercial footprint, monitoring coverage,
          match-quality feedback, and the 30-indicator DPMS catalogue.
        </p>

        {err && (
          <div className="bg-red-dim text-red rounded px-3 py-2 text-12">{err}</div>
        )}

        {data && (
          <>
            <section className="grid grid-cols-3 gap-4 mb-8">
              <Kpi
                label="API keys issued"
                value={String(data.commercial.totalApiKeys)}
              />
              <Kpi
                label="Screenings this month"
                value={data.commercial.totalScreeningsThisMonth.toLocaleString()}
              />
              <Kpi
                label="FP rate"
                value={`${Math.round(data.quality.falsePositiveRate * 100)}%`}
              />
            </section>

            <section className="grid grid-cols-2 gap-4 mb-8">
              <Panel title="Commercial tiers">
                <BreakdownTable
                  rows={Object.entries(data.commercial.tierBreakdown)}
                />
              </Panel>
              <Panel title="Monitoring cadence">
                <BreakdownTable
                  rows={Object.entries(data.monitoring.cadenceBreakdown)}
                  empty={`${data.monitoring.enrolledSubjects} subjects enrolled, none scheduled`}
                />
              </Panel>
            </section>

            <section className="grid grid-cols-3 gap-4 mb-8">
              <Kpi
                label="Feedback verdicts"
                value={String(data.quality.totalVerdicts)}
                note={`${data.quality.verdictsLast24h} in last 24h`}
              />
              <Kpi
                label="False positives"
                value={String(data.quality.falsePositiveCount)}
              />
              <Kpi
                label="Confirmed matches"
                value={String(data.quality.trueMatchCount)}
              />
            </section>

            <Panel title={`DPMS KPI catalogue (${data.kpis.defined})`}>
              <ul className="text-12 text-ink-1 space-y-1 list-none p-0">
                {data.kpis.sample.map((k, i) => (
                  <li key={i} className="font-mono truncate">
                    {String(
                      (k as { name?: unknown; id?: unknown }).name ??
                        (k as { id?: unknown }).id ??
                        JSON.stringify(k),
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}

        {!data && !err && <div className="text-12 text-ink-2">Loading…</div>}
      </main>
    </>
  );
}

function Kpi({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-white border border-hair-2 rounded-lg p-4">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">
        {label}
      </div>
      <div className="font-display text-36 text-ink-0 leading-none">
        {value}
      </div>
      {note && <div className="text-11 text-ink-3 mt-1">{note}</div>}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-hair-2 rounded-lg p-4">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function BreakdownTable({
  rows,
  empty,
}: {
  rows: Array<[string, number]>;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <div className="text-12 text-ink-2">{empty ?? "No data yet."}</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-12">
          <span className="text-ink-1 capitalize">{k}</span>
          <span className="font-mono font-semibold text-ink-0">{v}</span>
        </div>
      ))}
    </div>
  );
}
