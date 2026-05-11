"use client";

// pKYC — Perpetual KYC Dashboard
// Enroll subjects, view monitoring status, review change alerts, force rescreens.
// Controls: 3.01 (ongoing CDD), 3.04 (periodic review), 20.09

import { useEffect, useState, useCallback } from "react";
import type { PKycSubject, PKycCadence } from "@/app/api/pkyc/route";

const BAND_COLOR: Record<string, string> = {
  clear: "#22c55e", low: "#3b82f6", medium: "#f59e0b",
  high: "#f97316", critical: "#ef4444",
};
const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e", pending_review: "#f59e0b", suspended: "#94a3b8", archived: "#64748b",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px",
      border: `1px solid ${color}`, color,
      fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
    }}>
      {label}
    </span>
  );
}

const ADMIN_TOKEN = typeof window !== "undefined"
  ? (localStorage.getItem("hawkeye.adminToken") ?? "")
  : "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const t = typeof window !== "undefined" ? (localStorage.getItem("hawkeye.adminToken") ?? "") : "";
  if (t) h.authorization = `Bearer ${t}`;
  return h;
}

interface PKycStats {
  total: number;
  active: number;
  pendingReview: number;
  dueNow: number;
}

export default function PKycPage() {
  const [subjects, setSubjects] = useState<PKycSubject[]>([]);
  const [stats, setStats] = useState<PKycStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [form, setForm] = useState({
    name: "", entityType: "individual", jurisdiction: "", dob: "",
    cadence: "monthly" as PKycCadence, notes: "", mlro: "",
  });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pkyc", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) { setSubjects(data.subjects ?? []); setStats(data.stats); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRunAll() {
    setRunning(true); setRunResult(null);
    const res = await fetch("/api/pkyc/run", { method: "POST", headers: authHeaders() });
    const data = await res.json();
    setRunResult(`Ran ${data.ran ?? 0} subjects · ${data.changed ?? 0} changes · ${data.errors ?? 0} errors`);
    setRunning(false);
    void load();
  }

  async function handleForceRun(id: string) {
    const res = await fetch(`/api/pkyc/run?id=${encodeURIComponent(id)}&force=true`, { method: "POST", headers: authHeaders() });
    const data = await res.json();
    const r = data.results?.[0];
    setRunResult(r ? `${r.name}: ${r.band?.toUpperCase()} (${r.composite}/100) · ${r.changed ? "⚡ CHANGED" : "no change"}` : "done");
    void load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove subject from pKYC monitoring?")) return;
    await fetch(`/api/pkyc?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    void load();
  }

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    setEnrolling(true);
    await fetch("/api/pkyc", { method: "POST", headers: authHeaders(), body: JSON.stringify(form) });
    setShowEnroll(false);
    setForm({ name: "", entityType: "individual", jurisdiction: "", dob: "", cadence: "monthly", notes: "", mlro: "" });
    setEnrolling(false);
    void load();
  }

  const now = new Date();
  const filtered = subjects.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    return true;
  });

  return (
    <main style={{ padding: "24px 32px", maxWidth: 1100, fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>pKYC — Perpetual Monitoring</h1>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            FDL 10/2025 Art.14 · CR 134/2025 §17 · FATF R.10 — continuous CDD lifecycle
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowEnroll(true)} style={{ padding: "8px 16px", background: "#d61e6f", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            + Enroll Subject
          </button>
          <button onClick={handleRunAll} disabled={running} style={{ padding: "8px 16px", background: "#1e40af", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: running ? 0.6 : 1 }}>
            {running ? "Running…" : "▶ Run Due"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Enrolled", value: stats.total, color: "#0f172a" },
            { label: "Active", value: stats.active, color: "#22c55e" },
            { label: "Pending Review", value: stats.pendingReview, color: "#f59e0b" },
            { label: "Due Now", value: stats.dueNow, color: "#d61e6f" },
          ].map((s) => (
            <div key={s.label} style={{ border: "1px solid #e2e8f0", padding: "12px 16px" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {runResult && (
        <div style={{ padding: "8px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 16, fontSize: 13 }}>
          {runResult}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", fontSize: 13, flex: 1 }} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #e2e8f0", fontSize: 13 }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_review">Pending Review</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Subject table */}
      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8" }}>
          No subjects enrolled. Click &ldquo;+ Enroll Subject&rdquo; to begin perpetual monitoring.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Subject", "Status", "Band", "Composite", "Hits", "Cadence", "Last Run", "Next Run", "Alerts", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isDue = s.status === "active" && new Date(s.nextRunAt) <= now;
              return (
                <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9", background: isDue ? "#fff7ed" : undefined }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                    {s.name}
                    {s.jurisdiction && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>({s.jurisdiction})</span>}
                  </td>
                  <td style={{ padding: "8px 10px" }}><Badge label={s.status.replace("_", " ")} color={STATUS_COLOR[s.status] ?? "#888"} /></td>
                  <td style={{ padding: "8px 10px" }}>
                    {s.lastBand ? <Badge label={s.lastBand} color={BAND_COLOR[s.lastBand] ?? "#888"} /> : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{s.lastComposite !== null ? `${s.lastComposite}/100` : "—"}</td>
                  <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{s.lastHits}</td>
                  <td style={{ padding: "8px 10px", textTransform: "capitalize" }}>{s.cadence}</td>
                  <td style={{ padding: "8px 10px", color: "#64748b" }}>{s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString() : "Never"}</td>
                  <td style={{ padding: "8px 10px", color: isDue ? "#d61e6f" : "#64748b", fontWeight: isDue ? 700 : 400 }}>
                    {isDue ? "⚡ DUE" : new Date(s.nextRunAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "8px 10px", color: s.alertCount > 0 ? "#f97316" : "#94a3b8", fontWeight: s.alertCount > 0 ? 700 : 400 }}>
                    {s.alertCount > 0 ? `⚠ ${s.alertCount}` : "—"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <button onClick={() => handleForceRun(s.id)} style={{ marginRight: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #cbd5e1" }}>Run</button>
                    <button onClick={() => handleDelete(s.id)} style={{ padding: "3px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #fca5a5", color: "#dc2626" }}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Enroll modal */}
      {showEnroll && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: 28, width: 480, maxHeight: "80vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Enroll Subject — pKYC</h2>
            <form onSubmit={handleEnroll}>
              {[
                { label: "Full Name *", key: "name", type: "text", required: true },
                { label: "Entity Type", key: "entityType", type: "select", options: ["individual", "organisation", "vessel", "other"] },
                { label: "Jurisdiction", key: "jurisdiction", type: "text" },
                { label: "Date of Birth (YYYY-MM-DD)", key: "dob", type: "text" },
                { label: "Review Cadence", key: "cadence", type: "select", options: ["daily", "weekly", "monthly", "quarterly", "annual"] },
                { label: "MLRO Assigned", key: "mlro", type: "text" },
                { label: "Notes", key: "notes", type: "text" },
              ].map(({ label, key, type, options, required }) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", marginBottom: 4 }}>{label}</label>
                  {type === "select" ? (
                    <select value={(form as Record<string, string>)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      style={{ width: "100%", padding: "6px 10px", border: "1px solid #e2e8f0", fontSize: 13 }}>
                      {options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type="text" required={required} value={(form as Record<string, string>)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      style={{ width: "100%", padding: "6px 10px", border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <button type="submit" disabled={enrolling} style={{ flex: 1, padding: "10px 16px", background: "#d61e6f", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  {enrolling ? "Enrolling…" : "Enroll"}
                </button>
                <button type="button" onClick={() => setShowEnroll(false)} style={{ flex: 1, padding: "10px 16px", border: "1px solid #e2e8f0", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
