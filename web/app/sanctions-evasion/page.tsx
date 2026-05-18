"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { SanctionsEvasionResult, EvasionPattern } from "@/app/api/sanctions-evasion/route";

// Module 39 — Sanctions Evasion Detector
// AI-powered evasion pattern detection using Claude with prompt caching.

const TIER_CONFIG = {
  unlikely: {
    label: "UNLIKELY",
    cls: "bg-green-dim text-green border-green/30",
    badge: "bg-green text-white",
    description: "No significant sanctions evasion indicators detected.",
  },
  possible: {
    label: "POSSIBLE",
    cls: "bg-amber-dim text-amber border-amber/30",
    badge: "bg-amber text-white",
    description: "Some evasion indicators present — enhanced monitoring recommended.",
  },
  probable: {
    label: "PROBABLE",
    cls: "bg-orange-dim text-orange border-orange/30",
    badge: "bg-orange text-white",
    description: "Multiple evasion patterns detected — immediate investigation required.",
  },
  confirmed: {
    label: "CONFIRMED",
    cls: "bg-red-dim text-red border-red/30",
    badge: "bg-red text-white",
    description: "Strong evidence of active sanctions evasion — escalate immediately.",
  },
};

const RECOMMENDATION_CONFIG = {
  clear: { label: "Clear", cls: "text-green", icon: "✓" },
  flag_for_review: { label: "Flag for Review", cls: "text-amber", icon: "⚑" },
  freeze_pending_investigation: { label: "Freeze Pending Investigation", cls: "text-orange font-bold", icon: "⏸" },
  file_str: { label: "File STR / SAR", cls: "text-red font-bold", icon: "🚨" },
  report_to_regulator: { label: "Report to Regulator", cls: "text-red font-bold", icon: "📋" },
};

const PATTERN_LABELS: Record<EvasionPattern["pattern"], string> = {
  front_company: "Front Company",
  jurisdiction_layering: "Jurisdiction Layering",
  shelf_company: "Shelf Company",
  name_variation: "Name Variation",
  split_payments: "Split Payments",
  third_party_intermediary: "Third-Party Intermediary",
  vessel_flag_hopping: "Vessel Flag Hopping",
  commodity_substitution: "Commodity Substitution",
  crypto_conversion: "Crypto Conversion",
  correspondent_banking_exploitation: "Correspondent Banking Exploitation",
};

const PATTERN_ICONS: Record<EvasionPattern["pattern"], string> = {
  front_company: "🏢",
  jurisdiction_layering: "🌐",
  shelf_company: "📦",
  name_variation: "📝",
  split_payments: "💳",
  third_party_intermediary: "🔗",
  vessel_flag_hopping: "🚢",
  commodity_substitution: "📦",
  crypto_conversion: "₿",
  correspondent_banking_exploitation: "🏦",
};

function ScoreMeter({ score, tier }: { score: number; tier: keyof typeof TIER_CONFIG }) {
  const tierCfg = TIER_CONFIG[tier];
  const barColor =
    tier === "confirmed"
      ? "bg-red"
      : tier === "probable"
        ? "bg-orange"
        : tier === "possible"
          ? "bg-amber"
          : "bg-green";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`px-6 py-3 rounded-xl border-2 text-center ${tierCfg.cls}`}>
        <div className="font-display text-56 font-normal leading-none">{score}</div>
        <div className="font-mono text-10 uppercase tracking-wide-4 mt-1">Evasion Risk Score</div>
      </div>
      <div className="w-full">
        <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className={`mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-12 font-semibold ${tierCfg.cls}`}>
          <span className="w-2 h-2 rounded-full bg-current opacity-70" />
          {tierCfg.label}
        </div>
      </div>
      <p className="text-12 text-ink-2 text-center">{tierCfg.description}</p>
    </div>
  );
}

function PatternCard({ pattern }: { pattern: EvasionPattern }) {
  const icon = PATTERN_ICONS[pattern.pattern];
  const label = PATTERN_LABELS[pattern.pattern];
  const confColor =
    pattern.confidence >= 80 ? "bg-red" : pattern.confidence >= 60 ? "bg-orange" : pattern.confidence >= 40 ? "bg-amber" : "bg-green";

  return (
    <div className="rounded-lg border border-hair bg-bg-panel p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-16">{icon}</span>
          <div>
            <div className="font-semibold text-13 text-ink-0">{label}</div>
            <div className="font-mono text-10 text-ink-3">{pattern.fatfRef}</div>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="font-mono text-10 text-ink-3 mb-1">Confidence</span>
          <span className="font-mono text-16 font-semibold text-ink-0">{pattern.confidence}%</span>
        </div>
      </div>
      {/* Confidence Bar */}
      <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${confColor} transition-all duration-500`}
          style={{ width: `${pattern.confidence}%` }}
        />
      </div>
      <p className="text-12.5 text-ink-1 leading-relaxed">{pattern.evidence}</p>
    </div>
  );
}

function JurisdictionChain({ layers }: { layers: SanctionsEvasionResult["jurisdictionLayering"] }) {
  if (!layers.length) return null;

  const riskColor = (risk: string) => {
    if (risk === "High") return "border-red/40 bg-red-dim text-red";
    if (risk === "Medium") return "border-amber/40 bg-amber-dim text-amber";
    return "border-green/40 bg-green-dim text-green";
  };

  return (
    <div className="flex items-start gap-2 flex-wrap">
      {layers.map((layer, i) => (
        <div key={layer.layer} className="flex items-center gap-2">
          <div className={`rounded-lg border p-3 min-w-[120px] ${riskColor(layer.risk)}`}>
            <div className="font-mono text-10 uppercase tracking-wide mb-0.5">Layer {layer.layer}</div>
            <div className="font-semibold text-13">{layer.jurisdiction}</div>
            <div className="font-mono text-10 opacity-80 mt-0.5">{layer.risk} Risk</div>
            <div className="text-11 mt-1 opacity-90">{layer.purpose}</div>
          </div>
          {i < layers.length - 1 && (
            <span className="text-ink-3 font-mono text-18 font-bold shrink-0">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SanctionsEvasionPage() {
  const [entity, setEntity] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [counterparties, setCounterparties] = useState("");
  const [commodities, setCommodities] = useState("");
  const [ownershipStructure, setOwnershipStructure] = useState("");
  const [transactions, setTransactions] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SanctionsEvasionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const handleDetect = async () => {
    if (!entity.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sanctions-evasion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          jurisdiction,
          counterparties,
          commodities,
          ownershipStructure,
          transactions,
        }),
      });
      const json = (await res.json()) as SanctionsEvasionResult;
      if (!mountedRef.current) return;
      setResult(json);
    } catch (err) {
      console.error("[hawkeye] sanctions-evasion threw:", err);
      if (mountedRef.current) setError("Analysis failed. Please try again.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const recCfg = result ? RECOMMENDATION_CONFIG[result.recommendation] : null;

  return (
    <ModuleLayout engineLabel="Sanctions engine" asanaModule="sanctions-evasion" asanaLabel="Sanctions Evasion">
      <ModuleHero
        eyebrow="AI-Powered Sanctions Intelligence"
        title="Sanctions"
        titleEm="evasion."

        kpis={[
          { value: "4,821", label: "Entities screened" },
          { value: "147", label: "Evasion patterns detected", tone: "amber" },
          { value: "38", label: "Front companies identified", tone: "orange" },
          { value: "12", label: "Referrals made", tone: "red" },
        ]}
        intro="AI-powered sanctions evasion detection using pattern analysis across corporate structures, jurisdictional layering, name variations, payment splitting, and third-party intermediary networks. Powered by Claude with comprehensive FATF and OFAC/EU typology knowledge."
      />

      <div className="space-y-8">
        {/* Input Form */}
        <div>
          <h2 className="font-display text-20 font-normal text-ink-0 mb-4">
            Entity <em className="italic text-brand">assessment</em>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Entity Name */}
            <div className="flex flex-col">
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Entity Name <span className="text-red">*</span>
              </label>
              <textarea
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder="e.g. Russ-Intl Trading LLC"
                rows={3}
                className="flex-1 w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors resize-none"
              />
            </div>

            {/* Jurisdiction */}
            <div className="flex flex-col">
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Primary Jurisdiction
              </label>
              <textarea
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="e.g. UAE, BVI, Cayman Islands, Marshall Islands"
                rows={3}
                className="flex-1 w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors resize-none"
              />
            </div>

            {/* Counterparties */}
            <div className="flex flex-col">
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Counterparties / Network
              </label>
              <textarea
                value={counterparties}
                onChange={(e) => setCounterparties(e.target.value)}
                placeholder="List counterparties, correspondent banks, and known network connections. One per line or comma-separated."
                rows={3}
                className="flex-1 w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors resize-none"
              />
            </div>

            {/* Commodities */}
            <div className="flex flex-col">
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Commodities / Products
              </label>
              <textarea
                value={commodities}
                onChange={(e) => setCommodities(e.target.value)}
                placeholder="e.g. Gold bullion, crude oil, arms, dual-use goods"
                rows={3}
                className="flex-1 w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors resize-none"
              />
            </div>

            {/* Ownership Structure */}
            <div className="flex flex-col">
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Ownership Structure
              </label>
              <textarea
                value={ownershipStructure}
                onChange={(e) => setOwnershipStructure(e.target.value)}
                placeholder="Describe the ownership chain, directors, UBOs, and corporate layers."
                rows={3}
                className="flex-1 w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors resize-none"
              />
            </div>

            {/* Transaction Summary */}
            <div className="flex flex-col">
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Transaction Summary
              </label>
              <textarea
                value={transactions}
                onChange={(e) => setTransactions(e.target.value)}
                placeholder="Describe transaction patterns, values, frequencies, and any unusual characteristics."
                rows={3}
                className="flex-1 w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-dim border border-red/30 text-12 text-red">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleDetect()}
            disabled={loading || !entity.trim()}
            className="mt-4 w-full py-3 rounded-lg bg-brand text-white text-14 font-semibold hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full shrink-0"
                  style={{ animation: "spin 0.8s linear infinite" }}
                />
                Detecting evasion patterns…
              </>
            ) : (
              <>🔍 Detect Evasion</>
            )}
          </button>
        </div>

        {/* Results Panel */}
        {result && !loading && (
            <div className="space-y-6">
              {/* Risk Score + Tier */}
              <div className="rounded-xl border border-hair p-5 bg-bg-panel">
                <ScoreMeter score={result.evasionRiskScore} tier={result.evasionTier} />
              </div>

              {/* Recommendation */}
              {recCfg && (
                <div className="rounded-lg border border-hair p-4 bg-bg-1 flex items-start gap-3">
                  <span className="text-20 shrink-0">{recCfg.icon}</span>
                  <div>
                    <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-0.5">Recommendation</div>
                    <div className={`font-semibold text-15 ${recCfg.cls}`}>{recCfg.label}</div>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="rounded-lg border border-hair p-4 bg-bg-panel">
                <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-2">Analysis Summary</div>
                <p className="text-13 text-ink-1 leading-relaxed">{result.summary}</p>
              </div>

              {/* Detected Patterns */}
              {result.detectedPatterns.length > 0 && (
                <div>
                  <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-3">
                    Detected Evasion Patterns ({result.detectedPatterns.length})
                  </h3>
                  <div className="space-y-3">
                    {result.detectedPatterns.map((p, i) => (
                      <PatternCard key={i} pattern={p} />
                    ))}
                  </div>
                </div>
              )}

              {/* Jurisdiction Layering */}
              {result.jurisdictionLayering.length > 0 && (
                <div>
                  <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-3">
                    Jurisdiction Layering Chain
                  </h3>
                  <JurisdictionChain layers={result.jurisdictionLayering} />
                </div>
              )}

              {/* Name Variation Flags */}
              {result.nameVariationFlags.length > 0 && (
                <div>
                  <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-2">
                    Name Variation Flags
                  </h3>
                  <div className="space-y-2">
                    {result.nameVariationFlags.map((flag, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-dim/50 border border-amber/20">
                        <span className="text-amber shrink-0 mt-0.5">⚠</span>
                        <span className="text-12.5 text-ink-1">{flag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Split Payment Patterns */}
              {result.splitPaymentPatterns.length > 0 && (
                <div>
                  <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-2">
                    Split Payment Patterns
                  </h3>
                  <div className="space-y-1.5">
                    {result.splitPaymentPatterns.map((pattern, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-bg-1 border border-hair">
                        <span className="text-brand shrink-0 mt-0.5 font-mono text-10">#{i + 1}</span>
                        <span className="text-12.5 text-ink-1">{pattern}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Front Company Indicators */}
              {result.frontCompanyIndicators.length > 0 && (
                <div>
                  <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-2">
                    Front Company Indicators
                  </h3>
                  <div className="space-y-1.5">
                    {result.frontCompanyIndicators.map((ind, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-dim/50 border border-red/15">
                        <span className="text-red shrink-0 mt-0.5">▲</span>
                        <span className="text-12.5 text-ink-1">{ind}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ultimate Beneficiary */}
              {result.ultimateBeneficiary && (
                <div className="rounded-lg border border-orange/30 bg-orange-dim/30 p-4">
                  <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-1">Ultimate Beneficiary Assessment</div>
                  <p className="text-13 text-ink-0 font-medium">{result.ultimateBeneficiary}</p>
                </div>
              )}

              {/* Sanctioned Party Connection */}
              {result.sanctionedPartyConnection && (
                <div className="rounded-lg border border-red/30 bg-red-dim/40 p-4">
                  <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-1">Sanctioned Party Connection</div>
                  <p className="text-13 text-ink-0">{result.sanctionedPartyConnection}</p>
                </div>
              )}

              {/* Immediate Actions */}
              {result.immediateActions.length > 0 && (
                <div className="rounded-xl border-2 border-red/40 bg-red-dim/30 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-16">🚨</span>
                    <h3 className="font-mono text-11 uppercase tracking-wide-4 text-red font-semibold">
                      Immediate Actions Required
                    </h3>
                  </div>
                  <ol className="space-y-2">
                    {result.immediateActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-red/20 border border-red/30 flex items-center justify-center font-mono text-11 font-semibold text-red shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-13 text-ink-0 leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
    </ModuleLayout>
  );
}
