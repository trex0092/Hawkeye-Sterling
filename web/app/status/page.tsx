"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";

interface Check {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number;
  note?: string;
}

interface StatusPayload {
  ok: true;
  status: "operational" | "degraded" | "down";
  uptimeSec: number;
  startedAt: string;
  now: string;
  checks: Check[];
  sla: { uptimeTargetPct: number; url: string };
}

const STATUS_TONE: Record<Check["status"], string> = {
  operational: "bg-green-dim text-green",
  degraded: "bg-amber-dim text-amber",
  down: "bg-red-dim text-red",
};

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function StatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        const payload = (await r.json()) as StatusPayload;
        if (active) setData(payload);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="font-display text-36 text-ink-0 mb-1">System status</h1>
        <p className="text-12 text-ink-2 mb-8">
          Live endpoint health, refreshed every 15 seconds. SLA target:{" "}
          {data?.sla.uptimeTargetPct ?? 99.99}% annual uptime.
        </p>

        {err && (
          <div className="bg-red-dim text-red rounded px-3 py-2 text-12 mb-4">
            Unable to reach status endpoint: {err}
          </div>
        )}

        {data && (
          <>
            <div className="bg-white border border-hair-2 rounded-lg p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-11 font-semibold ${STATUS_TONE[data.status]}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {data.status.toUpperCase()}
                </span>
                <span className="text-14 text-ink-0">
                  All services {data.status === "operational" ? "operational" : data.status}
                </span>
              </div>
              <div className="flex gap-8 text-12 text-ink-2 font-mono">
                <span>
                  Uptime:{" "}
                  <span className="text-ink-0">{fmtUptime(data.uptimeSec)}</span>
                </span>
                <span>
                  Last check:{" "}
                  <span className="text-ink-0">
                    {new Date(data.now).toLocaleTimeString()}
                  </span>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {data.checks.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between bg-white border border-hair-2 rounded px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold ${STATUS_TONE[c.status]}`}
                    >
                      {c.status}
                    </span>
                    <span className="text-13 text-ink-0 font-medium">{c.name}</span>
                    {c.note && (
                      <span className="text-11 text-ink-3 font-mono">· {c.note}</span>
                    )}
                  </div>
                  <span className="text-11 text-ink-2 font-mono">{c.latencyMs} ms</span>
                </div>
              ))}
            </div>

            <div className="mt-8 text-11 text-ink-3">
              Status publishes to <code>/api/status</code> as JSON for third-party
              monitors.
            </div>
          </>
        )}

        {!data && !err && (
          <div className="text-12 text-ink-2">Loading status…</div>
        )}
      </main>
    </>
  );
}
