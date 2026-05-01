"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface ClientRisk {
  ok: boolean;
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  jurisdictionalRisk: string;
  ownershipRisk: string;
  pepExposure: {
    detected: boolean;
    pepNames: string[];
    mitigants: string;
  };
  cddRequirements: string[];
  eddRequired: boolean;
  eddReason: string;
  enhancedMeasures: string[];
  recommendedAction: "onboard_standard" | "onboard_with_edd" | "refer_to_mlro" | "reject" | "pending_docs";
  regulatoryBasis: string;
  riskRating: string;
}

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
          Individual {idx + 1}
          {sh.name && <span className="text-ink-0 ml-2 normal-case font-sans text-11">— {sh.name}</span>}
        </span>
        <button type="button" onClick={onRemove}
          className="text-ink-3 hover:text-red transition-colors p-1" aria-label="Remove individual">
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
            type="text" inputMode="decimal" className={inputCls}
            style={{ MozAppearance: "textfield", WebkitAppearance: "none" }} />
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

const RISK_BADGE: Record<string, string> = {
  critical: "bg-red-dim text-red",
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  low: "bg-green-dim text-green",
};

const ACTION_BADGE: Record<string, string> = {
  reject: "bg-red-dim text-red",
  refer_to_mlro: "bg-amber-dim text-amber",
  onboard_with_edd: "bg-amber-dim text-amber",
  onboard_standard: "bg-green-dim text-green",
  pending_docs: "bg-brand-dim text-brand",
};

const ACTION_LABEL: Record<string, string> = {
  reject: "Reject",
  refer_to_mlro: "Refer to MLRO",
  onboard_with_edd: "Onboard with EDD",
  onboard_standard: "Onboard Standard",
  pending_docs: "Pending Docs",
};

export default function ClientPortalPage() {
  const [entity, setEntity] = useState<EntityForm>(BLANK_ENTITY);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [clientRisk, setClientRisk] = useState<ClientRisk | null>(null);
  const [clientRiskLoading, setClientRiskLoading] = useState(false);

  const canRunRisk = entity.name.trim().length > 0 && shareholders.length > 0;

  async function runClientRiskAssessment() {
    if (!canRunRisk || clientRiskLoading) return;
    setClientRiskLoading(true);
    try {
      const res = await fetch("/api/client-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity,
          shareholders: shareholders.map((s) => ({
            designation: s.designation,
            name: s.name,
            sharesPct: s.sharesPct,
            kind: s.kind,
            nationality: s.nationality,
            pepStatus: s.pepStatus,
            emiratesId: s.emiratesId,
            idNumber: s.idNumber,
          })),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as ClientRisk;
        setClientRisk(data);
      }
    } catch {
      /* non-fatal */
    } finally {
      setClientRiskLoading(false);
    }
  }

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
      <ModuleLayout asanaModule="client-portal" asanaLabel="Client Portal">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md w-full bg-bg-panel border border-hair-2 rounded-lg p-8 text-center">
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
              className="mt-5 text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1">
              Submit another
            </button>
          </div>
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout asanaModule="client-portal" asanaLabel="Client Portal">
      <div>
        <ModuleHero
          moduleNumber={12}
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Registered entity name *</label>
                <input required value={entity.name} onChange={setE("name")}
                  placeholder="e.g. Acme Trading FZ-LLC" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Alternate names / transliterations</label>
                <input value={entity.alternateNames} onChange={setE("alternateNames")}
                  placeholder="Semi-colon separated" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Country of incorporation</label>
                <input value={entity.countryOfIncorporation}
                  onChange={setE("countryOfIncorporation")} placeholder="e.g. UAE, TR, CH" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Trade licence / Registration number</label>
                <input value={entity.tradeLicence} onChange={setE("tradeLicence")} className={inputCls} />
              </div>
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

          {/* ── Individuals section ─────────────────────────────────── */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
                  Individuals
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
                + Add Individual
              </button>
            </div>

            {shareholders.length === 0 ? (
              <p className="text-11 text-ink-3 py-3 text-center border border-dashed border-hair-2 rounded">
                No individuals added yet — click "+ Add Individual" above.
                <br />
                <span className="text-10">
                  Add all UBOs ≥ 25%, directors, and nominee individuals per FDL 10/2025 Art.10 / Cabinet Decision 58/2020.
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
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={runClientRiskAssessment}
                disabled={!canRunRisk || clientRiskLoading}
                className="whitespace-nowrap text-12 font-semibold px-4 py-2 rounded border border-brand text-brand hover:bg-brand-dim disabled:opacity-40 transition-colors"
              >
                {clientRiskLoading ? "Assessing…" : "Get AI Risk Assessment"}
              </button>
              <button type="submit" disabled={!entity.name || !sharesValid}
                className="whitespace-nowrap text-12 font-semibold px-5 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                Submit for screening
              </button>
            </div>
          </div>
        </form>

        {/* ── AI Risk Assessment panel ─────────────────────────────── */}
        {clientRisk && (
          <div className="mt-4 bg-bg-panel border border-hair-2 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">AI Risk Assessment</span>
              <button type="button" onClick={() => setClientRisk(null)} className="text-ink-3 hover:text-ink-1 text-11">✕ Dismiss</button>
            </div>

            {/* Overall risk + rating */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-1 rounded font-mono text-11 font-semibold uppercase ${RISK_BADGE[clientRisk.overallRisk] ?? "bg-bg-2 text-ink-2"}`}>
                {clientRisk.overallRisk} risk
              </span>
              {clientRisk.riskRating && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-bg-2 text-ink-1 text-11 font-mono">
                  Rating: {clientRisk.riskRating}
                </span>
              )}
              {clientRisk.recommendedAction && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded text-11 font-semibold ${ACTION_BADGE[clientRisk.recommendedAction] ?? "bg-bg-2 text-ink-2"}`}>
                  {ACTION_LABEL[clientRisk.recommendedAction] ?? clientRisk.recommendedAction}
                </span>
              )}
            </div>

            {/* Risk narrative */}
            {clientRisk.riskNarrative && (
              <p className="text-12 text-ink-1 leading-relaxed">{clientRisk.riskNarrative}</p>
            )}

            {/* EDD required */}
            {clientRisk.eddRequired && (
              <div className="flex items-start gap-2 bg-red-dim rounded p-3">
                <span className="text-11 font-semibold text-red uppercase tracking-wide-2 shrink-0">EDD Required</span>
                {clientRisk.eddReason && (
                  <span className="text-11 text-red leading-snug">{clientRisk.eddReason}</span>
                )}
              </div>
            )}

            {/* PEP exposure */}
            {clientRisk.pepExposure.detected && (
              <div className="space-y-1">
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-red">PEP Exposure Detected</div>
                {clientRisk.pepExposure.pepNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {clientRisk.pepExposure.pepNames.map((n) => (
                      <span key={n} className="px-2 py-0.5 rounded bg-red-dim text-red text-11 font-mono">{n}</span>
                    ))}
                  </div>
                )}
                {clientRisk.pepExposure.mitigants && (
                  <p className="text-11 text-ink-2 leading-snug">{clientRisk.pepExposure.mitigants}</p>
                )}
              </div>
            )}

            {/* Jurisdictional risk */}
            {clientRisk.jurisdictionalRisk && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Jurisdictional Risk</div>
                <p className="text-12 text-ink-1 leading-relaxed">{clientRisk.jurisdictionalRisk}</p>
              </div>
            )}

            {/* Ownership risk */}
            {clientRisk.ownershipRisk && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Ownership & Control Risk</div>
                <p className="text-12 text-ink-1 leading-relaxed">{clientRisk.ownershipRisk}</p>
              </div>
            )}

            {/* CDD requirements */}
            {clientRisk.cddRequirements.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">CDD Requirements</div>
                <ul className="space-y-1">
                  {clientRisk.cddRequirements.map((req) => (
                    <li key={req} className="flex items-start gap-2 text-12 text-ink-1">
                      <span className="text-brand mt-0.5 shrink-0">☐</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Enhanced measures */}
            {clientRisk.enhancedMeasures.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-amber mb-2">Enhanced Measures</div>
                <ul className="space-y-1">
                  {clientRisk.enhancedMeasures.map((m) => (
                    <li key={m} className="flex items-start gap-2 text-12 text-amber">
                      <span className="shrink-0">→</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Regulatory basis */}
            {clientRisk.regulatoryBasis && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Regulatory Basis</div>
                <p className="font-mono text-11 text-ink-2 leading-relaxed">{clientRisk.regulatoryBasis}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
