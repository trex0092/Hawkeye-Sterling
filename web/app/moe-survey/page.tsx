"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { MoeSurveyState } from "@/app/api/moe-survey/route";

// MoE 2026 Mandatory AML/CFT Survey
// The UAE Ministry of Economy launched a mandatory AML/CFT survey at the start
// of 2026 for all mainland DNFBPs including DPMS dealers. Non-submission
// triggers immediate on-site inspection. Risk elevated to "High Risk".

const STORAGE_KEY = "hawkeye.moe-survey.local.v1";

const SECTION_META = [
  { id: "mlro", label: "MLRO Appointment", icon: "👤", desc: "MLRO name, qualification, appointment, goAML user ID, independence" },
  { id: "policies", label: "AML/CFT Policies", icon: "📑", desc: "Policy date, board approval, tipping-off, freeze, CNMR, DPMSR procedures" },
  { id: "training", label: "Training Logs", icon: "🎓", desc: "Last training date, coverage, pass rate, MLRO qualification record" },
  { id: "risk-assessment", label: "Risk Assessment", icon: "📊", desc: "BWRA completion, NRA alignment, DPMS risk rating" },
  { id: "goaml", label: "goAML Filing History", icon: "📤", desc: "Registration ref, STR/SAR/DPMSR counts and dates" },
  { id: "screening", label: "Sanctions Screening", icon: "🔎", desc: "Screening tool, lists covered, NAS/ARS registration, frequency" },
  { id: "ai-governance", label: "AI Tool Governance", icon: "🤖", desc: "AI tools used, governance policy, inventory, model cards, CBUAE" },
];

const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none";
const checkboxLabel = "flex items-center gap-2 text-12 text-ink-1 cursor-pointer";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={checkboxLabel}>
      <button type="button" onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${checked ? "bg-green" : "bg-bg-2 border border-hair-2"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

function SectionHeader({ id, label, icon, desc, completed, active, onClick }: { id: string; label: string; icon: string; desc: string; completed: boolean; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${active ? "bg-brand-dim border-b border-brand/30" : "hover:bg-bg-2 border-b border-hair"}`}>
      <span className="text-18 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-13 font-semibold text-ink-0">{label}</div>
        <div className="text-11 text-ink-3">{desc}</div>
      </div>
      <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase shrink-0 ${completed ? "bg-green-dim text-green border border-green/30" : "bg-bg-2 text-ink-3 border border-hair"}`}>
        {completed ? "Complete" : "Incomplete"}
      </span>
      <span className="text-ink-3 font-mono text-12 shrink-0">{active ? "▾" : "▸"}</span>
    </button>
  );
}

export default function MoeSurveyPage() {
  const [survey, setSurvey] = useState<MoeSurveyState | null>(null);
  const [activeSection, setActiveSection] = useState<string>("mlro");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const loadSurvey = useCallback(async () => {
    try {
      const res = await fetch("/api/moe-survey");
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; survey: MoeSurveyState };
        if (data.ok) { setSurvey(data.survey); return; }
      }
    } catch (err) { console.warn("[hawkeye] moe-survey server load failed — falling through to localStorage:", err); }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSurvey(JSON.parse(raw) as MoeSurveyState);
    } catch (err) { console.warn("[hawkeye] moe-survey localStorage parse failed:", err); }
  }, []);

  useEffect(() => { void loadSurvey(); }, [loadSurvey]);

  const autosave = useCallback(async (updated: MoeSurveyState) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch (err) { console.warn("[hawkeye] moe-survey localStorage persist failed:", err); }
    setSaving(true);
    try {
      const res = await fetch("/api/moe-survey", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(updated) });
      if (res.ok) setLastSaved(new Date());
      else console.error(`[hawkeye] moe-survey autosave HTTP ${res.status}`);
    } catch (err) { console.error("[hawkeye] moe-survey autosave threw:", err); }
    finally { setSaving(false); }
  }, []);

  const update = useCallback((patch: Partial<MoeSurveyState>) => {
    setSurvey((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void autosave(next);
      return next;
    });
  }, [autosave]);

  const markSectionComplete = (sectionId: string, complete: boolean) => {
    if (!survey) return;
    const sections = survey.sections.map((s) => s.id === sectionId ? { ...s, completed: complete, completedAt: complete ? new Date().toISOString() : undefined } : s);
    update({ sections });
  };

  if (!survey) return <div className="p-8 text-12 text-ink-3">Loading survey…</div>;

  const completedCount = survey.sections.filter((s) => s.completed).length;
  const totalSections = SECTION_META.length;
  const progressPct = Math.round((completedCount / totalSections) * 100);
  const isReady = completedCount === totalSections;

  const sectionComplete = (id: string) => survey.sections.find((s) => s.id === id)?.completed ?? false;

  return (
    <ModuleLayout asanaModule="moe-survey" asanaLabel="MoE 2026 AML/CFT Survey" engineLabel="Compliance survey engine">
      <ModuleHero
        moduleNumber={53}
        eyebrow="Module 53 · Regulatory Compliance"
        title="MoE 2026 mandatory AML/CFT"
        titleEm="survey."
        kpis={[
          { value: `${completedCount}/${totalSections}`, label: "sections complete", tone: completedCount < totalSections ? "amber" : undefined },
          { value: `${progressPct}%`, label: "progress", tone: progressPct < 100 ? "amber" : undefined },
          { value: isReady ? "Ready" : "Incomplete", label: "submission status", tone: isReady ? undefined : "red" },
        ]}
        intro={
          <>
            <strong>MOET/AML/001/2026 — Mandatory for all mainland DNFBPs.</strong>{" "}
            The UAE Ministry of Economy launched a mandatory AML/CFT survey at the start of 2026. All DPMS dealers
            must respond. Non-submission triggers <strong className="text-red">immediate on-site inspection</strong> and
            elevates risk rating to "High Risk". Complete all 7 sections and export the readiness package before submitting.
          </>
        }
      />

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-11 text-ink-2 font-semibold">Overall completion</span>
          <div className="flex items-center gap-3">
            {saving && <span className="text-10 text-ink-3 font-mono">Saving…</span>}
            {lastSaved && !saving && <span className="text-10 text-ink-3 font-mono">Saved {lastSaved.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div className="h-2.5 bg-bg-2 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${progressPct === 100 ? "bg-green" : progressPct >= 60 ? "bg-amber" : "bg-red"}`} style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-10 text-ink-3">{completedCount} of {totalSections} sections complete</span>
          {!isReady && <span className="text-10 text-red font-semibold">Complete all sections before MoE submission deadline</span>}
          {isReady && <span className="text-10 text-green font-semibold">✓ All sections complete — ready to export</span>}
        </div>
      </div>

      {/* Sections accordion */}
      <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden divide-y divide-hair mb-6">
        {SECTION_META.map((sec) => (
          <div key={sec.id}>
            <SectionHeader
              id={sec.id} label={sec.label} icon={sec.icon} desc={sec.desc}
              completed={sectionComplete(sec.id)}
              active={activeSection === sec.id}
              onClick={() => setActiveSection(activeSection === sec.id ? "" : sec.id)}
            />

            {activeSection === sec.id && (
              <div className="px-5 py-5 space-y-4 bg-bg-1/30">
                {/* SECTION 1: MLRO */}
                {sec.id === "mlro" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">MLRO full name</label>
                        <input value={survey.mlroName} onChange={(e) => update({ mlroName: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">AML qualification</label>
                        <input value={survey.mlroQualification} onChange={(e) => update({ mlroQualification: e.target.value })} className={inputCls} placeholder="CAMS / ICA / MBA (AML) etc." /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Appointment date</label>
                        <input type="date" value={survey.mlroAppointmentDate} onChange={(e) => update({ mlroAppointmentDate: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">goAML user ID</label>
                        <input value={survey.mlroGoAmlUserId} onChange={(e) => update({ mlroGoAmlUserId: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Reports to</label>
                        <select value={survey.mlroReportsTo} onChange={(e) => update({ mlroReportsTo: e.target.value })} className={inputCls}>
                          <option value="board">Board of Directors</option>
                          <option value="ceo">CEO</option>
                          <option value="other">Other</option>
                        </select></div>
                    </div>
                    <Toggle checked={survey.mlroIndependent} onChange={(v) => update({ mlroIndependent: v })} label="MLRO is independent — reports to Board directly without commercial interference (FDL 10/2025 Art.17)" />
                  </>
                )}

                {/* SECTION 2: Policies */}
                {sec.id === "policies" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Policy approval date</label>
                        <input type="date" value={survey.policyApprovalDate} onChange={(e) => update({ policyApprovalDate: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Approved by</label>
                        <input value={survey.policyApprovedBy} onChange={(e) => update({ policyApprovedBy: e.target.value })} className={inputCls} placeholder="Board Chair / MD" /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Last review date</label>
                        <input type="date" value={survey.policyLastReviewDate} onChange={(e) => update({ policyLastReviewDate: e.target.value })} className={inputCls} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Toggle checked={survey.tippingOffProcedure} onChange={(v) => update({ tippingOffProcedure: v })} label="Tipping-off prohibition procedure documented (FDL Art.25)" />
                      <Toggle checked={survey.freezeProcedure} onChange={(v) => update({ freezeProcedure: v })} label="Asset freeze procedure documented (CD74/2020)" />
                      <Toggle checked={survey.cnmrProcedure} onChange={(v) => update({ cnmrProcedure: v })} label="CNMR filing procedure documented (5-business-day deadline)" />
                      <Toggle checked={survey.dpmsrProcedure} onChange={(v) => update({ dpmsrProcedure: v })} label="DPMSR AED 55,000 threshold procedure documented (CR134/2025)" />
                    </div>
                  </>
                )}

                {/* SECTION 3: Training */}
                {sec.id === "training" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Last AML training date</label>
                        <input type="date" value={survey.lastTrainingDate} onChange={(e) => update({ lastTrainingDate: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Staff coverage (%)</label>
                        <input value={survey.trainingCoverage} onChange={(e) => update({ trainingCoverage: e.target.value })} className={inputCls} placeholder="e.g. 100%" /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Test pass rate (%)</label>
                        <input value={survey.trainingTestPassRate} onChange={(e) => update({ trainingTestPassRate: e.target.value })} className={inputCls} placeholder="e.g. 92%" /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">MLRO qualification record</label>
                        <input value={survey.mlroQualificationRecord} onChange={(e) => update({ mlroQualificationRecord: e.target.value })} className={inputCls} placeholder="Certificate name and issuer" /></div>
                    </div>
                    <p className="text-10 text-ink-3">Fine for undocumented training: AED 50,000 (CR71/2024). Keep training attendance logs and test results for MoE inspection.</p>
                  </>
                )}

                {/* SECTION 4: Risk Assessment */}
                {sec.id === "risk-assessment" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">BWRA completion date</label>
                        <input type="date" value={survey.bwraCompletionDate} onChange={(e) => update({ bwraCompletionDate: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Approved by</label>
                        <input value={survey.bwraApprovedBy} onChange={(e) => update({ bwraApprovedBy: e.target.value })} className={inputCls} placeholder="Board Chair / MLRO" /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Entity risk rating (self-assessed)</label>
                        <select value={survey.dpmsRiskRating} onChange={(e) => update({ dpmsRiskRating: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="medium-high">Medium-High</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select></div>
                    </div>
                    <Toggle checked={survey.nraAlignment} onChange={(v) => update({ nraAlignment: v })} label="BWRA aligned to 2024 UAE National Risk Assessment (DPMS sector: Medium-High inherent risk)" />
                    <div className="bg-amber-dim border border-amber/20 rounded p-3 text-11 text-ink-1">
                      MoE 2026 survey flags <strong>copy-paste assessments</strong> as red flags. BWRA must be entity-specific.
                      Use the <a href="/ewra" className="text-brand underline">EWRA / BWRA module</a> to generate an entity-specific assessment with narrative.
                    </div>
                  </>
                )}

                {/* SECTION 5: goAML */}
                {sec.id === "goaml" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">goAML registration ref</label>
                        <input value={survey.goAmlRegistrationRef} onChange={(e) => update({ goAmlRegistrationRef: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Last STR/SAR filing date</label>
                        <input type="date" value={survey.lastStrFilingDate} onChange={(e) => update({ lastStrFilingDate: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Last DPMSR filing date</label>
                        <input type="date" value={survey.lastDpmsrFilingDate} onChange={(e) => update({ lastDpmsrFilingDate: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">STR/SAR count (last 12 months)</label>
                        <input value={survey.strCountLast12m} onChange={(e) => update({ strCountLast12m: e.target.value })} className={inputCls} placeholder="e.g. 3" /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">DPMSR count (last 12 months)</label>
                        <input value={survey.dpmsrCountLast12m} onChange={(e) => update({ dpmsrCountLast12m: e.target.value })} className={inputCls} placeholder="e.g. 12" /></div>
                    </div>
                  </>
                )}

                {/* SECTION 6: Screening */}
                {sec.id === "screening" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Screening tool name</label>
                        <input value={survey.screeningToolName} onChange={(e) => update({ screeningToolName: e.target.value })} className={inputCls} /></div>
                      <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Screening frequency</label>
                        <select value={survey.screeningFrequency} onChange={(e) => update({ screeningFrequency: e.target.value })} className={inputCls}>
                          <option value="transaction">Per-transaction (real-time)</option>
                          <option value="daily">Daily batch</option>
                          <option value="other">Other</option>
                        </select></div>
                    </div>
                    <div className="bg-bg-2 rounded p-3 text-11 text-ink-2">
                      <div className="font-semibold mb-1">Lists screened:</div>
                      <div className="flex flex-wrap gap-1">
                        {survey.screeningLists.map((l) => (
                          <span key={l} className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-dim text-brand text-10 font-medium">{l}</span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className={`rounded-lg p-3 border ${survey.nasRegistered ? "bg-green-dim border-green/30" : "bg-red-dim border-red/30"}`}>
                        <div className="text-10 font-mono uppercase tracking-wide-3 mb-1 font-semibold" style={{ color: survey.nasRegistered ? "var(--green)" : "var(--red)" }}>
                          EOCN NAS Registration
                        </div>
                        <Toggle checked={survey.nasRegistered} onChange={(v) => update({ nasRegistered: v })} label="Registered on EOCN Notification Alert System (uaeiec.gov.ae)" />
                        <p className="text-10 text-ink-3 mt-1">Manual registration required at uaeiec.gov.ae. Confirm and document reference in the <a href="/eocn" className="text-brand underline">EOCN module</a>.</p>
                      </div>
                      <div className={`rounded-lg p-3 border ${survey.arsRegistered ? "bg-green-dim border-green/30" : "bg-red-dim border-red/30"}`}>
                        <div className="text-10 font-mono uppercase tracking-wide-3 mb-1 font-semibold" style={{ color: survey.arsRegistered ? "var(--green)" : "var(--red)" }}>
                          EOCN ARS Registration
                        </div>
                        <Toggle checked={survey.arsRegistered} onChange={(v) => update({ arsRegistered: v })} label="Registered on EOCN Automatic Reporting System" />
                        <p className="text-10 text-ink-3 mt-1">ARS is separate from NAS. Both are mandatory. Register at uaeiec.gov.ae.</p>
                      </div>
                    </div>
                  </>
                )}

                {/* SECTION 7: AI Governance */}
                {sec.id === "ai-governance" && (
                  <>
                    <Toggle checked={survey.aiToolsUsed} onChange={(v) => update({ aiToolsUsed: v })} label="AI tools are used in AML/CFT compliance processes" />
                    {survey.aiToolsUsed && (
                      <div className="space-y-3 mt-2">
                        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">AI tool names</label>
                          <input value={survey.aiToolNames} onChange={(e) => update({ aiToolNames: e.target.value })} className={inputCls} /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">AI governance policy date</label>
                            <input type="date" value={survey.aiGovernancePolicyDate} onChange={(e) => update({ aiGovernancePolicyDate: e.target.value })} className={inputCls} /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Toggle checked={survey.aiGovernancePolicyExists} onChange={(v) => update({ aiGovernancePolicyExists: v })} label="AI governance policy approved by senior management (CBUAE requirement)" />
                          <Toggle checked={survey.aiInventoryDocumentExists} onChange={(v) => update({ aiInventoryDocumentExists: v })} label="AI system inventory document exists (CBUAE Enabling Tech 2025)" />
                          <Toggle checked={survey.aiModelCardsExist} onChange={(v) => update({ aiModelCardsExist: v })} label="Model cards exist for all 5 AI systems (CBUAE documented requirement)" />
                          <Toggle checked={survey.humanOversightDemonstrable} onChange={(v) => update({ humanOversightDemonstrable: v })} label="Human oversight demonstrable — MLRO can override any AI decision" />
                          <Toggle checked={survey.cbueaNotified} onChange={(v) => update({ cbueaNotified: v })} label="CBUAE notified of AI tool use (CBUAE Enabling Technology 2025)" />
                        </div>
                        <div className="bg-amber-dim border border-amber/20 rounded p-3 text-11 text-ink-1">
                          Failure to document AI governance is one of the <strong>4 CBUAE requirements for AML AI tools</strong>.
                          CBUAE will ask: show me the AI system inventory, the governance policy, and the model cards.
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Section complete toggle */}
                <div className="pt-3 border-t border-hair flex items-center justify-between gap-3">
                  <Toggle
                    checked={sectionComplete(sec.id)}
                    onChange={(v) => markSectionComplete(sec.id, v)}
                    label={`Mark section as ${sectionComplete(sec.id) ? "incomplete" : "complete"}`}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Export package */}
      <div className={`rounded-xl border p-5 ${isReady ? "bg-green-dim border-green/30" : "bg-bg-panel border-hair-2"}`}>
        <div className="text-12 font-semibold text-ink-0 mb-2">
          {isReady ? "✓ Survey readiness package — ready to export" : "Survey readiness package — complete all sections first"}
        </div>
        <p className="text-11 text-ink-2 mb-4">
          Export the survey responses as a structured PDF/JSON package for submission to MoE. Non-submission of the 2026 mandatory survey
          triggers immediate on-site inspection (MOET/AML/001/2026).
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={!isReady}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-40"
            onClick={() => { try { const blob = new Blob([JSON.stringify(survey, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `moe-survey-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); } catch (err) { console.error("[hawkeye] moe-survey JSON export failed:", err); } }}>
            Export JSON
          </button>
          <a href="/governance/inspection-room" className="inline-flex items-center gap-2 px-4 py-2 rounded border border-hair-2 text-ink-1 text-12 font-medium hover:bg-bg-2 no-underline">
            Open Inspection Room ↗
          </a>
        </div>
      </div>

      <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
        MOET/AML/001/2026 · Mandatory for all mainland DNFBPs including DPMS dealers.
        Non-submission triggers on-site inspection and "High Risk" classification. Deadline: as announced by MoE.
        Changes auto-save. All section responses are stored securely for audit purposes.
      </p>
    </ModuleLayout>
  );
}
