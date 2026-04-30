"use client";

import { useEffect, useMemo, useState } from "react";
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
  type: string;
  description: string;
  severity: "high" | "medium" | "low";
  affectedActors: string[];
  recommendation: string;
}

interface ActorRiskItem {
  actor: string;
  riskFlag: string;
  actionCount: number;
}

interface AuditAnomaly {
  ok: boolean;
  anomalyScore: number;
  anomalyLevel: "critical" | "elevated" | "normal";
  anomalies: AuditAnomalyItem[];
  patternSummary: string;
  actorRisk: ActorRiskItem[];
  integrityNote: string;
  regulatoryNote: string;
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
    try {
      const sliced = entries.slice(-200);
      const payload = sliced.map((e) => ({
        ts: e.timestamp,
        actor: e.actor,
        action: e.action,
        subject: e.target,
      }));
      const res = await fetch("/api/audit-anomaly", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: payload, periodDays: 30 }),
      });
      if (res.ok) {
        const data = (await res.json()) as AuditAnomaly;
        setAnomaly(data);
      }
    } catch { /* non-fatal */ } finally {
      setAnomalyLoading(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm("Clear ALL audit entries? This cannot be undone.")) return;
    window.localStorage.removeItem("hawkeye.audit-trail.v1");
    setEntries([]);
    setChainStatus({ ok: true });
  };

  return (
    <ModuleLayout asanaModule="audit-trail" asanaLabel="Audit Trail">
      <div>
        <div className="mb-8">
          <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
            MODULE 05 · IMMUTABLE RECORD
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
        <div className="flex items-center gap-6 mb-4 px-4 py-3 bg-bg-panel border border-hair-2 rounded-lg">
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
            onClick={runAnomalyScan}
            disabled={anomalyLoading}
            className="text-11 font-semibold px-3 py-1.5 rounded border border-brand bg-brand-dim text-brand hover:bg-brand hover:text-white transition-colors disabled:opacity-50"
          >
            {anomalyLoading ? "Scanning…" : "AI Anomaly Scan"}
          </button>
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

        {/* AI Anomaly panel */}
        {anomaly && (
          <div className="mb-4 bg-bg-panel border border-hair-2 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-2">Anomaly Level</span>
              <span className={`px-2 py-0.5 rounded font-mono text-11 font-bold uppercase ${
                anomaly.anomalyLevel === "critical" ? "bg-red-dim text-red"
                : anomaly.anomalyLevel === "elevated" ? "bg-amber-dim text-amber"
                : "bg-green-dim text-green"
              }`}>
                {anomaly.anomalyLevel}
              </span>
              <span className="font-mono text-12 text-ink-2">Score: {anomaly.anomalyScore}</span>
              <button
                type="button"
                onClick={() => setAnomaly(null)}
                className="ml-auto text-11 text-ink-3 hover:text-ink-1 underline"
              >
                Clear
              </button>
            </div>

            <p className="text-13 text-ink-1 leading-relaxed">{anomaly.patternSummary}</p>

            {anomaly.anomalies.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Anomalies Detected</div>
                <div className="space-y-3">
                  {anomaly.anomalies.map((a, i) => (
                    <div key={i} className="border border-hair-2 rounded p-3 bg-bg-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-12 text-ink-0">{a.type}</span>
                        <span className={`px-1.5 py-px rounded font-mono text-10 font-semibold uppercase ${
                          a.severity === "high" ? "bg-red-dim text-red"
                          : a.severity === "medium" ? "bg-amber-dim text-amber"
                          : "bg-green-dim text-green"
                        }`}>{a.severity}</span>
                      </div>
                      <p className="text-12 text-ink-1 mb-1.5">{a.description}</p>
                      {a.affectedActors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {a.affectedActors.map((actor) => (
                            <span key={actor} className="px-1.5 py-px bg-bg-2 text-ink-2 font-mono text-10 rounded-sm">{actor}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-11 text-ink-2 italic">{a.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {anomaly.actorRisk.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">Actor Risk</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-12 border border-hair-2 rounded">
                    <thead className="bg-bg-1">
                      <tr>
                        {["Actor", "Risk Flag", "Action Count"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {anomaly.actorRisk.map((r, i) => (
                        <tr key={i} className={i < anomaly.actorRisk.length - 1 ? "border-b border-hair" : ""}>
                          <td className="px-3 py-2 font-medium text-ink-0">{r.actor}</td>
                          <td className="px-3 py-2 text-ink-1">{r.riskFlag}</td>
                          <td className="px-3 py-2 font-mono text-ink-2">{r.actionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {anomaly.integrityNote && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">Integrity Note</div>
                <pre className="text-11 font-mono text-ink-1 bg-bg-1 border border-hair-2 rounded p-2.5 whitespace-pre-wrap leading-relaxed">{anomaly.integrityNote}</pre>
              </div>
            )}

            {anomaly.regulatoryNote && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">Regulatory Note</div>
                <pre className="text-11 font-mono text-ink-1 bg-bg-1 border border-hair-2 rounded p-2.5 whitespace-pre-wrap leading-relaxed">{anomaly.regulatoryNote}</pre>
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
                  <td colSpan={5} className="px-6 py-10 text-center text-12 text-ink-2">
                    {entries.length === 0
                      ? "Audit chain is empty. Entries are written automatically when screenings are added, STRs filed, and cases opened."
                      : "No entries match your filter."}
                  </td>
                </tr>
              ) : (
                [...filtered].reverse().map((entry, idx) => {
                  const isLast = idx === filtered.length - 1;
                  return (
                    <tr key={entry.id} className="hover:bg-bg-1">
                      <td className={`px-4 py-2.5 font-mono text-10 text-ink-2 ${isLast ? "" : "border-b border-hair"}`}>
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
