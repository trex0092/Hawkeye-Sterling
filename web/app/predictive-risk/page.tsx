"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { PredictiveRiskResult, RiskSignal } from "@/lib/server/predictive-risk";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { CorporateRecord } from "@/lib/intelligence/opencorporates";
import type { WikidataPepProfile } from "@/lib/intelligence/wikidata-pep";

// ── Tier configuration ────────────────────────────────────────────────────────

const TIER_CONFIG: Record<
  PredictiveRiskResult["tier"],
  { label: string; bg: string; text: string; border: string; bar: string }
> = {
  critical: {
    label: "CRITICAL",
    bg: "bg-red/10",
    text: "text-red",
    border: "border-red/30",
    bar: "bg-red",
  },
  high: {
    label: "HIGH",
    bg: "bg-orange/10",
    text: "text-orange",
    border: "border-orange/30",
    bar: "bg-orange",
  },
  elevated: {
    label: "ELEVATED",
    bg: "bg-amber/10",
    text: "text-amber",
    border: "border-amber/30",
    bar: "bg-amber",
  },
  standard: {
    label: "STANDARD",
    bg: "bg-blue/10",
    text: "text-blue",
    border: "border-blue/30",
    bar: "bg-blue",
  },
  low: {
    label: "LOW",
    bg: "bg-green-dim",
    text: "text-green",
    border: "border-green/20",
    bar: "bg-green",
  },
};

const CATEGORY_LABELS: Record<RiskSignal["category"], string> = {
  jurisdiction: "Jurisdiction",
  entity_type: "Entity Type",
  pep: "PEP Proximity",
  adverse_media: "Adverse Media",
  sanctions: "Sanctions",
  behavioral: "CDD Posture",
  structure: "Structure",
};

// ── Signal bar (CSS-based, no chart lib) ──────────────────────────────────────

function SignalBar({ signal }: { signal: RiskSignal }) {
  const tc = TIER_CONFIG[scoreToTier(signal.score)];
  const weightedImpact = Math.round(signal.score * signal.weight);
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-hair-2 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-11 uppercase tracking-wide-3 font-semibold text-ink-2 w-28 shrink-0">
            {CATEGORY_LABELS[signal.category]}
          </span>
          <span className="text-12 text-ink-1 truncate">{signal.label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-11 font-semibold px-2 py-0.5 rounded border ${tc.bg} ${tc.text} ${tc.border}`}>
            {signal.score}
          </span>
          <span className="text-11 text-ink-3 w-14 text-right">
            wt·{(signal.weight * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      {/* CSS bar showing weighted contribution */}
      <div className="h-1.5 rounded-full bg-bg-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tc.bar}`}
          style={{ width: `${Math.min(100, signal.score)}%` }}
        />
      </div>
      <p className="text-11 text-ink-2 leading-relaxed">{signal.explanation}</p>
      {signal.weight > 0 && (
        <p className="text-10 text-ink-3">
          Weighted impact: {weightedImpact} / 100 &nbsp;·&nbsp; weight {(signal.weight * 100).toFixed(0)}%
        </p>
      )}
    </div>
  );
}

function scoreToTier(score: number): PredictiveRiskResult["tier"] {
  if (score >= 80) return "critical";
  if (score >= 65) return "high";
  if (score >= 45) return "elevated";
  if (score >= 25) return "standard";
  return "low";
}

// ── Composite score badge ─────────────────────────────────────────────────────

function ScoreBadge({ result }: { result: PredictiveRiskResult }) {
  const tc = TIER_CONFIG[result.tier];
  return (
    <div className={`flex flex-col items-center gap-2 p-6 rounded-xl border-2 ${tc.bg} ${tc.border}`}>
      <span className={`text-56 font-black tabular-nums leading-none ${tc.text}`}>
        {result.compositeScore}
      </span>
      <span className={`text-12 font-bold tracking-widest uppercase ${tc.text}`}>
        {tc.label} RISK
      </span>
      <span className="text-11 text-ink-2">Composite predictive score / 100</span>
    </div>
  );
}

// ── Corporate record card ─────────────────────────────────────────────────────

function CorporateCard({ record }: { record: CorporateRecord }) {
  return (
    <div className="rounded-lg border border-hair-2 bg-bg-1 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-13 font-semibold text-ink-0 leading-snug">{record.name}</p>
          <p className="text-11 text-ink-2 mt-0.5">
            {record.jurisdiction} &nbsp;·&nbsp; #{record.companyNumber}
          </p>
        </div>
        <span className="text-10 font-semibold px-2 py-1 bg-bg-2 border border-hair-2 rounded text-ink-2 whitespace-nowrap">
          {record.companyType}
        </span>
      </div>

      {(record.incorporationDate || record.dissolutionDate) && (
        <div className="flex gap-4 text-11 text-ink-2">
          {record.incorporationDate && (
            <span>Incorporated: <span className="text-ink-1 font-medium">{record.incorporationDate}</span></span>
          )}
          {record.dissolutionDate && (
            <span className="text-red">Dissolved: <span className="font-medium">{record.dissolutionDate}</span></span>
          )}
        </div>
      )}

      {record.registeredAddress && (
        <p className="text-11 text-ink-2">{record.registeredAddress}</p>
      )}

      {record.officers && record.officers.length > 0 && (
        <div>
          <p className="text-11 uppercase tracking-wide-3 font-semibold text-ink-3 mb-1.5">Officers</p>
          <div className="flex flex-col gap-1">
            {record.officers.slice(0, 5).map((o, i) => (
              <div key={i} className="flex items-center justify-between text-11">
                <span className="text-ink-1 font-medium">{o.name}</span>
                <span className="text-ink-3">{o.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-10 text-ink-3 border-t border-hair-2 pt-2">
        Source: OpenCorporates
      </div>
    </div>
  );
}

// ── Wikidata PEP profile card ─────────────────────────────────────────────────

function WikidataPepCard({ profile }: { profile: WikidataPepProfile }) {
  return (
    <div className="rounded-lg border border-hair-2 bg-bg-1 p-4 flex gap-4">
      {profile.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.imageUrl}
          alt={profile.name}
          className="w-14 h-14 rounded-full object-cover shrink-0 border border-hair-2"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-13 font-semibold text-ink-0">{profile.name}</p>
            <p className="text-11 text-ink-2">{profile.wikidataId}</p>
          </div>
          <span
            className={`text-10 font-semibold px-2 py-1 rounded border whitespace-nowrap ${
              profile.isCurrentlyActive
                ? "bg-green-dim text-green border-green/20"
                : "bg-bg-2 text-ink-3 border-hair-2"
            }`}
          >
            {profile.isCurrentlyActive ? "Active" : "Former"}
          </span>
        </div>

        {profile.description && (
          <p className="text-11 text-ink-2 leading-relaxed">{profile.description}</p>
        )}

        {profile.positions.length > 0 && (
          <div>
            <p className="text-10 uppercase tracking-wide-3 font-semibold text-ink-3 mb-1">Positions</p>
            <div className="flex flex-wrap gap-1">
              {profile.positions.map((pos, i) => (
                <span key={i} className="text-10 px-2 py-0.5 rounded bg-amber/10 text-amber border border-amber/20">
                  {pos}
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.countries.length > 0 && (
          <div className="flex items-center gap-1.5 text-11 text-ink-2">
            <span className="font-semibold">Countries:</span>
            <span>{profile.countries.join(", ")}</span>
          </div>
        )}

        {profile.partyAffiliations.length > 0 && (
          <div className="flex items-center gap-1.5 text-11 text-ink-2">
            <span className="font-semibold">Parties:</span>
            <span>{profile.partyAffiliations.join(", ")}</span>
          </div>
        )}

        <div className="text-10 text-ink-3 border-t border-hair-2 pt-2">
          Source: Wikidata &nbsp;·&nbsp;
          <a
            href={`https://www.wikidata.org/wiki/${profile.wikidataId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-brand"
          >
            View on Wikidata
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PredictiveRiskPage() {
  const [subjectId, setSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [entityType, setEntityType] = useState<"individual" | "organisation">("individual");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PredictiveRiskResult | null>(null);

  const [corpLoading, setCorpLoading] = useState(false);
  const [corpRecords, setCorpRecords] = useState<CorporateRecord[] | null>(null);

  const [pepLoading, setPepLoading] = useState(false);
  const [pepProfiles, setPepProfiles] = useState<WikidataPepProfile[] | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const runScore = useCallback(async () => {
    const id = subjectId.trim();
    if (!id) {
      setError("Subject ID is required.");
      return;
    }
    setError("");
    setResult(null);
    setCorpRecords(null);
    setPepProfiles(null);
    setLoading(true);

    try {
      const res = await fetch("/api/predictive-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: id }),
      });
      const data = (await res.json()) as { ok: boolean; result?: PredictiveRiskResult; error?: string };
      if (!mountedRef.current) return;

      if (!res.ok || !data.ok) {
        setError(data.error ?? apiErrorMessage(res.status, "Predictive risk"));
        return;
      }
      if (data.result) {
        setResult(data.result);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(caughtErrorMessage(err, "Network error"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [subjectId]);

  const fetchCorporateRegistry = useCallback(async () => {
    const name = subjectName.trim();
    if (!name) return;
    setCorpLoading(true);
    try {
      const params = new URLSearchParams({ name });
      const res = await fetch(`/api/corporate-registry?${params.toString()}`);
      const data = (await res.json()) as { ok: boolean; records?: CorporateRecord[] };
      if (!mountedRef.current) return;
      if (data.ok) setCorpRecords(data.records ?? []);
    } catch {
      if (mountedRef.current) setCorpRecords([]);
    } finally {
      if (mountedRef.current) setCorpLoading(false);
    }
  }, [subjectName]);

  const fetchWikidataPep = useCallback(async () => {
    const name = subjectName.trim();
    if (!name) return;
    setPepLoading(true);
    try {
      const params = new URLSearchParams({ name });
      const res = await fetch(`/api/wikidata-pep?${params.toString()}`);
      const data = (await res.json()) as { ok: boolean; profiles?: WikidataPepProfile[] };
      if (!mountedRef.current) return;
      if (data.ok) setPepProfiles(data.profiles ?? []);
    } catch {
      if (mountedRef.current) setPepProfiles([]);
    } finally {
      if (mountedRef.current) setPepLoading(false);
    }
  }, [subjectName]);

  // Trigger enrichment after scoring
  useEffect(() => {
    if (!result || !subjectName.trim()) return;
    if (entityType === "organisation") void fetchCorporateRegistry();
    void fetchWikidataPep();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const iCls =
    "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

  return (
    <ModuleLayout asanaModule="predictive-risk" asanaLabel="Predictive Risk" onRun={() => void runScore()}>
      <ModuleHero
        eyebrow=""
        title="Predictive Risk Scoring"
        intro="Forward-looking 7-signal weighted risk model with OpenCorporates and Wikidata OSINT enrichment."
      />

      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* ── Input form ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-hair-2 bg-bg-0 p-5 flex flex-col gap-4">
          <h2 className="text-14 font-semibold text-ink-0">Score a Subject</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-11 uppercase tracking-wide-3 font-semibold text-ink-2">
                Subject ID
              </label>
              <input
                className={iCls}
                placeholder="e.g. SUB-001"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runScore()}
              />
              <p className="text-10 text-ink-3">Loads from the compliance subject registry</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-11 uppercase tracking-wide-3 font-semibold text-ink-2">
                Subject Name <span className="text-ink-3">(for OSINT enrichment)</span>
              </label>
              <input
                className={iCls}
                placeholder="e.g. Acme Holdings Ltd"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-11 uppercase tracking-wide-3 font-semibold text-ink-2">
                Entity Type
              </label>
              <select
                className={iCls}
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as "individual" | "organisation")}
              >
                <option value="individual">Individual</option>
                <option value="organisation">Organisation / Corporate</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red/10 border border-red/20 px-4 py-2.5 text-12 text-red">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => void runScore()}
              disabled={loading || !subjectId.trim()}
              className="px-5 py-2 rounded-lg bg-brand text-white text-12 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand/90 transition-colors"
            >
              {loading ? "Scoring…" : "Run Predictive Score"}
            </button>

            {subjectName.trim() && result && (
              <button
                onClick={() => {
                  void fetchCorporateRegistry();
                  void fetchWikidataPep();
                }}
                disabled={corpLoading || pepLoading}
                className="px-5 py-2 rounded-lg bg-bg-2 border border-hair-2 text-ink-1 text-12 font-semibold disabled:opacity-50 hover:bg-bg-1 transition-colors"
              >
                {corpLoading || pepLoading ? "Enriching…" : "Re-run OSINT"}
              </button>
            )}
          </div>
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        {result && (
          <>
            {/* Composite score + explanation */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
              <ScoreBadge result={result} />
              <div className="rounded-xl border border-hair-2 bg-bg-0 p-5 flex flex-col gap-3">
                <h3 className="text-12 font-semibold text-ink-0">Risk Assessment</h3>
                <p className="text-13 text-ink-1 leading-relaxed">{result.explanation}</p>
                <div className="flex flex-wrap gap-3 mt-1">
                  <div className="text-11 text-ink-2">
                    Subject: <span className="text-ink-0 font-medium">{result.subjectId}</span>
                  </div>
                  <div className="text-11 text-ink-2">
                    Generated: <span className="text-ink-0 font-medium">
                      {new Date(result.generatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signal breakdown */}
            <div className="rounded-xl border border-hair-2 bg-bg-0 p-5 flex flex-col gap-0">
              <h3 className="text-14 font-semibold text-ink-0 mb-4">Signal Breakdown</h3>
              {result.signals
                .slice()
                .sort((a, b) => b.score * b.weight - a.score * a.weight)
                .map((signal) => (
                  <SignalBar key={signal.id} signal={signal} />
                ))}

              {/* Weight legend */}
              <div className="mt-4 pt-3 border-t border-hair-2 flex flex-wrap gap-3">
                {result.signals.filter((s) => s.weight > 0).map((s) => (
                  <span key={s.id} className="text-10 text-ink-3">
                    {CATEGORY_LABELS[s.category]}: {(s.weight * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>

            {/* Corporate registry section */}
            {entityType === "organisation" && (
              <div className="rounded-xl border border-hair-2 bg-bg-0 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-14 font-semibold text-ink-0">Corporate Registry</h3>
                  <span className="text-11 text-ink-3">OpenCorporates</span>
                </div>

                {corpLoading && (
                  <p className="text-12 text-ink-2 animate-pulse">Searching corporate registries…</p>
                )}

                {!corpLoading && corpRecords !== null && corpRecords.length === 0 && (
                  <p className="text-12 text-ink-2">No corporate records found for this name.</p>
                )}

                {!corpLoading && corpRecords && corpRecords.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {corpRecords.map((record, i) => (
                      <CorporateCard key={i} record={record} />
                    ))}
                  </div>
                )}

                {!corpLoading && corpRecords === null && subjectName.trim() && (
                  <p className="text-12 text-ink-2">
                    Enter a subject name above and click &quot;Re-run OSINT&quot; to search the registry.
                  </p>
                )}
              </div>
            )}

            {/* PEP enrichment section */}
            <div className="rounded-xl border border-hair-2 bg-bg-0 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-14 font-semibold text-ink-0">Wikidata PEP Enrichment</h3>
                <span className="text-11 text-ink-3">Wikidata SPARQL</span>
              </div>

              {pepLoading && (
                <p className="text-12 text-ink-2 animate-pulse">Querying Wikidata for political figures…</p>
              )}

              {!pepLoading && pepProfiles !== null && pepProfiles.length === 0 && (
                <p className="text-12 text-ink-2">No Wikidata PEP profiles found for this name.</p>
              )}

              {!pepLoading && pepProfiles && pepProfiles.length > 0 && (
                <div className="flex flex-col gap-3">
                  {pepProfiles.map((profile) => (
                    <WikidataPepCard key={profile.wikidataId} profile={profile} />
                  ))}
                </div>
              )}

              {!pepLoading && pepProfiles === null && subjectName.trim() && (
                <p className="text-12 text-ink-2">
                  Wikidata enrichment will run automatically after scoring.
                </p>
              )}

              {!pepLoading && pepProfiles === null && !subjectName.trim() && (
                <p className="text-12 text-ink-2">
                  Provide a subject name for Wikidata PEP enrichment.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </ModuleLayout>
  );
}
