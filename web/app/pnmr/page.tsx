"use client";

import { useEffect, useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";

interface PnmrRecord {
  id: string;
  subjectName: string;
  listId: string;
  listLabel: string;
  status: "pending" | "submitted" | "resolved_false_positive" | "resolved_confirmed";
  createdAt: string;
  dueAt: string;
  goamlRef?: string;
  submittedAt?: string;
  resolvedAt?: string;
  notes?: string;
}

type FilterTab = "all" | "pending" | "submitted" | "resolved_false_positive" | "resolved_confirmed";

function getSlaStatus(dueAt: string): "green" | "amber" | "red" {
  const msRemaining = Date.parse(dueAt) - Date.now();
  const daysRemaining = msRemaining / 86400000;
  if (msRemaining < 0) return "red";
  if (daysRemaining <= 2) return "amber";
  return "green";
}

const SLA_COLORS: Record<string, string> = {
  green: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
  amber: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  red: "bg-red-950/30 text-red-300 border border-red-500/40",
};

const SLA_LABELS: Record<string, string> = {
  green: "On track",
  amber: "Due soon",
  red: "Overdue",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  submitted: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  resolved_false_positive: "bg-zinc-800/40 text-ink-2 border border-hair-2",
  resolved_confirmed: "bg-red-950/30 text-red-300 border border-red-500/40",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted",
  resolved_false_positive: "False Positive",
  resolved_confirmed: "Confirmed",
};

export default function PnmrQueuePage() {
  const [records, setRecords] = useState<PnmrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/pnmr");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; records: PnmrRecord[] };
      setRecords(data.records ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PNMR records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  async function updateStatus(id: string, status: PnmrRecord["status"]) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/pnmr/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void fetchRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  const overdueCount = records.filter(
    (r) => r.status === "pending" && getSlaStatus(r.dueAt) === "red"
  ).length;

  const filtered = filter === "all" ? records : records.filter((r) => r.status === filter);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "submitted", label: "Submitted" },
    { key: "resolved_false_positive", label: "Resolved" },
  ];

  return (
    <ModuleLayout>
      <ModuleFamilyBar
        suiteName="Sanctions Alerts & Name Match"
        modules={[
          { label: "TFS Alerts", href: "/tfs-alerts", icon: "🚨" },
          { label: "CNMR", href: "/cnmr", icon: "📝" },
          { label: "PNMR Queue", href: "/pnmr", icon: "📋" },
        ]}
      />
      <ModuleHero
        eyebrow="📋 Sanctions — Cabinet Decision 74/2020"
        title="PNMR"
        titleEm="queue."
        intro="Provisional Notification of Match Records · goAML submission · 48-hour SLA · false positive resolution"
      />

      <div className="mx-auto max-w-6xl px-4 pb-16 space-y-4">

        {/* Overdue banner */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm font-medium">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold">{overdueCount}</span>
            record{overdueCount > 1 ? "s" : ""} overdue — immediate action required
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-hair-2">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === key
                  ? "border-brand text-brand"
                  : "border-transparent text-ink-2 hover:text-ink-1"
              }`}
            >
              {label}
              {key === "all" && <span className="ml-1 text-ink-2">({records.length})</span>}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center text-ink-2 py-12 text-sm">Loading PNMR records...</div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-base border-b border-hair-2 text-left text-ink-2 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">List Matched</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-ink-2 py-10">
                      No records found
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const sla = getSlaStatus(r.dueAt);
                  const busy = actionLoading === r.id;
                  return (
                    <tr key={r.id} className="border-b border-hair-2 hover:bg-bg-base/40">
                      <td className="px-4 py-3 font-medium text-ink-0">{r.subjectName}</td>
                      <td className="px-4 py-3 text-ink-1 max-w-xs truncate" title={r.listLabel}>
                        {r.listLabel}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? ""}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {new Date(r.dueAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${SLA_COLORS[sla]}`}>
                          {SLA_LABELS[sla]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          {r.status === "pending" && (
                            <>
                              <button
                                onClick={() => void updateStatus(r.id, "submitted")}
                                disabled={busy}
                                className="text-xs bg-brand text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                              >
                                Submit to goAML
                              </button>
                              <button
                                onClick={() => void updateStatus(r.id, "resolved_false_positive")}
                                disabled={busy}
                                className="text-xs bg-bg-base text-ink-1 border border-hair-2 px-2 py-1 rounded hover:bg-bg-panel disabled:opacity-50"
                              >
                                False Positive
                              </button>
                            </>
                          )}
                          <a
                            href={`/api/pnmr/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand hover:underline px-1 py-1"
                          >
                            View Detail
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
