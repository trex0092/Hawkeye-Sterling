"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { QuickScreenResponse } from "@/lib/api/quickScreen.types";

type Step = 1 | 2 | 3 | 4 | 5;
type Tier = "tier-1" | "tier-2" | "tier-3";

// Per the entity-only refactor: the wizard onboards ENTITIES (legal
// persons / organisations / vessels), not natural persons. Relationship
// type is multi-select so a counterparty can be both Supplier AND
// Refiner, etc.
type RelationshipType =
  | "supplier"
  | "customer"
  | "correspondent"
  | "intermediary"
  | "counterparty"
  | "refiner";

const RELATIONSHIP_OPTIONS: Array<{ id: RelationshipType; label: string }> = [
  { id: "supplier",      label: "Supplier" },
  { id: "customer",      label: "Customer" },
  { id: "correspondent", label: "Correspondent" },
  { id: "intermediary",  label: "Intermediary" },
  { id: "counterparty",  label: "Counterparty" },
  { id: "refiner",       label: "Refiner" },
];

interface ScreeningHit {
  listId: string;
  candidateName: string;
  score: number;
}

interface ScreeningError {
  message: string;
  detail?: string;
}

interface ScoredFactor {
  id: string;
  label: string;
  points: number;
  anchor?: string;
}

interface JurisdictionHit {
  list: string;
  label: string;
  stale: boolean;
  classification?: "grey" | "black";
}

interface RiskTierResult {
  tier: Tier;
  score: number;
  factors: ScoredFactor[];
  rationale: string;
  jurisdictionHits: JurisdictionHit[];
}

// Layer 3 — 8-section AdvisorResponseV1 the structured renderer consumes.
interface AdvisorResponseV1 {
  schemaVersion: 1;
  facts: { bullets: string[] };
  redFlags: { flags: Array<{ indicator: string; typology: string }> };
  frameworkCitations: { byClass: Partial<Record<"A" | "B" | "C" | "D" | "E", string[]>> };
  decision: { verdict: "proceed" | "decline" | "escalate" | "file_str" | "freeze"; oneLineRationale: string };
  confidence: { score: 1 | 2 | 3 | 4 | 5; reason?: string };
  counterArgument: { inspectorChallenge: string; rebuttal: string };
  auditTrail: {
    charterVersionHash: string;
    directivesInvoked: string[];
    doctrinesApplied: string[];
    retrievedSources: Array<{ class: string; classLabel: string; sourceId: string; articleRef: string }>;
    timestamp: string;
    userId: string;
    mode: string;
    modelVersions: Record<string, string>;
  };
  escalationPath: { responsible: string; accountable: string; consulted: string[]; informed: string[]; nextAction: string };
}

interface Draft {
  // Step 1: Entity (legal person / organisation / vessel — never natural)
  fullName: string;          // Entity legal name
  registeredCountry: string; // Country of registration (ISO-2)
  idType: string;            // Trade licence / registration / IMO / DUNS
  idNumber: string;          // The actual identifier
  relationshipTypes: RelationshipType[]; // multi-select; >= 1 required
  // Step 2: CDD
  occupation: string;        // Sector / business activity
  sourceOfFunds: string;
  expectedProfile: string;
  // Step 3: Screening
  screenedAt?: number;
  screeningHits?: ScreeningHit[];
  // Step 4: Risk-rate
  riskTier?: Tier;
  riskRationale?: string;
  riskFactors?: ScoredFactor[];
  riskScore?: number;
  manualOverride?: boolean;
  // Step 5: Sign-off
  mlroNote: string;
  signedOffAt?: number;
  advisorNarrative?: AdvisorResponseV1 | null;
}

const BLANK_DRAFT: Draft = {
  fullName: "",
  registeredCountry: "",
  idType: "trade-licence",
  idNumber: "",
  relationshipTypes: [],
  occupation: "",
  sourceOfFunds: "",
  expectedProfile: "",
  mlroNote: "",
};

const ID_TYPE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "trade-licence",   label: "Trade licence" },
  { id: "registration",    label: "Registration #" },
  { id: "imo",             label: "IMO" },
  { id: "duns",            label: "DUNS" },
  { id: "lei",             label: "LEI" },
  { id: "tax-id",          label: "Tax ID" },
];

const STORAGE_DRAFT = "hawkeye.onboarding.draft.v1";
const STORAGE_RECORDS = "hawkeye.onboarding.v1";

const STEPS: Array<{ id: Step; label: string; sub: string }> = [
  { id: 1, label: "Entity",        sub: "Name · Country · Reg #" },
  { id: 2, label: "CDD",           sub: "Sector · SoF" },
  { id: 3, label: "Screening",     sub: "Sanctions · PEP · adverse" },
  { id: 4, label: "Risk-rate",     sub: "Tier 1 / 2 / 3" },
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
      entityType: "organisation" as const,
      ...(draft.registeredCountry ? { jurisdiction: draft.registeredCountry } : {}),
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
  const nat = draft.registeredCountry.trim().toUpperCase().slice(0, 2);
  if (["IR", "KP", "MM", "SY"].includes(nat)) {
    hits.push({ listId: "fatf-call-for-action", candidateName: `${nat} jurisdiction nexus`, score: 0.92 });
  }
  // Entity-shape name signals — keeps the offline path defensible when
  // the live API is unreachable.
  const name = draft.fullName.toLowerCase();
  if (/\b(?:rosneft|gazprom|sberbank|huawei|zte|kaspersky|vtb)\b/.test(name)) {
    hits.push({ listId: "sectoral-sanctions", candidateName: draft.fullName, score: 0.88 });
  }
  return { hits, source: "fallback" };
}

// Calls /api/onboarding-risk-tier which wraps the deterministic
// scorer in src/brain/onboarding-risk-tier.ts. The scorer combines
// screening hits, the Layer-6 five-list jurisdictional lookup, PEP
// signal, source-of-funds depth, occupation-based sector hints, and
// demographic flags into a tier + ranked factor list.
async function computeTier(draft: Draft): Promise<RiskTierResult | null> {
  try {
    const res = await fetch("/api/onboarding-risk-tier", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: draft.fullName,
        nationalityIso2: draft.registeredCountry.trim().toUpperCase().slice(0, 2),
        // dob omitted — entities don't have one; the scorer's age axis
        // is dormant on entity flows.
        occupation: draft.occupation,
        sourceOfFunds: draft.sourceOfFunds,
        expectedProfile: draft.expectedProfile,
        screeningHits: draft.screeningHits ?? [],
      }),
    });
    const json = (await res.json()) as { ok: boolean } & RiskTierResult;
    if (json.ok) {
      const { tier, score, factors, rationale, jurisdictionHits } = json;
      return { tier, score, factors, rationale, jurisdictionHits };
    }
  } catch {
    /* fall through to local fallback below */
  }
  // Local fallback — deterministic, lightweight, no external deps.
  // Mirrors the historical onboarding behaviour so the wizard always
  // produces a defensible result even when the API is unreachable.
  return localTierFallback(draft);
}

function localTierFallback(draft: Draft): RiskTierResult {
  const factors: ScoredFactor[] = [];
  const hits = draft.screeningHits ?? [];
  if (hits.length > 0) {
    factors.push({ id: "screening_hit", label: `${hits.length} screening hit(s)`, points: 50 });
  }
  const nat = draft.registeredCountry.trim().toUpperCase().slice(0, 2);
  const FATF_LISTED = new Set(["IR", "KP", "MM", "AF", "CD", "NG", "SD", "YE"]);
  if (FATF_LISTED.has(nat)) {
    factors.push({ id: "jurisdiction", label: "FATF-listed jurisdiction", points: 30 });
  }
  const sofWords = draft.sourceOfFunds.trim().split(/\s+/).filter(Boolean).length;
  if (sofWords < 10) {
    factors.push({ id: "sof_thin", label: `Source-of-funds thin (${sofWords} word(s))`, points: 15 });
  }
  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  const tier: Tier = score >= 50 ? "tier-1" : score >= 20 ? "tier-2" : "tier-3";
  return {
    tier,
    score,
    factors,
    rationale: factors.length === 0 ? "Standard entity — no elevated indicators (local fallback)." : factors.map((f) => f.label).join("; "),
    jurisdictionHits: [],
  };
}

// Per-step audit log — appends to the Layer-4 audit log via
// /api/onboarding-audit. Fire-and-forget; never blocks the UI.
function recordStepTransition(fromStep: Step, toStep: Step, draft: Draft): void {
  // Only the safe fields — no document binaries, no full text PII.
  const draftSnapshot = {
    registeredCountry: draft.registeredCountry,
    relationshipTypes: draft.relationshipTypes,
    occupation: draft.occupation.slice(0, 80),
    screened: !!draft.screenedAt,
    hits: (draft.screeningHits ?? []).length,
    riskTier: draft.riskTier ?? null,
    manualOverride: !!draft.manualOverride,
  };
  void fetch("/api/onboarding-audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fromStep, toStep, draftSnapshot }),
  }).catch(() => {});
}

// Step 5 — generate a regulator-grade onboarding-decision narrative
// via /api/mlro-advisor with structured:true. Returns the parsed
// AdvisorResponseV1 on success; null if the model fell back to the
// legacy free-form narrative path.
async function generateAdvisorNarrative(draft: Draft): Promise<AdvisorResponseV1 | null> {
  const relationships = draft.relationshipTypes.join(", ") || "(no relationship type)";
  const question =
    `Onboarding decision narrative for ENTITY ${draft.fullName} (registered ${draft.registeredCountry.toUpperCase()}, registration # ${draft.idNumber}). ` +
    `Relationship type(s): ${relationships}. ` +
    `Sector / business activity: ${draft.occupation}. ` +
    `Source of funds: ${draft.sourceOfFunds}. ` +
    `Expected profile: ${draft.expectedProfile}. ` +
    `Risk tier: ${draft.riskTier} (${draft.riskRationale}). ` +
    `Screening: ${(draft.screeningHits ?? []).length} hit(s). ` +
    `Justify the proposed tier against FDL 10/2025 Art.16-19, Cabinet Decision 134/2025 Art.3-7, and FATF R.10/12/19.`;
  try {
    const res = await fetch("/api/mlro-advisor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        subjectName: draft.fullName,
        entityType: "organisation",
        jurisdiction: draft.registeredCountry,
        mode: "balanced",
        audience: "regulator",
        structured: true,
      }),
    });
    const json = (await res.json()) as { ok: boolean; structured?: AdvisorResponseV1 | null };
    return json.ok && json.structured ? json.structured : null;
  } catch {
    return null;
  }
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
  const [step, setStepInternal] = useState<Step>(1);
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [screening, setScreening] = useState<{ inFlight: boolean; source?: "api" | "fallback"; error?: ScreeningError }>({ inFlight: false });
  const [tierInfo, setTierInfo] = useState<RiskTierResult | null>(null);
  const [tierLoading, setTierLoading] = useState(false);
  const [advisor, setAdvisor] = useState<{ inFlight: boolean; error?: string }>({ inFlight: false });
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Layer 4 audit-log every step transition (option F). Fire-and-forget
  // — the wizard's UX never waits on the audit write.
  const setStep = useCallback((next: Step | ((prev: Step) => Step)) => {
    setStepInternal((prev) => {
      const resolved = typeof next === "function" ? (next as (p: Step) => Step)(prev) : next;
      if (resolved !== prev) recordStepTransition(prev, resolved, draftRef.current);
      return resolved;
    });
  }, []);

  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // Recompute tier on relevant draft changes — debounced through the
  // dependency list so we don't fire while the operator is typing.
  useEffect(() => {
    let cancelled = false;
    setTierLoading(true);
    void computeTier(draft).then((res) => {
      if (cancelled) return;
      setTierInfo(res);
      setTierLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    draft.registeredCountry,
    draft.occupation,
    draft.sourceOfFunds,
    draft.expectedProfile,
    draft.fullName,
    draft.screeningHits,
    draft.relationshipTypes,
  ]);

  const can: Record<Step, boolean> = {
    1:
      draft.fullName.trim().length > 1 &&
      draft.registeredCountry.trim().length >= 2 &&
      draft.idNumber.trim().length > 0 &&
      draft.relationshipTypes.length > 0,
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
    if (!tierInfo) return;
    setDraft((prev) => ({
      ...prev,
      riskTier: tierInfo.tier,
      riskRationale: tierInfo.rationale,
      riskFactors: tierInfo.factors,
      riskScore: tierInfo.score,
      manualOverride: false,
    }));
  };

  const handleManualOverride = (tier: Tier) => {
    setDraft((prev) => ({
      ...prev,
      riskTier: tier,
      riskRationale: `${prev.riskRationale ?? ""} [MANUAL OVERRIDE — operator selected ${tier}]`,
      manualOverride: true,
    }));
  };

  const handleGenerateAdvisorNarrative = async () => {
    setAdvisor({ inFlight: true });
    const narrative = await generateAdvisorNarrative(draft);
    if (narrative) {
      setDraft((prev) => ({ ...prev, advisorNarrative: narrative }));
      setAdvisor({ inFlight: false });
    } else {
      setAdvisor({
        inFlight: false,
        error: "Advisor returned a free-form narrative; structured 8-section output not available for this case. Inspect /api/mlro-advisor logs.",
      });
    }
  };

  const handleSignOff = () => {
    const final: Draft = { ...draft, signedOffAt: Date.now() };
    persistRecord(final);
    // Audit log the final sign-off as a synthetic step transition.
    recordStepTransition(5, 5, final);
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
            <h2 className="text-14 font-semibold text-ink-0 m-0 mb-1">Entity</h2>
            <p className="text-11 text-ink-3 m-0 mb-2">
              The wizard onboards entities only — legal persons, organisations,
              vessels, refiners. Not natural persons.
            </p>
            <Field label="Name *" value={draft.fullName} onChange={(v) => set("fullName", v)} placeholder="Entity legal name" />
            <div>
              <span className="block text-11 font-mono uppercase tracking-wide-3 text-ink-2 mb-1">
                Relationship type * (multi-select)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {RELATIONSHIP_OPTIONS.map((opt) => {
                  const selected = draft.relationshipTypes.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDraft((prev) => ({
                          ...prev,
                          relationshipTypes: selected
                            ? prev.relationshipTypes.filter((t) => t !== opt.id)
                            : [...prev.relationshipTypes, opt.id],
                        }));
                      }}
                      className={`text-11 font-mono uppercase tracking-wide-3 px-2 py-1 rounded border transition ${
                        selected
                          ? "bg-brand text-white border-brand"
                          : "bg-bg-1 text-ink-2 border-hair-2 hover:text-brand hover:border-brand"
                      }`}
                    >
                      {selected ? "✓ " : ""}{opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Registered country (ISO-2) *"
                value={draft.registeredCountry}
                onChange={(v) => set("registeredCountry", v.toUpperCase().slice(0, 2))}
                placeholder="AE"
              />
              <Field
                label="ID number *"
                value={draft.idNumber}
                onChange={(v) => set("idNumber", v)}
                placeholder="Trade-licence / registration / IMO"
              />
            </div>
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
              Deterministic scoring — screening hits + 5-list jurisdictional lookup
              (FATF / EU / UNSC / OFAC / OECD CAHRA) + PEP signal + source-of-funds
              depth + sector hints + demographics. Suggested tier appears below;
              the operator can override with rationale.
            </p>
            {tierLoading || !tierInfo ? (
              <div className="text-12 text-ink-2 italic">Computing tier…</div>
            ) : (
              <>
                <div className="bg-bg-1 border border-hair-2 rounded p-3">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-mono text-10 uppercase text-ink-2">Computed tier</span>
                    <span
                      className={`font-mono text-13 font-semibold ${
                        tierInfo.tier === "tier-1"
                          ? "text-red-700"
                          : tierInfo.tier === "tier-2"
                            ? "text-orange-700"
                            : "text-emerald-700"
                      }`}
                    >
                      {tierInfo.tier.toUpperCase()}
                    </span>
                    <span className="font-mono text-10 text-ink-3">score {tierInfo.score}/100</span>
                  </div>
                  <div className="text-11 text-ink-2 mt-1">{tierInfo.rationale}</div>
                  {tierInfo.factors.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tierInfo.factors.map((f) => (
                        <span
                          key={f.id}
                          className="inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 bg-amber-50 text-amber-700 border-amber-300"
                          title={f.anchor ? `Anchor: ${f.anchor}` : undefined}
                        >
                          +{f.points} · {f.id.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}
                  {tierInfo.jurisdictionHits.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-hair">
                      <div className="text-10 font-mono uppercase text-ink-3 mb-1">Jurisdictional list hits ({tierInfo.jurisdictionHits.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {tierInfo.jurisdictionHits.map((h) => (
                          <span
                            key={h.list}
                            className={`inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${
                              h.classification === "black"
                                ? "bg-red-100 text-red-700 border-red-300"
                                : h.classification === "grey"
                                  ? "bg-amber-50 text-amber-700 border-amber-300"
                                  : "bg-bg-2 text-ink-1 border-hair-2"
                            }`}
                            title={`${h.label}${h.stale ? " — list snapshot is stale; refresh feed" : ""}`}
                          >
                            {h.list.replace(/_/g, " ")}{h.classification ? ` · ${h.classification}` : ""}{h.stale ? " ⚠" : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRiskRate}
                    className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold"
                  >
                    Accept suggested tier
                  </button>
                  <span className="text-10 font-mono text-ink-3 self-center">— or override:</span>
                  {(["tier-1", "tier-2", "tier-3"] as Tier[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleManualOverride(t)}
                      disabled={tierInfo.tier === t && !draft.manualOverride}
                      className="text-11 font-mono uppercase tracking-wide-3 px-2 py-1 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
            {draft.riskTier && (
              <div className="mt-2 text-11 text-emerald-700 font-mono">
                ✓ Tier {draft.riskTier} {draft.manualOverride ? "(manual override)" : "accepted"} — proceed to MLRO sign-off
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
                <strong>{draft.fullName || "—"}</strong>
                {" · "}{draft.registeredCountry || "??"}
                {" · reg # "}{draft.idNumber || "?"}
                {draft.relationshipTypes.length > 0 && (
                  <>{" · "}{draft.relationshipTypes.join("/")}</>
                )}
                {" · tier "}<strong>{draft.riskTier ?? "?"}</strong>
                {" · "}{draft.screeningHits?.length ?? 0} screening hit(s)
              </div>
            </div>

            {/* Layer 3 advisor narrative — calls /api/mlro-advisor with
                structured:true and renders the 8-section regulator-grade
                response when available. */}
            <div className="bg-bg-1 border border-hair-2 rounded p-3">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <div className="text-11 font-mono text-ink-2 uppercase">Regulator-grade advisor narrative</div>
                <button
                  type="button"
                  onClick={handleGenerateAdvisorNarrative}
                  disabled={advisor.inFlight || !draft.riskTier}
                  className="text-10 font-mono uppercase tracking-wide-3 px-2 py-1 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {advisor.inFlight ? "Generating…" : draft.advisorNarrative ? "Regenerate" : "Generate"}
                </button>
              </div>
              {advisor.error && (
                <div className="text-11 text-amber-700 mb-1">{advisor.error}</div>
              )}
              {!draft.advisorNarrative && !advisor.inFlight && (
                <div className="text-11 text-ink-3">
                  Optional but recommended for regulator audits. Calls{" "}
                  <code className="font-mono">/api/mlro-advisor</code> with{" "}
                  <code className="font-mono">structured: true</code> and the case
                  context built from steps 1-4. The 8-section response below
                  becomes part of the persisted record.
                </div>
              )}
              {draft.advisorNarrative && (
                <AdvisorNarrativePanel response={draft.advisorNarrative} />
              )}
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

// Compact 8-section advisor narrative panel for the onboarding wizard.
// Mirrors the StructuredAdvisorView from /mlro-advisor but tighter
// to fit inside the wizard's step 5 panel.
function AdvisorNarrativePanel({ response }: { response: AdvisorResponseV1 }) {
  return (
    <div className="mt-2 space-y-2 text-12 text-ink-0">
      <div className="font-mono text-10 uppercase text-ink-3">1 · Facts</div>
      <ul className="list-disc list-inside ml-2">
        {response.facts.bullets.map((b, i) => (<li key={i}>{b}</li>))}
      </ul>
      {response.redFlags.flags.length > 0 && (
        <>
          <div className="font-mono text-10 uppercase text-ink-3">2 · Red flags</div>
          <ul className="list-disc list-inside ml-2">
            {response.redFlags.flags.map((f, i) => (
              <li key={i}>{f.indicator} <span className="text-ink-3">→ {f.typology.replace(/_/g, " ")}</span></li>
            ))}
          </ul>
        </>
      )}
      <div className="font-mono text-10 uppercase text-ink-3">3 · Citations</div>
      <div className="ml-2">
        {Object.entries(response.frameworkCitations.byClass)
          .filter(([, list]) => (list?.length ?? 0) > 0)
          .map(([cls, list]) => (
            <div key={cls}><span className="font-mono text-10 text-ink-3">Class {cls}:</span> {(list ?? []).join(" · ")}</div>
          ))}
      </div>
      <div className="font-mono text-10 uppercase text-ink-3">4 · Decision</div>
      <div className="ml-2">
        <strong>{response.decision.verdict.replace(/_/g, " ").toUpperCase()}</strong> — {response.decision.oneLineRationale}
      </div>
      <div className="font-mono text-10 uppercase text-ink-3">5 · Confidence</div>
      <div className="ml-2">{response.confidence.score}/5{response.confidence.reason ? ` — ${response.confidence.reason}` : ""}</div>
      <div className="font-mono text-10 uppercase text-ink-3">6 · Inspector challenge</div>
      <div className="ml-2">
        <em>{response.counterArgument.inspectorChallenge}</em>
        {response.counterArgument.rebuttal && <div className="mt-1">Rebuttal: {response.counterArgument.rebuttal}</div>}
      </div>
      <div className="font-mono text-10 uppercase text-ink-3">7 · Audit trail</div>
      <div className="ml-2 font-mono text-10 text-ink-2">
        charter {response.auditTrail.charterVersionHash} · ts {response.auditTrail.timestamp}
        {response.auditTrail.retrievedSources.length > 0 && (
          <> · sources {response.auditTrail.retrievedSources.map((s) => `[${s.class}] ${s.sourceId} ${s.articleRef}`).join(" · ")}</>
        )}
      </div>
      <div className="font-mono text-10 uppercase text-ink-3">8 · Escalation</div>
      <div className="ml-2">
        Responsible: {response.escalationPath.responsible} · Accountable: {response.escalationPath.accountable}
        <div>Next action: {response.escalationPath.nextAction}</div>
      </div>
    </div>
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
