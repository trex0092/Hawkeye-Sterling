"use client";

import { useState, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { CountryRiskResult } from "@/app/api/country-risk/route";
import type { CountryCompareResult } from "@/app/api/country-risk/compare/route";

// Country Risk Intelligence Hub — Module 35
// Covers Basel AML Index, TI CPI, FATF grey/black lists, OFAC/EU/UN/UK sanctions,
// political stability, ML/TF risk typologies.

const POPULAR_COUNTRIES = [
  "UAE",
  "United Kingdom",
  "USA",
  "Russia",
  "China",
  "Iran",
  "North Korea",
  "Venezuela",
  "Afghanistan",
  "Nigeria",
];

const RISK_COLORS: Record<string, string> = {
  low: "text-green bg-green-dim border-green/20",
  medium: "text-amber bg-amber/10 border-amber/20",
  high: "text-orange bg-orange/10 border-orange/20",
  critical: "text-red bg-red/10 border-red/20",
};

const RISK_BAR_COLORS: Record<string, string> = {
  low: "bg-green",
  medium: "bg-amber",
  high: "bg-orange",
  critical: "bg-red",
};

const FATF_COLORS: Record<string, string> = {
  member: "text-green bg-green-dim border-green/20",
  grey_list: "text-amber bg-amber/10 border-amber/20",
  black_list: "text-red bg-red/10 border-red/20",
  non_member: "text-ink-2 bg-bg-2 border-hair-2",
};

const FATF_LABELS: Record<string, string> = {
  member: "FATF Member",
  grey_list: "FATF Grey List",
  black_list: "FATF Black List",
  non_member: "Non-Member",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  standard_dd: "Standard Due Diligence",
  enhanced_dd: "Enhanced Due Diligence",
  senior_approval: "Senior Management Approval",
  prohibited: "PROHIBITED",
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  standard_dd: "text-green bg-green-dim border-green/20",
  enhanced_dd: "text-amber bg-amber/10 border-amber/20",
  senior_approval: "text-orange bg-orange/10 border-orange/20",
  prohibited: "text-red bg-red/10 border-red/20",
};

function scoreToRisk(score: number): string {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function ScoreBar({ label, score, max = 100 }: { label: string; score: number; max?: number }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const risk = scoreToRisk(score);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-11 uppercase tracking-wide-3 text-ink-2 font-semibold">{label}</span>
        <span className="font-mono text-13 font-semibold text-ink-0">{score}</span>
      </div>
      <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${RISK_BAR_COLORS[risk]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SanctionChip({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-semibold border ${
        active
          ? "text-red bg-red/10 border-red/30"
          : "text-ink-3 bg-bg-1 border-hair-2"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-red" : "bg-ink-3"}`} />
      {label}
    </span>
  );
}

function RiskCard({ result }: { result: CountryRiskResult }) {
  const riskClass = RISK_COLORS[result.overallRisk] ?? RISK_COLORS.medium;
  const recClass = RECOMMENDATION_COLORS[result.recommendation] ?? RECOMMENDATION_COLORS.enhanced_dd;
  const fatfClass = FATF_COLORS[result.fatfStatus] ?? FATF_COLORS.non_member;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-32 font-normal text-ink-0 leading-tight mb-1">
            {result.country}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-11 font-semibold border ${fatfClass}`}>
              {FATF_LABELS[result.fatfStatus]}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-11 font-semibold border ${recClass}`}>
              {RECOMMENDATION_LABELS[result.recommendation]}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-mono text-56 font-bold leading-none ${riskClass.split(" ")[0]}`}>
            {result.riskScore}
          </div>
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mt-1">
            Risk Score / 100
          </div>
          <span className={`inline-block mt-1 px-3 py-1 rounded-full text-12 font-bold border uppercase tracking-wide ${riskClass}`}>
            {result.overallRisk} risk
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="border-l-2 border-brand pl-3.5 text-13 text-ink-1 leading-relaxed">
        {result.summary}
      </div>

      {/* Two-column grid: dimensions + sanctions */}
      <div className="grid grid-cols-2 gap-6">
        {/* Dimension scores */}
        <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 space-y-3">
          <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3 pb-2 border-b border-hair">
            Risk Dimensions
          </div>
          <ScoreBar label="AML Risk" score={result.dimensions.amlRisk} />
          <ScoreBar label="Basel AML Index" score={result.dimensions.baselScore} />
          <ScoreBar label="Corruption (CPI)" score={result.dimensions.cpiScore} />
          <ScoreBar label="Political Risk" score={result.dimensions.politicalRisk} />
          <ScoreBar label="Sanctions Exposure" score={result.dimensions.sanctionsRisk} />
          <ScoreBar label="TF Risk" score={result.dimensions.tfRisk} />
        </div>

        {/* Sanctions profile */}
        <div className="space-y-4">
          <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
            <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3 pb-2 border-b border-hair">
              Sanctions Profile
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <SanctionChip label="OFAC" active={result.sanctionsProfile.ofac} />
              <SanctionChip label="EU" active={result.sanctionsProfile.eu} />
              <SanctionChip label="UN" active={result.sanctionsProfile.un} />
              <SanctionChip label="UK" active={result.sanctionsProfile.uk} />
            </div>
            {result.sanctionsProfile.details.length > 0 && (
              <ul className="space-y-1">
                {result.sanctionsProfile.details.map((d, i) => (
                  <li key={i} className="text-11 text-ink-1 flex items-start gap-1.5">
                    <span className="text-ink-3 mt-0.5 shrink-0">•</span>
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Regulatory obligations */}
          <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
            <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3 pb-2 border-b border-hair">
              Regulatory Obligations
            </div>
            <ul className="space-y-2">
              {result.regulatoryObligations.map((ob, i) => (
                <li key={i} className="text-11 leading-snug">
                  <div className="text-ink-0 font-medium">{ob.obligation}</div>
                  <div className="text-ink-3 font-mono text-10">{ob.regulation}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Key risks + recent developments */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
          <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3 pb-2 border-b border-hair">
            Key Risks
          </div>
          <ul className="space-y-2">
            {result.keyRisks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                <span className="text-red mt-0.5 shrink-0 font-bold">▸</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
          <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3 pb-2 border-b border-hair">
            Recent Developments
          </div>
          <div className="space-y-3">
            {result.recentDevelopments.map((d, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="flex flex-col items-center shrink-0 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
                  {i < result.recentDevelopments.length - 1 && (
                    <span className="w-px flex-1 bg-hair-2 mt-1" style={{ minHeight: 16 }} />
                  )}
                </div>
                <p className="text-12 text-ink-1 leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareTable({ data }: { data: CountryCompareResult }) {
  const DIMS = [
    { key: "amlRisk" as const, label: "AML Risk" },
    { key: "baselScore" as const, label: "Basel Index" },
    { key: "cpiScore" as const, label: "Corruption" },
    { key: "politicalRisk" as const, label: "Political Risk" },
    { key: "sanctionsRisk" as const, label: "Sanctions" },
    { key: "tfRisk" as const, label: "TF Risk" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-12 border-collapse">
        <thead>
          <tr className="border-b border-hair-2">
            <th className="text-left py-2 pr-4 text-10 uppercase tracking-wide-4 text-ink-3 font-semibold w-36">
              Dimension
            </th>
            {data.countries.map((c) => (
              <th key={c.country} className="text-center py-2 px-3 text-11 font-semibold text-ink-0 min-w-[120px]">
                {c.country}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">
          {/* Overall risk row */}
          <tr className="bg-bg-1">
            <td className="py-2.5 pr-4 text-11 text-ink-2 font-semibold uppercase tracking-wide-3">
              Overall Risk
            </td>
            {data.countries.map((c) => (
              <td key={c.country} className="py-2.5 px-3 text-center">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-mono text-16 font-bold text-ink-0">{c.riskScore}</span>
                  <span className={`px-2 py-0.5 rounded-full text-10 font-bold border uppercase ${RISK_COLORS[c.overallRisk]}`}>
                    {c.overallRisk}
                  </span>
                </div>
              </td>
            ))}
          </tr>
          {/* Dimension rows */}
          {DIMS.map((dim) => (
            <tr key={dim.key} className="hover:bg-bg-1">
              <td className="py-2 pr-4 text-11 text-ink-2">{dim.label}</td>
              {data.countries.map((c) => {
                const val = c.dimensions[dim.key];
                const risk = scoreToRisk(val);
                return (
                  <td key={c.country} className="py-2 px-3 text-center">
                    <span className={`font-mono text-12 font-semibold ${
                      risk === "critical" ? "text-red" :
                      risk === "high" ? "text-orange" :
                      risk === "medium" ? "text-amber" : "text-green"
                    }`}>
                      {val}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
          {/* FATF row */}
          <tr className="hover:bg-bg-1">
            <td className="py-2 pr-4 text-11 text-ink-2">FATF Status</td>
            {data.countries.map((c) => (
              <td key={c.country} className="py-2 px-3 text-center">
                <span className={`px-1.5 py-0.5 rounded text-10 font-semibold border ${FATF_COLORS[c.fatfStatus]}`}>
                  {FATF_LABELS[c.fatfStatus]}
                </span>
              </td>
            ))}
          </tr>
          {/* Sanctions row */}
          <tr className="hover:bg-bg-1">
            <td className="py-2 pr-4 text-11 text-ink-2">Sanctions</td>
            {data.countries.map((c) => {
              const active = [c.sanctionsProfile.ofac && "OFAC", c.sanctionsProfile.eu && "EU", c.sanctionsProfile.un && "UN", c.sanctionsProfile.uk && "UK"].filter(Boolean);
              return (
                <td key={c.country} className="py-2 px-3 text-center">
                  {active.length > 0 ? (
                    <span className="text-11 text-red font-semibold">{active.join(", ")}</span>
                  ) : (
                    <span className="text-10 text-green">None</span>
                  )}
                </td>
              );
            })}
          </tr>
          {/* Recommendation row */}
          <tr className="bg-bg-1">
            <td className="py-2.5 pr-4 text-11 text-ink-2 font-semibold uppercase tracking-wide-3">
              Recommendation
            </td>
            {data.countries.map((c) => (
              <td key={c.country} className="py-2.5 px-3 text-center">
                <span className={`px-2 py-1 rounded text-10 font-bold border uppercase tracking-wide ${RECOMMENDATION_COLORS[c.recommendation]}`}>
                  {RECOMMENDATION_LABELS[c.recommendation]}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function CountryRiskPage() {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<"quick" | "full">("quick");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CountryRiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compare mode
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [compareList, setCompareList] = useState<string[]>([]);
  const [compareInput, setCompareInput] = useState("");
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CountryCompareResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const analyse = useCallback(async (country: string) => {
    if (!country.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/country-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: country.trim(), analysisDepth: depth }),
      });
      const data = (await res.json()) as CountryRiskResult & { ok?: boolean; error?: string };
      if (data.error) throw new Error(data.error);
      setResult(data as CountryRiskResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [depth]);

  const handleSearch = () => analyse(query);

  const handleChip = (country: string) => {
    setQuery(country);
    if (mode === "single") {
      analyse(country);
    } else {
      if (!compareList.includes(country) && compareList.length < 5) {
        setCompareList((prev) => [...prev, country]);
      }
    }
  };

  const addToCompare = () => {
    const c = compareInput.trim();
    if (!c || compareList.includes(c) || compareList.length >= 5) return;
    setCompareList((prev) => [...prev, c]);
    setCompareInput("");
  };

  const runCompare = async () => {
    if (compareList.length < 2) return;
    setComparing(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const res = await fetch("/api/country-risk/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries: compareList }),
      });
      const data = (await res.json()) as CountryCompareResult & { ok?: boolean; error?: string };
      if (data.error) throw new Error(data.error);
      setCompareResult(data as CountryCompareResult);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setComparing(false);
    }
  };

  return (
    <ModuleLayout engineLabel="Country risk engine" asanaModule="country-risk" asanaLabel="Country Risk">
      <ModuleHero
        eyebrow="AML/CFT Intelligence · Basel AML · FATF · Sanctions"
        title="Country"
        titleEm="risk."
        moduleNumber={35}
        kpis={[
          { value: "195+", label: "Countries screened" },
          { value: "23", label: "High-risk flagged", tone: "red" },
          { value: "21", label: "FATF grey-list", tone: "amber" },
          { value: "900+", label: "Sanctions designations", tone: "orange" },
        ]}
        intro={
          <>
            Assess country-level ML/TF risk using Basel AML Index, TI Corruption Perceptions Index, FATF grey/black list status,
            OFAC · EU · UN · UK sanctions, and political stability indicators. Determine the correct due diligence obligation —
            standard, enhanced, or senior approval — for any jurisdiction.
          </>
        }
      />

      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-5">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`px-4 py-1.5 rounded text-12 font-medium transition-colors border ${
            mode === "single"
              ? "bg-brand text-white border-brand"
              : "text-ink-2 border-hair-2 hover:border-hair hover:text-ink-0"
          }`}
        >
          Single Country
        </button>
        <button
          type="button"
          onClick={() => setMode("compare")}
          className={`px-4 py-1.5 rounded text-12 font-medium transition-colors border ${
            mode === "compare"
              ? "bg-brand text-white border-brand"
              : "text-ink-2 border-hair-2 hover:border-hair hover:text-ink-0"
          }`}
        >
          Compare Countries
        </button>
      </div>

      {/* Popular country chips */}
      <div className="mb-5">
        <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-2">Quick Select</div>
        <div className="flex flex-wrap gap-2">
          {POPULAR_COUNTRIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleChip(c)}
              className="px-3 py-1 rounded-full text-11 font-medium border border-hair-2 text-ink-1 hover:border-brand hover:text-brand transition-colors bg-bg-1"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── SINGLE MODE ── */}
      {mode === "single" && (
        <>
          {/* Search bar */}
          <div className="flex gap-2 mb-6">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Enter country name (e.g. Nigeria, Russia, Singapore)…"
                className="w-full bg-bg-1 border border-hair-2 rounded-lg px-4 py-2.5 text-13 text-ink-0 outline-none focus:border-brand transition-colors placeholder:text-ink-3"
              />
            </div>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value as "quick" | "full")}
              className="bg-bg-1 border border-hair-2 rounded-lg px-3 py-2.5 text-12 text-ink-1 outline-none focus:border-brand"
            >
              <option value="quick">Quick Analysis</option>
              <option value="full">Full Analysis</option>
            </select>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 rounded-lg bg-brand text-white text-13 font-semibold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? "Analysing…" : "Analyse"}
            </button>
          </div>

          {/* States */}
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-ink-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent"
                style={{ animation: "spin 0.8s linear infinite" }}
              />
              <span className="text-13">Running country risk intelligence analysis…</span>
            </div>
          )}

          {error && (
            <div className="bg-red/10 border border-red/20 rounded-lg p-4 text-13 text-red">
              {error}
            </div>
          )}

          {result && !loading && <RiskCard result={result} />}

          {!result && !loading && !error && (
            <div className="text-center py-16 text-ink-3">
              <div className="text-48 mb-3">🌍</div>
              <div className="text-14 font-medium text-ink-1 mb-1">Select a country to begin</div>
              <div className="text-12 text-ink-3">
                Enter any country name or pick a quick-select above to generate an AI-powered risk assessment.
              </div>
            </div>
          )}
        </>
      )}

      {/* ── COMPARE MODE ── */}
      {mode === "compare" && (
        <>
          {/* Country list builder */}
          <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 mb-6">
            <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3">
              Countries to Compare (up to 5)
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={compareInput}
                onChange={(e) => setCompareInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addToCompare()}
                placeholder="Type a country name and press Enter or Add…"
                className="flex-1 bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={addToCompare}
                disabled={!compareInput.trim() || compareList.length >= 5}
                className="px-4 py-2 rounded bg-bg-2 border border-hair-2 text-12 font-medium text-ink-0 hover:border-brand disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {compareList.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/10 border border-brand/20 text-11 font-medium text-brand"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => setCompareList((prev) => prev.filter((x) => x !== c))}
                    className="hover:text-red transition-colors leading-none"
                    aria-label={`Remove ${c}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {compareList.length === 0 && (
                <span className="text-12 text-ink-3 italic">
                  No countries added yet — use chips above or type a name.
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={runCompare}
                disabled={compareList.length < 2 || comparing}
                className="px-5 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {comparing ? "Comparing…" : `Compare ${compareList.length} Countries`}
              </button>
              {compareList.length < 2 && (
                <span className="text-11 text-ink-3">Add at least 2 countries to compare.</span>
              )}
            </div>
          </div>

          {comparing && (
            <div className="flex items-center justify-center py-12 gap-3 text-ink-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent"
                style={{ animation: "spin 0.8s linear infinite" }}
              />
              <span className="text-13">Generating side-by-side comparison…</span>
            </div>
          )}

          {compareError && (
            <div className="bg-red/10 border border-red/20 rounded-lg p-4 text-13 text-red">
              {compareError}
            </div>
          )}

          {compareResult && !comparing && (
            <div className="bg-bg-1 border border-hair-2 rounded-lg p-5">
              <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-4">
                Comparative Risk Assessment
              </div>
              <CompareTable data={compareResult} />
            </div>
          )}
        </>
      )}
    </ModuleLayout>
  );
}
