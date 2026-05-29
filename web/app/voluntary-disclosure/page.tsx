"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage } from "@/lib/client/error-utils";

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
  sanctions_breach: "bg-red-950/30 text-red-300 border border-red-500/40",
  str_filing_delay: "bg-orange-950/30 text-orange-300 border border-orange-500/40",
  cdd_failure: "bg-purple-950/30 text-purple-300 border border-purple-500/40",
  record_keeping: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  other: "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40",
};

const REGULATORY_BODY_COLOURS: Record<string, string> = {
  UAE_FIU: "bg-indigo-950/30 text-indigo-300 border border-indigo-500/40",
  MOE: "bg-teal-950/30 text-teal-300 border border-teal-500/40",
  CBUAE: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  EOCN: "bg-violet-950/30 text-violet-300 border border-violet-500/40",
  OTHER: "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40",
};

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40",
  pending_mlro: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  pending_legal: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  submitted: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  acknowledged: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
  closed: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
};

const STATUS_FLOW = ["draft", "pending_mlro", "pending_legal", "submitted", "acknowledged", "closed"];

const GOV_MODULES = [
  { label: "COI Register", href: "/coi-register", icon: "⚖️" },
  { label: "Voluntary Disclosure", href: "/voluntary-disclosure", icon: "📣" },
];

function getToken(): string { return typeof window !== "undefined" ? (localStorage.getItem("adminToken") ?? "") : ""; }
function authHeaders(json?: boolean): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${getToken()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const inputCls = "w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2";

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
      const res = await fetch("/api/voluntary-disclosure", { headers: authHeaders() });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Voluntary disclosure"));
      const data = await res.json() as { ok: boolean; records?: VoluntaryDisclosure[]; error?: string };
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
        headers: authHeaders(true),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Voluntary disclosure"));
      const data = await res.json() as { ok: boolean; record?: VoluntaryDisclosure; error?: string };
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
        headers: authHeaders(true),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Voluntary disclosure"));
      const data = await res.json() as { ok: boolean; record?: VoluntaryDisclosure; error?: string };
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
    <ModuleLayout>
      <ModuleFamilyBar suiteName="Governance & Ethics" modules={GOV_MODULES} />
      <ModuleHero
        eyebrow="📣 Regulatory — FDL 10/2025 Art.25 · CBUAE Enforcement Policy"
        title="Voluntary Disclosure"
        titleEm="register."
        intro="Self-report regulatory breaches before detection to qualify for enforcement mitigation under CBUAE policy."
      />

      <div className="px-6 pb-10 space-y-6">
        {/* Action bar */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            {showForm ? "Cancel" : "New Disclosure"}
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 rounded-md px-4 py-3 text-sm">
          Voluntary self-reporting to the regulator before detection may qualify for enforcement mitigation under CBUAE enforcement policy
        </div>

        {/* Status flow visual */}
        <div className="flex items-center gap-0 overflow-x-auto bg-bg-panel border border-hair-2 rounded-lg p-3">
          {STATUS_FLOW.map((step, i) => (
            <div key={step} className="flex items-center shrink-0">
              <div className={`px-3 py-1.5 rounded text-xs font-medium ${STATUS_COLOURS[step] ?? "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40"}`}>
                {step.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <span className="text-ink-2 mx-1 text-xs">→</span>
              )}
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Total", value: total, colour: "text-ink-0" },
            { label: "Draft", value: draftCount, colour: "text-ink-1" },
            { label: "Pending Approval", value: pendingCount, colour: "text-amber-300" },
            { label: "Submitted", value: submittedCount, colour: "text-sky-300" },
            { label: "Acknowledged", value: acknowledgedCount, colour: "text-emerald-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-bg-panel border border-hair-2 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${stat.colour}`}>{stat.value}</div>
              <div className="text-xs text-ink-2 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-500/40 text-red-300 rounded-md px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* New Disclosure Form */}
        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ink-0 mb-4">New Voluntary Disclosure</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Disclosure Type</label>
                <select
                  value={form.disclosureType}
                  onChange={(e) => setForm({ ...form, disclosureType: e.target.value })}
                  className={inputCls}
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
                <label className="block text-sm font-medium text-ink-1 mb-1">Regulatory Body</label>
                <select
                  value={form.regulatoryBody}
                  onChange={(e) => setForm({ ...form, regulatoryBody: e.target.value })}
                  className={inputCls}
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
                <label className="block text-sm font-medium text-ink-1 mb-1">Detected Date</label>
                <input
                  type="date"
                  value={form.detectedDate}
                  onChange={(e) => setForm({ ...form, detectedDate: e.target.value })}
                  className={inputCls}
                  required
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputCls}
                rows={3}
                required
                placeholder="Describe the breach or issue requiring disclosure..."
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Root Cause</label>
              <textarea
                value={form.rootCause}
                onChange={(e) => setForm({ ...form, rootCause: e.target.value })}
                className={inputCls}
                rows={3}
                required
                placeholder="What caused this issue?"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Remediation Taken</label>
              <textarea
                value={form.remediationTaken}
                onChange={(e) => setForm({ ...form, remediationTaken: e.target.value })}
                className={inputCls}
                rows={3}
                required
                placeholder="What steps have been taken or are planned to remediate?"
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
                {submitting ? "Creating..." : "Create Disclosure"}
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading disclosures...</div>
        ) : records.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg">
            No voluntary disclosures yet. Create one to get started.
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-base border-b border-hair-2">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Regulatory Body</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Detected Date</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Disclosure Date</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">MLRO Approved</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-1">Regulator Ref</th>
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
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DISCLOSURE_TYPE_COLOURS[record.disclosureType] ?? "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40"}`}>
                          {DISCLOSURE_TYPE_LABELS[record.disclosureType] ?? record.disclosureType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REGULATORY_BODY_COLOURS[record.regulatoryBody] ?? "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40"}`}>
                          {record.regulatoryBody}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-1">{record.detectedDate}</td>
                      <td className="px-4 py-3 text-ink-2">{record.disclosureDate ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[record.status] ?? "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40"}`}>
                          {record.status.replace(/_/g, " ")}
                        </span>
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
                      <td className="px-4 py-3 text-ink-2 font-mono text-xs">{record.regulatorRef ?? "—"}</td>
                    </tr>
                    {expandedId === record.id && (
                      <tr key={`${record.id}-expanded`}>
                        <td colSpan={7} className="px-4 py-4 bg-bg-base border-b border-hair-2">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-ink-1">ID:</span>{" "}
                                <span className="font-mono text-ink-2">{record.id}</span>
                              </div>
                              {record.submittedBy && (
                                <div>
                                  <span className="font-medium text-ink-1">Submitted By:</span>{" "}
                                  <span className="text-ink-1">{record.submittedBy}</span>
                                </div>
                              )}
                              {record.selfReportingDiscount && (
                                <div className="col-span-2">
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/30 text-emerald-300 border border-emerald-500/40">
                                    Self-Reporting Discount Applicable
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-sm">
                              <div className="font-medium text-ink-1 mb-1">Description</div>
                              <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.description}</div>
                            </div>
                            <div className="text-sm">
                              <div className="font-medium text-ink-1 mb-1">Root Cause</div>
                              <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.rootCause}</div>
                            </div>
                            <div className="text-sm">
                              <div className="font-medium text-ink-1 mb-1">Remediation Taken</div>
                              <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.remediationTaken}</div>
                            </div>
                            {record.regulatorFeedback && (
                              <div className="text-sm">
                                <div className="font-medium text-ink-1 mb-1">Regulator Feedback</div>
                                <div className="text-ink-1 bg-bg-panel border border-hair-2 rounded p-2">{record.regulatorFeedback}</div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-hair-2">
                              {record.status === "draft" && (
                                <button
                                  onClick={() => void patchRecord(record.id, { status: "pending_mlro" })}
                                  className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-500"
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
                                  className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
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
                                  className="px-3 py-1.5 text-xs bg-brand text-white rounded hover:opacity-90"
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
                                    className="bg-bg-panel border border-hair-2 rounded px-2 py-1 text-xs text-ink-0 placeholder:text-ink-2 w-64"
                                  />
                                  <button
                                    onClick={() => {
                                      const feedback = actionInputs[`feedback_${record.id}`] ?? "";
                                      void patchRecord(record.id, {
                                        regulatorFeedback: feedback,
                                        status: "acknowledged",
                                      });
                                    }}
                                    className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
                                  >
                                    Record Regulator Response
                                  </button>
                                </div>
                              )}
                              {record.status === "acknowledged" && (
                                <button
                                  onClick={() => void patchRecord(record.id, { status: "closed" })}
                                  className="px-3 py-1.5 text-xs bg-zinc-700 text-white rounded hover:bg-zinc-600"
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
    </ModuleLayout>
  );
}
