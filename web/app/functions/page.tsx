"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface FunctionEntry {
  key: string;
  displayName: string;
  schedule: string;
  lastRunAt: string | null;
  ageHours: number | null;
  status: "ok" | "late" | "unknown";
}

interface FunctionsData {
  ok: boolean;
  generatedAt?: string;
  summary?: { total: number; ok: number; late: number; unknown: number };
  functions?: FunctionEntry[];
  note?: string;
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "ok" ? "bg-green-500/15 text-green-400 border-green-500/30"
    : status === "late" ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
    : "bg-neutral-500/15 text-neutral-400 border-neutral-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-10 font-medium ${cls}`}>
      {status.toUpperCase()}
    </span>
  );
}

function AgeCell({ hours }: { hours: number | null | undefined }) {
  if (hours == null) return <span className="text-ink-3">—</span>;
  const cls = hours < 2 ? "text-green-400" : hours < 26 ? "text-ink-1" : "text-amber-400";
  return <span className={cls}>{hours < 1 ? "<1h" : `${hours.toFixed(1)}h`} ago</span>;
}

export default function FunctionsPage() {
  const [data, setData] = useState<FunctionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const mountedRef = useRef(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/functions");
      const json = (await res.json()) as FunctionsData;
      if (!mountedRef.current) return;
      setData(json);
    } catch {
      // silently keep last data
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setCountdown(60);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const refreshId = setInterval(load, 60_000);
    const countdownId = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 60 : c - 1));
    }, 1_000);
    return () => {
      mountedRef.current = false;
      clearInterval(refreshId);
      clearInterval(countdownId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fns = data?.functions ?? [];
  const summary = data?.summary;

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="Operational"
        title="Scheduled Functions"
        intro="Cron execution log — last run timestamps and health status for all Netlify scheduled functions"
      />

      {/* Summary bar */}
      <div className="flex items-center justify-between mb-5 px-1">
        {summary && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-400">{summary.ok} OK</span>
            {summary.late > 0 && <span className="text-amber-400">{summary.late} Late</span>}
            {summary.unknown > 0 && <span className="text-neutral-400">{summary.unknown} Unknown</span>}
          </div>
        )}
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-ink-3 animate-pulse">Refreshing…</span>}
          <button
            onClick={() => void load()}
            className="text-xs px-3 py-1 rounded border border-border-subtle text-ink-2 hover:text-ink-1 transition"
          >
            Refresh
          </button>
          <span className="text-xs text-ink-3">auto in {countdown}s</span>
        </div>
      </div>

      {data?.note && (
        <div className="mb-4 text-sm text-amber-400 bg-amber-400/10 rounded px-3 py-2">{data.note}</div>
      )}

      <section className="bg-surface-1 border border-border-subtle rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-3 border-b border-border-subtle bg-surface-2">
              <th className="text-left py-2.5 px-4">Function</th>
              <th className="text-left py-2.5 px-4">Schedule</th>
              <th className="text-left py-2.5 px-4">Status</th>
              <th className="text-left py-2.5 px-4">Last Run</th>
              <th className="text-left py-2.5 px-4">Age</th>
            </tr>
          </thead>
          <tbody>
            {fns.map((fn, i) => (
              <tr
                key={fn.key}
                className={`border-b border-border-subtle/50 ${i % 2 === 0 ? "" : "bg-surface-2/30"}`}
              >
                <td className="py-2.5 px-4">
                  <div className="font-medium text-ink-1">{fn.displayName}</div>
                  <div className="text-xs text-ink-3 font-mono">{fn.key}</div>
                </td>
                <td className="py-2.5 px-4 font-mono text-xs text-ink-2">{fn.schedule}</td>
                <td className="py-2.5 px-4"><StatusChip status={fn.status} /></td>
                <td className="py-2.5 px-4 text-xs text-ink-2">
                  {fn.lastRunAt
                    ? new Date(fn.lastRunAt).toLocaleString()
                    : <span className="text-ink-3">Never</span>}
                </td>
                <td className="py-2.5 px-4"><AgeCell hours={fn.ageHours} /></td>
              </tr>
            ))}
            {fns.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-3 text-sm">
                  No heartbeat data available. Functions may not have run yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {data?.generatedAt && (
        <p className="text-xs text-ink-3 mt-3 text-right">
          Last fetched: {new Date(data.generatedAt).toLocaleTimeString()} · auto-refresh every 60s
        </p>
      )}
    </ModuleLayout>
  );
}
