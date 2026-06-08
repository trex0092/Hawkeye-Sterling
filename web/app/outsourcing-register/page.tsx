"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

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
  active: "bg-emerald-950/20 text-emerald-300",
  under_review: "bg-amber-950/20 text-amber-300",
  terminated: "bg-zinc-800/40 text-ink-2",
  pending_approval: "bg-sky-950/20 text-sky-300",
};

const RISK_COLOURS: Record<string, string> = {
  high: "bg-red-950/30 text-red-300 border border-red-500/40",
  medium: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  low: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
};

const SERVICE_TYPE_OPTIONS = [
  "KYC Screening", "Transaction Monitoring", "CDD Data", "Sanctions Screening",
  "AML Software", "Fraud Detection", "Identity Verification", "Document Verification",
  "Risk Scoring", "Reporting & Analytics", "Other",
];

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function getToken(): string { return typeof window !== "undefined" ? (localStorage.getItem("adminToken") ?? "") : ""; }
function authHeaders(json?: boolean): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${getToken()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
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
    vendorName: "", vendorCountry: "", serviceType: "KYC Screening",
    amlCftRelevant: true, contractStartDate: "", contractEndDate: "",
    riskRating: "medium", boardApproved: false, notes: "",
  });

  const fetchArrangements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outsourcing-register", { headers: authHeaders() });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Outsourcing register"));
      const data = await res.json() as { ok: boolean; records?: OutsourcingArrangement[]; error?: string };
      if (data.ok) setArrangements(data.records ?? []);
      else setError(data.error ?? "Failed to load outsourcing arrangements");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error loading outsourcing arrangements"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchArrangements(); }, [fetchArrangements]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/outsourcing-register", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          vendorName: form.vendorName, vendorCountry: form.vendorCountry,
          serviceType: form.serviceType, amlCftRelevant: form.amlCftRelevant,
          contractStartDate: form.contractStartDate,
          ...(form.contractEndDate ? { contractEndDate: form.contractEndDate } : {}),
          riskRating: form.riskRating, boardApproved: form.boardApproved,
          ...(form.notes ? { notes: form.notes } : {}),
        }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Outsourcing register"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({ vendorName: "", vendorCountry: "", serviceType: "KYC Screening", amlCftRelevant: true, contractStartDate: "", contractEndDate: "", riskRating: "medium", boardApproved: false, notes: "" });
        void fetchArrangements();
      } else {
        setError(data.error ?? "Failed to create arrangement");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error creating arrangement"));
    } finally {
      setSubmitting(false);
    }
  }

  function openExpand(arr: OutsourcingArrangement) {
    if (expandedId === arr.id) { setExpandedId(null); return; }
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
        headers: authHeaders(true),
        body: JSON.stringify({
          ...(upd.lastAssessmentDate ? { lastAssessmentDate: upd.lastAssessmentDate } : {}),
          boardApproved: upd.boardApproved, agreementCurrent: upd.agreementCurrent,
          mlroSignOff: upd.mlroSignOff, notes: upd.notes,
        }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Outsourcing register"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) { setExpandedId(null); void fetchArrangements(); }
      else setError(data.error ?? "Failed to update arrangement");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error updating arrangement"));
    } finally {
      setUpdatingId(null);
    }
  }

  const amlCftArrangements = arrangements.filter((a) => a.amlCftRelevant);
  const hasWarning = amlCftArrangements.some((a) => a.status === "under_review" || !a.boardApproved);

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow=""
        title="Outsourcing"
        titleEm="register."
        intro="Third-party AML/CFT arrangements · Board approval · annual MLRO review · agreement currency"
      />

      <div className="w-full px-4 pb-16 space-y-6">

        {/* Action bar */}
        <div className="flex items-center justify-end gap-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            {showForm ? "Cancel" : "New Arrangement"}
          </button>
        </div>

        {hasWarning && (
          <div className="bg-amber-950/20 border border-amber-500/30 text-amber-300 rounded-md px-4 py-3 text-sm flex items-start gap-2">
            <span className="font-bold shrink-0">Warning:</span>
            <span>One or more AML/CFT-relevant arrangements are due for review or missing Board approval. Review required under FDL 10/2025 Art.18.</span>
          </div>
        )}

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {/* New form */}
        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">New Outsourcing Arrangement</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Vendor Name *</label>
                <input type="text" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  required placeholder="e.g. Refinitiv World-Check" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Vendor Country *</label>
                <input type="text" value={form.vendorCountry} onChange={(e) => setForm({ ...form, vendorCountry: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  required placeholder="e.g. United Kingdom" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Service Type *</label>
                <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required>
                  {SERVICE_TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Risk Rating *</label>
                <select value={form.riskRating} onChange={(e) => setForm({ ...form, riskRating: e.target.value as "high" | "medium" | "low" })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Contract Start Date *</label>
                <input type="date" value={form.contractStartDate} onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Contract End Date</label>
                <input type="date" value={form.contractEndDate} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" />
              </div>
            </div>
            <div className="mt-4 flex gap-6">
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={form.amlCftRelevant} onChange={(e) => setForm({ ...form, amlCftRelevant: e.target.checked })} className="rounded" />
                AML/CFT Relevant
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={form.boardApproved} onChange={(e) => setForm({ ...form, boardApproved: e.target.checked })} className="rounded" />
                Board Approved
              </label>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                rows={2} placeholder="Optional notes..." />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">Cancel</button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50">
                {submitting ? "Creating..." : "Create Arrangement"}
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading arrangements...</div>
        ) : arrangements.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg">
            No outsourcing arrangements registered yet.
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-base border-b border-hair-2">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Country</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Service</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">AML/CFT</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Risk</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Contract End</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Next Review</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Board</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {arrangements.map((arr) => (
                  <>
                    <tr key={arr.id} className="hover:bg-bg-base cursor-pointer" onClick={() => openExpand(arr)}>
                      <td className="px-4 py-3 font-medium text-ink-0">{arr.vendorName}</td>
                      <td className="px-4 py-3 text-ink-1">{arr.vendorCountry}</td>
                      <td className="px-4 py-3 text-ink-1">{arr.serviceType}</td>
                      <td className="px-4 py-3">
                        {arr.amlCftRelevant ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-950/20 text-sky-300">Yes</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800/40 text-ink-2">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RISK_COLOURS[arr.riskRating]}`}>
                          {arr.riskRating}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-1">{formatDate(arr.contractEndDate)}</td>
                      <td className="px-4 py-3 text-ink-1">{formatDate(arr.nextAssessmentDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLOURS[arr.status]}`}>
                          {arr.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {arr.boardApproved ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-red/60 font-bold">✗</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-2 text-xs">{expandedId === arr.id ? "▲" : "▼"}</td>
                    </tr>

                    {expandedId === arr.id && updateForms[arr.id] && (
                      <tr key={`${arr.id}-expand`}>
                        <td colSpan={10} className="px-4 py-4 bg-bg-base border-t border-hair-2">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-xs text-ink-2">
                              <div><span className="font-medium text-ink-1">ID:</span> {arr.id}</div>
                              <div><span className="font-medium text-ink-1">Contract Start:</span> {formatDate(arr.contractStartDate)}</div>
                              <div><span className="font-medium text-ink-1">Last Assessment:</span> {formatDate(arr.lastAssessmentDate)}</div>
                              <div><span className="font-medium text-ink-1">Agreement Current:</span> {arr.agreementCurrent ? "Yes" : "No"}</div>
                              <div><span className="font-medium text-ink-1">MLRO Sign-Off:</span> {arr.mlroSignOff ? "Yes" : "No"}</div>
                              <div><span className="font-medium text-ink-1">Updated:</span> {formatDate(arr.updatedAt)}</div>
                            </div>
                            <div className="border-t border-hair-2 pt-3">
                              <p className="text-xs font-semibold text-ink-1 mb-2">Update Arrangement</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-ink-2 mb-1">Last Assessment Date</label>
                                  <input type="date" value={updateForms[arr.id]!.lastAssessmentDate}
                                    onChange={(e) => setUpdateForms((prev) => ({ ...prev, [arr.id]: { ...prev[arr.id]!, lastAssessmentDate: e.target.value } }))}
                                    className="w-full bg-bg-panel border border-hair-2 rounded px-2 py-1 text-xs text-ink-0" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-ink-2 mb-1">Notes</label>
                                  <input type="text" value={updateForms[arr.id]!.notes}
                                    onChange={(e) => setUpdateForms((prev) => ({ ...prev, [arr.id]: { ...prev[arr.id]!, notes: e.target.value } }))}
                                    className="w-full bg-bg-panel border border-hair-2 rounded px-2 py-1 text-xs text-ink-0 placeholder:text-ink-2"
                                    placeholder="Notes..." />
                                </div>
                              </div>
                              <div className="mt-2 flex gap-4">
                                {[
                                  { key: "boardApproved", label: "Board Approved" },
                                  { key: "agreementCurrent", label: "Agreement Current" },
                                  { key: "mlroSignOff", label: "MLRO Sign-Off" },
                                ].map(({ key, label }) => (
                                  <label key={key} className="flex items-center gap-1.5 text-xs text-ink-1">
                                    <input type="checkbox" checked={updateForms[arr.id]![key as keyof UpdateForm] as boolean}
                                      onChange={(e) => setUpdateForms((prev) => ({ ...prev, [arr.id]: { ...prev[arr.id]!, [key]: e.target.checked } }))} />
                                    {label}
                                  </label>
                                ))}
                              </div>
                              <div className="mt-3 flex justify-end">
                                <button onClick={() => void handleUpdate(arr.id)} disabled={updatingId === arr.id}
                                  className="px-3 py-1.5 text-xs bg-brand text-white rounded hover:opacity-90 disabled:opacity-50">
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

        <div className="bg-sky-950/20 border border-sky-500/30 rounded-md px-4 py-3 text-xs text-sky-300">
          <span className="font-semibold">Regulatory Note:</span>{" "}
          AML/CFT outsourcing arrangements require annual MLRO review and Board approval per FDL 10/2025 Art.18.
        </div>
      </div>
    </ModuleLayout>
  );
}
