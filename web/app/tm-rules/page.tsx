"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage } from "@/lib/client/error-utils";

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
  threshold: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  new_rule: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
  modification: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  retirement: "bg-red-950/30 text-red-300 border border-red-500/40",
};

const STATUS_COLOURS: Record<string, string> = {
  proposed: "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40",
  testing: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  pending_approval: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  approved: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
  deployed: "bg-emerald-700/60 text-emerald-100 border border-emerald-500/60",
  rejected: "bg-red-950/30 text-red-300 border border-red-500/40",
};

const _TM_MODULES = [
  { label: "TM Rule Changes", href: "/tm-rules", icon: "📐" },
];

function getToken(): string { return typeof window !== "undefined" ? (localStorage.getItem("adminToken") ?? "") : ""; }
function authHeaders(json?: boolean): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${getToken()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const inputCls = "w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2";
const actionInputCls = "bg-bg-panel border border-hair-2 rounded px-2 py-1 text-xs text-ink-0 placeholder:text-ink-2";

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
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "TM rules"));
      const data = await res.json() as { ok: boolean; records?: TmRuleChange[]; error?: string };
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
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "TM rules"));
      const data = await res.json() as { ok: boolean; record?: TmRuleChange; error?: string };
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
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "TM rules"));
      const data = await res.json() as { ok: boolean; record?: TmRuleChange; error?: string };
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

  return (
    <ModuleLayout asanaModule="tm-rules" asanaLabel="TM Rule Management" onAdd={() => setShowForm(true)} onSync={() => void fetchRecords()}>
      <ModuleHero
        eyebrow=""
        title="TM Rule Change"
        titleEm="management."
        intro="Propose, test, and obtain MLRO sign-off on transaction monitoring rule changes before deployment."
      />

      <div className="px-6 pb-10 space-y-6">
        {error && (
          <div className="bg-red-950/30 border border-red-500/40 text-red-300 rounded-md px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Propose Change Form */}
        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ink-0 mb-4">Propose TM Rule Change</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={form.ruleName}
                  onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                  className={inputCls}
                  required
                  placeholder="e.g. High-Value Cash Threshold Rule"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Rule Type</label>
                <select
                  value={form.ruleType}
                  onChange={(e) => setForm({ ...form, ruleType: e.target.value })}
                  className={inputCls}
                  required
                >
                  <option value="threshold">Threshold</option>
                  <option value="new_rule">New Rule</option>
                  <option value="modification">Modification</option>
                  <option value="retirement">Retirement</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Current Value (optional)</label>
                <input
                  type="text"
                  value={form.currentValue}
                  onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. AED 50,000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Proposed Value</label>
                <input
                  type="text"
                  value={form.proposedValue}
                  onChange={(e) => setForm({ ...form, proposedValue: e.target.value })}
                  className={inputCls}
                  required
                  placeholder="e.g. AED 30,000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Proposed By</label>
                <input
                  type="text"
                  value={form.proposedBy}
                  onChange={(e) => setForm({ ...form, proposedBy: e.target.value })}
                  className={inputCls}
                  required
                  placeholder="Staff member name"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Rationale</label>
              <textarea
                value={form.rationale}
                onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                className={inputCls}
                rows={3}
                required
                placeholder="Why is this change needed?"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Expected Impact</label>
              <textarea
                value={form.expectedImpact}
                onChange={(e) => setForm({ ...form, expectedImpact: e.target.value })}
                className={inputCls}
                rows={2}
                required
                placeholder="Expected effect on alert volume, false positive rate, etc."
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Proposal"}
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading TM rule changes...</div>
        ) : records.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg">
            No TM rule changes yet. Propose one to get started.
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-base border-b border-hair-2">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Rule Name</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Proposed Change</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Proposed By</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Expected Impact</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">MLRO Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {records.map((record) => (
                  <>
                    <tr
                      key={record.id}
                      className="hover:bg-bg-base cursor-pointer"
                      onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    >
                      <td className="px-4 py-3 font-medium text-ink-0">{record.ruleName}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RULE_TYPE_COLOURS[record.ruleType] ?? "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40"}`}>
                          {RULE_TYPE_LABELS[record.ruleType] ?? record.ruleType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-1 max-w-[180px] truncate" title={record.proposedValue}>
                        {record.currentValue ? (
                          <span><span className="line-through text-ink-2">{record.currentValue}</span> → {record.proposedValue}</span>
                        ) : (
                          record.proposedValue
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-1">{record.proposedBy}</td>
                      <td className="px-4 py-3 text-ink-2">{record.proposedDate}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[record.status] ?? "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40"}`}>
                          {record.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-2 text-xs max-w-[160px] truncate" title={record.expectedImpact}>
                        {record.expectedImpact}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {record.mlroApproved === true ? (
                          <span className="text-emerald-400 font-bold">✓</span>
                        ) : record.mlroApproved === false ? (
                          <span className="text-red">✗</span>
                        ) : (
                          <span className="text-ink-2">—</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === record.id && (
                      <tr key={`${record.id}-expanded`}>
                        <td colSpan={8} className="px-4 py-4 bg-bg-base border-b border-hair-2">
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-ink-1">ID:</span>{" "}
                                <span className="font-mono text-ink-2">{record.id}</span>
                              </div>
                              {record.currentValue && (
                                <div>
                                  <span className="font-medium text-ink-1">Current Value:</span>{" "}
                                  <span className="text-ink-1">{record.currentValue}</span>
                                </div>
                              )}
                              <div>
                                <span className="font-medium text-ink-1">Proposed Value:</span>{" "}
                                <span className="text-ink-1">{record.proposedValue}</span>
                              </div>
                              {record.mlroApprovalDate && (
                                <div>
                                  <span className="font-medium text-ink-1">MLRO Approval Date:</span>{" "}
                                  <span className="text-ink-1">{record.mlroApprovalDate}</span>
                                </div>
                              )}
                              {record.deployedDate && (
                                <div>
                                  <span className="font-medium text-ink-1">Deployed Date:</span>{" "}
                                  <span className="text-ink-1">{record.deployedDate}</span>
                                </div>
                              )}
                              {record.deployedBy && (
                                <div>
                                  <span className="font-medium text-ink-1">Deployed By:</span>{" "}
                                  <span className="text-ink-1">{record.deployedBy}</span>
                                </div>
                              )}
                            </div>

                            <div className="text-sm">
                              <div className="font-medium text-ink-1 mb-1">Rationale</div>
                              <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.rationale}</div>
                            </div>

                            <div className="text-sm">
                              <div className="font-medium text-ink-1 mb-1">Expected Impact</div>
                              <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.expectedImpact}</div>
                            </div>

                            {record.testResults && (
                              <div className="text-sm">
                                <div className="font-medium text-ink-1 mb-1">Test Results {record.testDate && <span className="font-normal text-ink-2">({record.testDate})</span>}</div>
                                <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.testResults}</div>
                              </div>
                            )}

                            {record.mlroComments && (
                              <div className="text-sm">
                                <div className="font-medium text-ink-1 mb-1">MLRO Comments</div>
                                <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.mlroComments}</div>
                              </div>
                            )}

                            {record.rejectionReason && (
                              <div className="text-sm">
                                <div className="font-medium text-ink-1 mb-1">Rejection Reason</div>
                                <div className="text-red-300 bg-red-950/30 border border-red-500/40 rounded p-2">{record.rejectionReason}</div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-hair-2">
                              {record.status === "proposed" && (
                                <button
                                  onClick={() => void patchRecord(record.id, { status: "testing" })}
                                  className="px-3 py-1.5 text-xs bg-brand text-white rounded hover:opacity-90"
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
                                    className={`${actionInputCls} w-64 h-16 resize-none`}
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
                                    className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-500"
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
                                      className={`${actionInputCls} w-48`}
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
                                      className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
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
                                      className={`${actionInputCls} w-48`}
                                    />
                                    <button
                                      onClick={() => {
                                        const rejectionReason = actionInputs[`reject_${record.id}`] ?? "";
                                        void patchRecord(record.id, {
                                          rejectionReason,
                                          status: "rejected",
                                        });
                                      }}
                                      className="px-3 py-1.5 text-xs bg-red-700 text-white rounded hover:bg-red-600"
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
                                    className={`${actionInputCls} w-48`}
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
                                    className="px-3 py-1.5 text-xs bg-emerald-800 text-white rounded hover:bg-emerald-700"
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
    </ModuleLayout>
  );
}
