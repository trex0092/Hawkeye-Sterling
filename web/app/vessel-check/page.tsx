"use client";

import { useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

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
  imoNumber?: string;
  vessel?: VesselRecord;
  sanctioned?: boolean;
  riskLevel?: string;
  riskDetail?: string;
  total?: number;
  blocked?: number;
  high?: number;
  results?: VesselCheckResult[];
}

type RiskTier = "Low" | "Medium" | "High" | "Critical";

interface VesselRiskProfile {
  ok: boolean;
  riskScore: number;
  riskTier: RiskTier;
  flagRisk: number;
  ownershipRisk: number;
  portRisk: number;
  cargoRisk: number;
  anomalies: string[];
  recommendation: string;
  regulatoryBasis: string;
  summary: string;
}

const RISK_TONE: Record<string, string> = {
  blocked:  "bg-red-dim text-red border border-red/30",
  high:     "bg-red-dim text-red border border-red/30",
  elevated: "bg-amber-dim text-amber border border-amber/30",
  clean:    "bg-green-dim text-green border border-green/30",
};

const inputCls = "px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand text-ink-0";
const monoInputCls = `${inputCls} font-mono`;
const btnCls = "px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity";
const tabCls = (active: boolean) =>
  `px-3 py-1 rounded text-11 font-medium border transition-colors ${
    active
      ? "bg-brand text-white border-brand"
      : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
  }`;

export default function VesselCheckPage() {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [imoNumber, setImoNumber] = useState("");
  const [batchImos, setBatchImos] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riskProfile, setRiskProfile] = useState<VesselRiskProfile | null>(null);
  const [riskProfileLoading, setRiskProfileLoading] = useState(false);
  const [rpFlag, setRpFlag] = useState("");
  const [rpOwner, setRpOwner] = useState("");
  const [rpOperator, setRpOperator] = useState("");
  const [rpPorts, setRpPorts] = useState("");
  const [rpCargo, setRpCargo] = useState("");
  const [rpSanctioned, setRpSanctioned] = useState(false);

  async function generateRiskProfile() {
    setRiskProfileLoading(true);
    setRiskProfile(null);
    try {
      const vessel = result?.vessel;
      const res = await fetch("/api/vessel-check/risk-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vesselName: vessel?.vesselName,
          imo: (result?.imoNumber ?? imoNumber.trim()) || undefined,
          flag: rpFlag || vessel?.flag || undefined,
          owner: rpOwner || vessel?.owners?.[0]?.name || undefined,
          operator: rpOperator || undefined,
          lastPorts: rpPorts ? rpPorts.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) : undefined,
          cargoTypes: rpCargo ? rpCargo.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) : undefined,
          sanctionedConnections: rpSanctioned || (vessel?.sanctionHits?.length ?? 0) > 0,
        }),
      });
      const data = (await res.json()) as VesselRiskProfile;
      if (data.ok) setRiskProfile(data);
    } catch { /* silent */ }
    finally { setRiskProfileLoading(false); }
  }

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
    <ModuleLayout asanaModule="vessel-check" asanaLabel="Vessel Check" engineLabel="Vessel Check">
      <ModuleHero
        moduleNumber={38}
        eyebrow="Module · Maritime Intelligence"
        title="Vessel sanctions"
        titleEm="check."
        intro="IMO number lookup — sanctions screening, ownership chain, flag state. Batch mode supports up to 50 vessels."
      />

      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
              Maritime Intelligence · Vessel Sanctions
            </div>
            <div className="text-12 text-ink-2">
              OFAC · UN · EU · UK OFSI · UAE EOCN — IMO lookup + ownership chain
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(["single", "batch"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setImoNumber(""); setBatchImos(""); setResult(null); setError(null); }}
                className={tabCls(mode === m)}
              >
                {m === "single" ? "Single Vessel" : "Batch (CSV / list)"}
              </button>
            ))}
          </div>
        </div>

        {mode === "single" ? (
          <div className="flex gap-3">
            <input
              className={`flex-1 ${monoInputCls}`}
              placeholder="IMO number — e.g. 9166778 or IMO 9166778"
              value={imoNumber}
              onChange={(e) => setImoNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && check()}
            />
            <button type="button" onClick={check} disabled={loading || !canSubmit} className={btnCls}>
              {loading ? "Checking…" : "Check Vessel"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              className={`w-full h-28 resize-y ${monoInputCls}`}
              placeholder={"One IMO per line or comma-separated\n9166778\n9321483\nIMO 7366993"}
              value={batchImos}
              onChange={(e) => setBatchImos(e.target.value)}
            />
            <button type="button" onClick={check} disabled={loading || !canSubmit} className={btnCls}>
              {loading ? "Screening…" : "Screen All"}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {result && mode === "single" && result.vessel && (
          <div className="space-y-4">
            <div className={`border-2 rounded-xl p-5 ${result.riskLevel === "blocked" || result.riskLevel === "high" ? "border-red/40 bg-red-dim/30" : "border-hair-2"}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-18 font-semibold text-ink-0">{result.vessel.vesselName}</h2>
                  <p className="text-11 font-mono text-ink-3 mt-0.5">IMO {result.imoNumber}</p>
                  <div className="mt-2">
                    <AsanaReportButton payload={{
                      module: "vessel-check",
                      label: `${result.vessel.vesselName} (IMO ${result.imoNumber})`,
                      summary: `Vessel: ${result.vessel.vesselName}; IMO: ${result.imoNumber}; Flag: ${result.vessel.flag ?? "—"}; Risk: ${result.riskLevel}; ${result.riskDetail}`,
                      metadata: { imo: result.imoNumber, flag: result.vessel.flag, riskLevel: result.riskLevel, sanctionHits: result.vessel.sanctionHits.length },
                    }} />
                  </div>
                </div>
                <span className={`text-11 font-bold px-2.5 py-1 rounded uppercase ${RISK_TONE[result.riskLevel ?? "clean"]}`}>
                  {result.riskLevel}
                </span>
              </div>
              <p className="text-12 text-ink-2 mb-4">{result.riskDetail}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-12">
                {result.vessel.flag && <div><div className="text-ink-3">Flag State</div><div className="font-medium text-ink-0">{result.vessel.flag}</div></div>}
                {result.vessel.type && <div><div className="text-ink-3">Vessel Type</div><div className="font-medium text-ink-0">{result.vessel.type}</div></div>}
                {result.vessel.grossTonnage && <div><div className="text-ink-3">Gross Tonnage</div><div className="font-medium text-ink-0">{result.vessel.grossTonnage.toLocaleString()} GT</div></div>}
                {result.vessel.yearBuilt && <div><div className="text-ink-3">Year Built</div><div className="font-medium text-ink-0">{result.vessel.yearBuilt}</div></div>}
                {result.vessel.callSign && <div><div className="text-ink-3">Call Sign</div><div className="font-mono font-medium text-ink-0">{result.vessel.callSign}</div></div>}
                {result.vessel.mmsi && <div><div className="text-ink-3">MMSI</div><div className="font-mono font-medium text-ink-0">{result.vessel.mmsi}</div></div>}
              </div>
            </div>

            {result.vessel.sanctionHits.length > 0 && (
              <div className="bg-red-dim border border-red/30 rounded-xl p-5">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-red mb-3">
                  Sanction Hits ({result.vessel.sanctionHits.length})
                </div>
                <div className="space-y-3">
                  {result.vessel.sanctionHits.map((hit, i) => (
                    <div key={`${hit.list}-${hit.entryId ?? i}`} className="bg-bg-panel rounded border border-red/20 p-3">
                      <p className="text-12 font-bold text-red">{hit.list}</p>
                      {hit.entryId && <p className="text-11 text-ink-3">Entry ID: {hit.entryId}</p>}
                      {hit.reason && <p className="text-11 text-ink-2 mt-1">{hit.reason}</p>}
                      {hit.listedAt && <p className="text-11 text-ink-3 mt-1">Listed: {hit.listedAt.slice(0, 10)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.vessel.owners.length > 0 && (
              <div className="border border-hair-2 rounded-xl p-5">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Ownership</div>
                <div className="space-y-2">
                  {result.vessel.owners.map((o, i) => (
                    <div key={`${o.name}-${o.lei ?? i}`} className="flex items-center justify-between text-12 py-2 border-b border-hair last:border-0">
                      <div>
                        <span className="font-medium text-ink-0">{o.name}</span>
                        {o.lei && <span className="ml-2 text-10 font-mono text-ink-3">{o.lei}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {o.country && <span className="text-11 text-ink-3">{o.country}</span>}
                        <span className="text-10 bg-bg-1 text-ink-2 border border-hair-2 px-1.5 py-0.5 rounded">{o.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.vessel.lastUpdated && (
              <p className="text-11 text-ink-3">Last updated: {result.vessel.lastUpdated.slice(0, 10)}</p>
            )}
          </div>
        )}

        {/* AI Risk Profile — single mode */}
        {result && mode === "single" && (
          <div className="mt-4 border border-hair-2 rounded-xl p-5 space-y-4">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">AI Vessel Risk Profile</div>
            <p className="text-11 text-ink-3">
              Optionally enrich with additional details, then generate an AI risk assessment across four dimensions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-10 uppercase tracking-wide-3 text-ink-3">Flag State</label>
                <input value={rpFlag} onChange={(e) => setRpFlag(e.target.value)} placeholder={result.vessel?.flag ?? "e.g. Panama"} className={`w-full ${inputCls}`} />
              </div>
              <div className="space-y-1">
                <label className="text-10 uppercase tracking-wide-3 text-ink-3">Registered Owner</label>
                <input value={rpOwner} onChange={(e) => setRpOwner(e.target.value)} placeholder={result.vessel?.owners?.[0]?.name ?? "Owner name"} className={`w-full ${inputCls}`} />
              </div>
              <div className="space-y-1">
                <label className="text-10 uppercase tracking-wide-3 text-ink-3">Operator</label>
                <input value={rpOperator} onChange={(e) => setRpOperator(e.target.value)} placeholder="Operator / manager" className={`w-full ${inputCls}`} />
              </div>
              <div className="space-y-1">
                <label className="text-10 uppercase tracking-wide-3 text-ink-3">Last Known Ports (comma separated)</label>
                <input value={rpPorts} onChange={(e) => setRpPorts(e.target.value)} placeholder="e.g. Dubai, Bandar Abbas, Khor Fakkan" className={`w-full ${inputCls}`} />
              </div>
              <div className="space-y-1">
                <label className="text-10 uppercase tracking-wide-3 text-ink-3">Cargo Types (comma separated)</label>
                <input value={rpCargo} onChange={(e) => setRpCargo(e.target.value)} placeholder="e.g. Crude Oil, Chemicals" className={`w-full ${inputCls}`} />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input type="checkbox" id="rp-sanctioned" checked={rpSanctioned} onChange={(e) => setRpSanctioned(e.target.checked)} className="w-4 h-4 accent-red" />
                <label htmlFor="rp-sanctioned" className="text-12 text-ink-1 cursor-pointer">Sanctioned connections identified</label>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void generateRiskProfile()}
              disabled={riskProfileLoading}
              className={btnCls}
            >
              {riskProfileLoading ? "Analysing…" : "🚢 Generate Risk Profile"}
            </button>

            {riskProfile && (() => {
              const tierColor: Record<string, string> = {
                Critical: "text-red",
                High: "text-red",
                Medium: "text-amber",
                Low: "text-green",
              };
              const tierBadge: Record<string, string> = {
                Critical: "bg-red text-white",
                High: "bg-red-dim text-red border border-red/40",
                Medium: "bg-amber-dim text-amber border border-amber/40",
                Low: "bg-green-dim text-green border border-green/40",
              };
              const recBadge: Record<string, string> = {
                "File STR": "bg-red text-white",
                "Block": "bg-red-dim text-red border border-red/40",
                "Enhanced Monitoring": "bg-amber-dim text-amber border border-amber/40",
                "Clear": "bg-green-dim text-green border border-green/40",
              };
              const scoreColor = tierColor[riskProfile.riskTier] ?? "text-ink-0";
              const dims = [
                { label: "Flag Risk", value: riskProfile.flagRisk },
                { label: "Ownership Risk", value: riskProfile.ownershipRisk },
                { label: "Port Risk", value: riskProfile.portRisk },
                { label: "Cargo Risk", value: riskProfile.cargoRisk },
              ];
              return (
                <div className="mt-2 space-y-5 print:space-y-4">
                  <div className="flex items-center gap-5 flex-wrap">
                    <div className="text-center">
                      <div className={`text-48 font-mono font-bold leading-none ${scoreColor}`}>{riskProfile.riskScore}</div>
                      <div className="text-10 uppercase tracking-wide-3 text-ink-3">Risk Score</div>
                    </div>
                    <span className={`text-14 font-bold px-4 py-2 rounded-lg uppercase ${tierBadge[riskProfile.riskTier] ?? "bg-bg-2 text-ink-2"}`}>
                      {riskProfile.riskTier}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {dims.map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex justify-between text-11 mb-1">
                          <span className="text-ink-2">{label}</span>
                          <span className="font-mono text-ink-0">{value}/100</span>
                        </div>
                        <div className="h-2 bg-hair rounded-full overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${value >= 75 ? "bg-red" : value >= 50 ? "bg-amber" : "bg-green"}`}
                            style={{ width: `${value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {riskProfile.anomalies.length > 0 && (
                    <div>
                      <div className="text-10 uppercase tracking-wide-3 text-amber mb-2">AIS / Behavioural Anomalies</div>
                      <ul className="space-y-1">
                        {riskProfile.anomalies.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                            <span className="text-amber mt-px shrink-0">⚠</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Compliance Recommendation</div>
                    <span className={`inline-block px-4 py-2 rounded-lg text-13 font-bold ${recBadge[riskProfile.recommendation] ?? "bg-bg-2 text-ink-2 border border-hair-2"}`}>
                      {riskProfile.recommendation}
                    </span>
                  </div>

                  <div>
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Regulatory Basis</div>
                    <p className="text-11 text-ink-2">{riskProfile.regulatoryBasis}</p>
                  </div>

                  <div>
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Summary</div>
                    <p className="text-12 text-ink-1 leading-relaxed">{riskProfile.summary}</p>
                  </div>

                  <div className="pt-2 border-t border-hair-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="text-11 font-mono px-3 py-1.5 rounded border font-semibold"
                      style={{ color: "#7c3aed", borderColor: "#7c3aed", background: "rgba(124,58,237,0.07)" }}
                    >
                      PDF
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {result && mode === "single" && !result.vessel && (
          <div className="border border-hair-2 rounded-lg p-5">
            <p className="text-12 text-ink-2">{result.riskDetail}</p>
          </div>
        )}

        {result && mode === "batch" && result.results && (
          result.results.length === 0 ? (
            <div className="border border-hair-2 rounded-lg p-8 text-center text-12 text-ink-3">
              All {result.total ?? 0} vessels passed screening — no blocked or high-risk results.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-hair-2 rounded-lg p-4 text-center">
                  <div className="text-20 font-mono font-semibold text-ink-0">{result.total}</div>
                  <div className="text-11 text-ink-3 uppercase tracking-wide-3">Screened</div>
                </div>
                <div className="bg-red-dim border border-red/30 rounded-lg p-4 text-center">
                  <div className="text-20 font-mono font-semibold text-red">{result.blocked}</div>
                  <div className="text-11 text-red uppercase tracking-wide-3">Blocked</div>
                </div>
                <div className="bg-amber-dim border border-amber/30 rounded-lg p-4 text-center">
                  <div className="text-20 font-mono font-semibold text-amber">{result.high}</div>
                  <div className="text-11 text-amber uppercase tracking-wide-3">High Risk</div>
                </div>
              </div>

              <div className="border border-hair-2 rounded-lg overflow-hidden">
                <table className="w-full text-12">
                  <thead className="bg-bg-1 border-b border-hair-2">
                    <tr>
                      {["IMO", "Vessel", "Flag", "Sanction Hits", "Risk"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {result.results.map((r) => (
                      <tr key={r.imoNumber} className={r.riskLevel === "blocked" ? "bg-red-dim/20" : ""}>
                        <td className="px-3 py-2 font-mono text-10 text-ink-3">{r.imoNumber}</td>
                        <td className="px-3 py-2 font-medium text-ink-0">{r.vessel?.vesselName ?? "—"}</td>
                        <td className="px-3 py-2 text-ink-2">{r.vessel?.flag ?? "—"}</td>
                        <td className="px-3 py-2">
                          {r.vessel?.sanctionHits.length
                            ? <span className="text-11 text-red font-bold">{r.vessel.sanctionHits.length} hit(s)</span>
                            : <span className="text-11 text-ink-3">None</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-10 font-bold px-2 py-0.5 rounded uppercase ${RISK_TONE[r.riskLevel] ?? "bg-bg-2 text-ink-3"}`}>
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
      </div>
    </ModuleLayout>
  );
}
