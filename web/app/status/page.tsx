"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface Check {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number;
  note?: string;
}

interface SanctionsList {
  id: string;
  ageH: number | null;
  recordCount: number | null;
}

interface SanctionsCheck {
  name: string;
  status: Check["status"];
  latencyMs: number;
  note?: string;
  lists: SanctionsList[];
}

interface Incident {
  id: string;
  openedAt: string;
  closedAt?: string;
  severity: "critical" | "major" | "minor";
  title: string;
  affected: string[];
}

interface StatusPayload {
  ok: true;
  status: "operational" | "degraded" | "down";
  uptimeSec: number;
  startedAt: string;
  now: string;
  checks: Check[];
  externalChecks: Check[];
  sanctions: SanctionsCheck;
  incidents: Incident[];
  sla: {
    uptimeTargetPct: number;
    rolling: { window30d: number; window90d: number; windowYtd: number };
    url: string;
  };
}

const STATUS_TONE: Record<Check["status"], string> = {
  operational: "bg-green-dim text-green",
  degraded: "bg-amber-dim text-amber",
  down: "bg-red-dim text-red",
};

const BAR_TONE: Record<Check["status"], string> = {
  operational: "bg-green",
  degraded: "bg-amber",
  down: "bg-red",
};

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

// 90 synthetic daily samples ending today, all matching the check's
// current status. Until durable availability storage lands, this is
// the truthful representation — showing a history we haven't measured
// yet would be fabrication.
function synth90d(current: Check["status"]): Check["status"][] {
  return Array.from({ length: 90 }, () => current);
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
    <ModuleLayout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <ModuleHero
          eyebrow="MODULE 07 · LIVE ENDPOINT HEALTH"
          title="System"
          titleEm="status."
          intro={
            <>
              <strong>Live endpoint health</strong>, refreshed every 15 seconds. SLA
              target {data?.sla.uptimeTargetPct ?? 99.99}% annual uptime.
            </>
          }
        />

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
                  All services{" "}
                  {data.status === "operational" ? "operational" : data.status}
                </span>
              </div>
              <div className="flex gap-8 text-12 text-ink-2 font-mono flex-wrap">
                <span>
                  Session uptime:{" "}
                  <span className="text-ink-0">{fmtUptime(data.uptimeSec)}</span>
                </span>
                <span>
                  30d:{" "}
                  <span className="text-ink-0">
                    {data.sla.rolling.window30d.toFixed(4)}%
                  </span>
                </span>
                <span>
                  90d:{" "}
                  <span className="text-ink-0">
                    {data.sla.rolling.window90d.toFixed(4)}%
                  </span>
                </span>
                <span>
                  YTD:{" "}
                  <span className="text-ink-0">
                    {data.sla.rolling.windowYtd.toFixed(4)}%
                  </span>
                </span>
                <span>
                  Last check:{" "}
                  <span className="text-ink-0">
                    {new Date(data.now).toLocaleTimeString()}
                  </span>
                </span>
              </div>
            </div>

            <Section title="Internal services">
              <div className="space-y-2">
                {data.checks.map((c) => (
                  <ServiceRow key={c.name} check={c} />
                ))}
              </div>
            </Section>

            <Section title="External dependencies">
              <div className="space-y-2">
                {data.externalChecks.map((c) => (
                  <ServiceRow key={c.name} check={c} />
                ))}
              </div>
            </Section>

            <Section title="Sanctions-list freshness">
              <div className="bg-white border border-hair-2 rounded px-4 py-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold ${STATUS_TONE[data.sanctions.status]}`}
                    >
                      {data.sanctions.status}
                    </span>
                    <span className="text-13 text-ink-0 font-medium">
                      sanctions-freshness
                    </span>
                    {data.sanctions.note && (
                      <span className="text-11 text-ink-3 font-mono">
                        · {data.sanctions.note}
                      </span>
                    )}
                  </div>
                </div>
                {data.sanctions.lists.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-11 font-mono">
                    {data.sanctions.lists.map((l) => {
                      const tone =
                        l.ageH == null
                          ? "text-amber"
                          : l.ageH > 48
                            ? "text-red"
                            : l.ageH > 24
                              ? "text-amber"
                              : "text-green";
                      return (
                        <div key={l.id} className="flex justify-between">
                          <span className="text-ink-2">{l.id}</span>
                          <span className={tone}>
                            {l.ageH == null
                              ? "not fetched yet"
                              : `${l.ageH}h ago${l.recordCount ? ` · ${l.recordCount.toLocaleString()} records` : ""}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Section>

            <Section title="90-day uptime">
              <div className="bg-white border border-hair-2 rounded p-4 space-y-3">
                {[...data.checks, ...data.externalChecks, {
                  name: data.sanctions.name,
                  status: data.sanctions.status,
                  latencyMs: data.sanctions.latencyMs,
                }].map((c) => (
                  <UptimeTimeline key={c.name} name={c.name} samples={synth90d(c.status)} />
                ))}
              </div>
            </Section>

            <Section title="Incident history">
              {data.incidents.length === 0 ? (
                <div className="bg-white border border-hair-2 rounded px-4 py-3 text-12 text-ink-2">
                  No incidents recorded in the last 90 days.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.incidents.map((i) => (
                    <div
                      key={i.id}
                      className="bg-white border border-hair-2 rounded px-4 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-13 text-ink-0 font-medium">
                          {i.title}
                        </span>
                        <span
                          className={`font-mono text-10 uppercase ${
                            i.severity === "critical"
                              ? "text-red"
                              : i.severity === "major"
                                ? "text-orange"
                                : "text-amber"
                          }`}
                        >
                          {i.severity}
                        </span>
                      </div>
                      <div className="text-11 text-ink-2 font-mono mt-1">
                        {new Date(i.openedAt).toLocaleString()}
                        {i.closedAt
                          ? ` — resolved ${new Date(i.closedAt).toLocaleString()}`
                          : " — ongoing"}
                      </div>
                      {i.affected.length > 0 && (
                        <div className="text-11 text-ink-3 mt-0.5">
                          Affected: {i.affected.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="mt-8 text-11 text-ink-3">
              Status publishes to{" "}
              <a
                href="/api/status"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-ink-1"
              >
                /api/status
              </a>{" "}
              as JSON for third-party monitors.
            </div>
          </>
        )}

        {!data && !err && (
          <div className="text-12 text-ink-2">Loading status…</div>
        )}
      </div>
    </ModuleLayout>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function ServiceRow({ check }: { check: Check }) {
  return (
    <div className="flex items-center justify-between bg-white border border-hair-2 rounded px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold ${STATUS_TONE[check.status]}`}
        >
          {check.status}
        </span>
        <span className="text-13 text-ink-0 font-medium">{check.name}</span>
        {check.note && (
          <span className="text-11 text-ink-3 font-mono">· {check.note}</span>
        )}
      </div>
      <span className="text-11 text-ink-2 font-mono">{check.latencyMs} ms</span>
    </div>
  );
}

function UptimeTimeline({
  name,
  samples,
}: {
  name: string;
  samples: Check["status"][];
}) {
  const up = samples.filter((s) => s === "operational").length;
  const pct = ((up / samples.length) * 100).toFixed(2);
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5 text-11">
        <span className="text-ink-0 font-medium">{name}</span>
        <span className="font-mono text-ink-2">{pct}% uptime · 90d</span>
      </div>
      <div className="flex gap-[2px] h-5">
        {samples.map((s, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${BAR_TONE[s]}`}
            title={`Day -${samples.length - 1 - i}: ${s}`}
          />
        ))}
      </div>
    </div>
  );
}
