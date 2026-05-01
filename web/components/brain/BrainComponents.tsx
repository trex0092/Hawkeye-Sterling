"use client";

import { useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { BarChart, Donut } from "@/components/ui/Charts";

interface Manifest {
  product: string;
  version: string;
  generatedAt: string;
  charter: {
    prohibitions: Array<{ id: string; label: string }>;
    matchConfidence: string[];
    outputStructure: string[];
    regulatoryAnchors: string[];
    authoritativeLists: string[];
  };
  cognitiveCatalogue: {
    faculties: Array<{
      id: string;
      displayName: string;
      describes: string;
      synonyms?: string[];
      modeCount: number;
    }>;
    reasoningModes: {
      total: number;
      byCategory: Record<string, number>;
      byWave?: { wave1: number; wave2: number };
    };
    adverseMedia: {
      categories: Array<{ id: string; displayName: string; keywordCount: number }>;
      totalKeywords: number;
      queryLength?: number;
    };
    doctrines: {
      total: number;
      mandatoryInUAE: number;
      byAuthority: Record<string, number>;
    };
    redFlags: {
      total: number;
      bySeverity?: { low: number; medium: number; high: number };
      byTypology: Record<string, number>;
    };
    typologies: { total: number; ids: string[] };
    matching?: { methods: string[] };
    sanctionRegimes: {
      total: number;
      mandatoryInUAE: number;
      byAuthority: Record<string, number>;
    };
    jurisdictions: { total: number; byFatfStatus?: Record<string, number> };
    dpmsKpis: { total: number; byCluster?: Record<string, number> };
    cahra: { total: number; activeCount?: number };
    thresholds: { total: number; ids: string[] };
    playbooks: { total: number; ids: string[] };
    redlines: { total: number; ids: string[] };
    fatf: { total: number; ids: string[] };
    dispositions: { total: number; ids: string[] };
    skills: {
      total: number;
      byLayer?: Record<string, number>;
      byDomain?: Record<string, number>;
    };
    amplifier: {
      version: string;
      percent: number;
      factor: number;
      directives: string[];
    };
    metaCognition: {
      total: number;
      byCategory?: Record<string, number>;
      ids?: string[];
    };
  };
  integrity: {
    charterHash: string;
    catalogueHash: string;
  };
}

interface Integrity {
  charterHash: string;
  catalogueHash: string;
  compositeHash?: string;
}

interface Enhanced {
  extended: {
    taxonomy: Record<string, number>;
    regulatory: Record<string, number>;
    expertise: Record<string, number>;
  };
  crossReferences: {
    redFlagsByTypology: Array<{ typology: string; count: number }>;
    jurisdictionsByRegion: Array<{ region: string; count: number }>;
    typologyCount: number;
    topTypologies: Array<{ id: string; title: string }>;
  };
  totals: {
    catalogues: number;
    enhancedCatalogues: number;
    regulatoryRecords: number;
    taxonomyRecords: number;
    skillsRecords: number;
    totalRecords: number;
  };
}

interface Response {
  ok: boolean;
  manifest?: Manifest;
  integrity?: Integrity;
  enhanced?: Enhanced;
  error?: string;
  detail?: string;
}

/** Self-loading manifest panel — audit strip + dashboard. Used standalone
 *  at /weaponized-brain (legacy entry) and embedded as a tab in the merged
 *  Workbench Brain page. */
export function BrainManifestPanel() {
  const [state, setState] = useState<
    | { status: "loading" }
    | {
        status: "ready";
        data: {
          manifest: Manifest;
          integrity: Integrity;
          enhanced: Enhanced | null;
        };
      }
    | { status: "error"; error: string }
  >({ status: "loading" });

  useEffect(() => {
    fetch("/weaponized-brain.json")
      .then((r) => (r.ok ? r : fetch("/api/weaponized-brain")))
      .then((r) => r.json() as Promise<Response>)
      .then((r) => {
        if (r.ok && r.manifest && r.integrity) {
          setState({
            status: "ready",
            data: {
              manifest: r.manifest,
              integrity: r.integrity,
              enhanced: r.enhanced ?? null,
            },
          });
        } else {
          setState({ status: "error", error: r.detail ?? r.error ?? "unknown" });
        }
      })
      .catch((e: unknown) =>
        setState({ status: "error", error: e instanceof Error ? e.message : String(e) }),
      );
  }, []);

  return (
    <>
      <AuditStrip />
      {state.status === "loading" && (
        <div className="text-12 text-ink-2">Loading weaponized manifest…</div>
      )}
      {state.status === "error" && (
        <div className="text-12 text-red bg-red-dim rounded px-3 py-2.5">
          Failed to load: {state.error}
        </div>
      )}
      {state.status === "ready" && <BrainDashboard {...state.data} />}
    </>
  );
}

export default function WeaponizedBrainPage() {
  return (
    <ModuleLayout asanaModule="weaponized-brain" asanaLabel="Weaponized Brain">
      <div>
        <div className="mb-8">
          <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
            MODULE 06 · WEAPONIZED BRAIN
          </div>
          <h1 className="font-display font-normal text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
            The full <em className="italic text-brand">arsenal.</em>
          </h1>
          <p className="max-w-[72ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
            <strong>One signed contract · 19 catalogues · every screening inherits it.</strong>{" "}
            The weaponized brain fuses the charter, faculties, reasoning modes, doctrines,
            red flags, typologies, sanction regimes, jurisdictions, DPMS KPIs, CAHRA seed,
            thresholds, playbooks, redlines, FATF recommendations, dispositions, skills,
            cognitive amplifiers and meta-cognition into a single policy document every
            downstream integration imports verbatim.
          </p>
        </div>

        <BrainConsole />
        <BrainManifestPanel />
      </div>
    </ModuleLayout>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Live self-audit strip — green/red status from auditBrain() exposed via
// /api/weaponized-brain/audit. Proves the catalogue resolves, the IDs are
// unique, and every faculty/template points at a real mode.
// ────────────────────────────────────────────────────────────────────────────

interface AuditReport {
  ok: boolean;
  totals: {
    faculties: number;
    reasoningModes: number;
    questionTemplates: number;
    scenarios: number;
    adverseMediaCategories: number;
    adverseMediaKeywords: number;
    adverseMediaQueryLength: number;
  };
  implementation: { implementedCount: number; totalCount: number; percent: number };
  problems: string[];
}

interface AuditResponse {
  ok: boolean;
  report?: AuditReport;
  integrity?: { charterHash: string; catalogueHash: string; compositeHash?: string };
  error?: string;
}

export function AuditStrip() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = () => {
    setReloading(true);
    fetch("/api/weaponized-brain/audit")
      .then(async (r) => {
        // Defensive parse — the audit route is anon-allowed but if a future
        // gate change ever returns an empty body or HTML error page, surface
        // the status instead of throwing "Unexpected end of JSON input".
        const text = await r.text();
        if (!text) {
          return { ok: false, error: `HTTP ${r.status} (empty body)` } as AuditResponse;
        }
        try {
          return JSON.parse(text) as AuditResponse;
        } catch {
          return {
            ok: false,
            error: `HTTP ${r.status} (non-JSON: ${text.slice(0, 120)})`,
          } as AuditResponse;
        }
      })
      .then(setData)
      .catch((e: unknown) =>
        setData({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      )
      .finally(() => setReloading(false));
  };
  useEffect(load, []);

  if (!data) {
    return (
      <div className="mb-4 text-11 font-mono text-ink-3 px-3 py-2 border border-hair-2 rounded bg-bg-panel">
        Auditing brain…
      </div>
    );
  }
  if (!data.ok || !data.report) {
    return (
      <div className="mb-4 text-12 text-red bg-red-dim border border-red/20 rounded px-3 py-2">
        Audit failed: {data.error ?? "unknown"}
      </div>
    );
  }
  const r = data.report;
  const ok = r.ok && r.problems.length === 0;
  return (
    <div
      className={`mb-6 rounded-lg border px-4 py-3 ${
        ok ? "bg-bg-panel border-hair-2" : "bg-red-dim border-red/30"
      }`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-11 font-mono uppercase tracking-wide-3 ${
            ok ? "bg-green-100 text-green-800" : "bg-red text-bg-0"
          }`}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
          {ok ? "Brain audit · OK" : `Brain audit · ${r.problems.length} problem(s)`}
        </span>
        <AuditChip label="Faculties" value={r.totals.faculties} />
        <AuditChip label="Reasoning modes" value={r.totals.reasoningModes} />
        <AuditChip label="Templates" value={r.totals.questionTemplates} />
        <AuditChip label="Scenarios" value={r.totals.scenarios} />
        <AuditChip
          label="Implementation"
          value={`${r.implementation.implementedCount}/${r.implementation.totalCount} (${r.implementation.percent}%)`}
        />
        <button
          type="button"
          onClick={load}
          disabled={reloading}
          className="ml-auto text-10 font-mono uppercase tracking-wide-3 px-2 py-1 border border-hair-2 rounded hover:bg-bg-2 disabled:opacity-50"
        >
          {reloading ? "Re-auditing…" : "Re-audit"}
        </button>
      </div>
      {!ok && r.problems.length > 0 && (
        <ul className="mt-2 text-11 font-mono text-red list-disc pl-5 max-h-32 overflow-auto">
          {r.problems.slice(0, 20).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AuditChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-9 uppercase tracking-wide-3 text-ink-3">{label}</span>
      <span className="font-mono text-12 text-ink-0">{value}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Live reasoning console — POSTs the supplied subject + narrative to
// /api/weaponized-brain/reason and renders the full reasoning chain, every
// brain module cited, the redlines fired, the disposition, and the
// catalogue-summary fragment of the weaponized system prompt that any LLM
// invocation would inherit. This turns the Brain page from a manifest into
// the firing range every other module screens through.
// ────────────────────────────────────────────────────────────────────────────

interface ReasonResponse {
  ok: boolean;
  composite?: { score: number; breakdown: Record<string, number> };
  disposition?: { code: string; label: string; rationale: string };
  screen?: {
    topScore: number;
    severity: string;
    hits: Array<{
      listId: string;
      listRef: string;
      candidateName: string;
      score: number;
      method: string;
      reason: string;
    }>;
  };
  jurisdiction?: { iso2: string; name: string; region: string; cahra: boolean; regimes: string[] } | null;
  pep?: { type: string; tier: number; salience: number } | null;
  adverseMedia?: Array<{ categoryId: string; keyword: string }>;
  typologies?: {
    hits: Array<{ id: string; name: string; family: string; weight: number; snippet: string }>;
    compositeScore: number;
  };
  redlines?: { fired: Array<{ id: string; label: string; action: string; regulatoryAnchor: string }>; action: string | null; summary: string };
  cited?: Array<{ kind: string; id: string; label: string; detail?: string }>;
  steps?: Array<{ step: string; cited: string[]; finding: string }>;
  variants?: {
    aliasExpansion: string[];
    nameVariants: string[];
    doubleMetaphone: { primary: string; secondary: string };
    soundex: string;
  };
  promptPreview?: string;
  // Weaponize-more — five firepower panels.
  timings?: {
    quickScreen: number;
    jurisdiction: number;
    pep: number;
    adverseMediaTypology: number;
    redlines: number;
    doctrines: number;
    metaCognition: number;
    composite: number;
    total: number;
  };
  counterfactuals?: {
    baseline: { composite: { score: number }; disposition: { code: string; label: string } };
    nudges: Array<{
      label: string;
      hypothesis: string;
      result: { composite: { score: number }; disposition: { code: string; label: string } };
      deltaScore: number;
      deltaDisposition: string | null;
    }>;
  };
  steelman?: Array<{
    finding: string;
    counterArgument: string;
    citation: string;
    evidenceTest: string;
  }>;
  modeCoverage?: {
    totalCatalogued: number;
    totalFired: number;
    byFaculty: Array<{
      faculty: string;
      modes: Array<{ id: string; name: string; category: string; faculties: readonly string[] }>;
    }>;
  };
  narrative?: string;
  error?: string;
}

const SAMPLE_PRESETS: Array<{ id: string; label: string; payload: { subject: { name: string; jurisdiction?: string; entityType?: string; sector?: string; aliases?: string[] }; roleText?: string; narrative?: string } }> = [
  {
    id: "russian-pep",
    label: "Russian PEP · TF narrative",
    payload: {
      subject: { name: "Vladimir Petrov", jurisdiction: "Russia", entityType: "individual", aliases: ["V. Petrov", "Владимир Петров"] },
      roleText: "Deputy Minister of Defence of the Russian Federation",
      narrative:
        "Wire transfers totalling USD 4.2m from a UAE corporate account to two Cyprus shell entities, followed by onward transfers to crypto exchanges. Counterparties named in OFAC SDN. Adverse media references terrorism financing, sanctions evasion, and proliferation procurement networks routed through the Caucasus.",
    },
  },
  {
    id: "uae-gold",
    label: "UAE gold refinery · CAHRA exposure",
    payload: {
      subject: { name: "Emirates Bullion Refinery LLC", jurisdiction: "United Arab Emirates", entityType: "organisation", sector: "gold refinery" },
      roleText: "",
      narrative:
        "Refinery accepting doré gold consignments declared as Mali-origin. Supplier paperwork lists transit via Dubai. No OECD Annex II disclosures attached. Counterparty bank in CAHRA jurisdiction; cash-intensive cross-border channels; structuring of inbound payments below USD 55,000.",
    },
  },
  {
    id: "crypto-vasp",
    label: "Crypto VASP · cybercrime nexus",
    payload: {
      subject: { name: "AlphaSwap Exchange", jurisdiction: "Seychelles", entityType: "organisation", sector: "virtual asset service provider" },
      roleText: "",
      narrative:
        "VASP processing high volumes of privacy-coin swaps with destinations in mixers and bridge contracts associated with ransomware payments. Cybercrime, fraud, and human trafficking proceeds reported by OSINT sources. No travel-rule compliance evident.",
    },
  },
];

export interface BrainConsoleInitialValues {
  name?: string;
  aliases?: string;
  jurisdiction?: string;
  entityType?: string;
  sector?: string;
  roleText?: string;
  narrative?: string;
}

export function BrainConsole({ initialValues }: { initialValues?: BrainConsoleInitialValues } = {}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [aliases, setAliases] = useState(initialValues?.aliases ?? "");
  const [jurisdiction, setJurisdiction] = useState(initialValues?.jurisdiction ?? "");
  const [entityType, setEntityType] = useState<string>(initialValues?.entityType ?? "individual");
  const [sector, setSector] = useState(initialValues?.sector ?? "");
  const [roleText, setRoleText] = useState(initialValues?.roleText ?? "");
  const [narrative, setNarrative] = useState(initialValues?.narrative ?? "");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReasonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreset = (id: string) => {
    const preset = SAMPLE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setName(preset.payload.subject.name);
    setAliases((preset.payload.subject.aliases ?? []).join(", "));
    setJurisdiction(preset.payload.subject.jurisdiction ?? "");
    setEntityType(preset.payload.subject.entityType ?? "individual");
    setSector(preset.payload.subject.sector ?? "");
    setRoleText(preset.payload.roleText ?? "");
    setNarrative(preset.payload.narrative ?? "");
  };

  const run = async () => {
    if (!name.trim()) {
      setError("Subject name is required.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/weaponized-brain/reason", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: {
            name: name.trim(),
            aliases: aliases
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            entityType,
            jurisdiction: jurisdiction.trim() || undefined,
            sector: sector.trim() || undefined,
          },
          roleText: roleText.trim() || undefined,
          adverseMediaText: narrative.trim() || undefined,
        }),
      });
      const data = (await res.json()) as ReasonResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-10 border border-hair-2 rounded-xl overflow-hidden">
      <div className="grid lg:grid-cols-2 gap-0">
        {/* Inputs */}
        <div className="p-4 border-r border-hair-2 space-y-3">
          <Field label="Subject name *">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vladimir Petrov"
              className="w-full px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
            />
          </Field>
          <Field label="Aliases (comma-separated)">
            <input
              type="text"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="V. Petrov, Владимир Петров"
              className="w-full px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jurisdiction">
              <input
                type="text"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="Russia · RU · United Arab Emirates"
                className="w-full px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
              />
            </Field>
            <Field label="Entity type">
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
              >
                <option value="individual">individual</option>
                <option value="organisation">organisation</option>
                <option value="vessel">vessel</option>
                <option value="aircraft">aircraft</option>
                <option value="other">other</option>
              </select>
            </Field>
          </div>
          <Field label="Sector / business activity">
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="gold refinery, correspondent banking, crypto VASP…"
              className="w-full px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
            />
          </Field>
          <Field label="Role text (PEP classifier input)">
            <input
              type="text"
              value={roleText}
              onChange={(e) => setRoleText(e.target.value)}
              placeholder="e.g. Deputy Minister of Defence"
              className="w-full px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
            />
          </Field>
          <Field label="Narrative / adverse-media text">
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={6}
              placeholder="Paste OSINT, transaction patterns, news headlines, account narrative…"
              className="w-full px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1 font-mono"
            />
          </Field>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="px-4 py-2 bg-brand text-bg-0 rounded text-12 font-semibold uppercase tracking-wide-3 disabled:opacity-50"
            >
              {running ? "Reasoning…" : "Fire the brain"}
            </button>
            {error && <span className="text-11 text-red">{error}</span>}
          </div>
        </div>

        {/* Output */}
        <div className="p-4 bg-bg-1/40 max-h-[720px] overflow-auto">
          {!result && !running && (
            <div className="space-y-3">
              <div className="text-11 text-ink-3 italic">
                Pick a preset above or fill in a subject. The full reasoning chain — watchlist hits, jurisdiction profile, redlines fired, doctrines in scope, typology fingerprints, meta-cognition primitives, composite score and disposition — will render here.
              </div>
              <div className="text-10 text-ink-3 bg-bg-2 border border-hair-2 rounded p-2.5 space-y-1">
                <div className="font-semibold text-ink-2">⚠ For accurate scoring — fill ALL fields:</div>
                <div>• <strong>Jurisdiction</strong> — ISO-2 code or country name (e.g. "RU", "Russia", "TR", "AE")</div>
                <div>• <strong>Sector</strong> — business activity (e.g. "gold refinery", "VASP", "real estate")</div>
                <div>• <strong>Narrative</strong> — paste adverse media, OSINT, or transaction text here. <em>An empty narrative field produces 0 adverse-media score regardless of subject profile.</em></div>
                <div className="mt-1 pt-1 border-t border-hair text-ink-3">The composite score shown here reflects ONLY what you input — it is independent of any screening-panel score for the same subject.</div>
              </div>
            </div>
          )}
          {running && <div className="text-12 text-ink-2 font-mono">Composing reasoning chain…</div>}
          {result && (
            <>
              {result.composite?.score === 0 && !narrative.trim() && (
                <div className="mb-3 px-3 py-2 bg-amber-dim border border-amber/30 rounded text-11 text-amber font-medium">
                  ⚠ Composite 0/100 because the <strong>Narrative field is empty</strong> — adverse-media scoring was not applied. Paste OSINT, news headlines, or adverse media text and re-run for an accurate score.
                </div>
              )}
              {result.composite?.score === 0 && !jurisdiction.trim() && (
                <div className="mb-3 px-3 py-2 bg-amber-dim border border-amber/30 rounded text-11 text-amber">
                  ⚠ <strong>Jurisdiction field is empty</strong> — no jurisdiction penalty applied. Enter the subject's country (e.g. "RU" or "Russia") for a complete assessment.
                </div>
              )}
              <BrainResult r={result} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-9 uppercase tracking-wide-3 text-ink-3 block mb-1">{label}</span>
      {children}
    </label>
  );
}

const KIND_TONE: Record<string, string> = {
  redline: "bg-red text-bg-0",
  regime: "bg-amber-100 text-amber-900",
  doctrine: "bg-violet-dim text-violet",
  typology: "bg-red-dim text-red",
  "meta-cognition": "bg-blue-100 text-blue-900",
  jurisdiction: "bg-bg-2 text-ink-1",
};

function BrainResult({ r }: { r: ReasonResponse }) {
  const verdict = r.disposition?.code ?? "—";
  const score = r.composite?.score ?? 0;
  const severity = r.screen?.severity ?? "clear";
  const sevTone =
    severity === "critical"
      ? "bg-red text-bg-0"
      : severity === "high"
        ? "bg-amber-200 text-amber-900"
        : severity === "medium"
          ? "bg-amber-100 text-amber-800"
          : severity === "low"
            ? "bg-bg-2 text-ink-1"
            : "bg-green-100 text-green-800";

  return (
    <div className="space-y-4">
      {/* Verdict header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`px-2 py-0.5 rounded-full text-11 font-mono uppercase tracking-wide-3 ${sevTone}`}>
          {severity}
        </span>
        <span className="font-mono text-22 font-semibold text-ink-0">{score}/100</span>
        <span className="px-2 py-0.5 rounded text-11 font-mono uppercase tracking-wide-3 bg-ink-0 text-bg-0">
          {verdict}
        </span>
        {r.disposition && <span className="text-11 text-ink-1">{r.disposition.label}</span>}
      </div>
      {r.disposition && (
        <div className="text-11 text-ink-2 italic border-l-2 border-brand pl-2">
          {r.disposition.rationale}
        </div>
      )}

      {/* Composite breakdown */}
      {r.composite?.breakdown && (
        <ResultSection title="Composite breakdown">
          <div className="flex flex-wrap gap-2">
            {Object.entries(r.composite.breakdown).map(([k, v]) => (
              <span key={k} className="text-10 font-mono px-1.5 py-0.5 rounded bg-bg-2 text-ink-1">
                {humanKey(k)}: <span className="text-brand">{v}</span>
              </span>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Reasoning chain */}
      {r.steps && r.steps.length > 0 && (
        <ResultSection title="Reasoning chain">
          <ol className="space-y-2 list-decimal pl-5">
            {r.steps.map((s, i) => (
              <li key={i} className="text-11 text-ink-1">
                <span className="font-semibold text-ink-0">{s.step}.</span> {s.finding}
                {s.cited.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {s.cited.map((c) => (
                      <span key={c} className="text-9 font-mono px-1 rounded bg-bg-2 text-ink-2">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </ResultSection>
      )}

      {/* Per-stage telemetry */}
      {r.timings && <TelemetryStrip timings={r.timings} />}

      {/* Counterfactual sensitivity dial */}
      {r.counterfactuals && r.counterfactuals.nudges.length > 0 && (
        <CounterfactualPanel data={r.counterfactuals} />
      )}

      {/* Adversarial steelman */}
      {r.steelman && r.steelman.length > 0 && <SteelmanPanel items={r.steelman} />}

      {/* Mode-coverage map */}
      {r.modeCoverage && r.modeCoverage.totalFired > 0 && (
        <ModeCoveragePanel data={r.modeCoverage} />
      )}

      {/* SAR/STR narrative */}
      {r.narrative && <NarrativePanel text={r.narrative} />}

      {/* Redlines */}
      {r.redlines && r.redlines.fired.length > 0 && (
        <ResultSection title={`Redlines fired (${r.redlines.fired.length})`}>
          <div className="space-y-1.5">
            {r.redlines.fired.map((rl) => (
              <div key={rl.id} className="border-l-2 border-red pl-2 text-11">
                <div className="font-semibold text-ink-0">{rl.label}</div>
                <div className="text-10 font-mono text-ink-3">
                  {rl.id} · action={rl.action} · {rl.regulatoryAnchor}
                </div>
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Watchlist hits */}
      {r.screen && r.screen.hits.length > 0 && (
        <ResultSection title={`Watchlist hits (${r.screen.hits.length})`}>
          <div className="space-y-1">
            {r.screen.hits.map((h, i) => (
              <div key={i} className="text-11 flex items-baseline gap-2">
                <span className="font-mono text-10 px-1 rounded bg-red-dim text-red">
                  {h.score}
                </span>
                <span className="text-ink-0">{h.candidateName}</span>
                <span className="text-10 font-mono text-ink-3">
                  {h.listId} · {h.listRef} · {h.method}
                </span>
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Typology fingerprints */}
      {r.typologies && r.typologies.hits.length > 0 && (
        <ResultSection title={`Typology fingerprints (${r.typologies.hits.length})`}>
          <div className="space-y-1">
            {r.typologies.hits.map((t) => (
              <div key={t.id} className="text-11">
                <span className="font-semibold text-ink-0">{t.name}</span>{" "}
                <span className="text-10 font-mono text-ink-3">
                  {t.family} · w={t.weight}
                </span>
                <div className="text-10 text-ink-2 italic">{t.snippet}</div>
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Cited modules */}
      {r.cited && r.cited.length > 0 && (
        <ResultSection title={`Brain modules cited (${r.cited.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {r.cited.map((c, i) => (
              <span
                key={i}
                title={c.detail}
                className={`text-10 font-mono px-1.5 py-0.5 rounded ${KIND_TONE[c.kind] ?? "bg-bg-2 text-ink-1"}`}
              >
                <span className="opacity-60">{c.kind}:</span> {c.label}
              </span>
            ))}
          </div>
        </ResultSection>
      )}

      {/* Variants */}
      {r.variants && (
        <ResultSection title="Name-variant index">
          <div className="grid grid-cols-2 gap-2 text-10 font-mono">
            <div>
              <div className="text-ink-3 uppercase tracking-wide-3 text-9">Phonetic</div>
              <div className="text-ink-1">
                metaphone: {r.variants.doubleMetaphone.primary}
                {r.variants.doubleMetaphone.secondary && `/${r.variants.doubleMetaphone.secondary}`}
                {" · "}soundex: {r.variants.soundex}
              </div>
            </div>
            <div>
              <div className="text-ink-3 uppercase tracking-wide-3 text-9">Aliases</div>
              <div className="text-ink-1">{r.variants.aliasExpansion.slice(0, 6).join(", ") || "—"}</div>
            </div>
            <div className="col-span-2">
              <div className="text-ink-3 uppercase tracking-wide-3 text-9">Translit variants</div>
              <div className="text-ink-1">{r.variants.nameVariants.slice(0, 8).join(" · ") || "—"}</div>
            </div>
          </div>
        </ResultSection>
      )}

      {/* Weaponized prompt preview */}
      {r.promptPreview && (
        <ResultSection title="Weaponized system-prompt preview (catalogue summary fragment)">
          <PromptPreviewPanel text={r.promptPreview} />
        </ResultSection>
      )}
    </div>
  );
}

function PromptPreviewPanel({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sections = parseStructuredNarrative(text);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-10 font-mono text-ink-3">
          Catalogue + charter fragment injected into every downstream integration verbatim.
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-10 font-mono px-2 py-1 rounded bg-bg-2 text-ink-1 hover:bg-bg-1 border border-hair-2"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="text-10 font-mono px-2 py-1 rounded bg-brand-dim text-brand border border-brand/40 hover:bg-brand/20 transition-colors"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>
      <div
        className={`bg-bg-1 border border-hair-2 rounded overflow-auto divide-y divide-hair-2 ${
          expanded ? "max-h-[36rem]" : "max-h-56"
        }`}
      >
        {sections.length === 0 ? (
          <pre className="text-10 font-mono text-ink-1 whitespace-pre-wrap p-2 m-0">{text}</pre>
        ) : (
          sections.map((s, i) => (
            <section key={i} className="p-2.5">
              {s.heading && (
                <div className="text-9 uppercase tracking-wide-3 text-brand font-semibold font-mono mb-1">
                  {s.heading}
                </div>
              )}
              <pre className="text-10 font-mono text-ink-1 whitespace-pre-wrap m-0">{s.body}</pre>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-9 uppercase tracking-wide-3 text-ink-3 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function humanKey(k: string): string {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase());
}

export function BrainDashboard({
  manifest,
  integrity,
  enhanced,
}: {
  manifest: Manifest;
  integrity: Integrity;
  enhanced: Enhanced | null;
}) {
  const c = manifest.cognitiveCatalogue;
  return (
    <>
      {/* Charter */}
      <Section title="Charter">
        <Grid>
          <Card title="Absolute prohibitions" count={manifest.charter.prohibitions.length}>
            {manifest.charter.prohibitions.slice(0, 6).map((p) => (
              <LineItem key={p.id} primary={p.label} secondary={p.id} />
            ))}
          </Card>
          <Card
            title="Match-confidence levels"
            count={manifest.charter.matchConfidence.length}
          >
            {manifest.charter.matchConfidence.map((m) => (
              <Tag key={m}>{m}</Tag>
            ))}
          </Card>
          <Card title="Output structure" count={manifest.charter.outputStructure.length}>
            {manifest.charter.outputStructure.map((o) => (
              <LineItem key={o} primary={o} />
            ))}
          </Card>
          <Card title="Regulatory anchors" count={manifest.charter.regulatoryAnchors.length}>
            {manifest.charter.regulatoryAnchors.slice(0, 8).map((a) => (
              <Tag key={a} tone="violet">
                {a}
              </Tag>
            ))}
          </Card>
          <Card title="Main authoritative lists" count={manifest.charter.authoritativeLists.length}>
            {manifest.charter.authoritativeLists.slice(0, 8).map((a) => (
              <LineItem key={a} primary={a} />
            ))}
          </Card>
        </Grid>
      </Section>

      {/* Cognitive catalogue */}
      <Section title="Cognitive catalogue">
        <Grid>
          <Card title="Faculties" count={c.faculties.length}>
            {c.faculties.map((f) => (
              <LineItem
                key={f.id}
                primary={f.displayName}
                secondary={`${f.modeCount} modes`}
              />
            ))}
          </Card>
          <Card title="Reasoning modes" count={c.reasoningModes.total}>
            {Object.entries(c.reasoningModes.byCategory ?? {})
              .slice(0, 8)
              .map(([k, n]) => (
                <LineItem key={k} primary={k} secondary={`${n}`} />
              ))}
          </Card>
          <Card title="Skills" count={c.skills.total}>
            {Object.entries(c.skills.byDomain ?? {})
              .slice(0, 10)
              .map(([k, n]) => (
                <LineItem key={k} primary={k} secondary={`${n}`} />
              ))}
          </Card>
          <Card
            title="Doctrines"
            count={c.doctrines.total}
            badge={`${c.doctrines.mandatoryInUAE} mandatory in UAE`}
          >
            {Object.entries(c.doctrines.byAuthority ?? {}).map(([auth, n]) => (
              <LineItem key={auth} primary={auth} secondary={`${n}`} />
            ))}
          </Card>
          <Card title="Adverse media" count={c.adverseMedia.categories.length}>
            {c.adverseMedia.categories.map((a) => (
              <LineItem
                key={a.id}
                primary={a.displayName}
                secondary={`${a.keywordCount} kw`}
              />
            ))}
          </Card>
          <Card title="Typologies" count={c.typologies.total}>
            {c.typologies.ids.slice(0, 20).map((id) => (
              <Tag key={id}>{id}</Tag>
            ))}
          </Card>
          <Card title="Red flags" count={c.redFlags.total}>
            {Object.entries(c.redFlags.byTypology ?? {}).map(([k, n]) => (
              <LineItem key={k} primary={k} secondary={`${n}`} />
            ))}
          </Card>
          <Card
            title="Sanction regimes"
            count={c.sanctionRegimes.total}
            badge={`${c.sanctionRegimes.mandatoryInUAE} UAE-mandatory`}
          >
            {Object.entries(c.sanctionRegimes.byAuthority ?? {})
              .slice(0, 8)
              .map(([auth, n]) => (
                <LineItem key={auth} primary={auth} secondary={`${n}`} />
              ))}
          </Card>
          <Card title="Playbooks" count={c.playbooks.total}>
            {c.playbooks.ids.slice(0, 8).map((id) => (
              <Tag key={id}>{id}</Tag>
            ))}
          </Card>
          <Card title="FATF" count={c.fatf.total}>
            {c.fatf.ids.slice(0, 8).map((id) => (
              <Tag key={id} tone="violet">
                {id}
              </Tag>
            ))}
          </Card>
          <Card title="Dispositions" count={c.dispositions.total}>
            {c.dispositions.ids.slice(0, 8).map((id) => (
              <Tag key={id}>{id}</Tag>
            ))}
          </Card>
          <Card title="Thresholds" count={c.thresholds.total}>
            {c.thresholds.ids.slice(0, 8).map((id) => (
              <Tag key={id}>{id}</Tag>
            ))}
          </Card>
          <Card title="Jurisdictions" count={c.jurisdictions.total}>
            {Object.entries(c.jurisdictions.byFatfStatus ?? {}).map(([k, n]) => (
              <LineItem key={k} primary={k} secondary={`${n}`} />
            ))}
          </Card>
          <Card
            title="CAHRA"
            count={c.cahra.total}
            badge={
              c.cahra.activeCount !== undefined
                ? `${c.cahra.activeCount} active`
                : undefined
            }
          />
          <Card title="DPMS KPIs" count={c.dpmsKpis.total}>
            {Object.entries(c.dpmsKpis.byCluster ?? {}).map(([k, n]) => (
              <LineItem key={k} primary={k} secondary={`${n}`} />
            ))}
          </Card>
          <Card title="Redlines" count={c.redlines.total}>
            {c.redlines.ids.slice(0, 8).map((id) => (
              <Tag key={id} tone="violet">
                {id}
              </Tag>
            ))}
          </Card>
          <Card
            title="Cognitive amplifier"
            count={c.amplifier.directives.length}
            badge={`${c.amplifier.version} · ×${c.amplifier.factor.toLocaleString()}`}
          />
          <Card title="Meta-cognition" count={c.metaCognition.total}>
            {Object.entries(c.metaCognition.byCategory ?? {}).map(([k, n]) => (
              <LineItem key={k} primary={k} secondary={`${n}`} />
            ))}
          </Card>
        </Grid>
      </Section>

      {enhanced && (
        <>
          {/* Top-line enhanced totals */}
          <Section title="Enhanced totals">
            <div className="bg-ink-0 text-bg-0 rounded-lg px-4 py-3 flex flex-wrap gap-5 items-center">
              <Stat label="Catalogues (core)" value={enhanced.totals?.catalogues} />
              <Stat label="Extended catalogues" value={enhanced.totals?.enhancedCatalogues} />
              <Stat label="Taxonomy records" value={enhanced.totals?.taxonomyRecords} />
              <Stat label="Regulatory records" value={enhanced.totals?.regulatoryRecords} />
              <Stat label="Skills records" value={enhanced.totals?.skillsRecords} />
              <Stat label="Total records" value={enhanced.totals?.totalRecords} />
            </div>
          </Section>

          {/* Catalogue size chart */}
          <Section title="Catalogue sizes">
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
              <BarChart
                data={([
                  { label: "Skills", value: enhanced.extended?.expertise?.skills ?? 0, tone: "brand" },
                  { label: "Jurisdictions (full)", value: enhanced.extended?.regulatory?.jurisdictionsFull ?? 0, tone: "violet" },
                  { label: "Reasoning modes", value: manifest.cognitiveCatalogue?.reasoningModes?.total ?? 0, tone: "brand" },
                  { label: "Red flags (extended)", value: enhanced.extended?.taxonomy?.redFlagsExtended ?? 0, tone: "red" },
                  { label: "Typologies", value: enhanced.extended?.taxonomy?.typologies ?? 0, tone: "red" },
                  { label: "FATF recommendations", value: enhanced.extended?.regulatory?.fatfRecommendations ?? 0, tone: "violet" },
                  { label: "Question templates", value: enhanced.extended?.taxonomy?.questionTemplates ?? 0, tone: "blue" },
                  { label: "Policies", value: enhanced.extended?.regulatory?.policies ?? 0, tone: "green" },
                  { label: "UAE free zones", value: enhanced.extended?.regulatory?.uaeFreeZones ?? 0, tone: "amber" },
                  { label: "DPMS KPIs", value: enhanced.extended?.regulatory?.dpmsKpis ?? 0, tone: "amber" },
                  { label: "Scenarios", value: enhanced.extended?.taxonomy?.scenarios ?? 0, tone: "blue" },
                  { label: "Meta-cognition", value: enhanced.extended?.taxonomy?.metaCognition ?? 0, tone: "violet" },
                  { label: "Sanction regimes", value: enhanced.extended?.regulatory?.sanctionRegimes ?? 0, tone: "red" },
                  { label: "Risk appetite", value: enhanced.extended?.regulatory?.riskAppetite ?? 0, tone: "green" },
                  { label: "CAHRA seed", value: enhanced.extended?.regulatory?.cahraSeed ?? 0, tone: "red" },
                  { label: "Dispositions", value: enhanced.extended?.regulatory?.dispositions ?? 0, tone: "green" },
                  { label: "Redlines", value: enhanced.extended?.regulatory?.redlines ?? 0, tone: "red" },
                  { label: "Sector rubrics", value: enhanced.extended?.taxonomy?.sectorRubrics ?? 0, tone: "blue" },
                  { label: "Cognitive amplifier", value: enhanced.extended?.expertise?.cognitiveAmplifier ?? 0, tone: "brand" },
                  { label: "Adverse-media cats", value: enhanced.extended?.taxonomy?.adverseMediaCategories ?? 0, tone: "red" },
                ] as const).filter((d) => d.value > 0).map((d) => ({...d}))}
              />
            </div>
          </Section>

          {/* Jurisdictions-by-region donut */}
          {(enhanced.crossReferences?.jurisdictionsByRegion?.length ?? 0) > 0 && (
            <Section title="Jurisdictional coverage · by region">
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 flex flex-wrap items-center justify-around gap-6">
                <Donut
                  size={240}
                  stroke={30}
                  centerValue={String(
                    (enhanced.crossReferences?.jurisdictionsByRegion ?? []).reduce(
                      (a, b) => a + b.count,
                      0,
                    ),
                  )}
                  centerLabel="Jurisdictions"
                  segments={(enhanced.crossReferences?.jurisdictionsByRegion ?? []).map((r, i) => ({
                    label: r.region,
                    value: r.count,
                    tone: (
                      ["brand", "violet", "amber", "green", "blue", "red"] as const
                    )[i % 6],
                  }))}
                />
                <div className="flex-1 min-w-[260px]">
                  <BarChart
                    compact
                    data={(enhanced.crossReferences?.redFlagsByTypology ?? []).slice(0, 10).map((r) => ({
                      label: r.typology,
                      value: r.count,
                      tone: "red",
                    }))}
                  />
                  <div className="text-10 font-mono tracking-wide-3 uppercase text-ink-3 mt-2 text-center">
                    Red flags · top 10 typologies
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Extended catalogues — never surfaced before */}
          <Section title="Extended · Taxonomy">
            <Grid>
              {Object.entries(enhanced.extended?.taxonomy ?? {}).map(([k, v]) => (
                <Card key={k} title={humanize(k)} count={v} />
              ))}
            </Grid>
          </Section>

          <Section title="Extended · Regulatory">
            <Grid>
              {Object.entries(enhanced.extended?.regulatory ?? {}).map(([k, v]) => (
                <Card key={k} title={humanize(k)} count={v} />
              ))}
            </Grid>
          </Section>

          <Section title="Extended · Expertise">
            <Grid>
              {Object.entries(enhanced.extended?.expertise ?? {}).map(([k, v]) => (
                <Card key={k} title={humanize(k)} count={v} />
              ))}
            </Grid>
          </Section>

          {/* Cross-references */}
          <Section title="Cross-references">
            <Grid>
              <Card
                title="Typologies"
                count={(enhanced.crossReferences?.typologyCount ?? 0)}
              >
                {(enhanced.crossReferences?.topTypologies ?? []).map((t) => (
                  <LineItem key={t.id} primary={t.title || t.id} secondary={t.id} />
                ))}
              </Card>
              <Card
                title="Red flags by typology"
                count={(enhanced.crossReferences?.redFlagsByTypology ?? []).reduce(
                  (a, b) => a + b.count,
                  0,
                )}
              >
                {(enhanced.crossReferences?.redFlagsByTypology ?? [])
                  .slice(0, 12)
                  .map((r) => (
                    <LineItem
                      key={r.typology}
                      primary={r.typology}
                      secondary={`${r.count}`}
                    />
                  ))}
              </Card>
              <Card
                title="Jurisdictions by region"
                count={(enhanced.crossReferences?.jurisdictionsByRegion ?? []).reduce(
                  (a, b) => a + b.count,
                  0,
                )}
              >
                {(enhanced.crossReferences?.jurisdictionsByRegion ?? []).map((j) => (
                  <LineItem
                    key={j.region}
                    primary={j.region}
                    secondary={`${j.count}`}
                  />
                ))}
              </Card>
            </Grid>
          </Section>
        </>
      )}

      {/* Integrity signature */}
      <Section title="Integrity signature">
        <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
          <table className="w-full text-12">
            <tbody>
              <IntegrityRow label="Charter hash" value={integrity.charterHash} />
              <IntegrityRow label="Catalogue hash" value={integrity.catalogueHash} />
              {integrity.compositeHash && (
                <IntegrityRow label="Composite hash" value={integrity.compositeHash} />
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

function IntegrityRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-hair last:border-0">
      <td className="py-1.5 pr-4 text-ink-2 font-medium uppercase tracking-wide-2 text-10.5">
        {label}
      </td>
      <td className="py-1.5 font-mono text-ink-0">{value}</td>
    </tr>
  );
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (m) => m.toUpperCase())
    .trim();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {children}
    </div>
  );
}

function Card({
  title,
  count,
  badge,
  children,
}: {
  title: string;
  count: number;
  badge?: string | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
      <div className="flex justify-between items-baseline mb-2">
        <div className="text-10.5 font-semibold uppercase tracking-wide-3 text-ink-2">
          {title}
        </div>
        <div className="font-mono text-16 font-semibold text-brand">{count}</div>
      </div>
      {badge && (
        <div className="text-10 font-mono text-ink-3 mb-1.5">{badge}</div>
      )}
      {children && <div className="flex flex-wrap gap-1.5 pt-1 border-t border-hair">{children}</div>}
    </div>
  );
}

function LineItem({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div className="w-full flex justify-between items-baseline text-11 py-0.5">
      <span className="text-ink-0 truncate mr-2">{primary}</span>
      {secondary && (
        <span className="font-mono text-10.5 text-ink-3 shrink-0">{secondary}</span>
      )}
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "violet" }) {
  const cls = tone === "violet" ? "bg-violet-dim text-violet" : "bg-bg-2 text-ink-1";
  return (
    <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 ${cls}`}>
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <div className="text-9 uppercase tracking-wide-4 text-bg-0/50">{label}</div>
      <div className="text-14 font-mono font-semibold text-brand">{value ?? "—"}</div>
    </div>
  );
}

// ── Weaponize-more panels ──────────────────────────────────────────────────

function TelemetryStrip({
  timings,
}: {
  timings: NonNullable<ReasonResponse["timings"]>;
}) {
  const stages: Array<[string, number]> = [
    ["quickScreen", timings.quickScreen],
    ["jurisdiction", timings.jurisdiction],
    ["pep", timings.pep],
    ["adverseMedia/typology", timings.adverseMediaTypology],
    ["redlines", timings.redlines],
    ["doctrines", timings.doctrines],
    ["meta-cognition", timings.metaCognition],
    ["composite", timings.composite],
  ];
  const max = Math.max(1, ...stages.map(([, v]) => v));
  return (
    <ResultSection title={`Per-stage telemetry · total ${timings.total} ms`}>
      <div className="space-y-1">
        {stages.map(([name, ms]) => (
          <div key={name} className="flex items-center gap-2 text-10 font-mono">
            <span className="w-32 text-ink-2 truncate">{name}</span>
            <div className="flex-1 h-2 bg-bg-2 rounded overflow-hidden">
              <div className="h-2 bg-brand" style={{ width: `${(ms / max) * 100}%` }} />
            </div>
            <span className="w-14 text-right text-ink-1">{ms} ms</span>
          </div>
        ))}
      </div>
    </ResultSection>
  );
}

function CounterfactualPanel({
  data,
}: {
  data: NonNullable<ReasonResponse["counterfactuals"]>;
}) {
  return (
    <ResultSection title={`Counterfactual sensitivity · ${data.nudges.length} nudge${data.nudges.length === 1 ? "" : "s"}`}>
      <div className="space-y-2">
        <div className="text-10 font-mono text-ink-3">
          Re-runs the full reasoning pipeline against perturbed inputs and reports the delta.
          Disposition flips that survive all three nudges are robust; flips that snap on a single
          perturbation are sensitive to the exact narrative supplied.
        </div>
        <table className="w-full text-11 border-collapse">
          <thead>
            <tr className="border-b border-hair-2 text-10 uppercase tracking-wide-3 text-ink-3">
              <th className="text-left py-1.5 font-mono">Nudge</th>
              <th className="text-right py-1.5 font-mono">Score</th>
              <th className="text-right py-1.5 font-mono">Δ Score</th>
              <th className="text-left py-1.5 font-mono pl-3">Δ Disposition</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-hair">
              <td className="py-1.5 text-ink-2 italic">Baseline</td>
              <td className="py-1.5 text-right font-mono text-ink-0">{data.baseline.composite.score}</td>
              <td className="py-1.5 text-right font-mono text-ink-3">—</td>
              <td className="py-1.5 pl-3 text-ink-2">{data.baseline.disposition.label}</td>
            </tr>
            {data.nudges.map((n, i) => {
              const tone = n.deltaScore > 0 ? "text-red" : n.deltaScore < 0 ? "text-green" : "text-ink-3";
              return (
                <tr key={i} className={i < data.nudges.length - 1 ? "border-b border-hair" : ""}>
                  <td className="py-1.5 text-ink-0">
                    <div className="font-medium">{n.label}</div>
                    <div className="text-10 text-ink-3 italic">{n.hypothesis}</div>
                  </td>
                  <td className="py-1.5 text-right font-mono text-ink-1">{n.result.composite.score}</td>
                  <td className={`py-1.5 text-right font-mono ${tone}`}>
                    {n.deltaScore > 0 ? "+" : ""}{n.deltaScore}
                  </td>
                  <td className="py-1.5 pl-3 text-ink-1">
                    {n.deltaDisposition ?? <span className="text-ink-3">unchanged</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ResultSection>
  );
}

function SteelmanPanel({
  items,
}: {
  items: NonNullable<ReasonResponse["steelman"]>;
}) {
  return (
    <ResultSection title={`Adversarial steelman · ${items.length} counter-argument${items.length === 1 ? "" : "s"}`}>
      <div className="space-y-2">
        <div className="text-10 font-mono text-ink-3">
          The strongest case against each finding. Cite the named meta-cognition primitive
          and run the evidence test before accepting the original verdict.
        </div>
        <ul className="space-y-2 list-none pl-0">
          {items.map((s, i) => (
            <li key={i} className="border-l-2 border-violet pl-3 text-11">
              <div className="font-semibold text-ink-0">{s.finding}</div>
              <div className="text-ink-1 mt-0.5">{s.counterArgument}</div>
              <div className="text-10 mt-1 flex flex-wrap gap-2 items-baseline">
                <span className="font-mono px-1.5 py-px rounded bg-violet-dim text-violet">{s.citation}</span>
                <span className="text-ink-3 italic">Test: {s.evidenceTest}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ResultSection>
  );
}

function ModeCoveragePanel({
  data,
}: {
  data: NonNullable<ReasonResponse["modeCoverage"]>;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const pct = data.totalCatalogued > 0
    ? Math.round((data.totalFired / data.totalCatalogued) * 100)
    : 0;
  return (
    <ResultSection
      title={`Mode coverage · ${data.totalFired} of ${data.totalCatalogued} reasoning modes engaged (${pct}%)`}
    >
      <div className="space-y-1.5">
        <div className="h-2 bg-bg-2 rounded overflow-hidden">
          <div className="h-2 bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-10 font-mono text-ink-3 mb-1">
          Modes are grouped by primary faculty. Click to expand.
        </div>
        {data.byFaculty.map((f) => {
          const isOpen = open[f.faculty] ?? false;
          return (
            <div key={f.faculty} className="border border-hair-2 rounded">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [f.faculty]: !isOpen }))}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-11 text-left hover:bg-bg-1"
              >
                <span className="font-mono uppercase tracking-wide-3 text-ink-1">{f.faculty}</span>
                <span className="font-mono text-10 text-ink-3">
                  {f.modes.length} mode{f.modes.length === 1 ? "" : "s"} {isOpen ? "▴" : "▾"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-hair-2 px-2.5 py-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                  {f.modes.map((m) => (
                    <div key={m.id} className="text-10 text-ink-1">
                      <span className="font-mono text-ink-3">{m.id}</span>
                      <span className="mx-1 text-ink-3">·</span>
                      <span>{m.name}</span>
                      <span className="ml-1 text-9 font-mono px-1 rounded bg-bg-2 text-ink-3">{m.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ResultSection>
  );
}

function NarrativePanel({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };
  const sections = parseStructuredNarrative(text);
  return (
    <ResultSection title="STR/SAR draft narrative">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-10 font-mono text-ink-3">
            Pure facts, no legal conclusions. Charter P1-P10 applies. Copy into goAML verbatim.
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="text-10 font-mono px-2 py-1 rounded bg-brand-dim text-brand border border-brand/40 hover:bg-brand/20 transition-colors"
          >
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>
        </div>
        <div className="bg-bg-2 border border-hair-2 rounded max-h-96 overflow-auto divide-y divide-hair-2">
          {sections.length === 0 ? (
            <pre className="text-10 leading-relaxed font-mono whitespace-pre-wrap text-ink-0 p-3">{text}</pre>
          ) : (
            sections.map((s, i) => (
              <section key={i} className="p-3">
                {s.heading && (
                  <div className="text-9 uppercase tracking-wide-3 text-brand font-semibold font-mono mb-1.5">
                    {s.heading}
                  </div>
                )}
                <pre className="text-10 leading-relaxed font-mono whitespace-pre-wrap text-ink-0 m-0">{s.body}</pre>
              </section>
            ))
          )}
        </div>
      </div>
    </ResultSection>
  );
}

/** Split a structured narrative into sections by detecting heading lines.
 *  A heading is either an ALL-CAPS line, a "==" / "--" underline, or a
 *  numbered prefix like "1. " on a short standalone line. The first section
 *  may have no heading. */
function parseStructuredNarrative(text: string): Array<{ heading: string | null; body: string }> {
  const lines = text.split(/\r?\n/);
  const out: Array<{ heading: string | null; body: string }> = [];
  let current: { heading: string | null; body: string } = { heading: null, body: "" };
  const isHeading = (line: string): boolean => {
    const t = line.trim();
    if (!t || t.length > 80) return false;
    if (/^[=\-_]{3,}$/.test(t)) return false;
    if (/^[A-Z0-9 ()/.,&·\-—:]{3,}$/.test(t) && t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
    if (/^(\d+\.|##+|—)\s+[A-Z]/.test(t) && t.length <= 80) return true;
    return false;
  };
  for (const line of lines) {
    if (isHeading(line)) {
      if (current.body.trim() || current.heading) out.push({ ...current, body: current.body.replace(/\n+$/, "") });
      current = { heading: line.trim().replace(/^[#—]+\s*/, ""), body: "" };
    } else {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current.body.trim() || current.heading) out.push({ ...current, body: current.body.replace(/\n+$/, "") });
  return out;
}
