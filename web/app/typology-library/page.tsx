"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { TypologyResult, TypologySearchResponse } from "@/app/api/typology-library/search/route";
import type { TypologyDetailResult } from "@/app/api/typology-library/detail/route";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import { PLAYBOOKS, type Playbook } from "@/app/playbook/_data";

// Module 38 — Typology Library
// Comprehensive AML/CFT typology search engine powered by Claude.

// FATF category filters — maps to the ML/TF/PF category field in the static library
const FATF_CATEGORY_FILTERS = [
  { key: "all-fatf", label: "All", fatfCategory: undefined as string | undefined },
  { key: "ml", label: "ML — Money Laundering", fatfCategory: "ML" },
  { key: "tf", label: "TF — Terrorist Financing", fatfCategory: "TF" },
  { key: "pf", label: "PF — Proliferation Financing", fatfCategory: "PF" },
] as const;

type FatfFilterKey = (typeof FATF_CATEGORY_FILTERS)[number]["key"];

// Risk level filters
const RISK_FILTERS = [
  { key: "all-risk", label: "All Risk Levels", riskLevel: undefined as string | undefined },
  { key: "critical", label: "Critical", riskLevel: "critical" },
  { key: "high", label: "High", riskLevel: "high" },
  { key: "medium", label: "Medium", riskLevel: "medium" },
  { key: "low", label: "Low", riskLevel: "low" },
] as const;

type RiskFilterKey = (typeof RISK_FILTERS)[number]["key"];

// Sector-based filters (legacy — kept for AI augmentation path)
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
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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
        if (mountedRef.current) setDetailError(apiErrorMessage(res.status, "Typology detail load"));
      } else {
        const json = await res.json().catch(() => ({})) as TypologyDetailResult;
        if (!mountedRef.current) return;
        setData(json);
      }
    } catch (err) {
      console.error("[hawkeye] typology-library detail fetch threw:", err);
      if (mountedRef.current) setDetailError(caughtErrorMessage(err, "Network error"));
    } finally {
      if (mountedRef.current) { setLoading(false); setFetched(true); }
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

// Maps a typology card (name + category) to the best-matching playbook.
const PLAYBOOK_RULES: Array<{ test: RegExp; id: string }> = [
  { test: /tbml|trade.based|over.invoic|under.invoic|phantom.ship/i, id: "tbml" },
  { test: /\bpep\b|politically.exposed/i, id: "pep" },
  { test: /crypto|vasp|virtual.asset|bitcoin|ethereum|blockchain|defi/i, id: "vasp" },
  { test: /real.estate|property|mortgage/i, id: "real-estate" },
  { test: /shell.comp|beneficial.own|ubo|nominee|complex.struct/i, id: "shell-complex" },
  { test: /hawala|informal.value.transfer|underground.bank/i, id: "hawala" },
  { test: /structur|smurfing|placement/i, id: "structuring" },
  { test: /proliferat|\bpf\b|dual.use|wmd|nuclear/i, id: "proliferation" },
  { test: /conflict.miner|oecd.5|cahra|artisan/i, id: "conflict-minerals" },
  { test: /correspondent|nested.relation|respondent.bank/i, id: "correspondent" },
  { test: /dpms|precious.metal|gold.souk|bullion|diamond/i, id: "dpms-retail" },
  { test: /digital.asset|nft|token|non.fungible/i, id: "digital-assets" },
  { test: /human.traffick|forced.labour|modern.slave/i, id: "human-trafficking" },
  { test: /insider|employee.fraud|staff.fraud/i, id: "insider-threat" },
  { test: /sanction|tfs|eocn/i, id: "sanctions-match-triage" },
  { test: /casino|gaming|gambling|junket/i, id: "gaming" },
  { test: /luxury|high.value.dealer|auction|artwork/i, id: "luxury-goods" },
  { test: /insurance.fraud|insurance/i, id: "insurance" },
  { test: /wire.transfer|swift|cross.border.payment/i, id: "wire-transfer" },
  { test: /bribery|corrupt/i, id: "bribery" },
  { test: /tax.evasion|tax.fraud|offshore/i, id: "tax-evasion" },
  { test: /enviro|wildlife|illegal.logging/i, id: "environmental-crime" },
  { test: /ransomware|cyber.fraud|malware/i, id: "ransomware-proceeds" },
  { test: /cash.intensive|cash.placement|bulk.cash/i, id: "cash-intensive" },
  { test: /ngo|nonprofit|charity|non.profit/i, id: "ngo" },
  { test: /remit|money.transfer/i, id: "remittance" },
  { test: /trade.finance|letter.of.credit|documentary/i, id: "trade-finance" },
  { test: /account.takeover|identity.theft|synthetic.id/i, id: "account-takeover" },
];

function findPlaybook(name: string, category: string): Playbook | null {
  const combined = `${name} ${category}`;
  for (const rule of PLAYBOOK_RULES) {
    if (rule.test.test(combined)) {
      return PLAYBOOKS.find((p) => p.id === rule.id) ?? null;
    }
  }
  return null;
}

function PlaybookDrawer({ playbook, onClose }: { playbook: Playbook; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* panel */}
      <div className="relative z-10 w-full max-w-md bg-bg-panel border-l border-hair shadow-2xl flex flex-col overflow-hidden">
        {/* sticky header */}
        <div className="sticky top-0 bg-bg-panel border-b border-hair px-5 py-4 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="font-mono text-10 uppercase tracking-wide-4 text-brand mb-1">📖 Playbook</div>
            <h2 className="font-display text-18 font-normal text-ink-0 leading-tight">{playbook.title}</h2>
            {playbook.description && (
              <p className="text-11.5 text-ink-2 mt-1.5 leading-relaxed line-clamp-3">{playbook.description}</p>
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

        {/* citations */}
        {playbook.citations && playbook.citations.length > 0 && (
          <div className="px-5 py-2 border-b border-hair bg-bg-1 flex flex-wrap gap-1.5 shrink-0">
            {playbook.citations.map((c) => (
              <span key={c} className="font-mono text-10 px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                {c}
              </span>
            ))}
          </div>
        )}

        {/* steps */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {playbook.steps.map((step, i) => (
            <div key={i} className="border border-hair rounded-lg bg-bg-1 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-hair bg-bg-2">
                <span className="w-5 h-5 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center font-mono text-10 font-bold text-brand shrink-0">
                  {i + 1}
                </span>
                <span className="font-semibold text-12.5 text-ink-0 flex-1">{step.title.replace(/^\d+\.\s*/, "")}</span>
                {step.required && (
                  <span className="font-mono text-10 px-1.5 py-0.5 rounded bg-red-dim text-red border border-red/20 shrink-0">
                    Required
                  </span>
                )}
              </div>
              <ul className="px-4 py-3 space-y-1.5 list-none m-0 p-0">
                {step.checks.map((check, j) => (
                  <li key={j} className="flex items-start gap-2 px-4">
                    <span className="text-brand text-10 shrink-0 mt-1">✓</span>
                    <span className="text-12 text-ink-1 leading-relaxed">{check}</span>
                  </li>
                ))}
              </ul>
              {step.citation && (
                <div className="px-4 py-1.5 border-t border-hair">
                  <span className="font-mono text-10 text-ink-3">{step.citation}</span>
                </div>
              )}
            </div>
          ))}
          <p className="text-10 text-ink-3 font-mono text-center pt-2">
            View full playbook at <a href="/playbook" className="text-brand underline">Playbook →</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function TypologyCard({
  typology,
  onDeepDive,
  onViewPlaybook,
}: {
  typology: TypologyResult;
  onDeepDive: (_name: string) => void;
  onViewPlaybook: (_playbook: Playbook) => void;
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
        <div className="flex items-center gap-2 shrink-0">
          {(() => {
            const matched = findPlaybook(typology.name, typology.category);
            return matched ? (
              <button
                type="button"
                onClick={() => onViewPlaybook(matched)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-brand text-brand text-12 font-semibold hover:bg-brand/10 transition-colors"
              >
                📖 Playbook
              </button>
            ) : null;
          })()}
          <button
            type="button"
            onClick={() => onDeepDive(typology.name)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 transition-colors"
          >
            Deep Dive →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TypologyLibraryPage() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  // Category/risk pill rows removed — free-text search covers filtering;
  // these constants keep the search payload shape stable.
  const activeFatfFilter: FatfFilterKey = "all-fatf";
  const activeRiskFilter: RiskFilterKey = "all-risk";
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TypologySearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [deepDiveTarget, setDeepDiveTarget] = useState<string | null>(null);
  const [playbookTarget, setPlaybookTarget] = useState<Playbook | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const handleSearch = async (
    overrideQuery?: string,
    overrideFilter?: FilterKey,
    overrideFatf?: FatfFilterKey,
    overrideRisk?: RiskFilterKey,
  ) => {
    const q = overrideQuery ?? query;
    const f = overrideFilter ?? activeFilter;
    const fatf = overrideFatf ?? activeFatfFilter;
    const risk = overrideRisk ?? activeRiskFilter;

    const fatfEntry = FATF_CATEGORY_FILTERS.find((c) => c.key === fatf);
    const riskEntry = RISK_FILTERS.find((r) => r.key === risk);

    setLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/typology-library/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q || `Show ${fatf !== "all-fatf" ? fatf.toUpperCase() : f === "all" ? "most common" : f} typologies`,
          filters: {
            sector: CATEGORY_SECTOR_MAP[f],
            category: fatfEntry?.fatfCategory,
            riskLevel: riskEntry?.riskLevel,
          },
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
        if (mountedRef.current) setSearchError(
          res.status === 503
            ? "Typology-library AI service unavailable — set ANTHROPIC_API_KEY or retry in a moment."
            : apiErrorMessage(res.status, "Search"),
        );
        return;
      }
      let json: TypologySearchResponse;
      try { json = JSON.parse(raw) as TypologySearchResponse; }
      catch (err) {
        console.error("[hawkeye] typology-library search JSON.parse failed:", err, raw.slice(0, 200));
        if (mountedRef.current) setSearchError("Typology-library returned a malformed response.");
        return;
      }
      if (!mountedRef.current) return;
      setResults(json);
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      if (mountedRef.current) setSearchError(isTimeout
        ? "Typology search timed out after 45s — please retry or use a tighter query."
        : caughtErrorMessage(err, "Network error"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const _handleFilterClick = (key: FilterKey) => {
    setActiveFilter(key);
    void handleSearch(undefined, key);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleSearch();
  };

  return (
    <ModuleLayout engineLabel="Typology engine" asanaModule="typology-library" asanaLabel="Typology Library" onRun={() => void handleSearch()} onSync={() => void handleSearch()}>
      <ModuleHero
        eyebrow=""
        title="Typology"
        titleEm="library."

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
              <TypologyCard key={t.id} typology={t} onDeepDive={setDeepDiveTarget} onViewPlaybook={setPlaybookTarget} />
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

      {/* Deep Dive Modal */}
      {deepDiveTarget && (
        <DeepDiveModal
          typologyName={deepDiveTarget}
          onClose={() => setDeepDiveTarget(null)}
        />
      )}

      {/* Playbook Drawer */}
      {playbookTarget && (
        <PlaybookDrawer
          playbook={playbookTarget}
          onClose={() => setPlaybookTarget(null)}
        />
      )}
    </ModuleLayout>
  );
}
