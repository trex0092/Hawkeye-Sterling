"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import type { RiskAppetiteConfig } from "@/lib/server/risk-appetite";

// ── Badge ──────────────────────────────────────────────────────────────────────

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const colors: Record<string, string> = {
    default: "bg-zinc-800/40 text-zinc-300",
    green: "bg-emerald-950/30 text-emerald-300",
    amber: "bg-amber-950/30 text-amber-300",
    red: "bg-red-950/30 text-red-300",
    blue: "bg-sky-950/30 text-sky-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colors[tone] ?? colors["default"]}`}
    >
      {children}
    </span>
  );
}

// ── Section heading helper ─────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

// ── Number input helper ────────────────────────────────────────────────────────

function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (_v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  const inputCls =
    "border border-hair-2 rounded px-3 py-1.5 text-sm bg-bg-panel text-ink-0 w-28 focus:outline-none focus:ring-2 focus:ring-brand/40";
  return (
    <div>
      <label className="block text-xs font-medium text-ink-3 mb-1">
        {label}
      </label>
      <input
        type="number"
        className={inputCls}
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint && <p className="text-xs text-ink-3 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Form shape that mirrors RiskAppetiteConfig ─────────────────────────────────

interface FormState {
  autoApprove: number;
  reviewRequired: number;
  autoEscalate: number;
  retailMultiplier: number;
  corporateMultiplier: number;
  pepMultiplier: number;
  highRiskMultiplier: number;
  adverseMediaWeight: number;
  sanctionsWeight: number;
  pepWeight: number;
}

function configToForm(c: RiskAppetiteConfig): FormState {
  return {
    autoApprove: c.thresholds.autoApprove,
    reviewRequired: c.thresholds.reviewRequired,
    autoEscalate: c.thresholds.autoEscalate,
    retailMultiplier: c.customerSegments.retail.multiplier,
    corporateMultiplier: c.customerSegments.corporate.multiplier,
    pepMultiplier: c.customerSegments.pep.multiplier,
    highRiskMultiplier: c.customerSegments.highRisk.multiplier,
    adverseMediaWeight: c.adverseMediaWeight,
    sanctionsWeight: c.sanctionsWeight,
    pepWeight: c.pepWeight,
  };
}

function formToBody(f: FormState, tenantId: string): object {
  return {
    tenantId,
    thresholds: {
      autoApprove: f.autoApprove,
      reviewRequired: f.reviewRequired,
      autoEscalate: f.autoEscalate,
    },
    customerSegments: {
      retail:    { multiplier: f.retailMultiplier },
      corporate: { multiplier: f.corporateMultiplier },
      pep:       { multiplier: f.pepMultiplier },
      highRisk:  { multiplier: f.highRiskMultiplier },
    },
    adverseMediaWeight: f.adverseMediaWeight,
    sanctionsWeight: f.sanctionsWeight,
    pepWeight: f.pepWeight,
  };
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RiskAppetitePage() {
  const [config, setConfig] = useState<RiskAppetiteConfig | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/risk-appetite");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; config?: RiskAppetiteConfig; error?: string };
      if (data.ok && data.config) {
        setConfig(data.config);
        setForm(configToForm(data.config));
      } else {
        setFetchError(data.error ?? "Failed to load configuration");
      }
    } catch (err) {
      setFetchError(caughtErrorMessage(err, "Network error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    if (!form || !config) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/risk-appetite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToBody(form, config.tenantId)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; config?: RiskAppetiteConfig; error?: string };
      if (data.ok && data.config) {
        setConfig(data.config);
        setForm(configToForm(data.config));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setSaveError(data.error ?? "Save failed");
      }
    } catch (err) {
      setSaveError(caughtErrorMessage(err, "Network error"));
    } finally {
      setSaving(false);
    }
  };

  function patch(partial: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  const weightSum = form
    ? +(form.adverseMediaWeight + form.sanctionsWeight + form.pepWeight).toFixed(4)
    : 0;

  return (
    <ModuleLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold ">Risk Appetite Matrix</h1>
          <p className="text-sm text-ink-3 mt-1">
            Configure the scoring thresholds, customer-segment multipliers, and signal weights
            that drive automated compliance decisions.
          </p>
        </div>

        {loading && (
          <div className="text-sm text-ink-3 py-12 text-center">
            Loading configuration…
          </div>
        )}

        {fetchError && (
          <div className="rounded-lg bg-red-950/30 border border-red-500/40 px-4 py-3 text-sm text-red-300">
            {fetchError}
          </div>
        )}

        {!loading && form && config && (
          <div className="space-y-8">
            {/* ── Decision Thresholds ────────────────────────────────────────── */}
            <section className="rounded-xl border border-hair-2 p-5">
              <SectionHeading>Decision Thresholds</SectionHeading>
              <p className="text-xs text-ink-3 mb-4">
                Scores are integers (0–100+). Must be strictly ascending:
                auto-approve &lt; review-required &lt; auto-escalate.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <NumInput
                  label="Auto-approve (≤)"
                  value={form.autoApprove}
                  onChange={(v) => patch({ autoApprove: v })}
                  min={0}
                  hint="Score ≤ this → auto-clear"
                />
                <NumInput
                  label="Review required (≤)"
                  value={form.reviewRequired}
                  onChange={(v) => patch({ reviewRequired: v })}
                  min={0}
                  hint="Score ≤ this → MLRO review"
                />
                <NumInput
                  label="Auto-escalate (>)"
                  value={form.autoEscalate}
                  onChange={(v) => patch({ autoEscalate: v })}
                  min={0}
                  hint="Score above this → escalate"
                />
              </div>

              {/* Effective thresholds visual */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <span>Effective ranges:</span>
                <Badge tone="green">0 – {form.autoApprove} → Auto-clear</Badge>
                <Badge tone="amber">{form.autoApprove + 1} – {form.reviewRequired} → MLRO review</Badge>
                <Badge tone="red">{form.autoEscalate + 1}+ → Auto-escalate</Badge>
              </div>
            </section>

            {/* ── Customer Segment Multipliers ───────────────────────────────── */}
            <section className="rounded-xl border border-hair-2 p-5">
              <SectionHeading>Customer Segment Multipliers</SectionHeading>
              <p className="text-xs text-ink-3 mb-4">
                Base score is multiplied by the segment factor before threshold
                comparison. Values ≥ 0.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <NumInput
                  label="Retail"
                  value={form.retailMultiplier}
                  onChange={(v) => patch({ retailMultiplier: v })}
                  min={0}
                  step={0.1}
                />
                <NumInput
                  label="Corporate"
                  value={form.corporateMultiplier}
                  onChange={(v) => patch({ corporateMultiplier: v })}
                  min={0}
                  step={0.1}
                />
                <NumInput
                  label="PEP"
                  value={form.pepMultiplier}
                  onChange={(v) => patch({ pepMultiplier: v })}
                  min={0}
                  step={0.1}
                />
                <NumInput
                  label="High-Risk"
                  value={form.highRiskMultiplier}
                  onChange={(v) => patch({ highRiskMultiplier: v })}
                  min={0}
                  step={0.1}
                />
              </div>
            </section>

            {/* ── Signal Weights ─────────────────────────────────────────────── */}
            <section className="rounded-xl border border-hair-2 p-5">
              <SectionHeading>Signal Weights</SectionHeading>
              <p className="text-xs text-ink-3 mb-4">
                Each weight is 0 – 1. Sum must be ≤ 1.0.
                {" "}Current sum:{" "}
                <span className={weightSum > 1.0 ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                  {weightSum.toFixed(2)}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-4">
                <NumInput
                  label="Adverse media weight"
                  value={form.adverseMediaWeight}
                  onChange={(v) => patch({ adverseMediaWeight: v })}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <NumInput
                  label="Sanctions weight"
                  value={form.sanctionsWeight}
                  onChange={(v) => patch({ sanctionsWeight: v })}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <NumInput
                  label="PEP weight"
                  value={form.pepWeight}
                  onChange={(v) => patch({ pepWeight: v })}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>
            </section>

            {/* ── Metadata ───────────────────────────────────────────────────── */}
            {config.updatedAt && config.updatedAt !== new Date(0).toISOString() && (
              <p className="text-xs text-ink-3">
                Last updated: {new Date(config.updatedAt).toLocaleString()} by{" "}
                <span className="font-mono">{config.updatedBy}</span>
              </p>
            )}

            {saveError && (
              <div className="rounded-lg bg-red-950/30 border border-red-500/40 px-4 py-3 text-sm text-red-300">
                {saveError}
              </div>
            )}

            {saved && (
              <div className="rounded-lg bg-emerald-950/30 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-300">
                Configuration saved successfully.
              </div>
            )}

            {/* ── Save button ─────────────────────────────────────────────────── */}
            <div className="flex justify-end">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-5 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save configuration"}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
