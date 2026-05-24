"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";

interface TmRuleChange {
  id: string;
  ruleName: string;
  ruleType: "threshold" | "new_rule" | "modification" | "retirement";
  currentValue?: string;
  proposedValue: string;
  rationale: string;
  proposedBy: string;
  proposedDate: string;
  status: "proposed" | "testing" | "pending_approval" | "approved" | "deployed" | "rejected";
  testResults?: string;
  testDate?: string;
  expectedImpact: string;
  mlroApproved?: boolean;
  mlroApprovalDate?: string;
  mlroComments?: string;
  deployedDate?: string;
  deployedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  ruleName: string;
  ruleType: string;
  currentValue: string;
  proposedValue: string;
  rationale: string;
  proposedBy: string;
  expectedImpact: string;
}

const RULE_TYPE_LABELS: Record<string, string> = {
  threshold: "Threshold",
  new_rule: "New Rule",
  modification: "Modification",
  retirement: "Retirement",
};

const RULE_TYPE_COLOURS: Record<string, string> = {
  threshold: "bg-blue-100 text-blue-800",
  new_rule: "bg-green-100 text-green-800",
  modification: "bg-amber-100 text-amber-800",
  retirement: "bg-red-100 text-red-800",
};

const STATUS_COLOURS: Record<string, string> = {
  proposed: "bg-gray-100 text-gray-700",
  testing: "bg-blue-100 text-blue-800",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  deployed: "bg-green-600 text-white",
  rejected: "bg-red-100 text-red-800",
};

const PIPELINE_STAGES = ["proposed", "testing", "pending_approval", "approved", "deployed"] as const;

function getToken(): string { return typeof window !== "undefined" ? (localStorage.getItem("adminToken") ?? "") : ""; }
function authHeaders(json?: boolean): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${getToken()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function TmRulesPage() {
  const [records, setRecords] = useState<TmRuleChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionInputs, setActionInputs] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    ruleName: "",
    ruleType: "threshold",
    currentValue: "",
    proposedValue: "",
    rationale: "",
    proposedBy: "",
    expectedImpact: "",
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tm-rules", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        setRecords(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load TM rule changes");
      }
    } catch {
      setError("Network error loading TM rule changes");
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
      const body: Record<string, string> = {
        ruleName: form.ruleName,
        ruleType: form.ruleType,
        proposedValue: form.proposedValue,
        rationale: form.rationale,
        proposedBy: form.proposedBy,
        expectedImpact: form.expectedImpact,
      };
      if (form.currentValue.trim()) {
        body.currentValue = form.currentValue;
      }
      const res = await fetch("/api/tm-rules", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        setForm({
          ruleName: "",
          ruleType: "threshold",
          currentValue: "",
          proposedValue: "",
          rationale: "",
          proposedBy: "",
          expectedImpact: "",
        });
        void fetchRecords();
      } else {
        setError(data.error ?? "Failed to create rule change");
      }
    } catch {
      setError("Network error creating rule change");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchRecord(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/tm-rules/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.ok) {
        void fetchRecords();
      } else {
        setError(data.error ?? "Update failed");
      }
    } catch {
      setError("Network error updating rule change");
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const stageCounts = PIPELINE_STAGES.reduce<Record<string, number>>((acc, stage) => {
    acc[stage] = records.filter((r) => r.status === stage).length;
    return acc;
  }, {});

  const rejectedCount = records.filter((r) => r.status === "rejected").length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TM Rule Change Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            CBUAE Transaction Monitoring Framework · MLRO Approval Required
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "Propose Change"}
        </button>
      </div>

      {/* Lifecycle pipeline visual */}
      <div className="mb-4 bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Lifecycle Pipeline</div>
        <div className="flex items-center gap-0 overflow-x-auto">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage} className="flex items-center shrink-0">
              <div className={`px-3 py-2 rounded text-xs font-medium text-center min-w-[90px] ${STATUS_COLOURS[stage] ?? "bg-gray-100 text-gray-700"}`}>
                <div>{stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                <div className="text-lg font-bold mt-0.5">{stageCounts[stage] ?? 0}</div>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className="text-gray-400 mx-1.5 text-sm">→</span>
              )}
            </div>
          ))}
          {rejectedCount > 0 && (
            <>
              <span className="text-gray-300 mx-2">|</span>
              <div className="px-3 py-2 rounded text-xs font-medium text-center min-w-[80px] bg-red-100 text-red-800">
                <div>Rejected</div>
                <div className="text-lg font-bold mt-0.5">{rejectedCount}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Warning banner */}
      <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-3 text-sm">
        All TM rule changes require MLRO sign-off before deployment per CBUAE AML/CFT Guidelines §7
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Propose Change Form */}
      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Propose TM Rule Change</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
              <input
                type="text"
                value={form.ruleName}
                onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="e.g. High-Value Cash Threshold Rule"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type</label>
              <select
                value={form.ruleType}
                onChange={(e) => setForm({ ...form, ruleType: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="threshold">Threshold</option>
                <option value="new_rule">New Rule</option>
                <option value="modification">Modification</option>
                <option value="retirement">Retirement</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Value (optional)</label>
              <input
                type="text"
                value={form.currentValue}
                onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. AED 50,000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proposed Value</label>
              <input
                type="text"
                value={form.proposedValue}
                onChange={(e) => setForm({ ...form, proposedValue: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="e.g. AED 30,000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proposed By</label>
              <input
                type="text"
                value={form.proposedBy}
                onChange={(e) => setForm({ ...form, proposedBy: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="Staff member name"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Rationale</label>
            <textarea
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={3}
              required
              placeholder="Why is this change needed?"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Impact</label>
            <textarea
              value={form.expectedImpact}
              onChange={(e) => setForm({ ...form, expectedImpact: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={2}
              required
              placeholder="Expected effect on alert volume, false positive rate, etc."
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
              {submitting ? "Submitting..." : "Submit Proposal"}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading TM rule changes...</div>
      ) : records.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg">
          No TM rule changes yet. Propose one to get started.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Rule Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Proposed Change</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Proposed By</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Expected Impact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">MLRO Approved</th>
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
                    <td className="px-4 py-3 font-medium text-gray-800">{record.ruleName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RULE_TYPE_COLOURS[record.ruleType] ?? "bg-gray-100 text-gray-700"}`}>
                        {RULE_TYPE_LABELS[record.ruleType] ?? record.ruleType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={record.proposedValue}>
                      {record.currentValue ? (
                        <span><span className="line-through text-gray-400">{record.currentValue}</span> → {record.proposedValue}</span>
                      ) : (
                        record.proposedValue
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{record.proposedBy}</td>
                    <td className="px-4 py-3 text-gray-500">{record.proposedDate}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[record.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {record.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate" title={record.expectedImpact}>
                      {record.expectedImpact}
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
                  </tr>
                  {expandedId === record.id && (
                    <tr key={`${record.id}-expanded`}>
                      <td colSpan={8} className="px-4 py-4 bg-gray-50 border-b border-gray-200">
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">ID:</span>{" "}
                              <span className="font-mono text-gray-600">{record.id}</span>
                            </div>
                            {record.currentValue && (
                              <div>
                                <span className="font-medium text-gray-700">Current Value:</span>{" "}
                                <span className="text-gray-600">{record.currentValue}</span>
                              </div>
                            )}
                            <div>
                              <span className="font-medium text-gray-700">Proposed Value:</span>{" "}
                              <span className="text-gray-600">{record.proposedValue}</span>
                            </div>
                            {record.mlroApprovalDate && (
                              <div>
                                <span className="font-medium text-gray-700">MLRO Approval Date:</span>{" "}
                                <span className="text-gray-600">{record.mlroApprovalDate}</span>
                              </div>
                            )}
                            {record.deployedDate && (
                              <div>
                                <span className="font-medium text-gray-700">Deployed Date:</span>{" "}
                                <span className="text-gray-600">{record.deployedDate}</span>
                              </div>
                            )}
                            {record.deployedBy && (
                              <div>
                                <span className="font-medium text-gray-700">Deployed By:</span>{" "}
                                <span className="text-gray-600">{record.deployedBy}</span>
                              </div>
                            )}
                          </div>

                          <div className="text-sm">
                            <div className="font-medium text-gray-700 mb-1">Rationale</div>
                            <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.rationale}</div>
                          </div>

                          <div className="text-sm">
                            <div className="font-medium text-gray-700 mb-1">Expected Impact</div>
                            <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.expectedImpact}</div>
                          </div>

                          {record.testResults && (
                            <div className="text-sm">
                              <div className="font-medium text-gray-700 mb-1">Test Results {record.testDate && <span className="font-normal text-gray-400">({record.testDate})</span>}</div>
                              <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.testResults}</div>
                            </div>
                          )}

                          {record.mlroComments && (
                            <div className="text-sm">
                              <div className="font-medium text-gray-700 mb-1">MLRO Comments</div>
                              <div className="text-gray-600 bg-white border border-gray-200 rounded p-2">{record.mlroComments}</div>
                            </div>
                          )}

                          {record.rejectionReason && (
                            <div className="text-sm">
                              <div className="font-medium text-gray-700 mb-1">Rejection Reason</div>
                              <div className="text-red-700 bg-red-50 border border-red-200 rounded p-2">{record.rejectionReason}</div>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                            {record.status === "proposed" && (
                              <button
                                onClick={() => void patchRecord(record.id, { status: "testing" })}
                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Start Testing
                              </button>
                            )}

                            {record.status === "testing" && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <textarea
                                  placeholder="Enter test results..."
                                  value={actionInputs[`testResults_${record.id}`] ?? ""}
                                  onChange={(e) => setActionInputs({ ...actionInputs, [`testResults_${record.id}`]: e.target.value })}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs w-64 h-16 resize-none"
                                />
                                <button
                                  onClick={() => {
                                    const testResults = actionInputs[`testResults_${record.id}`] ?? "";
                                    void patchRecord(record.id, {
                                      testResults,
                                      testDate: today,
                                      status: "pending_approval",
                                    });
                                  }}
                                  className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600"
                                >
                                  Record Test Results
                                </button>
                              </div>
                            )}

                            {record.status === "pending_approval" && !record.mlroApproved && (
                              <>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="MLRO comments (optional)"
                                    value={actionInputs[`mlroComments_${record.id}`] ?? ""}
                                    onChange={(e) => setActionInputs({ ...actionInputs, [`mlroComments_${record.id}`]: e.target.value })}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs w-48"
                                  />
                                  <button
                                    onClick={() => {
                                      const mlroComments = actionInputs[`mlroComments_${record.id}`] ?? "";
                                      void patchRecord(record.id, {
                                        mlroApproved: true,
                                        mlroApprovalDate: today,
                                        status: "approved",
                                        ...(mlroComments ? { mlroComments } : {}),
                                      });
                                    }}
                                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                  >
                                    MLRO Approve
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Rejection reason..."
                                    value={actionInputs[`reject_${record.id}`] ?? ""}
                                    onChange={(e) => setActionInputs({ ...actionInputs, [`reject_${record.id}`]: e.target.value })}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs w-48"
                                  />
                                  <button
                                    onClick={() => {
                                      const rejectionReason = actionInputs[`reject_${record.id}`] ?? "";
                                      void patchRecord(record.id, {
                                        rejectionReason,
                                        status: "rejected",
                                      });
                                    }}
                                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </>
                            )}

                            {record.status === "approved" && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Deployed by (name)..."
                                  value={actionInputs[`deployedBy_${record.id}`] ?? ""}
                                  onChange={(e) => setActionInputs({ ...actionInputs, [`deployedBy_${record.id}`]: e.target.value })}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs w-48"
                                />
                                <button
                                  onClick={() => {
                                    const deployedBy = actionInputs[`deployedBy_${record.id}`] ?? "";
                                    void patchRecord(record.id, {
                                      deployedDate: today,
                                      deployedBy,
                                      status: "deployed",
                                    });
                                  }}
                                  className="px-3 py-1.5 text-xs bg-green-700 text-white rounded hover:bg-green-800"
                                >
                                  Mark Deployed
                                </button>
                              </div>
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
