"use client";

// Reusable goAML export wizard mounted as a modal. Mounted from
// /str-cases as a row action — operator clicks "Export to goAML" on
// any STR/SAR row, the wizard opens pre-filled with that case's
// subject + report kind + amount, and produces the goAML XML
// envelope via /api/goaml.
//
// The standalone /goaml-export page still exists (off-nav) using the
// same /api/goaml backend; this modal is the "from a real case"
// entry point regulators expect to see in an audit trail.

import { useEffect, useMemo, useRef, useState } from "react";
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
  { id: 1, label: "Report code", sub: "STR · SAR · FFR · …" },
  { id: 2, label: "Subject",     sub: "Person or entity" },
  { id: 3, label: "Narrative",   sub: "Suspicion description" },
  { id: 4, label: "Validate",    sub: "Schema check" },
  { id: 5, label: "Export",      sub: "Download · submit" },
];

const BLANK: DraftEnvelope = {
  reportCode: "",
  subject: { name: "", entityType: "individual" },
  narrative: "",
  amountAed: "",
  counterparty: "",
};

// Map a /str-cases row into a goAML draft. The case row carries
// subject + amountAed + reportKind; other fields stay blank for the
// operator to fill before validation.
export interface CasePrefill {
  id?: string;
  subject?: string;
  reportKind?: string;
  amountAed?: string;
  narrative?: string;
}

function prefillToDraft(p: CasePrefill | undefined): DraftEnvelope {
  if (!p) return BLANK;
  const reportCode = (REPORT_CODES as readonly string[]).includes(p.reportKind ?? "")
    ? (p.reportKind as ReportCode)
    : "";
  const amount = p.amountAed && /^\d+(\.\d+)?$/.test(p.amountAed) ? Number(p.amountAed) : "";
  return {
    reportCode,
    subject: {
      name: p.subject?.trim() ?? "",
      entityType: "individual",
      ...(p.id ? { caseId: p.id } : {}),
    },
    narrative: p.narrative ?? "",
    amountAed: amount,
    counterparty: "",
  };
}

interface SubmissionState {
  status: "idle" | "fetching" | "ready" | "error";
  xml?: string;
  filename?: string;
  error?: string;
}

interface GoamlExportModalProps {
  open: boolean;
  onClose: () => void;
  /** When supplied, the wizard initialises from this case row instead
   *  of the empty draft. The case id flows through to the goAML
   *  envelope so the FIU filing is traceable to the case register. */
  prefill?: CasePrefill | undefined;
  /** Fires after a successful generate so the host can persist the
   *  export receipt on the case (filename + timestamp). */
  onExportComplete?: ((info: { filename: string; xmlBytes: number }) => void) | undefined;
}

export function GoamlExportModal({ open, onClose, prefill, onExportComplete }: GoamlExportModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<DraftEnvelope>(BLANK);
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Re-prefill every time the modal is opened so a stale draft from
  // an earlier case can't bleed in.
  useEffect(() => {
    if (open) {
      setDraft(prefillToDraft(prefill));
      setStep(1);
      setSubmission({ status: "idle" });
    }
  }, [open, prefill]);

  // ESC closes; outside-click handled by the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
      if (!mountedRef.current) return;
      if (!res.ok) {
        let detail: string = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) detail = j.error;
        } catch { /* */ }
        setSubmission({ status: "error", error: detail });
        return;
      }
      const xml = await res.text();
      if (!mountedRef.current) return;
      const dispo = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(dispo);
      const filename = m?.[1] ?? "goaml-export.xml";
      setSubmission({ status: "ready", xml, filename });
      onExportComplete?.({ filename, xmlBytes: xml.length });
    } catch (err) {
      if (mountedRef.current) setSubmission({ status: "error", error: err instanceof Error ? err.message : String(err) });
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-panel border border-hair-2 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-baseline justify-between p-5 border-b border-hair-2 sticky top-0 bg-bg-panel">
          <div>
            <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">
              goAML XML export · 5-step wizard
            </div>
            <h2 className="text-15 font-semibold text-ink-0 m-0 mt-0.5">
              {prefill?.id ? `Export case ${prefill.id} to goAML` : "Export to goAML"}
            </h2>
            {prefill?.subject ? (
              <div className="text-11 text-ink-2 mt-0.5">
                Pre-filled from case register · subject <strong>{prefill.subject}</strong>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close goAML export wizard"
            className="text-ink-3 hover:text-ink-0 text-18 leading-none px-2 py-1"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-5">
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
                        : "border-hair-2 bg-bg-1 text-ink-2"
                  }`}
                >
                  <div className="font-mono text-9 uppercase tracking-wide-3">Step {s.id}</div>
                  <div className="text-11 font-semibold">{s.label}</div>
                  <div className="text-9 text-ink-3">{s.sub}</div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-2 ${s.id < step ? "bg-emerald-300" : "bg-hair-2"}`} />
                )}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-13 font-semibold text-ink-0 m-0">Report code</h3>
              <p className="text-11 text-ink-2 m-0">
                Pick the goAML envelope type. STR is the default for routine
                suspicion; FFR is reserved for funds-freeze actions.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {REPORT_CODES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => update({ reportCode: code })}
                    className={`text-left border rounded p-2.5 transition ${
                      draft.reportCode === code
                        ? "border-brand bg-brand-dim"
                        : "border-hair-2 bg-bg-1 hover:border-hair-3"
                    }`}
                  >
                    <div className="font-mono text-12 font-semibold text-ink-0">{code}</div>
                    <div className="text-10 text-ink-2 mt-1">{REPORT_CODE_LABEL[code]}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-13 font-semibold text-ink-0 m-0">Subject</h3>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                label="Internal case ID"
                value={draft.subject.caseId ?? ""}
                onChange={(v) => updateSubject({ caseId: v })}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-13 font-semibold text-ink-0 m-0">Narrative</h3>
              <p className="text-11 text-ink-2 m-0">
                Describe the suspicion — who, what, when, where, why. ≥ 50 characters required.
              </p>
              <FieldArea
                label="Suspicion narrative"
                value={draft.narrative}
                onChange={(v) => update({ narrative: v })}
                rows={8}
                placeholder="Customer presented six AED 49,000 cash deposits across nine days, immediately wire-transferred to a counterparty in a FATF Call-for-Action jurisdiction. Pattern consistent with structuring (FDL 10/2025 Art.2)."
              />
              <div className="text-10 font-mono text-ink-3">
                {draft.narrative.length} / 4000 characters
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <h3 className="text-13 font-semibold text-ink-0 m-0">Schema validation</h3>
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
              <h3 className="text-13 font-semibold text-ink-0 m-0">Export</h3>
              {hasErrors(issues) ? (
                <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-12">
                  Validation has unresolved errors — return to step 4.
                </div>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={submission.status === "fetching"}
                      className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submission.status === "fetching"
                        ? "Generating…"
                        : submission.status === "ready"
                          ? "Re-generate XML"
                          : "Generate XML"}
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
                    <details className="mt-2">
                      <summary className="text-10 font-mono uppercase tracking-wide-3 cursor-pointer text-ink-2 hover:text-brand">
                        Preview XML ({submission.xml.length.toLocaleString()} bytes)
                      </summary>
                      <pre className="mt-2 max-h-60 overflow-auto bg-bg-1 border border-hair-2 rounded p-3 text-10 leading-snug text-ink-1">
                        {submission.xml}
                      </pre>
                    </details>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex justify-between items-center mt-5 pt-4 border-t border-hair">
            <button
              type="button"
              onClick={() => setStep((Math.max(1, step - 1) as Step))}
              disabled={step === 1}
              className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep((Math.min(5, step + 1) as Step))}
                disabled={!can[step]}
                className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
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
