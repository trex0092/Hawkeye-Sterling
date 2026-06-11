"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import type { TrainingRecord } from "@/lib/server/training-records";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import { IsoDateInput } from "@/components/ui/IsoDateInput";

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TrainingRecord["status"] }) {
  const map: Record<TrainingRecord["status"], { label: string; cls: string }> = {
    current: {
      label: "Current",
      cls: "bg-emerald-950/30 text-emerald-300",
    },
    expiring_soon: {
      label: "Expiring soon",
      cls: "bg-amber-950/30 text-amber-300",
    },
    expired: {
      label: "Expired",
      cls: "bg-red-950/30 text-red-300",
    },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-bg-2 text-ink-2" };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

// ── Add record form ────────────────────────────────────────────────────────────

interface AddForm {
  staffId: string;
  staffName: string;
  courseCode: string;
  courseName: string;
  completedAt: string;
  validityMonths: number;
  certificateRef: string;
}

function emptyForm(): AddForm {
  return {
    staffId: "",
    staffName: "",
    courseCode: "",
    courseName: "",
    completedAt: new Date().toISOString().slice(0, 10),
    validityMonths: 12,
    certificateRef: "",
  };
}

function AddRecordForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<AddForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full border border-hair-2 rounded px-3 py-1.5 text-sm bg-bg-panel text-ink-0 focus:outline-none focus:ring-2 focus:ring-brand/40";

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: form.staffId.trim(),
          staffName: form.staffName.trim(),
          courseCode: form.courseCode.trim(),
          courseName: form.courseName.trim(),
          completedAt: form.completedAt,
          validityMonths: form.validityMonths,
          ...(form.certificateRef.trim() ? { certificateRef: form.certificateRef.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Add failed");
        return;
      }
      setForm(emptyForm());
      onAdded();
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-hair-2 p-5">
      <h2 className="text-sm font-semibold text-ink-1 uppercase tracking-wide mb-4">
        Add Training Record
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">
            Staff ID *
          </label>
          <input
            className={inputCls}
            placeholder="EMP-001"
            value={form.staffId}
            onChange={(e) => setForm({ ...form, staffId: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">
            Staff Name *
          </label>
          <input
            className={inputCls}
            placeholder="Jane Smith"
            value={form.staffName}
            onChange={(e) => setForm({ ...form, staffName: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">
            Course Code *
          </label>
          <input
            className={inputCls}
            placeholder="AML-101"
            value={form.courseCode}
            onChange={(e) => setForm({ ...form, courseCode: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">
            Course Name *
          </label>
          <input
            className={inputCls}
            placeholder="AML Fundamentals"
            value={form.courseName}
            onChange={(e) => setForm({ ...form, courseName: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">
            Completed At *
          </label>
          <IsoDateInput
            className={inputCls}
            value={form.completedAt}
            onChange={(iso) => setForm({ ...form, completedAt: iso })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">
            Validity (months)
          </label>
          <input
            type="number"
            className={inputCls}
            value={form.validityMonths}
            min={1}
            onChange={(e) => setForm({ ...form, validityMonths: parseInt(e.target.value, 10) || 12 })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-ink-3 mb-1">
            Certificate Ref (optional)
          </label>
          <input
            className={inputCls}
            placeholder="CERT-20250524-001"
            value={form.certificateRef}
            onChange={(e) => setForm({ ...form, certificateRef: e.target.value })}
          />
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded bg-red-950/30 border border-red-500/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => void handleAdd()}
          disabled={saving || !form.staffId.trim() || !form.staffName.trim() || !form.courseCode.trim() || !form.courseName.trim()}
          className="px-3 py-1.5 text-12 rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add record"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type StatusFilter = "all" | TrainingRecord["status"];

export default function TrainingTrackerPage() {
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/training");
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = (await res.json()) as {
        ok: boolean;
        records?: TrainingRecord[];
        error?: string;
      };
      if (data.ok && data.records) {
        setRecords(data.records);
      } else {
        setFetchError(data.error ?? "Failed to load records");
      }
    } catch (err) {
      setFetchError(caughtErrorMessage(err, "Network error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const filtered =
    statusFilter === "all"
      ? records
      : records.filter((r) => r.status === statusFilter);

  const counts = {
    all: records.length,
    current: records.filter((r) => r.status === "current").length,
    expiring_soon: records.filter((r) => r.status === "expiring_soon").length,
    expired: records.filter((r) => r.status === "expired").length,
  };

  const filterBtnCls = (f: StatusFilter) =>
    `px-3 py-1 text-xs rounded-full border transition-colors ${
      statusFilter === f
        ? "bg-brand text-white border-brand"
        : "border-hair-2 text-ink-2 hover:bg-bg-1"
    }`;

  return (
    <ModuleLayout asanaModule="training-tracker" asanaLabel="Training Tracker" onAdd={() => document.querySelector<HTMLElement>("[data-training-add-form] input")?.focus()} onSync={() => void fetchRecords()}>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-28 md:text-48 font-bold text-ink-0">Compliance Training Tracker</h1>
          <p className="text-sm text-ink-3 mt-1">
            Track staff AML / compliance training completions and renewal deadlines.
          </p>
        </div>

        {/* Add form */}
        <div className="mb-8" data-training-add-form>
          <AddRecordForm onAdded={() => void fetchRecords()} />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button className={filterBtnCls("all")} onClick={() => setStatusFilter("all")}>
            All ({counts.all})
          </button>
          <button className={filterBtnCls("current")} onClick={() => setStatusFilter("current")}>
            Current ({counts.current})
          </button>
          <button className={filterBtnCls("expiring_soon")} onClick={() => setStatusFilter("expiring_soon")}>
            Expiring soon ({counts.expiring_soon})
          </button>
          <button className={filterBtnCls("expired")} onClick={() => setStatusFilter("expired")}>
            Expired ({counts.expired})
          </button>
        </div>

        {loading && (
          <div className="text-sm text-ink-3 py-12 text-center">
            Loading records…
          </div>
        )}

        {fetchError && (
          <div className="rounded-lg bg-red-950/30 border border-red-500/40 px-4 py-3 text-sm text-red-300">
            {fetchError}
          </div>
        )}

        {!loading && !fetchError && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-hair-2 py-16 text-center">
            <p className="text-ink-3 text-sm">
              {records.length === 0
                ? "No training records yet. Add the first record above."
                : "No records match the selected filter."}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="rounded-xl border border-hair-2 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-base border-b border-hair-2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Staff
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Course
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Completed
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Expires
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    Cert ref
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={`bg-bg-panel hover:bg-bg-base transition-colors ${
                      r.status === "expired"
                        ? "opacity-75"
                        : r.status === "expiring_soon"
                          ? "bg-amber-950/10"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.staffName}</div>
                      <div className="text-xs text-ink-3 font-mono">{r.staffId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="">{r.courseName}</div>
                      <div className="text-xs text-ink-3 font-mono">{r.courseCode}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-2 text-xs">
                      {new Date(r.completedAt).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          r.status === "expired"
                            ? "text-red-400 font-medium"
                            : r.status === "expiring_soon"
                              ? "text-amber-400 font-medium"
                              : "text-ink-2"
                        }
                      >
                        {new Date(r.expiresAt).toLocaleDateString("en-GB")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-3 font-mono">
                      {r.certificateRef ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
