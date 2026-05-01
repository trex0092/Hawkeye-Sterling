"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import {
  REPORT_CODES,
  REPORT_CODE_LABEL,
  hasErrors,
  validateGoAml,
  type DraftEnvelope,
  type ReportCode,
  type ValidationIssue,
} from "@/lib/goaml/validate";

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS: Array<{ id: Step; label: string; sub: string }> = [
  { id: 1, label: "Report code",  sub: "STR · SAR · FFR · …" },
  { id: 2, label: "Subject",      sub: "Person or entity" },
  { id: 3, label: "Narrative",    sub: "Suspicion description" },
  { id: 4, label: "Validate",     sub: "Schema check" },
  { id: 5, label: "Export",       sub: "Download · submit" },
];

const STORAGE_KEY = "hawkeye.goaml.draft.v1";

const BLANK: DraftEnvelope = {
  reportCode: "",
  subject: { name: "", entityType: "individual" },
  narrative: "",
  amountAed: "",
  counterparty: "",
};

function loadDraft(): DraftEnvelope {
  if (typeof window === "undefined") return BLANK;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return BLANK;
    const parsed = JSON.parse(raw) as Partial<DraftEnvelope>;
    return { ...BLANK, ...parsed, subject: { ...BLANK.subject, ...(parsed.subject ?? {}) } };
  } catch { return BLANK; }
}

function saveDraft(d: DraftEnvelope): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* */ }
}

interface SubmissionState {
  status: "idle" | "fetching" | "ready" | "error";
  xml?: string;
  filename?: string;
  error?: string;
}

const inputCls = "w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1 focus:border-brand focus:outline-none";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function FText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <F label={label}>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={inputCls} />
    </F>
  );
}

function FNum({ label, value, onChange }: { label: string; value: number | ""; onChange: (v: number | "") => void }) {
  return (
    <F label={label}>
      <input type="number" min={0} step="0.01" value={value === "" ? "" : value}
        onChange={(e) => { const v = e.target.value; onChange(v === "" ? "" : Number(v)); }}
        className={`${inputCls} tabular-nums`} />
    </F>
  );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const tone = issue.level === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <div className={`text-11 border rounded px-2 py-1 ${tone}`}>
      <span className="font-mono text-10 uppercase tracking-wide-3 mr-1.5">{issue.level}</span>
      <span className="font-mono text-10 mr-1.5">{issue.field}</span>
      <span>{issue.message}</span>
    </div>
  );
}

export default function GoAmlExportPage() {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<DraftEnvelope>(BLANK);
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });
  const [aiValidation, setAiValidation] = useState<{
    score: number; grade: string; missingElements: string[];
    tippingOffRisk: boolean; tippingOffFlags: string[];
    suggestions: string[]; fatalIssues: string[]; fiuReadiness: string;
  } | null>(null);
  const [aiValidating, setAiValidating] = useState(false);

  useEffect(() => { setDraft(loadDraft()); }, []);
  useEffect(() => { saveDraft(draft); }, [draft]);

  const issues = useMemo(() => validateGoAml(draft), [draft]);
  const errors  = useMemo(() => issues.filter((i) => i.level === "error"), [issues]);
  const warnings = useMemo(() => issues.filter((i) => i.level === "warning"), [issues]);

  const can: Record<Step, boolean> = {
    1: !!draft.reportCode,
    2: draft.subject.name.trim().length >= 2,
    3: draft.narrative.trim().length >= 50,
    4: !hasErrors(issues),
    5: !hasErrors(issues),
  };

  const update = (patch: Partial<DraftEnvelope>) =>
    setDraft((prev) => ({ ...prev, ...patch }));
  const updateSubject = (patch: Partial<DraftEnvelope["subject"]>) =>
    setDraft((prev) => ({ ...prev, subject: { ...prev.subject, ...patch } }));

  const validateNarrativeAI = async () => {
    if (!draft.narrative.trim()) return;
    setAiValidating(true);
    setAiValidation(null);
    try {
      const res = await fetch("/api/goaml-validate-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative: draft.narrative, reportCode: draft.reportCode, subjectName: draft.subject.name, subjectEntityType: draft.subject.entityType, amountAed: draft.amountAed }),
      });
      if (!res.ok) return;
      const data = await res.json() as typeof aiValidation & { ok: boolean };
      if (data.ok) setAiValidation(data);
    } catch { /* silent */ }
    finally { setAiValidating(false); }
  };

  const handleGenerate = async () => {
    setSubmission({ status: "fetching" });
    const aliases = draft.subject.aliases
      ? draft.subject.aliases.split(/[,\n]/).map((a) => a.trim()).filter(Boolean)
      : undefined;
    const body = {
      reportCode: draft.reportCode as ReportCode,
      subject: {
        name: draft.subject.name.trim(),
        entityType: draft.subject.entityType,
        ...(draft.subject.jurisdiction ? { jurisdiction: draft.subject.jurisdiction.toUpperCase() } : {}),
        ...(draft.subject.dob ? { dob: draft.subject.dob } : {}),
        ...(aliases ? { aliases } : {}),
        ...(draft.subject.idNumber ? { idNumber: draft.subject.idNumber } : {}),
        ...(draft.subject.caseId ? { caseId: draft.subject.caseId } : {}),
      },
      narrative: draft.narrative,
      ...(typeof draft.amountAed === "number" && draft.amountAed > 0 ? { amountAed: draft.amountAed } : {}),
      ...(draft.counterparty ? { counterparty: draft.counterparty } : {}),
    };
    try {
      const res = await fetch("/api/goaml", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = (await res.json()) as { error?: string }; if (j?.error) detail = j.error; } catch { /* */ }
        setSubmission({ status: "error", error: detail });
        return;
      }
      const xml = await res.text();
      const dispo = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(dispo);
      setSubmission({ status: "ready", xml, filename: m?.[1] ?? "goaml-export.xml" });
    } catch (err) {
      setSubmission({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleDownload = () => {
    if (!submission.xml || !submission.filename) return;
    const blob = new Blob([submission.xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = submission.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  };

  return (
    <ModuleLayout asanaModule="goaml" asanaLabel="goAML XML Export">
      <ModuleHero
        moduleNumber={50}
        eyebrow="Module · goAML XML Export"
        title="goAML"
        titleEm="export wizard."
        intro={<><strong>Five-step guided flow.</strong> Select report code → capture subject → draft narrative → schema validate → generate XML for UAE FIU submission. Drafts auto-save to <code>localStorage</code>.</>}
      />

      {/* Step tabs — compact */}
      <div className="flex items-stretch gap-1.5 mb-4">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => setStep(s.id)}
              disabled={s.id > step && !can[(s.id - 1) as Step]}
              className={`flex-1 text-left rounded border px-2.5 py-1.5 transition ${
                step === s.id
                  ? "border-brand bg-brand-dim text-brand-deep"
                  : s.id < step
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-hair-2 bg-bg-panel text-ink-2"
              }`}
            >
              <div className="font-mono text-9 uppercase tracking-wide-3 opacity-60">Step {s.id}</div>
              <div className="text-11 font-semibold leading-tight">{s.label}</div>
              <div className="text-9 text-ink-3 leading-tight">{s.sub}</div>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-2 flex-shrink-0 ${s.id < step ? "bg-emerald-300" : "bg-hair-2"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">

        {/* Step 1 — Report code */}
        {step === 1 && (
          <div className="space-y-2">
            <p className="text-11 text-ink-2 m-0">Select the goAML envelope type. STR is default; FFR for funds-freeze actions under UN/Cabinet 74/2020.</p>
            <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-1.5">
              {REPORT_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => update({ reportCode: code })}
                  className={`text-left border rounded px-2.5 py-2 transition ${
                    draft.reportCode === code
                      ? "border-brand bg-brand-dim"
                      : "border-hair-2 bg-bg-1 hover:border-hair-3"
                  }`}
                >
                  <div className="font-mono text-11 font-bold text-ink-0">{code}</div>
                  <div className="text-10 text-ink-3 leading-snug mt-0.5">{REPORT_CODE_LABEL[code]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Subject */}
        {step === 2 && (
          <div className="space-y-2">
            {/* Row 1: entity type + name */}
            <div className="grid grid-cols-4 gap-2">
              <F label="Entity type">
                <select
                  value={draft.subject.entityType}
                  onChange={(e) => updateSubject({ entityType: e.target.value as DraftEnvelope["subject"]["entityType"] })}
                  className={inputCls}
                >
                  <option value="individual">Individual</option>
                  <option value="organisation">Organisation</option>
                  <option value="vessel">Vessel</option>
                  <option value="aircraft">Aircraft</option>
                  <option value="other">Other</option>
                </select>
              </F>
              <div className="col-span-3">
                <FText
                  label={draft.subject.entityType === "individual" ? "Full name" : "Legal name"}
                  value={draft.subject.name}
                  onChange={(v) => updateSubject({ name: v })}
                />
              </div>
            </div>

            {/* Row 2: DOB + jurisdiction + ID number + case ID */}
            <div className="grid grid-cols-4 gap-2">
              {draft.subject.entityType === "individual" && (
                <FText label="Date of birth (YYYY-MM-DD)" value={draft.subject.dob ?? ""} onChange={(v) => updateSubject({ dob: v })} placeholder="1985-04-12" />
              )}
              <FText label="Jurisdiction (ISO-2)" value={draft.subject.jurisdiction ?? ""} onChange={(v) => updateSubject({ jurisdiction: v.toUpperCase().slice(0, 2) })} placeholder="AE" />
              <FText label="ID number" value={draft.subject.idNumber ?? ""} onChange={(v) => updateSubject({ idNumber: v })} />
              <div className={draft.subject.entityType === "individual" ? "" : "col-span-2"}>
                <FText label="Internal case ID" value={draft.subject.caseId ?? ""} onChange={(v) => updateSubject({ caseId: v })} />
              </div>
            </div>

            {/* Row 3: aliases full width */}
            <FText label="Aliases (comma-separated)" value={draft.subject.aliases ?? ""} onChange={(v) => updateSubject({ aliases: v })} />
          </div>
        )}

        {/* Step 3 — Narrative */}
        {step === 3 && (
          <div className="space-y-2">
            <p className="text-11 text-ink-2 m-0">Who · what · when · where · why. Into the goAML <code>&lt;reason&gt;</code> field — 4000 char max.</p>
            <F label="Suspicion narrative">
              <textarea
                value={draft.narrative}
                onChange={(e) => update({ narrative: e.target.value })}
                rows={8}
                placeholder="Customer presented six AED 49,000 cash deposits across nine days, immediately wire-transferred to a counterparty in a FATF Call-for-Action jurisdiction. Pattern consistent with structuring (FDL 10/2025 Art.2)."
                className={`${inputCls} leading-relaxed`}
              />
            </F>
            <div className="flex items-center gap-3">
              <span className="text-10 font-mono text-ink-3">{draft.narrative.length} / 4000</span>
              <button type="button" onClick={() => void validateNarrativeAI()} disabled={aiValidating || !draft.narrative.trim()}
                className="text-11 font-semibold px-2.5 py-1 rounded border border-brand/50 bg-brand-dim text-brand-deep hover:bg-brand/20 disabled:opacity-40">
                {aiValidating ? "Validating…" : "AI Validate Narrative"}
              </button>
            </div>

            {aiValidation && (
              <div className="border border-hair-2 rounded p-2.5 space-y-1.5 bg-bg-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-mono text-10 font-bold px-2 py-px rounded ${aiValidation.grade === "PASS" ? "bg-green-dim text-green" : aiValidation.grade === "CONDITIONAL_PASS" ? "bg-amber-dim text-amber" : "bg-red-dim text-red"}`}>{aiValidation.grade.replace(/_/g," ")}</span>
                  <span className="font-mono text-10 text-ink-2">{aiValidation.score}/100</span>
                  <span className="text-10 text-ink-3 italic">{aiValidation.fiuReadiness}</span>
                </div>
                {aiValidation.fatalIssues.length > 0 && <div className="text-10 text-red font-semibold">Fatal: {aiValidation.fatalIssues.join(" · ")}</div>}
                {aiValidation.tippingOffRisk && <div className="text-10 text-red">Tipping-off risk: {aiValidation.tippingOffFlags.join(", ")}</div>}
                {aiValidation.missingElements.length > 0 && <div className="text-10 text-amber">Missing: {aiValidation.missingElements.join(" · ")}</div>}
                {aiValidation.suggestions.length > 0 && (
                  <ul className="text-10 text-ink-2 list-disc list-inside space-y-px">
                    {aiValidation.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </div>
            )}

            {/* Amount + counterparty inline */}
            <div className="grid grid-cols-2 gap-2">
              <FNum label="Amount (AED, optional)" value={typeof draft.amountAed === "number" ? draft.amountAed : ""} onChange={(v) => update({ amountAed: v })} />
              <FText label="Counterparty (optional)" value={draft.counterparty ?? ""} onChange={(v) => update({ counterparty: v })} />
            </div>
          </div>
        )}

        {/* Step 4 — Validate */}
        {step === 4 && (
          <div className="space-y-2">
            <p className="text-11 text-ink-2 m-0">Client-side check against goAML field rules. Clear all errors to proceed.</p>
            {issues.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-emerald-700 text-12">
                ✓ All checks pass — ready to generate XML.
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                  {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </div>
                {issues.map((iss, i) => (
                  <IssueRow key={`${iss.field}-${i}`} issue={iss} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 5 — Export */}
        {step === 5 && (
          <div className="space-y-2">
            {hasErrors(issues) ? (
              <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-red-700 text-12">
                Unresolved validation errors — return to step 4.
              </div>
            ) : (
              <>
                <p className="text-11 text-ink-2 m-0">Server serialises the goAML envelope. Download XML and submit via the goAML 5.x portal.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleGenerate} disabled={submission.status === "fetching"}
                    className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50">
                    {submission.status === "fetching" ? "Generating…" : submission.status === "ready" ? "Re-generate" : "Generate XML"}
                  </button>
                  {submission.status === "ready" && (
                    <button type="button" onClick={handleDownload}
                      className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1 border border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold">
                      Download {submission.filename}
                    </button>
                  )}
                </div>
                {submission.status === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-red-700 text-11">
                    {submission.error}
                  </div>
                )}
                {submission.status === "ready" && submission.xml && (
                  <details>
                    <summary className="text-10 font-mono uppercase tracking-wide-3 cursor-pointer text-ink-2 hover:text-brand">
                      Preview XML ({submission.xml.length.toLocaleString()} bytes)
                    </summary>
                    <pre className="mt-1.5 max-h-72 overflow-auto bg-bg-1 border border-hair-2 rounded p-2.5 text-10 leading-snug text-ink-1">
                      {submission.xml}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        {/* Nav */}
        <div className="flex justify-between items-center mt-4 pt-3 border-t border-hair">
          <button type="button" onClick={() => setStep((Math.max(1, step - 1) as Step))} disabled={step === 1}
            className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand disabled:opacity-50">
            ← Back
          </button>
          {step < 5 && (
            <button type="button" onClick={() => setStep((Math.min(5, step + 1) as Step))} disabled={!can[step]}
              className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50">
              Next →
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 text-10 text-ink-3 font-mono">
        Draft auto-saves to localStorage[&quot;hawkeye.goaml.draft.v1&quot;]. Validation: web/lib/goaml/validate.ts.
      </div>
    </ModuleLayout>
  );
}
