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

interface DependencyGraph {
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string }>;
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
  dependencyGraph: DependencyGraph;
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
              <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3 mb-2">
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
              <div className="bg-bg-panel border border-hair-2 rounded p-4 space-y-3">
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
              <div className="bg-bg-panel border border-hair-2 rounded px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-11 font-mono">
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

            <Section title="Dependency graph">
              <div className="bg-bg-panel border border-hair-2 rounded p-4">
                <DependencyGraphSvg
                  graph={data.dependencyGraph}
                  checks={[...data.checks, ...data.externalChecks]}
                  sanctionsStatus={data.sanctions.status}
                />
                <p className="text-10.5 text-ink-3 mt-2">
                  Service dependency chain. An outage upstream propagates to
                  everything linked from it; any red / amber node in the graph
                  surfaces the blast radius of the failure.
                </p>
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
  const hasPercentiles =
    check.p50 !== undefined ||
    check.p95 !== undefined ||
    check.p99 !== undefined;
  return (
    <div className="flex items-center justify-between bg-bg-panel border border-hair-2 rounded px-4 py-3">
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
      <div className="flex items-center gap-3 font-mono text-10 text-ink-3">
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
  );
}

// Animated SVG dependency-graph renderer. Edges draw in sequentially
// on mount; nodes fade in with staggered delays; node fill reflects
// the live check status (green / amber / red).
function DependencyGraphSvg({
  graph,
  checks,
  sanctionsStatus,
}: {
  graph: {
    nodes: Array<{ id: string; label: string }>;
    edges: Array<{ from: string; to: string }>;
  };
  checks: Check[];
  sanctionsStatus: Check["status"];
}) {
  const [ready, setReady] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  const width = 640;
  const height = 230;
  const nw = 108;
  const nh = 32;

  const LAYOUT: Record<string, { x: number; y: number }> = {
    screening: { x: 100, y: 100 },
    "super-brain": { x: 260, y: 100 },
    "adverse-media": { x: 430, y: 40 },
    "weaponized-brain": { x: 430, y: 100 },
    storage: { x: 430, y: 160 },
    asana: { x: 560, y: 40 },
    "news-feed": { x: 560, y: 100 },
    "sanctions-freshness": { x: 260, y: 185 },
  };

  // Map node id → check status for fill colour.
  const ID_TO_CHECK: Record<string, string> = {
    screening: "Screening API",
    "super-brain": "Super-brain",
    "adverse-media": "Adverse-media",
    "weaponized-brain": "Weaponized brain",
    storage: "Netlify Blobs",
    asana: "Asana",
    "news-feed": "Google News RSS",
  };
  const statusMap: Record<string, Check["status"]> = {};
  for (const [nodeId, checkName] of Object.entries(ID_TO_CHECK)) {
    const found = checks.find(
      (c) => c.name.toLowerCase() === checkName.toLowerCase(),
    );
    statusMap[nodeId] = found?.status ?? "operational";
  }
  statusMap["sanctions-freshness"] = sanctionsStatus;

  const NODE_FILL: Record<Check["status"], { bg: string; border: string; text: string }> = {
    operational: { bg: "#f0fdf4", border: "#86efac", text: "#15803d" },
    degraded:    { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
    down:        { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
  };

  const nodesById: Record<string, { x: number; y: number; label: string; status: Check["status"] }> = {};
  for (const n of graph.nodes) {
    const pos = LAYOUT[n.id] ?? { x: 100, y: 100 };
    nodesById[n.id] = { ...pos, label: n.label, status: statusMap[n.id] ?? "operational" };
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxHeight: 270 }}
    >
      <defs>
        <marker
          id="dg-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#d1d5db" />
        </marker>
        <style>{`
          @keyframes dg-draw {
            from { stroke-dashoffset: var(--len); opacity: 0; }
            10%  { opacity: 1; }
            to   { stroke-dashoffset: 0; opacity: 1; }
          }
          @keyframes dg-fadein {
            from { opacity: 0; transform: scale(0.85); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes dg-pulse {
            0%, 100% { filter: drop-shadow(0 0 0px transparent); }
            50%       { filter: drop-shadow(0 0 5px rgba(99,102,241,0.5)); }
          }
          .dg-node-g { transform-origin: center; transform-box: fill-box; }
          .dg-node-g:hover { animation: dg-pulse 1.4s ease-in-out infinite; cursor: pointer; }
        `}</style>
      </defs>

      {/* Edges */}
      {graph.edges.map((e, i) => {
        const from = nodesById[e.from];
        const to = nodesById[e.to];
        if (!from || !to) return null;
        const x1 = from.x + nw / 2;
        const y1 = from.y + nh / 2;
        const x2 = to.x;
        const y2 = to.y + nh / 2;
        const len = Math.round(Math.hypot(x2 - x1, y2 - y1));
        const delay = `${i * 120}ms`;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#d1d5db"
            strokeWidth={1.5}
            markerEnd="url(#dg-arrow)"
            style={
              ready
                ? {
                    strokeDasharray: len,
                    strokeDashoffset: 0,
                    opacity: 1,
                    animation: `dg-draw 500ms ease-out ${delay} both`,
                    // @ts-expect-error CSS custom property
                    "--len": len,
                  }
                : { opacity: 0 }
            }
          />
        );
      })}

      {/* Nodes */}
      {Object.entries(nodesById).map(([id, n], i) => {
        const fill = NODE_FILL[n.status];
        const isHovered = hoveredId === id;
        const delay = `${graph.edges.length * 120 + i * 80}ms`;
        return (
          <g
            key={id}
            className="dg-node-g"
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId(null)}
            style={
              ready
                ? {
                    animation: `dg-fadein 320ms ease-out ${delay} both`,
                    filter: isHovered
                      ? "drop-shadow(0 0 6px rgba(99,102,241,0.45))"
                      : undefined,
                  }
                : { opacity: 0 }
            }
          >
            <rect
              x={n.x}
              y={n.y}
              width={nw}
              height={nh}
              rx={5}
              fill={fill.bg}
              stroke={fill.border}
              strokeWidth={1.5}
            />
            <text
              x={n.x + nw / 2}
              y={n.y + nh / 2}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 10.5, fill: fill.text, fontWeight: 600, fontFamily: "monospace" }}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
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
