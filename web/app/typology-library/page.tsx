"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { TypologyResult, TypologySearchResponse } from "@/app/api/typology-library/search/route";
import type { TypologyDetailResult } from "@/app/api/typology-library/detail/route";

// FIU 2025 DPMS typology coverage matrix types (mirrors /api/fiu-typology-check)
interface FiuTypologyEntry {
  id: string;
  title: string;
  description: string;
  riskRating: "critical" | "high" | "medium";
  redFlags: string[];
  fatfRecommendations: string[];
  mappedBrainModes: string[];
  coverageGaps: string[];
  reportSection: string;
}

interface FiuCoverageResponse {
  typologies: FiuTypologyEntry[];
  overallCoverage: number;
  fullyCoveredCount: number;
  partiallyCoveredCount: number;
  uncoveredCount: number;
  generatedAt: string;
}

const FIU_RISK_CFG = {
  critical: { cls: "bg-red-dim text-red border-red/20", label: "CRITICAL" },
  high: { cls: "bg-orange-dim text-orange border-orange/20", label: "HIGH" },
  medium: { cls: "bg-amber-dim text-amber border-amber/20", label: "MEDIUM" },
};

function FiuTypologyCard({ t }: { t: FiuTypologyEntry }) {
  const [open, setOpen] = useState(false);
  const cfg = FIU_RISK_CFG[t.riskRating];
  const hasCoverage = t.mappedBrainModes.length > 0;
  const hasGaps = t.coverageGaps.length > 0;
  return (
    <div className={`border rounded-lg bg-bg-panel transition-colors ${open ? "border-brand/30" : "border-hair hover:border-brand/20"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-mono font-semibold uppercase tracking-wide border ${cfg.cls}`}>
              {cfg.label}
            </span>
            <span className="font-mono text-10 text-ink-3 px-1.5 py-0.5 rounded bg-bg-2 border border-hair">{t.reportSection}</span>
            {hasCoverage ? (
              <span className="text-10 font-mono text-green px-1.5 py-0.5 rounded bg-green-dim border border-green/20">
                ✓ {t.mappedBrainModes.length} mode{t.mappedBrainModes.length !== 1 ? "s" : ""} mapped
              </span>
            ) : (
              <span className="text-10 font-mono text-red px-1.5 py-0.5 rounded bg-red-dim border border-red/20">
                ✗ No coverage
              </span>
            )}
          </div>
          <div className="font-semibold text-13 text-ink-0 leading-snug">{t.title}</div>
          <p className="text-11.5 text-ink-2 mt-0.5 line-clamp-2">{t.description}</p>
        </div>
        <span className="text-ink-3 font-mono text-11 shrink-0 mt-0.5">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-hair">
          <div className="pt-3">
            <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-1.5">Red Flags (FIU 2025)</div>
            <div className="space-y-1">
              {t.redFlags.map((f, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-red text-10 shrink-0 mt-0.5">▲</span>
                  <span className="text-11.5 text-ink-1">{f}</span>
                </div>
              ))}
            </div>
          </div>
          {t.mappedBrainModes.length > 0 && (
            <div>
              <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-1.5">Brain Modes — Covered</div>
              <div className="flex flex-wrap gap-1.5">
                {t.mappedBrainModes.map((m) => (
                  <span key={m} className="font-mono text-10 px-2 py-0.5 rounded bg-green-dim text-green border border-green/20">{m}</span>
                ))}
              </div>
            </div>
          )}
          {hasGaps && (
            <div>
              <div className="font-mono text-10 uppercase tracking-wide text-red mb-1.5">Coverage Gaps</div>
              <div className="space-y-0.5">
                {t.coverageGaps.map((g, i) => (
                  <div key={i} className="text-11 text-ink-1">
                    <span className="text-red mr-1">•</span>{g}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-1.5">FATF Recommendations</div>
            <div className="flex flex-wrap gap-1.5">
              {t.fatfRecommendations.map((r) => (
                <span key={r} className="font-mono text-10 px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">{r}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FiuDpmsSection() {
  const [data, setData] = useState<FiuCoverageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchMatrix = async () => {
    if (data) { setOpen(true); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fiu-typology-check");
      if (!res.ok) { setError(`Failed to load coverage matrix (HTTP ${res.status})`); return; }
      const json = (await res.json()) as FiuCoverageResponse;
      setData(json);
      setOpen(true);
    } catch {
      setError("Network error — could not load FIU coverage matrix.");
    } finally {
      setLoading(false);
    }
  };

  const coveragePct = data?.overallCoverage ?? 0;
  const barCls = coveragePct >= 80 ? "bg-green" : coveragePct >= 50 ? "bg-amber" : "bg-red";

  return (
    <section className="mt-10 border border-brand/20 rounded-xl bg-bg-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 bg-brand-dim border-b border-brand/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-10 font-bold uppercase tracking-wide-4 text-brand">FIU Strategic Analysis — Sept 2025</span>
            <span className="font-mono text-10 px-2 py-px rounded bg-brand/20 text-brand border border-brand/30">FATF 5th Round IO.6</span>
          </div>
          <h2 className="font-display text-20 font-normal text-ink-0 leading-tight">
            DPMS Typology <em className="italic text-brand">Alignment.</em>
          </h2>
          <p className="text-12 text-ink-2 mt-1 max-w-2xl">
            The UAE FIU published a Strategic Analysis Report on Misuse of Precious Metals and Stones in Financial Crime (September 2025). All 9 DPMS-specific typologies are mapped against Hawkeye Sterling brain modes. FATF 5th Round IO.6 assessors will verify this alignment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchMatrix()}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? <><span className="animate-spin font-mono">◌</span> Loading…</> : open ? "Hide matrix ▾" : "Show coverage matrix ▸"}
        </button>
      </div>

      {/* Coverage bar summary (shown after load) */}
      {data && (
        <div className="px-5 py-3 border-b border-hair bg-bg-1 flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-10 text-ink-3 uppercase tracking-wide">Overall coverage</span>
              <span className={`font-mono text-12 font-bold ${coveragePct >= 80 ? "text-green" : coveragePct >= 50 ? "text-amber" : "text-red"}`}>
                {coveragePct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${coveragePct}%` }} />
            </div>
          </div>
          <div className="flex gap-4 text-11 font-mono">
            <span className="text-green">✓ {data.fullyCoveredCount} full</span>
            <span className="text-amber">◑ {data.partiallyCoveredCount} partial</span>
            <span className="text-red">✗ {data.uncoveredCount} gaps</span>
          </div>
          <span className="text-10 text-ink-3 font-mono">Generated {new Date(data.generatedAt).toLocaleString("en-GB")}</span>
        </div>
      )}

      {error && (
        <div className="px-5 py-3 text-12 text-red border-b border-hair bg-red-dim/20">{error}</div>
      )}

      {/* Typology grid */}
      {open && data && (
        <div className="p-5">
          <div className="grid grid-cols-1 gap-3">
            {data.typologies.map((t) => (
              <FiuTypologyCard key={t.id} t={t} />
            ))}
          </div>
          <p className="mt-4 text-10.5 text-ink-3 leading-relaxed">
            Source: UAE FIU Strategic Analysis — Misuse of Precious Metals and Stones in Financial Crime, September 2025. Brain mode coverage is auto-derived from <code className="font-mono">fiu-dpms-typologies-2025.ts</code>. Coverage gaps indicate areas where new detection modes or enhanced logic may be required ahead of FATF 5th Round IO.6 assessment.
          </p>
        </div>
      )}

      {/* Collapsed placeholder */}
      {!open && !data && !loading && (
        <div className="px-5 py-6 text-center text-12 text-ink-3">
          Click <strong>Show coverage matrix</strong> to load the 9 FIU DPMS typologies and verify brain mode alignment.
        </div>
      )}
    </section>
  );
}

// Module 38 — Typology Library
// Comprehensive AML/CFT typology search engine powered by Claude.

const FILTER_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "trade", label: "Trade" },
  { key: "real-estate", label: "Real Estate" },
  { key: "crypto", label: "Crypto" },
  { key: "corporate", label: "Corporate" },
  { key: "cash", label: "Cash" },
  { key: "professional", label: "Professional" },
  { key: "digital-assets", label: "Digital Assets" },
] as const;

type FilterKey = (typeof FILTER_CATEGORIES)[number]["key"];

const CATEGORY_SECTOR_MAP: Record<FilterKey, string | undefined> = {
  all: undefined,
  trade: "Trade Finance",
  "real-estate": "Real Estate",
  crypto: "Cryptocurrency",
  corporate: "Corporate",
  cash: "Cash-Intensive Business",
  professional: "Professional Services",
  "digital-assets": "Digital Assets",
};

const FEATURED_UAE = [
  { name: "DMCC Gold Trader Over-Invoicing", category: "TBML", risk: "critical" as const },
  { name: "Dubai Luxury Real Estate Shell Purchase", category: "Real Estate", risk: "high" as const },
  { name: "UAE Free Zone Front Company", category: "Corporate", risk: "high" as const },
  { name: "Hawala Network — UAE Remittance", category: "Informal Value Transfer", risk: "high" as const },
  { name: "Crypto ATM Structuring (Dubai)", category: "Crypto", risk: "high" as const },
  { name: "PEP-Linked Property Purchase", category: "Real Estate", risk: "critical" as const },
  { name: "Gold Souk Cash Placement", category: "Cash", risk: "high" as const },
  { name: "DMCC Diamond TBML", category: "TBML", risk: "high" as const },
  { name: "UAE Bank Mirror Trading", category: "Corporate", risk: "high" as const },
  { name: "NFT Wash Trading — UAE Exchange", category: "Digital Assets", risk: "medium" as const },
];

const RISK_CONFIG = {
  low: { label: "LOW", cls: "bg-green-dim text-green border border-green/20" },
  medium: { label: "MEDIUM", cls: "bg-amber-dim text-amber border border-amber/20" },
  high: { label: "HIGH", cls: "bg-orange-dim text-orange border border-orange/20" },
  critical: { label: "CRITICAL", cls: "bg-red-dim text-red border border-red/20" },
};

function RiskBadge({ level }: { level: keyof typeof RISK_CONFIG }) {
  const cfg = RISK_CONFIG[level];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-mono font-semibold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function PhaseChip({ phase }: { phase: string }) {
  const clsMap: Record<string, string> = {
    placement: "bg-red-dim text-red border-red/20",
    layering: "bg-amber-dim text-amber border-amber/20",
    integration: "bg-green-dim text-green border-green/20",
  };
  const cls = clsMap[phase] ?? "bg-bg-2 text-ink-2 border-hair";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-10 font-mono uppercase tracking-wide border ${cls}`}>
      {phase}
    </span>
  );
}

function DeepDiveModal({
  typologyName,
  onClose,
}: {
  typologyName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TypologyDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchDetail = async () => {
    if (fetched) return;
    setLoading(true);
    setDetailError(null);
    try {
      const res = await fetch("/api/typology-library/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typologyName }),
      });
      if (!res.ok) {
        console.error("[hawkeye] typology-library detail fetch HTTP", res.status);
        setDetailError(`Could not load typology detail (HTTP ${res.status}).`);
      } else {
        const json = (await res.json()) as TypologyDetailResult;
        setData(json);
      }
    } catch (err) {
      console.error("[hawkeye] typology-library detail fetch threw:", err);
      setDetailError(`Network error — ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  // Auto-fetch on mount
  if (!fetched && !loading) {
    void fetchDetail();
  }

  const trendIcon = data?.trendDirection === "increasing" ? "↑" : data?.trendDirection === "decreasing" ? "↓" : "→";
  const trendCls =
    data?.trendDirection === "increasing"
      ? "text-red"
      : data?.trendDirection === "decreasing"
        ? "text-green"
        : "text-amber";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 px-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl bg-bg-panel border border-hair rounded-xl shadow-2xl overflow-y-auto max-h-[88vh]">
        {/* Header */}
        <div className="sticky top-0 bg-bg-panel border-b border-hair px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Deep Dive Analysis</div>
            <h2 className="font-display text-24 font-normal text-ink-0 leading-tight">{typologyName}</h2>
            {data && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-12 text-ink-2 font-mono">{data.category}</span>
                <span className={`font-mono text-11 font-semibold ${trendCls}`}>
                  {trendIcon} {data.trendDirection}
                </span>
                <span className="text-11 text-ink-3 font-mono">{data.estimatedGlobalVolume}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded hover:bg-bg-2 text-ink-2 hover:text-ink-0 transition-colors text-16"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full"
                  style={{ animation: "spin 0.8s linear infinite" }}
                />
                <span className="font-mono text-11 text-ink-2 uppercase tracking-wide">Analysing typology…</span>
              </div>
            </div>
          )}

          {detailError && !loading && (
            <div className="mt-3 rounded-lg border border-red/30 bg-red-dim px-4 py-3 flex items-start gap-2">
              <span className="text-red text-14 shrink-0">⚠</span>
              <div>
                <p className="text-12 font-semibold text-red">Error</p>
                <p className="text-11 text-ink-2 mt-0.5">{detailError}</p>
              </div>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-6">
              {/* Description */}
              <section>
                <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-2">Overview</h3>
                <p className="text-ink-1 text-14 leading-relaxed">{data.fullDescription}</p>
              </section>

              {/* Historical Background */}
              <section>
                <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-2">Historical Background</h3>
                <p className="text-ink-1 text-13.5 leading-relaxed">{data.historicalBackground}</p>
              </section>

              {/* ML Process */}
              <section>
                <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-3">Money Laundering Process</h3>
                <div className="space-y-2">
                  {data.mlProcess.map((step) => (
                    <div key={step.step} className="flex gap-3 items-start p-3 rounded-lg bg-bg-1 border border-hair">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center font-mono text-12 font-semibold text-brand">
                          {step.step}
                        </div>
                        <PhaseChip phase={step.phase} />
                      </div>
                      <div>
                        <div className="font-semibold text-12 text-ink-0 mb-0.5">{step.action}</div>
                        <div className="text-12 text-ink-2 leading-relaxed">{step.detail}</div>
                      </div>
                    </div>
                  ))}
                  {/* CSS connector */}
                  <div className="text-center text-ink-3 font-mono text-10 py-1 tracking-widest">
                    ▼ PLACEMENT → LAYERING → INTEGRATION ▼
                  </div>
                </div>
              </section>

              {/* Case Study */}
              <section>
                <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-3">Case Study</h3>
                <div className="rounded-lg border border-amber/30 bg-amber-dim/30 p-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="font-semibold text-13 text-ink-0">{data.caseStudy.title}</div>
                    <div className="flex gap-2 shrink-0">
                      <span className="font-mono text-10 text-amber bg-amber-dim px-2 py-0.5 rounded">{data.caseStudy.jurisdiction}</span>
                      <span className="font-mono text-10 text-ink-3 px-2 py-0.5 rounded bg-bg-2">{data.caseStudy.year}</span>
                    </div>
                  </div>
                  <p className="text-ink-1 text-12.5 leading-relaxed mb-2">{data.caseStudy.summary}</p>
                  <p className="text-ink-0 text-12.5 font-medium mb-2">{data.caseStudy.outcome}</p>
                  <div>
                    <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-1">Lessons Learned</div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {data.caseStudy.lessonsLearned.map((l, i) => (
                        <li key={i} className="text-12 text-ink-1">{l}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* Detection Techniques */}
              <section>
                <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-3">Detection Techniques</h3>
                <div className="space-y-2">
                  {data.detectionTechniques.map((t, i) => {
                    const effCls =
                      t.effectiveness === "high"
                        ? "text-green"
                        : t.effectiveness === "medium"
                          ? "text-amber"
                          : "text-red";
                    return (
                      <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-bg-1 border border-hair">
                        <span className={`font-mono text-10 uppercase font-semibold shrink-0 ${effCls} w-12 text-right`}>
                          {t.effectiveness}
                        </span>
                        <div>
                          <div className="font-medium text-12 text-ink-0">{t.technique}</div>
                          <div className="text-11.5 text-ink-2 mt-0.5">{t.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Related Typologies */}
              <section>
                <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-2">Related Typologies</h3>
                <div className="flex flex-wrap gap-2">
                  {data.relatedTypologies.map((rt) => (
                    <span
                      key={rt}
                      className="px-3 py-1 rounded-full bg-brand/10 border border-brand/20 text-12 text-brand font-medium cursor-pointer hover:bg-brand/20 transition-colors"
                    >
                      {rt}
                    </span>
                  ))}
                </div>
              </section>

              {/* UAE Relevance */}
              <section className="rounded-lg border border-brand/30 bg-brand/5 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-14">🇦🇪</span>
                  <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3">UAE Relevance</h3>
                </div>
                <p className="text-ink-1 text-12.5 leading-relaxed">{data.uaeRelevance}</p>
              </section>

              {/* Regulatory Guidance */}
              <section>
                <h3 className="font-mono text-11 uppercase tracking-wide-4 text-ink-3 mb-3">Regulatory Guidance</h3>
                <div className="space-y-2">
                  {data.regulatoryGuidance.map((rg, i) => (
                    <div key={i} className="p-3 rounded-lg bg-bg-1 border border-hair">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-10 font-semibold text-brand px-1.5 py-0.5 rounded bg-brand/10">{rg.body}</span>
                        <span className="font-mono text-10 text-ink-3">{rg.reference}</span>
                      </div>
                      <p className="text-12 text-ink-1">{rg.requirement}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TypologyCard({
  typology,
  onDeepDive,
}: {
  typology: TypologyResult;
  onDeepDive: (name: string) => void;
}) {
  return (
    <div className="border border-hair rounded-lg p-4 bg-bg-panel hover:border-brand/30 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-10 font-mono uppercase tracking-wide px-2 py-0.5 rounded bg-bg-2 text-ink-2 border border-hair">
              {typology.category}
            </span>
            <RiskBadge level={typology.riskLevel} />
          </div>
          <h3 className="font-semibold text-14 text-ink-0 leading-tight">{typology.name}</h3>
        </div>
        <span className="font-mono text-10 text-ink-3 shrink-0">{typology.id}</span>
      </div>

      <p className="text-12.5 text-ink-2 leading-relaxed mb-3 line-clamp-2">{typology.description}</p>

      {/* Red Flags preview */}
      <div className="mb-3">
        <div className="font-mono text-10 uppercase tracking-wide text-ink-3 mb-1">Red Flags</div>
        <div className="space-y-0.5">
          {typology.redFlags.slice(0, 3).map((flag, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-red text-10 shrink-0 mt-0.5">▲</span>
              <span className="text-11.5 text-ink-1">{flag}</span>
            </div>
          ))}
          {typology.redFlags.length > 3 && (
            <div className="text-10 font-mono text-ink-3">+{typology.redFlags.length - 3} more red flags</div>
          )}
        </div>
      </div>

      {/* Sectors */}
      <div className="flex flex-wrap gap-1 mb-3">
        {typology.sectors.map((s) => (
          <span key={s} className="px-1.5 py-0.5 rounded text-10 font-mono bg-bg-1 text-ink-3 border border-hair">
            {s}
          </span>
        ))}
      </div>

      {/* FATF ref + actions */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-hair">
        <span className="font-mono text-10 text-ink-3">{typology.fatfRef}</span>
        <button
          type="button"
          onClick={() => onDeepDive(typology.name)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 transition-colors shrink-0"
        >
          Deep Dive →
        </button>
      </div>
    </div>
  );
}

export default function TypologyLibraryPage() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TypologySearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [deepDiveTarget, setDeepDiveTarget] = useState<string | null>(null);

  const handleSearch = async (overrideQuery?: string, overrideFilter?: FilterKey) => {
    const q = overrideQuery ?? query;
    const f = overrideFilter ?? activeFilter;
    setLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/typology-library/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q || `Show ${f === "all" ? "most common" : f} typologies`,
          filters: { sector: CATEGORY_SECTOR_MAP[f] },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const raw = await res.text().catch((err: unknown) => {
        console.warn("[hawkeye] typology-library search res.text() failed:", err);
        return "";
      });
      const isHtml = raw.trimStart().toLowerCase().startsWith("<");
      if (!res.ok || isHtml) {
        console.error(`[hawkeye] typology-library search HTTP ${res.status} isHtml=${isHtml}`);
        setSearchError(
          res.status === 503
            ? "Typology-library AI service unavailable — set ANTHROPIC_API_KEY or retry in a moment."
            : isHtml
              ? `Server returned HTML (HTTP ${res.status}) — likely a Netlify 502 / function timeout.`
              : `Search failed (HTTP ${res.status}).`,
        );
        return;
      }
      let json: TypologySearchResponse;
      try { json = JSON.parse(raw) as TypologySearchResponse; }
      catch (err) {
        console.error("[hawkeye] typology-library search JSON.parse failed:", err, raw.slice(0, 200));
        setSearchError("Typology-library returned a malformed response.");
        return;
      }
      setResults(json);
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      setSearchError(isTimeout
        ? "Typology search timed out after 45s — please retry or use a tighter query."
        : `Network error — ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterClick = (key: FilterKey) => {
    setActiveFilter(key);
    void handleSearch(undefined, key);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleSearch();
  };

  return (
    <ModuleLayout engineLabel="Typology engine" asanaModule="typology-library" asanaLabel="Typology Library">
      <ModuleHero
        eyebrow="AI-Powered AML Knowledge Base"
        title="Typology"
        titleEm="library."
        moduleNumber={38}
        kpis={[
          { value: "500+", label: "Typologies indexed" },
          { value: "52", label: "Categories" },
          { value: "14", label: "Recent additions" },
          { value: "UAE-specific", label: "Localised content", tone: "amber" },
        ]}
        intro="Search and explore 500+ AML/CFT money laundering typologies powered by Claude AI. Each typology includes red flags, real-world examples, FATF references, detection methods, and UAE-specific context."
      />

      {/* Search Bar */}
      <div className="mb-6">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-14">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='e.g. "find typologies involving real estate and PEPs" or "crypto layering techniques"'
              className="w-full pl-9 pr-4 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13.5 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-green-dim text-green text-13 font-semibold border border-green/40 hover:bg-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {loading ? "⌕…" : "⌕"}
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => handleFilterClick(cat.key)}
            className={`px-3.5 py-1.5 rounded-full text-12 font-medium transition-colors border ${
              activeFilter === cat.key
                ? "bg-brand text-white border-brand"
                : "bg-bg-1 text-ink-2 border-hair hover:border-brand/40 hover:text-ink-0"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
            <span className="font-mono text-11 text-ink-2 uppercase tracking-wide">Searching typology database…</span>
          </div>
        </div>
      )}

      {searchError && !loading && (
        <div className="rounded-lg border border-red/40 bg-red-dim/40 p-4 my-4">
          <div className="text-12 font-semibold text-red mb-1">Search failed</div>
          <p className="text-11 text-ink-1 leading-relaxed mb-2">{searchError}</p>
          <button
            type="button"
            onClick={() => void handleSearch()}
            className="text-10 font-semibold px-3 py-1 rounded border border-red/40 text-red hover:bg-red/10"
          >
            Retry
          </button>
        </div>
      )}

      {results && !loading && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-12 text-ink-2">
              {results.totalFound} typologies found
            </span>
            {results.relatedCategories.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-10 text-ink-3">Related:</span>
                {results.relatedCategories.map((cat) => (
                  <span key={cat} className="px-2 py-0.5 rounded bg-bg-2 text-ink-2 text-10 font-mono border border-hair">
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
            {results.results.map((t) => (
              <TypologyCard key={t.id} typology={t} onDeepDive={setDeepDiveTarget} />
            ))}
          </div>
        </>
      )}

      {!results && !loading && (
        <>
          {/* Empty state — Featured UAE typologies */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-16">🇦🇪</span>
              <h2 className="font-display text-20 font-normal text-ink-0">
                Top 10 Most Common in <em className="italic text-brand">UAE</em>
              </h2>
            </div>
            <p className="text-ink-2 text-13 mb-5">
              The following typologies are most frequently observed in UAE AML/CFT enforcement actions, CBUAE thematic reviews, and FATF mutual evaluation findings.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FEATURED_UAE.map((item, i) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    setQuery(item.name);
                    void handleSearch(item.name, "all");
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-lg bg-bg-panel border border-hair hover:border-brand/30 transition-colors text-left group"
                >
                  <span className="w-7 h-7 rounded-full bg-bg-2 border border-hair flex items-center justify-center font-mono text-11 font-semibold text-ink-2 shrink-0 group-hover:border-brand/30 group-hover:text-brand transition-colors">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-13 text-ink-0 truncate">{item.name}</div>
                    <div className="font-mono text-10 text-ink-3 mt-0.5">{item.category}</div>
                  </div>
                  <RiskBadge level={item.risk} />
                </button>
              ))}
            </div>

          </section>
        </>
      )}

      {/* FIU 2025 DPMS Typology Alignment — always visible below the search area */}
      <FiuDpmsSection />

      {/* Deep Dive Modal */}
      {deepDiveTarget && (
        <DeepDiveModal
          typologyName={deepDiveTarget}
          onClose={() => setDeepDiveTarget(null)}
        />
      )}
    </ModuleLayout>
  );
}
