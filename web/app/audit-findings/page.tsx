"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

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
  critical: "bg-red-950/30 text-red-300 border border-red-500/40",
  high: "bg-orange-950/30 text-orange-300 border border-orange-500/40",
  medium: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  low: "bg-zinc-800/40 text-ink-2 border border-hair-2",
};

const STATUS_COLOURS: Record<AuditFinding["status"], string> = {
  open: "bg-sky-950/20 text-sky-300",
  in_progress: "bg-indigo-950/20 text-indigo-300",
  overdue: "bg-red-950/20 text-red-300",
  resolved: "bg-emerald-950/20 text-emerald-300",
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

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchFindings = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit-findings", { headers: authHeaders() });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; records?: AuditFinding[]; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) setFindings(data.records ?? []);
      else setError(data.error ?? "Failed to load audit findings");
    } catch (err) {
      if (mountedRef.current) setError(caughtErrorMessage(err, "Network error loading audit findings"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchFindings(); }, [fetchFindings]);

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
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        void fetchFindings();
      } else {
        setError(data.error ?? "Failed to create audit finding");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error creating audit finding"));
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
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) void fetchFindings();
      else setError(data.error ?? "Failed to record MLRO sign-off");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error recording MLRO sign-off"));
    } finally {
      setSigningOff(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = findings.filter((f) => activeTab === "all" || f.status === activeTab);
  const totalCount = findings.length;
  const openCount = findings.filter((f) => f.status === "open").length;
  const overdueCount = findings.filter((f) => f.status === "overdue").length;
  const resolvedCount = findings.filter((f) => f.status === "resolved").length;

  return (
    <ModuleLayout
      sidebarActions={
        <ActionButton variant="add" type="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Finding"}
        </ActionButton>
      }
    >
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
        title="Audit Findings"
        titleEm="register."
        intro="Internal audit findings · remediation tracking · MLRO sign-off · Board Audit Committee"
      />

      <div className="mx-auto max-w-5xl px-4 pb-16 space-y-6">

        {/* Stats — New Finding button moved to sidebar Actions */}
        <div className="flex items-center justify-start gap-4">
          <div className="flex gap-3">
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-ink-1">{totalCount}</div>
              <div className="text-10 text-ink-2 mt-0.5">Total</div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-sky-400">{openCount}</div>
              <div className="text-10 text-ink-2 mt-0.5">Open</div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 text-center min-w-[80px]">
              <div className={`text-2xl font-bold ${overdueCount > 0 ? "text-red" : "text-ink-2"}`}>{overdueCount}</div>
              <div className="text-10 text-ink-2 mt-0.5">Overdue</div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-4 py-3 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-emerald-400">{resolvedCount}</div>
              <div className="text-10 text-ink-2 mt-0.5">Resolved</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {/* Create form */}
        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">New Audit Finding</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-1 mb-1">Title</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2" required
                  placeholder="e.g. CDD records incomplete for high-risk customers" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Auditor Name</label>
                <input type="text" value={form.auditorName} onChange={(e) => setForm({ ...form, auditorName: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Audit Date</label>
                <input type="date" value={form.auditDate} onChange={(e) => setForm({ ...form, auditDate: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Severity</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as AuditFinding["severity"] })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Regulation</label>
                <input type="text" value={form.regulation} onChange={(e) => setForm({ ...form, regulation: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  placeholder="e.g. CBUAE §9.3, FATF R.10" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Owner (Responsible Staff)</label>
                <input type="text" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0" required />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-1 mb-1">Finding Description</label>
                <textarea value={form.finding} onChange={(e) => setForm({ ...form, finding: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  rows={3} required placeholder="Describe the audit finding in detail..." />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-1 mb-1">Remediation Plan (optional)</label>
                <textarea value={form.remediationPlan} onChange={(e) => setForm({ ...form, remediationPlan: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  rows={2} placeholder="Initial proposed remediation steps..." />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">Cancel</button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50">
                {submitting ? "Creating..." : "Create Finding"}
              </button>
            </div>
          </form>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-hair-2">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink-1"
              }`}>
              {tab.label}
              {tab.key !== "all" && (
                <span className="ml-1 text-10 text-ink-2">
                  ({findings.filter((f) => f.status === tab.key).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading audit findings...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg">
            No findings in this category.
          </div>
        ) : (
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-base border-b border-hair-2">
                  <th className="px-4 py-3 text-left font-medium text-ink-2">Title</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-2">Severity</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-2">Auditor</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-2">Due Date</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-2">Owner</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-2">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-ink-2">MLRO</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((finding) => (
                  <>
                    <tr
                      key={finding.id}
                      onClick={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
                      className="border-b border-hair-2 hover:bg-bg-base cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-0">{finding.title}</div>
                        <div className="text-10 text-ink-2 font-mono">{finding.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLOURS[finding.severity]}`}>
                          {finding.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-1">{finding.auditorName}</td>
                      <td className={`px-4 py-3 font-medium ${finding.dueDate < today && finding.status !== "resolved" ? "text-red" : "text-ink-1"}`}>
                        {finding.dueDate}
                      </td>
                      <td className="px-4 py-3 text-ink-1">{finding.owner}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[finding.status]}`}>
                          {finding.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {finding.mlroSignOff ? (
                          <span className="text-emerald-400 font-bold" title={finding.mlroSignOffDate}>✓</span>
                        ) : (
                          <span className="text-red/60">✗</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === finding.id && (
                      <tr key={`${finding.id}-expanded`}>
                        <td colSpan={7} className="bg-bg-base px-6 py-5 border-b border-hair-2">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <h3 className="text-sm font-semibold text-ink-1 mb-2">Finding Detail</h3>
                              <p className="text-sm text-ink-1 whitespace-pre-wrap">{finding.finding}</p>
                              {finding.regulation && (
                                <p className="mt-2 text-xs text-ink-2">
                                  <span className="font-medium">Regulation:</span> {finding.regulation}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-ink-2">
                                <span className="font-medium">Audit Date:</span> {finding.auditDate}
                              </p>
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-ink-1 mb-2">Remediation Plan</h3>
                              {finding.remediationPlan ? (
                                <p className="text-sm text-ink-1 whitespace-pre-wrap">{finding.remediationPlan}</p>
                              ) : (
                                <p className="text-sm text-ink-2 italic">No remediation plan recorded.</p>
                              )}
                              <div className="mt-4">
                                <h3 className="text-sm font-semibold text-ink-1 mb-2">MLRO Sign-Off</h3>
                                {finding.mlroSignOff ? (
                                  <div className="text-sm text-emerald-400">
                                    <span className="font-bold">✓ Signed off</span>
                                    {finding.mlroSignOffDate && (
                                      <span className="text-ink-2"> on {finding.mlroSignOffDate}</span>
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
    </ModuleLayout>
  );
}
