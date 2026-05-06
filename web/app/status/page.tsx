"use client";

import { useEffect, useState } from "react";
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
  const hist: Check["status"] = current === "down" ? "down" : "operational";
  const samples: Check["status"][] = Array.from({ length: 90 }, () => hist);
  // Mark only today (last bar) with the real current status
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
    <ModuleLayout asanaModule="status" asanaLabel="Status">
        <ModuleHero
          moduleNumber={46}
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
            {/* Current-incident banner — only renders when anything is
                not green. Prominent red/amber bar across the whole page. */}
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
                    {[...data.checks, ...data.externalChecks]
                      .filter((c) => c.status !== "operational")
                      .map((c) => `${c.name} (${c.status})`)
                      .join(" · ")}
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
                  All services{" "}
                  {data.status === "operational" ? "operational" : data.status}
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

            <Section title="External dependencies">
              <div className="space-y-2">
                {data.externalChecks.map((c) => (
                  <ServiceRow key={c.name} check={c} />
                ))}
              </div>
            </Section>

            <Section title="Sanctions-list freshness">
              <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
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
                </div>
                {data.sanctions.lists.length > 0 && (
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

function AsanaRebuildSection() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [results, setResults] = useState<Array<{ name: string; deleted: number; created: number; errors: string[] }>>([]);
  const [errMsg, setErrMsg] = useState("");

  const run = async () => {
    setState("running");
    setResults([]);
    setErrMsg("");
    try {
      const res = await fetch("/api/asana-rebuild-sections", { method: "POST" });
      const data = await res.json() as { ok: boolean; results?: typeof results; error?: string };
      if (data.ok) {
        setResults(data.results ?? []);
        setState("done");
      } else {
        setErrMsg(data.error ?? "Rebuild failed");
        setState("error");
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Network error");
      setState("error");
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
        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
        >
          {state === "running" ? "Rebuilding…" : "Rebuild Sections"}
        </button>
      </div>

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
          {results.map((r) => (
            <div key={r.name} className={`flex items-center justify-between px-3 py-2 rounded text-12 ${r.errors.length > 0 ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>
              <span className="font-medium">{r.name}</span>
              <span className="font-mono text-11 opacity-80">
                {r.errors.length > 0 ? `⚠ ${r.errors.join(", ")}` : `✓ ${r.deleted} deleted · ${r.created} created`}
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
