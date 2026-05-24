"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";

interface DormantAccount {
  id: string;
  customerName: string;
  accountRef: string;
  lastActivityDate: string;
  dormancyStartDate: string;
  riskRating: "high" | "medium" | "low";
  flaggedDate: string;
  status: "flagged" | "under_review" | "reactivated" | "closed" | "escalated";
  reactivationReason?: string;
  reactivationDate?: string;
  reactivationReKycCompleted?: boolean;
  mlroNotified?: boolean;
  mlroNotifiedDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface FlagForm {
  customerName: string;
  accountRef: string;
  lastActivityDate: string;
  riskRating: "high" | "medium" | "low";
  notes: string;
}

interface UpdateForm {
  status: DormantAccount["status"];
  reactivationReason: string;
  reactivationReKycCompleted: boolean;
  mlroNotified: boolean;
  notes: string;
}

const STATUS_COLOURS: Record<string, string> = {
  flagged: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  reactivated: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
  escalated: "bg-red-100 text-red-800",
};

const RISK_COLOURS: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-green-100 text-green-800",
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function DormantAccountsPage() {
  const [accounts, setAccounts] = useState<DormantAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updateForms, setUpdateForms] = useState<Record<string, UpdateForm>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const [form, setForm] = useState<FlagForm>({
    customerName: "",
    accountRef: "",
    lastActivityDate: "",
    riskRating: "medium",
    notes: "",
  });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dormant-accounts");
      const data = await res.json() as { ok: boolean; records?: DormantAccount[]; error?: string };
      if (data.ok) {
        setAccounts(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load dormant accounts");
      }
    } catch {
      setError("Network error loading dormant accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  async function handleFlag(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dormant-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          accountRef: form.accountRef,
          lastActivityDate: form.lastActivityDate,
          riskRating: form.riskRating,
          ...(form.notes ? { notes: form.notes } : {}),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({ customerName: "", accountRef: "", lastActivityDate: "", riskRating: "medium", notes: "" });
        void fetchAccounts();
      } else {
        setError(data.error ?? "Failed to flag account");
      }
    } catch {
      setError("Network error flagging account");
    } finally {
      setSubmitting(false);
    }
  }

  function openExpand(acc: DormantAccount) {
    if (expandedId === acc.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(acc.id);
    setUpdateForms((prev) => ({
      ...prev,
      [acc.id]: {
        status: acc.status,
        reactivationReason: acc.reactivationReason ?? "",
        reactivationReKycCompleted: acc.reactivationReKycCompleted ?? false,
        mlroNotified: acc.mlroNotified ?? false,
        notes: acc.notes ?? "",
      },
    }));
  }

  async function handleUpdate(id: string) {
    const upd = updateForms[id];
    if (!upd) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/dormant-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: upd.status,
          reactivationReason: upd.reactivationReason || undefined,
          reactivationReKycCompleted: upd.reactivationReKycCompleted,
          mlroNotified: upd.mlroNotified,
          notes: upd.notes || undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setExpandedId(null);
        void fetchAccounts();
      } else {
        setError(data.error ?? "Failed to update account");
      }
    } catch {
      setError("Network error updating account");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleNotifyMlro(id: string) {
    setNotifyingId(id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/dormant-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mlroNotified: true, mlroNotifiedDate: today }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        void fetchAccounts();
      } else {
        setError(data.error ?? "Failed to notify MLRO");
      }
    } catch {
      setError("Network error notifying MLRO");
    } finally {
      setNotifyingId(null);
    }
  }

  const totalFlagged = accounts.filter((a) => a.status === "flagged").length;
  const underReview = accounts.filter((a) => a.status === "under_review").length;
  const reactivated = accounts.filter((a) => a.status === "reactivated").length;
  const highRisk = accounts.filter((a) => a.riskRating === "high" && a.status !== "closed" && a.status !== "reactivated").length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dormant Account Register</h1>
          <p className="text-sm text-gray-500 mt-1">
            CBUAE AML/CFT Guidelines §8 · 12-Month Inactivity Threshold
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "Flag Account"}
        </button>
      </div>

      {/* Regulatory Notice */}
      <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-md px-4 py-3 text-sm flex items-start gap-2">
        <span className="font-bold shrink-0">Regulatory Notice:</span>
        <span>
          Dormant accounts reactivated without re-KYC constitute a CDD breach under CBUAE §8.4.
          All reactivations must include completed re-KYC before account activity is permitted.
        </span>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-700">{totalFlagged}</div>
          <div className="text-xs text-gray-500 mt-1">Total Flagged</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">{underReview}</div>
          <div className="text-xs text-gray-500 mt-1">Under Review</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-700">{reactivated}</div>
          <div className="text-xs text-gray-500 mt-1">Reactivated</div>
        </div>
        <div className={`border rounded-lg p-4 ${highRisk > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
          <div className={`text-2xl font-bold ${highRisk > 0 ? "text-red-700" : "text-gray-900"}`}>
            {highRisk}
          </div>
          <div className="text-xs text-gray-500 mt-1">High-Risk Dormant</div>
        </div>
      </div>

      {/* Flag Account Form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleFlag(e)}
          className="mb-8 bg-white border border-gray-200 rounded-lg p-6"
        >
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Flag Dormant Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
              <input
                type="text"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="e.g. Mohammed Al-Rashidi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Reference *</label>
              <input
                type="text"
                value={form.accountRef}
                onChange={(e) => setForm({ ...form, accountRef: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="e.g. ACC-2021-00412"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Activity Date *</label>
              <input
                type="date"
                value={form.lastActivityDate}
                onChange={(e) => setForm({ ...form, lastActivityDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Risk Rating *</label>
              <select
                value={form.riskRating}
                onChange={(e) => setForm({ ...form, riskRating: e.target.value as "high" | "medium" | "low" })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={2}
              placeholder="Optional notes about this dormant account..."
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Flagging..." : "Flag Account"}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading dormant accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg">
          No dormant accounts flagged yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Account Ref</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Activity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dormancy Since</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Risk</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">MLRO Notified</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Re-KYC Done</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((acc) => (
                <>
                  <tr
                    key={acc.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openExpand(acc)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{acc.customerName}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-xs">{acc.accountRef}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(acc.lastActivityDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(acc.dormancyStartDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RISK_COLOURS[acc.riskRating]}`}>
                        {acc.riskRating}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLOURS[acc.status]}`}>
                        {acc.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {acc.mlroNotified ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-red-500 font-bold">✗</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {acc.reactivationReKycCompleted ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : acc.status === "reactivated" ? (
                        <span className="text-red-600 font-bold text-xs">Missing</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {expandedId === acc.id ? "▲" : "▼"}
                    </td>
                  </tr>

                  {expandedId === acc.id && updateForms[acc.id] && (
                    <tr key={`${acc.id}-expand`}>
                      <td colSpan={9} className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                        <div className="space-y-3">
                          {/* Detail */}
                          <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                            <div><span className="font-medium">ID:</span> {acc.id}</div>
                            <div><span className="font-medium">Flagged Date:</span> {formatDate(acc.flaggedDate)}</div>
                            <div><span className="font-medium">Reactivation Date:</span> {formatDate(acc.reactivationDate)}</div>
                            <div><span className="font-medium">MLRO Notified Date:</span> {formatDate(acc.mlroNotifiedDate)}</div>
                            {acc.reactivationReason && (
                              <div className="col-span-2"><span className="font-medium">Reactivation Reason:</span> {acc.reactivationReason}</div>
                            )}
                            {acc.notes && (
                              <div className="col-span-2"><span className="font-medium">Notes:</span> {acc.notes}</div>
                            )}
                          </div>

                          {/* Notify MLRO button */}
                          {!acc.mlroNotified && (
                            <div>
                              <button
                                onClick={() => void handleNotifyMlro(acc.id)}
                                disabled={notifyingId === acc.id}
                                className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                              >
                                {notifyingId === acc.id ? "Notifying..." : "Notify MLRO"}
                              </button>
                            </div>
                          )}

                          {/* Update Form */}
                          <div className="border-t border-gray-200 pt-3">
                            <p className="text-xs font-semibold text-gray-700 mb-2">Update Record</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                                <select
                                  value={updateForms[acc.id]!.status}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [acc.id]: { ...prev[acc.id]!, status: e.target.value as DormantAccount["status"] },
                                    }))
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                >
                                  <option value="flagged">Flagged</option>
                                  <option value="under_review">Under Review</option>
                                  <option value="reactivated">Reactivated</option>
                                  <option value="closed">Closed</option>
                                  <option value="escalated">Escalated</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Reactivation Reason</label>
                                <input
                                  type="text"
                                  value={updateForms[acc.id]!.reactivationReason}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [acc.id]: { ...prev[acc.id]!, reactivationReason: e.target.value },
                                    }))
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                  placeholder="Reason for reactivation..."
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                                <input
                                  type="text"
                                  value={updateForms[acc.id]!.notes}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [acc.id]: { ...prev[acc.id]!, notes: e.target.value },
                                    }))
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                  placeholder="Notes..."
                                />
                              </div>
                            </div>
                            <div className="mt-2 flex gap-4">
                              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={updateForms[acc.id]!.reactivationReKycCompleted}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [acc.id]: { ...prev[acc.id]!, reactivationReKycCompleted: e.target.checked },
                                    }))
                                  }
                                />
                                Re-KYC Completed
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={updateForms[acc.id]!.mlroNotified}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [acc.id]: { ...prev[acc.id]!, mlroNotified: e.target.checked },
                                    }))
                                  }
                                />
                                MLRO Notified
                              </label>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <button
                                onClick={() => void handleUpdate(acc.id)}
                                disabled={updatingId === acc.id}
                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {updatingId === acc.id ? "Saving..." : "Save Changes"}
                              </button>
                            </div>
                          </div>
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
    </div>
  );
}
