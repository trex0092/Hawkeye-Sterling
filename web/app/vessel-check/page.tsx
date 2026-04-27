"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

interface VesselOwner {
  name: string;
  role: string;
  country?: string;
  lei?: string;
}

interface VesselSanctionHit {
  list: string;
  entryId?: string;
  reason?: string;
  listedAt?: string;
}

interface VesselRecord {
  imoNumber: string;
  vesselName: string;
  flag?: string;
  type?: string;
  grossTonnage?: number;
  yearBuilt?: number;
  callSign?: string;
  mmsi?: string;
  owners: VesselOwner[];
  sanctionHits: VesselSanctionHit[];
  lastUpdated?: string;
}

interface VesselCheckResult {
  ok: boolean;
  imoNumber: string;
  vessel?: VesselRecord;
  sanctioned: boolean;
  riskLevel: "clean" | "elevated" | "high" | "blocked";
  riskDetail: string;
  error?: string;
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  // single mode
  imoNumber?: string;
  vessel?: VesselRecord;
  sanctioned?: boolean;
  riskLevel?: string;
  riskDetail?: string;
  // batch mode
  total?: number;
  blocked?: number;
  high?: number;
  results?: VesselCheckResult[];
}

const RISK_STYLE: Record<string, string> = {
  blocked: "bg-red-700 text-white",
  high: "bg-red-100 text-red-800 border border-red-300",
  elevated: "bg-orange-100 text-orange-800 border border-orange-300",
  clean: "bg-green-100 text-green-800 border border-green-300",
};

export default function VesselCheckPage() {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [imoNumber, setImoNumber] = useState("");
  const [batchImos, setBatchImos] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setLoading(true); setError(null); setResult(null);
    try {
      const body = mode === "single"
        ? { imoNumber: imoNumber.trim() }
        : { imoNumbers: batchImos.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) };

      const res = await fetch("/api/vessel-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as ApiResponse;
      if (!data.ok) setError(data.error ?? "Check failed");
      else setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  const canSubmit = mode === "single" ? imoNumber.trim().length > 0 : batchImos.trim().length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Vessel Sanctions Check</h1>
          <p className="text-sm text-gray-500 mt-1">
            IMO number lookup — sanctions screening, ownership chain, flag state. Batch mode supports up to 50 vessels.
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-5">
          {(["single", "batch"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setResult(null); setError(null); }}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                mode === m ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {m === "single" ? "Single Vessel" : "Batch (CSV / list)"}
            </button>
          ))}
        </div>

        {/* Input card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          {mode === "single" ? (
            <div className="flex gap-3">
              <input
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                placeholder="IMO number — e.g. 9166778 or IMO 9166778"
                value={imoNumber}
                onChange={(e) => setImoNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSubmit && check()}
              />
              <button
                onClick={check}
                disabled={loading || !canSubmit}
                className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
              >
                {loading ? "Checking…" : "Check Vessel"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono h-32 resize-y"
                placeholder="One IMO per line or comma-separated&#10;9166778&#10;9321483&#10;IMO 7366993"
                value={batchImos}
                onChange={(e) => setBatchImos(e.target.value)}
              />
              <button
                onClick={check}
                disabled={loading || !canSubmit}
                className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
              >
                {loading ? "Screening…" : "Screen All"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-4">{error}</div>
        )}

        {/* Single result */}
        {result && mode === "single" && result.vessel && (
          <div className="space-y-4">
            <div className={`rounded-lg border-2 p-5 ${result.riskLevel === "blocked" ? "border-red-600 bg-red-50" : result.riskLevel === "high" ? "border-red-300 bg-white" : "border-gray-200 bg-white"}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{result.vessel.vesselName}</h2>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">IMO {result.imoNumber}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded uppercase ${RISK_STYLE[result.riskLevel ?? "clean"]}`}>
                  {result.riskLevel}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-4">{result.riskDetail}</p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {result.vessel.flag && <div><span className="text-gray-400">Flag State</span><p className="font-medium">{result.vessel.flag}</p></div>}
                {result.vessel.type && <div><span className="text-gray-400">Vessel Type</span><p className="font-medium">{result.vessel.type}</p></div>}
                {result.vessel.grossTonnage && <div><span className="text-gray-400">Gross Tonnage</span><p className="font-medium">{result.vessel.grossTonnage.toLocaleString()} GT</p></div>}
                {result.vessel.yearBuilt && <div><span className="text-gray-400">Year Built</span><p className="font-medium">{result.vessel.yearBuilt}</p></div>}
                {result.vessel.callSign && <div><span className="text-gray-400">Call Sign</span><p className="font-mono font-medium">{result.vessel.callSign}</p></div>}
                {result.vessel.mmsi && <div><span className="text-gray-400">MMSI</span><p className="font-mono font-medium">{result.vessel.mmsi}</p></div>}
              </div>
            </div>

            {/* Sanction hits */}
            {result.vessel.sanctionHits.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-5">
                <h3 className="text-sm font-bold text-red-800 mb-3">Sanction Hits ({result.vessel.sanctionHits.length})</h3>
                <div className="space-y-3">
                  {result.vessel.sanctionHits.map((hit, i) => (
                    <div key={i} className="bg-white rounded border border-red-200 p-3">
                      <p className="text-sm font-bold text-red-700">{hit.list}</p>
                      {hit.entryId && <p className="text-xs text-gray-500">Entry ID: {hit.entryId}</p>}
                      {hit.reason && <p className="text-xs text-gray-600 mt-1">{hit.reason}</p>}
                      {hit.listedAt && <p className="text-xs text-gray-400 mt-1">Listed: {hit.listedAt.slice(0, 10)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ownership */}
            {result.vessel.owners.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Ownership</h3>
                <div className="space-y-2">
                  {result.vessel.owners.map((o, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <span className="font-medium text-gray-900">{o.name}</span>
                        {o.lei && <span className="ml-2 text-xs font-mono text-gray-400">{o.lei}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {o.country && <span className="text-xs text-gray-400">{o.country}</span>}
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{o.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.vessel.lastUpdated && (
              <p className="text-xs text-gray-400">Last updated: {result.vessel.lastUpdated.slice(0, 10)}</p>
            )}
          </div>
        )}

        {/* Single — not found / no vessel */}
        {result && mode === "single" && !result.vessel && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-600">{result.riskDetail}</p>
          </div>
        )}

        {/* Batch results */}
        {result && mode === "batch" && result.results && (
          result.results.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
              All {result.total ?? 0} vessels passed screening — no blocked or high-risk results.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-700">{result.total}</div>
                  <div className="text-xs text-gray-400">Vessels Screened</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-700">{result.blocked}</div>
                  <div className="text-xs text-red-500">Blocked</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-700">{result.high}</div>
                  <div className="text-xs text-orange-500">High Risk</div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">IMO</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Vessel</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Flag</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Sanction Hits</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.results.map((r) => (
                      <tr key={r.imoNumber} className={r.riskLevel === "blocked" ? "bg-red-50" : ""}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.imoNumber}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{r.vessel?.vesselName ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-500">{r.vessel?.flag ?? "—"}</td>
                        <td className="px-4 py-3">
                          {r.vessel?.sanctionHits.length
                            ? <span className="text-xs text-red-700 font-bold">{r.vessel.sanctionHits.length} hit(s)</span>
                            : <span className="text-xs text-gray-400">None</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${RISK_STYLE[r.riskLevel] ?? "bg-gray-100 text-gray-600"}`}>
                            {r.riskLevel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}
