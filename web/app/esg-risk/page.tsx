"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { EsgRiskResult, EsgRating, MlRiskLevel } from "@/app/api/esg-risk/route";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FormData {
  entity: string;
  sector: string;
  jurisdiction: string;
  operations: string;
  supplierCountries: string;
  employeeCount: string;
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style maps
// ─────────────────────────────────────────────────────────────────────────────

const ESG_RATING_STYLES: Record<EsgRating, { bg: string; text: string; label: string }> = {
  AAA: { bg: "bg-green/10 border-green/30", text: "text-green", label: "Excellent" },
  AA: { bg: "bg-green/8 border-green/20", text: "text-green", label: "Very Good" },
  A: { bg: "bg-blue/10 border-blue/30", text: "text-blue", label: "Good" },
  BBB: { bg: "bg-blue/8 border-blue/20", text: "text-blue", label: "Adequate" },
  BB: { bg: "bg-amber/10 border-amber/30", text: "text-amber", label: "Moderate Risk" },
  B: { bg: "bg-orange/10 border-orange/30", text: "text-orange", label: "High Risk" },
  CCC: { bg: "bg-red/10 border-red/30", text: "text-red", label: "Critical Risk" },
};

const ML_RISK_STYLES: Record<MlRiskLevel, { badge: string; dot: string }> = {
  low: { badge: "bg-green/10 text-green border-green/20", dot: "bg-green" },
  medium: { badge: "bg-amber/10 text-amber border-amber/20", dot: "bg-amber" },
  high: { badge: "bg-red/10 text-red border-red/20", dot: "bg-red" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green";
  if (score >= 50) return "bg-blue";
  if (score >= 35) return "bg-amber";
  return "bg-red";
}

function scoreTextColor(score: number): string {
  if (score >= 70) return "text-green";
  if (score >= 50) return "text-blue";
  if (score >= 35) return "text-amber";
  return "text-red";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-bg-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`font-mono text-12 w-8 text-right font-semibold ${scoreTextColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

function DimensionCard({
  icon,
  label,
  score,
  risks,
  opportunities,
}: {
  icon: string;
  label: string;
  score: number;
  risks: string[];
  opportunities: string[];
}) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-18">{icon}</span>
          <span className="text-13 font-semibold text-ink-0">{label}</span>
        </div>
        <span className={`text-20 font-display font-semibold ${scoreTextColor(score)}`}>
          {score}
        </span>
      </div>
      <ScoreBar score={score} />

      {risks.length > 0 && (
        <div className="mt-4">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-red mb-2">Risks</div>
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red font-mono text-12 mt-0.5 shrink-0">!</span>
                <span className="text-12 text-ink-1 leading-snug">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="mt-3">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-green mb-2">
            Opportunities
          </div>
          <ul className="space-y-1.5">
            {opportunities.map((o, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green font-mono text-12 mt-0.5 shrink-0">+</span>
                <span className="text-12 text-ink-1 leading-snug">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AccordionItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-hair-2 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-1 text-12.5 font-medium text-ink-0 hover:bg-bg-2 transition-colors text-left"
      >
        {title}
        <span className="text-10 text-ink-3">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 py-3 bg-bg-panel">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormData = {
  entity: "",
  sector: "",
  jurisdiction: "",
  operations: "",
  supplierCountries: "",
  employeeCount: "",
  notes: "",
};

const SECTOR_OPTIONS = [
  "Precious Metals & Stones",
  "Financial Services",
  "Real Estate",
  "Mining & Extractives",
  "Manufacturing",
  "Trading & Distribution",
  "Technology",
  "Energy",
  "Agriculture",
  "Construction",
  "Other",
];

const JURISDICTION_OPTIONS = [
  "UAE",
  "United Kingdom",
  "United States",
  "Switzerland",
  "Singapore",
  "Hong Kong",
  "Cayman Islands",
  "BVI",
  "Luxembourg",
  "Germany",
  "France",
  "Netherlands",
  "Other",
];

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

const KPIS = [
  { value: "12", label: "Entities Rated" },
  { value: "3", label: "Critical ESG Alerts", tone: "red" as const },
  { value: "28", label: "Regulatory Exposures", tone: "amber" as const },
  { value: "5", label: "ML-Linked ESG Risks" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EsgRiskPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EsgRiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof FormData>(key: K, val: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  const generate = async () => {
    if (!form.entity.trim()) {
      setError("Please enter an entity name.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/esg-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: form.entity.trim(),
          sector: form.sector,
          jurisdiction: form.jurisdiction,
          operations: form.operations,
          supplierCountries: form.supplierCountries
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          employeeCount: form.employeeCount ? parseInt(form.employeeCount, 10) : undefined,
          notes: form.notes || undefined,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      // Read the body once as text — Netlify 502s return HTML, not JSON. We
      // surface a clean error in that case rather than letting the user see
      // a raw "Unexpected token '<'" SyntaxError.
      const raw = await res.text().catch(() => "");
      const isHtml = raw.trimStart().toLowerCase().startsWith("<");
      if (!res.ok || isHtml) {
        const detail = isHtml
          ? `Server returned HTML (HTTP ${res.status}) — likely a Netlify 502 / function timeout. Please retry; if it persists, set ANTHROPIC_API_KEY in the deployment.`
          : raw.slice(0, 240) || `HTTP ${res.status}`;
        setError(`ESG scorer unavailable: ${detail}`);
        return;
      }
      let data: EsgRiskResult;
      try { data = JSON.parse(raw) as EsgRiskResult; }
      catch { setError("ESG scorer returned a malformed response. Please retry."); return; }
      setResult(data);
    } catch (e) {
      const isTimeout = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
      setError(isTimeout
        ? "ESG scorer timed out after 60s — please retry."
        : `Request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const ratingStyle = result ? ESG_RATING_STYLES[result.esgRating] : null;
  const mlStyle = result ? ML_RISK_STYLES[result.mlRiskOverlay.overallMlRisk] : null;

  return (
    <ModuleLayout engineLabel="ESG risk engine">
      <ModuleHero
        moduleNumber={41}
        eyebrow="Hawkeye Sterling · Sustainability & Governance"
        title="ESG"
        titleEm="risk."
        kpis={KPIS}
        intro="AI-powered ESG scoring with money laundering risk overlay — maps environmental, social, and governance failures to financial crime exposure under FATF, UAE FDL, and international ESG frameworks."
      />

      {/* Quick-action buttons */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => {
            setField("entity", "Meridian Resources Ltd");
            setField("sector", "mining");
            setField("jurisdiction", "GH");
            setField("employeeCount", "850");
            setField("operations", "Gold mining and refining operations across West Africa, with downstream LBMA-accredited refinery in Dubai. Tier-1 suppliers include artisanal mining cooperatives in DRC and Ghana.");
            setField("supplierCountries", "Ghana, DRC, Mali, Burkina Faso");
            setField("notes", "Recent CAHRA exposure flagged in 2024 conflict-minerals audit; remediation plan in progress.");
          }}
          className="px-5 py-2 rounded-lg border-2 border-brand bg-brand/10 text-brand text-13 font-bold hover:bg-brand/20 whitespace-nowrap shadow-[0_0_12px_rgba(236,72,153,0.15)] hover:shadow-[0_0_18px_rgba(236,72,153,0.30)] transition-all"
          title="Pre-fill with a sample entity profile"
        >
          + Add
        </button>
        <button
          type="button"
          onClick={async () => {
            // AI-suggest: ask Claude to generate a representative
            // high-risk entity profile so the operator can demo the
            // ESG scoring pipeline without typing.
            setError(null);
            try {
              const res = await fetch("/api/mlro-advisor-quick", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  question: "Suggest a representative high-risk ESG entity profile to assess. Return ONLY a JSON object with fields: entityName, sector, jurisdiction (ISO-2), employeeCount (number), operations (string, 2 sentences), supplierCountries (comma-separated string), notes (string).",
                  redTeamMode: false,
                }),
              });
              if (!res.ok) {
                const b = await res.json().catch(() => ({})) as { error?: string };
                throw new Error(b.error ?? `AI suggest failed (HTTP ${res.status}) — please retry`);
              }
              const data = (await res.json()) as { answer?: string; message?: string };
              const text = data.answer ?? data.message ?? "";
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (!jsonMatch) return;
              const parsed = JSON.parse(jsonMatch[0]) as Record<string, string | number>;
              if (parsed.entity) setField("entity", String(parsed.entity));
              if (parsed.sector) setField("sector", String(parsed.sector).toLowerCase());
              if (parsed.jurisdiction) setField("jurisdiction", String(parsed.jurisdiction).toUpperCase());
              if (parsed.employeeCount) setField("employeeCount", String(parsed.employeeCount));
              if (parsed.operations) setField("operations", String(parsed.operations));
              if (parsed.supplierCountries) setField("supplierCountries", String(parsed.supplierCountries));
              if (parsed.notes) setField("notes", String(parsed.notes));
            } catch (err) {
              setError(err instanceof Error ? err.message : "AI suggest failed — please retry");
            }
          }}
          className="px-5 py-2 rounded-lg border-2 border-amber-400 bg-amber-400/10 text-amber-300 text-13 font-bold hover:bg-amber-400/20 whitespace-nowrap shadow-[0_0_12px_rgba(251,191,36,0.15)] hover:shadow-[0_0_18px_rgba(251,191,36,0.30)] transition-all"
          title="AI-suggest a representative entity profile"
        >
          ✨ AI
        </button>
      </div>

      {/* Input Form */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 mb-6">
        <h2 className="text-14 font-semibold text-ink-0 mb-4">Entity Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Entity Name *
            </label>
            <input
              placeholder="e.g. Meridian Resources Ltd"
              value={form.entity}
              onChange={(e) => setField("entity", e.target.value)}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Sector
            </label>
            <select
              value={form.sector}
              onChange={(e) => setField("sector", e.target.value)}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            >
              <option value="">Select sector...</option>
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Primary Jurisdiction
            </label>
            <select
              value={form.jurisdiction}
              onChange={(e) => setField("jurisdiction", e.target.value)}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            >
              <option value="">Select jurisdiction...</option>
              {JURISDICTION_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Employee Count
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 250"
              value={form.employeeCount}
              onChange={(e) => setField("employeeCount", e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
            Operations Description
          </label>
          <textarea
            rows={3}
            placeholder="Describe the entity's operations, products, services, and supply chain..."
            value={form.operations}
            onChange={(e) => setField("operations", e.target.value)}
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand resize-none"
          />
        </div>

        <div className="mb-4">
          <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
            Supplier Countries (comma-separated)
          </label>
          <input
            placeholder="e.g. Ghana, DRC, Kazakhstan, India"
            value={form.supplierCountries}
            onChange={(e) => setField("supplierCountries", e.target.value)}
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
          />
        </div>

        <div className="mb-5">
          <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
            Notes
          </label>
          <textarea
            rows={2}
            placeholder="Any additional notes or context..."
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand resize-none"
          />
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red/10 border border-red/20 rounded text-12 text-red">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-brand text-white text-13 font-semibold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Generating ESG Score with Claude..." : "📊 Generate ESG Score"}
        </button>
      </div>

      {/* Results */}
      {result && ratingStyle && mlStyle && (
        <div className="space-y-5">
          {/* Rating Hero */}
          <div className={`rounded-xl border-2 p-6 ${ratingStyle.bg}`}>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-72 font-display font-bold leading-none ${ratingStyle.text}`}>
                  {result.esgRating}
                </div>
                <div className={`text-12 font-semibold mt-1 ${ratingStyle.text}`}>
                  {ESG_RATING_STYLES[result.esgRating].label}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-13 font-medium text-ink-0">Overall ESG Score</span>
                  <span className={`text-24 font-display font-semibold ${scoreTextColor(result.overallEsgScore)}`}>
                    {result.overallEsgScore}
                    <span className="text-13 text-ink-3 font-mono">/100</span>
                  </span>
                </div>
                <ScoreBar score={result.overallEsgScore} />
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-11 text-ink-3">ML Risk Overlay:</span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-semibold border ${mlStyle.badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${mlStyle.dot}`} />
                    {result.mlRiskOverlay.overallMlRisk.toUpperCase()} ML RISK
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* E / S / G Dimension Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DimensionCard
              icon="🌍"
              label="Environmental"
              score={result.dimensions.environmental.score}
              risks={result.dimensions.environmental.risks}
              opportunities={result.dimensions.environmental.opportunities}
            />
            <DimensionCard
              icon="👥"
              label="Social"
              score={result.dimensions.social.score}
              risks={result.dimensions.social.risks}
              opportunities={result.dimensions.social.opportunities}
            />
            <DimensionCard
              icon="⚖️"
              label="Governance"
              score={result.dimensions.governance.score}
              risks={result.dimensions.governance.risks}
              opportunities={result.dimensions.governance.opportunities}
            />
          </div>

          {/* ML Risk Overlay */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-16">🔗</span>
              <h3 className="text-13 font-semibold text-ink-0">ML Risk Overlay</h3>
              <span className="text-11 text-ink-3">
                How ESG failures translate into money laundering risk
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-11 font-mono uppercase tracking-wide-3 text-green mb-1">
                  Environmental Crime Linkage
                </div>
                <p className="text-12.5 text-ink-1 leading-relaxed">
                  {result.mlRiskOverlay.environmentalCrimeLinkage}
                </p>
              </div>
              <div className="border-t border-hair pt-4">
                <div className="text-11 font-mono uppercase tracking-wide-3 text-orange mb-1">
                  Labour Exploitation Risk
                </div>
                <p className="text-12.5 text-ink-1 leading-relaxed">
                  {result.mlRiskOverlay.laborExploitationRisk}
                </p>
              </div>
              <div className="border-t border-hair pt-4">
                <div className="text-11 font-mono uppercase tracking-wide-3 text-amber mb-1">
                  Corruption Risk
                </div>
                <p className="text-12.5 text-ink-1 leading-relaxed">
                  {result.mlRiskOverlay.corruptionRisk}
                </p>
              </div>
            </div>
          </div>

          {/* Red Flags */}
          {result.redFlags.length > 0 && (
            <div className="bg-red/5 border border-red/20 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-16">🚩</span>
                <h3 className="text-13 font-semibold text-red">Red Flags</h3>
              </div>
              <ul className="space-y-2">
                {result.redFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red font-mono text-12 mt-0.5 shrink-0">✕</span>
                    <span className="text-12.5 text-ink-0">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Regulatory Exposure (Accordion) */}
          {result.regulatoryExposure.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-16">📋</span>
                <h3 className="text-13 font-semibold text-ink-0">Regulatory Exposure</h3>
              </div>
              <div className="space-y-2">
                {result.regulatoryExposure.map((reg, i) => (
                  <AccordionItem key={i} title={`${reg.regulation} · ${reg.jurisdiction}`}>
                    <div className="text-12 text-ink-1">{reg.compliance}</div>
                  </AccordionItem>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div className="bg-amber/5 border border-amber/20 rounded-lg p-5">
            <div className="text-11 font-semibold text-amber mb-1">Recommendation</div>
            <p className="text-13 text-ink-0">{result.recommendation}</p>
          </div>

          {/* Summary */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="text-11 font-semibold text-ink-0 mb-1">Executive Summary</div>
            <p className="text-13 text-ink-1 leading-relaxed">{result.summary}</p>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
