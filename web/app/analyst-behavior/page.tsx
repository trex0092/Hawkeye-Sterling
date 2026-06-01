"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { UEBAReport, UEBAAlert, AnalystProfile, UEBASeverity } from "../../../src/monitoring/analyst-behavior";

// ── Helpers ──────────────────────────────────────────────────────────────────

function severityBadge(s: UEBASeverity): string {
  switch (s) {
    case "critical": return "bg-red-950/30 text-red-300 border-red-500/40";
    case "high":     return "bg-orange-950/30 text-orange-300 border border-orange-500/40";
    case "medium":   return "bg-amber-950/30 text-amber-300 border-amber-500/40";
    default:         return "bg-sky-950/30 text-sky-300 border-sky-500/40";
  }
}

function fmt(n: number, decimals = 0): string {
  return n.toFixed(decimals);
}

// ── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: UEBAAlert }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-hair-2 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-bg-1 transition-colors"
      >
        <span
          className={`inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 shrink-0 mt-px ${severityBadge(alert.severity)}`}
        >
          {alert.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-12 font-semibold text-ink-0">{alert.title}</div>
          <div className="text-10 text-ink-3 font-mono">{alert.ruleId} · actor: {alert.actor}</div>
        </div>
        <span className="text-ink-3 text-11 shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-hair-2 bg-bg-1 space-y-2">
          <div className="text-12 text-ink-1 leading-relaxed pt-2">{alert.detail}</div>
          <div className="flex flex-wrap gap-1.5">
            {alert.evidence.map((e) => (
              <span key={e} className="font-mono text-10 bg-bg-panel border border-hair-2 rounded px-1.5 py-0.5 text-ink-2">
                {e}
              </span>
            ))}
          </div>
          <div className="text-10 text-ink-4 font-mono">{alert.at}</div>
        </div>
      )}
    </div>
  );
}

// ── Profile Card ─────────────────────────────────────────────────────────────

function ProfileCard({ profile, alertCount }: { profile: AnalystProfile; alertCount: number }) {
  const riskLevel = alertCount === 0 ? "clear" : alertCount === 1 ? "low" : alertCount <= 3 ? "medium" : "high";
  const riskCls =
    riskLevel === "clear"  ? "bg-emerald-950/30 text-emerald-300 border-emerald-500/40" :
    riskLevel === "low"    ? "bg-sky-950/30 text-sky-300 border-sky-500/40" :
    riskLevel === "medium" ? "bg-amber-950/30 text-amber-300 border-amber-500/40" :
                             "bg-red-950/30 text-red-300 border-red-500/40";

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-12 font-semibold text-ink-0 font-mono break-all">{profile.actor}</div>
          <div className="text-10 text-ink-3">{profile.totalEvents} events in window</div>
        </div>
        <span className={`inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${riskCls}`}>
          {alertCount} alert{alertCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-11">
        <div className="text-ink-3">Exports</div>
        <div className="text-ink-0 font-mono tabular-nums">{profile.exportRecordCount} records</div>

        <div className="text-ink-3">Overrides</div>
        <div className={`font-mono tabular-nums ${profile.overrideCount >= 5 ? "text-amber-400" : "text-ink-0"}`}>
          {profile.overrideCount} ({fmt(profile.overrideClearRate)}% clear)
        </div>

        <div className="text-ink-3">Off-hours</div>
        <div className={`font-mono tabular-nums ${profile.offHoursRate > 30 ? "text-amber-400" : "text-ink-0"}`}>
          {fmt(profile.offHoursRate)}%
        </div>

        <div className="text-ink-3">Peak hour</div>
        <div className="text-ink-0 font-mono tabular-nums">{profile.peakHour}:00 UTC</div>

        <div className="text-ink-3">Bulk screens</div>
        <div className="text-ink-0 font-mono tabular-nums">
          {profile.bulkScreenCount} (avg {fmt(profile.averageBulkSize)} records)
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface ApiResponse {
  ok: boolean;
  report: UEBAReport | null;
  message?: string;
  windowDays?: number;
}

export default function AnalystBehaviorPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);

  const load = async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyst-behavior?windowDays=${days}`);
      if (!res.ok) {
        setError(apiErrorMessage(res.status, "UEBA analysis"));
        return;
      }
      const json = await res.json() as ApiResponse;
      setData(json);
    } catch (err) {
      setError(caughtErrorMessage(err, "UEBA analysis failed — please try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(windowDays); }, [windowDays]);

  const report = data?.report;
  const totalAlerts = report?.alerts.length ?? 0;
  const criticalAlerts = report?.alerts.filter((a) => a.severity === "critical").length ?? 0;

  return (
    <ModuleLayout asanaModule="analyst-behavior" asanaLabel="UEBA Alerts" engineLabel="UEBA Engine">
      <ModuleHero
        eyebrow=""
        title="Analyst behavior"
        titleEm="analytics."
        intro={
          <>
            <strong>User and Entity Behavior Analytics (UEBA)</strong> for compliance staff.
            Monitors analyst activity patterns — bulk exports, off-hours access, verdict override
            rates, audit-trail reconnaissance — and surfaces insider-threat signals before they
            become regulatory findings. Six detection rules, adjustable analysis window.
          </>
        }
      />
      <ModuleFamilyBar
        suiteName="Security"
        modules={[
          { label: "Security Scan", href: "/security-scan", icon: "🛡️" },
          { label: "Audit Trail", href: "/audit-trail", icon: "🔒" },
          { label: "Access Control", href: "/access-control", icon: "🔐" },
          { label: "Analyst Behavior", href: "/analyst-behavior", icon: "👁️" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-11 text-ink-3">Analysis window:</span>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-2.5 py-1 rounded border text-11 font-medium transition-colors ${
                windowDays === d
                  ? "bg-ink-0 text-bg-0 border-ink-0"
                  : "border-hair-2 text-ink-2 hover:bg-bg-1"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <button
          onClick={() => void load(windowDays)}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-12 font-medium text-ink-1 hover:bg-bg-1 disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading…" : "↺ Refresh"}
        </button>
      </div>

      {loading && !data ? (
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 text-13 text-ink-2">
          Analysing analyst activity…
        </div>
      ) : error ? (
        <div role="alert" aria-live="assertive" className="bg-red-950/20 border border-red-500/40 rounded-lg p-4 text-13 text-red-300">
          {error}
        </div>
      ) : !report ? (
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-6">
          <div className="text-13 font-semibold text-ink-0 mb-2">No activity data yet</div>
          <div className="text-12 text-ink-2 leading-relaxed">
            {data?.message ?? "UEBA events are recorded as analysts use the platform. Return after some activity has been logged."}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 flex flex-wrap items-center gap-4">
            <div className="text-11 text-ink-2">
              <span className="font-semibold text-ink-0">{report.actors.length}</span> analyst{report.actors.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-semibold text-ink-0">{report.profiles.reduce((s, p) => s + p.totalEvents, 0)}</span> events in {windowDays}d
            </div>
            <div className="flex gap-2 flex-wrap">
              {totalAlerts === 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded border font-mono text-10 font-semibold uppercase tracking-wide-2 bg-emerald-950/30 text-emerald-300 border-emerald-500/40">
                  ✓ No anomalies
                </span>
              ) : (
                <>
                  {criticalAlerts > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded border font-mono text-10 font-semibold uppercase tracking-wide-2 bg-red-950/30 text-red-300 border-red-500/40">
                      ⚠ {criticalAlerts} critical
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded border font-mono text-10 font-semibold uppercase tracking-wide-2 bg-amber-950/30 text-amber-300 border-amber-500/40">
                    {totalAlerts} alert{totalAlerts !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Alerts */}
          {totalAlerts > 0 && (
            <div className="space-y-2">
              <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-3">
                Anomaly Alerts ({totalAlerts})
              </div>
              {report.alerts
                .sort((a, b) => {
                  const order: Record<UEBASeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                  return order[a.severity] - order[b.severity];
                })
                .map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
            </div>
          )}

          {/* Analyst profiles */}
          <div>
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
              Analyst Profiles ({report.actors.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {report.profiles.map((profile) => (
                <ProfileCard
                  key={profile.actor}
                  profile={profile}
                  alertCount={report.alertsByActor[profile.actor]?.length ?? 0}
                />
              ))}
            </div>
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 text-11 text-ink-3">
            <span className="font-semibold text-ink-2">Rules active:</span>{" "}
            UEBA-001 (bulk export) · UEBA-002 (off-hours) · UEBA-003 (override rate) ·
            UEBA-004 (bulk screening) · UEBA-005 (audit reads) · UEBA-006 (admin off-hours).
            Events are logged automatically as analysts use the platform.
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
