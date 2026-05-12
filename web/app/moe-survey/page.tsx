"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { IsoDateInput } from "@/components/ui/IsoDateInput";
import type { MoeSurveyState } from "@/app/api/moe-survey/route";

// MoE 2026 Mandatory AML/CFT Survey — 13 sections
// MOET/AML/001/2026 — Mandatory for all mainland DNFBPs including DPMS dealers.

const STORAGE_KEY = "hawkeye.moe-survey.local.v2";

const SECTION_META = [
  { id: "business-profile", label: "Business Profile & Licensing", icon: "🏢", desc: "MoE license, activity type, products, employees, transaction channels" },
  { id: "mlro", label: "MLRO Appointment", icon: "👤", desc: "MLRO name, qualification, appointment, goAML user ID, independence, deputy" },
  { id: "policies", label: "AML/CFT Policies", icon: "📑", desc: "Policy date, board approval, tipping-off, freeze, CNMR, DPMSR, CDD/EDD, BO, record retention" },
  { id: "training", label: "Training Logs", icon: "🎓", desc: "Last training date, staff coverage, pass rate, MLRO qualification, senior management training" },
  { id: "risk-assessment", label: "ML/TF Risk Assessment", icon: "📊", desc: "BWRA completion, NRA alignment, DPMS risk rating" },
  { id: "pf-risk", label: "Proliferation Financing Risk", icon: "☢️", desc: "Standalone PF risk assessment, TFS screening, UNSCR compliance, EOCN status" },
  { id: "tx-monitoring", label: "Transaction Monitoring", icon: "📡", desc: "Monitoring procedure, red flag list, MLRO escalation threshold, UTR count" },
  { id: "goaml", label: "goAML Filing History", icon: "📤", desc: "Registration ref, account status, STR/SAR/DPMSR counts and dates" },
  { id: "screening", label: "Sanctions Screening", icon: "🔎", desc: "Tool, lists, NAS/ARS, frequency, re-screening, freeze turnaround, hit history" },
  { id: "internal-audit", label: "Internal Audit & Review", icon: "🔍", desc: "Last audit date, conducted by, rating, open remediations, board review" },
  { id: "senior-mgmt", label: "Senior Management Governance", icon: "🏛️", desc: "UBO details, board sign-off, AML reporting frequency, whistleblower channel" },
  { id: "ai-governance", label: "AI Tool Governance", icon: "🤖", desc: "AI tools used, governance policy, inventory, model cards, CBUAE notification" },
  { id: "inspections", label: "Previous Inspections & History", icon: "📋", desc: "Prior MoE inspections, enforcement actions, previous survey, circular acknowledgment" },
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">{children}</label>;
}

function SectionHeader({ id, label, icon, desc, completed, active, onClick }: {
  id: string; label: string; icon: string; desc: string; completed: boolean; active: boolean; onClick: () => void;
}) {
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
  const [activeSection, setActiveSection] = useState<string>("business-profile");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadSurvey = useCallback(async () => {
    try {
      const res = await fetch("/api/moe-survey");
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; survey: MoeSurveyState };
        if (!mountedRef.current) return;
        if (data.ok) { setSurvey(data.survey); return; }
      }
    } catch (err) { console.warn("[hawkeye] moe-survey server load failed:", err); }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && mountedRef.current) setSurvey(JSON.parse(raw) as MoeSurveyState);
    } catch (err) { console.warn("[hawkeye] moe-survey localStorage parse failed:", err); }
  }, []);

  useEffect(() => { void loadSurvey(); }, [loadSurvey]);

  const autosave = useCallback(async (updated: MoeSurveyState) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch (err) { console.warn("[hawkeye] moe-survey localStorage persist failed:", err); }
    setSaving(true);
    try {
      const res = await fetch("/api/moe-survey", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(updated) });
      if (!mountedRef.current) return;
      if (res.ok) setLastSaved(new Date());
      else console.error(`[hawkeye] moe-survey autosave HTTP ${res.status}`);
    } catch (err) { console.error("[hawkeye] moe-survey autosave threw:", err); }
    finally { if (mountedRef.current) setSaving(false); }
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
    const sections = survey.sections.map((s) =>
      s.id === sectionId ? { ...s, completed: complete, completedAt: complete ? new Date().toISOString() : undefined } : s
    );
    update({ sections });
  };

  if (!survey) return <div className="p-8 text-12 text-ink-3">Loading survey…</div>;

  const totalSections = SECTION_META.length;
  const completedCount = survey.sections.filter((s) => s.completed).length;
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
            elevates risk rating to "High Risk". Complete all {totalSections} sections and export the readiness package before submitting.
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
          <div
            className={`h-full rounded-full transition-all ${progressPct === 100 ? "bg-green" : progressPct >= 60 ? "bg-amber" : "bg-red"}`}
            style={{ width: `${progressPct}%` }}
          />
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

                {/* ─── SECTION 1: Business Profile ─── */}
                {sec.id === "business-profile" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><FieldLabel>MoE DPMS license number</FieldLabel>
                        <input value={survey.dpmsLicenseNumber} onChange={(e) => update({ dpmsLicenseNumber: e.target.value })} className={inputCls} placeholder="e.g. MoE-DPMS-2024-XXXXX" /></div>
                      <div><FieldLabel>License expiry date</FieldLabel>
                        <IsoDateInput value={survey.dpmsLicenseExpiry} onChange={(iso) => update({ dpmsLicenseExpiry: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Primary business activity</FieldLabel>
                        <select value={survey.businessActivityType} onChange={(e) => update({ businessActivityType: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="retailer">Retailer</option>
                          <option value="wholesaler">Wholesaler</option>
                          <option value="manufacturer">Manufacturer</option>
                          <option value="broker">Broker / Agent</option>
                          <option value="multiple">Multiple activities</option>
                        </select></div>
                      <div><FieldLabel>Number of employees</FieldLabel>
                        <input value={survey.numberOfEmployees} onChange={(e) => update({ numberOfEmployees: e.target.value })} className={inputCls} placeholder="e.g. 12" /></div>
                      <div><FieldLabel>Number of branches</FieldLabel>
                        <input value={survey.numberOfBranches} onChange={(e) => update({ numberOfBranches: e.target.value })} className={inputCls} placeholder="e.g. 3" /></div>
                      <div><FieldLabel>Annual transaction volume (AED range)</FieldLabel>
                        <select value={survey.annualTransactionVolumeAed} onChange={(e) => update({ annualTransactionVolumeAed: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="under-1m">Under AED 1M</option>
                          <option value="1m-5m">AED 1M – 5M</option>
                          <option value="5m-20m">AED 5M – 20M</option>
                          <option value="20m-100m">AED 20M – 100M</option>
                          <option value="over-100m">Over AED 100M</option>
                        </select></div>
                    </div>
                    <div>
                      <FieldLabel>Product types handled</FieldLabel>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-1">
                        <Toggle checked={survey.productTypesGold} onChange={(v) => update({ productTypesGold: v })} label="Gold" />
                        <Toggle checked={survey.productTypesDiamonds} onChange={(v) => update({ productTypesDiamonds: v })} label="Diamonds" />
                        <Toggle checked={survey.productTypesPreciousStones} onChange={(v) => update({ productTypesPreciousStones: v })} label="Precious stones" />
                        <Toggle checked={survey.productTypesPearls} onChange={(v) => update({ productTypesPearls: v })} label="Pearls" />
                        <Toggle checked={survey.productTypesPreciousMetals} onChange={(v) => update({ productTypesPreciousMetals: v })} label="Precious metals" />
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Transaction channels used</FieldLabel>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                        <Toggle checked={survey.transactionChannelCash} onChange={(v) => update({ transactionChannelCash: v })} label="In-store cash" />
                        <Toggle checked={survey.transactionChannelBankTransfer} onChange={(v) => update({ transactionChannelBankTransfer: v })} label="Bank transfer" />
                        <Toggle checked={survey.transactionChannelOnline} onChange={(v) => update({ transactionChannelOnline: v })} label="Online / e-commerce" />
                        <Toggle checked={survey.transactionChannelExportImport} onChange={(v) => update({ transactionChannelExportImport: v })} label="Export / import" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Toggle checked={survey.importExportActivity} onChange={(v) => update({ importExportActivity: v })} label="Import / export activity (triggers additional MoE/Customs obligations)" />
                      <Toggle checked={survey.freeZoneActivity} onChange={(v) => update({ freeZoneActivity: v })} label="Operations in a UAE Free Zone (additional CBUAE/MoE obligations apply)" />
                    </div>
                  </>
                )}

                {/* ─── SECTION 2: MLRO ─── */}
                {sec.id === "mlro" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>MLRO full name</FieldLabel>
                        <input value={survey.mlroName} onChange={(e) => update({ mlroName: e.target.value })} className={inputCls} /></div>
                      <div><FieldLabel>AML qualification</FieldLabel>
                        <input value={survey.mlroQualification} onChange={(e) => update({ mlroQualification: e.target.value })} className={inputCls} placeholder="CAMS / ICA / MBA (AML) etc." /></div>
                      <div><FieldLabel>Appointment date</FieldLabel>
                        <IsoDateInput value={survey.mlroAppointmentDate} onChange={(iso) => update({ mlroAppointmentDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>goAML user ID</FieldLabel>
                        <input value={survey.mlroGoAmlUserId} onChange={(e) => update({ mlroGoAmlUserId: e.target.value })} className={inputCls} /></div>
                      <div><FieldLabel>Reports to</FieldLabel>
                        <select value={survey.mlroReportsTo} onChange={(e) => update({ mlroReportsTo: e.target.value })} className={inputCls}>
                          <option value="board">Board of Directors</option>
                          <option value="ceo">CEO / MD</option>
                          <option value="other">Other</option>
                        </select></div>
                      <div><FieldLabel>Deputy MLRO name (if appointed)</FieldLabel>
                        <input value={survey.mlroDeputyName} onChange={(e) => update({ mlroDeputyName: e.target.value })} className={inputCls} placeholder="Leave blank if none" /></div>
                    </div>
                    <Toggle checked={survey.mlroIndependent} onChange={(v) => update({ mlroIndependent: v })} label="MLRO is independent — reports to Board without commercial interference (FDL 10/2025 Art.17)" />
                  </>
                )}

                {/* ─── SECTION 3: Policies ─── */}
                {sec.id === "policies" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><FieldLabel>Policy approval date</FieldLabel>
                        <IsoDateInput value={survey.policyApprovalDate} onChange={(iso) => update({ policyApprovalDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Approved by</FieldLabel>
                        <input value={survey.policyApprovedBy} onChange={(e) => update({ policyApprovedBy: e.target.value })} className={inputCls} placeholder="Board Chair / MD" /></div>
                      <div><FieldLabel>Last review date</FieldLabel>
                        <IsoDateInput value={survey.policyLastReviewDate} onChange={(iso) => update({ policyLastReviewDate: iso })} className={inputCls} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>Standard CDD trigger threshold (AED)</FieldLabel>
                        <input value={survey.cddThresholdStandard} onChange={(e) => update({ cddThresholdStandard: e.target.value })} className={inputCls} placeholder="e.g. 55,000 (DPMSR threshold)" /></div>
                      <div><FieldLabel>EDD trigger description</FieldLabel>
                        <input value={survey.eddTriggerDescription} onChange={(e) => update({ eddTriggerDescription: e.target.value })} className={inputCls} placeholder="e.g. PEP, high-risk country, unusual pattern" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Toggle checked={survey.tippingOffProcedure} onChange={(v) => update({ tippingOffProcedure: v })} label="Tipping-off prohibition procedure documented (FDL Art.25)" />
                      <Toggle checked={survey.freezeProcedure} onChange={(v) => update({ freezeProcedure: v })} label="Asset freeze procedure documented (CD74/2020)" />
                      <Toggle checked={survey.cnmrProcedure} onChange={(v) => update({ cnmrProcedure: v })} label="CNMR filing procedure documented (5-business-day deadline)" />
                      <Toggle checked={survey.dpmsrProcedure} onChange={(v) => update({ dpmsrProcedure: v })} label="DPMSR AED 55,000 threshold procedure documented (CR134/2025)" />
                      <Toggle checked={survey.boVerificationProcedure} onChange={(v) => update({ boVerificationProcedure: v })} label="Beneficial Ownership (BO) verification procedure documented (CD10/2019 Art.5)" />
                      <Toggle checked={survey.recordRetention5Year} onChange={(v) => update({ recordRetention5Year: v })} label="10-year minimum record retention confirmed (FDL No.10/2025 Art.19)" />
                    </div>
                  </>
                )}

                {/* ─── SECTION 4: Training ─── */}
                {sec.id === "training" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>Last staff AML training date</FieldLabel>
                        <IsoDateInput value={survey.lastTrainingDate} onChange={(iso) => update({ lastTrainingDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Staff coverage (%)</FieldLabel>
                        <input value={survey.trainingCoverage} onChange={(e) => update({ trainingCoverage: e.target.value })} className={inputCls} placeholder="e.g. 100%" /></div>
                      <div><FieldLabel>Test pass rate (%)</FieldLabel>
                        <input value={survey.trainingTestPassRate} onChange={(e) => update({ trainingTestPassRate: e.target.value })} className={inputCls} placeholder="e.g. 92%" /></div>
                      <div><FieldLabel>MLRO qualification record</FieldLabel>
                        <input value={survey.mlroQualificationRecord} onChange={(e) => update({ mlroQualificationRecord: e.target.value })} className={inputCls} placeholder="Certificate name and issuer" /></div>
                      <div><FieldLabel>Senior management AML training date</FieldLabel>
                        <IsoDateInput value={survey.seniorMgmtTrainingDate} onChange={(iso) => update({ seniorMgmtTrainingDate: iso })} className={inputCls} /></div>
                    </div>
                    <p className="text-10 text-ink-3">Fine for undocumented training: AED 50,000 (CR71/2024). Keep attendance logs and test results. Senior management training is required separately from staff training.</p>
                  </>
                )}

                {/* ─── SECTION 5: ML/TF Risk Assessment ─── */}
                {sec.id === "risk-assessment" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>BWRA completion date</FieldLabel>
                        <IsoDateInput value={survey.bwraCompletionDate} onChange={(iso) => update({ bwraCompletionDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Approved by</FieldLabel>
                        <input value={survey.bwraApprovedBy} onChange={(e) => update({ bwraApprovedBy: e.target.value })} className={inputCls} placeholder="Board Chair / MLRO" /></div>
                      <div><FieldLabel>Entity risk rating (self-assessed)</FieldLabel>
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
                      Use the <a href="/ewra" className="text-brand underline">EWRA / BWRA module</a> to generate a tailored assessment.
                    </div>
                  </>
                )}

                {/* ─── SECTION 6: PF Risk Assessment ─── */}
                {sec.id === "pf-risk" && (
                  <>
                    <div className="bg-amber-dim border border-amber/20 rounded p-3 text-11 text-ink-1 mb-2">
                      <strong>FATF Recommendation 1 (2023 revision)</strong> and <strong>FDL 10/2025</strong> require a <em>standalone</em> Proliferation Financing (PF) risk assessment — separate from the ML/TF BWRA. DPMS dealers are high-risk for PF given dual-use nature of precious metals (UNSCR 1718/1737/2231).
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><FieldLabel>PF risk assessment date</FieldLabel>
                        <IsoDateInput value={survey.pfRiskAssessmentDate} onChange={(iso) => update({ pfRiskAssessmentDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Approved by</FieldLabel>
                        <input value={survey.pfRiskAssessmentApprovedBy} onChange={(e) => update({ pfRiskAssessmentApprovedBy: e.target.value })} className={inputCls} placeholder="Board Chair / MLRO" /></div>
                      <div><FieldLabel>PF risk rating</FieldLabel>
                        <select value={survey.pfRiskRating} onChange={(e) => update({ pfRiskRating: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select></div>
                      <div><FieldLabel>EOCN registration status</FieldLabel>
                        <select value={survey.eocnRegistrationStatus} onChange={(e) => update({ eocnRegistrationStatus: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="registered">Registered</option>
                          <option value="pending">Pending registration</option>
                          <option value="not-required">Not required for our products</option>
                        </select></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Toggle checked={survey.pfTfsScreeningConfirmed} onChange={(v) => update({ pfTfsScreeningConfirmed: v })} label="Targeted Financial Sanctions (TFS) for PF explicitly confirmed — separate from ML/TF screening (CD74/2020)" />
                      <Toggle checked={survey.unscr1718Compliance} onChange={(v) => update({ unscr1718Compliance: v })} label="UNSCR 1718 compliance confirmed (North Korea — precious metals export ban)" />
                      <Toggle checked={survey.unscr1737Compliance} onChange={(v) => update({ unscr1737Compliance: v })} label="UNSCR 1737 compliance confirmed (Iran — nuclear/proliferation)" />
                      <Toggle checked={survey.unscr2231Compliance} onChange={(v) => update({ unscr2231Compliance: v })} label="UNSCR 2231 compliance confirmed (Iran JCPOA — dual-use goods)" />
                    </div>
                  </>
                )}

                {/* ─── SECTION 7: Transaction Monitoring ─── */}
                {sec.id === "tx-monitoring" && (
                  <>
                    <Toggle checked={survey.txMonitoringProcedureExists} onChange={(v) => update({ txMonitoringProcedureExists: v })} label="Transaction monitoring procedure documented and implemented (CD10/2019 Art.12)" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>Monitoring type</FieldLabel>
                        <select value={survey.txMonitoringType} onChange={(e) => update({ txMonitoringType: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="manual">Manual review</option>
                          <option value="automated">Automated / system-based</option>
                          <option value="hybrid">Hybrid (manual + automated)</option>
                        </select></div>
                      <div><FieldLabel>Red flag list last updated</FieldLabel>
                        <IsoDateInput value={survey.redFlagListUpdatedDate} onChange={(iso) => update({ redFlagListUpdatedDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>MLRO escalation threshold (AED)</FieldLabel>
                        <input value={survey.mlroEscalationThresholdAed} onChange={(e) => update({ mlroEscalationThresholdAed: e.target.value })} className={inputCls} placeholder="e.g. 55,000 or any amount if suspicious" /></div>
                      <div><FieldLabel>Internal UTR count (last 12 months)</FieldLabel>
                        <input value={survey.internalUtrCountLast12m} onChange={(e) => update({ internalUtrCountLast12m: e.target.value })} className={inputCls} placeholder="e.g. 7" /></div>
                      <div><FieldLabel>Average transaction value (AED)</FieldLabel>
                        <input value={survey.averageTransactionValueAed} onChange={(e) => update({ averageTransactionValueAed: e.target.value })} className={inputCls} placeholder="e.g. 85,000" /></div>
                    </div>
                    <Toggle checked={survey.cashTransactionLogMaintained} onChange={(v) => update({ cashTransactionLogMaintained: v })} label="Cash transaction log maintained and available for MoE inspection (critical for DPMS given cash-intensive nature)" />
                  </>
                )}

                {/* ─── SECTION 8: goAML ─── */}
                {sec.id === "goaml" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>goAML registration ref</FieldLabel>
                        <input value={survey.goAmlRegistrationRef} onChange={(e) => update({ goAmlRegistrationRef: e.target.value })} className={inputCls} /></div>
                      <div><FieldLabel>goAML account status</FieldLabel>
                        <select value={survey.goAmlAccountStatus} onChange={(e) => update({ goAmlAccountStatus: e.target.value })} className={inputCls}>
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                          <option value="pending">Pending activation</option>
                        </select></div>
                      <div><FieldLabel>Last STR filing date</FieldLabel>
                        <IsoDateInput value={survey.lastStrFilingDate} onChange={(iso) => update({ lastStrFilingDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Last SAR filing date</FieldLabel>
                        <IsoDateInput value={survey.lastSarFilingDate} onChange={(iso) => update({ lastSarFilingDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Last DPMSR filing date</FieldLabel>
                        <IsoDateInput value={survey.lastDpmsrFilingDate} onChange={(iso) => update({ lastDpmsrFilingDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>STR count (last 12 months)</FieldLabel>
                        <input value={survey.strCountLast12m} onChange={(e) => update({ strCountLast12m: e.target.value })} className={inputCls} placeholder="e.g. 3" /></div>
                      <div><FieldLabel>SAR count (last 12 months)</FieldLabel>
                        <input value={survey.sarCountLast12m} onChange={(e) => update({ sarCountLast12m: e.target.value })} className={inputCls} placeholder="e.g. 1" /></div>
                      <div><FieldLabel>DPMSR count (last 12 months)</FieldLabel>
                        <input value={survey.dpmsrCountLast12m} onChange={(e) => update({ dpmsrCountLast12m: e.target.value })} className={inputCls} placeholder="e.g. 12" /></div>
                    </div>
                    {survey.goAmlAccountStatus !== "active" && (
                      <div className="bg-red-dim border border-red/30 rounded p-3 text-11 text-red">
                        goAML account must be <strong>Active</strong> to file STRs and DPMSRs. A suspended or inactive account means you cannot meet reporting obligations — this will be flagged by MoE.
                      </div>
                    )}
                  </>
                )}

                {/* ─── SECTION 9: Sanctions Screening ─── */}
                {sec.id === "screening" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>Screening tool name</FieldLabel>
                        <input value={survey.screeningToolName} onChange={(e) => update({ screeningToolName: e.target.value })} className={inputCls} /></div>
                      <div><FieldLabel>Onboarding screening frequency</FieldLabel>
                        <select value={survey.screeningFrequency} onChange={(e) => update({ screeningFrequency: e.target.value })} className={inputCls}>
                          <option value="transaction">Per-transaction (real-time)</option>
                          <option value="daily">Daily batch</option>
                          <option value="other">Other</option>
                        </select></div>
                      <div><FieldLabel>Existing customer re-screening frequency</FieldLabel>
                        <select value={survey.existingCustomerRescreeningFrequency} onChange={(e) => update({ existingCustomerRescreeningFrequency: e.target.value })} className={inputCls}>
                          <option value="realtime">Real-time (continuous)</option>
                          <option value="daily">Daily</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                        </select></div>
                      <div><FieldLabel>Freeze turnaround time (upon hit)</FieldLabel>
                        <input value={survey.freezeTurnaroundHours} onChange={(e) => update({ freezeTurnaroundHours: e.target.value })} className={inputCls} placeholder="e.g. Immediate / within 2 hours" /></div>
                      <div><FieldLabel>Sanctions hits (last 12 months)</FieldLabel>
                        <input value={survey.sanctionsHitsLast12m} onChange={(e) => update({ sanctionsHitsLast12m: e.target.value })} className={inputCls} placeholder="e.g. 0 true matches, 14 false positives" /></div>
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
                        <div className="text-10 font-mono uppercase tracking-wide-3 mb-1 font-semibold" style={{ color: survey.nasRegistered ? "var(--green)" : "var(--red)" }}>EOCN NAS Registration</div>
                        <Toggle checked={survey.nasRegistered} onChange={(v) => update({ nasRegistered: v })} label="Registered on EOCN Notification Alert System (uaeiec.gov.ae)" />
                        <p className="text-10 text-ink-3 mt-1">Manual registration required at uaeiec.gov.ae. Confirm in the <a href="/eocn" className="text-brand underline">EOCN module</a>.</p>
                      </div>
                      <div className={`rounded-lg p-3 border ${survey.arsRegistered ? "bg-green-dim border-green/30" : "bg-red-dim border-red/30"}`}>
                        <div className="text-10 font-mono uppercase tracking-wide-3 mb-1 font-semibold" style={{ color: survey.arsRegistered ? "var(--green)" : "var(--red)" }}>EOCN ARS Registration</div>
                        <Toggle checked={survey.arsRegistered} onChange={(v) => update({ arsRegistered: v })} label="Registered on EOCN Automatic Reporting System" />
                        <p className="text-10 text-ink-3 mt-1">ARS is separate from NAS. Both mandatory. Register at uaeiec.gov.ae.</p>
                      </div>
                    </div>
                    <Toggle checked={survey.uaeLocalListConfirmed} onChange={(v) => update({ uaeLocalListConfirmed: v })} label="UAE Local Terrorist List (UAEIA list) explicitly confirmed as screened — separate from UN/OFAC/EU lists (CD74/2020)" />
                  </>
                )}

                {/* ─── SECTION 10: Internal Audit ─── */}
                {sec.id === "internal-audit" && (
                  <>
                    <div className="bg-amber-dim border border-amber/20 rounded p-3 text-11 text-ink-1 mb-2">
                      <strong>FDL No.10/2025 Art.20</strong> requires periodic independent AML/CFT review. MoE inspectors will ask for the last audit report, findings, and board sign-off.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>Last AML/CFT audit date</FieldLabel>
                        <IsoDateInput value={survey.lastAmlAuditDate} onChange={(iso) => update({ lastAmlAuditDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Conducted by</FieldLabel>
                        <select value={survey.auditConductedBy} onChange={(e) => update({ auditConductedBy: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="internal">Internal auditor</option>
                          <option value="external">External auditor</option>
                          <option value="consultant">Compliance consultant</option>
                        </select></div>
                      <div><FieldLabel>Audit rating / outcome</FieldLabel>
                        <select value={survey.auditRating} onChange={(e) => update({ auditRating: e.target.value })} className={inputCls}>
                          <option value="">— Select —</option>
                          <option value="satisfactory">Satisfactory</option>
                          <option value="needs-improvement">Needs Improvement</option>
                          <option value="unsatisfactory">Unsatisfactory</option>
                        </select></div>
                      <div><FieldLabel>Open remediation items (count / description)</FieldLabel>
                        <input value={survey.openRemediationItems} onChange={(e) => update({ openRemediationItems: e.target.value })} className={inputCls} placeholder="e.g. 0 open, or '2 items due Q3 2026'" /></div>
                      <div><FieldLabel>Board review of audit findings date</FieldLabel>
                        <IsoDateInput value={survey.boardAuditReviewDate} onChange={(iso) => update({ boardAuditReviewDate: iso })} className={inputCls} /></div>
                    </div>
                    {survey.auditRating === "unsatisfactory" && (
                      <div className="bg-red-dim border border-red/30 rounded p-3 text-11 text-red">
                        An <strong>Unsatisfactory</strong> audit rating will be flagged by MoE as a high-risk indicator. Ensure a remediation plan with board sign-off is in place before submission.
                      </div>
                    )}
                  </>
                )}

                {/* ─── SECTION 11: Senior Management Governance ─── */}
                {sec.id === "senior-mgmt" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>UBO full name</FieldLabel>
                        <input value={survey.uboName} onChange={(e) => update({ uboName: e.target.value })} className={inputCls} placeholder="Ultimate Beneficial Owner" /></div>
                      <div><FieldLabel>UBO title / role</FieldLabel>
                        <input value={survey.uboTitle} onChange={(e) => update({ uboTitle: e.target.value })} className={inputCls} placeholder="e.g. Managing Director, Owner" /></div>
                      <div><FieldLabel>Board AML/CFT sign-off date</FieldLabel>
                        <IsoDateInput value={survey.boardSignOffDate} onChange={(iso) => update({ boardSignOffDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Signed off by</FieldLabel>
                        <input value={survey.boardSignOffBy} onChange={(e) => update({ boardSignOffBy: e.target.value })} className={inputCls} placeholder="Board Chair / Managing Director" /></div>
                      <div><FieldLabel>AML reporting frequency to senior management</FieldLabel>
                        <select value={survey.amlReportingFrequency} onChange={(e) => update({ amlReportingFrequency: e.target.value })} className={inputCls}>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="annually">Annually</option>
                        </select></div>
                    </div>
                    <Toggle checked={survey.whistleblowerChannelExists} onChange={(v) => update({ whistleblowerChannelExists: v })} label="Whistleblower / internal reporting channel exists — staff can report concerns without fear of retaliation (FDL No.10/2025 Art.24)" />
                  </>
                )}

                {/* ─── SECTION 12: AI Governance ─── */}
                {sec.id === "ai-governance" && (
                  <>
                    <Toggle checked={survey.aiToolsUsed} onChange={(v) => update({ aiToolsUsed: v })} label="AI tools are used in AML/CFT compliance processes" />
                    {survey.aiToolsUsed && (
                      <div className="space-y-3 mt-2">
                        <div><FieldLabel>AI tool names</FieldLabel>
                          <input value={survey.aiToolNames} onChange={(e) => update({ aiToolNames: e.target.value })} className={inputCls} /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div><FieldLabel>AI governance policy date</FieldLabel>
                            <IsoDateInput value={survey.aiGovernancePolicyDate} onChange={(iso) => update({ aiGovernancePolicyDate: iso })} className={inputCls} /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Toggle checked={survey.aiGovernancePolicyExists} onChange={(v) => update({ aiGovernancePolicyExists: v })} label="AI governance policy approved by senior management (CBUAE requirement)" />
                          <Toggle checked={survey.aiInventoryDocumentExists} onChange={(v) => update({ aiInventoryDocumentExists: v })} label="AI system inventory document exists (CBUAE Enabling Tech 2025)" />
                          <Toggle checked={survey.aiModelCardsExist} onChange={(v) => update({ aiModelCardsExist: v })} label="Model cards exist for all AI systems used" />
                          <Toggle checked={survey.humanOversightDemonstrable} onChange={(v) => update({ humanOversightDemonstrable: v })} label="Human oversight demonstrable — MLRO can override any AI decision" />
                          <Toggle checked={survey.cbueaNotified} onChange={(v) => update({ cbueaNotified: v })} label="CBUAE notified of AI tool use (CBUAE Enabling Technology 2025)" />
                        </div>
                        <div className="bg-amber-dim border border-amber/20 rounded p-3 text-11 text-ink-1">
                          Failure to document AI governance is one of the <strong>4 CBUAE requirements for AML AI tools</strong>.
                          CBUAE will ask: show the AI system inventory, the governance policy, and the model cards.
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ─── SECTION 13: Previous Inspections & History ─── */}
                {sec.id === "inspections" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><FieldLabel>Previous MoE inspection date</FieldLabel>
                        <IsoDateInput value={survey.previousInspectionDate} onChange={(iso) => update({ previousInspectionDate: iso })} className={inputCls} /></div>
                      <div><FieldLabel>Previous inspection outcome</FieldLabel>
                        <select value={survey.previousInspectionOutcome} onChange={(e) => update({ previousInspectionOutcome: e.target.value })} className={inputCls}>
                          <option value="none">No prior inspection</option>
                          <option value="satisfactory">Satisfactory</option>
                          <option value="needs-improvement">Needs Improvement</option>
                          <option value="enforcement">Enforcement action issued</option>
                        </select></div>
                    </div>
                    <Toggle checked={survey.enforcementActionsLast3Years} onChange={(v) => update({ enforcementActionsLast3Years: v })} label="Enforcement actions, warnings or fines received in the last 3 years" />
                    {survey.enforcementActionsLast3Years && (
                      <div><FieldLabel>Enforcement action details</FieldLabel>
                        <textarea value={survey.enforcementActionsDetails} onChange={(e) => update({ enforcementActionsDetails: e.target.value })} rows={2}
                          className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none resize-none"
                          placeholder="Describe the nature of the action, date, and resolution…" /></div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Toggle checked={survey.previousSurveySubmitted} onChange={(v) => update({ previousSurveySubmitted: v })} label="Previous MoE AML/CFT survey submitted (prior reporting period)" />
                      <Toggle checked={survey.moeCircularAcknowledged} onChange={(v) => update({ moeCircularAcknowledged: v })} label="Latest MoE supervisory circular received and acknowledged by MLRO" />
                    </div>
                    {survey.previousInspectionOutcome === "enforcement" && (
                      <div className="bg-red-dim border border-red/30 rounded p-3 text-11 text-red">
                        Prior enforcement action will be a key focus of the 2026 survey review. Ensure all remediation steps are fully documented and completed before submission.
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
            onClick={() => {
              try {
                const blob = new Blob([JSON.stringify(survey, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `moe-survey-${new Date().toISOString().slice(0, 10)}.json`;
                a.click(); URL.revokeObjectURL(url);
              } catch (err) { console.error("[hawkeye] moe-survey JSON export failed:", err); }
            }}>
            Export JSON
          </button>
          <a href="/governance/inspection-room" className="inline-flex items-center gap-2 px-4 py-2 rounded border border-hair-2 text-ink-1 text-12 font-medium hover:bg-bg-2 no-underline">
            Open Inspection Room ↗
          </a>
        </div>
      </div>

      <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
        MOET/AML/001/2026 · Mandatory for all mainland DNFBPs including DPMS dealers.
        Non-submission triggers on-site inspection and "High Risk" classification.
        Changes auto-save. All section responses are stored securely for audit purposes.
      </p>
    </ModuleLayout>
  );
}
