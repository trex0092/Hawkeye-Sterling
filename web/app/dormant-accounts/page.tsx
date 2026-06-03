"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

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
  flagged: "bg-amber-950/20 text-amber-300",
  under_review: "bg-sky-950/20 text-sky-300",
  reactivated: "bg-emerald-950/20 text-emerald-300",
  closed: "bg-zinc-800/40 text-ink-2",
  escalated: "bg-red-950/20 text-red-300",
};

const RISK_COLOURS: Record<string, string> = {
  high: "bg-red-950/30 text-red-300 border border-red-500/40",
  medium: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  low: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
};

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
      const res = await fetch("/api/dormant-accounts", { headers: authHeaders() });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; records?: DormantAccount[]; error?: string };
      if (data.ok) setAccounts(data.records ?? []);
      else setError(data.error ?? "Failed to load dormant accounts");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error loading dormant accounts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAccounts(); }, [fetchAccounts]);

  async function handleFlag(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dormant-accounts", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          customerName: form.customerName,
          accountRef: form.accountRef,
          lastActivityDate: form.lastActivityDate,
          riskRating: form.riskRating,
          ...(form.notes ? { notes: form.notes } : {}),
        }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({ customerName: "", accountRef: "", lastActivityDate: "", riskRating: "medium", notes: "" });
        void fetchAccounts();
      } else {
        setError(data.error ?? "Failed to flag account");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error flagging account"));
    } finally {
      setSubmitting(false);
    }
  }

  function openExpand(acc: DormantAccount) {
    if (expandedId === acc.id) { setExpandedId(null); return; }
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
        headers: authHeaders(true),
        body: JSON.stringify({
          status: upd.status,
          reactivationReason: upd.reactivationReason || undefined,
          reactivationReKycCompleted: upd.reactivationReKycCompleted,
          mlroNotified: upd.mlroNotified,
          notes: upd.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) { setExpandedId(null); void fetchAccounts(); }
      else setError(data.error ?? "Failed to update account");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error updating account"));
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
        headers: authHeaders(true),
        body: JSON.stringify({ mlroNotified: true, mlroNotifiedDate: today }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) void fetchAccounts();
      else setError(data.error ?? "Failed to notify MLRO");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error notifying MLRO"));
    } finally {
      setNotifyingId(null);
    }
  }

  const totalFlagged = accounts.filter((a) => a.status === "flagged").length;
  const underReview = accounts.filter((a) => a.status === "under_review").length;
  const reactivated = accounts.filter((a) => a.status === "reactivated").length;
  const highRisk = accounts.filter((a) => a.riskRating === "high" && a.status !== "closed" && a.status !== "reactivated").length;

  return (
    <ModuleLayout>
      <ModuleFamilyBar
        suiteName="Compliance Records"
        modules={[
          { label: "Audit Findings", href: "/audit-findings", icon: "📋" },
          { label: "Business Risk (BRA)", href: "/bra", icon: "📊" },
          { label: "Dormant Accounts", href: "/dormant-accounts", icon: "💤" },
          { label: "Outsourcing Register", href: "/outsourcing-register", icon: "🏢" },
        ]}
      />
      <ModuleHero
        eyebrow=""
        title="Dormant Account"
        titleEm="register."
        intro="12-month inactivity threshold · re-KYC on reactivation · MLRO notification · CBUAE §8.4"
      />

      <div className="mx-auto max-w-5xl px-4 pb-16 space-y-6">

        {/* Stats + action bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-amber-400">{totalFlagged}</div>
              <div className="text-10 text-ink-2 mt-0.5">Flagged</div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-sky-400">{underReview}</div>
              <div className="text-10 text-ink-2 mt-0.5">Under Review</div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-emerald-400">{reactivated}</div>
              <div className="text-10 text-ink-2 mt-0.5">Reactivated</div>
            </div>
            <div className={`border rounded-lg px-4 py-3 text-center min-w-[80px] ${highRisk > 0 ? "bg-red-950/20 border-red-500/30" : "bg-bg-panel border-hair-2"}`}>
              <div className={`text-2xl font-bold ${highRisk > 0 ? "text-red" : "text-ink-1"}`}>{highRisk}</div>
              <div className="text-10 text-ink-2 mt-0.5">High-Risk</div>
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            {showForm ? "Cancel" : "Flag Account"}
          </button>
        </div>

        {/* Regulatory notice */}
        <div className="bg-amber-950/20 border border-amber-500/30 text-amber-300 rounded-md px-4 py-3 text-sm flex items-start gap-2">
          <span className="font-bold shrink-0">Regulatory Notice:</span>
          <span>Dormant accounts reactivated without re-KYC constitute a CDD breach under CBUAE §8.4. All reactivations must include completed re-KYC before account activity is permitted.</span>
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {/* Flag form */}
        {showForm && (
          <form onSubmit={(e) => void handleFlag(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">Flag Dormant Account</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Customer Name *</label>
                <input type="text" value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  required placeholder="e.g. Mohammed Al-Rashidi" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Account Reference *</label>
                <input type="text" value={form.accountRef}
                  onChange={(e) => setForm({ ...form, accountRef: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  required placeholder="e.g. ACC-2021-00412" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Last Activity Date *</label>
                <input type="date" value={form.lastActivityDate}
                  onChange={(e) => setForm({ ...form, lastActivityDate: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Risk Rating *</label>
                <select value={form.riskRating}
                  onChange={(e) => setForm({ ...form, riskRating: e.target.value as "high" | "medium" | "low" })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                rows={2} placeholder="Optional notes about this dormant account..." />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">Cancel</button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50">
                {submitting ? "Flagging..." : "Flag Account"}
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading dormant accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg">
            No dormant accounts flagged yet.
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-base border-b border-hair-2">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Account Ref</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Last Activity</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Dormancy Since</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Risk</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">MLRO</th>
                  <th className="text-left px-4 py-3 font-medium text-ink-2">Re-KYC</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-2">
                {accounts.map((acc) => (
                  <>
                    <tr key={acc.id} className="hover:bg-bg-base cursor-pointer" onClick={() => openExpand(acc)}>
                      <td className="px-4 py-3 font-medium text-ink-0">{acc.customerName}</td>
                      <td className="px-4 py-3 font-mono text-ink-2 text-xs">{acc.accountRef}</td>
                      <td className="px-4 py-3 text-ink-1">{formatDate(acc.lastActivityDate)}</td>
                      <td className="px-4 py-3 text-ink-1">{formatDate(acc.dormancyStartDate)}</td>
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
                        {acc.mlroNotified ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-red/60 font-bold">✗</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {acc.reactivationReKycCompleted ? (
                          <span className="text-emerald-400 font-bold">✓</span>
                        ) : acc.status === "reactivated" ? (
                          <span className="text-red font-bold text-xs">Missing</span>
                        ) : (
                          <span className="text-ink-2">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-2 text-xs">{expandedId === acc.id ? "▲" : "▼"}</td>
                    </tr>

                    {expandedId === acc.id && updateForms[acc.id] && (
                      <tr key={`${acc.id}-expand`}>
                        <td colSpan={9} className="px-4 py-4 bg-bg-base border-t border-hair-2">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-xs text-ink-2">
                              <div><span className="font-medium text-ink-1">ID:</span> {acc.id}</div>
                              <div><span className="font-medium text-ink-1">Flagged Date:</span> {formatDate(acc.flaggedDate)}</div>
                              <div><span className="font-medium text-ink-1">Reactivation Date:</span> {formatDate(acc.reactivationDate)}</div>
                              <div><span className="font-medium text-ink-1">MLRO Notified Date:</span> {formatDate(acc.mlroNotifiedDate)}</div>
                              {acc.reactivationReason && <div className="col-span-2"><span className="font-medium text-ink-1">Reactivation Reason:</span> {acc.reactivationReason}</div>}
                              {acc.notes && <div className="col-span-2"><span className="font-medium text-ink-1">Notes:</span> {acc.notes}</div>}
                            </div>

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

                            <div className="border-t border-hair-2 pt-3">
                              <p className="text-xs font-semibold text-ink-1 mb-2">Update Record</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-ink-2 mb-1">Status</label>
                                  <select
                                    value={updateForms[acc.id]!.status}
                                    onChange={(e) => setUpdateForms((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id]!, status: e.target.value as DormantAccount["status"] } }))}
                                    className="w-full bg-bg-panel border border-hair-2 rounded px-2 py-1 text-xs text-ink-0"
                                  >
                                    <option value="flagged">Flagged</option>
                                    <option value="under_review">Under Review</option>
                                    <option value="reactivated">Reactivated</option>
                                    <option value="closed">Closed</option>
                                    <option value="escalated">Escalated</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-ink-2 mb-1">Reactivation Reason</label>
                                  <input type="text" value={updateForms[acc.id]!.reactivationReason}
                                    onChange={(e) => setUpdateForms((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id]!, reactivationReason: e.target.value } }))}
                                    className="w-full bg-bg-panel border border-hair-2 rounded px-2 py-1 text-xs text-ink-0 placeholder:text-ink-2"
                                    placeholder="Reason for reactivation..." />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-xs font-medium text-ink-2 mb-1">Notes</label>
                                  <input type="text" value={updateForms[acc.id]!.notes}
                                    onChange={(e) => setUpdateForms((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id]!, notes: e.target.value } }))}
                                    className="w-full bg-bg-panel border border-hair-2 rounded px-2 py-1 text-xs text-ink-0 placeholder:text-ink-2"
                                    placeholder="Notes..." />
                                </div>
                              </div>
                              <div className="mt-2 flex gap-4">
                                <label className="flex items-center gap-1.5 text-xs text-ink-1">
                                  <input type="checkbox" checked={updateForms[acc.id]!.reactivationReKycCompleted}
                                    onChange={(e) => setUpdateForms((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id]!, reactivationReKycCompleted: e.target.checked } }))} />
                                  Re-KYC Completed
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-ink-1">
                                  <input type="checkbox" checked={updateForms[acc.id]!.mlroNotified}
                                    onChange={(e) => setUpdateForms((prev) => ({ ...prev, [acc.id]: { ...prev[acc.id]!, mlroNotified: e.target.checked } }))} />
                                  MLRO Notified
                                </label>
                              </div>
                              <div className="mt-3 flex justify-end">
                                <button onClick={() => void handleUpdate(acc.id)} disabled={updatingId === acc.id}
                                  className="px-3 py-1.5 text-xs bg-brand text-white rounded hover:opacity-90 disabled:opacity-50">
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
    </ModuleLayout>
  );
}
