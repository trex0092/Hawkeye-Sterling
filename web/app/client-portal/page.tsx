"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Client Portal — entity-only onboarding. No individual top-level clients.
// Shareholders (UBOs, directors, nominees) are sub-records per FDL 10/2025
// Art.10 (CDD) and Cabinet Decision 58/2020 (UBO identification).

type PepStatus = "yes" | "no" | "unknown";
type ShareholderKind = "individual" | "corporate";

interface Shareholder {
  id: string;
  designation: string;
  name: string;
  sharesPct: string;
  kind: ShareholderKind;
  nationality: string;
  idNumber: string;
  idExpiry: string;
  gender: string;
  dob: string;
  emiratesId: string;
  emiratesIdExpiry: string;
  pepStatus: PepStatus;
}

interface EntityForm {
  name: string;
  alternateNames: string;
  countryOfIncorporation: string;
  tradeLicence: string;
  email: string;
  phone: string;
}

const BLANK_ENTITY: EntityForm = {
  name: "",
  alternateNames: "",
  countryOfIncorporation: "",
  tradeLicence: "",
  email: "",
  phone: "",
};

function blankShareholder(): Shareholder {
  return {
    id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    designation: "",
    name: "",
    sharesPct: "",
    kind: "individual",
    nationality: "",
    idNumber: "",
    idExpiry: "",
    gender: "",
    dob: "",
    emiratesId: "",
    emiratesIdExpiry: "",
    pepStatus: "unknown",
  };
}

const DESIGNATIONS = [
  "UBO (Ultimate Beneficial Owner)",
  "Director",
  "Nominee Shareholder",
  "Nominee Director",
  "Authorised Signatory",
  "Trustee",
  "Settlor",
  "Beneficiary",
  "Manager / GM",
  "Other",
];

const inputCls =
  "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand";
const labelCls =
  "block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1";

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function ShareholderCard({
  sh,
  idx,
  onChange,
  onRemove,
}: {
  sh: Shareholder;
  idx: number;
  onChange: (updated: Shareholder) => void;
  onRemove: () => void;
}) {
  const set = (k: keyof Shareholder) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...sh, [k]: e.target.value });

  const isIndividual = sh.kind === "individual";

  return (
    <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 space-y-3">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-10 font-semibold text-ink-2 uppercase tracking-wide-3">
          Shareholder {idx + 1}
          {sh.name && <span className="text-ink-0 ml-2 normal-case font-sans text-11">— {sh.name}</span>}
        </span>
        <button type="button" onClick={onRemove}
          className="text-ink-3 hover:text-red transition-colors p-1" aria-label="Remove shareholder">
          <XIcon />
        </button>
      </div>

      {/* Row 1: Designation / Name / Shares % */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Designation</label>
          <select value={sh.designation} onChange={set("designation")} className={inputCls}>
            <option value="">— select —</option>
            {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Name</label>
          <input value={sh.name} onChange={set("name")} placeholder="Full legal name" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Shares %</label>
          <input value={sh.sharesPct} onChange={set("sharesPct")} placeholder="e.g. 51"
            type="number" min="0" max="100" step="0.01" className={inputCls} />
        </div>
      </div>

      {/* Row 2: Individual / Corporate + Nationality + ID Number */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Type</label>
          <div className="flex gap-1">
            {(["individual", "corporate"] as ShareholderKind[]).map((t) => (
              <button key={t} type="button"
                onClick={() => onChange({ ...sh, kind: t })}
                className={`flex-1 text-11 font-medium px-2 py-1.5 rounded border transition-colors ${
                  sh.kind === t
                    ? "border-brand bg-brand-dim text-brand-deep font-semibold"
                    : "border-hair-2 text-ink-1 hover:bg-bg-panel"
                }`}>
                {t === "individual" ? "Individual" : "Corporate"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>
            {isIndividual ? "Nationality" : "Country of Incorporation"}
          </label>
          <input value={sh.nationality} onChange={set("nationality")}
            placeholder={isIndividual ? "e.g. AE, TR" : "e.g. UAE"} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>
            {isIndividual ? "ID Number" : "Registration Number"}
          </label>
          <input value={sh.idNumber} onChange={set("idNumber")} className={inputCls} />
        </div>
      </div>

      {/* Row 3: ID Expiry + Gender (individual) / DOB or Reg Date */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>ID Expiry Date</label>
          <input value={sh.idExpiry} onChange={set("idExpiry")}
            placeholder="dd/mm/yyyy" className={inputCls} />
        </div>
        {isIndividual && (
          <div>
            <label className={labelCls}>Gender</label>
            <select value={sh.gender} onChange={set("gender")} className={inputCls}>
              <option value="">— select —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other / Not disclosed</option>
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>
            {isIndividual ? "Date of Birth" : "Registration Date"}
          </label>
          <input value={sh.dob} onChange={set("dob")}
            placeholder="dd/mm/yyyy" className={inputCls} />
        </div>
      </div>

      {/* Row 4: Emirates ID + Emirates ID Expiry + PEP Status */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Emirates ID</label>
          <input value={sh.emiratesId} onChange={set("emiratesId")}
            placeholder="784-YYYY-XXXXXXX-X" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Emirates ID Expiry</label>
          <input value={sh.emiratesIdExpiry} onChange={set("emiratesIdExpiry")}
            placeholder="dd/mm/yyyy" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>PEP Status</label>
          <div className="flex gap-1">
            {(["no", "yes", "unknown"] as PepStatus[]).map((p) => (
              <button key={p} type="button"
                onClick={() => onChange({ ...sh, pepStatus: p })}
                className={`flex-1 text-11 font-medium px-2 py-1.5 rounded border transition-colors ${
                  sh.pepStatus === p
                    ? p === "yes"
                      ? "border-red bg-red-dim text-red font-semibold"
                      : p === "no"
                        ? "border-green bg-green-dim text-green font-semibold"
                        : "border-amber bg-amber-dim text-amber font-semibold"
                    : "border-hair-2 text-ink-1 hover:bg-bg-panel"
                }`}>
                {p === "yes" ? "PEP" : p === "no" ? "No" : "Unknown"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalPage() {
  const [entity, setEntity] = useState<EntityForm>(BLANK_ENTITY);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const setE = (k: keyof EntityForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setEntity((prev) => ({ ...prev, [k]: e.target.value }));

  const addShareholder = () =>
    setShareholders((prev) => [...prev, blankShareholder()]);

  const updateShareholder = (id: string, updated: Shareholder) =>
    setShareholders((prev) => prev.map((s) => (s.id === id ? updated : s)));

  const removeShareholder = (id: string) =>
    setShareholders((prev) => prev.filter((s) => s.id !== id));

  const totalShares = shareholders.reduce(
    (sum, s) => sum + (parseFloat(s.sharesPct) || 0),
    0,
  );
  const sharesValid = shareholders.length === 0 || Math.abs(totalShares - 100) < 0.01;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <ModuleLayout narrow>
        <div className="max-w-2xl mx-auto px-8 py-10">
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-8 text-center">
            <div className="text-24 mb-3">✓</div>
            <h1 className="font-display text-24 text-ink-0 m-0 mb-3">
              Submission received
            </h1>
            <p className="text-12 text-ink-2 leading-relaxed">
              Your entity KYC package has been received and queued for MLRO
              review. You will be notified at the contact email provided once
              screening is complete. Expected turnaround: under 24h for
              standard CDD, up to 5 business days for EDD-tier reviews.
            </p>
            <div className="mt-4 font-mono text-10 text-ink-3">
              Reference: HS-{Date.now().toString().slice(-6)}
            </div>
            <button type="button" onClick={() => setSubmitted(false)}
              className="mt-5 text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-white hover:bg-ink-1">
              Submit another
            </button>
          </div>
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout narrow>
      <div className="max-w-3xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 13 · Self-service KYC"
          title="Client"
          titleEm="portal."
          intro={
            <>
              <strong>Onboard yourself in under 5 minutes.</strong> Fill in
              the entity details and add all shareholders, UBOs, and
              directors. The compliance brain auto-screens against sanctions,
              PEP, adverse-media, and jurisdiction databases; the MLRO
              reviews and you receive a decision by email.
            </>
          }
        />

        <form onSubmit={submit} className="space-y-4 mt-6">

          {/* ── Entity section ──────────────────────────────────────── */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
              Entity
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Registered entity name *</label>
                <input required value={entity.name} onChange={setE("name")}
                  placeholder="e.g. Istanbul Gold Refinery FZ-LLC" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Alternate names / transliterations</label>
                <input value={entity.alternateNames} onChange={setE("alternateNames")}
                  placeholder="Semi-colon separated" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Country of incorporation</label>
                  <input value={entity.countryOfIncorporation}
                    onChange={setE("countryOfIncorporation")} placeholder="e.g. UAE, TR, CH" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Trade licence / Registration number</label>
                  <input value={entity.tradeLicence} onChange={setE("tradeLicence")} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Contact email</label>
                  <input type="email" value={entity.email} onChange={setE("email")} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Contact phone</label>
                  <input value={entity.phone} onChange={setE("phone")} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Shareholders section ────────────────────────────────── */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
                  Shareholders
                </div>
                {shareholders.length > 0 && (
                  <div className={`text-10 font-mono mt-0.5 ${sharesValid ? "text-green" : "text-amber"}`}>
                    Total: {totalShares.toFixed(2)}%
                    {!sharesValid && " — shares must sum to 100%"}
                  </div>
                )}
              </div>
              <button type="button" onClick={addShareholder}
                className="text-11 font-semibold px-3 py-1.5 rounded border border-brand text-brand hover:bg-brand-dim transition-colors">
                + Add shareholder
              </button>
            </div>

            {shareholders.length === 0 ? (
              <p className="text-11 text-ink-3 py-3 text-center border border-dashed border-hair-2 rounded">
                No shareholders added yet — click "+ Add shareholder" above.
                <br />
                <span className="text-10">
                  Add all UBOs ≥ 25%, directors, and nominee shareholders per FDL 10/2025 Art.10 / Cabinet Decision 58/2020.
                </span>
              </p>
            ) : (
              <div className="space-y-3">
                {shareholders.map((sh, i) => (
                  <ShareholderCard
                    key={sh.id}
                    sh={sh}
                    idx={i}
                    onChange={(updated) => updateShareholder(sh.id, updated)}
                    onRemove={() => removeShareholder(sh.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Submit ──────────────────────────────────────────────── */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 flex items-start justify-between gap-4">
            <p className="text-10.5 text-ink-3 leading-relaxed max-w-sm">
              By submitting you consent to screening under FDL 10/2025 Art.10 (CDD)
              and confirm data accuracy under Art.29 (false-statement offence).
              UBO information is shared with MoE / MOEC as required by Cabinet
              Decision 58/2020.
            </p>
            <button type="submit" disabled={!entity.name || !sharesValid}
              className="whitespace-nowrap text-12 font-semibold px-5 py-2 rounded bg-ink-0 text-white hover:bg-ink-1 disabled:opacity-40">
              Submit for screening
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
