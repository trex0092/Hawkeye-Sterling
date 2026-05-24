"use client";

import { useState, useEffect, useCallback } from "react";

interface BraRecord {
  id: string;
  status: "draft" | "active" | "overdue_review" | "superseded";
  inherentRisk: number;
  controlsEffectiveness: number;
  residualRisk: number;
  customerRisk: number;
  productRisk: number;
  channelRisk: number;
  geographyRisk: number;
  isDnfbp: boolean;
  aedThresholdApplies: boolean;
  activityScope: string;
  approvedBy?: string;
  nextReviewDate: string;
  createdAt: string;
  isOverdueReview: boolean;
  notes?: string;
}

interface FormState {
  inherentRisk: string;
  controlsEffectiveness: string;
  customerRisk: string;
  productRisk: string;
  channelRisk: string;
  geographyRisk: string;
  activityScope: string;
  isDnfbp: boolean;
  aedThresholdApplies: boolean;
}

const RISK_OPTIONS = [1, 2, 3, 4, 5];

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-800",
  overdue_review: "bg-red-100 text-red-800",
  superseded: "bg-yellow-100 text-yellow-700",
};

export default function BraPage() {
  const [records, setRecords] = useState<BraRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    inherentRisk: "3",
    controlsEffectiveness: "3",
    customerRisk: "3",
    productRisk: "3",
    channelRisk: "3",
    geographyRisk: "3",
    activityScope: "",
    isDnfbp: false,
    aedThresholdApplies: false,
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bra");
      const data = await res.json();
      if (data.ok) {
        setRecords(data.records ?? []);
      } else {
        setError(data.error ?? "Failed to load BRA records");
      }
    } catch {
      setError("Network error loading BRA records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inherentRisk: Number(form.inherentRisk),
          controlsEffectiveness: Number(form.controlsEffectiveness),
          customerRisk: Number(form.customerRisk),
          productRisk: Number(form.productRisk),
          channelRisk: Number(form.channelRisk),
          geographyRisk: Number(form.geographyRisk),
          activityScope: form.activityScope,
          isDnfbp: form.isDnfbp,
          aedThresholdApplies: form.aedThresholdApplies,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        void fetchRecords();
      } else {
        setError(data.error ?? "Failed to create BRA record");
      }
    } catch {
      setError("Network error creating BRA record");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Risk Assessments</h1>
          <p className="text-sm text-gray-500 mt-1">MOE Circular 6/2025 — 90-day review cycle</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "Create New BRA"}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Business Risk Assessment</h2>
          <div className="grid grid-cols-2 gap-4">
            {(["inherentRisk", "controlsEffectiveness", "customerRisk", "productRisk", "channelRisk", "geographyRisk"] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {field.replace(/([A-Z])/g, " $1")}
                </label>
                <select
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                >
                  {RISK_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Scope</label>
            <textarea
              value={form.activityScope}
              onChange={(e) => setForm({ ...form, activityScope: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              rows={3}
              required
              placeholder="Describe the DNFBP activities and business scope..."
            />
          </div>

          <div className="mt-4 flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isDnfbp}
                onChange={(e) => setForm({ ...form, isDnfbp: e.target.checked })}
                className="rounded"
              />
              DNFBP entity
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.aedThresholdApplies}
                onChange={(e) => setForm({ ...form, aedThresholdApplies: e.target.checked })}
                className="rounded"
              />
              AED 55,000 threshold applies
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create BRA"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading BRA records...</div>
      ) : records.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border border-dashed border-gray-300 rounded-lg">
          No BRA records yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-gray-800">{record.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[record.status] ?? "bg-gray-100"}`}>
                      {record.status.replace("_", " ")}
                    </span>
                    {record.isOverdueReview && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
                        REVIEW OVERDUE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">{record.activityScope}</p>
                </div>
                <div className="text-right ml-4 shrink-0">
                  <div className="text-sm">
                    <span className="text-gray-500">Residual Risk: </span>
                    <span className={`font-semibold ${record.residualRisk >= 3 ? "text-red-600" : "text-green-700"}`}>
                      {record.residualRisk.toFixed(1)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Next review: {new Date(record.nextReviewDate).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {record.aedThresholdApplies && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
                  DNFBP obligations apply — MOE registration required
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
