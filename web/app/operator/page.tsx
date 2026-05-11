"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { McpLogEntry } from "@/app/api/operator/logs/route";

type FilterLevel = "all" | "read-only" | "supervised" | "action";
type Tab = "log" | "dashboard" | "fairness";

const LEVEL_COLORS: Record<string, string> = {
  "read-only": "#2ecc71",
  supervised: "#f39c12",
  action: "#e74c3c",
};
const LEVEL_BG: Record<string, string> = {
  "read-only": "rgba(46,204,113,0.12)",
  supervised: "rgba(243,156,18,0.12)",
  action: "rgba(231,76,60,0.12)",
};

function BarChart({ data, maxVal, color }: { data: { label: string; value: number }[]; maxVal: number; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map(d => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 160, fontSize: 11, color: "#ccd6f6", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", flexShrink: 0 }}>{d.label}</div>
          <div style={{ flex: 1, background: "#0d1117", borderRadius: 3, height: 14, overflow: "hidden" }}>
            <div style={{ width: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <div style={{ width: 32, fontSize: 11, color: "#8892b0", textAlign: "right", flexShrink: 0 }}>{d.value}</div>
        </div>
      ))}
    </div>
  );
}

function extractJurisdiction(inputSummary: string): string | null {
  const m = inputSummary.match(/"jurisdiction"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

export default function OperatorConsolePage() {
  const mountedRef = useRef(true);
  const [entries, setEntries] = useState<McpLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterLevel>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("log");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operator/logs?limit=200");
      const data = await res.json() as { ok: boolean; entries?: McpLogEntry[]; error?: string; note?: string };
      if (!mountedRef.current) return;
      if (!data.ok) { setError(data.error ?? "Failed to load logs"); return; }
      setEntries(data.entries ?? []);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (filter !== "all" && e.consequenceLevel !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.tool.includes(q) || e.inputSummary.toLowerCase().includes(q) || e.outputSummary.toLowerCase().includes(q);
    }
    return true;
  });

  function exportCsv() { window.open("/api/operator/logs?export=csv", "_blank"); }

  const stats = {
    total: entries.length,
    readOnly: entries.filter((e) => e.consequenceLevel === "read-only").length,
    supervised: entries.filter((e) => e.consequenceLevel === "supervised").length,
    action: entries.filter((e) => e.consequenceLevel === "action").length,
    errors: entries.filter((e) => e.isError).length,
    anomalies: entries.filter((e) => e.anomalyNote).length,
  };

  const telemetry = useMemo(() => {
    const toolCounts: Record<string, number> = {};
    const toolErrors: Record<string, number> = {};
    const toolDurations: Record<string, number[]> = {};
    for (const e of entries) {
      toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1;
      if (e.isError) toolErrors[e.tool] = (toolErrors[e.tool] ?? 0) + 1;
      (toolDurations[e.tool] ??= []).push(e.durationMs);
    }
    const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
    const toolStats = Object.entries(toolCounts).map(([name, count]) => ({
      name, count,
      errors: toolErrors[name] ?? 0,
      errorRate: Math.round(((toolErrors[name] ?? 0) / count) * 100),
      avgDuration: Math.round((toolDurations[name] ?? []).reduce((a, b) => a + b, 0) / (toolDurations[name]?.length ?? 1)),
    })).sort((a, b) => b.count - a.count);
    const last10 = entries.slice(0, 10);
    const recentErrorRate = last10.length > 0 ? Math.round((last10.filter(e => e.isError).length / last10.length) * 100) : 0;
    return { topTools, toolStats, recentErrorRate };
  }, [entries]);

  const fairness = useMemo(() => {
    const jCounts: Record<string, number> = {};
    const jErrors: Record<string, number> = {};
    const jScreening: Record<string, number> = {};
    for (const e of entries) {
      const j = e.jurisdiction ?? extractJurisdiction(e.inputSummary);
      if (!j) continue;
      jCounts[j] = (jCounts[j] ?? 0) + 1;
      if (e.isError) jErrors[j] = (jErrors[j] ?? 0) + 1;
      if (["screen_subject", "super_brain", "batch_screen", "pep_profile"].includes(e.tool))
        jScreening[j] = (jScreening[j] ?? 0) + 1;
    }
    const avgErrRate = entries.length > 0 ? stats.errors / entries.length : 0;
    return Object.entries(jCounts)
      .map(([jurisdiction, count]) => ({
        jurisdiction, count,
        screeningCount: jScreening[jurisdiction] ?? 0,
        errors: jErrors[jurisdiction] ?? 0,
        errorRate: Math.round(((jErrors[jurisdiction] ?? 0) / count) * 100),
        flagged: avgErrRate > 0 && (jErrors[jurisdiction] ?? 0) / count > avgErrRate * 2,
      }))
      .sort((a, b) => b.count - a.count).slice(0, 20);
  }, [entries, stats.errors]);

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="🔭 Governance"
        title="Operator Console"
        intro="MCP activity log, telemetry, and fairness monitoring — every tool call made by Claude is logged here for audit and regulatory review."
      />

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { label: "Total calls", value: stats.total, color: "#ecf0f1" },
          { label: "Read-only", value: stats.readOnly, color: LEVEL_COLORS["read-only"] },
          { label: "Supervised", value: stats.supervised, color: LEVEL_COLORS["supervised"] },
          { label: "Action", value: stats.action, color: LEVEL_COLORS["action"] },
          { label: "Errors", value: stats.errors, color: "#e74c3c" },
          { label: "Anomalies", value: stats.anomalies, color: "#e74c3c" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, padding: "12px 20px", minWidth: 100 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
        <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, padding: "12px 20px", marginLeft: "auto" }}>
          <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 4 }}>KILL SWITCH</div>
          <div style={{ fontSize: 13, color: "#2ecc71", fontWeight: 600 }}>
            Set <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4 }}>MCP_ENABLED=false</code> in Netlify to disable all tools instantly
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #2a2a4a" }}>
        {([["log", "Activity Log"], ["dashboard", "Telemetry Dashboard"], ["fairness", "Fairness Monitor"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(204,214,246,0.08)" : "transparent", border: "none",
            borderBottom: tab === t ? "2px solid #5dade2" : "2px solid transparent",
            color: tab === t ? "#ccd6f6" : "#8892b0", padding: "8px 16px", fontSize: 13,
            cursor: "pointer", fontWeight: tab === t ? 600 : 400,
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => void load()} style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6, color: "#8892b0", padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>↻ Refresh</button>
        <button onClick={exportCsv} style={{ background: "#0d2137", border: "1px solid #1a5276", borderRadius: 6, color: "#5dade2", padding: "6px 12px", fontSize: 12, cursor: "pointer", marginLeft: 8 }}>↓ CSV</button>
      </div>

      {loading && <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>Loading activity log…</div>}
      {error && <div style={{ color: "#e74c3c", padding: 16, background: "rgba(231,76,60,0.1)", borderRadius: 8 }}>{error}</div>}

      {/* Activity Log */}
      {!loading && !error && tab === "log" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tool name or content…"
              style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6, color: "#ccd6f6", padding: "8px 14px", fontSize: 13, flex: 1, minWidth: 200 }} />
            {(["all", "read-only", "supervised", "action"] as FilterLevel[]).map((level) => (
              <button key={level} onClick={() => setFilter(level)} style={{
                background: filter === level ? (LEVEL_BG[level] ?? "rgba(204,214,246,0.1)") : "#1a1a2e",
                border: `1px solid ${filter === level ? (LEVEL_COLORS[level] ?? "#8892b0") : "#2a2a4a"}`,
                borderRadius: 6, color: filter === level ? (LEVEL_COLORS[level] ?? "#ccd6f6") : "#8892b0",
                padding: "8px 14px", fontSize: 12, cursor: "pointer",
              }}>{level === "all" ? "All" : level.charAt(0).toUpperCase() + level.slice(1)}</button>
            ))}
          </div>
          {filtered.length === 0 && <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>No tool calls logged yet. Use Claude with the Hawkeye Sterling connector to see activity here.</div>}
          {filtered.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a2a4a" }}>
                    {["Timestamp", "Tool", "Level", "Duration", "Status", "Input", "Output"].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#8892b0", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <>
                      <tr key={e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                        style={{ borderBottom: "1px solid #16213e", cursor: "pointer", background: expanded === e.id ? "rgba(255,255,255,0.03)" : e.anomalyNote ? "rgba(231,76,60,0.05)" : "transparent" }}>
                        <td style={{ padding: "10px 12px", color: "#8892b0", whiteSpace: "nowrap", fontSize: 12 }}>{new Date(e.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}</td>
                        <td style={{ padding: "10px 12px", color: "#ccd6f6", fontWeight: 600 }}>
                          {e.tool}{e.anomalyNote && <span style={{ marginLeft: 6, fontSize: 10, color: "#e74c3c" }}>⚠</span>}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: LEVEL_BG[e.consequenceLevel] ?? "transparent", color: LEVEL_COLORS[e.consequenceLevel] ?? "#ccd6f6", border: `1px solid ${LEVEL_COLORS[e.consequenceLevel] ?? "#8892b0"}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{e.consequenceLevel}</span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#8892b0", whiteSpace: "nowrap" }}>{e.durationMs}ms</td>
                        <td style={{ padding: "10px 12px" }}>
                          {e.isError ? <span style={{ color: "#e74c3c", fontWeight: 600 }}>✗ Error</span> : <span style={{ color: "#2ecc71" }}>✓ OK</span>}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#8892b0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.inputSummary}</td>
                        <td style={{ padding: "10px 12px", color: "#8892b0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.outputSummary}</td>
                      </tr>
                      {expanded === e.id && (
                        <tr key={`${e.id}-detail`} style={{ background: "#0d1117" }}>
                          <td colSpan={7} style={{ padding: "16px 20px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                              <div>
                                <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 6, fontWeight: 600 }}>INPUT</div>
                                <pre style={{ color: "#ccd6f6", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>{e.inputSummary}</pre>
                              </div>
                              <div>
                                <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 6, fontWeight: 600 }}>OUTPUT</div>
                                <pre style={{ color: "#ccd6f6", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>{e.outputSummary}</pre>
                              </div>
                            </div>
                            {e.anomalyNote && <div style={{ marginTop: 12, color: "#e74c3c", fontSize: 11, background: "rgba(231,76,60,0.1)", padding: "6px 10px", borderRadius: 4 }}>⚠ Anomaly: {e.anomalyNote}</div>}
                            <div style={{ marginTop: 12, color: "#8892b0", fontSize: 11 }}>ID: {e.id} · {e.timestamp} · {e.durationMs}ms · {e.consequenceLevel}{e.jurisdiction ? ` · ${e.jurisdiction}` : ""}</div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Telemetry Dashboard */}
      {!loading && !error && tab === "dashboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccd6f6", marginBottom: 16 }}>Top Tools by Call Volume</div>
            {telemetry.topTools.length === 0
              ? <div style={{ color: "#8892b0", fontSize: 13 }}>No data yet.</div>
              : <BarChart data={telemetry.topTools} maxVal={telemetry.topTools[0]?.value ?? 1} color="#5dade2" />}
          </div>
          <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccd6f6", marginBottom: 16 }}>Consequence Level Distribution</div>
            <BarChart data={[
              { label: "read-only", value: stats.readOnly },
              { label: "supervised", value: stats.supervised },
              { label: "action", value: stats.action },
            ]} maxVal={Math.max(stats.readOnly, stats.supervised, stats.action, 1)} color="#f39c12" />
            <div style={{ marginTop: 16, fontSize: 12, color: "#8892b0" }}>
              Recent error rate (last 10 calls):{" "}
              <span style={{ color: telemetry.recentErrorRate > 20 ? "#e74c3c" : "#2ecc71", fontWeight: 700 }}>{telemetry.recentErrorRate}%</span>
            </div>
          </div>
          <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, padding: 20, gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ccd6f6", marginBottom: 16 }}>Per-Tool Performance</div>
            {telemetry.toolStats.length === 0
              ? <div style={{ color: "#8892b0", fontSize: 13 }}>No data yet.</div>
              : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a2a4a" }}>
                      {["Tool", "Calls", "Errors", "Error rate", "Avg duration"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#8892b0", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry.toolStats.map(t => (
                      <tr key={t.name} style={{ borderBottom: "1px solid #16213e" }}>
                        <td style={{ padding: "8px 12px", color: "#ccd6f6", fontWeight: 600 }}>{t.name}</td>
                        <td style={{ padding: "8px 12px", color: "#8892b0" }}>{t.count}</td>
                        <td style={{ padding: "8px 12px", color: t.errors > 0 ? "#e74c3c" : "#8892b0" }}>{t.errors}</td>
                        <td style={{ padding: "8px 12px", color: t.errorRate > 20 ? "#e74c3c" : t.errorRate > 5 ? "#f39c12" : "#2ecc71" }}>{t.errorRate}%</td>
                        <td style={{ padding: "8px 12px", color: t.avgDuration > 10000 ? "#f39c12" : "#8892b0" }}>{t.avgDuration}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {/* Fairness Monitor */}
      {!loading && !error && tab === "fairness" && (
        <div>
          <div style={{ background: "rgba(243,156,18,0.1)", border: "1px solid #f39c12", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#f39c12" }}>
            <strong>Control 4.01/4.05:</strong> Screening outcome distribution by jurisdiction. Jurisdictions with error rates &gt;2× the average are flagged for MLRO review.
          </div>
          {fairness.length === 0
            ? <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>No jurisdiction data yet. Jurisdiction is populated from tool call arguments.</div>
            : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a2a4a" }}>
                    {["Jurisdiction", "Total calls", "Screening calls", "Errors", "Error rate", "Flag"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#8892b0", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fairness.map(r => (
                    <tr key={r.jurisdiction} style={{ borderBottom: "1px solid #16213e", background: r.flagged ? "rgba(231,76,60,0.05)" : "transparent" }}>
                      <td style={{ padding: "10px 12px", color: "#ccd6f6", fontWeight: 600 }}>{r.jurisdiction}</td>
                      <td style={{ padding: "10px 12px", color: "#8892b0" }}>{r.count}</td>
                      <td style={{ padding: "10px 12px", color: "#8892b0" }}>{r.screeningCount}</td>
                      <td style={{ padding: "10px 12px", color: r.errors > 0 ? "#e74c3c" : "#8892b0" }}>{r.errors}</td>
                      <td style={{ padding: "10px 12px", color: r.errorRate > 20 ? "#e74c3c" : r.errorRate > 5 ? "#f39c12" : "#2ecc71" }}>{r.errorRate}%</td>
                      <td style={{ padding: "10px 12px" }}>
                        {r.flagged
                          ? <span style={{ color: "#e74c3c", fontSize: 11, fontWeight: 700, background: "rgba(231,76,60,0.15)", padding: "2px 8px", borderRadius: 4 }}>⚠ REVIEW</span>
                          : <span style={{ color: "#2ecc71", fontSize: 11 }}>✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </ModuleLayout>
  );
}
