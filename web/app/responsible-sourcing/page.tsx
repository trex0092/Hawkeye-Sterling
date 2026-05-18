"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { IsoDateInput } from "@/components/ui/IsoDateInput";
import type { ResponsibleSourcingState } from "@/app/api/responsible-sourcing/route";

// Responsible Sourcing — Ministerial Decree 68/2024
// UAE gold refiners must follow the OECD 5-Step Due Diligence Guidance (DDG)
// for Responsible Supply Chains from Conflict-Affected and High-Risk Areas.
// This module provides the structured documentation workflow required by MD 68/2024.
// For AI risk assessment, see the /rmi module (RMAP smelter audit tracker).

const STORAGE_KEY = "hawkeye.responsible-sourcing.v1";

const OECD_STEPS = [
  {
    n: 1 as const,
    title: "Management Systems",
    icon: "🏛️",
    legalRef: "OECD DDG Step 1 · MD 68/2024",
    description: "Establish strong management systems: adopt a supply chain policy, set up a grievance mechanism, integrate OECD due diligence into supplier contracts, and create a record-keeping system.",
    requiredEvidence: ["Board-approved supply chain policy", "Grievance mechanism (hotline/email/committee)", "Supplier contract provisions referencing OECD DDG", "Internal audit procedure", "Record-keeping system (≥10 years per FDL)"],
  },
  {
    n: 2 as const,
    title: "Risk Identification",
    icon: "🔍",
    legalRef: "OECD DDG Step 2 · MD 68/2024",
    description: "Identify and assess risks in the supply chain. Map supply chains to source, identify CAHRA-origin material, collect smelter/refiner data, apply red-flag indicators from OECD DDG Annex II.",
    requiredEvidence: ["Complete supply chain map to origin", "List of source countries with CAHRA classification", "Smelter/refiner inventory with RMAP status", "OECD Annex II red flag assessment", "Country-specific risk assessment for CAHRA jurisdictions"],
  },
  {
    n: 3 as const,
    title: "Risk Mitigation Strategy",
    icon: "🛡️",
    legalRef: "OECD DDG Step 3 · MD 68/2024",
    description: "Design and implement a strategy to respond to identified risks. Engage suppliers, suspend or terminate where necessary, and escalate to senior management for material risks.",
    requiredEvidence: ["Written risk mitigation strategy document", "Supplier engagement correspondence records", "Escalation report to senior management (where applicable)", "Suspension/termination records for high-risk suppliers", "Monitoring and review schedule"],
  },
  {
    n: 4 as const,
    title: "Third-Party Audit",
    icon: "📋",
    legalRef: "OECD DDG Step 4 · MD 68/2024 · RMAP",
    description: "Carry out independent third-party audit of smelter/refiner due diligence practices. Audits must cover all minerals and be conducted by an accredited body (RMAP, LBMA Good Delivery).",
    requiredEvidence: ["Signed audit engagement letter", "RMAP-accredited auditor credentials", "Audit report with findings", "Corrective action plan for critical findings", "RMAP conformance certificate or audit status"],
  },
  {
    n: 5 as const,
    title: "Annual Report",
    icon: "📄",
    legalRef: "OECD DDG Step 5 · MD 68/2024",
    description: "Report annually on supply chain due diligence. Disclose policy, risk findings, mitigation actions, and audit outcomes. Submit to MoE and/or DMCC as required by MD 68/2024.",
    requiredEvidence: ["Annual responsible sourcing report (public or regulatory)", "MoE submission confirmation", "DMCC submission confirmation (if applicable)", "Board approval of annual report", "Disclosure of CAHRA sourcing and mitigation actions"],
  },
];

const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
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

function StepProgress({ step, state }: { step: typeof OECD_STEPS[0]; state: ResponsibleSourcingState }) {
  const s = state[`step${step.n}` as keyof ResponsibleSourcingState] as ResponsibleSourcingState["step1"] | undefined;
  const completed = s?.completed ?? false;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${completed ? "bg-green-dim border-green/30" : "bg-bg-panel border-hair-2"}`}>
      <span className="text-18 shrink-0">{step.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-12 font-semibold text-ink-0">Step {step.n}: {step.title}</div>
        <div className="text-10 text-ink-3 font-mono">{step.legalRef}</div>
      </div>
      <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase shrink-0 ${completed ? "bg-green-dim text-green border border-green/30" : "bg-bg-2 text-ink-3 border border-hair"}`}>
        {completed ? "Complete" : "Pending"}
      </span>
    </div>
  );
}

export default function ResponsibleSourcingPage() {
  const [workflow, setWorkflow] = useState<ResponsibleSourcingState | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadWorkflow = useCallback(async () => {
    try {
      const res = await fetch("/api/responsible-sourcing");
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; workflow: ResponsibleSourcingState };
        if (!mountedRef.current) return;
        if (data.ok) { setWorkflow(data.workflow); return; }
      }
    } catch (err) { console.warn("[hawkeye] responsible-sourcing server load failed — falling back to localStorage:", err); }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && mountedRef.current) setWorkflow(JSON.parse(raw) as ResponsibleSourcingState);
    } catch (err) { console.warn("[hawkeye] responsible-sourcing localStorage parse failed:", err); }
  }, []);

  useEffect(() => { void loadWorkflow(); }, [loadWorkflow]);

  const autosave = useCallback(async (updated: ResponsibleSourcingState) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch (err) { console.warn("[hawkeye] responsible-sourcing localStorage persist failed:", err); }
    setSaving(true);
    try {
      const res = await fetch("/api/responsible-sourcing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(updated) });
      if (!mountedRef.current) return;
      if (res.ok) setLastSaved(new Date());
      else console.error(`[hawkeye] responsible-sourcing autosave HTTP ${res.status}`);
    } catch (err) { console.error("[hawkeye] responsible-sourcing autosave threw:", err); }
    finally { if (mountedRef.current) setSaving(false); }
  }, []);

  const update = useCallback(<K extends keyof ResponsibleSourcingState>(key: K, value: ResponsibleSourcingState[K]) => {
    setWorkflow((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      void autosave(next);
      return next;
    });
  }, [autosave]);

  const updateStep = useCallback((stepKey: string, patch: object) => {
    setWorkflow((prev) => {
      if (!prev) return prev;
      const existing = (prev[stepKey as keyof ResponsibleSourcingState] ?? {}) as object;
      const next = { ...prev, [stepKey]: { ...existing, ...patch } };
      void autosave(next);
      return next;
    });
  }, [autosave]);

  if (!workflow) return <div className="p-8 text-12 text-ink-3">Loading workflow…</div>;

  const completedSteps = [workflow.step1, workflow.step2, workflow.step3, workflow.step4, workflow.step5].filter((s) => s?.completed).length;
  const progressPct = Math.round((completedSteps / 5) * 100);
  const isComplete = completedSteps === 5;

  return (
    <ModuleLayout asanaModule="responsible-sourcing" asanaLabel="Responsible Sourcing MD 68/2024" engineLabel="Responsible sourcing engine">
      <ModuleHero

        eyebrow="Module 54 · Responsible Sourcing"
        title="OECD 5-step due diligence"
        titleEm="workflow."
        kpis={[
          { value: `${completedSteps}/5`, label: "steps complete", tone: completedSteps < 5 ? "amber" : undefined },
          { value: `${progressPct}%`, label: "progress", tone: progressPct < 100 ? "amber" : undefined },
          { value: workflow.overallStatus === "complete" ? "Complete" : workflow.overallStatus === "in-progress" ? "In progress" : "Not started", label: "status", tone: workflow.overallStatus !== "complete" ? "amber" : undefined },
        ]}
        intro={
          <>
            <strong>Ministerial Decree 68/2024 · OECD DDG for Conflict Minerals.</strong>{" "}
            UAE gold refiners must follow the 5-step OECD Due Diligence Guidance for Responsible Supply Chains
            from Conflict-Affected and High-Risk Areas (CAHRAs). Each step requires specific evidence and documentation.
            For AI-powered smelter risk assessment, see the{" "}
            <a href="/rmi" className="text-brand underline">RMAP / RMI module</a>.
          </>
        }
      />

      {/* Entity setup */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-6">
        <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 font-semibold mb-3">Entity details</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Entity / refinery name</label>
            <input value={workflow.entityName} onChange={(e) => update("entityName", e.target.value)} className={inputCls} /></div>
          <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Reporting year</label>
            <input value={workflow.reportingYear} onChange={(e) => update("reportingYear", e.target.value)} className={inputCls} placeholder={new Date().getFullYear().toString()} /></div>
          <div className="flex items-end gap-2">
            {saving && <span className="text-10 text-ink-3 font-mono">Saving…</span>}
            {lastSaved && !saving && <span className="text-10 text-ink-3 font-mono">Saved {lastSaved.toLocaleTimeString()}</span>}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="h-2 bg-bg-2 rounded-full overflow-hidden mb-1">
          <div className={`h-full rounded-full transition-all ${isComplete ? "bg-green" : "bg-brand"}`} style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {OECD_STEPS.map((step) => <StepProgress key={step.n} step={step} state={workflow} />)}
        </div>
      </div>

      {/* Step accordion */}
      <div className="space-y-3">
        {OECD_STEPS.map((step) => {
          const stepKey = `step${step.n}` as keyof ResponsibleSourcingState;
          const s = workflow[stepKey] as ResponsibleSourcingState["step1"] & ResponsibleSourcingState["step2"] & ResponsibleSourcingState["step3"] & ResponsibleSourcingState["step4"] & ResponsibleSourcingState["step5"];
          const isActive = activeStep === step.n;

          return (
            <div key={step.n} className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setActiveStep(isActive ? 0 : step.n)}
                className={`w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-bg-2 transition-colors ${isActive ? "bg-brand-dim border-b border-brand/20" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-12 font-bold shrink-0 ${s?.completed ? "bg-green text-white" : "bg-bg-2 border border-hair-2 text-ink-2"}`}>
                  {s?.completed ? "✓" : step.n}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-13 font-semibold text-ink-0">{step.icon} Step {step.n}: {step.title}</div>
                  <div className="text-10 text-ink-3 font-mono">{step.legalRef}</div>
                </div>
                <span className="text-ink-3 font-mono text-12 shrink-0">{isActive ? "▾" : "▸"}</span>
              </button>

              {isActive && (
                <div className="px-5 py-5 space-y-4">
                  <p className="text-12 text-ink-2 leading-relaxed border-l-2 border-brand pl-3">{step.description}</p>

                  {/* Required evidence checklist */}
                  <div>
                    <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 font-semibold mb-2">Required evidence</div>
                    <ul className="space-y-1">
                      {step.requiredEvidence.map((ev) => (
                        <li key={ev} className="flex items-start gap-2 text-11 text-ink-1">
                          <span className="text-brand mt-0.5 shrink-0">▸</span> {ev}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Step 1 fields */}
                  {step.n === 1 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Supply chain policy date</label>
                          <IsoDateInput value={s.supplyChainPolicyDate} onChange={(iso) => updateStep(stepKey, { supplyChainPolicyDate: iso })} className={inputCls} /></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Grievance mechanism type</label>
                          <select value={s.grievanceMechanismType} onChange={(e) => updateStep(stepKey, { grievanceMechanismType: e.target.value })} className={inputCls}>
                            <option value="">— Select —</option>
                            <option value="hotline">Hotline</option>
                            <option value="email">Email channel</option>
                            <option value="committee">Committee</option>
                            <option value="other">Other</option>
                          </select></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Record-keeping period (years)</label>
                          <input type="number" value={s.recordKeepingPeriodYears} onChange={(e) => updateStep(stepKey, { recordKeepingPeriodYears: parseInt(e.target.value, 10) || 10 })} className={inputCls} /></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Toggle checked={s.supplyChainPolicyExists} onChange={(v) => updateStep(stepKey, { supplyChainPolicyExists: v })} label="Supply chain policy exists and is board-approved" />
                        <Toggle checked={s.grievanceMechanismExists} onChange={(v) => updateStep(stepKey, { grievanceMechanismExists: v })} label="Grievance mechanism is operational and documented" />
                        <Toggle checked={s.contractualProvisions} onChange={(v) => updateStep(stepKey, { contractualProvisions: v })} label="Supplier contracts include OECD DDG provisions" />
                        <Toggle checked={s.internalAuditProcedure} onChange={(v) => updateStep(stepKey, { internalAuditProcedure: v })} label="Internal audit procedure for supply chain DD" />
                      </div>
                    </div>
                  )}

                  {/* Step 2 fields */}
                  {step.n === 2 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Smelters identified</label>
                          <input type="number" value={s.smeltersIdentified} onChange={(e) => updateStep(stepKey, { smeltersIdentified: parseInt(e.target.value, 10) || 0 })} className={inputCls} /></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">RMAP-conformant smelters</label>
                          <input type="number" value={s.smeltersRmapConformant} onChange={(e) => updateStep(stepKey, { smeltersRmapConformant: parseInt(e.target.value, 10) || 0 })} className={inputCls} /></div>
                      </div>
                      <Toggle checked={s.supplyChainMapped} onChange={(v) => updateStep(stepKey, { supplyChainMapped: v })} label="Supply chain mapped to source (origin country identified for all consignments)" />
                      <div>
                        <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Evidence notes</label>
                        <textarea value={s.evidenceNotes} onChange={(e) => updateStep(stepKey, { evidenceNotes: e.target.value })} rows={3} className={`${inputCls} resize-y`} placeholder="CAHRA countries identified, red flags found, smelter list references…" />
                      </div>
                    </div>
                  )}

                  {/* Step 3 fields */}
                  {step.n === 3 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Toggle checked={s.mitigationStrategyExists} onChange={(v) => updateStep(stepKey, { mitigationStrategyExists: v })} label="Written risk mitigation strategy document exists" />
                        <Toggle checked={s.supplierEngagementRecords} onChange={(v) => updateStep(stepKey, { supplierEngagementRecords: v })} label="Supplier engagement correspondence records maintained" />
                        <Toggle checked={s.escalatedToSeniorMgmt} onChange={(v) => updateStep(stepKey, { escalatedToSeniorMgmt: v })} label="Material risks escalated to senior management with documented report" />
                        <Toggle checked={s.thirdPartyAuditsRequired} onChange={(v) => updateStep(stepKey, { thirdPartyAuditsRequired: v })} label="Third-party audits required for identified high-risk suppliers" />
                      </div>
                      <div>
                        <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Evidence notes</label>
                        <textarea value={s.evidenceNotes} onChange={(e) => updateStep(stepKey, { evidenceNotes: e.target.value })} rows={3} className={`${inputCls} resize-y`} placeholder="Describe mitigation actions, supplier responses, any suspensions…" />
                      </div>
                    </div>
                  )}

                  {/* Step 4 fields */}
                  {step.n === 4 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Audit date</label>
                          <IsoDateInput value={s.auditDate ?? ""} onChange={(iso) => updateStep(stepKey, { auditDate: iso })} className={inputCls} /></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Auditor name</label>
                          <input value={s.auditorName} onChange={(e) => updateStep(stepKey, { auditorName: e.target.value })} className={inputCls} /></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Auditor accreditation</label>
                          <select value={s.auditorAccreditation} onChange={(e) => updateStep(stepKey, { auditorAccreditation: e.target.value })} className={inputCls}>
                            <option value="">— Select —</option>
                            <option value="RMAP">RMAP</option>
                            <option value="LBMA">LBMA Good Delivery</option>
                            <option value="other">Other accredited body</option>
                          </select></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Audit outcome</label>
                          <select value={s.auditOutcome} onChange={(e) => updateStep(stepKey, { auditOutcome: e.target.value })} className={inputCls}>
                            <option value="">— Pending —</option>
                            <option value="conformant">Conformant</option>
                            <option value="active">Active (in progress)</option>
                            <option value="suspended">Suspended</option>
                            <option value="pending">Pending review</option>
                          </select></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Critical findings</label>
                          <input type="number" value={s.criticalFindingsCount} onChange={(e) => updateStep(stepKey, { criticalFindingsCount: parseInt(e.target.value, 10) || 0 })} className={inputCls} /></div>
                      </div>
                      <Toggle checked={s.auditConducted} onChange={(v) => updateStep(stepKey, { auditConducted: v })} label="Third-party audit has been conducted by accredited auditor" />
                      <Toggle checked={s.criticalFindingsResolved} onChange={(v) => updateStep(stepKey, { criticalFindingsResolved: v })} label="All critical audit findings resolved with documented corrective actions" />
                    </div>
                  )}

                  {/* Step 5 fields */}
                  {step.n === 5 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Report published / submitted date</label>
                          <IsoDateInput value={s.reportPublishedAt ?? ""} onChange={(iso) => updateStep(stepKey, { reportPublishedAt: iso })} className={inputCls} /></div>
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Disclosure scope</label>
                          <select value={s.disclosureScope} onChange={(e) => updateStep(stepKey, { disclosureScope: e.target.value })} className={inputCls}>
                            <option value="public">Public (website)</option>
                            <option value="regulatory">Regulatory submission only</option>
                            <option value="internal">Internal only</option>
                          </select></div>
                        {s.disclosureScope === "public" && (
                          <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Report URL (public disclosure)</label>
                            <input value={s.reportUrl ?? ""} onChange={(e) => updateStep(stepKey, { reportUrl: e.target.value })} className={inputCls} placeholder="https://…" /></div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Toggle checked={s.reportPublished} onChange={(v) => updateStep(stepKey, { reportPublished: v })} label="Annual responsible sourcing report published / submitted" />
                        <Toggle checked={s.regulatorySubmission} onChange={(v) => updateStep(stepKey, { regulatorySubmission: v })} label="Regulatory submission to MoE / DMCC completed" />
                      </div>
                    </div>
                  )}

                  {/* Document references */}
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Document references (DMS IDs, file names)</label>
                    <input value={s.documentRefs.join(", ")} onChange={(e) => updateStep(stepKey, { documentRefs: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className={inputCls} placeholder="POL-001, AUDIT-2025-RMAP, etc." />
                  </div>

                  {/* Mark complete */}
                  <div className="pt-3 border-t border-hair flex items-center justify-between gap-3">
                    <Toggle
                      checked={s.completed}
                      onChange={(v) => updateStep(stepKey, { completed: v, completedAt: v ? new Date().toISOString() : undefined })}
                      label={`Mark Step ${step.n} as ${s.completed ? "incomplete" : "complete"}`}
                    />
                    {s.completedAt && <span className="text-10 text-ink-3 font-mono">Completed {new Date(s.completedAt).toLocaleDateString("en-GB")}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Export documentation package */}
      <div className={`mt-6 rounded-xl border p-5 ${isComplete ? "bg-green-dim border-green/30" : "bg-bg-panel border-hair-2"}`}>
        <div className="text-12 font-semibold text-ink-0 mb-2">
          {isComplete ? "✓ OECD DDG documentation package — complete" : "Documentation package — complete all 5 steps first"}
        </div>
        <p className="text-11 text-ink-2 mb-4">
          Export the full 5-step OECD DDG documentation package for MoE submission under Ministerial Decree 68/2024.
          For smelter-level AI risk assessment and RMAP status tracking, use the{" "}
          <a href="/rmi" className="text-brand underline">RMAP / RMI module</a>.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={!isComplete}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-40"
            onClick={() => { try { const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `responsible-sourcing-${workflow.reportingYear}.json`; a.click(); URL.revokeObjectURL(url); } catch (err) { console.error("[hawkeye] responsible-sourcing JSON export failed:", err); } }}>
            Export documentation package
          </button>
          <a href="/rmi" className="inline-flex items-center gap-2 px-4 py-2 rounded border border-hair-2 text-ink-1 text-12 font-medium hover:bg-bg-2 no-underline">
            Open RMAP / RMI Module ↗
          </a>
          <a href="/supply-chain" className="inline-flex items-center gap-2 px-4 py-2 rounded border border-hair-2 text-ink-1 text-12 font-medium hover:bg-bg-2 no-underline">
            Supply Chain Risk Assessment ↗
          </a>
        </div>
      </div>

      <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
        Ministerial Decree 68/2024 · OECD DDG for Responsible Supply Chains of Minerals from CAHRAs.
        5-step framework: (1) Management Systems (2) Risk Identification (3) Risk Mitigation (4) Third-Party Audit (5) Annual Report.
        Required for all UAE gold refiners handling conflict-mineral supply chains. Changes auto-save.
      </p>
    </ModuleLayout>
  );
}
