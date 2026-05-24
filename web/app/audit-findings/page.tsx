"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";

interface AuditFinding {
  id: string;
  title: string;
  auditorName: string;
  auditDate: string;
  severity: "critical" | "high" | "medium" | "low";
  finding: string;
  regulation: string;
  owner: string;
  dueDate: string;
  status: "open" | "in_progress" | "resolved" | "overdue";
  remediationPlan?: string;
  mlroSignOff?: boolean;
  mlroSignOffDate?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

type TabKey = "all" | "open" | "in_progress" | "overdue" | "resolved";

const SEVERITY_COLOURS: Record<AuditFinding["severity"], string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-gray-100 text-gray-600",
};

const STATUS_COLOURS: Record<AuditFinding["status"], string> = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  overdue: "bg-red-100 text-red-800",
  resolved: "bg-green-100 text-green-800",
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "overdue", label: "Overdue" },
  { key: "resolved", label: "Resolved" },
];

interface FormState {
  title: string;
  auditorName: string;
  auditDate: string;
  severity: AuditFinding["severity"];
  finding: string;
  regulation: string;
  owner: string;
  dueDate: string;
  remediationPlan: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  auditorName: "",
  auditDate: "",
  severity: "medium",
  finding: "",
  regulation: "",
  owner: "",
  dueDate: "",
  remediationPlan: "",
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

export default function AuditFindingsPage() {
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [signingOff, setSigningOff] = useState<string | null>(null);

  const fetchFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit-findings", {
        headers: authHeaders(),
      });
      const data = await res.json() as { ok: boolean; records?: AuditFinding[]; error?: string };
      if (data.ok) {
        setFindings(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load audit findings");
      }
    } catch {
      setError("Network error loading audit findings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFindings();
  }, [fetchFindings]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/audit-findings", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: form.title.trim(),
          auditorName: form.auditorName.trim(),
          auditDate: form.auditDate,
          severity: form.severity,
          finding: form.finding.trim(),
          regulation: form.regulation.trim(),
          owner: form.owner.trim(),
          dueDate: form.dueDate,
          ...(form.remediationPlan.trim() ? { remediationPlan: form.remediationPlan.trim() } : {}),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        void fetchFindings();
      } else {
        setError(data.error ?? "Failed to create audit finding");
      }
    } catch {
      setError("Network error creating audit finding");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMlroSignOff(finding: AuditFinding) {
    setSigningOff(finding.id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/audit-findings/${finding.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ mlroSignOff: true, mlroSignOffDate: today }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        void fetchFindings();
      } else {
        setError(data.error ?? "Failed to record MLRO sign-off");
      }
    } catch {
      setError("Network error recording MLRO sign-off");
    } finally {
      setSigningOff(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const filtered = findings.filter((f) => {
    if (activeTab === "all") return true;
    return f.status === activeTab;
  });

  const totalCount = findings.length;
  const openCount = findings.filter((f) => f.status === "open").length;
  const overdueCount = findings.filter((f) => f.status === "overdue").length;
  const resolvedCount = findings.filter((f) => f.status === "resolved").length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Internal Audit Findings Register</h1>
          <p className="text-sm text-gray-500 mt-1">CBUAE §9 · IIA Standards · Board Audit Committee</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "New Finding"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Open</p>
          <p className="text-2xl font-bold text-blue-700">{openCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Overdue</p>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-600" : "text-gray-900"}`}>{overdueCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Resolved</p>
          <p className="text-2xl font-bold text-green-700">{resolvedCount}</p>
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
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Audit Finding</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
                placeholder="e.g. CDD records incomplete for high-risk customers"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auditor Name</label>
              <input
                type="text"
                value={form.auditorName}
                onChange={(e) => setForm({ ...form, auditorName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Audit Date</label>
              <input
                type="date"
                value={form.auditDate}
                onChange={(e) => setForm({ ...form, auditDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as AuditFinding["severity"] })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regulation</label>
              <input
                type="text"
                value={form.regulation}
                onChange={(e) => setForm({ ...form, regulation: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. CBUAE §9.3, FATF R.10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner (Responsible Staff)</label>
              <input
                type="text"
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Finding Description</label>
              <textarea
                value={form.finding}
                onChange={(e) => setForm({ ...form, finding: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={3}
                required
                placeholder="Describe the audit finding in detail..."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Remediation Plan (optional)</label>
              <textarea
                value={form.remediationPlan}
                onChange={(e) => setForm({ ...form, remediationPlan: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder="Initial proposed remediation steps..."
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
              {submitting ? "Creating..." : "Create Finding"}
            </button>
          </div>
        </form>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.key !== "all" && (
              <span className="ml-1 text-xs text-gray-400">
                ({findings.filter((f) => f.status === tab.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading audit findings...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg">
          No findings in this category.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Severity</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Auditor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Due Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Owner</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">MLRO Sign-Off</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((finding) => (
                <>
                  <tr
                    key={finding.id}
                    onClick={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{finding.title}</div>
                      <div className="text-xs text-gray-400 font-mono">{finding.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLOURS[finding.severity]}`}>
                        {finding.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{finding.auditorName}</td>
                    <td className={`px-4 py-3 font-medium ${finding.dueDate < today && finding.status !== "resolved" ? "text-red-600" : "text-gray-700"}`}>
                      {finding.dueDate}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{finding.owner}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[finding.status]}`}>
                        {finding.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {finding.mlroSignOff ? (
                        <span className="text-green-600 font-bold" title={finding.mlroSignOffDate}>✓</span>
                      ) : (
                        <span className="text-red-400">✗</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === finding.id && (
                    <tr key={`${finding.id}-expanded`}>
                      <td colSpan={7} className="bg-gray-50 px-6 py-5 border-b border-gray-200">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Finding Detail</h3>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{finding.finding}</p>
                            {finding.regulation && (
                              <p className="mt-2 text-xs text-gray-500">
                                <span className="font-medium">Regulation:</span> {finding.regulation}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-gray-500">
                              <span className="font-medium">Audit Date:</span> {finding.auditDate}
                            </p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Remediation Plan</h3>
                            {finding.remediationPlan ? (
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{finding.remediationPlan}</p>
                            ) : (
                              <p className="text-sm text-gray-400 italic">No remediation plan recorded.</p>
                            )}
                            <div className="mt-4">
                              <h3 className="text-sm font-semibold text-gray-700 mb-2">MLRO Sign-Off</h3>
                              {finding.mlroSignOff ? (
                                <div className="text-sm text-green-700">
                                  <span className="font-bold">✓ Signed off</span>
                                  {finding.mlroSignOffDate && (
                                    <span className="text-gray-500"> on {finding.mlroSignOffDate}</span>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); void handleMlroSignOff(finding); }}
                                  disabled={signingOff === finding.id}
                                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {signingOff === finding.id ? "Signing off..." : "MLRO Sign-Off"}
                                </button>
                              )}
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
