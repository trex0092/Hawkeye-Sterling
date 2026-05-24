"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";

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
  pending_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  managed: "bg-blue-100 text-blue-800",
};

const CONFLICT_COLOURS: Record<CoiDeclaration["conflictType"], string> = {
  financial: "bg-purple-100 text-purple-800",
  personal: "bg-pink-100 text-pink-800",
  business: "bg-cyan-100 text-cyan-800",
  other: "bg-gray-100 text-gray-700",
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
      const res = await fetch("/api/coi-register", {
        headers: authHeaders(),
      });
      const data = await res.json() as { ok: boolean; records?: CoiDeclaration[]; error?: string };
      if (data.ok) {
        setDeclarations(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load COI declarations");
      }
    } catch {
      setError("Network error loading COI declarations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDeclarations();
  }, [fetchDeclarations]);

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
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        void fetchDeclarations();
      } else {
        setError(data.error ?? "Failed to create COI declaration");
      }
    } catch {
      setError("Network error creating COI declaration");
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
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setMlroDecisionDraft((prev) => { const n = { ...prev }; delete n[decl.id]; return n; });
        void fetchDeclarations();
      } else {
        setError(data.error ?? "Failed to update COI declaration");
      }
    } catch {
      setError("Network error updating COI declaration");
    } finally {
      setUpdatingId(null);
    }
  }

  const totalCount = declarations.length;
  const pendingCount = declarations.filter((d) => d.status === "pending_review").length;
  const approvedManagedCount = declarations.filter((d) => d.status === "approved" || d.status === "managed").length;
  const rejectedCount = declarations.filter((d) => d.status === "rejected").length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conflicts of Interest Register</h1>
          <p className="text-sm text-gray-500 mt-1">FATF R.35 · CBUAE Governance Guidelines · FDL 10/2025 Art.19</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "New Declaration"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Pending Review</p>
          <p className={`text-2xl font-bold ${pendingCount > 0 ? "text-amber-600" : "text-gray-900"}`}>{pendingCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Approved / Managed</p>
          <p className="text-2xl font-bold text-green-700">{approvedManagedCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Rejected</p>
          <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Inline create form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mb-6 bg-white border border-gray-200 rounded-lg p-6"
        >
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Conflict of Interest Declaration</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Staff Name</label>
              <input
                type="text"
                value={form.staffName}
                onChange={(e) => setForm({ ...form, staffName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Staff Role / Title</label>
              <input
                type="text"
                value={form.staffRole}
                onChange={(e) => setForm({ ...form, staffRole: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Declaration Date</label>
              <input
                type="date"
                value={form.declarationDate}
                onChange={(e) => setForm({ ...form, declarationDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conflict Type</label>
              <select
                value={form.conflictType}
                onChange={(e) => setForm({ ...form, conflictType: e.target.value as CoiDeclaration["conflictType"] })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="financial">Financial</option>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description of Conflict</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={3}
                required
                placeholder="Describe the nature of the conflict of interest..."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Potential Impact</label>
              <textarea
                value={form.potentialImpact}
                onChange={(e) => setForm({ ...form, potentialImpact: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                required
                placeholder="Describe the potential impact on the organisation or customers..."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Proposed Mitigation</label>
              <textarea
                value={form.mitigationProposed}
                onChange={(e) => setForm({ ...form, mitigationProposed: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                required
                placeholder="Steps proposed to manage or eliminate the conflict..."
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Declaration"}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading COI declarations...</div>
      ) : declarations.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg">
          No COI declarations recorded yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Staff Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Conflict Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Declaration Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">MLRO Review</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Next Review</th>
              </tr>
            </thead>
            <tbody>
              {declarations.map((decl) => (
                <>
                  <tr
                    key={decl.id}
                    onClick={() => setExpandedId(expandedId === decl.id ? null : decl.id)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{decl.staffName}</div>
                      <div className="text-xs text-gray-400 font-mono">{decl.id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{decl.staffRole}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${CONFLICT_COLOURS[decl.conflictType]}`}>
                        {decl.conflictType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{decl.declarationDate}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[decl.status]}`}>
                        {decl.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {decl.mlroReviewDate ? (
                        <span className="text-xs text-gray-600">{decl.mlroReviewDate}</span>
                      ) : (
                        <span className="text-xs text-amber-600">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {decl.nextReviewDate ?? "—"}
                    </td>
                  </tr>
                  {expandedId === decl.id && (
                    <tr key={`${decl.id}-expanded`}>
                      <td colSpan={7} className="bg-gray-50 px-6 py-5 border-b border-gray-200">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Left: declaration details */}
                          <div className="space-y-4">
                            <div>
                              <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{decl.description}</p>
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-700 mb-1">Potential Impact</h3>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{decl.potentialImpact}</p>
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-700 mb-1">Proposed Mitigation</h3>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{decl.mitigationProposed}</p>
                            </div>
                          </div>
                          {/* Right: MLRO review */}
                          <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">MLRO Review</h3>
                            {decl.mlroSignOff ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[decl.status]}`}>
                                    {decl.status.replace("_", " ")}
                                  </span>
                                  <span className="text-xs text-gray-500">on {decl.mlroReviewDate}</span>
                                </div>
                                {decl.mlroDecision && (
                                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
                                    <span className="font-medium">Decision notes:</span> {decl.mlroDecision}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <textarea
                                  value={mlroDecisionDraft[decl.id] ?? ""}
                                  onChange={(e) =>
                                    setMlroDecisionDraft((prev) => ({ ...prev, [decl.id]: e.target.value }))
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                  rows={3}
                                  placeholder="MLRO decision notes (optional)..."
                                />
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); void handleMlroReview(decl, "approved"); }}
                                    disabled={updatingId === decl.id}
                                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {updatingId === decl.id ? "Updating..." : "Approve"}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); void handleMlroReview(decl, "managed"); }}
                                    disabled={updatingId === decl.id}
                                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {updatingId === decl.id ? "Updating..." : "Mark Managed"}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); void handleMlroReview(decl, "rejected"); }}
                                    disabled={updatingId === decl.id}
                                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
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
  );
}
