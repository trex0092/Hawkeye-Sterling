"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { PepProfileResult } from "@/app/api/pep-profile/route";

// Module 36 — PEP Profile Builder
// Comprehensive Politically Exposed Person risk assessment per FATF R.12/R.13,
// UAE FDL 10/2025 Art.14, and CBUAE AML Standards.

const TIER_CONFIG = {
  tier1: { label: "Tier 1 PEP", color: "text-red", bg: "bg-red/10 border-red/30", dot: "bg-red" },
  tier2: { label: "Tier 2 PEP", color: "text-amber", bg: "bg-amber/10 border-amber/30", dot: "bg-amber" },
  tier3: { label: "Tier 3 PEP", color: "text-blue", bg: "bg-blue/10 border-blue/30", dot: "bg-blue" },
  rca: { label: "RCA", color: "text-ink-2", bg: "bg-bg-2 border-hair-2", dot: "bg-ink-3" },
} as const;

const RECOMMENDATION_CONFIG = {
  accept_standard: { label: "Accept — Standard CDD", color: "text-green", bg: "bg-green/10 border-green/30" },
  accept_enhanced: { label: "Accept — Enhanced DD", color: "text-amber", bg: "bg-amber/10 border-amber/30" },
  senior_approval: { label: "Senior Approval Required", color: "text-orange", bg: "bg-orange/10 border-orange/30" },
  decline: { label: "Decline", color: "text-red", bg: "bg-red/10 border-red/30" },
} as const;

const REVIEW_FREQ_LABEL: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

const RISK_LEVEL_COLOR: Record<string, string> = {
  high: "text-red",
  medium: "text-amber",
  low: "text-green",
  critical: "text-red",
};

const iCls =
  "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

export default function PepProfilePage() {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [position, setPosition] = useState("");
  const [organization, setOrganization] = useState("");
  const [politicalParty, setPoliticalParty] = useState("");
  const [yearsInOffice, setYearsInOffice] = useState("");
  const [familyMembers, setFamilyMembers] = useState("");
  const [sourceOfWealth, setSourceOfWealth] = useState("");
  const [declaredAssets, setDeclaredAssets] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PepProfileResult | null>(null);

  // Static KPI counters (would be dynamic in production)
  const [profileCount] = useState(247);
  const [tier1Count] = useState(38);
  const [enhancedCount] = useState(91);
  const [seniorApprovalCount] = useState(14);

  const buildProfile = async () => {
    if (!name.trim()) {
      setError("Subject name is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/pep-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          country,
          position,
          organization,
          politicalParty,
          yearsInOffice,
          familyMembers,
          sourceOfWealth,
          declaredAssets,
        }),
      });
      const data = (await res.json()) as PepProfileResult;
      setResult(data);
    } catch {
      setError("Request failed — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const tierCfg = result ? TIER_CONFIG[result.pepTier] : null;
  const recCfg = result ? RECOMMENDATION_CONFIG[result.recommendation] : null;

  return (
    <ModuleLayout asanaModule="pep-profile" asanaLabel="PEP Profile Builder" engineLabel="PEP risk engine">
      <ModuleHero
        moduleNumber={36}
        eyebrow="Module 36 · Enhanced Due Diligence"
        title="PEP"
        titleEm="profiles."
        intro={
          <>
            <strong>FATF R.12 · UAE FDL 10/2025 Art.14 · CBUAE AML Standards §5.</strong>{" "}
            Comprehensive Politically Exposed Person risk profiling — tier classification, source of wealth
            assessment, political network mapping, and required EDD measures.
          </>
        }
        kpis={[
          { value: String(profileCount), label: "profiles built" },
          { value: String(tier1Count), label: "tier-1 PEPs", tone: "red" },
          { value: String(enhancedCount), label: "enhanced monitoring", tone: "amber" },
          { value: String(seniorApprovalCount), label: "senior approvals required", tone: "amber" },
        ]}
      />

      {/* Input form */}
      <div className="bg-bg-panel border border-hair-2 rounded-xl p-6 mb-6">
        <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-4">
          Subject Information
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
              Full Name <span className="text-red">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mohammad Al-Rashid"
              className={iCls}
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Country</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United Arab Emirates"
              className={iCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Position / Title</label>
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Minister of Finance"
              className={iCls}
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Organization</label>
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g. Ministry of Finance"
              className={iCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Political Party</label>
            <input
              value={politicalParty}
              onChange={(e) => setPoliticalParty(e.target.value)}
              placeholder="e.g. National Democratic Alliance"
              className={iCls}
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Years in Office</label>
            <input
              value={yearsInOffice}
              onChange={(e) => setYearsInOffice(e.target.value)}
              placeholder="e.g. 8"
              className={iCls}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
            Family Members &amp; Close Associates
          </label>
          <textarea
            value={familyMembers}
            onChange={(e) => setFamilyMembers(e.target.value)}
            rows={3}
            placeholder={"Spouse: Helena Marchetti — director of Meridian Holdings\nSon: Dmitri Marchetti — lawyer\nBusiness partner: Yusuf Al-Farouk — CEO, Gulf Trade Partners"}
            className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Source of Wealth</label>
            <textarea
              value={sourceOfWealth}
              onChange={(e) => setSourceOfWealth(e.target.value)}
              rows={3}
              placeholder={"Government salary, real estate rental income, private consultancy fees"}
              className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none"
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Declared Assets</label>
            <textarea
              value={declaredAssets}
              onChange={(e) => setDeclaredAssets(e.target.value)}
              rows={3}
              placeholder={"3 properties (Dubai, London, Zurich), equity portfolio USD 8.4M, 2 vehicles"}
              className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none"
            />
          </div>
        </div>

        {error && <p className="text-11 text-red mb-3">{error}</p>}

        <button
          type="button"
          onClick={() => void buildProfile()}
          disabled={loading}
          className="text-13 font-semibold px-5 py-2.5 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors"
        >
          {loading ? "◌ Building Profile…" : "🔍 Build PEP Profile"}
        </button>
      </div>

      {/* Results */}
      {result && tierCfg && recCfg && (
        <div className="flex flex-col gap-5">
          {/* Tier badge + risk score + recommendation */}
          <div className="grid grid-cols-3 gap-4">
            {/* PEP Tier */}
            <div className={`bg-bg-panel border rounded-xl p-5 flex flex-col gap-2 ${tierCfg.bg}`}>
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">PEP Tier</div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tierCfg.dot}`} />
                <span className={`font-mono text-18 font-bold ${tierCfg.color}`}>{tierCfg.label}</span>
              </div>
              <div className="text-11 text-ink-2 leading-snug">
                {result.politicalExposure.current ? "Currently in office" : "Former position"}
              </div>
            </div>

            {/* Risk Score */}
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 flex flex-col gap-2">
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Risk Score</div>
              <div
                className={`font-mono text-48 font-bold leading-none ${
                  result.riskScore >= 75
                    ? "text-red"
                    : result.riskScore >= 50
                      ? "text-amber"
                      : "text-green"
                }`}
              >
                {result.riskScore}
              </div>
              <div className="w-full h-1.5 bg-bg-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    result.riskScore >= 75 ? "bg-red" : result.riskScore >= 50 ? "bg-amber" : "bg-green"
                  }`}
                  style={{ width: `${result.riskScore}%` }}
                />
              </div>
              <div className="text-10 text-ink-3 font-mono">/ 100</div>
            </div>

            {/* Recommendation */}
            <div className={`bg-bg-panel border rounded-xl p-5 flex flex-col gap-2 ${recCfg.bg}`}>
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Recommendation</div>
              <div className={`font-semibold text-14 leading-snug ${recCfg.color}`}>{recCfg.label}</div>
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mt-1">Review Frequency</div>
              <div className="text-12 font-mono text-ink-0 font-semibold">
                {REVIEW_FREQ_LABEL[result.reviewFrequency] ?? result.reviewFrequency}
              </div>
            </div>
          </div>

          {/* Political exposure */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
              Political Exposure
            </div>
            <div className="text-12 text-ink-1 mb-2">
              <span className="font-semibold text-ink-0">Power level: </span>
              {result.politicalExposure.powerLevel}
            </div>
            <ul className="list-none p-0 m-0 flex flex-col gap-1">
              {result.politicalExposure.positions.map((pos, i) => (
                <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                  <span className="text-brand mt-0.5 shrink-0">▸</span>
                  {pos}
                </li>
              ))}
            </ul>
          </div>

          {/* Political network map */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
              Political Network Map
            </div>
            <div className="grid grid-cols-2 gap-3">
              {result.networkMap.map((node, i) => (
                <div key={i} className="bg-bg-1 border border-hair rounded-lg p-3 flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-bg-2 border border-hair-2 flex items-center justify-center text-14">
                    👤
                  </div>
                  <div className="min-w-0">
                    <div className="text-12 font-semibold text-ink-0 truncate">{node.name}</div>
                    <div className="text-11 text-ink-3">{node.relationship}</div>
                    <div
                      className={`text-10 font-mono font-semibold uppercase mt-0.5 ${
                        RISK_LEVEL_COLOR[node.riskLevel.toLowerCase()] ?? "text-ink-2"
                      }`}
                    >
                      {node.riskLevel} risk
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Source of wealth assessment */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
              Source of Wealth Assessment
            </div>
            <div className="text-12 text-ink-1 mb-4 leading-relaxed border-l-2 border-brand pl-3">
              {result.sourceOfWealthAssessment.plausibility}
            </div>

            {result.sourceOfWealthAssessment.gaps.length > 0 && (
              <div className="mb-4">
                <div className="text-10 uppercase tracking-wide-3 text-amber font-semibold mb-2">
                  Documentation Gaps
                </div>
                <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                  {result.sourceOfWealthAssessment.gaps.map((gap, i) => (
                    <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                      <span className="text-amber shrink-0 mt-0.5">⚠</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.sourceOfWealthAssessment.redFlags.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide-3 text-red font-semibold mb-2">Red Flags</div>
                <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                  {result.sourceOfWealthAssessment.redFlags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                      <span className="text-red shrink-0 mt-0.5">✕</span>
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Asset disclosure risk + adverse media + sanctions */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-2">
                Asset Disclosure Risk
              </div>
              <div className="text-12 text-ink-1 leading-snug">{result.assetDisclosureRisk}</div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-2">Adverse Media</div>
              <div className="text-12 text-ink-1 leading-snug">{result.adverseMediaSummary}</div>
            </div>
            <div
              className={`bg-bg-panel border rounded-xl p-4 ${
                result.sanctionsExposure.listed ? "border-red/30" : "border-hair-2"
              }`}
            >
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-2">
                Sanctions Exposure
              </div>
              <div
                className={`text-12 font-semibold mb-2 ${
                  result.sanctionsExposure.listed ? "text-red" : "text-green"
                }`}
              >
                {result.sanctionsExposure.listed ? "⚠ LISTED" : "✓ Not Listed"}
              </div>
              <ul className="list-none p-0 m-0 flex flex-col gap-1">
                {result.sanctionsExposure.details.map((d, i) => (
                  <li key={i} className="text-11 text-ink-2 leading-snug">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Required measures checklist */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
              Required AML Measures
            </div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {result.requiredMeasures.map((measure, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-4 h-4 rounded border border-hair-2 bg-bg-1 flex items-center justify-center mt-0.5">
                    <span className="text-brand text-10 leading-none">✓</span>
                  </span>
                  <span className="text-12 text-ink-1 leading-snug">{measure}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <div className="bg-bg-panel border border-brand/20 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-2">
              Assessment Summary
            </div>
            <p className="text-13 text-ink-1 leading-relaxed m-0">{result.summary}</p>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
