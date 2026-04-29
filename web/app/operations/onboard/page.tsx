"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { QuickScreenResponse } from "@/lib/api/quickScreen.types";

type Step = 1 | 2 | 3 | 4 | 5;
type Tier = "tier-1" | "tier-2" | "tier-3";

interface ScreeningHit {
  listId: string;
  candidateName: string;
  score: number;
}

interface ScreeningError {
  message: string;
  detail?: string;
}

interface Draft {
  // Step 1: Identity
  fullName: string;
  dob: string;
  nationality: string;
  idType: string;
  idNumber: string;
  address: string;
  // Step 2: CDD
  occupation: string;
  sourceOfFunds: string;
  expectedProfile: string;
  // Step 3: Screening
  screenedAt?: number;
  screeningHits?: ScreeningHit[];
  // Step 4: Risk-rate
  riskTier?: Tier;
  riskRationale?: string;
  // Step 5: Sign-off
  mlroNote: string;
  signedOffAt?: number;
}

const BLANK_DRAFT: Draft = {
  fullName: "",
  dob: "",
  nationality: "",
  idType: "passport",
  idNumber: "",
  address: "",
  occupation: "",
  sourceOfFunds: "",
  expectedProfile: "",
  mlroNote: "",
};

const STORAGE_DRAFT = "hawkeye.onboarding.draft.v1";
const STORAGE_RECORDS = "hawkeye.onboarding.v1";

const STEPS: Array<{ id: Step; label: string; sub: string }> = [
  { id: 1, label: "Identity",   sub: "Name · DOB · ID" },
  { id: 2, label: "CDD",        sub: "Occupation · SoF" },
  { id: 3, label: "Screening",  sub: "Sanctions · PEP · adverse" },
  { id: 4, label: "Risk-rate",  sub: "Tier 1 / 2 / 3" },
  { id: 5, label: "MLRO sign-off", sub: "Disposition" },
];

// Live screening — POSTs to /api/quick-screen which screens against the
// ingested watchlist corpus (UN, OFAC, EU, UK, FATF, UAE-EOCN/LTL).
// Falls back to a deterministic local rule-set if the API is unreachable
// (e.g. when running the static-export build) so the wizard always
// produces a defensible result.
async function runScreenViaApi(draft: Draft): Promise<{ hits: ScreeningHit[]; source: "api" | "fallback"; error?: string }> {
  const subjectName = draft.fullName.trim();
  if (!subjectName) return { hits: [], source: "fallback" };
  const payload = {
    subject: {
      name: subjectName,
      entityType: "individual" as const,
      ...(draft.nationality ? { jurisdiction: draft.nationality } : {}),
    },
    options: { scoreThreshold: 0.85, maxHits: 25 },
  };
  try {
    const res = await fetch("/api/quick-screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as QuickScreenResponse;
    if (json.ok) {
      return {
        hits: json.hits.map((h) => ({
          listId: h.listId,
          candidateName: h.candidateName,
          score: h.score,
        })),
        source: "api",
      };
    }
    const err = "error" in json ? json.error : "unknown error";
    return { ...localFallback(draft), error: err };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...localFallback(draft), error: msg };
  }
}

function localFallback(draft: Draft): { hits: ScreeningHit[]; source: "fallback" } {
  const hits: ScreeningHit[] = [];
  const nat = draft.nationality.trim().toUpperCase().slice(0, 2);
  if (["IR", "KP", "MM", "SY"].includes(nat)) {
    hits.push({ listId: "fatf-call-for-action", candidateName: `${nat} jurisdiction nexus`, score: 0.92 });
  }
  const name = draft.fullName.toLowerCase();
  if (/\b(putin|kim|khamenei|maduro)\b/.test(name)) {
    hits.push({ listId: "ofac-sdn", candidateName: draft.fullName, score: 0.88 });
  }
  return { hits, source: "fallback" };
}

function computeTier(draft: Draft): { tier: Tier; rationale: string } {
  let score = 0;
  const reasons: string[] = [];

  const hits = draft.screeningHits ?? [];
  if (hits.length > 0) {
    score += 50 * hits.length;
    reasons.push(`${hits.length} screening hit(s) at >=85%`);
  }

  const nat = draft.nationality.trim().toUpperCase().slice(0, 2);
  const FATF_LISTED = new Set(["IR", "KP", "MM", "AF", "CD", "NG", "SD", "YE", "ZA"]);
  if (FATF_LISTED.has(nat)) {
    score += 30;
    reasons.push("FATF-listed jurisdiction");
  }

  const sofWords = draft.sourceOfFunds.trim().split(/\s+/).filter(Boolean).length;
  if (sofWords < 10) {
    score += 15;
    reasons.push("source-of-funds narrative thin (<10 words)");
  }

  const dobYear = parseInt(draft.dob.slice(0, 4), 10);
  if (Number.isFinite(dobYear) && dobYear < 1945) {
    score += 5;
    reasons.push("subject age >80 (potential proxy)");
  }

  const tier: Tier = score >= 50 ? "tier-1" : score >= 20 ? "tier-2" : "tier-3";
  const rationale =
    reasons.length === 0
      ? "Standard customer — no elevated indicators."
      : reasons.join("; ");
  return { tier, rationale };
}

function loadDraft(): Draft {
  if (typeof window === "undefined") return BLANK_DRAFT;
  try {
    const raw = window.localStorage.getItem(STORAGE_DRAFT);
    return raw ? { ...BLANK_DRAFT, ...JSON.parse(raw) } : BLANK_DRAFT;
  } catch {
    return BLANK_DRAFT;
  }
}

function saveDraft(d: Draft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_DRAFT, JSON.stringify(d));
  } catch {
    /* */
  }
}

function persistRecord(d: Draft): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_RECORDS);
    const arr: Draft[] = raw ? JSON.parse(raw) : [];
    arr.push(d);
    window.localStorage.setItem(STORAGE_RECORDS, JSON.stringify(arr));
    window.localStorage.removeItem(STORAGE_DRAFT);
  } catch {
    /* */
  }
}

export default function OnboardingWizardPage() {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [screening, setScreening] = useState<{ inFlight: boolean; source?: "api" | "fallback"; error?: ScreeningError }>({ inFlight: false });

  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const tierInfo = useMemo(() => computeTier(draft), [draft]);

  const can: Record<Step, boolean> = {
    1: draft.fullName.trim().length > 1 && draft.dob.length === 10 && draft.nationality.length >= 2 && draft.idNumber.trim().length > 0,
    2: draft.occupation.trim().length > 0 && draft.sourceOfFunds.trim().length > 0,
    3: !!draft.screenedAt,
    4: !!draft.riskTier,
    5: draft.mlroNote.trim().length > 0,
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const handleScreen = async () => {
    setScreening({ inFlight: true });
    const result = await runScreenViaApi(draft);
    setDraft((prev) => ({ ...prev, screenedAt: Date.now(), screeningHits: result.hits }));
    setScreening({
      inFlight: false,
      source: result.source,
      ...(result.error ? { error: { message: "live screening unavailable, using local fallback", detail: result.error } } : {}),
    });
  };

  const handleRiskRate = () => {
    setDraft((prev) => ({ ...prev, riskTier: tierInfo.tier, riskRationale: tierInfo.rationale }));
  };

  const handleSignOff = () => {
    const final: Draft = { ...draft, signedOffAt: Date.now() };
    persistRecord(final);
    setDraft(BLANK_DRAFT);
    setSubmitted(true);
    setStep(1);
  };

  const restart = () => {
    setSubmitted(false);
    setDraft(BLANK_DRAFT);
    setStep(1);
  };

  if (submitted) {
    return (
      <ModuleLayout asanaModule="onboarding" asanaLabel="Onboarding Wizard">
        <ModuleHero eyebrow="Module · Onboarding Wizard" title="Subject" titleEm="onboarded." />
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-6 text-center">
          <div className="text-14 font-semibold text-emerald-700 mb-2">
            ✓ Onboarding complete and signed off by MLRO
          </div>
          <div className="text-12 text-ink-2 mb-4">
            Record persisted to localStorage["hawkeye.onboarding.v1"]. Visit
            Inspection Room to see the count update.
          </div>
          <button
            type="button"
            onClick={restart}
            className="text-11 font-mono uppercase tracking-wide-3 px-4 py-2 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold"
          >
            Onboard another subject
          </button>
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout asanaModule="onboarding" asanaLabel="Onboarding Wizard">
      <ModuleHero
        eyebrow="Module · Onboarding Wizard"
        title="Guided new-customer"
        titleEm="onboarding."
        intro={
          <>
            <strong>Identity → CDD → Screening → Risk-Rate → MLRO sign-off.</strong>{" "}
            Five-step ribbon with auto-saved draft. Closes the gap between the
            policy stack (FATF R.10, FDL 10/2025 Art.13) and the front-line
            analyst&apos;s workflow.
          </>
        }
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => setStep(s.id)}
              disabled={s.id > step && !can[s.id - 1 as Step]}
              className={`flex-1 text-left rounded border px-3 py-2 transition ${
                step === s.id
                  ? "border-brand bg-brand-dim text-brand-deep"
                  : s.id < step
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-hair-2 bg-bg-panel text-ink-2"
              }`}
            >
              <div className="font-mono text-10 uppercase tracking-wide-3">
                Step {s.id}
              </div>
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
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Identity</h2>
            <Field label="Full name" value={draft.fullName} onChange={(v) => set("fullName", v)} />
            <Field label="Date of birth (YYYY-MM-DD)" value={draft.dob} onChange={(v) => set("dob", v)} placeholder="1985-04-12" />
            <Field label="Nationality (ISO-2)" value={draft.nationality} onChange={(v) => set("nationality", v.toUpperCase().slice(0, 2))} placeholder="AE" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="ID type" value={draft.idType} onChange={(v) => set("idType", v)} />
              <Field label="ID number" value={draft.idNumber} onChange={(v) => set("idNumber", v)} />
            </div>
            <Field label="Address" value={draft.address} onChange={(v) => set("address", v)} multiline />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Customer Due Diligence</h2>
            <Field label="Occupation" value={draft.occupation} onChange={(v) => set("occupation", v)} />
            <Field label="Source of funds (narrative)" value={draft.sourceOfFunds} onChange={(v) => set("sourceOfFunds", v)} multiline placeholder="Describe accumulated wealth, employment income, business, inheritance, etc." />
            <Field label="Expected transaction profile" value={draft.expectedProfile} onChange={(v) => set("expectedProfile", v)} multiline placeholder="Frequency, amount, counterparties, typical product use." />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Screening</h2>
            <p className="text-12 text-ink-2 m-0">
              Runs sanctions/PEP screening against the live watchlist corpus
              via <code>/api/quick-screen</code> (UN · OFAC · EU · UK · FATF
              · UAE-EOCN). Falls back to a deterministic rule-set when the
              API is unreachable.
            </p>
            <button
              type="button"
              onClick={handleScreen}
              disabled={screening.inFlight}
              className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {screening.inFlight ? "Screening…" : "Run screen"}
            </button>
            {screening.source && !screening.inFlight && (
              <div className="text-10 font-mono text-ink-3 mt-1">
                source: {screening.source === "api" ? "live /api/quick-screen" : "local fallback"}
                {screening.error && (
                  <span className="ml-2 text-amber-700">· {screening.error.message}</span>
                )}
              </div>
            )}
            {draft.screenedAt && (
              <div className="mt-3">
                <div className="text-11 text-ink-2 font-mono">
                  Last screened {new Date(draft.screenedAt).toLocaleString()}
                </div>
                {draft.screeningHits && draft.screeningHits.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {draft.screeningHits.map((h, i) => (
                      <div key={i} className="text-12 bg-red-50 border border-red-200 rounded p-2">
                        <span className="font-mono text-10 uppercase text-red-700">{h.listId}</span>
                        <span className="ml-2 text-ink-0">{h.candidateName}</span>
                        <span className="ml-2 font-mono tabular-nums text-red-700">{Math.round(h.score * 100)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-12 bg-emerald-50 border border-emerald-200 rounded p-2 text-emerald-700">
                    Clear · no list match above 85%
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">Risk Rate</h2>
            <p className="text-12 text-ink-2 m-0">
              Deterministic scoring across screening hits, jurisdiction, source-of-funds depth, and demographics.
            </p>
            <div className="bg-bg-1 border border-hair-2 rounded p-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-10 uppercase text-ink-2">Computed tier</span>
                <span
                  className={`font-mono text-12 font-semibold ${
                    tierInfo.tier === "tier-1"
                      ? "text-red-700"
                      : tierInfo.tier === "tier-2"
                        ? "text-orange-700"
                        : "text-emerald-700"
                  }`}
                >
                  {tierInfo.tier.toUpperCase()}
                </span>
              </div>
              <div className="text-11 text-ink-2 mt-1">{tierInfo.rationale}</div>
            </div>
            <button
              type="button"
              onClick={handleRiskRate}
              className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold"
            >
              Accept tier
            </button>
            {draft.riskTier && (
              <div className="mt-2 text-11 text-emerald-700 font-mono">
                ✓ Tier accepted — proceed to MLRO sign-off
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-2">MLRO Sign-Off</h2>
            <div className="bg-bg-1 border border-hair-2 rounded p-3 mb-2">
              <div className="text-11 font-mono text-ink-2 uppercase mb-1">Summary</div>
              <div className="text-12 text-ink-0">
                <strong>{draft.fullName || "—"}</strong> · {draft.nationality || "??"} · {draft.idType} {draft.idNumber} · tier{" "}
                <strong>{draft.riskTier ?? "?"}</strong> · {draft.screeningHits?.length ?? 0} screening hit(s)
              </div>
            </div>
            <Field label="MLRO note (rationale, conditions, ongoing-monitoring frequency)" value={draft.mlroNote} onChange={(v) => set("mlroNote", v)} multiline />
            <button
              type="button"
              onClick={handleSignOff}
              disabled={!can[5]}
              className="text-11 font-mono uppercase tracking-wide-3 px-4 py-2 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit for record
            </button>
          </div>
        )}

        {/* Step controls */}
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
        Draft auto-saves to localStorage["hawkeye.onboarding.draft.v1"] on every
        change. Final record persists to localStorage["hawkeye.onboarding.v1"].
      </div>
    </ModuleLayout>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

function Field({ label, value, onChange, placeholder, multiline }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-11 font-mono uppercase tracking-wide-3 text-ink-2 mb-1">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-12 border border-hair-2 bg-bg-panel text-ink-0 rounded px-2 py-1.5 focus:border-brand focus:outline-none"
        />
      )}
    </label>
  );
}
