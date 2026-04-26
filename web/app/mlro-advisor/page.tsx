"use client";

import { useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";

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

export default function MlroAdvisorPage() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ReasoningMode>("multi_perspective");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/mlro-advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          subjectName: "Unknown subject",
          mode,
          audience: "regulator",
        }),
      });
      const rawText = await res.text();
      let data: (AdvisorResult & { error?: string }) | null = null;
      try {
        data = JSON.parse(rawText) as AdvisorResult & { error?: string };
      } catch {
        setError(
          res.status === 504 || res.status === 524
            ? "Request timed out — try Speed or Balanced mode."
            : `Server error ${res.status} — check that ANTHROPIC_API_KEY is configured.`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
        window.requestAnimationFrame(() => {
          document.getElementById("advisor-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setRunning(false);
    }
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
            <button
              type="button"
              onClick={() => { setResult(null); setError(null); }}
              className="text-11 text-ink-3 hover:text-ink-0"
            >
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
                  className={`px-2.5 py-1 rounded text-11 font-medium border transition-colors ${
                    mode === m
                      ? "bg-brand text-white border-brand"
                      : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
                  }`}
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
                <div className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">
                  {result.narrative}
                </div>
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
                          <span
                            className={`text-10 font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                              step.actor === "executor"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-purple-100 text-purple-700"
                            }`}
                          >
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
      </div>
    </ModuleLayout>
  );
}
