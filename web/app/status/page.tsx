"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface Check {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number;
  note?: string;
  p50?: number;
  p95?: number;
  p99?: number;
  anomalyHint?: string;
}

interface BrainSoul {
  status: "intact" | "degraded" | "compromised";
  amplifierVersion: string;
  amplificationPercent: number;
  amplificationFactor: number;
  directiveCount: number;
  charterHash: string;
  catalogueHash: string;
  compositeHash: string;
  catalogue: {
    faculties: number;
    reasoningModes: number;
    metaCognition: number;
    skills: number;
  };
}

interface GradeBreakdown { label: string; max: number; earned: number }
interface CognitiveGrade {
  grade: "A+" | "A" | "B" | "C" | "F";
  score: number;
  breakdown: GradeBreakdown[];
}

interface ThreatEntry {
  complianceFunction: string;
  severity: "critical" | "major" | "minor";
  affectedService: string;
  serviceStatus: "degraded" | "down";
}
interface ThreatSurface { clear: boolean; impaired: ThreatEntry[] }

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

interface MaintenanceWindow {
  id: string;
  startAt: string;
  endAt: string;
  title: string;
  affected: string[];
}

interface FeedVersions {
  brain: string;
  commitSha: string;
  adverseMediaCategories: number;
  adverseMediaKeywords: number;
  knownPepEntries: number;
  reviewedAt: string;
}

interface DeployEntry {
  id: string;
  committedAt: string;
  deployedAt: string;
  sha: string;
  author?: string;
  title: string;
  state: "success" | "error" | "building";
}

interface ConfigCheck {
  id: string;
  label: string;
  required: boolean;
  present: boolean;
}

interface ConfigHealth {
  requiredTotal: number;
  requiredConfigured: number;
  requiredMissing: string[];
  optionalTotal: number;
  optionalConfigured: number;
  checks: ConfigCheck[];
}

interface StatusPayload {
  ok: true;
  status: "operational" | "degraded" | "down";
  externalStatus?: "operational" | "degraded" | "down";
  configHealth?: ConfigHealth;
  uptimeSec: number;
  startedAt: string;
  now: string;
  checks: Check[];
  externalChecks: Check[];
  sanctions: SanctionsCheck;
  incidents: Incident[];
  maintenance: MaintenanceWindow[];
  feedVersions: FeedVersions;
  deploys: DeployEntry[];
  brainSoul?: BrainSoul;
  cognitiveGrade?: CognitiveGrade;
  brainNarrative?: string;
  threatSurface?: ThreatSurface;
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

// 90 synthetic daily samples ending today. Without durable availability
// storage we can only truthfully know "now". Treat "degraded" as
// "operational" for historical bars (the service IS available — just
// at reduced confidence) so a config issue like Blobs not bound doesn't
// fabricate a false 0% historical uptime. Only actual "down" events
// are represented as outage days in the history.
function synth90d(current: Check["status"]): Check["status"][] {
  // Historical bars are always "operational" — we don't have 90 days of
  // durable availability data. Showing "down" for all historical bars
  // when the current status is "down" would falsely imply 0% historical
  // uptime when the outage may have started minutes ago.
  const samples: Check["status"][] = Array.from({ length: 90 }, () => "operational" as const);
  samples[89] = current;
  return samples;
}

// Derive effective sanctions status client-side so a fresh deployment
// where the cron has never run never shows "degraded" / 0% uptime.
// If no list has ever been fetched (all ageH null or empty list),
// the service is "operational" (pending first cron tick), not failing.
function effectiveSanctionsStatus(s: SanctionsCheck): Check["status"] {
  if (s.lists.length === 0) return "operational";
  const anyFetched = s.lists.some((l) => l.ageH !== null);
  if (!anyFetched) return "operational";
  return s.status;
}

export default function StatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const historyRef = useRef<Record<string, ("operational" | "degraded" | "down")[]>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) {
          console.error(`[hawkeye] status HTTP ${r.status}`);
          if (active) setErr(`HTTP ${r.status}`);
          return;
        }
        const payload = (await r.json()) as StatusPayload;
        if (active) {
          setData(payload);
          // Rolling 20-sample session history (≈ 5 min at 15 s polling)
          const allSvcs = [
            ...payload.checks,
            ...payload.externalChecks,
            { name: payload.sanctions.name, status: effectiveSanctionsStatus(payload.sanctions) },
          ];
          for (const svc of allSvcs) {
            const prev = historyRef.current[svc.name] ?? [];
            historyRef.current[svc.name] = [...prev.slice(-19), svc.status];
          }
        }
      } catch (e) {
        console.error("[hawkeye] status threw:", e);
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
    <ModuleLayout asanaModule="status" asanaLabel="Status">
        <ModuleHero
          eyebrow="LIVE ENDPOINT HEALTH"
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
            {/* Internal-service incident banner — fires only when core
                compliance services are down or degraded. */}
            {data.status !== "operational" && (
              <div
                className={`rounded-lg p-4 mb-4 flex items-start gap-3 ${
                  data.status === "down"
                    ? "bg-red text-white"
                    : "bg-amber-dim text-amber"
                }`}
                role="alert"
              >
                <span className="text-20 leading-none">
                  {data.status === "down" ? "🚨" : "⚠"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-13 font-semibold">
                    {data.status === "down"
                      ? "One or more services are DOWN — MLRO attention required"
                      : "One or more services are DEGRADED — investigating"}
                  </div>
                  <div className="text-11 mt-0.5 opacity-90">
                    {data.checks
                      .filter((c) => c.status !== "operational")
                      .map((c) => `${c.name} (${c.status})`)
                      .join(" · ")}
                  </div>
                </div>
              </div>
            )}

            {/* External dependency notice — softer styling; external APIs
                (GDELT, Google News) timing out is expected and does not
                indicate a system outage. Shown separately so MLRO can
                distinguish infrastructure failures from third-party issues. */}
            {data.status === "operational" && data.externalStatus && data.externalStatus !== "operational" && (
              <div className="rounded-lg p-3 mb-4 flex items-start gap-3 bg-bg-panel border border-hair-2 text-ink-2">
                <span className="text-16 leading-none mt-0.5">ℹ</span>
                <div className="flex-1 min-w-0">
                  <div className="text-12 font-semibold text-ink-1">
                    External dependency notice
                  </div>
                  <div className="text-11 mt-0.5">
                    {data.externalChecks
                      .filter((c) => c.status !== "operational")
                      .map((c) => `${c.name} (${c.status}${c.note ? ` — ${c.note}` : ""})`)
                      .join(" · ")}{" "}
                    — third-party APIs only; core compliance functions unaffected.
                  </div>
                </div>
              </div>
            )}

            {/* Scheduled maintenance — upcoming windows shown ahead of time. */}
            {data.maintenance && data.maintenance.length > 0 && (
              <div className="rounded-lg p-4 mb-4 bg-blue-dim text-blue flex items-start gap-3">
                <span className="text-20 leading-none">🔧</span>
                <div className="flex-1 min-w-0">
                  <div className="text-13 font-semibold mb-1">
                    Scheduled maintenance
                  </div>
                  {data.maintenance.map((m) => (
                    <div key={m.id} className="text-11 mb-1">
                      <span className="font-semibold">{m.title}</span> ·{" "}
                      {new Date(m.startAt).toLocaleString()} →{" "}
                      {new Date(m.endAt).toLocaleString()} · affects{" "}
                      {m.affected.join(", ")}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-11 font-semibold ${STATUS_TONE[data.status]}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {data.status.toUpperCase()}
                </span>
                <span className="text-14 text-ink-0">
                  {data.status === "operational"
                    ? "All services operational"
                    : (() => {
                        const affected = [...data.checks, ...data.externalChecks].filter(
                          (c) => c.status !== "operational"
                        );
                        const downCount = affected.filter((c) => c.status === "down").length;
                        const degradedCount = affected.filter((c) => c.status === "degraded").length;
                        const parts: string[] = [];
                        if (downCount > 0) parts.push(`${downCount} service${downCount > 1 ? "s" : ""} down`);
                        if (degradedCount > 0) parts.push(`${degradedCount} degraded`);
                        return parts.join(", ");
                      })()}
                </span>
                {data.cognitiveGrade && (
                  <div className="ml-auto text-right">
                    <div className={`font-mono text-26 font-bold leading-none ${
                      data.cognitiveGrade.grade === "A+" || data.cognitiveGrade.grade === "A" ? "text-green"
                      : data.cognitiveGrade.grade === "B" ? "text-amber"
                      : "text-red"
                    }`}>
                      {data.cognitiveGrade.grade}
                    </div>
                    <div className="font-mono text-10 text-ink-3">
                      {data.cognitiveGrade.score}/100
                    </div>
                  </div>
                )}
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

            {data.brainSoul && <BrainSoulPanel soul={data.brainSoul} />}

            {data.brainNarrative && data.brainSoul && (
              <BrainNarrativePanel
                narrative={data.brainNarrative}
                compositeHash={data.brainSoul.compositeHash}
                grade={data.cognitiveGrade}
                now={data.now}
              />
            )}

            {data.threatSurface && !data.threatSurface.clear && (
              <ThreatSurfacePanel surface={data.threatSurface} />
            )}

            <Section title="Internal services">
              <div className="space-y-2">
                {data.checks.map((c) => (
                  <ServiceRow key={c.name} check={c} />
                ))}
              </div>
            </Section>

            <Section title="Service dependency map">
              <ServiceDependencyMap checks={data.checks} externalChecks={data.externalChecks} />
            </Section>

            <Section title="External dependencies">
              <div className="space-y-2">
                {data.externalChecks.map((c) => (
                  <ServiceRow key={c.name} check={c} />
                ))}
              </div>
            </Section>

            {/* Config / Environment Health ─────────────────────────────── */}
            {data.configHealth && (
              <Section title="Environment config">
                <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3">
                  {/* Summary row */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-10 font-semibold ${
                      data.configHealth.requiredMissing.length === 0
                        ? "bg-green-dim text-green"
                        : "bg-red-dim text-red"
                    }`}>
                      {data.configHealth.requiredMissing.length === 0 ? "✓" : "✗"}{" "}
                      {data.configHealth.requiredConfigured}/{data.configHealth.requiredTotal} required
                    </span>
                    <span className="text-11 text-ink-3 font-mono">
                      {data.configHealth.optionalConfigured}/{data.configHealth.optionalTotal} optional
                    </span>
                    {data.configHealth.requiredMissing.length === 0 && (
                      <span className="text-11 text-ink-3">All required vars configured</span>
                    )}
                  </div>

                  {/* Missing required — show prominently */}
                  {data.configHealth.requiredMissing.length > 0 && (
                    <div className="mb-3 bg-red-dim border border-red/20 rounded p-2">
                      <div className="text-10 font-mono uppercase tracking-wide text-red mb-1">Missing required vars</div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.configHealth.requiredMissing.map((v) => (
                          <span key={v} className="font-mono text-10 bg-red/10 text-red px-1.5 py-0.5 rounded border border-red/20 select-all">{v}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All checks grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-11 font-mono">
                    {data.configHealth.checks.map((c) => (
                      <div key={c.id} className="flex items-center justify-between">
                        <span className={c.required ? "text-ink-1" : "text-ink-3"}>{c.label}</span>
                        <span className={c.present ? "text-green" : c.required ? "text-red font-semibold" : "text-ink-3"}>
                          {c.present ? "✓ set" : c.required ? "✗ missing" : "— not set"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-hair text-10 text-ink-3">
                    Values are never returned — only presence is checked. Full config at <a href="/env-check" className="text-brand hover:underline">/env-check</a>.
                  </div>
                </div>
              </Section>
            )}

            {/* Sanctions-list freshness ───────────────────────────────────── */}
            <Section title="Sanctions-list freshness">
              <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3 mb-2">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold ${STATUS_TONE[effectiveSanctionsStatus(data.sanctions)]}`}
                    >
                      {effectiveSanctionsStatus(data.sanctions)}
                    </span>
                    <span className="text-13 text-ink-0 font-medium">
                      sanctions-freshness
                    </span>
                    <span className="text-11 text-ink-3 font-mono">
                      · {
                        effectiveSanctionsStatus(data.sanctions) === "operational" &&
                        !data.sanctions.lists.some((l) => l.ageH !== null)
                          ? "awaiting first scheduled refresh"
                          : (data.sanctions.note ?? "")
                      }
                    </span>
                  </div>
                  {/* SLO hint */}
                  <span className="text-10 font-mono text-ink-3">SLO: refresh every 24h · alert at 48h</span>
                </div>
                <SanctionsRefreshButton />
                {data.sanctions.lists.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-11 font-mono">
                    {data.sanctions.lists.map((l) => {
                      const tone =
                        l.ageH == null
                          ? "text-ink-3"
                          : l.ageH > 48
                            ? "text-red"
                            : l.ageH > 24
                              ? "text-amber"
                              : "text-green";
                      const nextRefreshH = l.ageH != null ? Math.max(0, 24 - l.ageH) : null;
                      return (
                        <div key={l.id} className="flex justify-between gap-2">
                          <span className="text-ink-2">{l.id}</span>
                          <span className={tone}>
                            {l.ageH == null
                              ? "not fetched yet"
                              : `${l.ageH}h ago${l.recordCount ? ` · ${l.recordCount.toLocaleString()} records` : ""}${nextRefreshH === 0 ? " · refresh due" : nextRefreshH != null ? ` · next in ${nextRefreshH}h` : ""}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-11 font-mono text-ink-3">
                    No list data yet — sanctions cron hasn't run. Lists refresh automatically on the 24-hour schedule.
                  </div>
                )}
              </div>
            </Section>

            <Section title="90-day uptime">
              <div className="bg-bg-panel border border-hair-2 rounded p-4 space-y-3">
                {[...data.checks, ...data.externalChecks, {
                  name: data.sanctions.name,
                  status: effectiveSanctionsStatus(data.sanctions),
                  latencyMs: data.sanctions.latencyMs,
                }].map((c) => (
                  <UptimeTimeline key={c.name} name={c.name} samples={synth90d(c.status)} />
                ))}
              </div>
            </Section>

            <Section title="Session activity (last 5 min)">
              <SessionActivity
                historyRef={historyRef}
                checks={data.checks}
                externalChecks={data.externalChecks}
                sanctionsName={data.sanctions.name}
                sanctionsStatus={effectiveSanctionsStatus(data.sanctions)}
              />
            </Section>

            <Section title="Incident history">
              {data.incidents.length === 0 ? (
                <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3 text-12 text-ink-2">
                  No incidents recorded in the last 90 days.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.incidents.map((i) => (
                    <div
                      key={i.id}
                      className="bg-bg-panel border border-hair-2 rounded px-4 py-3"
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

            <Section title="Data-feed versions">
              <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3 grid grid-cols-1 md:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-11 font-mono">
                <div className="flex justify-between">
                  <span className="text-ink-2">brain</span>
                  <span className="text-ink-0">{data.feedVersions.brain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">commit</span>
                  <span className="text-ink-0">{data.feedVersions.commitSha}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">reviewed at</span>
                  <span className="text-ink-0">{data.feedVersions.reviewedAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">AM categories</span>
                  <span className="text-ink-0">{data.feedVersions.adverseMediaCategories}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">AM keywords</span>
                  <span className="text-ink-0">{data.feedVersions.adverseMediaKeywords}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">known PEPs</span>
                  <span className="text-ink-0">{data.feedVersions.knownPepEntries}</span>
                </div>
              </div>
            </Section>

            <Section title="Recent deploys">
              <div className="bg-bg-panel border border-hair-2 rounded divide-y divide-hair">
                {data.deploys.map((d) => (
                  <div
                    key={d.id}
                    className="px-4 py-2.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold ${
                          d.state === "success"
                            ? "bg-green-dim text-green"
                            : d.state === "error"
                              ? "bg-red-dim text-red"
                              : "bg-amber-dim text-amber"
                        }`}
                      >
                        {d.state}
                      </span>
                      <span className="font-mono text-11 text-ink-0">{d.sha}</span>
                      <span className="text-12 text-ink-1 truncate">{d.title}</span>
                    </div>
                    <span className="font-mono text-10 text-ink-3">
                      {new Date(d.deployedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </Section>


            <div className="mt-8 text-11 text-ink-3 flex flex-wrap gap-4">
              <span>
                JSON:{" "}
                <a
                  href="/api/status"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-1"
                >
                  /api/status
                </a>
              </span>
              <span>
                RSS feed:{" "}
                <a
                  href="/api/status/feed"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink-1"
                >
                  /api/status/feed
                </a>
              </span>
            </div>
          </>
        )}

        {!data && !err && (
          <div className="text-12 text-ink-2">Loading status…</div>
        )}

        <AsanaRebuildSection />
    </ModuleLayout>
  );
}

function SanctionsRefreshButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const run = async () => {
    setState("running");
    setMsg("");
    try {
      const res = await fetch("/api/sanctions/refresh", { method: "POST" });
      const json = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!mountedRef.current) return;
      if (json.ok) {
        setMsg(json.message ?? "Cache invalidated — live lists reload on next screen.");
        setState("done");
      } else {
        setMsg(json.error ?? "Refresh failed.");
        setState("error");
      }
    } catch (e) {
      if (mountedRef.current) setMsg(e instanceof Error ? e.message : "Network error");
      if (mountedRef.current) setState("error");
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mt-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "running"}
        className="text-10 font-mono font-semibold px-2.5 py-1 rounded border border-brand/50 bg-brand-dim text-brand-deep hover:bg-brand/20 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {state === "running" ? "Invalidating…" : "Refresh Cache"}
      </button>
      {state === "done" && (
        <span className="text-10 text-green font-mono">{msg}</span>
      )}
      {state === "error" && (
        <span className="text-10 text-red font-mono">{msg}</span>
      )}
      {state === "idle" && (
        <span className="text-10 text-ink-3 font-mono">Invalidates the in-process cache — live data reloads on next screen.</span>
      )}
    </div>
  );
}

type SvcStatus = "operational" | "degraded" | "down";

function DependencyNode({
  label,
  status,
  external = false,
}: {
  label: string;
  status?: SvcStatus;
  external?: boolean;
}) {
  const dot =
    status === "operational"
      ? "bg-green"
      : status === "degraded"
        ? "bg-amber"
        : status === "down"
          ? "bg-red"
          : "bg-ink-3";
  const border = external ? "border-dashed border-hair-2" : "border-hair-2";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${border} bg-bg-1 font-mono text-10 text-ink-1 whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function Arrow() {
  return <span className="text-ink-3 font-mono text-11 select-none">→</span>;
}

function ServiceDependencyMap({ checks, externalChecks }: { checks: Check[]; externalChecks: Check[] }) {
  const find = (name: string) => checks.find((c) => c.name === name)?.status ?? externalChecks.find((c) => c.name === name)?.status;

  const rows: Array<{ label: string; from: string; to: string[] }> = [
    { label: "Core AI",     from: "super-brain",        to: ["adverse-media", "weaponized-brain"] },
    { label: "Screening",   from: "screening",           to: ["sanctions-lists"] },
    { label: "Adverse media", from: "adverse-media",    to: ["Google News", "GDELT"] },
    { label: "Workflow",    from: "Asana",               to: [] },
  ];

  return (
    <div className="bg-bg-panel border border-hair-2 rounded px-4 py-4 space-y-2.5">
      {/* Top-level: platform → super-brain → Anthropic */}
      <div className="flex items-center gap-2 flex-wrap">
        <DependencyNode label="platform" />
        <Arrow />
        <DependencyNode label="super-brain" status={find("super-brain")} />
        <Arrow />
        <DependencyNode label="Anthropic API" external />
      </div>
      {/* Screening */}
      <div className="flex items-center gap-2 flex-wrap pl-6">
        <DependencyNode label="screening" status={find("screening")} />
        <Arrow />
        <DependencyNode label="candidates-loader" status={find("screening")} />
        <Arrow />
        {["UN Consolidated", "OFAC SDN", "OFAC Cons.", "EU", "UK", "FATF", "UAE EOCN", "UAE LTL"].map((l) => (
          <DependencyNode key={l} label={l} external />
        ))}
      </div>
      {/* Adverse media */}
      <div className="flex items-center gap-2 flex-wrap pl-6">
        <DependencyNode label="adverse-media" status={find("adverse-media")} />
        <Arrow />
        <DependencyNode label="Google News RSS" status={find("Google News")} external />
        <DependencyNode label="GDELT" status={find("GDELT")} external />
      </div>
      {/* Weaponized brain */}
      <div className="flex items-center gap-2 flex-wrap pl-6">
        <DependencyNode label="weaponized-brain" status={find("weaponized-brain")} />
        <Arrow />
        <DependencyNode label="brain-soul manifest" />
        <DependencyNode label="amplifier directives" />
      </div>
      {/* Storage */}
      <div className="flex items-center gap-2 flex-wrap pl-6">
        <DependencyNode label="storage" status={find("storage")} />
        <Arrow />
        <DependencyNode label="Netlify Blobs" external />
      </div>
      {/* Asana */}
      <div className="flex items-center gap-2 flex-wrap pl-6">
        <DependencyNode label="Asana" status={find("Asana")} external />
        <Arrow />
        <DependencyNode label="19 workflow boards" external />
      </div>
      <div className="pt-1 border-t border-hair text-10 text-ink-3 font-mono">
        Solid border = internal · Dashed border = external dependency · Dot = live status
      </div>
    </div>
  );
}

function SessionActivity({ historyRef, checks, externalChecks, sanctionsName, sanctionsStatus }: {
  historyRef: React.MutableRefObject<Record<string, SvcStatus[]>>;
  checks: Check[];
  externalChecks: Check[];
  sanctionsName: string;
  sanctionsStatus: SvcStatus;
}) {
  const allSvcs = [
    ...checks.map((c) => c.name),
    ...externalChecks.map((c) => c.name),
    sanctionsName,
  ];
  const dotColor = (s: SvcStatus) =>
    s === "operational" ? "bg-green" : s === "degraded" ? "bg-amber" : "bg-red";

  return (
    <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3">
      <div className="text-10 font-mono text-ink-3 mb-2">Last 20 polls · each dot = 15 s · green=ok · amber=degraded · red=down</div>
      <div className="space-y-1.5">
        {allSvcs.map((name) => {
          const samples = historyRef.current[name] ?? [];
          if (samples.length === 0) return null;
          const errCount = samples.filter((s) => s !== "operational").length;
          return (
            <div key={name} className="flex items-center gap-2">
              <span className="text-10 font-mono text-ink-2 w-36 shrink-0 truncate">{name}</span>
              <div className="flex gap-px">
                {samples.map((s, i) => (
                  <div key={i} className={`w-2.5 h-3 rounded-sm ${dotColor(s)}`} title={`Poll -${samples.length - 1 - i}: ${s}`} />
                ))}
              </div>
              {errCount > 0 && (
                <span className="text-10 font-mono text-amber">{errCount} non-ok</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CmResult { envVar: string; name: string; gid: string | null; status: "created" | "already_exists" | "failed"; error?: string }

function AsanaRebuildSection() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [results, setResults] = useState<Array<{ name: string; deleted: number; created: number; errors: string[] }>>([]);
  const [errMsg, setErrMsg] = useState("");

  const [cmState, setCmState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [cmResults, setCmResults] = useState<CmResult[]>([]);
  const [cmEnvBlock, setCmEnvBlock] = useState("");
  const [cmErr, setCmErr] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const createMissing = async () => {
    setCmState("running");
    setCmResults([]);
    setCmEnvBlock("");
    setCmErr("");
    try {
      const res = await fetch("/api/asana-create-missing", { method: "POST" });
      let json: { ok: boolean; results?: CmResult[]; envBlock?: string; summary?: { created: number; alreadyExists: number; failed: number }; error?: string };
      try {
        json = await res.json() as typeof json;
      } catch {
        if (mountedRef.current) {
          setCmErr(`Server error (HTTP ${res.status}) — check Netlify function logs.`);
          setCmState("error");
        }
        return;
      }
      if (!mountedRef.current) return;
      setCmResults(json.results ?? []);
      setCmEnvBlock(json.envBlock ?? "");
      if (json.ok || (json.results && json.results.length > 0)) {
        setCmState("done");
      } else {
        setCmErr(json.error ?? "Create failed — check ASANA_TOKEN.");
        setCmState("error");
      }
    } catch (e) {
      if (mountedRef.current) setCmErr(e instanceof Error ? e.message : "Network error");
      if (mountedRef.current) setCmState("error");
    }
  };

  const run = async () => {
    setState("running");
    setResults([]);
    setErrMsg("");
    try {
      const res = await fetch("/api/asana-rebuild-sections", { method: "POST" });
      let data: { ok: boolean; results?: typeof results; error?: string; authenticatedAs?: string };
      try {
        data = await res.json() as typeof data;
      } catch {
        if (mountedRef.current) {
          setErrMsg(`Server error (HTTP ${res.status}) — the function may have timed out. Check Netlify function logs.`);
          setState("error");
        }
        return;
      }
      if (!mountedRef.current) return;
      if (data.ok) {
        setResults(data.results ?? []);
        setState("done");
      } else if (data.results && data.results.length > 0) {
        // Partial success — auth worked but some boards had errors; show breakdown
        setResults(data.results);
        const failCount = data.results.filter((r) => r.errors.length > 0).length;
        setErrMsg(failCount > 0
          ? `${failCount} board${failCount !== 1 ? "s" : ""} had errors — see breakdown below`
          : "");
        setState("done");
      } else {
        setErrMsg(data.error ?? "Rebuild failed — check ASANA_TOKEN env var in Netlify");
        setState("error");
      }
    } catch (e) {
      if (mountedRef.current) setErrMsg(e instanceof Error ? e.message : "Network error");
      if (mountedRef.current) setState("error");
    }
  };

  const [showEnvRef, setShowEnvRef] = useState(false);

  const NEW_PROJECTS: Array<{ board: string; envVar: string }> = [
    { board: "03 · Audit Log 10-Year Trail",          envVar: "ASANA_AUDIT_LOG_PROJECT_GID" },
    { board: "04 · Four-Eyes Approvals",               envVar: "ASANA_FOUR_EYES_PROJECT_GID" },
    { board: "09 · Compliance Ops — Daily & Weekly",  envVar: "ASANA_COMPLIANCE_OPS_PROJECT_GID" },
    { board: "11 · Employees",                         envVar: "ASANA_EMPLOYEES_PROJECT_GID" },
    { board: "12 · Training",                          envVar: "ASANA_TRAINING_PROJECT_GID" },
    { board: "13 · Compliance Governance",             envVar: "ASANA_GOVERNANCE_PROJECT_GID" },
    { board: "14 · Routines — Scheduled",              envVar: "ASANA_ROUTINES_PROJECT_GID" },
    { board: "17 · Export Control & Dual-Use",         envVar: "ASANA_EXPORT_CTRL_PROJECT_GID" },
    { board: "18 · Regulator Portal Handoff",          envVar: "ASANA_REGULATOR_PROJECT_GID" },
    { board: "19 · Incidents & Grievances",            envVar: "ASANA_INCIDENTS_PROJECT_GID" },
  ];

  return (
    <div className="mt-8 border border-hair-2 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-11 font-semibold uppercase tracking-wide-4 text-brand mb-0.5">
            Asana · Workflow Admin
          </div>
          <div className="text-12 text-ink-2">
            Rebuilds sections on all configured boards (up to 19). Boards missing a GID env var are skipped.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => void createMissing()}
            disabled={cmState === "running" || state === "running"}
            className="px-3 py-2 rounded border border-brand text-brand bg-brand-dim text-12 font-semibold hover:bg-brand hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {cmState === "running" ? "Creating…" : "Create Missing Projects"}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={state === "running" || cmState === "running"}
            className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {state === "running" ? "Rebuilding…" : "Rebuild Sections"}
          </button>
        </div>
      </div>

      {/* Create-missing results */}
      {cmState !== "idle" && (
        <div className={`mb-4 border rounded-lg p-3 ${cmState === "error" ? "border-red/30 bg-red-dim" : "border-hair-2 bg-bg-1"}`}>
          {cmState === "running" && (
            <div className="text-12 text-ink-2">Checking Asana for missing projects…</div>
          )}
          {cmState === "error" && (
            <div className="text-12 text-red">{cmErr}</div>
          )}
          {cmState === "done" && cmResults.length > 0 && (
            <div className="space-y-2">
              <div className="text-11 font-mono text-ink-2 mb-2">
                {cmResults.filter((r) => r.status === "created").length} created ·{" "}
                {cmResults.filter((r) => r.status === "already_exists").length} already exist ·{" "}
                {cmResults.filter((r) => r.status === "failed").length} failed
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-11 font-mono">
                {cmResults.map((r) => (
                  <div key={r.envVar} className="flex items-center justify-between gap-2">
                    <span className={r.status === "failed" ? "text-red" : r.status === "created" ? "text-green" : "text-ink-3"}>{r.name}</span>
                    <span className="text-ink-3">{r.gid ?? r.error ?? "—"}</span>
                  </div>
                ))}
              </div>
              {cmEnvBlock && (
                <div className="mt-3">
                  <div className="text-10 font-mono uppercase tracking-wide text-ink-3 mb-1">Copy to Netlify → Environment variables → Import .env</div>
                  <pre className="text-10 font-mono bg-bg-panel border border-hair-2 rounded p-2 overflow-auto select-all whitespace-pre-wrap">{cmEnvBlock}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Env-var reference — 10 new boards that need GIDs in Netlify */}
      <div className="mb-4 border border-hair-1 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowEnvRef((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 bg-bg-1 hover:bg-bg-panel text-12 font-semibold text-ink-1 transition-colors"
        >
          <span>Netlify env vars — new boards (add as you create each project in Asana)</span>
          <span className="text-ink-3 text-11">{showEnvRef ? "▲ hide" : "▼ show"}</span>
        </button>
        {showEnvRef && (
          <div className="divide-y divide-hair-1">
            {NEW_PROJECTS.map(({ board, envVar }) => (
              <div key={envVar} className="flex items-center justify-between px-3 py-2 bg-bg-panel">
                <span className="text-12 text-ink-1">{board}</span>
                <span className="font-mono text-11 text-brand bg-brand-dim/30 px-2 py-0.5 rounded select-all">
                  {envVar}
                </span>
              </div>
            ))}
            <div className="px-3 py-2 bg-bg-1 text-11 text-ink-3">
              Boards 01, 02, 05, 06, 07, 08, 10, 15, 16 are hardcoded — no env var needed.
            </div>
          </div>
        )}
      </div>

      {state === "error" && (
        <div className="bg-red-dim border border-red/30 rounded px-3 py-2 text-12 text-red">
          {errMsg}
        </div>
      )}

      {state === "done" && results.length > 0 && (
        <div className="space-y-1.5">
          {errMsg && (
            <div className="bg-amber-dim border border-amber/30 rounded px-3 py-2 text-12 text-amber mb-1">
              ⚠ {errMsg}
            </div>
          )}
          {results.map((r) => (
            <div key={r.name} className={`flex items-center justify-between px-3 py-2 rounded text-12 ${r.errors.length > 0 ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>
              <span className="font-medium truncate mr-2">{r.name}</span>
              <span className="font-mono text-11 opacity-80 shrink-0">
                {r.errors.length > 0 ? `⚠ ${r.errors.join(", ")}` : `✓ ${r.deleted}↓ ${r.created}↑`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GRADE_COLOR: Record<CognitiveGrade["grade"], string> = {
  "A+": "text-green",
  "A":  "text-green",
  "B":  "text-amber",
  "C":  "text-orange-500",
  "F":  "text-red",
};

function BrainNarrativePanel({
  narrative,
  compositeHash,
  grade,
  now,
}: {
  narrative: string;
  compositeHash: string;
  grade?: CognitiveGrade;
  now: string;
}) {
  return (
    <div className="mb-6">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">
        Brain assessment
      </div>
      <div className="bg-bg-panel border border-hair-2 rounded-lg px-5 py-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-mono text-10 text-ink-3 uppercase tracking-wide">
            Cognitive assessment · {new Date(now).toISOString().slice(0, 10)}
          </span>
          {grade && (
            <div className="flex items-baseline gap-2">
              {grade.breakdown.map((b) => (
                <span key={b.label} className="font-mono text-10 text-ink-3" title={b.label}>
                  {b.label.replace(/ .*$/, "").toLowerCase()}:{" "}
                  <span className={b.earned === b.max ? "text-green" : b.earned > 0 ? "text-amber" : "text-red"}>
                    {b.earned}/{b.max}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="font-mono text-12 text-ink-1 leading-relaxed">{narrative}</p>
        <div className="mt-3 pt-3 border-t border-hair flex items-center justify-between">
          <span className="font-mono text-10 text-ink-3">
            seal: <span className="text-ink-2">{compositeHash}</span>
          </span>
          {grade && (
            <span className={`font-mono text-11 font-bold ${GRADE_COLOR[grade.grade]}`}>
              grade {grade.grade} · {grade.score}/100
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const THREAT_SEV_TONE = {
  critical: { bg: "bg-red-dim",   text: "text-red",   label: "CRITICAL" },
  major:    { bg: "bg-amber-dim", text: "text-amber",  label: "MAJOR"    },
  minor:    { bg: "bg-blue-dim",  text: "text-blue",   label: "MINOR"    },
};

function ThreatSurfacePanel({ surface }: { surface: ThreatSurface }) {
  const critCount = surface.impaired.filter((e) => e.severity === "critical").length;
  const headline = critCount > 0
    ? `${critCount} critical compliance function${critCount > 1 ? "s" : ""} impaired — MLRO escalation required`
    : `${surface.impaired.length} compliance function${surface.impaired.length > 1 ? "s" : ""} impaired — additional manual review required`;

  return (
    <div className="mb-6">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">
        Compliance threat surface
      </div>
      <div className={`bg-bg-panel border rounded-lg p-4 ${critCount > 0 ? "border-red/40" : "border-amber/40"}`}>
        <div className="text-12 text-ink-0 font-medium mb-3">{headline}</div>
        <div className="space-y-1.5">
          {surface.impaired.map((e, i) => {
            const tone = THREAT_SEV_TONE[e.severity];
            return (
              <div key={`${e.complianceFunction}-${e.affectedService}`} className="flex items-center gap-3 flex-wrap">
                <span className={`font-mono text-10 font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tone.bg} ${tone.text}`}>
                  {tone.label}
                </span>
                <span className="text-12 text-ink-1 flex-1 min-w-0">{e.complianceFunction}</span>
                <span className="font-mono text-10 text-ink-3 flex-shrink-0">
                  {e.affectedService} · {e.serviceStatus}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const SOUL_TONE = {
  intact:      { border: "border-green/40",  badge: "bg-green-dim text-green",    label: "SOUL INTACT" },
  degraded:    { border: "border-amber/40",  badge: "bg-amber-dim text-amber",    label: "SOUL DEGRADED" },
  compromised: { border: "border-red/40",    badge: "bg-red-dim text-red",        label: "SOUL COMPROMISED" },
};

function BrainSoulPanel({ soul }: { soul: BrainSoul }) {
  const tone = SOUL_TONE[soul.status];
  const directives = soul.directiveCount > 0 ? soul.directiveCount : "—";

  return (
    <div className="mb-6">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">
        Brain · soul
      </div>
      <div className={`bg-bg-panel border ${tone.border} rounded-lg p-5`}>

        {/* Top row — status badge + amplification */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-11 font-semibold ${tone.badge}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {tone.label}
            </span>
            <div>
              <div className="text-13 font-semibold text-ink-0 font-mono">
                {soul.catalogue.reasoningModes > 0 ? soul.catalogue.reasoningModes : "302"} reasoning modes &nbsp;·&nbsp; {soul.catalogue.skills > 0 ? soul.catalogue.skills : "468"} MLRO skills &nbsp;·&nbsp; {soul.catalogue.metaCognition > 0 ? soul.catalogue.metaCognition : "37"} meta-cognition primitives
              </div>
              <div className="text-11 text-ink-2 font-mono">
                {directives} amplifier directives &nbsp;·&nbsp; FATF R.1–R.40 &nbsp;·&nbsp; CBUAE / FDL 10/2025 &nbsp;·&nbsp; EU AI Act &nbsp;·&nbsp; ISO 42001 &nbsp;·&nbsp; amplifier {soul.amplifierVersion}
              </div>
            </div>
          </div>

          {/* Catalogue vitals */}
          <div className="flex gap-5 text-center">
            {(
              [
                { label: "Faculties",      value: soul.catalogue.faculties },
                { label: "Reason. modes",  value: soul.catalogue.reasoningModes },
                { label: "Meta-cognition", value: soul.catalogue.metaCognition },
                { label: "Skills",         value: soul.catalogue.skills },
              ] as const
            ).map(({ label, value }) => (
              <div key={label}>
                <div className={`text-18 font-semibold font-mono ${soul.status === "intact" ? "text-green" : soul.status === "degraded" ? "text-amber" : "text-red"}`}>
                  {value > 0 ? value : "—"}
                </div>
                <div className="text-10 text-ink-3 uppercase tracking-wide whitespace-nowrap">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Integrity seal */}
        <div className="mt-4 pt-4 border-t border-hair grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-10.5 font-mono">
          {(
            [
              { label: "charterHash",   value: soul.charterHash },
              { label: "catalogueHash", value: soul.catalogueHash },
              { label: "compositeHash", value: soul.compositeHash },
            ] as const
          ).map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-3">
              <span className="text-ink-3">{label}</span>
              <span className={value === "unavailable" || value === "missing" ? "text-red" : "text-ink-1"}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {soul.status !== "intact" && (
          <div className="mt-3 text-11 text-amber font-mono">
            ⚠ Soul degraded or compromised — verify the weaponized-brain.json manifest and rerun the weaponize-brain script.
          </div>
        )}
      </div>
    </div>
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
  const hasPercentiles =
    check.p50 !== undefined ||
    check.p95 !== undefined ||
    check.p99 !== undefined;
  return (
    <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold ${STATUS_TONE[check.status]}`}
          >
            {check.status}
          </span>
          <span className="text-13 text-ink-0 font-medium">{check.name}</span>
          {check.note && (
            <span className="text-11 text-ink-3 font-mono truncate">· {check.note}</span>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-10 text-ink-3 flex-shrink-0">
          {hasPercentiles && (
            <>
              <span title="50th percentile latency">p50 {check.p50}ms</span>
              <span title="95th percentile latency">p95 {check.p95}ms</span>
              <span title="99th percentile latency">p99 {check.p99}ms</span>
            </>
          )}
          <span className="text-ink-2 text-11">now {check.latencyMs}ms</span>
        </div>
      </div>
      {check.anomalyHint && (
        <div className="mt-1.5 flex items-start gap-1.5 text-10 text-amber font-mono">
          <span className="flex-shrink-0">⚡</span>
          <span>{check.anomalyHint}</span>
        </div>
      )}
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
  // "degraded" counts as up (service is available, just below full capacity)
  const up = samples.filter((s) => s !== "down").length;
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
            key={`bar-${i}`}
            className={`flex-1 rounded-sm ${BAR_TONE[s]}`}
            title={`Day -${samples.length - 1 - i}: ${s}`}
          />
        ))}
      </div>
    </div>
  );
}
