"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
import { formatDMYTimeSec } from "@/lib/utils/dateFormat";
import {
  exportAuditCsv,
  loadAuditEntries,
  verifyChain,
  type AuditEntry,
} from "@/lib/audit";

interface AuditAnomalyItem {
  eventIds: string[];
  pattern: string;
  severity: "critical" | "high" | "medium";
  description: string;
  recommendation: string;
}

interface AuditAnomaly {
  anomalies: AuditAnomalyItem[];
  riskScore: number;
}

const ACTION_TONE: Record<string, string> = {
  "subject.added":       "bg-blue-dim text-blue",
  "screening.completed": "bg-green-dim text-green",
  "str.filed":           "bg-red-dim text-red",
  "sar.filed":           "bg-red-dim text-red",
  "case.opened":         "bg-amber-dim text-amber",
  "case.closed":         "bg-green-dim text-green",
  "ongoing.enrolled":    "bg-violet-dim text-violet",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_TONE[action] ?? "bg-bg-2 text-ink-2";
  return (
    <span className={`inline-flex items-center px-1.5 py-px rounded text-10 font-mono font-semibold uppercase ${cls}`}>
      {action}
    </span>
  );
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditTrailPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [query, setQuery] = useState("");
  const [chainStatus, setChainStatus] = useState<{ ok: boolean; brokenAt?: number } | null>(null);
  const [anomaly, setAnomaly] = useState<AuditAnomaly | null>(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    const loaded = loadAuditEntries();
    setEntries(loaded);
    setChainStatus(verifyChain(loaded));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const handleExportCsv = () => {
    downloadBlob(exportAuditCsv(entries), `hawkeye-audit-${Date.now()}.csv`, "text/csv");
  };

  const handleExportJson = () => {
    downloadBlob(JSON.stringify(entries, null, 2), `hawkeye-audit-${Date.now()}.json`, "application/json");
  };

  const runAnomalyScan = async () => {
    setAnomalyLoading(true);
    setError(null);
    try {
      const sliced = entries.slice(-200);
      const payload = sliced.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        actor: e.actor,
        action: e.action,
        target: e.target,
        ip: undefined as string | undefined,
      }));
      const res = await fetch("/api/audit-trail/anomaly-detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: payload }),
      });
      if (res.ok) {
        const data = (await res.json()) as AuditAnomaly;
        // Ensure anomalies array is present before storing — a malformed
        // response (null/missing) would crash the useMemo iterators below.
        if (!Array.isArray(data?.anomalies)) data.anomalies = [];
        if (mountedRef.current) setAnomaly(data);
      } else {
        if (!mountedRef.current) return;
        console.error(`[hawkeye] audit-trail/anomaly-detect HTTP ${res.status}`);
        setError(`Anomaly scan failed (HTTP ${res.status}). Please try again.`);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("[hawkeye] audit-trail/anomaly-detect threw:", err);
      setError("Anomaly scan could not be reached. Check your connection and try again.");
    } finally {
      if (mountedRef.current) setAnomalyLoading(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm("Clear ALL audit entries? This cannot be undone.")) return;
    window.localStorage.removeItem("hawkeye.audit-trail.v1");
    setEntries([]);
    setChainStatus({ ok: true });
  };

  // Build a set of anomalous event IDs for row highlighting
  const anomalousEventIds = useMemo(() => {
    if (!anomaly) return new Set<string>();
    const ids = new Set<string>();
    for (const a of anomaly.anomalies) {
      for (const id of a.eventIds) ids.add(id);
    }
    return ids;
  }, [anomaly]);

  // Map event ID → worst severity for border colour
  const eventSeverity = useMemo(() => {
    const map = new Map<string, "critical" | "high" | "medium">();
    if (!anomaly) return map;
    const order: Record<"critical" | "high" | "medium", number> = { critical: 3, high: 2, medium: 1 };
    for (const a of anomaly.anomalies) {
      for (const id of a.eventIds) {
        const existing = map.get(id);
        if (!existing || order[a.severity] > order[existing]) {
          map.set(id, a.severity);
        }
      }
    }
    return map;
  }, [anomaly]);

  const riskLevel = anomaly
    ? anomaly.riskScore >= 76 ? "critical"
    : anomaly.riskScore >= 51 ? "high"
    : anomaly.riskScore >= 21 ? "elevated"
    : "normal"
    : null;

  return (
    <ModuleLayout asanaModule="audit-trail" asanaLabel="Audit Trail">
      <div>
        <div className="mb-8">
          <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-brand mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
            IMMUTABLE RECORD
          </div>
          <h1 className="font-display font-normal text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
            Audit <em className="italic text-brand">trail.</em>
          </h1>
          <p className="max-w-[68ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
            <strong>Ten-year retention · tamper-evident chain.</strong> Every disposition,
            escalation and STR is bound to the hash of the preceding event. The chain is
            exportable to goAML and the FIU on demand.
          </p>
        </div>

        {/* KPI bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4 px-4 py-3 bg-bg-panel border border-hair-2 border-t-2 border-t-brand-line rounded-lg">
          <div className="text-center">
            <div className="text-20 font-bold tabular-nums text-ink-0">{entries.length}</div>
            <div className="text-10 text-ink-3 uppercase tracking-wide-3">Total entries</div>
          </div>
          <div className="w-px h-8 bg-hair-2" />
          {chainStatus && (
            <div className="text-center">
              <div className={`text-13 font-semibold ${chainStatus.ok ? "text-green" : "text-red"}`}>
                {chainStatus.ok ? "INTACT" : `BROKEN at #${chainStatus.brokenAt}`}
              </div>
              <div className="text-10 text-ink-3 uppercase tracking-wide-3">Chain integrity</div>
            </div>
          )}
          <div className="flex-1" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by actor, action, or target…"
            className="w-60 text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 focus:outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => void runAnomalyScan()}
            disabled={anomalyLoading || entries.length === 0}
            className="text-11 font-semibold px-3 py-1.5 rounded border border-brand bg-brand-dim text-brand hover:bg-brand hover:text-white transition-colors disabled:opacity-50"
          >
            {anomalyLoading ? "Scanning…" : "🔍 Run Anomaly Detection"}
          </button>
          {anomaly && (
            <button
              type="button"
              onClick={() => window.print()}
              className="text-11 font-mono px-3 py-1.5 rounded border font-semibold"
              style={{ color: "#7c3aed", borderColor: "#7c3aed", background: "rgba(124,58,237,0.07)" }}
            >
              PDF
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 bg-bg-1 hover:bg-bg-panel text-ink-1"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 bg-bg-1 hover:bg-bg-panel text-ink-1"
          >
            Export JSON
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="text-11 font-semibold px-3 py-1.5 rounded border border-red-200 text-red hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-dim border border-red/30 rounded-lg text-13 text-red">
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-11 text-red/70 hover:text-red underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Anomaly Summary Panel */}
        {anomaly && (
          <div className="mb-4 bg-bg-panel border border-hair-2 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-4">
              {/* Risk score as a large number */}
              <div className="text-center shrink-0">
                <div className={`text-40 font-bold tabular-nums leading-none ${
                  riskLevel === "critical" ? "text-red"
                  : riskLevel === "high" ? "text-red"
                  : riskLevel === "elevated" ? "text-amber"
                  : "text-green"
                }`}>
                  {anomaly.riskScore}
                </div>
                <div className="text-10 text-ink-3 uppercase tracking-wide-3 mt-1">Risk Score</div>
              </div>
              <div className="w-px h-12 bg-hair-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-2">Anomaly Level</span>
                  <span className={`px-2 py-0.5 rounded font-mono text-11 font-bold uppercase ${
                    riskLevel === "critical" ? "bg-red-dim text-red"
                    : riskLevel === "high" ? "bg-red-dim text-red"
                    : riskLevel === "elevated" ? "bg-amber-dim text-amber"
                    : "bg-green-dim text-green"
                  }`}>
                    {riskLevel ?? "normal"}
                  </span>
                  <span className="font-mono text-11 text-ink-3">
                    {anomaly.anomalies.length} pattern{anomaly.anomalies.length !== 1 ? "s" : ""} detected
                    {anomalousEventIds.size > 0 && ` · ${anomalousEventIds.size} flagged events`}
                  </span>
                </div>
                {anomaly.anomalies.length === 0 && (
                  <p className="text-12 text-ink-2 italic">No anomalous patterns detected in the analysed events.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAnomaly(null)}
                className="text-11 text-ink-3 hover:text-ink-1 underline shrink-0"
              >
                Clear
              </button>
            </div>

            {anomaly.anomalies.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Detected Patterns</div>
                <div className="space-y-2">
                  {anomaly.anomalies.map((a, i) => (
                    <div
                      key={`${a.pattern ?? a.severity}-${i}`}
                      className={`border rounded p-3 bg-bg-1 border-l-4 ${
                        a.severity === "critical" ? "border-l-red border-hair-2"
                        : a.severity === "high" ? "border-l-red border-hair-2"
                        : "border-l-amber border-hair-2"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-12 text-ink-0">{a.pattern}</span>
                        <span className={`px-1.5 py-px rounded font-mono text-10 font-semibold uppercase ${
                          a.severity === "critical" ? "bg-red-dim text-red"
                          : a.severity === "high" ? "bg-red-dim text-red"
                          : "bg-amber-dim text-amber"
                        }`}>{a.severity}</span>
                        {a.eventIds.length > 0 && (
                          <span className="font-mono text-10 text-ink-3">{a.eventIds.length} event{a.eventIds.length !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                      <p className="text-12 text-ink-1 mb-1.5">{a.description}</p>
                      <p className="text-11 text-ink-2 italic">{a.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
          <table className="w-full border-collapse text-12.5">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 w-36">
                  Timestamp
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 w-28">
                  Actor
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 w-40">
                  Action
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
                  Target
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2 w-32">
                  Hash
                </th>
                <th className="w-[44px]" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-12 text-ink-2">
                    {entries.length === 0
                      ? "Audit chain is empty. Entries are written automatically when screenings are added, STRs filed, and cases opened."
                      : "No entries match your filter."}
                  </td>
                </tr>
              ) : (
                [...filtered].reverse().map((entry, idx) => {
                  const isLast = idx === filtered.length - 1;
                  const sev = eventSeverity.get(entry.id);
                  const isAnomalous = anomalousEventIds.has(entry.id);
                  const leftBorderCls = isAnomalous
                    ? sev === "critical" || sev === "high"
                      ? "border-l-4 border-l-red"
                      : "border-l-4 border-l-amber"
                    : "";
                  return (
                    <tr key={entry.id} className={`hover:bg-bg-1 ${isAnomalous ? "bg-red-dim/30" : ""}`}>
                      <td className={`px-4 py-2.5 font-mono text-10 text-ink-2 ${leftBorderCls} ${isLast ? "" : "border-b border-hair"}`}>
                        {formatDMYTimeSec(entry.timestamp)}
                      </td>
                      <td className={`px-4 py-2.5 text-12 text-ink-0 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.actor}
                      </td>
                      <td className={`px-4 py-2.5 ${isLast ? "" : "border-b border-hair"}`}>
                        <ActionBadge action={entry.action} />
                      </td>
                      <td className={`px-4 py-2.5 text-12 text-ink-0 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.target}
                      </td>
                      <td className={`px-4 py-2.5 font-mono text-10 text-ink-3 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.hash}
                      </td>
                      <td className={`px-2 py-2.5 text-right ${isLast ? "" : "border-b border-hair"}`}>
                        <RowActions
                          label={`audit entry ${entry.id}`}
                          onDelete={() => {
                            const next = entries.filter((x) => x.id !== entry.id);
                            window.localStorage.setItem(
                              "hawkeye.audit-trail.v1",
                              JSON.stringify(next),
                            );
                            setEntries(next);
                          }}
                          deleteConfirmMessage={`Hide audit entry ${entry.id} from your local view? The sealed FDL Art.24 audit chain on the server is unaffected — this only removes it from your browser's view.`}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {entries.length > 0 && (
          <p className="text-10.5 text-ink-3 mt-3 leading-relaxed">
            {entries.length} entries · retention target 10 years (FDL 10/2025 Art.24) ·
            chain integrity: {chainStatus?.ok ? "verified" : `BROKEN at entry ${chainStatus?.brokenAt}`}
          </p>
        )}
      </div>
    </ModuleLayout>
  );
}
