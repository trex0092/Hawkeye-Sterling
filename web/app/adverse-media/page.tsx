"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

type RiskTier = "clear" | "low" | "medium" | "high" | "critical";

interface AdverseMediaFinding {
  itemId: string;
  title: string;
  source: string;
  published: string;
  url?: string;
  severity: "critical" | "high" | "medium" | "low" | "clear";
  categories: string[];
  keywords: string[];
  fatfRecommendations: string[];
  fatfPredicates: string[];
  reasoningModes: string[];
  narrative: string;
  relevanceScore: number;
  isSarCandidate: boolean;
}

interface AdverseMediaVerdict {
  subject: string;
  riskTier: RiskTier;
  riskDetail: string;
  totalItems: number;
  adverseItems: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  sarRecommended: boolean;
  sarBasis: string;
  confidenceTier: "high" | "medium" | "low";
  confidenceBasis: string;
  counterfactual: string;
  investigationLines: string[];
  findings: AdverseMediaFinding[];
  fatfRecommendations: string[];
  categoryBreakdown: Array<{ categoryId: string; displayName: string; count: number; severity: string }>;
  analysedAt: string;
  modesCited: string[];
}

interface ApiResponse {
  ok: boolean;
  totalCount?: number;
  adverseCount?: number;
  highRelevanceCount?: number;
  verdict?: AdverseMediaVerdict;
  error?: string;
}

const TIER_STYLE: Record<RiskTier, string> = {
  critical: "bg-red-700 text-white",
  high: "bg-red-100 text-red-800 border border-red-300",
  medium: "bg-orange-100 text-orange-800 border border-orange-300",
  low: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  clear: "bg-green-100 text-green-800 border border-green-300",
};

const SEV_STYLE: Record<string, string> = {
  critical: "bg-red-700 text-white",
  high: "bg-red-100 text-red-800",
  medium: "bg-orange-100 text-orange-700",
  low: "bg-yellow-100 text-yellow-700",
  clear: "bg-green-100 text-green-700",
};

function TierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded uppercase tracking-wide ${TIER_STYLE[tier]}`}>
      {tier}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colours: Record<string, string> = {
    critical: "bg-red-600", high: "bg-red-400", medium: "bg-orange-400", low: "bg-yellow-400", clear: "bg-green-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${colours[severity] ?? "bg-gray-300"}`} />;
}

export default function AdverseMediaPage() {
  const [subject, setSubject] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

  async function search() {
    if (!subject.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const body: Record<string, unknown> = { subject: subject.trim(), limit: 50 };
      if (dateFrom) body.dateFrom = dateFrom;
      const res = await fetch("/api/adverse-media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as ApiResponse;
      if (!data.ok) setError(data.error ?? "Search failed");
      else setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  const verdict = result?.verdict;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Adverse Media Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">
            Weaponized MLRO pipeline — Taranis AI feed → 1 066-keyword taxonomy → FATF predicate mapping → SAR trigger (R.20) → investigation narrative.
          </p>
        </div>

        {/* Search bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex gap-3 flex-wrap">
            <input
              className="flex-1 min-w-48 border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Subject name — individual, company, or vessel"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <input
              type="date"
              className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-600"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date (optional)"
            />
            <button
              onClick={search}
              disabled={loading || !subject.trim()}
              className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-4">{error}</div>
        )}

        {verdict && (
          <div className="space-y-4">
            {/* Risk verdict card */}
            <div className={`rounded-lg border-2 p-5 ${verdict.riskTier === "critical" ? "border-red-600 bg-red-50" : verdict.riskTier === "high" ? "border-red-300 bg-red-50" : verdict.riskTier === "medium" ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-white"}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{verdict.subject}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{verdict.riskDetail}</p>
                </div>
                <TierBadge tier={verdict.riskTier} />
              </div>

              {/* Counts grid */}
              <div className="grid grid-cols-5 gap-3 mb-4">
                {[
                  { label: "Total Items", value: verdict.totalItems, cls: "text-gray-700" },
                  { label: "Adverse", value: verdict.adverseItems, cls: "text-gray-700" },
                  { label: "Critical", value: verdict.criticalCount, cls: "text-red-700" },
                  { label: "High", value: verdict.highCount, cls: "text-red-600" },
                  { label: "Medium", value: verdict.mediumCount, cls: "text-orange-600" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-white rounded border border-gray-100 p-2 text-center">
                    <div className={`text-xl font-bold ${cls}`}>{value}</div>
                    <div className="text-xs text-gray-400">{label}</div>
                  </div>
                ))}
              </div>

              {/* SAR banner */}
              {verdict.sarRecommended && (
                <div className="bg-red-700 text-white rounded p-3 mb-3 text-sm">
                  <span className="font-bold">SAR RECOMMENDED (FATF R.20)</span>
                  <p className="mt-1 text-red-100 text-xs leading-relaxed">{verdict.sarBasis}</p>
                </div>
              )}

              {/* FATF refs */}
              {verdict.fatfRecommendations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {verdict.fatfRecommendations.map((r) => (
                    <span key={r} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-mono">{r}</span>
                  ))}
                </div>
              )}

              {/* Confidence */}
              <p className="text-xs text-gray-500">
                Confidence: <span className="font-medium text-gray-700">{verdict.confidenceTier.toUpperCase()}</span> — {verdict.confidenceBasis}
              </p>
            </div>

            {/* Investigation lines */}
            {verdict.investigationLines.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Investigation Actions</h3>
                <ol className="space-y-1.5">
                  {verdict.investigationLines.map((line, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-gray-400 font-mono text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Category breakdown */}
            {verdict.categoryBreakdown.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Category Breakdown</h3>
                <div className="space-y-2">
                  {verdict.categoryBreakdown.map((c) => (
                    <div key={c.categoryId} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{c.displayName}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEV_STYLE[c.severity] ?? "bg-gray-100 text-gray-600"}`}>{c.severity}</span>
                        <span className="text-xs font-bold text-gray-500 w-4 text-right">{c.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Counterfactual */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-800 mb-1">Counterfactual Assessment</p>
              <p className="text-xs text-amber-700 leading-relaxed">{verdict.counterfactual}</p>
            </div>

            {/* Findings list */}
            {verdict.findings.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Adverse Findings ({verdict.findings.length})</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {verdict.findings.map((f) => (
                    <div key={f.itemId} className="p-4">
                      <div
                        className="flex items-start gap-3 cursor-pointer"
                        onClick={() => setExpandedFinding(expandedFinding === f.itemId ? null : f.itemId)}
                      >
                        <SeverityDot severity={f.severity} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${SEV_STYLE[f.severity]}`}>{f.severity.toUpperCase()}</span>
                            {f.isSarCandidate && <span className="text-xs bg-red-700 text-white px-1.5 py-0.5 rounded font-bold">SAR</span>}
                            <span className="text-xs text-gray-400">{f.source} · {f.published.slice(0, 10)}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 mt-1 leading-snug">{f.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.narrative}</p>
                        </div>
                        <span className="text-gray-300 text-xs flex-shrink-0">{expandedFinding === f.itemId ? "▲" : "▼"}</span>
                      </div>

                      {expandedFinding === f.itemId && (
                        <div className="mt-3 pl-5 space-y-2 border-l-2 border-gray-100">
                          {f.fatfPredicates.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 font-medium mb-1">FATF Predicates</p>
                              <ul className="space-y-0.5">
                                {f.fatfPredicates.map((p, i) => <li key={i} className="text-xs text-gray-600">{p}</li>)}
                              </ul>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {f.categories.map((c) => <span key={c} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c}</span>)}
                            {f.fatfRecommendations.map((r) => <span key={r} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded font-mono">{r}</span>)}
                          </div>
                          {f.keywords.length > 0 && (
                            <p className="text-xs text-gray-400">Keywords: {f.keywords.slice(0, 6).map((k) => `"${k}"`).join(", ")}</p>
                          )}
                          {f.url && (
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">{f.url}</a>
                          )}
                          <p className="text-xs text-gray-400">Relevance: {(f.relevanceScore * 100).toFixed(0)}%</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verdict.modesCited.length > 0 && (
              <div className="text-xs text-gray-400 leading-relaxed">
                Modes cited: {verdict.modesCited.join(", ")}
              </div>
            )}
          </div>
        )}

        {result?.ok && !verdict?.findings.length && !loading && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
            No adverse media found for <span className="font-medium text-gray-600">{subject}</span>
          </div>
        )}
      </main>
    </div>
  );
}
