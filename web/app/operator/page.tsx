"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { McpLogEntry } from "@/app/api/operator/logs/route";

type FilterLevel = "all" | "read-only" | "supervised" | "action";

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

export default function OperatorConsolePage() {
  const mountedRef = useRef(true);
  const [entries, setEntries] = useState<McpLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterLevel>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

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

  function exportCsv() {
    window.open("/api/operator/logs?export=csv", "_blank");
  }

  const stats = {
    total: entries.length,
    readOnly: entries.filter((e) => e.consequenceLevel === "read-only").length,
    supervised: entries.filter((e) => e.consequenceLevel === "supervised").length,
    action: entries.filter((e) => e.consequenceLevel === "action").length,
    errors: entries.filter((e) => e.isError).length,
  };

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="🔭 Governance"
        title="Operator Console"
        intro="MCP activity log — every tool call made by Claude is logged here for audit and regulatory review."
      />

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { label: "Total calls", value: stats.total, color: "#ecf0f1" },
          { label: "Read-only", value: stats.readOnly, color: LEVEL_COLORS["read-only"] },
          { label: "Supervised", value: stats.supervised, color: LEVEL_COLORS["supervised"] },
          { label: "Action", value: stats.action, color: LEVEL_COLORS["action"] },
          { label: "Errors", value: stats.errors, color: "#e74c3c" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8,
            padding: "12px 20px", minWidth: 100,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}

        {/* Kill switch status */}
        <div style={{
          background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8,
          padding: "12px 20px", marginLeft: "auto",
        }}>
          <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 4 }}>KILL SWITCH</div>
          <div style={{ fontSize: 13, color: "#2ecc71", fontWeight: 600 }}>
            Set <code style={{ background: "#0d1117", padding: "1px 6px", borderRadius: 4 }}>MCP_ENABLED=false</code> in Netlify to disable all tools instantly
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tool name or content…"
          style={{
            background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6,
            color: "#ccd6f6", padding: "8px 14px", fontSize: 13, flex: 1, minWidth: 200,
          }}
        />
        {(["all", "read-only", "supervised", "action"] as FilterLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            style={{
              background: filter === level ? (LEVEL_BG[level] ?? "rgba(204,214,246,0.1)") : "#1a1a2e",
              border: `1px solid ${filter === level ? (LEVEL_COLORS[level] ?? "#8892b0") : "#2a2a4a"}`,
              borderRadius: 6, color: filter === level ? (LEVEL_COLORS[level] ?? "#ccd6f6") : "#8892b0",
              padding: "8px 14px", fontSize: 12, cursor: "pointer",
            }}
          >
            {level === "all" ? "All" : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
        <button
          onClick={() => void load()}
          style={{
            background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6,
            color: "#8892b0", padding: "8px 14px", fontSize: 12, cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
        <button
          onClick={exportCsv}
          style={{
            background: "#0d2137", border: "1px solid #1a5276", borderRadius: 6,
            color: "#5dade2", padding: "8px 14px", fontSize: 12, cursor: "pointer",
          }}
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Table */}
      {loading && (
        <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>Loading activity log…</div>
      )}
      {error && (
        <div style={{ color: "#e74c3c", padding: 16, background: "rgba(231,76,60,0.1)", borderRadius: 8 }}>
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>
          No tool calls logged yet. Use Claude with the Hawkeye Sterling connector to see activity here.
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a2a4a" }}>
                {["Timestamp", "Tool", "Level", "Duration", "Status", "Input", "Output"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#8892b0", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <>
                  <tr
                    key={e.id}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    style={{
                      borderBottom: "1px solid #16213e",
                      cursor: "pointer",
                      background: expanded === e.id ? "rgba(255,255,255,0.03)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 12px", color: "#8892b0", whiteSpace: "nowrap", fontSize: 12 }}>
                      {new Date(e.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#ccd6f6", fontWeight: 600 }}>{e.tool}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        background: LEVEL_BG[e.consequenceLevel] ?? "transparent",
                        color: LEVEL_COLORS[e.consequenceLevel] ?? "#ccd6f6",
                        border: `1px solid ${LEVEL_COLORS[e.consequenceLevel] ?? "#8892b0"}`,
                        borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                      }}>
                        {e.consequenceLevel}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#8892b0", whiteSpace: "nowrap" }}>{e.durationMs}ms</td>
                    <td style={{ padding: "10px 12px" }}>
                      {e.isError
                        ? <span style={{ color: "#e74c3c", fontWeight: 600 }}>✗ Error</span>
                        : <span style={{ color: "#2ecc71" }}>✓ OK</span>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#8892b0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.inputSummary}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#8892b0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.outputSummary}
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr key={`${e.id}-detail`} style={{ background: "#0d1117" }}>
                      <td colSpan={7} style={{ padding: "16px 20px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div>
                            <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 6, fontWeight: 600 }}>INPUT</div>
                            <pre style={{ color: "#ccd6f6", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                              {e.inputSummary}
                            </pre>
                          </div>
                          <div>
                            <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 6, fontWeight: 600 }}>OUTPUT</div>
                            <pre style={{ color: "#ccd6f6", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                              {e.outputSummary}
                            </pre>
                          </div>
                        </div>
                        <div style={{ marginTop: 12, color: "#8892b0", fontSize: 11 }}>
                          ID: {e.id} · {e.timestamp} · {e.durationMs}ms · {e.consequenceLevel}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleLayout>
  );
}
