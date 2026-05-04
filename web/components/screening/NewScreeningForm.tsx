"use client";

import { useEffect, useRef, useState } from "react";
import type { CDDPosture } from "@/lib/types";
import type { PepMatchHit, PepMatchResponse } from "@/app/api/pep-match/route";
import { CryptoWalletField } from "@/components/screening/CryptoWalletField";
import { VesselAircraftFields } from "@/components/screening/VesselAircraftFields";

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
  /** vessel + aircraft route to entity-specific candidate corpora;
   *  "other" catches trusts / SPVs that don't fit cleanly. */
  entityType: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  name: string;
  alternateNames: string[];
  caseId: string;
  group: string;
  /** Binary gender — matches the male/female presentation on
   *  government-issued ID documents that the screening pipeline
   *  matches against. */
  gender?: "male" | "female";
  dob?: string; // "dd/mm/yyyy"
  placeOfBirth?: string;
  countryLocation?: string;
  citizenship?: string;
  registeredCountry?: string;
  /** License / register identifier for organisations — trade licence,
   *  IMO, LEI, registration #, etc. Required on the organisation tab,
   *  unused on the individual tab. */
  licenseRegister?: string;
  identification?: {
    number?: string;
    issuerCountry?: string;
    idType?: string;
  };
  checkTypes: { worldCheck: boolean; passport: boolean; rca: boolean; adverseMedia: boolean };
  ongoingScreening: boolean;
  relationshipType?: string;
  cddPosture?: CDDPosture;
  riskCategory?: string;
  notes?: string;
  /** Crypto wallets fed into /api/crypto-risk during onboarding. */
  walletAddresses?: string[];
  /** Vessel-specific (visible only when entityType=vessel). */
  vesselImo?: string;
  vesselMmsi?: string;
  /** Aircraft tail / ICAO 24-bit (visible only when entityType=aircraft). */
  aircraftTail?: string;
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
  caseId,
  group: "",
  checkTypes: { worldCheck: true, passport: false, rca: true, adverseMedia: true },
  ongoingScreening: true,
  cddPosture: "CDD",
});

// dd/mm/yyyy aware sanity check — the regex by itself happily accepts
// 31/02/2000 and 32/13/9999 because it only counts digits. Round-trip
// through Date and confirm the parsed parts agree to reject impossible
// calendar dates.
function isRealDate(dd: number, mm: number, yyyy: number): boolean {
  if (yyyy < 1900 || yyyy > new Date().getFullYear()) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  const d = new Date(yyyy, mm - 1, dd);
  return (
    d.getFullYear() === yyyy &&
    d.getMonth() === mm - 1 &&
    d.getDate() === dd
  );
}


export function NewScreeningForm({
  suggestedCaseId,
  onScreen,
  onSave,
  onCancel,
}: NewScreeningFormProps) {
  const [form, setForm] = useState<ScreeningFormData>(EMPTY_FORM(suggestedCaseId));
  const [altInput, setAltInput] = useState("");
  const [dobError, setDobError] = useState<string | null>(null);

  // Live PEP lookup via OpenSanctions (debounced, individual only).
  type PepStatus = "idle" | "loading" | "hit" | "clear" | "error";
  const [pepStatus, setPepStatus] = useState<PepStatus>("idle");
  const [pepHits, setPepHits] = useState<PepMatchHit[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (form.entityType !== "individual" || form.name.trim().length < 3) {
      setPepStatus("idle");
      setPepHits([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPepStatus("loading");
      try {
        const res = await fetch("/api/pep-match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            ...(form.dob ? { birthYear: form.dob.split("/")[2] } : {}),
            ...(form.alternateNames.length > 0 ? { aliases: form.alternateNames } : {}),
          }),
        });
        const data = (await res.json()) as PepMatchResponse;
        if (data.ok && data.hits.length > 0) {
          setPepHits(data.hits);
          setPepStatus("hit");
          // Auto-bump to EDD when a high-confidence PEP is found and
          // the analyst hasn't already set a stronger posture.
          if (data.hits[0]!.score >= 0.85 && form.cddPosture === "CDD") {
            patch({ cddPosture: "EDD" });
          }
        } else {
          setPepHits([]);
          setPepStatus(data.source === "none" ? "idle" : "clear");
        }
      } catch {
        setPepStatus("error");
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, form.entityType, form.dob]);

  const valid = form.name.trim().length >= 2;

  const patch = (p: Partial<ScreeningFormData>) =>
    setForm((f) => ({ ...f, ...p }));

  const addAlias = () => {
    const parts = altInput
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    // Dedupe case-insensitively against existing aliases AND against
    // duplicates within the same paste so "John; john; JOHN" lands once.
    const existing = new Set(form.alternateNames.map((a) => a.toLowerCase()));
    const fresh: string[] = [];
    for (const p of parts) {
      const k = p.toLowerCase();
      if (existing.has(k)) continue;
      existing.add(k);
      fresh.push(p);
    }
    if (fresh.length === 0) {
      setAltInput("");
      return;
    }
    patch({ alternateNames: [...form.alternateNames, ...fresh] });
    setAltInput("");
  };

  const removeAlias = (idx: number) =>
    patch({
      alternateNames: form.alternateNames.filter((_, i) => i !== idx),
    });

  const validateAndSubmit = (action: "screen" | "save") => {
    // DOB validation — regex confirms the shape, isRealDate confirms
    // the calendar date actually exists (catches 31/02 etc.).
    if (form.entityType === "individual" && form.dob) {
      const m = form.dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) {
        setDobError("Enter date of birth as dd/mm/yyyy.");
        return;
      }
      const dd = parseInt(m[1]!, 10);
      const mm = parseInt(m[2]!, 10);
      const yr = parseInt(m[3]!, 10);
      if (!isRealDate(dd, mm, yr)) {
        setDobError("Enter a real date of birth (dd/mm/yyyy, 1900-now).");
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
      className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-[240px_1fr]"
    >
      {/* ── Left: Screening settings ─────────────────────────────── */}
      <aside className="bg-transparent border-b md:border-b-0 md:border-r border-hair p-4">
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
          <EntityTypeRow
            active={form.entityType === "vessel"}
            onClick={() => patch({ entityType: "vessel" })}
            icon="🚢"
            label="Vessel"
          />
          <EntityTypeRow
            active={form.entityType === "aircraft"}
            onClick={() => patch({ entityType: "aircraft" })}
            icon="✈"
            label="Aircraft"
          />
        </SettingsGroup>

        <SettingsGroup label="Optional checks">
          <CoverageRow
            label="RCA"
            detail="Relatives &amp; close associates"
            on={form.checkTypes.rca}
            onToggle={() =>
              patch({ checkTypes: { ...form.checkTypes, rca: !form.checkTypes.rca } })
            }
          />
          <CoverageRow
            label="Passport check"
            detail="Document validation"
            on={form.checkTypes.passport}
            onToggle={() =>
              patch({ checkTypes: { ...form.checkTypes, passport: !form.checkTypes.passport } })
            }
          />
          <CoverageRow
            label="Re-screen"
            detail="Twice daily · audit trail logged"
            on={form.ongoingScreening}
            onToggle={() => patch({ ongoingScreening: !form.ongoingScreening })}
          />
          <CoverageRow
            label="Adverse media"
            detail="Taranis AI · 38 outlets · 50+ langs"
            on={form.checkTypes.adverseMedia}
            onToggle={() =>
              patch({ checkTypes: { ...form.checkTypes, adverseMedia: !form.checkTypes.adverseMedia } })
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

      </aside>

      {/* ── Right: Form fields ───────────────────────────────────── */}
      <section className="bg-bg-panel p-6">
        <SettingsHeading>Single screening</SettingsHeading>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              onChange={(e) => {
                const v = e.target.value;
                // Selecting the placeholder must clear the field, not no-op.
                // exactOptionalPropertyTypes forbids assigning undefined, so
                // strip the key explicitly when v is empty.
                if (v) {
                  patch({ relationshipType: v });
                } else {
                  setForm((f) => {
                    const { relationshipType: _drop, ...rest } = f;
                    return rest as ScreeningFormData;
                  });
                }
              }}
              className={inputCls}
            >
              <option value="">Select…</option>
              {relationshipOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Live OpenSanctions PEP lookup banner — individual only */}
        {form.entityType === "individual" && pepStatus !== "idle" && (
          <PepLookupBanner status={pepStatus} hits={pepHits} />
        )}

        {/* Alternate names + License/Register share a row on the
            organisation tab; on the individual tab Alternate names
            spans full width as before. */}
        <div className={form.entityType === "organisation" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : ""}>
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
          {form.entityType === "organisation" && (
            <Field label="License / Register *">
              <input
                value={form.licenseRegister ?? ""}
                onChange={(e) => patch({ licenseRegister: e.target.value })}
                placeholder="Trade licence / IMO / LEI / registration #"
                className={inputCls}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          {/* Last cell of the Case-ID row swaps based on entity type:
              - Individual: Risk category dropdown
              - Organisation: Registered country (consolidated up here for
                compactness) */}
          {form.entityType === "individual" ? (
            <Field label="Risk category">
              <select
                value={form.riskCategory ?? ""}
                onChange={(e) => {
                  // Selecting the placeholder must clear the field, not
                  // no-op. exactOptionalPropertyTypes forbids assigning
                  // undefined, so strip the key explicitly when v is empty.
                  const v = e.target.value;
                  if (v) {
                    patch({ riskCategory: v });
                  } else {
                    setForm((f) => {
                      const { riskCategory: _drop, ...rest } = f;
                      return rest as ScreeningFormData;
                    });
                  }
                }}
                className={inputCls}
              >
                <option value="">None</option>
                {RISK_CATEGORIES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Registered country *">
              <input
                value={form.registeredCountry ?? ""}
                onChange={(e) => patch({ registeredCountry: e.target.value })}
                placeholder="Country of registration"
                className={inputCls}
              />
            </Field>
          )}
        </div>

        {form.entityType === "individual" ? (
          <>
            {/* DOB + Place of birth come first — sanctions-list disambig
                relies on DOB before any other identity attribute. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Date of birth">
                <input
                  type="text"
                  value={form.dob ?? ""}
                  onChange={(e) => patch({ dob: e.target.value })}
                  placeholder="dd/mm/yyyy"
                  className={inputCls}
                />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {/* Gender — Male / Female only, matching the binary
                presentation on government-issued ID documents that
                screening matches against. */}
            <Field label="Gender">
              <div className="flex flex-wrap gap-x-5 gap-y-2 py-1">
                {([
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                ] as const).map((g) => (
                  <label
                    key={g.value}
                    className="flex items-center gap-2 text-12 text-ink-1 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="gender"
                      checked={form.gender === g.value}
                      onChange={() => patch({ gender: g.value })}
                      className="accent-brand"
                    />
                    {g.label}
                  </label>
                ))}
              </div>
            </Field>
          </>
        ) : null /* organisation has Registered country in the Case-ID row above */}

        {/* Vessel + aircraft IMO/MMSI/tail-number block — only shown when
            the matching entity type is selected. Routes to brain's
            entity-specific candidate corpora during screening. */}
        {(form.entityType === "vessel" || form.entityType === "aircraft") && (
          <div className="mb-4">
            <VesselAircraftFields
              entityType={form.entityType}
              imo={form.vesselImo}
              mmsi={form.vesselMmsi}
              tail={form.aircraftTail}
              patch={patch}
            />
          </div>
        )}

        {/* Crypto wallets — fed into /api/crypto-risk on blur. Available
            for every entity type since vessels and aircraft can also be
            paid via crypto. */}
        <Field label="Crypto wallets (optional)">
          <CryptoWalletField
            wallets={form.walletAddresses ?? []}
            onChange={(w) => patch({ walletAddresses: w })}
          />
        </Field>

        {/* Identification document + Notes are individual-only inputs.
            Organisations use License / Register (in the Alternate
            names row) and skip free-text notes. */}
        {form.entityType === "individual" && (
        <>
        <details className="border border-hair-2 rounded mb-4">
          <summary className="px-3 py-2 text-12 font-semibold cursor-pointer select-none">
            Identification document
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 pt-2">
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
        </>
        )}

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

// ── PEP lookup banner ─────────────────────────────────────────────────────────

function PepLookupBanner({ status, hits }: { status: "loading" | "hit" | "clear" | "error"; hits: PepMatchHit[] }) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 mt-1 mb-3 px-3 py-2 rounded-lg bg-bg-2 border border-hair text-12 text-ink-2 animate-pulse">
        <svg className="w-3.5 h-3.5 animate-spin text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
        </svg>
        Checking OpenSanctions PEP database…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 mt-1 mb-3 px-3 py-2 rounded-lg bg-bg-2 border border-hair text-12 text-ink-3">
        <svg className="w-3.5 h-3.5 text-ink-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4a.75.75 0 00-1.5 0v4a.75.75 0 001.5 0V5zm-.75 6.5a.875.875 0 110 1.75.875.875 0 010-1.75z" />
        </svg>
        OpenSanctions unreachable — static lookup active
      </div>
    );
  }

  if (status === "clear") {
    return (
      <div className="flex items-center gap-2 mt-1 mb-3 px-3 py-2 rounded-lg bg-green-dim border border-green/20 text-12 text-green">
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.78 5.03a.75.75 0 00-1.06-1.06L7 8.69 5.28 6.97a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" />
        </svg>
        No PEP match in OpenSanctions
      </div>
    );
  }

  // status === "hit"
  const top = hits[0];
  if (!top) return null;
  const isHighConf = top.score >= 0.85;
  const isMedConf = top.score >= 0.55;

  const bannerCls = isHighConf
    ? "bg-red-dim border-red/30 text-red"
    : isMedConf
    ? "bg-amber-dim border-amber/30 text-amber"
    : "bg-bg-2 border-hair text-ink-1";

  const iconCls = isHighConf ? "text-red" : "text-amber";

  return (
    <div className={`mt-1 mb-3 px-3 py-2 rounded-lg border text-12 ${bannerCls}`}>
      <div className="flex items-start gap-2">
        <svg className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconCls}`} viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0V5zm-.75 6a.875.875 0 110 1.75A.875.875 0 017.25 11z" />
        </svg>
        <div className="min-w-0 flex-1">
          <span className="font-semibold">
            {isHighConf ? "PEP match — EDD required" : "Possible PEP match"}
          </span>
          <span className="ml-2 opacity-70 font-mono text-10.5">{Math.round(top.score * 100)}% confidence</span>
          <div className="mt-1 text-11 opacity-90 leading-relaxed">
            <span className="font-medium">{top.caption}</span>
            {top.positions[0] && <span className="ml-1">· {top.positions[0]}</span>}
            {top.countries[0] && <span className="ml-1">· {top.countries[0].toUpperCase()}</span>}
            {top.datasets[0] && <span className="ml-1 opacity-60">· {top.datasets[0]}</span>}
          </div>
          {hits.length > 1 && (
            <div className="mt-1 text-10.5 opacity-60">
              +{hits.length - 1} additional match{hits.length - 1 > 1 ? "es" : ""} in OpenSanctions
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Input / layout helpers ─────────────────────────────────────────────────────

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

function CoverageRow({
  label,
  detail,
  on,
  locked,
  onToggle,
}: {
  label: string;
  detail: string;
  on: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-2 py-1.5 rounded">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-12 font-medium text-ink-0 uppercase tracking-wide-1">{label}</span>
        <span className="text-10 text-ink-3 leading-snug">{detail}</span>
      </div>
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        aria-pressed={on}
        disabled={locked}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${on ? "bg-brand" : "bg-hair-3"} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
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
