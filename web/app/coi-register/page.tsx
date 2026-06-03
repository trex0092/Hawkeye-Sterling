"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

interface CoiDeclaration {
  id: string;
  staffName: string;
  staffRole: string;
  declarationDate: string;
  conflictType: "financial" | "personal" | "business" | "other";
  description: string;
  potentialImpact: string;
  mitigationProposed: string;
  status: "pending_review" | "approved" | "rejected" | "managed";
  mlroReviewDate?: string;
  mlroDecision?: string;
  mlroSignOff?: boolean;
  nextReviewDate?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLOURS: Record<CoiDeclaration["status"], string> = {
  pending_review: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  approved: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
  rejected: "bg-red-950/30 text-red-300 border border-red-500/40",
  managed: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
};

const CONFLICT_COLOURS: Record<CoiDeclaration["conflictType"], string> = {
  financial: "bg-indigo-950/30 text-indigo-300 border border-indigo-500/40",
  personal: "bg-pink-950/30 text-pink-300 border border-pink-500/40",
  business: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  other: "bg-zinc-800/40 text-ink-2 border border-hair-2",
};

interface FormState {
  staffName: string;
  staffRole: string;
  declarationDate: string;
  conflictType: CoiDeclaration["conflictType"];
  description: string;
  potentialImpact: string;
  mitigationProposed: string;
}

const EMPTY_FORM: FormState = {
  staffName: "",
  staffRole: "",
  declarationDate: "",
  conflictType: "financial",
  description: "",
  potentialImpact: "",
  mitigationProposed: "",
};

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("adminToken") ?? "";
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export default function CoiRegisterPage() {
  const [declarations, setDeclarations] = useState<CoiDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mlroDecisionDraft, setMlroDecisionDraft] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchDeclarations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coi-register", { headers: authHeaders() });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "COI register"));
      const data = await res.json() as { ok: boolean; records?: CoiDeclaration[]; error?: string };
      if (data.ok) {
        setDeclarations(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load COI declarations");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error loading COI declarations"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchDeclarations(); }, [fetchDeclarations]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/coi-register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          staffName: form.staffName.trim(),
          staffRole: form.staffRole.trim(),
          declarationDate: form.declarationDate,
          conflictType: form.conflictType,
          description: form.description.trim(),
          potentialImpact: form.potentialImpact.trim(),
          mitigationProposed: form.mitigationProposed.trim(),
        }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "COI register"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        void fetchDeclarations();
      } else {
        setError(data.error ?? "Failed to create COI declaration");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error creating COI declaration"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMlroReview(decl: CoiDeclaration, newStatus: CoiDeclaration["status"]) {
    setUpdatingId(decl.id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const decision = mlroDecisionDraft[decl.id] ?? "";
      const res = await fetch(`/api/coi-register/${decl.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          status: newStatus,
          mlroSignOff: true,
          mlroReviewDate: today,
          ...(decision.trim() ? { mlroDecision: decision.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "COI register"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setMlroDecisionDraft((prev) => { const n = { ...prev }; delete n[decl.id]; return n; });
        void fetchDeclarations();
      } else {
        setError(data.error ?? "Failed to update COI declaration");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error updating COI declaration"));
    } finally {
      setUpdatingId(null);
    }
  }

  const inputCls = "w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2";

  return (
    <ModuleLayout
      sidebarActions={
        <ActionButton variant="add" type="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Declaration"}
        </ActionButton>
      }
    >
      <ModuleFamilyBar
        suiteName="Governance & Ethics"
        modules={[
          { label: "COI Register", href: "/coi-register", icon: "⚖️" },
          { label: "Voluntary Disclosure", href: "/voluntary-disclosure", icon: "📣" },
        ]}
      />
      <ModuleHero
        eyebrow=""
        title="Conflicts of Interest"
        titleEm="register."
        intro="Staff declarations · MLRO sign-off · annual review · conflict management · CBUAE governance"
      />

      <div className="mx-auto max-w-6xl px-4 pb-16 space-y-5">

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">New Conflict of Interest Declaration</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Staff Name</label>
                <input type="text" value={form.staffName}
                  onChange={(e) => setForm({ ...form, staffName: e.target.value })}
                  className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Staff Role / Title</label>
                <input type="text" value={form.staffRole}
                  onChange={(e) => setForm({ ...form, staffRole: e.target.value })}
                  className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Declaration Date</label>
                <input type="date" value={form.declarationDate}
                  onChange={(e) => setForm({ ...form, declarationDate: e.target.value })}
                  className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Conflict Type</label>
                <select value={form.conflictType}
                  onChange={(e) => setForm({ ...form, conflictType: e.target.value as CoiDeclaration["conflictType"] })}
                  className={inputCls} required>
                  <option value="financial">Financial</option>
                  <option value="personal">Personal</option>
                  <option value="business">Business</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-1 mb-1">Description of Conflict</label>
                <textarea value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={inputCls} rows={3} required
                  placeholder="Describe the nature of the conflict of interest..." />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-1 mb-1">Potential Impact</label>
                <textarea value={form.potentialImpact}
                  onChange={(e) => setForm({ ...form, potentialImpact: e.target.value })}
                  className={inputCls} rows={2} required
                  placeholder="Describe the potential impact on the organisation or customers..." />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-1 mb-1">Proposed Mitigation</label>
                <textarea value={form.mitigationProposed}
                  onChange={(e) => setForm({ ...form, mitigationProposed: e.target.value })}
                  className={inputCls} rows={2} required
                  placeholder="Steps proposed to manage or eliminate the conflict..." />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit Declaration"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading COI declarations...</div>
        ) : declarations.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg">
            No COI declarations recorded yet.
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-base border-b border-hair-2">
                  {["Staff Name", "Role", "Conflict Type", "Declaration Date", "Status", "MLRO Review", "Next Review"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-2 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {declarations.map((decl) => (
                  <>
                    <tr
                      key={decl.id}
                      onClick={() => setExpandedId(expandedId === decl.id ? null : decl.id)}
                      className="border-b border-hair-2 hover:bg-bg-base/40 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-0">{decl.staffName}</div>
                        <div className="text-xs text-ink-2 font-mono">{decl.id}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-1">{decl.staffRole}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${CONFLICT_COLOURS[decl.conflictType]}`}>
                          {decl.conflictType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-1">{decl.declarationDate}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[decl.status]}`}>
                          {decl.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {decl.mlroReviewDate ? (
                          <span className="text-xs text-ink-2">{decl.mlroReviewDate}</span>
                        ) : (
                          <span className="text-xs text-amber-300">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-2 text-xs">
                        {decl.nextReviewDate ?? "—"}
                      </td>
                    </tr>
                    {expandedId === decl.id && (
                      <tr key={`${decl.id}-expanded`}>
                        <td colSpan={7} className="bg-bg-base/30 px-6 py-5 border-b border-hair-2">
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div>
                                <h3 className="text-sm font-semibold text-ink-1 mb-1">Description</h3>
                                <p className="text-sm text-ink-2 whitespace-pre-wrap">{decl.description}</p>
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-ink-1 mb-1">Potential Impact</h3>
                                <p className="text-sm text-ink-2 whitespace-pre-wrap">{decl.potentialImpact}</p>
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-ink-1 mb-1">Proposed Mitigation</h3>
                                <p className="text-sm text-ink-2 whitespace-pre-wrap">{decl.mitigationProposed}</p>
                              </div>
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-ink-1 mb-2">MLRO Review</h3>
                              {decl.mlroSignOff ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[decl.status]}`}>
                                      {decl.status.replace("_", " ")}
                                    </span>
                                    <span className="text-xs text-ink-2">on {decl.mlroReviewDate}</span>
                                  </div>
                                  {decl.mlroDecision && (
                                    <p className="text-sm text-ink-2 mt-2 whitespace-pre-wrap">
                                      <span className="font-medium text-ink-1">Decision notes:</span> {decl.mlroDecision}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <textarea
                                    value={mlroDecisionDraft[decl.id] ?? ""}
                                    onChange={(e) => setMlroDecisionDraft((prev) => ({ ...prev, [decl.id]: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                                    rows={3}
                                    placeholder="MLRO decision notes (optional)..."
                                  />
                                  <div className="flex gap-2 flex-wrap">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); void handleMlroReview(decl, "approved"); }}
                                      disabled={updatingId === decl.id}
                                      className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-md hover:bg-emerald-600 disabled:opacity-50"
                                    >
                                      {updatingId === decl.id ? "Updating..." : "Approve"}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); void handleMlroReview(decl, "managed"); }}
                                      disabled={updatingId === decl.id}
                                      className="px-3 py-1.5 text-xs bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50"
                                    >
                                      {updatingId === decl.id ? "Updating..." : "Mark Managed"}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); void handleMlroReview(decl, "rejected"); }}
                                      disabled={updatingId === decl.id}
                                      className="px-3 py-1.5 text-xs bg-red-700 text-white rounded-md hover:bg-red-600 disabled:opacity-50"
                                    >
                                      {updatingId === decl.id ? "Updating..." : "Reject"}
                                    </button>
                                  </div>
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
