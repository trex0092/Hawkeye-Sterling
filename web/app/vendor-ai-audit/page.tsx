"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import type { VendorAIAssessment, VendorAIChecklist, VendorAuditStatus } from "@/app/api/vendor-ai-audit/route";
import { apiErrorMessage } from "@/lib/client/error-utils";

// Vendor AI Audit Framework — UAE CBUAE AI Governance Guidelines 2025
// FATF R.18 (Third-party reliance) · ADGM DPR 2021 · DIFC DP Law 2020

const CHECKLIST_LABELS: Record<keyof VendorAIChecklist, string> = {
  dpaInPlace: "Data Processing Agreement (DPA) in place",
  dataResidencyConfirmed: "Data residency / jurisdiction confirmed",
  subprocessorListObtained: "Sub-processor list obtained",
  penetrationTestReport: "Penetration test report (last 12 months)",
  iso27001OrSoc2: "ISO 27001 or SOC 2 Type II certificate",
  modelCardProvided: "Model card / technical disclosure provided",
  biasAuditCompleted: "Bias audit completed and report shared",
  hallucIndicationLogEnabled: "Hallucination indication / confidence log enabled",
  incidentNotificationSla: "Incident notification SLA agreed (≤72h)",
  rightToAuditClause: "Right-to-audit clause in contract",
  dataRetentionTermsAgreed: "Data retention and deletion terms agreed",
  gdprOrAdgmDpaClause: "GDPR / ADGM / DIFC data protection clauses present",
};

const RISK_COLOURS: Record<VendorAIAssessment["riskTier"], string> = {
  critical: "bg-red-950/30 text-red-300 border border-red-500/40",
  high: "bg-orange-950/30 text-orange-300 border border-orange-500/40",
  medium: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  low: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
};

const STATUS_COLOURS: Record<VendorAuditStatus, string> = {
  draft: "bg-zinc-800/40 text-ink-2",
  in_review: "bg-sky-950/20 text-sky-300",
  approved: "bg-emerald-950/20 text-emerald-300",
  failed: "bg-red-950/20 text-red-300",
  expired: "bg-amber-950/20 text-amber-300",
};

function emptyChecklist(): VendorAIChecklist {
  return {
    dpaInPlace: false,
    dataResidencyConfirmed: false,
    subprocessorListObtained: false,
    penetrationTestReport: false,
    iso27001OrSoc2: false,
    modelCardProvided: false,
    biasAuditCompleted: false,
    hallucIndicationLogEnabled: false,
    incidentNotificationSla: false,
    rightToAuditClause: false,
    dataRetentionTermsAgreed: false,
    gdprOrAdgmDpaClause: false,
  };
}

interface FormState {
  vendorName: string;
  vendorType: VendorAIAssessment["vendorType"];
  contractReference: string;
  checklist: VendorAIChecklist;
  overallFindings: string;
  criticalGaps: string;
}

export default function VendorAIAuditPage() {
  const [assessments, setAssessments] = useState<VendorAIAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<VendorAIAssessment | null>(null);
  const [form, setForm] = useState<FormState>({
    vendorName: "",
    vendorType: "llm_provider",
    contractReference: "",
    checklist: emptyChecklist(),
    overallFindings: "",
    criticalGaps: "",
  });

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vendor-ai-audit");
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Vendor AI audit"));
      const data = await res.json() as { ok: boolean; assessments?: VendorAIAssessment[]; error?: string };
      if (data.ok) setAssessments(data.assessments ?? []);
      else setError(data.error ?? "Failed to load assessments");
    } catch {
      setError("Network error loading assessments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAssessments(); }, [fetchAssessments]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        vendorName: form.vendorName,
        vendorType: form.vendorType,
        contractReference: form.contractReference || undefined,
        checklist: form.checklist,
        overallFindings: form.overallFindings,
        criticalGaps: form.criticalGaps.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      const res = await fetch("/api/vendor-ai-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Vendor AI audit"));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({ vendorName: "", vendorType: "llm_provider", contractReference: "", checklist: emptyChecklist(), overallFindings: "", criticalGaps: "" });
        void fetchAssessments();
      } else {
        setError(data.error ?? "Failed to create assessment");
      }
    } catch {
      setError("Network error creating assessment");
    } finally {
      setSubmitting(false);
    }
  }

  function setChecklistItem(key: keyof VendorAIChecklist, value: boolean) {
    setForm((f) => ({ ...f, checklist: { ...f.checklist, [key]: value } }));
  }

  const checklistScore = (c: VendorAIChecklist) => {
    const vals = Object.values(c) as boolean[];
    return Math.round((vals.filter(Boolean).length / vals.length) * 100);
  };

  const scoreColor = (score: number) =>
    score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <ModuleLayout>
      <ModuleFamilyBar
        suiteName="AI Governance"
        modules={[
          { label: "AI Incident Playbook", href: "/ai-incident-playbook", icon: "🤖" },
          { label: "Shadow AI Register", href: "/shadow-ai", icon: "👁️" },
          { label: "Vendor AI Audit", href: "/vendor-ai-audit", icon: "🏢" },
        ]}
      />
      <ModuleHero
        eyebrow=""
        title="Vendor AI Audit"
        titleEm="framework."
        intro="AI vendor due diligence · DPA · model card · penetration testing · bias audit · right-to-audit clause"
      />

      <div className="mx-auto max-w-5xl px-4 pb-16 space-y-6">

        {/* Action bar */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            {showForm ? "Cancel" : "Assess New Vendor"}
          </button>
        </div>

        {/* Regulatory notice */}
        <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-lg p-4 text-sm text-indigo-300">
          <strong>Regulatory Requirement:</strong> All AI vendors must be assessed before use and re-assessed on the schedule below (Critical/High: 3–6 months; Low: 12 months). The vendor DPA and model card must be retained for 10 years per FDL 10/2025 Art.18.
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {/* New assessment form */}
        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">New Vendor AI Assessment</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Vendor Name</label>
                <input
                  type="text"
                  value={form.vendorName}
                  onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  placeholder="e.g. Anthropic, OpenAI, Google, AWS"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Vendor Type</label>
                <select
                  value={form.vendorType}
                  onChange={(e) => setForm({ ...form, vendorType: e.target.value as VendorAIAssessment["vendorType"] })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0"
                >
                  <option value="llm_provider">LLM Provider</option>
                  <option value="ml_platform">ML Platform</option>
                  <option value="data_broker">Data Broker</option>
                  <option value="analytics">Analytics</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Contract Reference (optional)</label>
              <input
                type="text"
                value={form.contractReference}
                onChange={(e) => setForm({ ...form, contractReference: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                placeholder="e.g. Contract ID, ToS version, DPA reference..."
                maxLength={200}
              />
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-ink-0">Due Diligence Checklist</h3>
                <span className={`text-sm font-bold ${scoreColor(checklistScore(form.checklist))}`}>
                  Score: {checklistScore(form.checklist)}%
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(CHECKLIST_LABELS) as (keyof VendorAIChecklist)[]).map((key) => (
                  <label key={key} className="flex items-center gap-3 text-sm text-ink-1 cursor-pointer hover:bg-bg-base rounded px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={form.checklist[key]}
                      onChange={(e) => setChecklistItem(key, e.target.checked)}
                      className="rounded"
                    />
                    <span className={form.checklist[key] ? "text-emerald-400" : "text-ink-1"}>{CHECKLIST_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Overall Findings</label>
              <textarea
                value={form.overallFindings}
                onChange={(e) => setForm({ ...form, overallFindings: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                rows={3}
                maxLength={2000}
                required
                placeholder="Summary of vendor AI governance posture, key strengths, and concerns..."
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Critical Gaps (one per line)</label>
              <textarea
                value={form.criticalGaps}
                onChange={(e) => setForm({ ...form, criticalGaps: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                rows={2}
                placeholder="e.g. biasAuditCompleted&#10;rightToAuditClause"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? "Saving..." : "Save Assessment"}
              </button>
            </div>
          </form>
        )}

        {/* Assessments list + detail */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-ink-1 mb-3">Vendor Assessments</h2>
            {loading ? (
              <div className="text-center text-ink-2 py-12">Loading...</div>
            ) : assessments.length === 0 ? (
              <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg text-sm">
                No vendor assessments yet.
              </div>
            ) : (
              <div className="space-y-2">
                {assessments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelected(selected?.id === a.id ? null : a)}
                    className={`w-full text-left bg-bg-panel border rounded-lg p-4 hover:border-indigo-500/40 transition-colors ${selected?.id === a.id ? "border-indigo-500/60 ring-1 ring-indigo-500/20" : "border-hair-2"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-ink-0">{a.vendorName}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLOURS[a.riskTier]}`}>
                            {a.riskTier}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOURS[a.status]}`}>
                            {a.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-xs text-ink-2 mt-1">
                          Score: <span className={`font-bold ${scoreColor(a.checklistScore)}`}>{a.checklistScore}%</span>
                          {" · "}Next review: {a.nextReviewDate}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div>
            <h2 className="text-sm font-semibold text-ink-1 mb-3">
              {selected ? `Assessment: ${selected.vendorName}` : "Vendor Detail"}
            </h2>
            {!selected ? (
              <div className="bg-bg-base border border-dashed border-hair-2 rounded-lg p-6 text-center text-sm text-ink-2">
                Select a vendor to see full checklist and findings
              </div>
            ) : (
              <div className="space-y-4">
                {/* Score */}
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 flex items-center gap-4">
                  <div className={`text-4xl font-bold ${scoreColor(selected.checklistScore)}`}>
                    {selected.checklistScore}%
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink-0">Due Diligence Score</div>
                    <div className="text-xs text-ink-2">Risk tier: <span className="font-medium text-ink-1">{selected.riskTier}</span> · {selected.status.replace("_", " ")}</div>
                    {selected.contractReference && (
                      <div className="text-xs text-ink-2 mt-0.5">{selected.contractReference}</div>
                    )}
                  </div>
                </div>

                {/* Checklist */}
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-ink-0 mb-3">Checklist</h3>
                  <div className="space-y-1.5">
                    {(Object.keys(CHECKLIST_LABELS) as (keyof VendorAIChecklist)[]).map((key) => (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${selected.checklist[key] ? "bg-emerald-600" : "bg-red-700/60"}`}>
                          <span className="text-white text-xs">{selected.checklist[key] ? "✓" : "✗"}</span>
                        </span>
                        <span className={selected.checklist[key] ? "text-ink-1" : "text-red-400 font-medium"}>
                          {CHECKLIST_LABELS[key]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Critical gaps */}
                {selected.criticalGaps.length > 0 && (
                  <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-red-300 mb-2">Critical Gaps ({selected.criticalGaps.length})</h3>
                    <ul className="space-y-1">
                      {selected.criticalGaps.map((g, i) => (
                        <li key={i} className="text-xs text-red-400">• {g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Findings */}
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-ink-0 mb-2">Overall Findings</h3>
                  <p className="text-xs text-ink-1 leading-relaxed">{selected.overallFindings}</p>
                </div>

                {/* Regulatory basis */}
                <div className="bg-bg-base border border-hair-2 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-ink-1 mb-1.5">Regulatory Basis</h3>
                  <ul className="space-y-0.5">
                    {selected.regulatoryBasis.map((r, i) => (
                      <li key={i} className="text-xs text-ink-2">• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
