"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import type { ShadowAIEntry, ShadowAIStatus } from "@/app/api/shadow-ai/route";

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
  critical: "bg-red-100 text-red-800 border border-red-300",
  high: "bg-orange-100 text-orange-800 border border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  low: "bg-green-100 text-green-800 border border-green-300",
};

const STATUS_COLOURS: Record<ShadowAIStatus, string> = {
  detected: "bg-red-50 text-red-700",
  under_review: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  blocked: "bg-gray-100 text-gray-700",
  remediated: "bg-purple-50 text-purple-700",
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
  const [stats, setStats] = useState<StatsPayload>({ total: 0, critical: 0, high: 0, open: 0, blocked: 0 });
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ok: boolean; entries?: ShadowAIEntry[]; stats?: StatsPayload; error?: string };
      if (data.ok) {
        setEntries(data.entries ?? []);
        if (data.stats) setStats(data.stats);
      } else {
        setError(data.error ?? "Failed to load shadow AI register");
      }
    } catch {
      setError("Network error loading shadow AI register");
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        setForm({ toolName: "", toolType: "llm", detectionMethod: "user_report", department: "", useCase: "", dataClassification: "internal", vendorDpaExists: false, approvedInRegistry: false, notes: "" });
        void fetchEntries();
      } else {
        setError(data.error ?? "Failed to log shadow AI entry");
      }
    } catch {
      setError("Network error logging shadow AI entry");
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) void fetchEntries();
      else setError(data.error ?? "Update failed");
    } catch {
      setError("Network error updating entry");
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shadow AI Detection Register</h1>
          <p className="text-sm text-gray-500 mt-1">
            CBUAE AI Governance Guidelines 2025 · Unauthorized AI tool detection & remediation
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700"
        >
          {showForm ? "Cancel" : "Report Shadow AI"}
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-700">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-1">Total Detected</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${stats.critical > 0 ? "text-red-600" : "text-gray-400"}`}>{stats.critical}</div>
          <div className="text-xs text-gray-500 mt-1">Critical Risk</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${stats.open > 0 ? "text-orange-600" : "text-green-600"}`}>{stats.open}</div>
          <div className="text-xs text-gray-500 mt-1">Open / Reviewing</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-700">{stats.blocked}</div>
          <div className="text-xs text-gray-500 mt-1">Blocked</div>
        </div>
      </div>

      {/* Policy notice */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Policy:</strong> Any AI tool used in compliance workflows must be registered in the Model Registry and have a signed DPA. Unauthorized usage of AI tools with <em>confidential</em> or <em>restricted</em> data constitutes a critical risk requiring immediate containment. Per CBUAE AI Governance Guidelines 2025.
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">{error}</div>
      )}

      {/* Log form */}
      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Report Shadow AI Tool</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tool / Service Name</label>
              <input
                type="text"
                value={form.toolName}
                onChange={(e) => setForm({ ...form, toolName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. ChatGPT, Gemini, Perplexity, Midjourney..."
                maxLength={100}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tool Type</label>
              <select
                value={form.toolType}
                onChange={(e) => setForm({ ...form, toolType: e.target.value as ShadowAIEntry["toolType"] })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {Object.entries(TOOL_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">How Detected</label>
              <select
                value={form.detectionMethod}
                onChange={(e) => setForm({ ...form, detectionMethod: e.target.value as ShadowAIEntry["detectionMethod"] })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {Object.entries(DETECTION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Classification Used With</label>
              <select
                value={form.dataClassification}
                onChange={(e) => setForm({ ...form, dataClassification: e.target.value as ShadowAIEntry["dataClassification"] })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Department (optional)</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. Compliance, Operations, Finance"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Use Case (optional)</label>
              <input
                type="text"
                value={form.useCase}
                onChange={(e) => setForm({ ...form, useCase: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="How was the tool being used?"
                maxLength={500}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.vendorDpaExists} onChange={(e) => setForm({ ...form, vendorDpaExists: e.target.checked })} className="rounded" />
              Vendor DPA exists
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.approvedInRegistry} onChange={(e) => setForm({ ...form, approvedInRegistry: e.target.checked })} className="rounded" />
              Already in approved AI registry
            </label>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={2}
              maxLength={1000}
              placeholder="Any additional context or evidence..."
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
              {submitting ? "Logging..." : "Log Detection"}
            </button>
          </div>
        </form>
      )}

      {/* Register */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg text-sm">
          No shadow AI detections recorded. Use the &ldquo;Report Shadow AI&rdquo; button to log a detection.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-gray-500">{entry.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLOURS[entry.riskLevel]}`}>
                      {entry.riskLevel} risk
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOURS[entry.status]}`}>
                      {entry.status.replace("_", " ")}
                    </span>
                    {!entry.approvedInRegistry && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">unregistered</span>
                    )}
                    {!entry.vendorDpaExists && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-200">no DPA</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{entry.toolName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {TOOL_TYPE_LABELS[entry.toolType]} · detected via {DETECTION_LABELS[entry.detectionMethod]}
                    {entry.department && ` · ${entry.department}`}
                    {entry.dataClassification !== "public" && (
                      <span className={`ml-1 font-medium ${entry.dataClassification === "restricted" ? "text-red-600" : entry.dataClassification === "confidential" ? "text-orange-600" : ""}`}>
                        · {entry.dataClassification} data
                      </span>
                    )}
                  </p>
                  {entry.useCase && <p className="text-xs text-gray-500 mt-0.5 italic">{entry.useCase}</p>}
                </div>
                <div className="text-xs text-gray-400 shrink-0 text-right">
                  {new Date(entry.detectedAt).toLocaleDateString()}
                </div>
              </div>

              {/* Action buttons */}
              {entry.status !== "blocked" && entry.status !== "remediated" && (
                <div className="mt-3 flex gap-2">
                  {entry.status === "detected" && (
                    <button onClick={() => void handleStatusUpdate(entry.id, "under_review")} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100">
                      → Review
                    </button>
                  )}
                  {(entry.status === "detected" || entry.status === "under_review") && (
                    <>
                      <button onClick={() => void handleStatusUpdate(entry.id, "approved")} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100">
                        Approve
                      </button>
                      <button onClick={() => void handleStatusUpdate(entry.id, "blocked")} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100">
                        Block
                      </button>
                    </>
                  )}
                  {entry.status === "approved" && (
                    <button onClick={() => void handleStatusUpdate(entry.id, "remediated")} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded border border-purple-200 hover:bg-purple-100">
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
  );
}
