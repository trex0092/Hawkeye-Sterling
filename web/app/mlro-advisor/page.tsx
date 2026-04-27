"use client";

import { useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";

// ── MLRO Advisor types ────────────────────────────────────────────────────────

type ReasoningMode = "speed" | "balanced" | "multi_perspective";

interface ReasoningStep {
  stepNo: number;
  actor: "executor" | "advisor";
  modelId: string;
  at: string;
  summary: string;
  body: string;
}

interface AdvisorResult {
  ok: boolean;
  mode: string;
  elapsedMs: number;
  partial: boolean;
  guidance?: string;
  reasoningTrail: ReasoningStep[];
  narrative?: string;
  complianceReview: {
    advisorVerdict: "approved" | "returned_for_revision" | "blocked" | "incomplete";
    issues: string[];
  };
  charterIntegrityHash?: string;
  error?: string;
}

// ── Regulatory Q&A types ──────────────────────────────────────────────────────

interface Citation { document: string; section?: string; jurisdiction?: string; excerpt?: string }
interface ComplianceAnswer {
  ok: boolean;
  query: string;
  answer?: string;
  citations: Citation[];
  confidenceScore?: number;
  confidenceTier?: string;
  consistencyScore?: number;
  jurisdiction?: string;
  passedQualityGate: boolean;
  error?: string;
}

const SUGGESTED_QUESTIONS = [
  "What is the EDD threshold for PEPs under EU 5AMLD?",
  "What records must a reporting institution maintain under the UAE AML Law?",
  "When is a Suspicious Activity Report required under the Bank Secrecy Act?",
  "What are the FATF criteria for high-risk jurisdictions?",
  "What constitutes shell company risk under FATF Recommendation 24?",
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const tabCls = (active: boolean) =>
  `px-2.5 py-1 rounded text-11 font-medium border transition-colors ${
    active
      ? "bg-brand text-white border-brand"
      : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
  }`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MlroAdvisorPage() {
  const [pageTab, setPageTab] = useState<"advisor" | "regulatory-qa">("advisor");

  // Advisor state
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ReasoningMode>("multi_perspective");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Regulatory Q&A state
  const [qaQuery, setQaQuery] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaResult, setQaResult] = useState<ComplianceAnswer | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/mlro-advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, subjectName: "Unknown subject", mode, audience: "regulator" }),
      });
      const rawText = await res.text();
      let data: (AdvisorResult & { error?: string }) | null = null;
      try { data = JSON.parse(rawText) as AdvisorResult & { error?: string }; }
      catch {
        setError(
          res.status === 504 || res.status === 524
            ? "Request timed out — try Speed or Balanced mode."
            : `Server error ${res.status} — check that ANTHROPIC_API_KEY is configured.`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setError(
          data.error ?? data.guidance ??
          (res.status === 504 || res.status === 524
            ? "Request timed out — try Speed or Balanced mode."
            : `HTTP ${res.status}`),
        );
      } else {
        setResult(data);
        window.requestAnimationFrame(() =>
          document.getElementById("advisor-result")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally { setRunning(false); }
  };

  const handleQaAsk = async (q?: string) => {
    const question = (q ?? qaQuery).trim();
    if (!question) return;
    setQaQuery(question);
    setQaLoading(true); setQaError(null); setQaResult(null);
    try {
      const res = await fetch("/api/compliance-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: question, mode: "multi-agent" }),
      });
      const data = await res.json() as ComplianceAnswer;
      if (!data.ok) setQaError(data.error ?? "Query failed");
      else setQaResult(data);
    } catch { setQaError("Request failed"); }
    finally { setQaLoading(false); }
  };

  return (
    <ModuleLayout engineLabel="MLRO Advisor">
      <ModuleHero
        eyebrow="Module 09 · Deep Reasoning"
        title="MLRO"
        titleEm="advisor."
        intro={
          <>
            Sonnet executor → Opus advisor · 86 directives · charter P1–P10.{" "}
            <span className="text-ink-3">Standalone mode — no screening context required.</span>
          </>
        }
      />

      <div className="bg-bg-panel border border-brand/30 rounded-xl p-5">
        {/* Tab bar */}
        <div className="flex items-center gap-1.5 mb-5 pb-4 border-b border-hair-2">
          <button type="button" onClick={() => setPageTab("advisor")} className={tabCls(pageTab === "advisor")}>
            MLRO Advisor
          </button>
          <button type="button" onClick={() => setPageTab("regulatory-qa")} className={tabCls(pageTab === "regulatory-qa")}>
            Regulatory Q&A
          </button>
        </div>

        {/* ── MLRO Advisor tab ─────────────────────────────────────────────── */}
        {pageTab === "advisor" && (
          <>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
                  Deep Reasoning · MLRO Advisor
                </div>
                <div className="text-12 text-ink-2">
                  Sonnet executor → Opus advisor · 86 directives · charter P1–P10
                  <span className="ml-2 text-ink-3">— standalone mode (no screening context)</span>
                </div>
              </div>
              {result && (
                <button type="button" onClick={() => { setResult(null); setError(null); }} className="text-11 text-ink-3 hover:text-ink-0">
                  Clear
                </button>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={running}
                rows={3}
                placeholder='Ask the MLRO Advisor a compliance question — e.g. "What CDD is required for a UAE gold trader?"'
                className="w-full px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-bg-panel resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-11 font-semibold text-ink-2 uppercase tracking-wide-3">Mode</span>
                  {(["speed", "balanced", "multi_perspective"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={tabCls(mode === m)}
                    >
                      {m === "multi_perspective" ? "Multi" : m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => { void handleAsk(); }}
                  disabled={!question.trim() || running}
                  className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {running ? "Analysing…" : "Ask Advisor"}
                </button>
              </div>
            </div>

            {running && (
              <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center">
                <span className="animate-pulse font-mono text-brand">●</span>
                Dual-model pipeline running — Sonnet executor → Opus advisor…
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-13 text-red-700">
                <span className="font-semibold">Advisor error:</span> {error}
              </div>
            )}

            {result && (
              <div id="advisor-result" className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-12 font-semibold uppercase tracking-wide-3 ${
                      result.complianceReview.advisorVerdict === "approved"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : result.complianceReview.advisorVerdict === "blocked"
                        ? "bg-red-100 text-red-700 border-red-300"
                        : result.complianceReview.advisorVerdict === "returned_for_revision"
                        ? "bg-amber-50 text-amber-700 border-amber-300"
                        : "bg-gray-100 text-gray-600 border-gray-300"
                    }`}
                  >
                    {result.complianceReview.advisorVerdict.replace(/_/g, " ")}
                  </span>
                  <span className="text-11 text-ink-3 font-mono">
                    mode:{result.mode} · {result.elapsedMs}ms
                    {result.partial && " · partial"}
                  </span>
                  {result.charterIntegrityHash && (
                    <span className="text-10 text-ink-3 font-mono hidden sm:inline">
                      hash:{result.charterIntegrityHash.slice(0, 12)}
                    </span>
                  )}
                </div>

                {result.error && (
                  <div className="bg-red-dim border border-red/30 rounded-lg p-3">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-red mb-1">Pipeline error</div>
                    <p className="text-12 text-red font-mono m-0 whitespace-pre-wrap">{result.error}</p>
                  </div>
                )}

                {result.complianceReview.issues.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-amber-700 mb-1">
                      Charter compliance issues
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {result.complianceReview.issues.map((issue) => (
                        <li key={issue} className="text-12 text-amber-800">{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.guidance && (
                  <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 text-13 text-ink-0 leading-relaxed">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Guidance</div>
                    <p className="m-0 whitespace-pre-wrap">{result.guidance}</p>
                  </div>
                )}

                {result.narrative && (
                  <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">
                      Regulator-facing narrative
                    </div>
                    <div className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">{result.narrative}</div>
                  </div>
                )}

                {result.reasoningTrail.length > 0 && (
                  <div>
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">
                      Reasoning trail ({result.reasoningTrail.length} steps)
                    </div>
                    <div className="space-y-2">
                      {result.reasoningTrail.map((step) => {
                        const isExpanded = expanded.has(step.stepNo);
                        return (
                          <div key={step.stepNo} className="border border-hair-2 rounded-lg bg-bg-1 overflow-hidden">
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(step.stepNo)) next.delete(step.stepNo);
                                  else next.add(step.stepNo);
                                  return next;
                                })
                              }
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-bg-panel transition-colors"
                            >
                              <span className={`text-10 font-mono font-bold px-1.5 py-0.5 rounded uppercase ${step.actor === "executor" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                {step.actor}
                              </span>
                              <span className="text-10 font-mono text-ink-3">{step.modelId}</span>
                              <span className="text-10 text-ink-3">{step.at}</span>
                              <span className="flex-1 text-12 text-ink-0 truncate">{step.summary}</span>
                              <span className="text-11 text-ink-3">{isExpanded ? "▲" : "▼"}</span>
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 pt-1 border-t border-hair-1">
                                <pre className="text-11 text-ink-1 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                                  {step.body}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Regulatory Q&A tab ───────────────────────────────────────────── */}
        {pageTab === "regulatory-qa" && (
          <>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
                  Regulatory Q&A
                </div>
                <div className="text-12 text-ink-2">
                  Source-cited regulatory answers via AML-MultiAgent-RAG — 4-agent pipeline with confidence and consistency quality gates
                </div>
              </div>
              {qaResult && (
                <button type="button" onClick={() => { setQaResult(null); setQaError(null); setQaQuery(""); }} className="text-11 text-ink-3 hover:text-ink-0">
                  Clear
                </button>
              )}
            </div>

            <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 mb-4">
              <textarea
                className="w-full border border-hair-2 rounded px-3 py-2 text-13 bg-bg-panel focus:outline-none focus:border-brand resize-none text-ink-0"
                rows={3}
                placeholder="Ask a regulatory question…"
                value={qaQuery}
                onChange={(e) => setQaQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handleQaAsk(); }}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-11 text-ink-3">⌘+Enter to submit</span>
                <button
                  type="button"
                  onClick={() => { void handleQaAsk(); }}
                  disabled={qaLoading || qaQuery.trim().length < 10}
                  className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {qaLoading ? "Asking…" : "Ask"}
                </button>
              </div>
            </div>

            {!qaResult && !qaLoading && (
              <div className="mb-5">
                <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3 mb-2">Suggested questions</p>
                <div className="space-y-1">
                  {SUGGESTED_QUESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { void handleQaAsk(s); }}
                      className="w-full text-left text-12 text-brand hover:text-brand-deep hover:bg-brand-dim/20 px-3 py-2 rounded transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {qaLoading && (
              <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center">
                <span className="animate-pulse font-mono text-brand">●</span>
                4-agent RAG pipeline running…
              </div>
            )}

            {qaError && (
              <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mb-4">
                <span className="font-semibold">Error:</span> {qaError}
                {(qaError.includes("COMPLIANCE_RAG_URL") || qaError.includes("503")) && (
                  <p className="text-11 mt-1 text-red/80">Set COMPLIANCE_RAG_URL to a running AML-MultiAgent-RAG instance.</p>
                )}
              </div>
            )}

            {qaResult && (
              <div className="space-y-4">
                <div className={`rounded-lg border p-3 text-12 flex items-center gap-2 ${qaResult.passedQualityGate ? "bg-green-dim border-green/30 text-green" : "bg-amber-dim border-amber/30 text-amber"}`}>
                  <span>{qaResult.passedQualityGate ? "✓" : "⚠"}</span>
                  <span className="font-semibold">{qaResult.passedQualityGate ? "Passed quality gate" : "Below quality threshold — treat with caution"}</span>
                  {qaResult.consistencyScore != null && (
                    <span className="ml-auto text-11">Consistency: {(qaResult.consistencyScore * 100).toFixed(0)}%</span>
                  )}
                </div>

                <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Answer</div>
                    {qaResult.jurisdiction && (
                      <span className="text-11 bg-brand-dim text-brand px-2 py-0.5 rounded">{qaResult.jurisdiction}</span>
                    )}
                  </div>
                  <p className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">{qaResult.answer}</p>
                  {qaResult.confidenceScore != null && (
                    <div className="mt-4 pt-3 border-t border-hair">
                      <div className="flex justify-between text-11 mb-1">
                        <span className="text-ink-3">Confidence</span>
                        <span className="font-semibold text-ink-1">{qaResult.confidenceScore}%</span>
                      </div>
                      <div className="h-1.5 bg-bg-panel rounded-full overflow-hidden border border-hair">
                        <div
                          className={`h-full rounded-full ${qaResult.confidenceScore >= 70 ? "bg-green" : qaResult.confidenceScore >= 40 ? "bg-amber" : "bg-red"}`}
                          style={{ width: `${qaResult.confidenceScore}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {qaResult.citations.length > 0 && (
                  <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                      Regulatory Sources ({qaResult.citations.length})
                    </div>
                    <div className="space-y-3">
                      {qaResult.citations.map((c, i) => (
                        <div key={i} className="border-l-2 border-brand pl-3">
                          <p className="text-12 font-medium text-ink-0">{c.document}</p>
                          {c.section && <p className="text-11 text-ink-3 mt-0.5">§ {c.section}</p>}
                          {c.jurisdiction && <span className="text-11 text-brand">{c.jurisdiction}</span>}
                          {c.excerpt && <p className="text-11 text-ink-2 mt-1 italic">"{c.excerpt}"</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ModuleLayout>
  );
}
