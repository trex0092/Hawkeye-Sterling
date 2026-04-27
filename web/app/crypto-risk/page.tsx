"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

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

const RISK_COLOUR: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high:     "bg-orange-100 text-orange-700 border-orange-300",
  medium:   "bg-yellow-100 text-yellow-700 border-yellow-300",
  low:      "bg-green-100 text-green-700 border-green-300",
  unknown:  "bg-gray-100 text-gray-500 border-gray-200",
};

function ExposureBar({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

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
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Crypto Wallet Risk</h1>
          <p className="text-sm text-gray-500 mt-1">
            AML taint analysis for ETH, BTC, and TRX wallets. Supports Januus, Chainalysis KYT, and Elliptic Lens.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 flex gap-3">
          <input
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
            placeholder="0x… or 1… or bc1… or T…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && score()}
          />
          <button onClick={score} disabled={loading || !address.trim()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
            {loading ? "Scoring…" : "Score Wallet"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm mb-4">
            <p className="text-red-700 font-medium">{error}</p>
            {error.includes("No crypto risk provider") && (
              <p className="text-red-600 mt-1 text-xs">Set JANUUS_API_KEY, CHAINALYSIS_API_KEY, or ELLIPTIC_API_KEY + ELLIPTIC_SECRET in your environment variables.</p>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono text-sm text-gray-700 break-all">{result.address}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Chain: {result.chain.toUpperCase()} · Provider: {result.provider}</p>
                </div>
                <span className={`border rounded px-2 py-1 text-xs font-bold flex-shrink-0 ml-3 ${RISK_COLOUR[result.riskLevel] ?? RISK_COLOUR.unknown}`}>
                  {result.riskLevel.toUpperCase()} · {result.riskScore}
                </span>
              </div>
              {result.riskCategory && <p className="text-sm text-gray-600">Category: <span className="font-medium">{result.riskCategory}</span></p>}
              {result.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {result.labels.map((l) => <span key={l} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{l}</span>)}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-4">Exposure Breakdown</h3>
              <div className="space-y-3">
                <ExposureBar label="Direct Sanctions Exposure" value={result.exposure.directSanctioned} colour="bg-red-500" />
                <ExposureBar label="Indirect Sanctions Exposure" value={result.exposure.indirectSanctioned} colour="bg-orange-400" />
                <ExposureBar label="Mixing / Tumbling" value={result.exposure.mixing} colour="bg-yellow-400" />
                <ExposureBar label="Darknet Markets" value={result.exposure.darknet} colour="bg-purple-500" />
              </div>
            </div>

            {(result.taintedTransactions != null || result.firstSeen) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 grid grid-cols-2 gap-3 text-sm">
                {result.taintedTransactions != null && <div><span className="text-gray-400">Tainted Tx</span><p className="font-medium">{result.taintedTransactions} / {result.totalTransactions ?? "?"}</p></div>}
                {result.firstSeen && <div><span className="text-gray-400">First Seen</span><p className="font-medium">{result.firstSeen.slice(0, 10)}</p></div>}
                {result.lastSeen && <div><span className="text-gray-400">Last Seen</span><p className="font-medium">{result.lastSeen.slice(0, 10)}</p></div>}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
