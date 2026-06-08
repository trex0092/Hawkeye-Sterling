"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import type { ShadowAIEntry, ShadowAIStatus } from "@/app/api/shadow-ai/route";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

// Shadow AI Detection Register — UAE CBUAE AI Governance Guidelines 2025
// Monitors unauthorized / unregistered AI tool usage across compliance workflows

const TOOL_TYPE_LABELS: Record<ShadowAIEntry["toolType"], string> = {
  llm: "LLM / Chatbot",
  ml_api: "ML API",
  automation: "Automation",
  analytics: "Analytics",
  image_gen: "Image Generation",
  other: "Other",
};

const DETECTION_LABELS: Record<ShadowAIEntry["detectionMethod"], string> = {
  user_report: "User Report",
  network_scan: "Network Scan",
  audit_log: "Audit Log",
  browser_ext: "Browser Extension",
  dns_query: "DNS Query",
  other: "Other",
};

const RISK_COLOURS: Record<ShadowAIEntry["riskLevel"], string> = {
  critical: "bg-red-950/30 text-red-300 border border-red-500/40",
  high: "bg-orange-950/30 text-orange-300 border border-orange-500/40",
  medium: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  low: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
};

const STATUS_COLOURS: Record<ShadowAIStatus, string> = {
  detected: "bg-red-950/20 text-red-300",
  under_review: "bg-sky-950/20 text-sky-300",
  approved: "bg-emerald-950/20 text-emerald-300",
  blocked: "bg-zinc-800/40 text-ink-2",
  remediated: "bg-violet-950/20 text-violet-300",
};

interface FormState {
  toolName: string;
  toolType: ShadowAIEntry["toolType"];
  detectionMethod: ShadowAIEntry["detectionMethod"];
  department: string;
  useCase: string;
  dataClassification: ShadowAIEntry["dataClassification"];
  vendorDpaExists: boolean;
  approvedInRegistry: boolean;
  notes: string;
}

interface StatsPayload {
  total: number;
  critical: number;
  high: number;
  open: number;
  blocked: number;
}

export default function ShadowAIPage() {
  const [entries, setEntries] = useState<ShadowAIEntry[]>([]);
  const [, setStats] = useState<StatsPayload>({ total: 0, critical: 0, high: 0, open: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    toolName: "",
    toolType: "llm",
    detectionMethod: "user_report",
    department: "",
    useCase: "",
    dataClassification: "internal",
    vendorDpaExists: false,
    approvedInRegistry: false,
    notes: "",
  });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shadow-ai");
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; entries?: ShadowAIEntry[]; stats?: StatsPayload; error?: string };
      if (data.ok) {
        setEntries(data.entries ?? []);
        if (data.stats) setStats(data.stats);
      } else {
        setError(data.error ?? "Failed to load shadow AI register");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error loading shadow AI register"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/shadow-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({ toolName: "", toolType: "llm", detectionMethod: "user_report", department: "", useCase: "", dataClassification: "internal", vendorDpaExists: false, approvedInRegistry: false, notes: "" });
        void fetchEntries();
      } else {
        setError(data.error ?? "Failed to log shadow AI entry");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error logging shadow AI entry"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusUpdate(id: string, status: ShadowAIStatus) {
    try {
      const res = await fetch("/api/shadow-ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) void fetchEntries();
      else setError(data.error ?? "Update failed");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error updating entry"));
    }
  }

  return (
    <ModuleLayout
      sidebarActions={
        <ActionButton variant="add" type="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Report Shadow AI"}
        </ActionButton>
      }
    >
      <ModuleHero
        eyebrow=""
        title="Shadow AI Detection"
        titleEm="register."
        intro="Unauthorized AI tool detection & remediation · Unregistered LLMs · No-DPA vendors · Data classification risk"
      />

      <div className="mx-auto max-w-5xl px-4 pb-16 space-y-6">

        {/* Stat tiles removed; Report Shadow AI button lives in sidebar Actions */}

        {/* Policy notice */}
        <div className="bg-sky-950/20 border border-sky-500/30 rounded-lg p-4 text-sm text-sky-300">
          <strong>Policy:</strong> Any AI tool used in compliance workflows must be registered in the Model Registry and have a signed DPA. Unauthorized usage of AI tools with <em>confidential</em> or <em>restricted</em> data constitutes a critical risk requiring immediate containment. Per CBUAE AI Governance Guidelines 2025.
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {/* Log form */}
        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">Report Shadow AI Tool</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Tool / Service Name</label>
                <input
                  type="text"
                  value={form.toolName}
                  onChange={(e) => setForm({ ...form, toolName: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  placeholder="e.g. ChatGPT, Gemini, Perplexity, Midjourney..."
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Tool Type</label>
                <select
                  value={form.toolType}
                  onChange={(e) => setForm({ ...form, toolType: e.target.value as ShadowAIEntry["toolType"] })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0"
                >
                  {Object.entries(TOOL_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">How Detected</label>
                <select
                  value={form.detectionMethod}
                  onChange={(e) => setForm({ ...form, detectionMethod: e.target.value as ShadowAIEntry["detectionMethod"] })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0"
                >
                  {Object.entries(DETECTION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Data Classification Used With</label>
                <select
                  value={form.dataClassification}
                  onChange={(e) => setForm({ ...form, dataClassification: e.target.value as ShadowAIEntry["dataClassification"] })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0"
                >
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted (PII / AML data)</option>
                </select>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Department (optional)</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  placeholder="e.g. Compliance, Operations, Finance"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-1 mb-1">Use Case (optional)</label>
                <input
                  type="text"
                  value={form.useCase}
                  onChange={(e) => setForm({ ...form, useCase: e.target.value })}
                  className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                  placeholder="How was the tool being used?"
                  maxLength={500}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-6">
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={form.vendorDpaExists} onChange={(e) => setForm({ ...form, vendorDpaExists: e.target.checked })} className="rounded" />
                Vendor DPA exists
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={form.approvedInRegistry} onChange={(e) => setForm({ ...form, approvedInRegistry: e.target.checked })} className="rounded" />
                Already in approved AI registry
              </label>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-1 mb-1">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                rows={2}
                maxLength={1000}
                placeholder="Any additional context or evidence..."
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
                {submitting ? "Logging..." : "Log Detection"}
              </button>
            </div>
          </form>
        )}

        {/* Register */}
        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg text-sm">
            No shadow AI detections recorded. Use the &ldquo;Report Shadow AI&rdquo; button to log a detection.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-10 text-ink-2">{entry.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLOURS[entry.riskLevel]}`}>
                        {entry.riskLevel} risk
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOURS[entry.status]}`}>
                        {entry.status.replace("_", " ")}
                      </span>
                      {!entry.approvedInRegistry && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-950/20 text-red-300 border border-red-500/30">unregistered</span>
                      )}
                      {!entry.vendorDpaExists && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-orange-950/20 text-orange-300 border border-orange-500/30">no DPA</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-ink-0 mt-1">{entry.toolName}</p>
                    <p className="text-xs text-ink-2 mt-0.5">
                      {TOOL_TYPE_LABELS[entry.toolType]} · detected via {DETECTION_LABELS[entry.detectionMethod]}
                      {entry.department && ` · ${entry.department}`}
                      {entry.dataClassification !== "public" && (
                        <span className={`ml-1 font-medium ${entry.dataClassification === "restricted" ? "text-red-400" : entry.dataClassification === "confidential" ? "text-orange-400" : ""}`}>
                          · {entry.dataClassification} data
                        </span>
                      )}
                    </p>
                    {entry.useCase && <p className="text-xs text-ink-2 mt-0.5 italic">{entry.useCase}</p>}
                  </div>
                  <div className="text-xs text-ink-2 shrink-0 text-right">
                    {new Date(entry.detectedAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Action buttons */}
                {entry.status !== "blocked" && entry.status !== "remediated" && (
                  <div className="mt-3 flex gap-2">
                    {entry.status === "detected" && (
                      <button onClick={() => void handleStatusUpdate(entry.id, "under_review")} className="text-xs px-2 py-1 bg-sky-950/20 text-sky-300 rounded border border-sky-500/30 hover:bg-sky-950/40">
                        → Review
                      </button>
                    )}
                    {(entry.status === "detected" || entry.status === "under_review") && (
                      <>
                        <button onClick={() => void handleStatusUpdate(entry.id, "approved")} className="text-xs px-2 py-1 bg-emerald-950/20 text-emerald-300 rounded border border-emerald-500/30 hover:bg-emerald-950/40">
                          Approve
                        </button>
                        <button onClick={() => void handleStatusUpdate(entry.id, "blocked")} className="text-xs px-2 py-1 bg-red-950/20 text-red-300 rounded border border-red-500/30 hover:bg-red-950/40">
                          Block
                        </button>
                      </>
                    )}
                    {entry.status === "approved" && (
                      <button onClick={() => void handleStatusUpdate(entry.id, "remediated")} className="text-xs px-2 py-1 bg-violet-950/20 text-violet-300 rounded border border-violet-500/30 hover:bg-violet-950/40">
                        Mark Remediated
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
