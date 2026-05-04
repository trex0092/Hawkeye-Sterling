"use client";

// goAML STR Submission — standalone MLRO filing page.
//
// Generates a goAML-compliant STR/SAR XML file for manual upload to
// the UAE FIU goAML portal.  The actual FIU API submission requires
// FIU credentials that belong to the registered reporting entity; this
// module produces the correctly-formatted XML so MLROs can review,
// download, and file without leaving the Hawkeye Sterling platform.
//
// Regulatory basis: UAE FDL 10/2025 Art.17 (48-hour STR obligation);
// UAE FIU goAML Technical Guide v3.1; FATF R.20.

import { useCallback, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { GoAmlXmlResult } from "@/app/api/goaml-xml/route";

// ────────────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface TxRow {
  id: string;
  date: string;
  amount: string;
  currency: string;
  type: string;
  description: string;
}

interface FormState {
  // Step 1 — Reporting entity
  mlroName: string;
  mlroEmail: string;
  mlroPhone: string;
  reportingEntityId: string;
  // Step 2 — Subject
  subjectName: string;
  subjectDob: string;
  subjectNationality: string;
  subjectPassport: string;
  subjectPassportCountry: string;
  subjectCountry: string;
  entityType: "individual" | "corporate";
  accountNumber: string;
  // Step 3 — Narrative & offence
  suspectedOffence: string;
  narrativeText: string;
  transactions: TxRow[];
}

const SUSPECTED_OFFENCES = [
  { value: "ML", label: "Money Laundering" },
  { value: "TF", label: "Terrorist Financing" },
  { value: "Fraud", label: "Fraud" },
  { value: "Corruption", label: "Corruption / Bribery" },
  { value: "Drug Trafficking", label: "Drug Trafficking" },
  { value: "Other", label: "Other" },
];

const BLANK_TX = (): TxRow => ({
  id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  date: "",
  amount: "",
  currency: "AED",
  type: "cash_deposit",
  description: "",
});

const BLANK_FORM: FormState = {
  mlroName: "",
  mlroEmail: "",
  mlroPhone: "",
  reportingEntityId: "",
  subjectName: "",
  subjectDob: "",
  subjectNationality: "",
  subjectPassport: "",
  subjectPassportCountry: "",
  subjectCountry: "",
  entityType: "individual",
  accountNumber: "",
  suspectedOffence: "",
  narrativeText: "",
  transactions: [BLANK_TX()],
};

const STEP_DEFS: Array<{ id: Step; label: string; sub: string }> = [
  { id: 1, label: "Reporting Entity", sub: "MLRO · institution" },
  { id: 2, label: "Subject Details",  sub: "Person · account" },
  { id: 3, label: "Narrative",        sub: "Offence · transactions" },
  { id: 4, label: "Review & Generate", sub: "XML · download" },
];

// ────────────────────────────────────────────────────────────────────
//  Step gate — can the user advance?
// ────────────────────────────────────────────────────────────────────

function canAdvance(step: Step, f: FormState): boolean {
  if (step === 1) {
    return (
      f.mlroName.trim().length >= 2 &&
      f.mlroEmail.trim().includes("@") &&
      f.mlroPhone.trim().length >= 5 &&
      f.reportingEntityId.trim().length >= 1
    );
  }
  if (step === 2) {
    return (
      f.subjectName.trim().length >= 2 &&
      f.subjectDob.trim().length === 10 &&
      f.subjectNationality.trim().length >= 2 &&
      f.subjectPassport.trim().length >= 3 &&
      f.subjectPassportCountry.trim().length >= 2 &&
      f.subjectCountry.trim().length >= 2 &&
      f.accountNumber.trim().length >= 1
    );
  }
  if (step === 3) {
    return f.narrativeText.trim().length >= 100;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────
//  Shared field components
// ────────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-11 font-mono uppercase tracking-wide-3 text-ink-2 mb-1">
      {children}
    </span>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

const inputCls =
  "w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none";
const selectCls =
  "w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none";

function Inp({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <FieldWrap label={label}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </FieldWrap>
  );
}

// ────────────────────────────────────────────────────────────────────
//  Step 4 result state
// ────────────────────────────────────────────────────────────────────

type GenState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "done"; result: GoAmlXmlResult }
  | { status: "error"; message: string };

// ────────────────────────────────────────────────────────────────────
//  Main page
// ────────────────────────────────────────────────────────────────────

export default function GoAmlSubmissionPage() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [gen, setGen] = useState<GenState>({ status: "idle" });
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const upd = (patch: Partial<FormState>) =>
    setForm((p) => ({ ...p, ...patch }));

  // Transactions helpers
  const addTx = () => upd({ transactions: [...form.transactions, BLANK_TX()] });
  const removeTx = (id: string) =>
    upd({ transactions: form.transactions.filter((t) => t.id !== id) });
  const updTx = (id: string, patch: Partial<TxRow>) =>
    upd({
      transactions: form.transactions.map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
    });

  const handleGenerate = useCallback(async () => {
    setGen({ status: "generating" });
    try {
      const payload = {
        mlroName: form.mlroName.trim(),
        mlroEmail: form.mlroEmail.trim(),
        mlroPhone: form.mlroPhone.trim(),
        reportingEntityId: form.reportingEntityId.trim(),
        subjectName: form.subjectName.trim(),
        subjectDob: form.subjectDob.trim(),
        subjectNationality: form.subjectNationality.trim().toUpperCase(),
        subjectPassport: form.subjectPassport.trim(),
        subjectPassportCountry: form.subjectPassportCountry.trim().toUpperCase(),
        subjectCountry: form.subjectCountry.trim().toUpperCase(),
        accountNumber: form.accountNumber.trim(),
        narrativeText: form.narrativeText.trim(),
        suspectedOffence: form.suspectedOffence,
        transactions: form.transactions
          .filter((t) => t.date || t.amount)
          .map((t) => ({
            date: t.date,
            amount: parseFloat(t.amount) || 0,
            currency: t.currency || "AED",
            type: t.type,
            description: t.description,
          })),
      };
      const res = await fetch("/api/goaml-xml", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setGen({ status: "error", message: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as GoAmlXmlResult;
      setGen({ status: "done", result: data });
    } catch (err) {
      setGen({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [form]);

  const handleDownload = () => {
    if (gen.status !== "done") return;
    const { xml, reportRef } = gen.result;
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `goaml-str-${reportRef}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  };

  const handleCopy = async () => {
    if (gen.status !== "done") return;
    try {
      await navigator.clipboard.writeText(gen.result.xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      /* clipboard API blocked — silently fail */
    }
  };

  const toggleCheck = (item: string) =>
    setChecklist((p) => ({ ...p, [item]: !p[item] }));

  const narrativeLen = form.narrativeText.length;

  return (
    <ModuleLayout asanaModule="goaml-submission" asanaLabel="goAML STR Submission">
      <ModuleHero
        eyebrow="Module · goAML Filing"
        title="STR / SAR"
        titleEm="submission."
        intro={
          <>
            Generate a goAML-compliant XML file for manual upload to the UAE FIU
            portal. Filing is mandatory within 48 hours of suspicion crystallisation
            under <strong>UAE FDL 10/2025 Art.17</strong> and the{" "}
            <strong>UAE FIU goAML Technical Guide v3.1</strong>. The platform
            produces the correctly-formatted XML — submit through{" "}
            <a
              href="https://goaml.uae.gov.ae"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline"
            >
              goaml.uae.gov.ae
            </a>{" "}
            using your registered FIU credentials.
          </>
        }
        kpis={[
          { value: "14", label: "STRs filed this year" },
          { value: "2.3 days", label: "Avg filing time" },
          { value: "Online", label: "goAML portal status" },
        ]}
      />

      {/* ── Step indicator ────────────────────────────────────────── */}
      <div className="flex items-center gap-0 mb-6">
        {STEP_DEFS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => {
                // Only allow going back, or to a completed step
                if (s.id <= step) setStep(s.id);
              }}
              disabled={s.id > step}
              className={`flex-1 text-left rounded border px-3 py-2 transition ${
                step === s.id
                  ? "border-brand bg-brand-dim text-brand-deep"
                  : s.id < step
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-hair-2 bg-bg-panel text-ink-3 cursor-default"
              }`}
            >
              <div className="font-mono text-9 uppercase tracking-wide-3">
                Step {s.id}
              </div>
              <div className="text-11 font-semibold mt-0.5">{s.label}</div>
              <div className="text-9 text-ink-3">{s.sub}</div>
            </button>
            {i < STEP_DEFS.length - 1 && (
              <div
                className={`h-px w-3 shrink-0 ${
                  s.id < step ? "bg-emerald-300" : "bg-hair-2"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Step panels ───────────────────────────────────────────── */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6">

        {/* ── Step 1: Reporting Entity ─────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <StepHeading>Reporting Entity & MLRO</StepHeading>
            <p className="text-12 text-ink-2 m-0">
              Enter the MLRO who is authorising this filing and the FIU-registered
              entity ID. The institution name is pre-filled.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Inp
                label="MLRO Full Name"
                value={form.mlroName}
                onChange={(v) => upd({ mlroName: v })}
                placeholder="Luisa Fernanda Al-Rashid"
              />
              <Inp
                label="MLRO Email"
                value={form.mlroEmail}
                onChange={(v) => upd({ mlroEmail: v })}
                placeholder="mlro@entity.ae"
                type="email"
              />
              <Inp
                label="MLRO Phone"
                value={form.mlroPhone}
                onChange={(v) => upd({ mlroPhone: v })}
                placeholder="+971-50-000-0000"
              />
              <Inp
                label="Reporting Entity ID (FIU-issued goAML ID)"
                value={form.reportingEntityId}
                onChange={(v) => upd({ reportingEntityId: v })}
                placeholder="AE-DPMS-00123"
              />
            </div>
            <div className="mt-2">
              <Label>Institution</Label>
              <div className="text-12 border border-hair-2 bg-bg-1 text-ink-2 rounded px-2 py-1.5 select-none">
                Hawkeye Sterling DPMS
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Subject Details ──────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <StepHeading>Subject Details</StepHeading>
            <p className="text-12 text-ink-2 m-0">
              Enter subject identifying information as it appears in the CDD file.
              Passport details are used for the goAML identification block.
            </p>

            <FieldWrap label="Entity Type">
              <div className="flex gap-3">
                {(["individual", "corporate"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => upd({ entityType: t })}
                    className={`flex-1 border rounded px-3 py-1.5 text-12 font-medium transition ${
                      form.entityType === t
                        ? "border-brand bg-brand-dim text-brand-deep"
                        : "border-hair-2 bg-bg-1 text-ink-2 hover:border-hair-3"
                    }`}
                  >
                    {t === "individual" ? "Individual" : "Corporate"}
                  </button>
                ))}
              </div>
            </FieldWrap>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Inp
                label="Subject Full Name"
                value={form.subjectName}
                onChange={(v) => upd({ subjectName: v })}
                placeholder="Ahmad Mohammed Al-Mansouri"
              />
              <Inp
                label="Date of Birth (YYYY-MM-DD)"
                value={form.subjectDob}
                onChange={(v) => upd({ subjectDob: v })}
                placeholder="1985-04-12"
              />
              <Inp
                label="Nationality (ISO-2 or full)"
                value={form.subjectNationality}
                onChange={(v) => upd({ subjectNationality: v })}
                placeholder="AE"
              />
              <Inp
                label="Passport / Emirates ID Number"
                value={form.subjectPassport}
                onChange={(v) => upd({ subjectPassport: v })}
                placeholder="A12345678"
              />
              <Inp
                label="Passport Issuing Country (ISO-2)"
                value={form.subjectPassportCountry}
                onChange={(v) => upd({ subjectPassportCountry: v })}
                placeholder="AE"
              />
              <Inp
                label="Country of Residence (ISO-2)"
                value={form.subjectCountry}
                onChange={(v) => upd({ subjectCountry: v })}
                placeholder="AE"
              />
            </div>
            <Inp
              label="Account Number(s) at Hawkeye Sterling DPMS"
              value={form.accountNumber}
              onChange={(v) => upd({ accountNumber: v })}
              placeholder="DPMS-2024-00891"
            />
          </div>
        )}

        {/* ── Step 3: Narrative & Offence ──────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <StepHeading>Narrative &amp; Suspected Offence</StepHeading>
            <p className="text-12 text-ink-2 m-0">
              Write the suspicion narrative describing who, what, when, where, and
              why. Minimum 100 characters required; 200+ is the UAE FIU expectation.
              Reference the crystallisation date and the relevant FDL provision.
            </p>

            <FieldWrap label="Suspected Offence">
              <select
                value={form.suspectedOffence}
                onChange={(e) => upd({ suspectedOffence: e.target.value })}
                className={selectCls}
              >
                <option value="">— Select offence —</option>
                {SUSPECTED_OFFENCES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldWrap>

            <FieldWrap label={`Narrative (${narrativeLen} / 4000 chars)`}>
              <textarea
                value={form.narrativeText}
                onChange={(e) => upd({ narrativeText: e.target.value })}
                rows={10}
                maxLength={4000}
                placeholder="On [DATE], Hawkeye Sterling DPMS identified suspicious activity in account [ACCOUNT_NO] held by [CUSTOMER NAME]. Review of account activity from [START_DATE] to [END_DATE] revealed [DESCRIBE PATTERN]. The activity is inconsistent with the customer's stated business profile. Suspicion crystallised on [DATE] upon MLRO review. This STR is filed pursuant to UAE FDL 10/2025 Art.17 within 48 hours of crystallisation."
                className={`${inputCls} leading-relaxed`}
              />
              <div
                className={`text-10 font-mono mt-1 ${
                  narrativeLen < 100
                    ? "text-red"
                    : narrativeLen < 200
                      ? "text-amber"
                      : "text-ink-3"
                }`}
              >
                {narrativeLen < 100
                  ? `${100 - narrativeLen} more characters required`
                  : narrativeLen < 200
                    ? `${200 - narrativeLen} more characters recommended (FIU threshold)`
                    : "Length OK"}
              </div>
            </FieldWrap>

            {/* Transaction table */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <Label>Transactions</Label>
                <button
                  type="button"
                  onClick={addTx}
                  className="text-10 font-mono uppercase tracking-wide-3 px-2 py-0.5 border border-brand rounded text-brand hover:bg-brand-dim"
                >
                  + Add row
                </button>
              </div>
              <div className="space-y-2">
                {form.transactions.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className="grid grid-cols-[100px_90px_70px_110px_1fr_28px] gap-1.5 items-start"
                  >
                    <div>
                      {idx === 0 && (
                        <span className="block text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">
                          Date
                        </span>
                      )}
                      <input
                        type="text"
                        value={tx.date}
                        onChange={(e) => updTx(tx.id, { date: e.target.value })}
                        placeholder="YYYY-MM-DD"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      {idx === 0 && (
                        <span className="block text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">
                          Amount
                        </span>
                      )}
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={tx.amount}
                        onChange={(e) => updTx(tx.id, { amount: e.target.value })}
                        placeholder="0.00"
                        className={`${inputCls} tabular-nums`}
                      />
                    </div>
                    <div>
                      {idx === 0 && (
                        <span className="block text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">
                          CCY
                        </span>
                      )}
                      <input
                        type="text"
                        value={tx.currency}
                        onChange={(e) =>
                          updTx(tx.id, {
                            currency: e.target.value.toUpperCase().slice(0, 3),
                          })
                        }
                        placeholder="AED"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      {idx === 0 && (
                        <span className="block text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">
                          Type
                        </span>
                      )}
                      <select
                        value={tx.type}
                        onChange={(e) => updTx(tx.id, { type: e.target.value })}
                        className={selectCls}
                      >
                        <option value="cash_deposit">Cash deposit</option>
                        <option value="cash_withdrawal">Cash withdrawal</option>
                        <option value="wire_transfer">Wire transfer</option>
                        <option value="purchase">Purchase</option>
                        <option value="sale">Sale</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      {idx === 0 && (
                        <span className="block text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">
                          Description
                        </span>
                      )}
                      <input
                        type="text"
                        value={tx.description}
                        onChange={(e) =>
                          updTx(tx.id, { description: e.target.value })
                        }
                        placeholder="Brief description"
                        className={inputCls}
                      />
                    </div>
                    <div className={idx === 0 ? "mt-4" : ""}>
                      <button
                        type="button"
                        onClick={() => removeTx(tx.id)}
                        disabled={form.transactions.length === 1}
                        className="w-7 h-7 flex items-center justify-center border border-hair-2 rounded text-ink-3 hover:border-red hover:text-red disabled:opacity-30 disabled:cursor-not-allowed text-14 leading-none"
                        title="Remove row"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Review & Generate ────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <StepHeading>Review &amp; Generate XML</StepHeading>

            {/* Data summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SummaryCard title="Reporting Entity">
                <SummaryRow label="MLRO" value={form.mlroName} />
                <SummaryRow label="Email" value={form.mlroEmail} />
                <SummaryRow label="Phone" value={form.mlroPhone} />
                <SummaryRow label="Entity ID" value={form.reportingEntityId} />
                <SummaryRow label="Institution" value="Hawkeye Sterling DPMS" />
              </SummaryCard>
              <SummaryCard title="Subject">
                <SummaryRow label="Name" value={form.subjectName} />
                <SummaryRow label="DOB" value={form.subjectDob} />
                <SummaryRow label="Nationality" value={form.subjectNationality} />
                <SummaryRow label="Passport" value={form.subjectPassport} />
                <SummaryRow
                  label="Passport country"
                  value={form.subjectPassportCountry}
                />
                <SummaryRow label="Country" value={form.subjectCountry} />
                <SummaryRow label="Account" value={form.accountNumber} />
              </SummaryCard>
              <SummaryCard title="Offence & Narrative" className="md:col-span-2">
                <SummaryRow label="Suspected offence" value={form.suspectedOffence || "—"} />
                <div className="mt-1.5">
                  <span className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                    Narrative ({form.narrativeText.length} chars)
                  </span>
                  <p className="text-12 text-ink-1 mt-0.5 whitespace-pre-wrap line-clamp-4">
                    {form.narrativeText || "—"}
                  </p>
                </div>
              </SummaryCard>
              {form.transactions.length > 0 && (
                <SummaryCard title="Transactions" className="md:col-span-2">
                  <div className="overflow-x-auto">
                    <table className="text-11 w-full border-collapse">
                      <thead>
                        <tr className="text-ink-3 border-b border-hair-2">
                          <th className="text-left font-mono uppercase tracking-wide-3 text-9 pb-1 pr-3">Date</th>
                          <th className="text-right font-mono uppercase tracking-wide-3 text-9 pb-1 pr-3">Amount</th>
                          <th className="text-left font-mono uppercase tracking-wide-3 text-9 pb-1 pr-3">CCY</th>
                          <th className="text-left font-mono uppercase tracking-wide-3 text-9 pb-1 pr-3">Type</th>
                          <th className="text-left font-mono uppercase tracking-wide-3 text-9 pb-1">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.transactions.map((tx) => (
                          <tr key={tx.id} className="border-b border-hair">
                            <td className="py-1 pr-3 font-mono text-10">{tx.date || "—"}</td>
                            <td className="py-1 pr-3 font-mono text-10 text-right tabular-nums">{tx.amount || "—"}</td>
                            <td className="py-1 pr-3">{tx.currency}</td>
                            <td className="py-1 pr-3">{tx.type}</td>
                            <td className="py-1 text-ink-2">{tx.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SummaryCard>
              )}
            </div>

            {/* Generate button */}
            <div className="pt-2 border-t border-hair">
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={gen.status === "generating"}
                  className="text-11 font-mono uppercase tracking-wide-3 px-4 py-2 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {gen.status === "generating"
                    ? "Generating XML…"
                    : gen.status === "done"
                      ? "Re-generate XML"
                      : "Generate goAML XML"}
                </button>
                {gen.status === "done" && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="text-11 font-mono uppercase tracking-wide-3 px-4 py-2 border border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold transition"
                    >
                      Download XML
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="text-11 font-mono uppercase tracking-wide-3 px-4 py-2 border border-hair-2 bg-bg-1 text-ink-1 hover:border-brand hover:text-brand rounded font-semibold transition"
                    >
                      {copied ? "Copied!" : "Copy XML"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Error state */}
            {gen.status === "error" && (
              <div className="bg-red-dim border border-red rounded p-3 text-12 text-red">
                <span className="font-mono text-10 uppercase tracking-wide-3 mr-2">
                  Error
                </span>
                {gen.message}
              </div>
            )}

            {/* Validation banners */}
            {gen.status === "done" && gen.result.validationErrors.length > 0 && (
              <div className="space-y-1">
                {gen.result.validationErrors.map((e, i) => (
                  <div
                    key={i}
                    className="text-12 border border-red rounded px-3 py-1.5 bg-red-dim text-red"
                  >
                    <span className="font-mono text-10 uppercase tracking-wide-3 mr-2">
                      Error
                    </span>
                    {e}
                  </div>
                ))}
              </div>
            )}
            {gen.status === "done" && gen.result.validationWarnings.length > 0 && (
              <div className="space-y-1">
                {gen.result.validationWarnings.map((w, i) => (
                  <div
                    key={i}
                    className="text-12 border border-amber rounded px-3 py-1.5 bg-amber-dim text-amber"
                  >
                    <span className="font-mono text-10 uppercase tracking-wide-3 mr-2">
                      Warning
                    </span>
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Report ref */}
            {gen.status === "done" && (
              <div className="text-11 font-mono text-ink-2">
                Report reference:{" "}
                <span className="text-ink-0">{gen.result.reportRef}</span>
              </div>
            )}

            {/* Generated XML preview */}
            {gen.status === "done" && (
              <details>
                <summary className="text-11 font-mono uppercase tracking-wide-3 cursor-pointer text-ink-2 hover:text-brand">
                  Preview XML ({gen.result.xml.length.toLocaleString()} bytes)
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto bg-bg-1 border border-hair-2 rounded p-3 text-10 leading-snug text-ink-1 whitespace-pre">
                  {gen.result.xml}
                </pre>
              </details>
            )}

            {/* Submission checklist */}
            {gen.status === "done" && (
              <div className="mt-4 border border-hair-2 rounded-lg p-4">
                <div className="text-12 font-semibold text-ink-0 mb-3">
                  Pre-submission checklist
                </div>
                <div className="space-y-2">
                  {gen.result.submissionChecklist.map((item) => (
                    <label
                      key={item}
                      className="flex items-start gap-2.5 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={!!checklist[item]}
                        onChange={() => toggleCheck(item)}
                        className="mt-0.5 accent-brand shrink-0"
                      />
                      <span
                        className={`text-12 transition ${
                          checklist[item]
                            ? "line-through text-ink-3"
                            : "text-ink-1"
                        }`}
                      >
                        {item}
                      </span>
                    </label>
                  ))}
                </div>
                {Object.values(checklist).filter(Boolean).length ===
                  gen.result.submissionChecklist.length && (
                  <div className="mt-3 text-12 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                    All checklist items confirmed — ready to file via goAML portal.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Navigation footer ─────────────────────────────────── */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-hair">
          <button
            type="button"
            onClick={() => setStep((Math.max(1, step - 1) as Step))}
            disabled={step === 1}
            className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            ← Back
          </button>
          {step < 4 && (
            <button
              type="button"
              onClick={() => setStep((step + 1) as Step)}
              disabled={!canAdvance(step, form)}
              className="text-11 font-mono uppercase tracking-wide-3 px-4 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next →
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 text-11 text-ink-3 font-mono">
        Regulatory basis: UAE FDL 10/2025 Art.17 · UAE FIU goAML Technical
        Guide v3.1 · FATF R.20. XML generated by{" "}
        <code>/api/goaml-xml</code>.
      </div>
    </ModuleLayout>
  );
}

// ────────────────────────────────────────────────────────────────────
//  Small layout primitives local to this page
// ────────────────────────────────────────────────────────────────────

function StepHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-14 font-semibold text-ink-0 m-0 mb-1">{children}</h2>
  );
}

function SummaryCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-hair-2 rounded-lg p-4 bg-bg-1 ${className}`}
    >
      <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 mb-2">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 text-12">
      <span className="text-ink-3 shrink-0 min-w-[100px]">{label}</span>
      <span className="text-ink-0 font-medium truncate">{value || "—"}</span>
    </div>
  );
}
