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
    return {
      ...BLANK,
      ...parsed,
      subject: { ...BLANK.subject, ...(parsed.subject ?? {}) },
    };
  } catch {
    return BLANK;
  }
}

function saveDraft(d: DraftEnvelope): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* */
  }
}

interface SubmissionState {
  status: "idle" | "fetching" | "ready" | "error";
  xml?: string;
  filename?: string;
  error?: string;
}

export default function GoAmlExportPage() {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<DraftEnvelope>(BLANK);
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });

  useEffect(() => { setDraft(loadDraft()); }, []);
  useEffect(() => { saveDraft(draft); }, [draft]);

  const issues = useMemo(() => validateGoAml(draft), [draft]);
  const errors = useMemo(() => issues.filter((i) => i.level === "error"), [issues]);
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
        let detail: string = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) detail = j.error;
        } catch { /* response was XML or empty */ }
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
    a.href = url;
    a.download = submission.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  };

  return (
    <ModuleLayout asanaModule="goaml" asanaLabel="goAML XML Export">
      <ModuleHero
        eyebrow="Module · goAML XML Export"
        title="goAML"
        titleEm="export wizard."
        intro={
          <>
            <strong>Five-step guided flow.</strong> Select a goAML 4.0/5.x
            report code, capture the subject, draft a narrative, run the
            client-side schema check, then generate a regulator-ready XML
            envelope via <code>/api/goaml</code>. Drafts auto-save to
            <code>localStorage</code> so a partial filing survives a refresh.
          </>
        }
      />

      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => setStep(s.id)}
              disabled={s.id > step && !can[(s.id - 1) as Step]}
              className={`flex-1 text-left rounded border px-3 py-2 transition ${
                step === s.id
                  ? "border-brand bg-brand-dim text-brand-deep"
                  : s.id < step
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-hair-2 bg-bg-panel text-ink-2"
              }`}
            >
              <div className="font-mono text-10 uppercase tracking-wide-3">Step {s.id}</div>
              <div className="text-12 font-semibold">{s.label}</div>
              <div className="text-10 text-ink-3">{s.sub}</div>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-3 ${s.id < step ? "bg-emerald-300" : "bg-hair-2"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6">
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Report code</h2>
            <p className="text-12 text-ink-2 m-0">
              Pick the goAML envelope type. STR is the default for routine
              suspicion; FFR is reserved for funds-freeze actions arising from
              UN/Cabinet 74/2020 designations.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {REPORT_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => update({ reportCode: code })}
                  className={`text-left border rounded p-3 transition ${
                    draft.reportCode === code
                      ? "border-brand bg-brand-dim"
                      : "border-hair-2 bg-bg-1 hover:border-hair-3"
                  }`}
                >
                  <div className="font-mono text-12 font-semibold text-ink-0">{code}</div>
                  <div className="text-11 text-ink-2 mt-1">{REPORT_CODE_LABEL[code]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Subject</h2>
            <Field label="Entity type">
              <select
                value={draft.subject.entityType}
                onChange={(e) => updateSubject({ entityType: e.target.value as DraftEnvelope["subject"]["entityType"] })}
                className="w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none"
              >
                <option value="individual">Individual</option>
                <option value="organisation">Organisation</option>
                <option value="vessel">Vessel</option>
                <option value="aircraft">Aircraft</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <FieldText
              label={draft.subject.entityType === "individual" ? "Full name" : "Legal name"}
              value={draft.subject.name}
              onChange={(v) => updateSubject({ name: v })}
            />
            {draft.subject.entityType === "individual" && (
              <FieldText
                label="Date of birth (YYYY-MM-DD)"
                value={draft.subject.dob ?? ""}
                onChange={(v) => updateSubject({ dob: v })}
                placeholder="1985-04-12"
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <FieldText
                label="Jurisdiction (ISO-2)"
                value={draft.subject.jurisdiction ?? ""}
                onChange={(v) => updateSubject({ jurisdiction: v.toUpperCase().slice(0, 2) })}
                placeholder="AE"
              />
              <FieldText
                label="ID number"
                value={draft.subject.idNumber ?? ""}
                onChange={(v) => updateSubject({ idNumber: v })}
              />
            </div>
            <FieldText
              label="Aliases (comma-separated)"
              value={draft.subject.aliases ?? ""}
              onChange={(v) => updateSubject({ aliases: v })}
            />
            <FieldText
              label="Internal case ID (optional)"
              value={draft.subject.caseId ?? ""}
              onChange={(v) => updateSubject({ caseId: v })}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Narrative</h2>
            <p className="text-12 text-ink-2 m-0">
              Describe the suspicion: who, what, when, where, why. Goes into
              the goAML <code>&lt;reason&gt;</code> field — capped at 4000
              chars by the schema.
            </p>
            <FieldArea
              label="Suspicion narrative"
              value={draft.narrative}
              onChange={(v) => update({ narrative: v })}
              rows={10}
              placeholder="Customer presented six AED 49,000 cash deposits across nine days, immediately wire-transferred to a counterparty in a FATF Call-for-Action jurisdiction. Pattern consistent with structuring (FDL 10/2025 Art.2)."
            />
            <div className="text-10 font-mono text-ink-3">
              {draft.narrative.length} / 4000 characters
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldNumber
                label="Amount (AED, optional)"
                value={typeof draft.amountAed === "number" ? draft.amountAed : ""}
                onChange={(v) => update({ amountAed: v })}
              />
              <FieldText
                label="Counterparty (optional)"
                value={draft.counterparty ?? ""}
                onChange={(v) => update({ counterparty: v })}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Schema validation</h2>
            <p className="text-12 text-ink-2 m-0">
              Client-side check against goAML field rules (length caps, ISO-2
              jurisdictions, date format, narrative ≥ 50 chars). Server
              applies the same rules before serialising; clear them all to
              proceed.
            </p>
            {issues.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-emerald-700 text-12">
                ✓ All checks pass. Ready to generate XML.
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-11 font-mono uppercase tracking-wide-3 text-ink-2">
                  {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </div>
                {issues.map((iss, i) => (
                  <IssueRow key={`${iss.field}-${i}`} issue={iss} />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Export</h2>
            {hasErrors(issues) ? (
              <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-12">
                Validation has unresolved errors — return to step 4.
              </div>
            ) : (
              <>
                <p className="text-12 text-ink-2 m-0">
                  Server signs and serialises the goAML envelope. Download the
                  resulting XML and submit through the goAML 5.x portal — or
                  attach to the case file.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={submission.status === "fetching"}
                    className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submission.status === "fetching" ? "Generating…" : submission.status === "ready" ? "Re-generate XML" : "Generate XML"}
                  </button>
                  {submission.status === "ready" && (
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold"
                    >
                      Download {submission.filename}
                    </button>
                  )}
                </div>
                {submission.status === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-12">
                    {submission.error}
                  </div>
                )}
                {submission.status === "ready" && submission.xml && (
                  <details className="mt-3">
                    <summary className="text-11 font-mono uppercase tracking-wide-3 cursor-pointer text-ink-2 hover:text-brand">
                      Preview XML ({submission.xml.length.toLocaleString()} bytes)
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto bg-bg-1 border border-hair-2 rounded p-3 text-10 leading-snug text-ink-1">
                      {submission.xml}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-hair">
          <button
            type="button"
            onClick={() => setStep((Math.max(1, step - 1) as Step))}
            disabled={step === 1}
            className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          {step < 5 && (
            <button
              type="button"
              onClick={() => setStep((Math.min(5, step + 1) as Step))}
              disabled={!can[step]}
              className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 text-11 text-ink-3 font-mono">
        Draft auto-saves to localStorage[&quot;hawkeye.goaml.draft.v1&quot;].
        Validation rules: web/lib/goaml/validate.ts.
      </div>
    </ModuleLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-11 font-mono uppercase tracking-wide-3 text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

interface TextProps { label: string; value: string; onChange: (v: string) => void; placeholder?: string }

function FieldText({ label, value, onChange, placeholder }: TextProps) {
  return (
    <Field label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none"
      />
    </Field>
  );
}

function FieldArea({ label, value, onChange, rows = 6, placeholder }: TextProps & { rows?: number }) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none leading-relaxed"
      />
    </Field>
  );
}

function FieldNumber({ label, value, onChange }: { label: string; value: number | ""; onChange: (v: number | "") => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value === "" ? "" : value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? "" : Number(v));
        }}
        className="w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none tabular-nums"
      />
    </Field>
  );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const tone = issue.level === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <div className={`text-12 border rounded px-3 py-1.5 ${tone}`}>
      <span className="font-mono text-10 uppercase tracking-wide-3 mr-2">{issue.level}</span>
      <span className="font-mono text-11 mr-2">{issue.field}</span>
      <span>{issue.message}</span>
    </div>
  );
}
