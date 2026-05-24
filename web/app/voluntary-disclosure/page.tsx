"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";

interface VoluntaryDisclosure {
  id: string;
  disclosureType: "sanctions_breach" | "str_filing_delay" | "cdd_failure" | "record_keeping" | "other";
  regulatoryBody: "UAE_FIU" | "MOE" | "CBUAE" | "EOCN" | "OTHER";
  detectedDate: string;
  disclosureDate?: string;
  description: string;
  rootCause: string;
  remediationTaken: string;
  status: "draft" | "pending_mlro" | "pending_legal" | "submitted" | "acknowledged" | "closed";
  mlroApproved?: boolean;
  mlroApprovalDate?: string;
  submittedBy?: string;
  regulatorRef?: string;
  regulatorFeedback?: string;
  selfReportingDiscount?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  disclosureType: string;
  regulatoryBody: string;
  detectedDate: string;
  description: string;
  rootCause: string;
  remediationTaken: string;
}

const DISCLOSURE_TYPE_LABELS: Record<string, string> = {
  sanctions_breach: "Sanctions Breach",
  str_filing_delay: "STR Filing Delay",
  cdd_failure: "CDD Failure",
  record_keeping: "Record Keeping",
  other: "Other",
};

const DISCLOSURE_TYPE_COLOURS: Record<string, string> = {
  sanctions_breach: "bg-red-100 text-red-800",
  str_filing_delay: "bg-orange-100 text-orange-800",
  cdd_failure: "bg-purple-100 text-purple-800",
  record_keeping: "bg-blue-100 text-blue-800",
  other: "bg-gray-100 text-gray-700",
};

const REGULATORY_BODY_COLOURS: Record<string, string> = {
  UAE_FIU: "bg-indigo-100 text-indigo-800",
  MOE: "bg-teal-100 text-teal-800",
  CBUAE: "bg-blue-100 text-blue-800",
  EOCN: "bg-violet-100 text-violet-800",
  OTHER: "bg-gray-100 text-gray-700",
};

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_mlro: "bg-amber-100 text-amber-800",
  pending_legal: "bg-amber-100 text-amber-800",
  submitted: "bg-blue-100 text-blue-800",
  acknowledged: "bg-green-100 text-green-800",
  closed: "bg-green-100 text-green-800",
};

const STATUS_FLOW = ["draft", "pending_mlro", "pending_legal", "submitted", "acknowledged", "closed"];

export default function VoluntaryDisclosurePage() {
  const [records, setRecords] = useState<VoluntaryDisclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    disclosureType: "sanctions_breach",
    regulatoryBody: "CBUAE",
    detectedDate: "",
    description: "",
    rootCause: "",
    remediationTaken: "",
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/voluntary-disclosure");
      const data = await res.json();
      if (data.ok) {
        setRecords(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load disclosures");
      }
    } catch {
      setError("Network error loading disclosures");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/voluntary-disclosure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        setForm({
          disclosureType: "sanctions_breach",
          regulatoryBody: "CBUAE",
          detectedDate: "",
          description: "",
          rootCause: "",
          remediationTaken: "",
        });
        void fetchRecords();
      } else {
        setError(data.error ?? "Failed to create disclosure");
      }
    } catch {
      setError("Network error creating disclosure");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchRecord(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/voluntary-disclosure/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.ok) {
        void fetchRecords();
      } else {
        setError(data.error ?? "Update failed");
      }
    } catch {
      setError("Network error updating disclosure");
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const total = records.length;
  const draftCount = records.filter((r) => r.status === "draft").length;
  const pendingCount = records.filter((r) => r.status === "pending_mlro" || r.status === "pending_legal").length;
  const submittedCount = records.filter((r) => r.status === "submitted").length;
  const acknowledgedCount = records.filter((r) => r.status === "acknowledged").length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voluntary Disclosure Register</h1>
          <p className="text-sm text-gray-500 mt-1">
            CBUAE Enforcement Policy · Self-Reporting Discount · FDL 10/2025 Art.25
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "New Disclosure"}
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3 text-sm">
        Voluntary self-reporting to the regulator before detection may qualify for enforcement mitigation under CBUAE enforcement policy
      </div>

      {/* Status flow visual */}
      <div className="mb-6 flex items-center gap-0 overflow-x-auto">
        {STATUS_FLOW.map((step, i) => (
          <div key={step} className="flex items-center shrink-0">
            <div className={`px-3 py-1.5 rounded text-xs font-medium ${STATUS_COLOURS[step] ?? "bg-gray-100 text-gray-700"}`}>
              {step.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <span className="text-gray-400 mx-1 text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total", value: total, colour: "text-gray-800" },
          { label: "Draft", value: draftCount, colour: "text-gray-600" },
          { label: "Pending Approval", value: pendingCount, colour: "text-amber-700" },
          { label: "Submitted", value: submittedCount, colour: "text-blue-700" },
          { label: "Acknowledged", value: acknowledgedCount, colour: "text-green-700" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${stat.colour}`}>{stat.value}</div>
            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* New Disclosure Form */}
      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Voluntary Disclosure</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Disclosure Type</label>
              <select
                value={form.disclosureType}
                onChange={(e) => setForm({ ...form, disclosureType: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="sanctions_breach">Sanctions Breach</option>
                <option value="str_filing_delay">STR Filing Delay</option>
                <option value="cdd_failure">CDD Failure</option>
                <option value="record_keeping">Record Keeping</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regulatory Body</label>
              <select
                value={form.regulatoryBody}
                onChange={(e) => setForm({ ...form, regulatoryBody: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="UAE_FIU">UAE FIU</option>
                <option value="MOE">MOE</option>
                <option value="CBUAE">CBUAE</option>
                <option value="EOCN">EOCN</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Detected Date</label>
              <input
                type="date"
                value={form.detectedDate}
                onChange={(e) => setForm({ ...form, detectedDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={3}
              required
              placeholder="Describe the breach or issue requiring disclosure..."
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Root Cause</label>
            <textarea
              value={form.rootCause}
              onChange={(e) => setForm({ ...form, rootCause: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={3}
              required
              placeholder="What caused this issue?"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Remediation Taken</label>
            <textarea
              value={form.remediationTaken}
              onChange={(e) => setForm({ ...form, remediationTaken: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={3}
              required
              placeholder="What steps have been taken or are planned to remediate?"
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
              {submitting ? "Creating..." : "Create Disclosure"}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading disclosures...</div>
      ) : records.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg">
          No voluntary disclosures yet. Create one to get started.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Regulatory Body</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Detected Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Disclosure Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">MLRO Approved</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Regulator Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((record) => (
                <>
                  <tr
                    key={record.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                  >
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DISCLOSURE_TYPE_COLOURS[record.disclosureType] ?? "bg-gray-100 text-gray-700"}`}>
                        {DISCLOSURE_TYPE_LABELS[record.disclosureType] ?? record.disclosureType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REGULATORY_BODY_COLOURS[record.regulatoryBody] ?? "bg-gray-100 text-gray-700"}`}>
                        {record.regulatoryBody}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{record.detectedDate}</td>
                    <td className="px-4 py-3 text-gray-500">{record.disclosureDate ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[record.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {record.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {record.mlroApproved === true ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : record.mlroApproved === false ? (
                        <span className="text-red-500">✗</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{record.regulatorRef ?? "—"}</td>
                  </tr>
                  {expandedId === record.id && (
                    <tr key={`${record.id}-expanded`}>
                      <td colSpan={7} className="px-4 py-4 bg-gray-50 border-b border-gray-200">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">ID:</span>{" "}
                              <span className="font-mono text-gray-600">{record.id}</span>
                            </div>
                            {record.submittedBy && (
                              <div>
                                <span className="font-medium text-gray-700">Submitted By:</span>{" "}
                                <span className="text-gray-600">{record.submittedBy}</span>
                              </div>
                            )}
                            {record.selfReportingDiscount && (
                              <div className="col-span-2">
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  Self-Reporting Discount Applicable
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="text-sm">
                            <div className="font-medium text-gray-700 mb-1">Description</div>
                            <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.description}</div>
                          </div>
                          <div className="text-sm">
                            <div className="font-medium text-gray-700 mb-1">Root Cause</div>
                            <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.rootCause}</div>
                          </div>
                          <div className="text-sm">
                            <div className="font-medium text-gray-700 mb-1">Remediation Taken</div>
                            <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.remediationTaken}</div>
                          </div>
                          {record.regulatorFeedback && (
                            <div className="text-sm">
                              <div className="font-medium text-gray-700 mb-1">Regulator Feedback</div>
                              <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.regulatorFeedback}</div>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                            {record.status === "draft" && (
                              <button
                                onClick={() => void patchRecord(record.id, { status: "pending_mlro" })}
                                className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600"
                              >
                                Submit for MLRO Approval
                              </button>
                            )}
                            {record.status === "pending_mlro" && !record.mlroApproved && (
                              <button
                                onClick={() => void patchRecord(record.id, {
                                  mlroApproved: true,
                                  mlroApprovalDate: today,
                                  status: "pending_legal",
                                })}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                              >
                                MLRO Approve
                              </button>
                            )}
                            {record.status === "pending_legal" && (
                              <button
                                onClick={() => void patchRecord(record.id, {
                                  status: "submitted",
                                  disclosureDate: today,
                                })}
                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Mark Submitted
                              </button>
                            )}
                            {record.status === "submitted" && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Regulator feedback..."
                                  value={actionInputs[`feedback_${record.id}`] ?? ""}
                                  onChange={(e) => setActionInputs({ ...actionInputs, [`feedback_${record.id}`]: e.target.value })}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs w-64"
                                />
                                <button
                                  onClick={() => {
                                    const feedback = actionInputs[`feedback_${record.id}`] ?? "";
                                    void patchRecord(record.id, {
                                      regulatorFeedback: feedback,
                                      status: "acknowledged",
                                    });
                                  }}
                                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                >
                                  Record Regulator Response
                                </button>
                              </div>
                            )}
                            {record.status === "acknowledged" && (
                              <button
                                onClick={() => void patchRecord(record.id, { status: "closed" })}
                                className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                              >
                                Close
                              </button>
                            )}
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
