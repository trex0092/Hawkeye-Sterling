"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { SupplyChainRiskResult } from "@/app/api/supply-chain/risk/route";
import type { SupplyChainMapResult } from "@/app/api/supply-chain/map/route";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface Supplier {
  name: string;
  country: string;
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red/10 text-red border border-red/30",
  high: "bg-orange/10 text-orange border border-orange/30",
  medium: "bg-amber/10 text-amber border border-amber/30",
  low: "bg-green-dim text-green border border-green/20",
};

const RISK_DOT: Record<string, string> = {
  critical: "bg-red",
  high: "bg-orange",
  medium: "bg-amber",
  low: "bg-green",
  unknown: "bg-ink-3",
};

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-semibold uppercase tracking-wide-3 ${RISK_COLORS[level] ?? "bg-bg-2 text-ink-2 border border-hair"}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${RISK_DOT[level] ?? "bg-ink-3"}`} />
      {level}
    </span>
  );
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────
function ScoreRing({ score, risk }: { score: number; risk: string }) {
  const color =
    risk === "critical" ? "#ef4444"
    : risk === "high" ? "#f97316"
    : risk === "medium" ? "#f59e0b"
    : "#22c55e";
  const dash = (score / 100) * 251;
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--hair-2)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} 251`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-24 font-bold text-ink-0">{score}</span>
        <span className="text-10 uppercase tracking-wide-3 text-ink-3">/ 100</span>
      </div>
    </div>
  );
}

function TagInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  };
  return (
    <div>
      <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1.5">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-13 text-ink-0 outline-none focus:border-brand"
        />
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 bg-bg-2 border border-hair rounded px-2 py-0.5 text-12 text-ink-1">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-ink-3 hover:text-red text-11 ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierList({
  suppliers,
  onChange,
}: {
  suppliers: Supplier[];
  onChange: (s: Supplier[]) => void;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const add = () => {
    if (name.trim() && country.trim()) {
      onChange([...suppliers, { name: name.trim(), country: country.trim() }]);
      setName(""); setCountry("");
    }
  };
  return (
    <div>
      <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1.5">Tier-1 Suppliers</label>
      <div className="flex gap-2 mb-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Supplier name"
          className="flex-[3] bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-13 text-ink-0 outline-none focus:border-brand"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Country (ISO-2)"
          className="flex-1 bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-13 text-ink-0 outline-none focus:border-brand"
        />
      </div>
      {suppliers.length > 0 && (
        <div className="flex flex-col gap-1">
          {suppliers.map((s, i) => (
            <div key={i} className="flex items-center gap-2 bg-bg-2 border border-hair rounded px-3 py-1.5">
              <span className="text-12 font-medium text-ink-0 flex-1">{s.name}</span>
              <span className="text-11 text-ink-3 font-mono">{s.country}</span>
              <button type="button" onClick={() => onChange(suppliers.filter((_, j) => j !== i))} className="text-ink-3 hover:text-red text-11">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Geographic Map (CSS grid)
// ──────────────────────────────────────────────
function GeographicMap({ countryRiskSummary }: { countryRiskSummary: SupplyChainMapResult["countryRiskSummary"] }) {
  if (!countryRiskSummary.length) return null;
  return (
    <div>
      <h3 className="text-13 font-semibold text-ink-0 mb-3">Geographic Risk Map</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {countryRiskSummary.map((c) => {
          const bg =
            c.riskLevel === "critical" ? "bg-red/10 border-red/40"
            : c.riskLevel === "high" ? "bg-orange/10 border-orange/40"
            : c.riskLevel === "medium" ? "bg-amber/10 border-amber/30"
            : "bg-green-dim border-green/20";
          const textColor =
            c.riskLevel === "critical" ? "text-red"
            : c.riskLevel === "high" ? "text-orange"
            : c.riskLevel === "medium" ? "text-amber"
            : "text-green";
          return (
            <div key={c.country} className={`rounded border p-2.5 ${bg}`}>
              <div className={`font-mono text-10 font-bold uppercase ${textColor}`}>{c.riskLevel}</div>
              <div className="text-12 font-semibold text-ink-0 mt-0.5 leading-snug">{c.country}</div>
              <div className="text-10 text-ink-3 mt-0.5">{c.supplierCount} supplier{c.supplierCount !== 1 ? "s" : ""}</div>
              {c.flags.slice(0, 2).map((f) => (
                <div key={f} className="text-10 text-ink-2 mt-0.5 leading-tight">• {f}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function SupplyChainPage() {
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sourceCountries, setSourceCountries] = useState<string[]>([]);
  const [commodities, setCommodities] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SupplyChainRiskResult | null>(null);
  const [mapResult, setMapResult] = useState<SupplyChainMapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived KPIs for hero (update live when result is available)
  const kpiCompanies = result ? "1" : "0";
  const kpiHighRisk = result ? String(result.tier1Risk.filter((s) => s.riskTier === "critical" || s.riskTier === "high").length) : "0";
  const kpiGaps = result ? String(result.complianceGaps.length) : "0";
  const kpiActions = result ? String(result.actionPlan.length) : "0";

  const assess = async () => {
    setLoading(true);
    setError(null);
    try {
      const [riskRes, mapRes] = await Promise.all([
        fetch("/api/supply-chain/risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company,
            sector,
            tier1Suppliers: suppliers.map((s) => `${s.name} (${s.country})`),
            keySourceCountries: sourceCountries,
            commodities,
            certifications,
          }),
        }),
        fetch("/api/supply-chain/map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company, suppliers }),
        }),
      ]);
      const [riskData, mapData] = await Promise.all([
        riskRes.json() as Promise<SupplyChainRiskResult>,
        mapRes.json() as Promise<SupplyChainMapResult>,
      ]);
      setResult(riskData);
      setMapResult(mapData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout engineLabel="Supply chain engine" asanaModule="supply-chain" asanaLabel="Supply Chain Risk">
      <ModuleHero
        eyebrow="ESG · Responsible Sourcing · AML"
        title="Supply"
        titleEm="chain."
        moduleNumber={42}
        kpis={[
          { value: kpiCompanies, label: "Companies assessed" },
          { value: kpiHighRisk, label: "High-risk suppliers", tone: result && parseInt(kpiHighRisk) > 0 ? "red" : undefined },
          { value: kpiGaps, label: "Compliance gaps", tone: result && parseInt(kpiGaps) > 0 ? "orange" : undefined },
          { value: kpiActions, label: "Action items" },
        ]}
        intro="Assess geographic concentration, sanctions exposure, environmental crime risk, labour exploitation, and regulatory compliance gaps across your supply chain (EU CSDDD, US UFLPA, Dodd-Frank §1502)."
      />

      {/* ── Input form ── */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 mb-6">
        <h2 className="text-14 font-semibold text-ink-0 mb-4">Company & Supply Chain Setup</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1.5">Company Name</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Acme Manufacturing Ltd"
              className="w-full bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-13 text-ink-0 outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1.5">Sector</label>
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="e.g. Electronics, Mining, Textiles"
              className="w-full bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-13 text-ink-0 outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-4">
          <SupplierList suppliers={suppliers} onChange={setSuppliers} />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <TagInput label="Key Source Countries" placeholder="e.g. DRC, China" values={sourceCountries} onChange={setSourceCountries} />
          <TagInput label="Commodities" placeholder="e.g. Gold, Cobalt, Cotton" values={commodities} onChange={setCommodities} />
          <TagInput label="Certifications Held" placeholder="e.g. RMAP, FSC, ISO 14001" values={certifications} onChange={setCertifications} />
        </div>

        <button
          type="button"
          onClick={assess}
          disabled={loading || (!company && suppliers.length === 0)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-13 font-semibold rounded hover:bg-brand/90 disabled:opacity-40 transition-colors"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Assessing supply chain…
            </>
          ) : (
            "🔍 Assess Supply Chain"
          )}
        </button>
        {error && <p className="mt-2 text-12 text-red">{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="space-y-6">
          {/* Overall risk score */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 flex items-center gap-8">
            <ScoreRing score={result.riskScore} risk={result.overallRisk} />
            <div>
              <div className="text-11 uppercase tracking-wide-3 text-ink-3 mb-1 font-mono">Overall Supply Chain Risk</div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-display text-36 font-bold text-ink-0 capitalize">{result.overallRisk}</span>
                <RiskBadge level={result.overallRisk} />
              </div>
              <p className="text-13 text-ink-1 leading-relaxed max-w-[60ch]">{result.recommendation}</p>
            </div>
          </div>

          {/* Red flags */}
          {result.redFlags.length > 0 && (
            <div className="bg-red/5 border border-red/20 rounded-lg p-4">
              <h3 className="text-12 font-semibold uppercase tracking-wide-3 text-red mb-3">Red Flags</h3>
              <div className="space-y-1.5">
                {result.redFlags.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-13 text-ink-0">
                    <span className="text-red mt-0.5 shrink-0">⚑</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier risk table */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-hair-2">
              <h3 className="text-13 font-semibold text-ink-0">Supplier Risk Table</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-12">
                <thead>
                  <tr className="border-b border-hair bg-bg-1">
                    <th className="text-left px-4 py-2.5 text-11 uppercase tracking-wide-3 text-ink-3 font-semibold">Supplier</th>
                    <th className="text-left px-4 py-2.5 text-11 uppercase tracking-wide-3 text-ink-3 font-semibold">Country</th>
                    <th className="text-left px-4 py-2.5 text-11 uppercase tracking-wide-3 text-ink-3 font-semibold">Risk Tier</th>
                    <th className="text-left px-4 py-2.5 text-11 uppercase tracking-wide-3 text-ink-3 font-semibold">Sanctions</th>
                    <th className="text-left px-4 py-2.5 text-11 uppercase tracking-wide-3 text-ink-3 font-semibold">Specific Risks</th>
                    <th className="text-left px-4 py-2.5 text-11 uppercase tracking-wide-3 text-ink-3 font-semibold">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair">
                  {result.tier1Risk.map((s, i) => (
                    <tr key={i} className="hover:bg-bg-1 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink-0">{s.name}</td>
                      <td className="px-4 py-3 font-mono text-ink-2">{s.country}</td>
                      <td className="px-4 py-3"><RiskBadge level={s.riskTier} /></td>
                      <td className="px-4 py-3">
                        {s.sanctionsExposure ? (
                          <span className="text-red font-semibold">Yes ⚠</span>
                        ) : (
                          <span className="text-ink-3">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {s.specificRisks.map((r, j) => <span key={j} className="text-11 text-ink-1">• {r}</span>)}
                          {s.environmentalFlags?.map((f, j) => <span key={j} className="text-11 text-green">• {f}</span>)}
                          {s.labourFlags?.map((f, j) => <span key={j} className="text-11 text-orange">• {f}</span>)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-11 text-ink-1 max-w-[200px] leading-relaxed">{s.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Geographic map */}
          {mapResult && mapResult.countryRiskSummary.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <GeographicMap countryRiskSummary={mapResult.countryRiskSummary} />
            </div>
          )}

          {/* 4 risk dimension cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Sanctions */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-16">🚫</span>
                <h3 className="text-13 font-semibold text-ink-0">Sanctions Exposure</h3>
                <div className="ml-auto"><RiskBadge level={result.sanctionsExposure.level} /></div>
              </div>
              <p className="text-12 text-ink-1 leading-relaxed">{result.sanctionsExposure.details}</p>
              {result.sanctionsExposure.sanctionedJurisdictions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {result.sanctionsExposure.sanctionedJurisdictions.map((j) => (
                    <span key={j} className="text-10 bg-red/10 text-red border border-red/20 rounded px-1.5 py-0.5">{j}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Environmental */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-16">🌿</span>
                <h3 className="text-13 font-semibold text-ink-0">Environmental Crime Risk</h3>
                <div className="ml-auto"><RiskBadge level={result.environmentalCrimeRisk.level} /></div>
              </div>
              <p className="text-12 text-ink-1 leading-relaxed">{result.environmentalCrimeRisk.details}</p>
              <div className="mt-2 flex gap-3 text-11 text-ink-2 font-mono">
                <span className={result.environmentalCrimeRisk.conflictMinerals ? "text-red font-semibold" : ""}>
                  {result.environmentalCrimeRisk.conflictMinerals ? "⚠ Conflict minerals" : "✓ No conflict minerals"}
                </span>
                <span className={result.environmentalCrimeRisk.illegalTimber ? "text-red font-semibold" : ""}>
                  {result.environmentalCrimeRisk.illegalTimber ? "⚠ Illegal timber" : "✓ No illegal timber"}
                </span>
                <span className={result.environmentalCrimeRisk.illegalGold ? "text-red font-semibold" : ""}>
                  {result.environmentalCrimeRisk.illegalGold ? "⚠ Illegal gold" : "✓ No illegal gold"}
                </span>
              </div>
            </div>

            {/* Labour */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-16">👷</span>
                <h3 className="text-13 font-semibold text-ink-0">Labour Exploitation Risk</h3>
                <div className="ml-auto"><RiskBadge level={result.labourRisk.level} /></div>
              </div>
              <p className="text-12 text-ink-1 leading-relaxed">{result.labourRisk.details}</p>
              <div className="mt-2 flex gap-3 text-11 text-ink-2 font-mono">
                <span className={result.labourRisk.forcedLabourRisk ? "text-red font-semibold" : ""}>
                  {result.labourRisk.forcedLabourRisk ? "⚠ Forced labour" : "✓ No forced labour"}
                </span>
                <span className={result.labourRisk.childLabourRisk ? "text-red font-semibold" : ""}>
                  {result.labourRisk.childLabourRisk ? "⚠ Child labour" : "✓ No child labour"}
                </span>
              </div>
              {result.labourRisk.forcedLabourCountries?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {result.labourRisk.forcedLabourCountries.map((c) => (
                    <span key={c} className="text-10 bg-orange/10 text-orange border border-orange/20 rounded px-1.5 py-0.5">{c}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Corruption */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-16">🏛️</span>
                <h3 className="text-13 font-semibold text-ink-0">Corruption Risk</h3>
                <div className="ml-auto"><RiskBadge level={result.corruptionRisk.level} /></div>
              </div>
              <p className="text-12 text-ink-1 leading-relaxed">{result.corruptionRisk.details}</p>
              {result.corruptionRisk.highCPIJurisdictions?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {result.corruptionRisk.highCPIJurisdictions.map((j) => (
                    <span key={j} className="text-10 bg-amber/10 text-amber border border-amber/20 rounded px-1.5 py-0.5">{j}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Compliance gaps */}
          {result.complianceGaps.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-hair-2">
                <h3 className="text-13 font-semibold text-ink-0">Compliance Gaps</h3>
              </div>
              <div className="divide-y divide-hair">
                {result.complianceGaps.map((g, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <RiskBadge level={g.severity} />
                    <div className="flex-1 min-w-0">
                      <div className="text-12 font-semibold text-ink-0 mb-0.5">{g.regulation}</div>
                      <div className="text-12 text-ink-1">{g.gap}</div>
                    </div>
                    {g.deadline && (
                      <span className="shrink-0 text-11 font-mono text-ink-3">Due: {g.deadline}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regulatory obligations */}
          {result.regulatoryObligations.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <h3 className="text-13 font-semibold text-ink-0 mb-3">Regulatory Obligations</h3>
              <div className="space-y-2">
                {result.regulatoryObligations.map((o, i) => (
                  <div key={i} className="flex items-start gap-3 text-12">
                    <span className="text-brand font-bold shrink-0">§</span>
                    <div>
                      <span className="font-semibold text-ink-0">{o.regulation}: </span>
                      <span className="text-ink-1">{o.obligation}</span>
                      {o.deadline && <span className="ml-2 text-ink-3 font-mono text-11">({o.deadline})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action plan */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <h3 className="text-13 font-semibold text-ink-0 mb-4">Action Plan</h3>
            <div className="space-y-3">
              {result.actionPlan.map((step) => {
                const stepColor =
                  step.priority === "immediate" ? "bg-red text-white"
                  : step.priority === "short-term" ? "bg-orange text-white"
                  : "bg-amber text-white";
                return (
                  <div key={step.step} className="flex items-start gap-3">
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-11 font-bold ${stepColor}`}>
                      {step.step}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-12 font-semibold text-ink-0">{step.action}</span>
                      </div>
                      <div className="flex gap-4 text-11 text-ink-3 font-mono">
                        <span>Owner: {step.owner}</span>
                        {step.deadline && <span>Deadline: {step.deadline}</span>}
                        <span className="capitalize">{step.priority}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
