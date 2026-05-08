"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { RegChangeResult, RegChange } from "@/app/api/reg-change/route";
import type { ImpactAssessmentResult } from "@/app/api/reg-change/impact/route";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const INSTITUTION_TYPES = ["Bank", "DPMS", "VASP", "Insurance", "Asset Manager", "Payment Institution", "Other"] as const;

const ALL_JURISDICTIONS = [
  "UAE", "EU", "UK", "US", "Singapore", "Hong Kong", "Switzerland", "Cayman Islands", "BVI", "Bahrain", "Saudi Arabia", "Qatar",
] as const;

const IMPACT_COLORS: Record<string, string> = {
  critical: "bg-red/10 text-red border border-red/30",
  high: "bg-orange/10 text-orange border border-orange/30",
  medium: "bg-amber/10 text-amber border border-amber/30",
  low: "bg-green-dim text-green border border-green/20",
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  new: "bg-brand/10 text-brand border border-brand/20",
  amendment: "bg-amber/10 text-amber border border-amber/20",
  repeal: "bg-red/10 text-red border border-red/20",
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function ImpactBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-semibold uppercase tracking-wide-3 ${IMPACT_COLORS[level] ?? "bg-bg-2 text-ink-2 border border-hair"}`}>
      {level === "critical" ? "🔴" : level === "high" ? "🟡" : level === "medium" ? "🟢" : "⚪"}
      {level}
    </span>
  );
}

function ChangeTypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-3 ${CHANGE_TYPE_COLORS[type] ?? "bg-bg-2 text-ink-2 border border-hair"}`}>
      {type}
    </span>
  );
}

function Chip({ label, tone = "default" }: { label: string; tone?: "blue" | "purple" | "default" }) {
  const cls =
    tone === "blue" ? "bg-brand/8 text-brand border border-brand/15"
    : tone === "purple" ? "bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/20"
    : "bg-bg-2 text-ink-2 border border-hair";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-11 ${cls}`}>{label}</span>
  );
}

// ──────────────────────────────────────────────
// Days to deadline
// ──────────────────────────────────────────────
function daysTo(dateStr: string): number | null {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 86400));
  } catch (err) {
    console.warn("[hawkeye] reg-change daysTo parse failed:", dateStr, err);
    return null;
  }
}

// ──────────────────────────────────────────────
// Traffic light summary
// ──────────────────────────────────────────────
function TrafficLightSummary({ changes }: { changes: RegChange[] }) {
  const critical = changes.filter((c) => c.impactLevel === "critical").length;
  const high = changes.filter((c) => c.impactLevel === "high").length;
  const medLow = changes.filter((c) => c.impactLevel === "medium" || c.impactLevel === "low").length;

  return (
    <div className="flex gap-4 mb-6">
      <div className="flex items-center gap-3 bg-red/8 border border-red/25 rounded-lg px-5 py-3">
        <span className="text-24">🔴</span>
        <div>
          <div className="font-mono text-28 font-bold text-red">{critical}</div>
          <div className="text-11 uppercase tracking-wide-3 text-ink-2 font-medium">Critical</div>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-amber/8 border border-amber/25 rounded-lg px-5 py-3">
        <span className="text-24">🟡</span>
        <div>
          <div className="font-mono text-28 font-bold text-amber">{high}</div>
          <div className="text-11 uppercase tracking-wide-3 text-ink-2 font-medium">High</div>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-green-dim border border-green/20 rounded-lg px-5 py-3">
        <span className="text-24">🟢</span>
        <div>
          <div className="font-mono text-28 font-bold text-green">{medLow}</div>
          <div className="text-11 uppercase tracking-wide-3 text-ink-2 font-medium">Medium / Low</div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Impact deep-dive panel
// ──────────────────────────────────────────────
function ImpactPanel({
  regulation,
  institution,
  onClose,
}: {
  regulation: string;
  institution: { type: string; jurisdictions: string[]; products: string[]; clientTypes: string[] };
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ImpactAssessmentResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reg-change/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regulation, institution }),
      });
      if (!res.ok) {
        console.error(`[hawkeye] reg-change/impact HTTP ${res.status}`);
        return;
      }
      const d = (await res.json()) as ImpactAssessmentResult;
      setData(d);
    } catch (err) {
      console.error("[hawkeye] reg-change/impact threw:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-bg-panel border border-hair-2 rounded-xl shadow-2xl p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-15 font-semibold text-ink-0 mb-2">Deep-Dive Impact Assessment</h3>
          <p className="text-13 text-ink-1 mb-4">{regulation}</p>
          <button
            type="button"
            onClick={load}
            className="w-full px-4 py-2.5 bg-brand text-white text-13 font-semibold rounded hover:bg-brand/90"
          >
            Generate Impact Assessment
          </button>
          <button type="button" onClick={onClose} className="mt-2 w-full text-12 text-ink-3 hover:text-ink-1">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-bg-panel border border-hair-2 rounded-xl p-8 flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
          <span className="text-13 text-ink-1">Generating impact assessment…</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-bg-panel border border-hair-2 rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-11 uppercase tracking-wide-3 text-ink-3 mb-1 font-mono">Impact Assessment</div>
            <h3 className="text-15 font-semibold text-ink-0">{data.regulation}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink-0 text-20 leading-none ml-4">×</button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <ImpactBadge level={data.overallImpact} />
          <span className="font-mono text-13 text-ink-2">Impact score: <strong className="text-ink-0">{data.impactScore}/100</strong></span>
        </div>

        <p className="text-13 text-ink-1 leading-relaxed mb-4 border-l-2 border-brand pl-3">{data.executiveSummary}</p>

        {/* Key obligations */}
        <h4 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Key Obligations</h4>
        <div className="space-y-2 mb-4">
          {data.keyObligations.map((o, i) => (
            <div key={i} className="bg-bg-1 border border-hair rounded p-3">
              <div className="flex items-start gap-2">
                <span className={`text-10 px-1.5 py-0.5 rounded font-semibold capitalize ${
                  o.complexity === "high" ? "bg-red/10 text-red"
                  : o.complexity === "medium" ? "bg-amber/10 text-amber"
                  : "bg-green-dim text-green"
                }`}>{o.complexity}</span>
                <div className="flex-1">
                  <div className="text-12 font-medium text-ink-0">{o.obligation}</div>
                  <div className="text-11 text-ink-3 font-mono mt-0.5">Deadline: {o.deadline} · Owner: {o.owner}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Gaps */}
        {data.gaps.length > 0 && (
          <>
            <h4 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Gaps to Remediate</h4>
            <div className="space-y-1 mb-4">
              {data.gaps.map((g, i) => (
                <div key={i} className="text-12 text-ink-1 flex items-start gap-2">
                  <span className="text-red shrink-0">×</span>{g}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Quick wins */}
        {data.quickWins.length > 0 && (
          <>
            <h4 className="text-12 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Quick Wins</h4>
            <div className="space-y-1 mb-4">
              {data.quickWins.map((q, i) => (
                <div key={i} className="text-12 text-ink-1 flex items-start gap-2">
                  <span className="text-green shrink-0">✓</span>{q}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="text-11 text-ink-3">
          Est. cost: {data.businessImpact.estimatedCost} · Implementation: {data.businessImpact.implementationMonths} months
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function RegChangePage() {
  const [institutionType, setInstitutionType] = useState("Bank");
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState("");
  const [clientDraft, setClientDraft] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegChangeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impactRegulation, setImpactRegulation] = useState<string | null>(null);

  const institution = {
    type: institutionType,
    jurisdictions: selectedJurisdictions,
    products,
    clientTypes,
  };

  const toggleJurisdiction = (j: string) => {
    setSelectedJurisdictions((prev) =>
      prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j]
    );
  };

  const addProduct = () => {
    const t = productDraft.trim();
    if (t && !products.includes(t)) setProducts([...products, t]);
    setProductDraft("");
  };

  const addClientType = () => {
    const t = clientDraft.trim();
    if (t && !clientTypes.includes(t)) setClientTypes([...clientTypes, t]);
    setClientDraft("");
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reg-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution }),
      });
      const d = (await res.json()) as RegChangeResult;
      setResult(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Derived KPIs
  const totalChanges = result?.totalChanges ?? 0;
  const criticalCount = result?.criticalCount ?? 0;
  const jurisdictionsCount = selectedJurisdictions.length;

  // Days to nearest deadline
  const nearestDeadlineDays = result
    ? result.upcomingChanges
        .map((c) => daysTo(c.effectiveDate))
        .filter((d): d is number => d !== null && d > 0)
        .sort((a, b) => a - b)[0] ?? null
    : null;

  const exportPDF = () => {
    window.print();
  };

  // Sorted changes by effective date
  const sortedChanges = result
    ? [...result.upcomingChanges].sort(
        (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
      )
    : [];

  return (
    <ModuleLayout engineLabel="Regulatory change engine" asanaModule="reg-change" asanaLabel="Regulatory Change Manager">
      <ModuleHero
        eyebrow="Compliance · Regulatory Intelligence · Change Management"
        title="Regulatory"
        titleEm="changes."
        moduleNumber={43}
        kpis={[
          { value: String(totalChanges), label: "Changes tracked" },
          { value: String(criticalCount), label: "Critical upcoming", tone: criticalCount > 0 ? "red" : undefined },
          { value: String(jurisdictionsCount), label: "Jurisdictions covered" },
          {
            value: nearestDeadlineDays !== null ? `${nearestDeadlineDays}d` : "—",
            label: "Days to next deadline",
            tone: nearestDeadlineDays !== null && nearestDeadlineDays < 30 ? "orange" : undefined,
          },
        ]}
        intro="Track, analyse and roadmap all material regulatory changes across your jurisdictions and product set. Generate AI-powered implementation roadmaps with month-by-month action calendars."
      />

      {/* ── Institution setup ── */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 mb-6">
        <h2 className="text-14 font-semibold text-ink-0 mb-4">Institution Setup</h2>

        {/* Institution type */}
        <div className="mb-4">
          <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Institution Type</label>
          <div className="flex flex-wrap gap-2">
            {INSTITUTION_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setInstitutionType(t)}
                className={`px-3 py-1.5 rounded text-12 font-medium border transition-colors ${
                  institutionType === t
                    ? "bg-brand text-white border-brand"
                    : "bg-bg-1 text-ink-1 border-hair-2 hover:border-brand/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Jurisdictions */}
        <div className="mb-4">
          <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Jurisdictions (multi-select)</label>
          <div className="flex flex-wrap gap-2">
            {ALL_JURISDICTIONS.map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => toggleJurisdiction(j)}
                className={`px-2.5 py-1 rounded text-12 font-medium border transition-colors ${
                  selectedJurisdictions.includes(j)
                    ? "bg-brand/10 text-brand border-brand/30"
                    : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand/30"
                }`}
              >
                {j}
              </button>
            ))}
          </div>
        </div>

        {/* Products + client types */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1.5">Products / Services</label>
            <div className="flex gap-2 mb-2">
              <input
                value={productDraft}
                onChange={(e) => setProductDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProduct(); } }}
                placeholder="e.g. Gold trading, Crypto custody"
                className="flex-1 bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-13 text-ink-0 outline-none focus:border-brand"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {products.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 bg-bg-2 border border-hair rounded px-2 py-0.5 text-12 text-ink-1">
                  {p}
                  <button type="button" onClick={() => setProducts(products.filter((x) => x !== p))} className="text-ink-3 hover:text-red text-11">×</button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1.5">Client Types</label>
            <div className="flex gap-2 mb-2">
              <input
                value={clientDraft}
                onChange={(e) => setClientDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClientType(); } }}
                placeholder="e.g. Retail, Corporate, PEP"
                className="flex-1 bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-13 text-ink-0 outline-none focus:border-brand"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {clientTypes.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 bg-bg-2 border border-hair rounded px-2 py-0.5 text-12 text-ink-1">
                  {c}
                  <button type="button" onClick={() => setClientTypes(clientTypes.filter((x) => x !== c))} className="text-ink-3 hover:text-red text-11">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-13 font-semibold rounded hover:bg-brand/90 disabled:opacity-40 transition-colors"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating roadmap…
            </>
          ) : (
            "📋 Generate Regulatory Roadmap"
          )}
        </button>
        {error && <p className="mt-2 text-12 text-red">{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="space-y-6">
          {/* Traffic light summary */}
          <TrafficLightSummary changes={result.upcomingChanges} />

          {/* Immediate actions */}
          {result.immediateActions.length > 0 && (
            <div className="bg-red/5 border border-red/20 rounded-lg p-4">
              <h3 className="text-12 font-semibold uppercase tracking-wide-3 text-red mb-3">⚡ Immediate Actions (Due within 30 days)</h3>
              <div className="space-y-1.5">
                {result.immediateActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-13 text-ink-0">
                    <span className="text-red shrink-0 font-bold">!</span>
                    {a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regulatory timeline */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-hair-2 flex items-center justify-between">
              <h3 className="text-13 font-semibold text-ink-0">Upcoming Regulatory Changes — Timeline</h3>
              <span className="text-11 text-ink-3 font-mono">{sortedChanges.length} changes · sorted by effective date</span>
            </div>
            <div className="divide-y divide-hair">
              {sortedChanges.map((c, i) => {
                const days = daysTo(c.effectiveDate);
                const overdue = days !== null && days < 0;
                const urgent = days !== null && days >= 0 && days <= 30;
                return (
                  <div key={i} className={`px-5 py-4 ${overdue ? "bg-red/3" : urgent ? "bg-amber/3" : ""}`}>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-13 font-semibold text-ink-0">{c.regulation}</span>
                          <ImpactBadge level={c.impactLevel} />
                          <ChangeTypeBadge type={c.changeType} />
                        </div>
                        <div className="flex items-center gap-3 text-11 font-mono text-ink-3 mb-2">
                          <span>{c.jurisdiction}</span>
                          <span>·</span>
                          <span className={overdue ? "text-red font-semibold" : urgent ? "text-amber font-semibold" : ""}>
                            {c.effectiveDate}
                            {days !== null && (
                              <span className="ml-1">
                                {overdue ? `(${Math.abs(days)}d overdue)` : `(${days}d)`}
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="text-12 text-ink-1 leading-relaxed mb-2">{c.summary}</p>
                        {/* Affected products / client chips */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {c.affectedProducts.map((p) => <Chip key={p} label={p} tone="blue" />)}
                          {c.affectedClientTypes.map((t) => <Chip key={t} label={t} tone="purple" />)}
                        </div>
                        {/* Required actions */}
                        {c.requiredActions.length > 0 && (
                          <details className="group">
                            <summary className="cursor-pointer text-11 text-brand font-semibold list-none flex items-center gap-1">
                              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                              {c.requiredActions.length} required action{c.requiredActions.length !== 1 ? "s" : ""}
                            </summary>
                            <ul className="mt-1.5 pl-3 space-y-0.5">
                              {c.requiredActions.map((a, j) => (
                                <li key={j} className="text-12 text-ink-1 flex items-start gap-1.5">
                                  <span className="text-brand shrink-0">→</span>{a}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setImpactRegulation(c.regulation)}
                        className="shrink-0 text-11 font-semibold text-brand border border-brand/25 rounded px-2.5 py-1 hover:bg-brand/8 transition-colors whitespace-nowrap"
                      >
                        Deep dive ↗
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compliance roadmap — month-by-month calendar */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-13 font-semibold text-ink-0">Compliance Roadmap</h3>
              <button
                type="button"
                onClick={exportPDF}
                className="text-11 font-mono px-3 py-1.5 rounded border font-semibold"
                style={{ color: "#7c3aed", borderColor: "#7c3aed", background: "rgba(124,58,237,0.07)" }}
              >
                PDF
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:grid-cols-3">
              {result.complianceRoadmap.map((m) => (
                <div key={m.month} className="bg-bg-1 border border-hair rounded-lg p-3">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-2 font-mono">{m.month}</div>
                  <ul className="space-y-1">
                    {m.actions.map((a, i) => (
                      <li key={i} className="text-11 text-ink-1 flex items-start gap-1.5">
                        <span className="text-brand shrink-0 text-10 mt-0.5">▸</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Impact deep-dive modal */}
      {impactRegulation && (
        <ImpactPanel
          regulation={impactRegulation}
          institution={institution}
          onClose={() => setImpactRegulation(null)}
        />
      )}
    </ModuleLayout>
  );
}
