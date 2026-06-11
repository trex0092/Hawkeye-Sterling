"use client";

import { useEffect, useRef, useState } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SowSourceType =
  | "salary"
  | "business_income"
  | "investment"
  | "inheritance"
  | "property_sale"
  | "other";

interface SowRecord {
  id: string;
  subjectId: string;
  sourceType: SowSourceType;
  estimatedAmountAed: number;
  supportingDocumentDescription: string;
  verifiedBy: string;
  verifiedAt: string;
  sofVerified: boolean;
}

interface SowVerificationResponse {
  ok: boolean;
  sowVerified: boolean;
  sofVerified: boolean;
  records: SowRecord[];
  error?: string;
}

export interface SowVerificationPanelProps {
  subjectId: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  isPep: boolean;
  onVerificationComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_TYPE_LABELS: Record<SowSourceType, string> = {
  salary: "Salary / Employment income",
  business_income: "Business income",
  investment: "Investment returns",
  inheritance: "Inheritance",
  property_sale: "Property sale proceeds",
  other: "Other",
};

const inputCls =
  "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand transition-colors";

const BLANK_FORM = {
  sourceType: "salary" as SowSourceType,
  estimatedAmountAed: "",
  supportingDocumentDescription: "",
  verifiedBy: "",
  sofVerified: false,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SowVerificationPanel({
  subjectId,
  riskLevel,
  isPep,
  onVerificationComplete,
}: SowVerificationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [data, setData] = useState<SowVerificationResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const requiresVerification = isPep || riskLevel === "high" || riskLevel === "critical";

  const fetchStatus = async () => {
    if (!subjectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cdd-review/sow-verify?subjectId=${encodeURIComponent(subjectId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Failed to load SOW records (HTTP ${res.status})`);
      }
      const json = await res.json() as SowVerificationResponse;
      if (mountedRef.current) setData(json);
    } catch (err) {
      if (mountedRef.current)
        setError(caughtErrorMessage(err, "Failed to load SOW records"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const amountNum = parseFloat(form.estimatedAmountAed);
    if (isNaN(amountNum) || amountNum < 0) {
      setSubmitError("Please enter a valid amount in AED");
      setSubmitLoading(false);
      return;
    }
    if (!form.supportingDocumentDescription.trim()) {
      setSubmitError("Supporting document description is required");
      setSubmitLoading(false);
      return;
    }
    if (!form.verifiedBy.trim()) {
      setSubmitError("Verified by name is required");
      setSubmitLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/cdd-review/sow-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId,
          sourceType: form.sourceType,
          estimatedAmountAed: amountNum,
          supportingDocumentDescription: form.supportingDocumentDescription.trim(),
          verifiedBy: form.verifiedBy.trim(),
          sofVerified: form.sofVerified,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Submission failed (HTTP ${res.status})`);
      }
      if (!mountedRef.current) return;
      setSubmitSuccess(true);
      setForm(BLANK_FORM);
      setFormOpen(false);
      await fetchStatus();
      onVerificationComplete?.();
    } catch (err) {
      if (mountedRef.current)
        setSubmitError(caughtErrorMessage(err, "Submission failed — please retry"));
    } finally {
      if (mountedRef.current) setSubmitLoading(false);
    }
  };

  // ── Status badge helpers ─────────────────────────────────────────────────

  const sowBadge = data?.sowVerified
    ? "bg-green-dim text-green border border-green/30"
    : "bg-red-dim text-red border border-red/30";

  const sofBadge = data?.sofVerified
    ? "bg-green-dim text-green border border-green/30"
    : "bg-amber-dim text-amber border border-amber/30";

  return (
    <div className="mt-3 border border-hair-2 rounded-lg overflow-hidden bg-bg-panel">
      {/* Header */}
      <div className="px-4 py-3 bg-bg-1 border-b border-hair-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-13 font-semibold text-ink-0">SOW / SOF Verification</span>
          <span className="font-mono text-9 px-1.5 py-px rounded bg-brand-dim text-brand-deep border border-brand/10">
            GAP 10 · MOE Circular 6/2025 §4.2
          </span>
          {loading && (
            <span className="text-10 text-ink-3 font-mono">loading…</span>
          )}
          {!loading && data && (
            <>
              <span className={`font-mono text-10 font-semibold px-1.5 py-px rounded uppercase ${sowBadge}`}>
                SOW: {data.sowVerified ? "verified" : "unverified"}
              </span>
              <span className={`font-mono text-10 font-semibold px-1.5 py-px rounded uppercase ${sofBadge}`}>
                SOF: {data.sofVerified ? "verified" : "pending"}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="text-11 font-medium px-2.5 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand hover:text-brand transition-colors"
        >
          {formOpen ? "Cancel" : "+ Add Evidence"}
        </button>
      </div>

      {/* Regulatory warning for PEP / high / critical */}
      {requiresVerification && (
        <div className="px-4 py-2.5 bg-red-dim border-b border-red/20 flex items-start gap-2">
          <span className="text-red shrink-0 text-14 font-bold">!</span>
          <p className="text-11 font-semibold text-red leading-relaxed">
            SOW verification REQUIRED before EDD completion (MOE Circular 6/2025 §4.2
            {isPep ? " · PEP status" : ""}
            {riskLevel === "high" || riskLevel === "critical"
              ? ` · ${riskLevel.toUpperCase()} risk level`
              : ""}
            )
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 bg-red-dim border-b border-red/20 text-11 text-red">
          ⚠ {error}{" "}
          <button
            type="button"
            className="underline hover:no-underline ml-1"
            onClick={() => void fetchStatus()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Existing records */}
      {!loading && data && data.records.length > 0 && (
        <div className="divide-y divide-hair">
          {data.records.map((rec) => (
            <div
              key={rec.id}
              className="px-4 py-2.5 flex flex-wrap items-start gap-3 text-11"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink-0">
                    {SOURCE_TYPE_LABELS[rec.sourceType] ?? rec.sourceType}
                  </span>
                  {rec.estimatedAmountAed > 0 && (
                    <span className="font-mono text-10 text-ink-2">
                      AED {rec.estimatedAmountAed.toLocaleString("en-GB")}
                    </span>
                  )}
                  {rec.sofVerified && (
                    <span className="font-mono text-9 px-1.5 py-px rounded bg-green-dim text-green border border-green/20">
                      SOF confirmed
                    </span>
                  )}
                </div>
                <p className="text-10 text-ink-3 mt-0.5">
                  {rec.supportingDocumentDescription}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-10 font-semibold text-ink-1">
                  {rec.verifiedBy}
                </div>
                <div className="font-mono text-9 text-ink-3">
                  {new Date(rec.verifiedAt).toLocaleDateString("en-GB")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && data && data.records.length === 0 && !formOpen && (
        <div className="px-4 py-4 text-center text-11 text-ink-3">
          No SOW evidence recorded yet.{" "}
          <button
            type="button"
            className="text-brand underline hover:no-underline"
            onClick={() => setFormOpen(true)}
          >
            Add evidence
          </button>
          .
        </div>
      )}

      {/* Add evidence form */}
      {formOpen && (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-4 space-y-3 border-t border-hair-2 bg-bg-0">
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2">
            Add SOW Evidence
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Source Type <span className="text-red">*</span>
              </label>
              <select
                value={form.sourceType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceType: e.target.value as SowSourceType }))
                }
                className={inputCls}
              >
                {(Object.entries(SOURCE_TYPE_LABELS) as [SowSourceType, string][]).map(
                  ([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Estimated Amount (AED) <span className="text-red">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.estimatedAmountAed}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estimatedAmountAed: e.target.value }))
                }
                placeholder="e.g. 500000"
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Supporting Document Description <span className="text-red">*</span>
              </label>
              <input
                type="text"
                value={form.supportingDocumentDescription}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    supportingDocumentDescription: e.target.value,
                  }))
                }
                placeholder="e.g. 6 months payslips + employment letter dated 01/05/2026"
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
                Verified By <span className="text-red">*</span>
              </label>
              <input
                type="text"
                value={form.verifiedBy}
                onChange={(e) =>
                  setForm((f) => ({ ...f, verifiedBy: e.target.value }))
                }
                placeholder="Compliance officer name"
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1 justify-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-11 text-ink-2">
                <input
                  type="checkbox"
                  checked={form.sofVerified}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sofVerified: e.target.checked }))
                  }
                  className="accent-brand w-3.5 h-3.5"
                />
                Source of Funds (SOF) also confirmed
              </label>
            </div>
          </div>

          {submitError && (
            <div className="text-11 text-red bg-red-dim rounded px-3 py-2 border border-red/20">
              ⚠ {submitError}
            </div>
          )}

          {submitSuccess && (
            <div className="text-11 text-green bg-green-dim rounded px-3 py-2 border border-green/20">
              ✓ SOW evidence recorded successfully.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitLoading}
              className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white border border-brand hover:bg-brand/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {submitLoading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Evidence"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setSubmitError(null);
              }}
              className="text-11 font-medium px-2.5 py-1.5 rounded border border-hair-2 text-ink-3 hover:text-red hover:border-red/40 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Footer regulatory note */}
      <div className="px-4 py-2 bg-bg-1 border-t border-hair-2">
        <p className="text-9 font-mono text-ink-3">
          CBUAE Rulebook §6.4 · MOE Circular 6/2025 §4.2 · Federal Decree-Law No. 10 of 2025 Art.14
        </p>
      </div>
    </div>
  );
}
