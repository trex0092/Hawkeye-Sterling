"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";

interface OutsourcingArrangement {
  id: string;
  vendorName: string;
  vendorCountry: string;
  serviceType: string;
  amlCftRelevant: boolean;
  contractStartDate: string;
  contractEndDate?: string;
  riskRating: "high" | "medium" | "low";
  lastAssessmentDate?: string;
  nextAssessmentDate?: string;
  boardApproved: boolean;
  agreementCurrent: boolean;
  status: "active" | "under_review" | "terminated" | "pending_approval";
  mlroSignOff?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface NewArrangementForm {
  vendorName: string;
  vendorCountry: string;
  serviceType: string;
  amlCftRelevant: boolean;
  contractStartDate: string;
  contractEndDate: string;
  riskRating: "high" | "medium" | "low";
  boardApproved: boolean;
  notes: string;
}

interface UpdateForm {
  lastAssessmentDate: string;
  boardApproved: boolean;
  agreementCurrent: boolean;
  mlroSignOff: boolean;
  notes: string;
}

const STATUS_COLOURS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  under_review: "bg-amber-100 text-amber-800",
  terminated: "bg-gray-100 text-gray-600",
  pending_approval: "bg-blue-100 text-blue-800",
};

const RISK_COLOURS: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-green-100 text-green-800",
};

const SERVICE_TYPE_OPTIONS = [
  "KYC Screening",
  "Transaction Monitoring",
  "CDD Data",
  "Sanctions Screening",
  "AML Software",
  "Fraud Detection",
  "Identity Verification",
  "Document Verification",
  "Risk Scoring",
  "Reporting & Analytics",
  "Other",
];

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function OutsourcingRegisterPage() {
  const [arrangements, setArrangements] = useState<OutsourcingArrangement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updateForms, setUpdateForms] = useState<Record<string, UpdateForm>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [form, setForm] = useState<NewArrangementForm>({
    vendorName: "",
    vendorCountry: "",
    serviceType: "KYC Screening",
    amlCftRelevant: true,
    contractStartDate: "",
    contractEndDate: "",
    riskRating: "medium",
    boardApproved: false,
    notes: "",
  });

  const fetchArrangements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outsourcing-register");
      const data = await res.json() as { ok: boolean; records?: OutsourcingArrangement[]; error?: string };
      if (data.ok) {
        setArrangements(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load outsourcing arrangements");
      }
    } catch {
      setError("Network error loading outsourcing arrangements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArrangements();
  }, [fetchArrangements]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/outsourcing-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: form.vendorName,
          vendorCountry: form.vendorCountry,
          serviceType: form.serviceType,
          amlCftRelevant: form.amlCftRelevant,
          contractStartDate: form.contractStartDate,
          ...(form.contractEndDate ? { contractEndDate: form.contractEndDate } : {}),
          riskRating: form.riskRating,
          boardApproved: form.boardApproved,
          ...(form.notes ? { notes: form.notes } : {}),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({
          vendorName: "",
          vendorCountry: "",
          serviceType: "KYC Screening",
          amlCftRelevant: true,
          contractStartDate: "",
          contractEndDate: "",
          riskRating: "medium",
          boardApproved: false,
          notes: "",
        });
        void fetchArrangements();
      } else {
        setError(data.error ?? "Failed to create arrangement");
      }
    } catch {
      setError("Network error creating arrangement");
    } finally {
      setSubmitting(false);
    }
  }

  function openExpand(arr: OutsourcingArrangement) {
    if (expandedId === arr.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(arr.id);
    setUpdateForms((prev) => ({
      ...prev,
      [arr.id]: {
        lastAssessmentDate: arr.lastAssessmentDate ?? "",
        boardApproved: arr.boardApproved,
        agreementCurrent: arr.agreementCurrent,
        mlroSignOff: arr.mlroSignOff ?? false,
        notes: arr.notes ?? "",
      },
    }));
  }

  async function handleUpdate(id: string) {
    const upd = updateForms[id];
    if (!upd) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/outsourcing-register/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(upd.lastAssessmentDate ? { lastAssessmentDate: upd.lastAssessmentDate } : {}),
          boardApproved: upd.boardApproved,
          agreementCurrent: upd.agreementCurrent,
          mlroSignOff: upd.mlroSignOff,
          notes: upd.notes,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setExpandedId(null);
        void fetchArrangements();
      } else {
        setError(data.error ?? "Failed to update arrangement");
      }
    } catch {
      setError("Network error updating arrangement");
    } finally {
      setUpdatingId(null);
    }
  }

  const amlCftArrangements = arrangements.filter((a) => a.amlCftRelevant);
  const dueForReview = arrangements.filter(
    (a) => a.status === "under_review",
  );
  const boardApproved = arrangements.filter((a) => a.boardApproved);

  const hasWarning = amlCftArrangements.some(
    (a) => a.status === "under_review" || !a.boardApproved,
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outsourcing Register</h1>
          <p className="text-sm text-gray-500 mt-1">
            FDL 10/2025 Art.18 · CBUAE Outsourcing Guidance · FATF R.2
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "New Arrangement"}
        </button>
      </div>

      {/* Warning Banner */}
      {hasWarning && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-md px-4 py-3 text-sm flex items-start gap-2">
          <span className="font-bold shrink-0">Warning:</span>
          <span>
            One or more AML/CFT-relevant arrangements are due for review or missing Board approval.
            Review required under FDL 10/2025 Art.18.
          </span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{arrangements.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Arrangements</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">{amlCftArrangements.length}</div>
          <div className="text-xs text-gray-500 mt-1">AML/CFT Relevant</div>
        </div>
        <div className={`border rounded-lg p-4 ${dueForReview.length > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
          <div className={`text-2xl font-bold ${dueForReview.length > 0 ? "text-amber-700" : "text-gray-900"}`}>
            {dueForReview.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Due for Review</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-700">{boardApproved.length}</div>
          <div className="text-xs text-gray-500 mt-1">Board Approved</div>
        </div>
      </div>

      {/* New Arrangement Form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mb-8 bg-white border border-gray-200 rounded-lg p-6"
        >
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Outsourcing Arrangement</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
              <input
                type="text"
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="e.g. Refinitiv World-Check"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Country *</label>
              <input
                type="text"
                value={form.vendorCountry}
                onChange={(e) => setForm({ ...form, vendorCountry: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="e.g. United Kingdom"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Type *</label>
              <select
                value={form.serviceType}
                onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                {SERVICE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Start Date *</label>
              <input
                type="date"
                value={form.contractStartDate}
                onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract End Date</label>
              <input
                type="date"
                value={form.contractEndDate}
                onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.amlCftRelevant}
                onChange={(e) => setForm({ ...form, amlCftRelevant: e.target.checked })}
                className="rounded"
              />
              AML/CFT Relevant
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.boardApproved}
                onChange={(e) => setForm({ ...form, boardApproved: e.target.checked })}
                className="rounded"
              />
              Board Approved
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={2}
              placeholder="Optional notes..."
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
              {submitting ? "Creating..." : "Create Arrangement"}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading arrangements...</div>
      ) : arrangements.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg">
          No outsourcing arrangements registered yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Service Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">AML/CFT</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Risk</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contract End</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Next Assessment</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Board</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {arrangements.map((arr) => (
                <>
                  <tr
                    key={arr.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openExpand(arr)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{arr.vendorName}</td>
                    <td className="px-4 py-3 text-gray-600">{arr.vendorCountry}</td>
                    <td className="px-4 py-3 text-gray-600">{arr.serviceType}</td>
                    <td className="px-4 py-3">
                      {arr.amlCftRelevant ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Yes</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RISK_COLOURS[arr.riskRating]}`}>
                        {arr.riskRating}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(arr.contractEndDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(arr.nextAssessmentDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLOURS[arr.status]}`}>
                        {arr.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {arr.boardApproved ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-red-500 font-bold">✗</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {expandedId === arr.id ? "▲" : "▼"}
                    </td>
                  </tr>

                  {expandedId === arr.id && updateForms[arr.id] && (
                    <tr key={`${arr.id}-expand`}>
                      <td colSpan={10} className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                            <div><span className="font-medium">ID:</span> {arr.id}</div>
                            <div><span className="font-medium">Contract Start:</span> {formatDate(arr.contractStartDate)}</div>
                            <div><span className="font-medium">Last Assessment:</span> {formatDate(arr.lastAssessmentDate)}</div>
                            <div><span className="font-medium">Agreement Current:</span> {arr.agreementCurrent ? "Yes" : "No"}</div>
                            <div><span className="font-medium">MLRO Sign-Off:</span> {arr.mlroSignOff ? "Yes" : "No"}</div>
                            <div><span className="font-medium">Updated:</span> {formatDate(arr.updatedAt)}</div>
                          </div>

                          <div className="border-t border-gray-200 pt-3">
                            <p className="text-xs font-semibold text-gray-700 mb-2">Update Arrangement</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Last Assessment Date</label>
                                <input
                                  type="date"
                                  value={updateForms[arr.id]!.lastAssessmentDate}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [arr.id]: { ...prev[arr.id]!, lastAssessmentDate: e.target.value },
                                    }))
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                                <input
                                  type="text"
                                  value={updateForms[arr.id]!.notes}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [arr.id]: { ...prev[arr.id]!, notes: e.target.value },
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
                                  checked={updateForms[arr.id]!.boardApproved}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [arr.id]: { ...prev[arr.id]!, boardApproved: e.target.checked },
                                    }))
                                  }
                                />
                                Board Approved
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={updateForms[arr.id]!.agreementCurrent}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [arr.id]: { ...prev[arr.id]!, agreementCurrent: e.target.checked },
                                    }))
                                  }
                                />
                                Agreement Current
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={updateForms[arr.id]!.mlroSignOff}
                                  onChange={(e) =>
                                    setUpdateForms((prev) => ({
                                      ...prev,
                                      [arr.id]: { ...prev[arr.id]!, mlroSignOff: e.target.checked },
                                    }))
                                  }
                                />
                                MLRO Sign-Off
                              </label>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <button
                                onClick={() => void handleUpdate(arr.id)}
                                disabled={updatingId === arr.id}
                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {updatingId === arr.id ? "Saving..." : "Save Changes"}
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

      {/* Regulatory Note */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-xs text-blue-800">
        <span className="font-semibold">Regulatory Note:</span>{" "}
        AML/CFT outsourcing arrangements require annual MLRO review and Board approval per FDL 10/2025 Art.18.
      </div>
    </div>
  );
}
