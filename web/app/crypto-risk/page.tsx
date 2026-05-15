"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import { analyzeCrypto, type WalletNode } from "@/lib/intelligence/cryptoExposure";
import { walletAgeScore, mixerExposure, type WalletProfile } from "@/lib/intelligence/cryptoIntel";
import { activeOnChainProvider } from "@/lib/intelligence/liveAdapters";

interface WalletRisk {
  ok: boolean;
  address: string;
  chain: string;
  provider: string;
  riskScore: number;
  riskLevel: string;
  riskCategory?: string;
  exposure: { directSanctioned: number; indirectSanctioned: number; mixing: number; darknet: number };
  taintedTransactions?: number;
  totalTransactions?: number;
  firstSeen?: string;
  lastSeen?: string;
  labels: string[];
  error?: string;
}

const RISK_TONE: Record<string, string> = {
  critical: "bg-red-dim text-red border border-red/30",
  high:     "bg-red-dim text-red border border-red/30",
  medium:   "bg-amber-dim text-amber border border-amber/30",
  low:      "bg-green-dim text-green border border-green/30",
  unknown:  "bg-bg-2 text-ink-3 border border-hair-2",
};

function ExposureBar({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div>
      <div className="flex justify-between text-11 mb-1">
        <span className="text-ink-3">{label}</span>
        <span className="font-medium text-ink-1">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-bg-1 rounded-full overflow-hidden border border-hair">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

const inputCls = "flex-1 px-3 py-2 border border-hair-2 rounded text-13 font-mono bg-bg-1 focus:outline-none focus:border-brand text-ink-0";
const btnCls = "px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity";
const cardCls = "border border-hair-2 rounded-lg p-4";

interface CryptoThreat {
  complianceVerdict: "block" | "escalate" | "enhanced_kyc" | "monitor" | "clear";
  fatfR15Exposure: string;
  varaUaeRelevance: string;
  sanctionsNexus: string;
  typologies: string[];
  narrative: string;
  requiredActions: string[];
  reportingObligation: boolean;
  reportingBasis: string;
}

export default function CryptoRiskPage() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WalletRisk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threat, setThreat] = useState<CryptoThreat | null>(null);
  const [threatLoading, setThreatLoading] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Deterministic crypto-exposure baseline ─────────────────────────────
  // Runs the local pure-function analyser against the API result to
  // surface direct/1-hop/indirect cluster exposure without an LLM call.
  const detExposure = useMemo(() => {
    if (!result) return null;
    // Convert provider's exposure-percent breakdown into cluster tags so
    // analyzeCrypto() can render the same severity buckets as our /
    // governance/intelligence-tools widget.
    const tags: WalletNode["cluster"][] = [];
    if ((result.exposure?.directSanctioned ?? 0) > 0) tags.push("ofac_sdn_wallet");
    if ((result.exposure?.mixing ?? 0) > 0) tags.push("mixer_unspecified");
    if ((result.exposure?.darknet ?? 0) > 0) tags.push("darknet_market");
    const wallet: WalletNode = {
      address: result.address,
      chain: result.chain as WalletNode["chain"],
      ...(tags[0] ? { cluster: tags[0] } : {}),
      providerRisk: result.riskScore,
      ...(tags.slice(1).length > 0
        ? { oneHopCounterparties: tags.slice(1).map((t) => ({ address: "indirect", cluster: t })) }
        : {}),
    };
    return analyzeCrypto([wallet]);
  }, [result]);

  // Wallet-age + mixer scorers from cryptoIntel.ts
  const detIntel = useMemo(() => {
    if (!result) return null;
    const profile: WalletProfile = {
      address: result.address,
      chain: result.chain,
      ...(result.firstSeen ? { firstSeenAt: result.firstSeen } : {}),
      txCount: result.totalTransactions ?? 0,
      exposureTags: [
        ...((result.exposure?.mixing ?? 0) > 0 ? ["mixer_unspecified"] : []),
        ...((result.exposure?.directSanctioned ?? 0) > 0 ? ["ofac_sdn_wallet"] : []),
        ...((result.exposure?.darknet ?? 0) > 0 ? ["darknet_market"] : []),
      ],
    };
    return {
      age: walletAgeScore(profile),
      mixer: mixerExposure(profile),
      provider: activeOnChainProvider(),
    };
  }, [result]);

  const analyzeWalletThreat = async (w: WalletRisk) => {
    setThreatLoading(true);
    setThreat(null);
    try {
      const res = await fetch("/api/crypto-threat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: w.address, chain: w.chain, riskScore: w.riskScore, riskLevel: w.riskLevel, riskCategory: w.riskCategory, exposure: w.exposure, labels: w.labels, taintedTransactions: w.taintedTransactions, totalTransactions: w.totalTransactions }),
      });
      if (!res.ok) {
        console.error(`[hawkeye] crypto-threat HTTP ${res.status}`);
        return;
      }
      const data = await res.json() as { ok: boolean } & CryptoThreat;
      if (!mountedRef.current) return;
      if (data.ok) setThreat(data);
    } catch (err) {
      console.error("[hawkeye] crypto-threat threw:", err);
    } finally { if (mountedRef.current) setThreatLoading(false); }
  };

  async function score() {
    if (!address.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/crypto-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = await res.json() as WalletRisk;
      if (!mountedRef.current) return;
      if (!data.ok) setError(data.error ?? "Scoring failed");
      else setResult(data);
    } catch (err) {
      console.error("[hawkeye] crypto-risk scoring threw:", err);
      if (mountedRef.current) setError("Request failed");
    } finally { if (mountedRef.current) setLoading(false); }
  }

  return (
    <ModuleLayout asanaModule="crypto-risk" asanaLabel="Crypto Risk" engineLabel="Crypto Risk">
      <ModuleHero

        eyebrow="Module · Crypto AML"
        title="Crypto wallet"
        titleEm="risk."
        intro="AML taint analysis for ETH, BTC, and TRX wallets. Supports Januus, Chainalysis KYT, and Elliptic Lens."
      />

      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4">
        <div>
          <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
            Crypto AML · Wallet Taint Scoring
          </div>
          <div className="text-12 text-ink-2">
            Direct sanctions exposure · indirect taint · mixer / tumbler · darknet markets
          </div>
        </div>

        <div className="flex gap-3">
          <input
            className={inputCls}
            placeholder="0x… or 1… or bc1… or T…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && score()}
          />
          <button type="button" onClick={score} disabled={loading || !address.trim()} className={btnCls}>
            {loading ? "Scoring…" : "Score Wallet"}
          </button>
        </div>

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red space-y-1">
            <p className="font-semibold">{error}</p>
            {error.includes("No crypto risk provider") && (
              <p className="text-11 text-red/80">Set JANUUS_API_KEY, CHAINALYSIS_API_KEY, or ELLIPTIC_API_KEY + ELLIPTIC_SECRET in your environment.</p>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className={cardCls}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono text-12 text-ink-0 break-all">{result.address}</p>
                  <p className="text-11 text-ink-3 mt-0.5">
                    Chain: <span className="font-semibold">{result.chain.toUpperCase()}</span>
                    {" · "}Provider: <span className="font-semibold">{result.provider}</span>
                  </p>
                  <div className="mt-2">
                    <AsanaReportButton payload={{
                      module: "crypto-risk",
                      label: `${result.chain.toUpperCase()} · ${result.address.slice(0, 12)}…`,
                      summary: `Wallet: ${result.address}; Chain: ${result.chain}; Risk: ${result.riskLevel} (${result.riskScore}); Category: ${result.riskCategory ?? "—"}; Labels: ${result.labels.join(", ") || "none"}`,
                      metadata: { address: result.address, chain: result.chain, riskLevel: result.riskLevel, riskScore: result.riskScore, directSanctioned: result.exposure?.directSanctioned },
                    }} />
                  </div>
                </div>
                <span className={`text-11 font-bold px-2.5 py-1 rounded uppercase flex-shrink-0 ml-3 ${RISK_TONE[result.riskLevel] ?? RISK_TONE.unknown}`}>
                  {result.riskLevel} · {result.riskScore}
                </span>
              </div>
              {result.riskCategory && (
                <p className="text-12 text-ink-2">
                  Category: <span className="font-medium text-ink-0">{result.riskCategory}</span>
                </p>
              )}
              {result.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {result.labels.map((l) => (
                    <span key={l} className="text-10 bg-bg-1 text-ink-2 border border-hair-2 px-2 py-0.5 rounded">{l}</span>
                  ))}
                </div>
              )}
            </div>

            <div className={cardCls}>
              <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3 mb-4">Exposure Breakdown</p>
              <div className="space-y-3">
                <ExposureBar label="Direct Sanctions Exposure" value={result.exposure.directSanctioned} colour="bg-red" />
                <ExposureBar label="Indirect Sanctions Exposure" value={result.exposure.indirectSanctioned} colour="bg-amber" />
                <ExposureBar label="Mixing / Tumbling" value={result.exposure.mixing} colour="bg-amber/60" />
                <ExposureBar label="Darknet Markets" value={result.exposure.darknet} colour="bg-brand" />
              </div>
            </div>

            {/* Deterministic baseline analysis (no LLM) */}
            {detExposure && detIntel && (
              <div className={cardCls}>
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3">
                    Deterministic baseline
                  </p>
                  <span className="text-10 font-mono text-ink-3">
                    on-chain provider: <strong className="text-ink-1">{detIntel.provider}</strong>
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-12">
                  <div>
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Exposure tier</div>
                    <div className={`font-bold ${
                      detExposure.exposureTier === "direct" ? "text-red"
                      : detExposure.exposureTier === "one_hop" ? "text-orange"
                      : detExposure.exposureTier === "indirect" ? "text-amber"
                      : "text-green"
                    }`}>
                      {detExposure.exposureTier.replace(/_/g, " ").toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Wallet age</div>
                    <div className="font-medium text-ink-0">
                      {detIntel.age.tier.replace(/_/g, " ")} <span className="text-ink-3 font-mono text-10">({detIntel.age.ageDays}d)</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Mixer exposure</div>
                    <div className={`font-medium ${
                      detIntel.mixer.severity === "critical" ? "text-red"
                      : detIntel.mixer.severity === "high" ? "text-orange"
                      : "text-ink-0"
                    }`}>
                      {detIntel.mixer.severity.toUpperCase()}
                    </div>
                  </div>
                </div>
                {detExposure.redFlags.length > 0 && (
                  <ul className="mt-3 space-y-1 text-11 text-ink-1">
                    {detExposure.redFlags.map((f, i) => (
                      <li key={i}>● {f}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-10 text-ink-3 italic">{detExposure.rationale}</p>
              </div>
            )}

            {(result.taintedTransactions != null || result.firstSeen) && (
              <div className={`${cardCls} grid grid-cols-1 md:grid-cols-2 gap-3 text-12`}>
                {result.taintedTransactions != null && (
                  <div>
                    <div className="text-ink-3 mb-0.5">Tainted Transactions</div>
                    <div className="font-medium text-ink-0">{result.taintedTransactions} / {result.totalTransactions ?? "?"}</div>
                  </div>
                )}
                {result.firstSeen && (
                  <div>
                    <div className="text-ink-3 mb-0.5">First Seen</div>
                    <div className="font-medium text-ink-0">{result.firstSeen.slice(0, 10)}</div>
                  </div>
                )}
                {result.lastSeen && (
                  <div>
                    <div className="text-ink-3 mb-0.5">Last Seen</div>
                    <div className="font-medium text-ink-0">{result.lastSeen.slice(0, 10)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {result && result.ok && (
          <div className="mt-4">
            <button type="button" onClick={() => void analyzeWalletThreat(result)} disabled={threatLoading}
              className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
              {threatLoading ? "Analyzing…" : "✦AI"}
            </button>
            {threat && (() => {
              const vCls = threat.complianceVerdict === "block" ? "bg-red text-white" : threat.complianceVerdict === "escalate" ? "bg-red-dim text-red" : threat.complianceVerdict === "enhanced_kyc" ? "bg-amber-dim text-amber" : threat.complianceVerdict === "monitor" ? "bg-brand-dim text-brand-deep" : "bg-green-dim text-green";
              return (
                <div className="mt-3 bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${vCls}`}>{threat.complianceVerdict.replace(/_/g," ")}</span>
                    {threat.reportingObligation && <span className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red font-semibold">STR REQUIRED</span>}
                  </div>
                  <p className="text-12 text-ink-0 leading-relaxed">{threat.narrative}</p>
                  {threat.typologies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">{threat.typologies.map((t, i) => <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-brand-dim text-brand-deep">{t}</span>)}</div>
                  )}
                  {threat.sanctionsNexus && <div className="text-11 text-red">{threat.sanctionsNexus}</div>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-10 font-mono text-ink-3">
                    {threat.fatfR15Exposure && <div>{threat.fatfR15Exposure}</div>}
                    {threat.varaUaeRelevance && <div>{threat.varaUaeRelevance}</div>}
                  </div>
                  {threat.requiredActions.length > 0 && (
                    <ul className="text-11 text-ink-1 list-disc list-inside space-y-0.5">{threat.requiredActions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  )}
                  {threat.reportingObligation && threat.reportingBasis && (
                    <div className="text-10 font-mono text-red">{threat.reportingBasis}</div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
