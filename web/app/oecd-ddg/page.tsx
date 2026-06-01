"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import type { OecdDdgRecord } from "@/lib/server/oecd-ddg";

// OECD 5-Step Due Diligence Guidance — Responsible Supply Chains
// Required for UAE gold refiners handling conflict-mineral supply chains
// under Ministerial Decree 68/2024 and OECD DDG for CAHRA Minerals.

const STEP_META = [
  {
    n: 1 as const,
    title: "Management Systems",
    legalRef: "OECD DDG Step 1",
    fields: ["hasWrittenPolicy", "seniorAccountabilityDesignated", "grievanceMechanismEstablished", "budgetAllocated"],
    labels: ["Written supply chain policy adopted", "Senior accountability designated", "Grievance mechanism established", "Budget allocated for DD activities"],
  },
  {
    n: 2 as const,
    title: "Risk Identification",
    legalRef: "OECD DDG Step 2 · CAHRA",
    fields: ["supplyChainMapped", "mineOfOriginDocumented"],
    labels: ["Supply chain mapped to source", "Mine of origin documented"],
    hasJurisdictions: true,
    hasRedFlags: true,
  },
  {
    n: 3 as const,
    title: "Risk Response",
    legalRef: "OECD DDG Step 3",
    fields: ["riskMitigationPlanExists", "nonCompliantSourcesRejected", "enhancedDdApplied"],
    labels: ["Risk mitigation plan exists", "Non-compliant sources rejected", "Enhanced DD applied where needed"],
  },
  {
    n: 4 as const,
    title: "Independent Audit",
    legalRef: "OECD DDG Step 4 · RMAP",
    fields: ["auditConducted"],
    labels: ["Third-party audit conducted"],
    hasAuditFields: true,
  },
  {
    n: 5 as const,
    title: "Annual Report",
    legalRef: "OECD DDG Step 5",
    fields: ["publicDisclosureMade", "sourcingLocationsReported", "remediationActionsReported"],
    labels: ["Public disclosure made", "Sourcing locations reported", "Remediation actions reported"],
    hasReportUrl: true,
  },
];

const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (_v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-12 text-ink-1 cursor-pointer">
      <button type="button" onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${checked ? "bg-green" : "bg-bg-2 border border-hair-2"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

type StepCompletion = { step: number; completed: number; total: number; pct: number };

function computeLocalCompletion(record: OecdDdgRecord): StepCompletion[] {
  const s1 = record.step1;
  const s1Vals = [s1.hasWrittenPolicy, s1.seniorAccountabilityDesignated, s1.grievanceMechanismEstablished, s1.budgetAllocated];
  const s2 = record.step2;
  const s2Vals = [s2.supplyChainMapped, s2.cahraJurisdictionsIdentified.length > 0, s2.mineOfOriginDocumented];
  const s3 = record.step3;
  const s3Vals = [s3.riskMitigationPlanExists, s3.nonCompliantSourcesRejected, s3.enhancedDdApplied];
  const s4 = record.step4;
  const s4Vals = [s4.auditConducted, Boolean(s4.auditorName), Boolean(s4.auditDate)];
  const s5 = record.step5;
  const s5Vals = [s5.publicDisclosureMade, s5.sourcingLocationsReported, s5.remediationActionsReported];

  return [s1Vals, s2Vals, s3Vals, s4Vals, s5Vals].map((vals, i) => {
    const completed = vals.filter(Boolean).length;
    return { step: i + 1, completed, total: vals.length, pct: Math.round((completed / vals.length) * 100) };
  });
}

function overallPct(compl: StepCompletion[]): number {
  const total = compl.reduce((a, c) => a + c.total, 0);
  const done = compl.reduce((a, c) => a + c.completed, 0);
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export default function OecdDdgPage() {
  const [records, setRecords] = useState<OecdDdgRecord[]>([]);
  const [selected, setSelected] = useState<OecdDdgRecord | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newYear, setNewYear] = useState<string>(String(new Date().getFullYear()));
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/oecd-ddg");
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as { ok: boolean; records: OecdDdgRecord[] };
        if (!mountedRef.current) return;
        if (data.ok) setRecords(data.records);
      }
    } catch (err) {
      console.warn("[hawkeye] oecd-ddg load failed:", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const createRecord = async () => {
    const year = parseInt(newYear, 10);
    if (!year || year < 2000 || year > 2100) return;
    try {
      const res = await fetch("/api/oecd-ddg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportingYear: year }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as { ok: boolean; record: OecdDdgRecord };
        if (!mountedRef.current) return;
        if (data.ok) {
          setRecords((prev) => [data.record, ...prev]);
          setSelected(data.record);
        }
      }
    } catch (err) {
      console.error("[hawkeye] oecd-ddg create failed:", err);
    }
  };

  const patchRecord = useCallback(async (id: string, patch: object) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/oecd-ddg/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as { ok: boolean; record: OecdDdgRecord };
        if (!mountedRef.current) return;
        if (data.ok) {
          setRecords((prev) => prev.map((r) => (r.id === id ? data.record : r)));
          setSelected(data.record);
        }
      }
    } catch (err) {
      console.error("[hawkeye] oecd-ddg patch failed:", err);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, []);

  const updateStep = useCallback((stepKey: string, patch: object) => {
    if (!selected) return;
    const existing = (selected[stepKey as keyof OecdDdgRecord] as object) ?? {};
    const merged = { ...existing, ...patch };
    setSelected((prev) => prev ? { ...prev, [stepKey]: merged } : prev);
    void patchRecord(selected.id, { [stepKey]: merged });
  }, [selected, patchRecord]);

  const statusTone = (s: OecdDdgRecord["status"]) =>
    s === "completed" ? "bg-green-dim text-green" : s === "under_review" ? "bg-amber-dim text-amber" : "bg-blue-dim text-blue";

  if (loading) return <div className="p-8 text-12 text-ink-3">Loading…</div>;

  return (
    <ModuleLayout asanaModule="oecd-ddg" asanaLabel="OECD 5-Step DDG" engineLabel="Supply chain due diligence engine">
      <ModuleHero
        eyebrow="OECD DDG"
        title="OECD 5-step due diligence"
        titleEm="assessments."
        kpis={[
          { value: String(records.length), label: "assessments" },
          { value: String(records.filter((r) => r.status === "completed").length), label: "completed" },
          { value: String(records.filter((r) => r.status === "in_progress").length), label: "in progress", tone: "amber" },
        ]}
        intro={
          <>
            <strong>OECD DDG for Responsible Mineral Supply Chains.</strong>{" "}
            5-step framework for entities sourcing from Conflict-Affected and High-Risk Areas (CAHRAs).
            Required under Ministerial Decree 68/2024. Each assessment tracks management systems,
            risk identification, risk response, independent audit, and annual reporting.
          </>
        }
      />
      <ModuleFamilyBar suiteName="Supply Chain & Responsible Sourcing" modules={[
        { label: "Supply Chain Risk", href: "/supply-chain", icon: "🔗" },
        { label: "RMI / RMAP", href: "/rmi", icon: "🏭" },
        { label: "Responsible Sourcing", href: "/responsible-sourcing", icon: "⛏️" },
        { label: "OECD DDG", href: "/oecd-ddg", icon: "📋" },
        { label: "RMAP Database", href: "/rmap", icon: "🗄️" },
        { label: "LBMA Gold", href: "/lbma", icon: "🥇" },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: record list */}
        <div className="lg:col-span-1">
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-hair-2 flex items-center justify-between gap-2">
              <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 font-semibold">Assessments</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  className="w-20 text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono"
                  placeholder="Year"
                  min={2020}
                  max={2030}
                />
                <button
                  type="button"
                  onClick={() => void createRecord()}
                  className="px-3 py-1 text-11 font-semibold rounded border border-brand/40 bg-brand-dim text-brand hover:bg-brand/20"
                >
                  + New
                </button>
              </div>
            </div>
            {records.length === 0 ? (
              <div className="px-4 py-6 text-12 text-ink-3 text-center">No assessments yet. Create one above.</div>
            ) : (
              <ul className="divide-y divide-hair">
                {records.map((r) => {
                  const compl = computeLocalCompletion(r);
                  const pct = overallPct(compl);
                  const isActive = selected?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => { setSelected(r); setActiveStep(1); }}
                        className={`w-full text-left px-4 py-3 hover:bg-bg-1 transition-colors ${isActive ? "bg-brand-dim" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-13 font-semibold text-ink-0">{r.reportingYear}</span>
                          <span className={`px-1.5 py-px rounded font-mono text-10 font-semibold uppercase ${statusTone(r.status)}`}>
                            {r.status.replace("_", " ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-bg-2 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct === 100 ? "bg-green" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-10 font-mono text-ink-3 shrink-0">{pct}%</span>
                        </div>
                        <div className="text-10 text-ink-3 font-mono mt-0.5">{r.id}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right: detail view */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-8 text-center text-12 text-ink-3">
              Select an assessment or create a new one.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header */}
              <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-14 font-semibold text-ink-0">Assessment {selected.reportingYear}</div>
                    <div className="text-10 font-mono text-ink-3">{selected.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {saving && <span className="text-10 text-ink-3 font-mono">Saving…</span>}
                    <select
                      value={selected.status}
                      onChange={(e) => void patchRecord(selected.id, { status: e.target.value })}
                      className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0"
                    >
                      <option value="in_progress">In progress</option>
                      <option value="under_review">Under review</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
                {/* Overall progress */}
                {(() => {
                  const compl = computeLocalCompletion(selected);
                  const pct = overallPct(compl);
                  return (
                    <div>
                      <div className="flex items-center justify-between text-10 font-mono text-ink-3 mb-1">
                        <span>Overall progress</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-bg-2 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex gap-2">
                        {compl.map((c) => (
                          <div key={c.step} className="flex-1 text-center">
                            <div className={`h-1 rounded-full ${c.pct === 100 ? "bg-green" : c.pct > 0 ? "bg-brand" : "bg-bg-2"}`} />
                            <div className="text-10 font-mono text-ink-3 mt-0.5">S{c.step}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Step accordions */}
              {STEP_META.map((step) => {
                const stepKey = `step${step.n}` as keyof OecdDdgRecord;
                const s = selected[stepKey] as Record<string, unknown>;
                const isActive = activeStep === step.n;
                const compl = computeLocalCompletion(selected);
                const stepCompl = compl[step.n - 1];

                return (
                  <div key={step.n} className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setActiveStep(isActive ? 0 : step.n)}
                      className={`w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-bg-2 transition-colors ${isActive ? "bg-brand-dim border-b border-brand/20" : ""}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-12 font-bold shrink-0 ${stepCompl?.pct === 100 ? "bg-green text-white" : "bg-bg-2 border border-hair-2 text-ink-2"}`}>
                        {stepCompl?.pct === 100 ? "✓" : step.n}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-13 font-semibold text-ink-0">Step {step.n}: {step.title}</div>
                        <div className="text-10 text-ink-3 font-mono">{step.legalRef}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-10 font-mono text-ink-3">{stepCompl?.completed}/{stepCompl?.total}</span>
                        <span className="text-ink-3 font-mono text-12">{isActive ? "▾" : "▸"}</span>
                      </div>
                    </button>

                    {isActive && (
                      <div className="px-5 py-5 space-y-3">
                        {/* Boolean toggles */}
                        {step.fields.map((field, idx) => (
                          <Toggle
                            key={field}
                            checked={Boolean(s[field])}
                            onChange={(v) => updateStep(stepKey, { [field]: v })}
                            label={step.labels[idx] ?? field}
                          />
                        ))}

                        {/* Step 2: CAHRA jurisdictions */}
                        {"hasJurisdictions" in step && step.hasJurisdictions && (
                          <div>
                            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                              CAHRA jurisdictions identified (country codes, comma-separated)
                            </label>
                            <input
                              value={(s["cahraJurisdictionsIdentified"] as string[] | undefined ?? []).join(", ")}
                              onChange={(e) => updateStep(stepKey, {
                                cahraJurisdictionsIdentified: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
                              })}
                              className={inputCls}
                              placeholder="CD, AF, ML, SS…"
                            />
                            {((s["cahraJurisdictionsIdentified"] as string[]) ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {((s["cahraJurisdictionsIdentified"] as string[]) ?? []).map((j) => (
                                  <span key={j} className="px-1.5 py-px bg-red-dim text-red font-mono text-10 rounded-sm font-semibold">{j}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Step 4: audit fields */}
                        {"hasAuditFields" in step && step.hasAuditFields && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Auditor name</label>
                              <input value={String(s["auditorName"] ?? "")} onChange={(e) => updateStep(stepKey, { auditorName: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Audit date</label>
                              <input type="date" value={String(s["auditDate"] ?? "")} onChange={(e) => updateStep(stepKey, { auditDate: e.target.value })} className={inputCls} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Audit findings</label>
                              <textarea value={String(s["auditFindings"] ?? "")} onChange={(e) => updateStep(stepKey, { auditFindings: e.target.value })} rows={2} className={`${inputCls} resize-y`} />
                            </div>
                          </div>
                        )}

                        {/* Step 5: report URL */}
                        {"hasReportUrl" in step && step.hasReportUrl && (
                          <div>
                            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Report URL (public disclosure)</label>
                            <input value={String(s["reportUrl"] ?? "")} onChange={(e) => updateStep(stepKey, { reportUrl: e.target.value })} className={inputCls} placeholder="https://…" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="text-10.5 text-ink-3 mt-6 leading-relaxed">
        OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from CAHRAs.
        Ministerial Decree 68/2024 · FDL 10/2025. Steps: (1) Management Systems (2) Risk Identification
        (3) Risk Response (4) Independent Audit (5) Annual Report. Changes auto-save.
      </p>
    </ModuleLayout>
  );
}
