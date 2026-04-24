"use client";

import { useState } from "react";
import type { CDDPosture } from "@/lib/types";

const RELATIONSHIP_TYPES_INDIVIDUAL = [
  "UBO", "Customer", "Correspondent", "Counterparty", "Director", "Authorised Signatory",
];
const RELATIONSHIP_TYPES_CORPORATE = [
  "Supplier", "Customer", "Correspondent", "Intermediary", "Counterparty", "Refiner",
];
const RISK_CATEGORIES = [
  "High-risk country",
  "PEP exposure",
  "Dual-use goods",
  "Cash-intensive business",
  "Crypto / virtual assets",
  "DNFBP",
  "Offshore jurisdiction",
  "NGO / charity",
];

export interface ScreeningFormData {
  entityType: "individual" | "organisation";
  name: string;
  alternateNames: string[];
  enableTransposition: boolean;
  caseId: string;
  group: string;
  gender?: "male" | "female";
  dob?: { day?: string; month?: string; year?: string };
  placeOfBirth?: string;
  countryLocation?: string;
  citizenship?: string;
  registeredCountry?: string;
  identification?: {
    number?: string;
    issuerCountry?: string;
    idType?: string;
  };
  checkTypes: { worldCheck: boolean; passport: boolean };
  ongoingScreening: boolean;
  relationshipType?: string;
  cddPosture?: CDDPosture;
  riskCategory?: string;
  notes?: string;
}

interface NewScreeningFormProps {
  suggestedCaseId: string;
  onScreen: (data: ScreeningFormData) => void;
  onSave: (data: ScreeningFormData) => void;
  onCancel: () => void;
}

const EMPTY_FORM = (caseId: string): ScreeningFormData => ({
  entityType: "individual",
  name: "",
  alternateNames: [],
  enableTransposition: false,
  caseId,
  group: "",
  checkTypes: { worldCheck: true, passport: false },
  ongoingScreening: true,
  cddPosture: "CDD",
});

const MONTHS = [
  "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
];

export function NewScreeningForm({
  suggestedCaseId,
  onScreen,
  onSave,
  onCancel,
}: NewScreeningFormProps) {
  const [form, setForm] = useState<ScreeningFormData>(EMPTY_FORM(suggestedCaseId));
  const [altInput, setAltInput] = useState("");
  const [dobError, setDobError] = useState<string | null>(null);

  const valid = form.name.trim().length >= 2;

  const patch = (p: Partial<ScreeningFormData>) =>
    setForm((f) => ({ ...f, ...p }));

  const addAlias = () => {
    const parts = altInput
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    patch({ alternateNames: [...form.alternateNames, ...parts] });
    setAltInput("");
  };

  const removeAlias = (idx: number) =>
    patch({
      alternateNames: form.alternateNames.filter((_, i) => i !== idx),
    });

  const validateAndSubmit = (action: "screen" | "save") => {
    // DOB validation
    if (form.entityType === "individual" && form.dob) {
      const { day, month, year } = form.dob;
      if ((day || month || year) && !(day && month && year)) {
        setDobError("Complete all date-of-birth fields or leave all blank.");
        return;
      }
      if (year && (year.length !== 4 || Number(year) < 1900 || Number(year) > new Date().getFullYear())) {
        setDobError("Enter a valid 4-digit birth year.");
        return;
      }
    }
    setDobError(null);
    if (action === "screen") onScreen(form);
    else onSave(form);
  };

  const clear = () => {
    setForm(EMPTY_FORM(suggestedCaseId));
    setAltInput("");
    setDobError(null);
  };

  const relationshipOptions =
    form.entityType === "individual"
      ? RELATIONSHIP_TYPES_INDIVIDUAL
      : RELATIONSHIP_TYPES_CORPORATE;

  return (
    <div
      className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden grid"
      style={{ gridTemplateColumns: "240px 1fr" }}
    >
      {/* ── Left: Screening settings ─────────────────────────────── */}
      <aside className="bg-transparent border-r border-hair p-4">
        <SettingsHeading>Screening settings</SettingsHeading>

        <SettingsGroup label="Entity type">
          <EntityTypeRow
            active={form.entityType === "individual"}
            onClick={() => patch({ entityType: "individual" })}
            icon="👤"
            label="Individual"
          />
          <EntityTypeRow
            active={form.entityType === "organisation"}
            onClick={() => patch({ entityType: "organisation" })}
            icon="🏛"
            label="Organisation"
          />
        </SettingsGroup>

        <SettingsGroup label="Check types">
          <ToggleRow
            icon="🌐"
            label="World-check"
            on
            locked
            onToggle={() => {}}
          />
          <ToggleRow
            icon="🛂"
            label="Passport check"
            on={form.checkTypes.passport}
            onToggle={() =>
              patch({
                checkTypes: {
                  ...form.checkTypes,
                  passport: !form.checkTypes.passport,
                },
              })
            }
          />
        </SettingsGroup>

        <SettingsGroup label="CDD posture">
          {(["CDD", "EDD", "SDD"] as CDDPosture[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => patch({ cddPosture: p })}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-12 text-left w-full transition-colors ${
                form.cddPosture === p
                  ? "bg-brand-dim text-brand-deep border-l-2 border-brand font-semibold"
                  : "text-ink-1 hover:bg-bg-2 border-l-2 border-transparent"
              }`}
            >
              {p === "EDD" ? "⚡ EDD — Enhanced" : p === "SDD" ? "🔵 SDD — Simplified" : "🟢 CDD — Standard"}
            </button>
          ))}
        </SettingsGroup>

        <SettingsGroup label="Ongoing screening">
          <ToggleRow
            icon="🔁"
            label="World-check"
            on={form.ongoingScreening}
            onToggle={() => patch({ ongoingScreening: !form.ongoingScreening })}
          />
          <p className="text-10.5 text-ink-2 mt-2 leading-snug">
            Re-screens twice daily. Changes appear in the audit trail.
          </p>
        </SettingsGroup>
      </aside>

      {/* ── Right: Form fields ───────────────────────────────────── */}
      <section className="bg-bg-panel p-6">
        <SettingsHeading>Single screening</SettingsHeading>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={
                form.entityType === "individual"
                  ? "Full legal name"
                  : "Registered entity name"
              }
              className={inputCls}
            />
          </Field>

          <Field label="Relationship type">
            <select
              value={form.relationshipType ?? ""}
              onChange={(e) => { if (e.target.value) patch({ relationshipType: e.target.value }); else patch({}); }}
              className={inputCls}
            >
              <option value="">Select…</option>
              {relationshipOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Alternate name(s)">
          <div className="flex gap-2">
            <input
              value={altInput}
              onChange={(e) => setAltInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ";") {
                  e.preventDefault();
                  addAlias();
                }
              }}
              placeholder="Press Enter or ; to add"
              className={inputCls}
            />
          </div>
          {form.alternateNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.alternateNames.map((a, i) => (
                <span
                  key={`${a}-${i}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-2 text-ink-1 text-11"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => removeAlias(i)}
                    className="text-ink-3 hover:text-ink-0"
                    aria-label={`Remove ${a}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        {form.entityType === "individual" && (
          <label className="flex items-center gap-2 mb-4 text-12 text-ink-1 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enableTransposition}
              onChange={(e) => patch({ enableTransposition: e.target.checked })}
              className="accent-brand"
            />
            Enable name transposition screening
          </label>
        )}

        <div className="grid grid-cols-3 gap-4">
          <Field label="Case ID">
            <input
              value={form.caseId}
              onChange={(e) => patch({ caseId: e.target.value })}
              placeholder="Case ID"
              className={inputCls}
            />
          </Field>
          <Field label="Group">
            <input
              value={form.group}
              onChange={(e) => patch({ group: e.target.value })}
              placeholder="Type a group"
              className={inputCls}
            />
          </Field>
          <Field label="Risk category">
            <select
              value={form.riskCategory ?? ""}
              onChange={(e) => { if (e.target.value) patch({ riskCategory: e.target.value }); else patch({}); }}
              className={inputCls}
            >
              <option value="">None</option>
              {RISK_CATEGORIES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>

        {form.entityType === "individual" ? (
          <>
            <Field label="Gender">
              <div className="flex gap-5 py-1">
                {(["male", "female"] as const).map((g) => (
                  <label
                    key={g}
                    className="flex items-center gap-2 text-12 text-ink-1 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="gender"
                      checked={form.gender === g}
                      onChange={() => patch({ gender: g })}
                      className="accent-brand"
                    />
                    {g === "male" ? "Male" : "Female"}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of birth">
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={form.dob?.day ?? ""}
                    onChange={(e) => patch({ dob: { ...form.dob, day: e.target.value } })}
                    className={inputCls}
                  >
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, i) =>
                      String(i + 1).padStart(2, "0"),
                    ).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select
                    value={form.dob?.month ?? ""}
                    onChange={(e) => patch({ dob: { ...form.dob, month: e.target.value } })}
                    className={inputCls}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    value={form.dob?.year ?? ""}
                    onChange={(e) =>
                      patch({ dob: { ...form.dob, year: e.target.value } })
                    }
                    placeholder="YYYY"
                    maxLength={4}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </div>
                {dobError && (
                  <p className="text-10.5 text-red mt-1">{dobError}</p>
                )}
              </Field>

              <Field label="Place of birth">
                <input
                  value={form.placeOfBirth ?? ""}
                  onChange={(e) => patch({ placeOfBirth: e.target.value })}
                  placeholder="City or country"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Country / location">
                <input
                  value={form.countryLocation ?? ""}
                  onChange={(e) => patch({ countryLocation: e.target.value })}
                  placeholder="e.g. United Arab Emirates"
                  className={inputCls}
                />
              </Field>
              <Field label="Citizenship">
                <input
                  value={form.citizenship ?? ""}
                  onChange={(e) => patch({ citizenship: e.target.value })}
                  placeholder="e.g. Colombian"
                  className={inputCls}
                />
              </Field>
            </div>
          </>
        ) : (
          <Field label="Registered country">
            <input
              value={form.registeredCountry ?? ""}
              onChange={(e) => patch({ registeredCountry: e.target.value })}
              placeholder="Country of registration"
              className={inputCls}
            />
          </Field>
        )}

        <details className="border border-hair-2 rounded mb-4">
          <summary className="px-3 py-2 text-12 font-semibold cursor-pointer select-none">
            Identification document
          </summary>
          <div className="grid grid-cols-3 gap-3 p-3 pt-2">
            <Field label="ID number">
              <input
                value={form.identification?.number ?? ""}
                onChange={(e) =>
                  patch({ identification: { ...form.identification, number: e.target.value } })
                }
                className={inputCls}
              />
            </Field>
            <Field label="Issuing country">
              <input
                value={form.identification?.issuerCountry ?? ""}
                onChange={(e) =>
                  patch({
                    identification: {
                      ...form.identification,
                      issuerCountry: e.target.value,
                    },
                  })
                }
                className={inputCls}
              />
            </Field>
            <Field label="ID type">
              <input
                value={form.identification?.idType ?? ""}
                onChange={(e) =>
                  patch({
                    identification: { ...form.identification, idType: e.target.value },
                  })
                }
                placeholder="Passport / National ID"
                className={inputCls}
              />
            </Field>
          </div>
        </details>

        <Field label="Notes">
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Referral source, background context, open issues…"
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="flex items-center justify-between pt-4 border-t border-hair-2">
          <div className="flex gap-2">
            <ActionBtn primary disabled={!valid} onClick={() => validateAndSubmit("screen")}>
              Screen now
            </ActionBtn>
            <ActionBtn disabled={!valid} onClick={() => validateAndSubmit("save")}>
              Save to queue
            </ActionBtn>
            <ActionBtn onClick={onCancel}>Cancel</ActionBtn>
          </div>
          <ActionBtn onClick={clear}>Clear</ActionBtn>
        </div>
      </section>
    </div>
  );
}

const inputCls =
  "w-full bg-transparent border border-hair-2 rounded px-2.5 py-1.5 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand focus:bg-bg-panel";

function SettingsHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-3">
      {children}
    </div>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-10.5 font-semibold tracking-wide-3 uppercase text-ink-3 mb-1.5">
        {label}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function EntityTypeRow({
  active, onClick, icon, label,
}: {
  active: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-12.5 text-left transition-colors ${
        active
          ? "bg-brand-dim text-brand-deep border-l-2 border-brand font-semibold"
          : "text-ink-1 hover:bg-bg-2 border-l-2 border-transparent"
      }`}
    >
      <span>{icon}</span>
      <span className="uppercase tracking-wide-1 font-medium">{label}</span>
    </button>
  );
}

function ToggleRow({
  icon, label, on, locked, onToggle,
}: {
  icon: string; label: string; on: boolean; locked?: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded">
      <div className="flex items-center gap-2 text-12.5 text-ink-1">
        <span>{icon}</span>
        <span className="uppercase tracking-wide-1 font-medium">{label}</span>
        {locked && <span className="text-10 text-ink-3">🔒</span>}
      </div>
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        aria-pressed={on}
        disabled={locked}
        className={`relative w-10 h-5 rounded-full transition-colors ${on ? "bg-brand" : "bg-hair-3"} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${on ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1 block">
        {label}
        {required && <span className="text-brand ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function ActionBtn({
  children, primary, disabled, onClick,
}: {
  children: React.ReactNode; primary?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  const base = "px-4 py-1.5 text-11.5 font-semibold uppercase tracking-wide-2 rounded border transition-colors";
  const variant = primary
    ? "bg-brand border-brand text-white hover:bg-brand-hover disabled:opacity-50"
    : "bg-bg-panel border-hair-2 text-ink-0 hover:border-hair-3 hover:bg-bg-2 disabled:opacity-40";
  const interact = disabled ? "cursor-not-allowed" : "cursor-pointer";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${variant} ${interact}`}>
      {children}
    </button>
  );
}
