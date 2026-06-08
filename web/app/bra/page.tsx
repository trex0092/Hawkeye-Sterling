"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

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
  draft: "bg-zinc-800/40 text-ink-2",
  active: "bg-emerald-950/20 text-emerald-300",
  overdue_review: "bg-red-950/20 text-red-300",
  superseded: "bg-amber-950/20 text-amber-300",
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
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; records?: typeof records; error?: string };
      if (data.ok) setRecords(data.records ?? []);
      else setError(data.error ?? "Failed to load BRA records");
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error loading BRA records"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  async function handleSubmit(e: FormEvent) {
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
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setShowForm(false);
        void fetchRecords();
      } else {
        setError(data.error ?? "Failed to create BRA record");
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error creating BRA record"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow=""
        title="Business Risk"
        titleEm="assessments."
        intro="DNFBP risk scoring · 90-day review cycle · inherent risk · controls effectiveness · residual risk"
      />

      <div className="w-full px-4 pb-16 space-y-6">

        {/* Action bar */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            {showForm ? "Cancel" : "Create New BRA"}
          </button>
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-500/30 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {showForm && (
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <h2 className="text-base font-semibold text-ink-0 mb-4">New Business Risk Assessment</h2>
            <div className="grid grid-cols-2 gap-4">
              {(["inherentRisk", "controlsEffectiveness", "customerRisk", "productRisk", "channelRisk", "geographyRisk"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-ink-1 mb-1 capitalize">
                    {field.replace(/([A-Z])/g, " $1")}
                  </label>
                  <select
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0"
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
              <label className="block text-sm font-medium text-ink-1 mb-1">Activity Scope</label>
              <textarea
                value={form.activityScope}
                onChange={(e) => setForm({ ...form, activityScope: e.target.value })}
                className="w-full bg-bg-panel border border-hair-2 rounded-md px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2"
                rows={3}
                required
                placeholder="Describe the DNFBP activities and business scope..."
              />
            </div>

            <div className="mt-4 flex gap-6">
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={form.isDnfbp}
                  onChange={(e) => setForm({ ...form, isDnfbp: e.target.checked })} className="rounded" />
                DNFBP entity
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={form.aedThresholdApplies}
                  onChange={(e) => setForm({ ...form, aedThresholdApplies: e.target.checked })} className="rounded" />
                AED 55,000 threshold applies
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-hair-2 text-ink-1 rounded-md hover:bg-bg-base">Cancel</button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm bg-brand text-white rounded-md hover:opacity-90 disabled:opacity-50">
                {submitting ? "Creating..." : "Create BRA"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center text-ink-2 py-12">Loading BRA records...</div>
        ) : records.length === 0 ? (
          <div className="text-center text-ink-2 py-12 border border-dashed border-hair-2 rounded-lg">
            No BRA records yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div key={record.id} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-ink-0">{record.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[record.status] ?? "bg-zinc-800/40 text-ink-2"}`}>
                        {record.status.replace("_", " ")}
                      </span>
                      {record.isOverdueReview && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
                          REVIEW OVERDUE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-2 mt-1 line-clamp-1">{record.activityScope}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-sm">
                      <span className="text-ink-2">Residual Risk: </span>
                      <span className={`font-semibold ${record.residualRisk >= 3 ? "text-red" : "text-emerald-400"}`}>
                        {record.residualRisk.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-xs text-ink-2 mt-1">
                      Next review: {new Date(record.nextReviewDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {record.aedThresholdApplies && (
                  <div className="mt-3 bg-amber-950/20 border border-amber-500/30 rounded px-3 py-2 text-xs text-amber-300">
                    DNFBP obligations apply — MOE registration required
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
