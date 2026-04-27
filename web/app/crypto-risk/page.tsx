"use client";

import { useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

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

export default function CryptoRiskPage() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WalletRisk | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (!data.ok) setError(data.error ?? "Scoring failed");
      else setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
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

            {(result.taintedTransactions != null || result.firstSeen) && (
              <div className={`${cardCls} grid grid-cols-2 gap-3 text-12`}>
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
      </div>
    </ModuleLayout>
  );
}
