"use client";

import { useEffect, useState } from "react";

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
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

const SLA_LABELS: Record<string, string> = {
  green: "On track",
  amber: "Due soon",
  red: "Overdue",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  submitted: "bg-blue-100 text-blue-800",
  resolved_false_positive: "bg-gray-100 text-gray-700",
  resolved_confirmed: "bg-red-100 text-red-800",
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

  async function fetchRecords() {
    try {
      setLoading(true);
      const res = await fetch("/api/pnmr");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; records: PnmrRecord[] };
      setRecords(data.records ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PNMR records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchRecords(); }, []);

  async function updateStatus(id: string, status: PnmrRecord["status"]) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/pnmr/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchRecords();
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">PNMR Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              Provisional Notification of Match Records — Cabinet Decision 74/2020
            </p>
          </div>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 bg-red-600 text-white text-sm font-medium px-3 py-1 rounded-full">
              {overdueCount} overdue
            </span>
          )}
        </div>

        <div className="flex gap-2 mb-4 border-b border-gray-200">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
              {key === "all" && <span className="ml-1 text-gray-400">({records.length})</span>}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-500 text-sm py-8 text-center">Loading...</p>}
        {error && <p className="text-red-600 text-sm py-8 text-center">{error}</p>}

        {!loading && !error && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-600 text-xs uppercase tracking-wide">
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
                    <td colSpan={7} className="text-center text-gray-400 py-10">
                      No records found
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const sla = getSlaStatus(r.dueAt);
                  const busy = actionLoading === r.id;
                  return (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.subjectName}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={r.listLabel}>
                        {r.listLabel}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? ""}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
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
                                onClick={() => updateStatus(r.id, "submitted")}
                                disabled={busy}
                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                Submit to goAML
                              </button>
                              <button
                                onClick={() => updateStatus(r.id, "resolved_false_positive")}
                                disabled={busy}
                                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-50"
                              >
                                False Positive
                              </button>
                            </>
                          )}
                          <a
                            href={`/api/pnmr/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline px-1 py-1"
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
    </div>
  );
}
