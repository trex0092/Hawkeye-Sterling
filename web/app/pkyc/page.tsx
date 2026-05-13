"use client";

// pKYC — Perpetual KYC Dashboard
// Enroll subjects, view monitoring status, review change alerts, force rescreens.
// Controls: 3.01 (ongoing CDD), 3.04 (periodic review), 20.09

import { useEffect, useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { PKycSubject, PKycCadence } from "@/app/api/pkyc/_store";

const BAND_CLS: Record<string, string> = {
  clear:    "text-green  border-green/40  bg-green-dim",
  low:      "text-blue   border-blue/40   bg-blue-dim",
  medium:   "text-amber  border-amber/40  bg-amber-dim",
  high:     "text-orange border-orange/40 bg-orange/10",
  critical: "text-red    border-red/40    bg-red-dim",
};

const STATUS_CLS: Record<string, string> = {
  active:         "text-green  border-green/40  bg-green-dim",
  pending_review: "text-amber  border-amber/40  bg-amber-dim",
  suspended:      "text-ink-2  border-hair-2    bg-bg-2",
  archived:       "text-ink-3  border-hair      bg-bg-1",
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-10 font-mono font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

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

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-11 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const INPUT_CLS = "w-full px-3 py-2 bg-bg-1 border border-hair-2 rounded text-13 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand";
const SELECT_CLS = "w-full px-3 py-2 bg-bg-1 border border-hair-2 rounded text-13 text-ink-0 focus:outline-none focus:border-brand";

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
    // Convert DD/MM/YYYY → YYYY-MM-DD for the API
    let apiDob = form.dob;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(form.dob)) {
      const [dd, mm, yyyy] = form.dob.split("/");
      apiDob = `${yyyy}-${mm}-${dd}`;
    }
    await fetch("/api/pkyc", { method: "POST", headers: authHeaders(), body: JSON.stringify({ ...form, dob: apiDob }) });
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
    <ModuleLayout>
      {/* Hero */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <ModuleHero
          eyebrow="pKYC · Perpetual Monitoring"
          title="Perpetual"
          titleEm="monitoring."
          intro="FDL 10/2025 Art.14 · CR 134/2025 §17 · FATF R.10 — continuous CDD lifecycle"
        />
        <div className="flex gap-2 shrink-0 mt-2">
          <button
            onClick={() => setShowEnroll(true)}
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white text-13 font-semibold rounded transition-colors"
          >
            + Enroll Subject
          </button>
          <button
            onClick={handleRunAll}
            disabled={running}
            className="px-4 py-2 bg-blue hover:bg-blue/80 text-white text-13 font-semibold rounded transition-colors disabled:opacity-50"
          >
            {running ? "Running…" : "▶ Run Due"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Enrolled",       value: stats.total,         cls: "text-blue" },
            { label: "Active",         value: stats.active,        cls: "text-green" },
            { label: "Pending Review", value: stats.pendingReview, cls: "text-amber" },
            { label: "Due Now",        value: stats.dueNow,        cls: "text-brand" },
          ].map((s) => (
            <div key={s.label} className="bg-panel border border-hair-2 rounded-xl px-4 py-3">
              <div className={`font-mono text-28 font-semibold ${s.cls}`}>{s.value}</div>
              <div className="text-11 uppercase tracking-wide-4 text-ink-2 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Run result banner */}
      {runResult && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-dim border border-green/30 rounded-lg mb-4 text-13 text-green">
          <span className="font-mono">✔</span> {runResult}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 bg-panel border border-hair-2 rounded text-13 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-panel border border-hair-2 rounded text-13 text-ink-0 focus:outline-none focus:border-brand"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_review">Pending Review</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Subject table / empty state */}
      {loading ? (
        <p className="text-ink-2 text-13 py-8 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-ink-2 text-13">
          No subjects enrolled. Click “+ Enroll Subject” to begin perpetual monitoring.
        </div>
      ) : (
        <div className="bg-panel border border-hair-2 rounded-xl overflow-hidden">
          <table className="w-full text-13 border-collapse">
            <thead>
              <tr className="border-b border-hair-2">
                {["Subject", "Status", "Band", "Composite", "Hits", "Cadence", "Last Run", "Next Run", "Alerts", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isDue = s.status === "active" && new Date(s.nextRunAt) <= now;
                return (
                  <tr key={s.id} className={`border-b border-hair last:border-0 ${isDue ? "bg-amber-dim" : "hover:bg-bg-1"} transition-colors`}>
                    <td className="px-3 py-2.5 font-semibold text-ink-0">
                      {s.name}
                      {s.jurisdiction && <span className="text-11 text-ink-2 ml-1.5">({s.jurisdiction})</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge label={s.status.replace("_", " ")} cls={STATUS_CLS[s.status] ?? "text-ink-2 border-hair-2 bg-bg-2"} />
                    </td>
                    <td className="px-3 py-2.5">
                      {s.lastBand
                        ? <Badge label={s.lastBand} cls={BAND_CLS[s.lastBand] ?? "text-ink-2 border-hair-2 bg-bg-2"} />
                        : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-ink-1">{s.lastComposite !== null ? `${s.lastComposite}/100` : "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-ink-1">{s.lastHits}</td>
                    <td className="px-3 py-2.5 capitalize text-ink-1">{s.cadence}</td>
                    <td className="px-3 py-2.5 text-ink-2">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString() : "Never"}</td>
                    <td className={`px-3 py-2.5 ${isDue ? "text-brand font-semibold" : "text-ink-2"}`}>
                      {isDue ? "⚡ DUE" : new Date(s.nextRunAt).toLocaleDateString()}
                    </td>
                    <td className={`px-3 py-2.5 ${s.alertCount > 0 ? "text-orange font-semibold" : "text-ink-3"}`}>
                      {s.alertCount > 0 ? `⚠ ${s.alertCount}` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleForceRun(s.id)}
                          className="px-2 py-1 text-11 border border-hair-2 rounded text-ink-1 hover:border-brand hover:text-brand transition-colors"
                        >
                          Run
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="px-2 py-1 text-11 border border-red/30 rounded text-red hover:bg-red-dim transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Enroll modal */}
      {showEnroll && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hair-2 rounded-2xl p-7 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-20 font-normal text-ink-0">Enroll Subject</h2>
              <button onClick={() => setShowEnroll(false)} className="text-ink-2 hover:text-ink-0 text-20 leading-none">×</button>
            </div>
            <form onSubmit={handleEnroll}>
              <FormField label="Full Name *">
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT_CLS} />
              </FormField>
              <FormField label="Entity Type">
                <select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} className={SELECT_CLS}>
                  {["individual", "organisation", "vessel", "other"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
              <FormField label="Jurisdiction">
                <input type="text" value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} className={INPUT_CLS} />
              </FormField>
              <FormField label="Date of Birth / Registration">
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={form.dob}
                  maxLength={10}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                    const fmt = digits.length > 4
                      ? `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
                      : digits.length > 2
                      ? `${digits.slice(0,2)}/${digits.slice(2)}`
                      : digits;
                    setForm({ ...form, dob: fmt });
                  }}
                  className={INPUT_CLS}
                />
              </FormField>
              <FormField label="Review Cadence">
                <select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as PKycCadence })} className={SELECT_CLS}>
                  {["daily", "weekly", "monthly", "quarterly", "annual"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
              <FormField label="MLRO Assigned">
                <input type="text" value={form.mlro} onChange={(e) => setForm({ ...form, mlro: e.target.value })} className={INPUT_CLS} />
              </FormField>
              <FormField label="Notes">
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_CLS} />
              </FormField>
              <div className="flex gap-3 mt-6">
                <button type="submit" disabled={enrolling} className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white text-13 font-semibold rounded transition-colors disabled:opacity-50">
                  {enrolling ? "Enrolling…" : "Enroll"}
                </button>
                <button type="button" onClick={() => setShowEnroll(false)} className="flex-1 py-2.5 border border-hair-2 rounded text-13 text-ink-1 hover:bg-bg-2 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
