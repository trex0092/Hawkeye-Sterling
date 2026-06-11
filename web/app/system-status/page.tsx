"use client";

import { useEffect, useRef, useState } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface SanctionsListInfo {
  listId: string;
  displayName: string;
  status: "healthy" | "stale" | "missing" | "unknown";
  entityCount: number | null;
  ageHours: number | null;
  lastRefreshed: string | null;
}

interface ScheduledJob {
  name: string;
  lastRunAt: string | null;
  nextExpectedAt: string | null;
  status: "ok" | "late" | "unknown";
  ageHours?: number | null;
}

interface SystemStatusData {
  ok: boolean;
  overallStatus: "operational" | "degraded" | "down" | "unknown";
  generatedAt: string;
  sanctionsList?: SanctionsListInfo[];
  scheduledJobs?: ScheduledJob[];
  metrics?: {
    uptime?: number;
    totalListEntities?: number;
    activeAlerts?: number;
  };
}

interface FourEyesData {
  ok: boolean;
  total?: number;
  items?: Array<{
    id: string;
    status: string;
    action: string;
    subjectName: string;
    initiatedAt: string;
    overdue?: boolean;
    overdueHours?: number;
    filingBlocked?: boolean;
  }>;
  pagination?: { totalCount: number };
}

interface OngoingData {
  ok: boolean;
  count?: number;
}

interface RegFeedData {
  ok: boolean;
  totalCount?: number;
  fetchedAt?: string;
  stale?: boolean;
  staleAgeMin?: number;
}

interface PageData {
  systemStatus: SystemStatusData | null;
  fourEyesPending: FourEyesData | null;
  ongoing: OngoingData | null;
  regulatoryFeed: RegFeedData | null;
  fetchedAt: string;
  error?: string;
}

function StatusDot({ status }: { status: string }) {
  const col =
    status === "operational" || status === "ok" || status === "healthy"
      ? "bg-green-500"
      : status === "degraded" || status === "stale" || status === "late"
      ? "bg-amber-400"
      : status === "down" || status === "missing"
      ? "bg-red-500"
      : "bg-neutral-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${col} mr-2`} />;
}

function AgeLabel({ hours }: { hours: number | null | undefined }) {
  if (hours == null) return <span className="text-ink-3">—</span>;
  if (hours < 1) return <span className="text-green-400">&lt;1h ago</span>;
  if (hours < 36) return <span className="text-green-400">{Math.round(hours)}h ago</span>;
  if (hours < 72) return <span className="text-amber-400">{Math.round(hours)}h ago</span>;
  return <span className="text-red-400">{Math.round(hours)}h ago</span>;
}

export default function SystemStatusPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [sysRes, fourEyesRes, ongoingRes, regFeedRes] = await Promise.allSettled([
        fetch("/api/system-status").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch("/api/four-eyes?status=pending&pageSize=50").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch("/api/ongoing").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch("/api/regulatory-feed?limit=1").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);

      if (!mountedRef.current) return;
      setData({
        systemStatus: sysRes.status === "fulfilled" ? (sysRes.value as SystemStatusData) : null,
        fourEyesPending: fourEyesRes.status === "fulfilled" ? (fourEyesRes.value as FourEyesData) : null,
        ongoing: ongoingRes.status === "fulfilled" ? (ongoingRes.value as OngoingData) : null,
        regulatoryFeed: regFeedRes.status === "fulfilled" ? (regFeedRes.value as RegFeedData) : null,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setData((prev) => ({
        ...(prev ?? { systemStatus: null, fourEyesPending: null, ongoing: null, regulatoryFeed: null }),
        fetchedAt: new Date().toISOString(),
        error: caughtErrorMessage(err),
      }));
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
    timerRef.current = setInterval(load, 60_000);
    const countdownId = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 60 : c - 1));
    }, 1_000);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(countdownId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ss = data?.systemStatus;
  const fe = data?.fourEyesPending;
  const om = data?.ongoing;
  const rf = data?.regulatoryFeed;

  const overallColor =
    ss?.overallStatus === "operational" ? "text-green-400"
    : ss?.overallStatus === "degraded" ? "text-amber-400"
    : ss?.overallStatus === "down" ? "text-red-500"
    : "text-neutral-400";

  const pendingItems = fe?.items ?? [];
  const overdueItems = pendingItems.filter((i) => i.overdue);
  const blockedItems = pendingItems.filter((i) => i.filingBlocked);

  return (
    <ModuleLayout asanaModule="system-status" asanaLabel="System Status" onRun={() => void load()} onSync={() => void load()}>
      <ModuleHero
        eyebrow=""
        title="System Status"
        intro="Live health dashboard — sanctions lists, cron functions, four-eyes queue, ongoing monitoring, regulatory feed"
      />

      {/* Header bar */}
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${overallColor}`}>
            {ss?.overallStatus ? ss.overallStatus.toUpperCase() : "LOADING"}
          </span>
          {ss && (
            <span className="text-xs text-ink-3">
              generated {new Date(ss.generatedAt).toLocaleTimeString("en-GB")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-xs text-ink-3 animate-pulse">Refreshing…</span>
          )}
          <button
            onClick={() => void load()}
            className="text-xs px-2.5 py-1 rounded border border-border-subtle text-ink-2 hover:text-ink-1 transition"
          >
            Refresh
          </button>
          <span className="text-xs text-ink-3">auto in {countdown}s</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Four-eyes queue */}
        <section className="bg-surface-1 border border-border-subtle rounded-lg p-5">
          <h2 className="text-sm font-semibold text-ink-1 mb-3">Four-Eyes Queue</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">Pending approvals</span>
              <span className="font-mono text-ink-1">{fe?.pagination?.totalCount ?? pendingItems.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Overdue (&gt;24h)</span>
              <span className={`font-mono ${overdueItems.length > 0 ? "text-amber-400" : "text-ink-1"}`}>{overdueItems.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Filing blocked (&gt;72h)</span>
              <span className={`font-mono ${blockedItems.length > 0 ? "text-red-400 font-bold" : "text-ink-1"}`}>{blockedItems.length}</span>
            </div>
            {overdueItems.slice(0, 3).map((item) => (
              <div key={item.id} className="text-xs text-amber-400 bg-amber-400/10 rounded px-2 py-1">
                {item.subjectName} — {item.action} — {item.overdueHours}h overdue
              </div>
            ))}
          </div>
        </section>

        {/* Ongoing monitoring */}
        <section className="bg-surface-1 border border-border-subtle rounded-lg p-5">
          <h2 className="text-sm font-semibold text-ink-1 mb-3">Ongoing Monitoring</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">Enrolled subjects</span>
              <span className="font-mono text-ink-1">{om?.count ?? "—"}</span>
            </div>
          </div>
        </section>

        {/* Regulatory feed */}
        <section className="bg-surface-1 border border-border-subtle rounded-lg p-5">
          <h2 className="text-sm font-semibold text-ink-1 mb-3">Regulatory Feed</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">Status</span>
              <span className={rf?.stale ? "text-amber-400" : rf?.ok ? "text-green-400" : "text-red-400"}>
                {rf?.stale ? "STALE" : rf?.ok ? "Live" : "Error"}
              </span>
            </div>
            {rf?.fetchedAt && (
              <div className="flex justify-between">
                <span className="text-ink-2">Last fetched</span>
                <span className="font-mono text-ink-1 text-xs">{new Date(rf.fetchedAt).toLocaleTimeString("en-GB")}</span>
              </div>
            )}
            {rf?.staleAgeMin != null && (
              <div className="text-xs text-amber-400">Serving cached data from {rf.staleAgeMin}min ago</div>
            )}
            <div className="flex justify-between">
              <span className="text-ink-2">Items</span>
              <span className="font-mono text-ink-1">{rf?.totalCount ?? "—"}</span>
            </div>
          </div>
        </section>

        {/* Metrics */}
        {ss?.metrics && (
          <section className="bg-surface-1 border border-border-subtle rounded-lg p-5">
            <h2 className="text-sm font-semibold text-ink-1 mb-3">System Metrics</h2>
            <div className="space-y-2 text-sm">
              {ss.metrics.totalListEntities != null && (
                <div className="flex justify-between">
                  <span className="text-ink-2">Total list entities</span>
                  <span className="font-mono text-ink-1">{ss.metrics.totalListEntities.toLocaleString("en-GB")}</span>
                </div>
              )}
              {ss.metrics.activeAlerts != null && (
                <div className="flex justify-between">
                  <span className="text-ink-2">Active alerts</span>
                  <span className={`font-mono ${ss.metrics.activeAlerts > 0 ? "text-amber-400" : "text-ink-1"}`}>
                    {ss.metrics.activeAlerts}
                  </span>
                </div>
              )}
              {ss.metrics.uptime != null && (
                <div className="flex justify-between">
                  <span className="text-ink-2">Uptime</span>
                  <span className="font-mono text-ink-1">{Math.round(ss.metrics.uptime / 3_600)}h</span>
                </div>
              )}
            </div>
          </section>
        )}

      </div>

      {/* Sanctions lists */}
      {ss?.sanctionsList && ss.sanctionsList.length > 0 && (
        <section className="mt-6 bg-surface-1 border border-border-subtle rounded-lg p-5">
          <h2 className="text-sm font-semibold text-ink-1 mb-3">Sanctions Lists</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-3 text-left border-b border-border-subtle">
                  <th className="pb-2 pr-4">List</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Entities</th>
                  <th className="pb-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {ss.sanctionsList.map((l) => (
                  <tr key={l.listId} className="border-b border-border-subtle/40">
                    <td className="py-1.5 pr-4 text-ink-2">{l.displayName}</td>
                    <td className="py-1.5 pr-4">
                      <StatusDot status={l.status} />
                      <span className={
                        l.status === "healthy" ? "text-green-400"
                        : l.status === "stale" ? "text-amber-400"
                        : "text-red-400"
                      }>{l.status}</span>
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-ink-1">
                      {l.entityCount != null ? l.entityCount.toLocaleString("en-GB") : "—"}
                    </td>
                    <td className="py-1.5"><AgeLabel hours={l.ageHours} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scheduled jobs */}
      {ss?.scheduledJobs && ss.scheduledJobs.length > 0 && (
        <section className="mt-6 bg-surface-1 border border-border-subtle rounded-lg p-5">
          <h2 className="text-sm font-semibold text-ink-1 mb-3">Scheduled Functions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-3 text-left border-b border-border-subtle">
                  <th className="pb-2 pr-4">Function</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Last run</th>
                </tr>
              </thead>
              <tbody>
                {ss.scheduledJobs.map((j) => (
                  <tr key={j.name} className="border-b border-border-subtle/40">
                    <td className="py-1.5 pr-4 font-mono text-ink-2">{j.name}</td>
                    <td className="py-1.5 pr-4">
                      <StatusDot status={j.status} />
                      <span className={
                        j.status === "ok" ? "text-green-400"
                        : j.status === "late" ? "text-amber-400"
                        : "text-neutral-400"
                      }>{j.status}</span>
                    </td>
                    <td className="py-1.5">
                      {j.lastRunAt ? (
                        <AgeLabel hours={j.ageHours} />
                      ) : (
                        <span className="text-ink-3">never</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <p className="text-xs text-ink-3 mt-4 text-right">
          Last fetched: {new Date(data.fetchedAt).toLocaleTimeString("en-GB")} · auto-refresh every 60s
        </p>
      )}
    </ModuleLayout>
  );
}
