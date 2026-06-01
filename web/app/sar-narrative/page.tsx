"use client";

// SAR Narrative Generator — AI-assisted SAR/STR narrative drafting tool.
// Jurisdiction-aware: UAE (FDL 10/2025), UK (POCA 2002), US (BSA Title 31),
// AU (AML/CTF Act 2006), SG (MAS Notice 626).

import { useState, useRef } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Jurisdiction = "uae" | "uk" | "us" | "au" | "sg" | "other";
type SubjectType = "individual" | "entity";

interface SanctionsHit {
  list: string;
  matchScore: number;
}

interface FormState {
  subjectName: string;
  subjectType: SubjectType;
  nationality: string;
  riskScore: string;
  pepStatus: boolean;
  sanctionsHitList: string;
  adverseMediaSummary: string;
  transactionSummary: string;
  mlroNotes: string;
  jurisdiction: Jurisdiction;
}

interface NarrativeResult {
  ok: boolean;
  narrative: string;
  wordCount: number;
  jurisdiction: string;
  generatedAt: string;
  modelUsed: string;
  disclaimers: string[];
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  uae: "UAE — FDL 10/2025 / goAML",
  uk: "UK — POCA 2002 / NCA SAR Online",
  us: "US — BSA Title 31 / FinCEN",
  au: "AU — AML/CTF Act 2006 / AUSTRAC",
  sg: "SG — CDSA / MAS Notice 626",
  other: "Other — FATF R.20 Framework",
};

const INITIAL_FORM: FormState = {
  subjectName: "",
  subjectType: "individual",
  nationality: "",
  riskScore: "",
  pepStatus: false,
  sanctionsHitList: "",
  adverseMediaSummary: "",
  transactionSummary: "",
  mlroNotes: "",
  jurisdiction: "uae",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSanctionsHits(raw: string): SanctionsHit[] {
  // Accepts: "OFAC SDN:0.92, EU:0.85" or "OFAC SDN" (defaults to 1.0)
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [list, score] = s.split(":");
      return {
        list: (list ?? s).trim(),
        matchScore: score ? Math.min(1, Math.max(0, parseFloat(score.trim()))) : 1.0,
      };
    });
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SarNarrativePage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NarrativeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const narrativeRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    const sanctionsHits = form.sanctionsHitList.trim()
      ? parseSanctionsHits(form.sanctionsHitList)
      : undefined;

    const riskScore = form.riskScore.trim() ? parseInt(form.riskScore.trim(), 10) : undefined;

    try {
      const resp = await fetch("/api/sar-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectName: form.subjectName.trim(),
          subjectType: form.subjectType,
          nationality: form.nationality.trim() || undefined,
          riskScore: riskScore && !isNaN(riskScore) ? riskScore : undefined,
          pepStatus: form.pepStatus || undefined,
          sanctionsHits,
          adverseMediaSummary: form.adverseMediaSummary.trim() || undefined,
          transactionSummary: form.transactionSummary.trim() || undefined,
          mlroNotes: form.mlroNotes.trim() || undefined,
          jurisdiction: form.jurisdiction,
        }),
      });

      const data = (await resp.json().catch(() => ({ ok: false, error: apiErrorMessage(resp.status, "SAR narrative") }))) as NarrativeResult;

      if (!resp.ok || !data.ok) {
        setError(data.error ?? apiErrorMessage(resp.status, "SAR narrative"));
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(caughtErrorMessage(err, "Network error — please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.narrative) return;
    try {
      await navigator.clipboard.writeText(result.narrative);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the textarea text
      if (narrativeRef.current) {
        narrativeRef.current.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <ModuleLayout engineLabel="SAR Narrative Generator" asanaModule="sar-narrative" asanaLabel="AI SAR Narrative">
      <ModuleHero
        eyebrow="Compliance Filing"
        title="AI SAR"
        titleEm="Narrative Generator."
        kpis={[
          { value: "6", label: "Jurisdictions" },
          { value: "MLRO", label: "Review required" },
          { value: "AI", label: "Claude-powered" },
        ]}
        intro="Generate jurisdiction-specific SAR/STR narratives using AI. Supports UAE (FDL 10/2025), UK (POCA 2002), US (BSA Title 31), Australia, Singapore, and FATF R.20 framework. All narratives require MLRO review and approval before filing."
      />

      {/* Warning banner */}
      <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-md border border-amber/30 bg-amber-dim">
        <span className="text-amber text-16 mt-0.5 shrink-0">⚠</span>
        <div>
          <p className="text-13 font-semibold text-amber">AI-generated — MLRO must review before filing</p>
          <p className="text-12 text-ink-2 mt-0.5">
            This tool generates draft SAR narratives using AI. The MLRO is solely responsible for reviewing, verifying
            accuracy, and approving the narrative before submission to any FIU or regulatory authority.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Form ─────────────────────────────────────────────────────── */}
        <form onSubmit={(e) => { void handleGenerate(e); }} className="flex flex-col gap-4">
          <div className="border border-hair-2 rounded-md p-5 bg-bg-1 flex flex-col gap-4">
            <h2 className="text-13 font-semibold text-ink-0">Subject details</h2>

            {/* Subject Name */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">
                Subject name <span className="text-red">*</span>
              </label>
              <input
                type="text"
                required
                value={form.subjectName}
                onChange={(e) => handleChange("subjectName", e.target.value)}
                placeholder="e.g. John Doe / Acme Trading LLC"
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
              />
            </div>

            {/* Subject Type */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Subject type</label>
              <div className="flex gap-2">
                {(["individual", "entity"] as SubjectType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleChange("subjectType", t)}
                    className={`px-4 py-1.5 rounded text-11 font-mono uppercase font-semibold border transition-colors ${
                      form.subjectType === t
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-hair-2 text-ink-2 hover:border-ink-2"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Nationality */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Nationality / Country</label>
              <input
                type="text"
                value={form.nationality}
                onChange={(e) => handleChange("nationality", e.target.value)}
                placeholder="e.g. UAE, UK, US"
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
              />
            </div>

            {/* Risk Score + PEP */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Risk score (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.riskScore}
                  onChange={(e) => handleChange("riskScore", e.target.value)}
                  placeholder="e.g. 85"
                  className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
                />
              </div>
              <div className="flex flex-col justify-end pb-0.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pepStatus}
                    onChange={(e) => handleChange("pepStatus", e.target.checked)}
                    className="w-4 h-4 rounded border-hair-2 text-brand focus:ring-brand"
                  />
                  <span className="text-12 text-ink-1">PEP status</span>
                </label>
              </div>
            </div>

            {/* Sanctions hits */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">
                Sanctions hits <span className="text-ink-3 normal-case font-normal">(comma-separated: LIST:score)</span>
              </label>
              <input
                type="text"
                value={form.sanctionsHitList}
                onChange={(e) => handleChange("sanctionsHitList", e.target.value)}
                placeholder="e.g. OFAC SDN:0.92, EU Consolidated:0.85"
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="border border-hair-2 rounded-md p-5 bg-bg-1 flex flex-col gap-4">
            <h2 className="text-13 font-semibold text-ink-0">Case details</h2>

            {/* Jurisdiction */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">
                Filing jurisdiction <span className="text-red">*</span>
              </label>
              <select
                required
                value={form.jurisdiction}
                onChange={(e) => handleChange("jurisdiction", e.target.value as Jurisdiction)}
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 focus:outline-none focus:border-brand"
              >
                {(Object.keys(JURISDICTION_LABELS) as Jurisdiction[]).map((j) => (
                  <option key={j} value={j}>
                    {JURISDICTION_LABELS[j]}
                  </option>
                ))}
              </select>
            </div>

            {/* Adverse Media */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Adverse media summary</label>
              <textarea
                rows={3}
                value={form.adverseMediaSummary}
                onChange={(e) => handleChange("adverseMediaSummary", e.target.value)}
                placeholder="Summarise any adverse media findings about the subject…"
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand resize-none"
              />
            </div>

            {/* Transaction Summary */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Transaction summary</label>
              <textarea
                rows={4}
                value={form.transactionSummary}
                onChange={(e) => handleChange("transactionSummary", e.target.value)}
                placeholder="Describe the suspicious transactions: amounts, dates, counterparties, instruments, patterns…"
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand resize-none"
              />
            </div>

            {/* MLRO Notes */}
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">MLRO notes</label>
              <textarea
                rows={3}
                value={form.mlroNotes}
                onChange={(e) => handleChange("mlroNotes", e.target.value)}
                placeholder="Any additional MLRO observations, due diligence steps taken, or context…"
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded border border-red/30 bg-red-dim text-red text-12">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.subjectName.trim()}
            className="w-full py-2.5 rounded bg-brand text-white text-13 font-semibold hover:bg-brand/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating narrative…" : "Generate SAR narrative"}
          </button>
        </form>

        {/* ── Right: Result ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {result ? (
            <>
              {/* Meta bar */}
              <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 rounded-md border border-hair bg-bg-1">
                <div className="flex items-center gap-4 text-11 font-mono text-ink-2">
                  <span>
                    <span className="text-ink-0 font-semibold">{result.wordCount}</span> words
                  </span>
                  <span>
                    {JURISDICTION_LABELS[result.jurisdiction as Jurisdiction] ?? result.jurisdiction.toUpperCase()}
                  </span>
                  <span>Generated {fmtDate(result.generatedAt)}</span>
                </div>
                <button
                  onClick={() => { void handleCopy(); }}
                  className={`px-3 py-1 rounded text-11 font-mono font-semibold border transition-colors ${
                    copied
                      ? "border-green/40 bg-green-dim text-green"
                      : "border-brand/40 text-brand hover:bg-brand/10"
                  }`}
                >
                  {copied ? "Copied!" : "Copy to clipboard"}
                </button>
              </div>

              {/* Narrative */}
              <div className="relative">
                <textarea
                  ref={narrativeRef}
                  readOnly
                  value={result.narrative}
                  rows={20}
                  className="w-full bg-bg-panel border border-hair-2 rounded px-4 py-3 text-12 text-ink-1 leading-relaxed focus:outline-none resize-y font-sans"
                />
              </div>

              {/* Disclaimers */}
              <div className="border border-amber/30 rounded-md p-4 bg-amber-dim">
                <p className="text-11 font-mono uppercase tracking-wide-4 text-amber font-semibold mb-2">Disclaimers</p>
                <ul className="space-y-1">
                  {result.disclaimers.map((d, i) => (
                    <li key={i} className="text-11 text-ink-2 flex items-start gap-1.5">
                      <span className="text-amber mt-0.5 shrink-0">·</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-11 text-ink-3">
                Model: {result.modelUsed} · Hawkeye Sterling AI SAR Narrative Generator
              </p>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 border border-dashed border-hair-2 rounded-md">
              <div className="text-center">
                <div className="text-32 mb-2 opacity-20">📄</div>
                <p className="text-12 text-ink-3">
                  {loading ? "AI is drafting your narrative…" : "Complete the form and click Generate."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModuleLayout>
  );
}
