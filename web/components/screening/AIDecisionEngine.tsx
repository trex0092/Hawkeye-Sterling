"use client";

import { useState, useEffect, useCallback } from "react";
import type { Subject } from "@/lib/types";
import type { AIDecision, DecisionResponse } from "@/app/api/ai-decision/route";

// ── Config ────────────────────────────────────────────────────────────────────

const DECISION_LABELS: Record<AIDecision, string> = {
  approve: "✓ Approve & Clear",
  edd: "🔍 EDD Required",
  escalate: "⬆ Escalate to MLRO",
  str: "🚨 File STR",
};

const DECISION_COLORS: Record<AIDecision, { bg: string; border: string; text: string }> = {
  approve: { bg: "bg-green-dim", border: "border-green/30", text: "text-green" },
  edd: { bg: "bg-amber-dim", border: "border-amber/30", text: "text-amber" },
  escalate: { bg: "bg-violet-dim", border: "border-violet/30", text: "text-violet" },
  str: { bg: "bg-red-dim", border: "border-red/30", text: "text-red" },
};

const URGENCY_DOT: Record<string, string> = {
  low: "bg-green",
  medium: "bg-amber",
  high: "bg-orange-400",
  critical: "bg-red",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  subject: Subject;
  screeningTopScore?: number;
  screeningSeverity?: string;
  sanctionsHits?: Array<{ list: string; score: number; details?: string }>;
  adverseMediaText?: string;
  /** Live super-brain stress-test output (EU 8th, UK SAMLA, Russia oil
   *  cap, DPRK overseas labour, Iran nuclear, Syria reconstruction,
   *  Cuba CACR, comprehensive regions, Belarus dual-use, Venezuela oil).
   *  When any test fired, the engine surfaces them ahead of the LLM
   *  decision so the analyst sees the regime-specific reasoning. */
  stressTests?: Array<{ regime: string; fired: boolean; severity: "critical" | "high" | "medium" | "low"; rationale: string; citation: string }>;
}

type EngineState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; result: DecisionResponse }
  | { phase: "accepted"; result: DecisionResponse; asanaUrl?: string }
  | { phase: "overriding"; result: DecisionResponse }
  | { phase: "overridden"; result: DecisionResponse; override: AIDecision; notes: string }
  | { phase: "error"; message: string };

export function AIDecisionEngine({
  subject,
  screeningTopScore,
  screeningSeverity,
  sanctionsHits = [],
  adverseMediaText,
  stressTests = [],
}: Props) {
  // Pre-LLM signal: any sanctions stress test that fired against the
  // declared jurisdiction / industry context. Rendered above the
  // decision so the analyst sees regime-specific reasoning even when
  // the AI flow is degraded.
  const firedStressTests = stressTests.filter((t) => t.fired);
  const [state, setState] = useState<EngineState>({ phase: "idle" });
  const [overrideChoice, setOverrideChoice] = useState<AIDecision>("edd");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [learningStats, setLearningStats] = useState<{ total: number; acceptanceRate: number | null } | null>(null);

  // Reset when subject changes
  useEffect(() => {
    setState({ phase: "idle" });
    setOverrideChoice("edd");
    setOverrideNotes("");
  }, [subject.id]);

  // Fetch learning stats once on mount
  useEffect(() => {
    void fetch("/api/ai-decision/feedback")
      .then((r) => r.json())
      .then((d: { total?: number; acceptanceRate?: number | null }) => {
        if (typeof d.total === "number") {
          setLearningStats({ total: d.total, acceptanceRate: d.acceptanceRate ?? null });
        }
      })
      .catch(() => {});
  }, []);

  const runDecision = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/ai-decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          name: subject.name,
          country: subject.country || subject.jurisdiction,
          entityType: subject.entityType,
          riskScore: subject.riskScore,
          listCoverage: subject.listCoverage ?? [],
          sanctionsHits,
          adverseMedia: adverseMediaText,
          pepTier: subject.pep?.tier,
          exposureAED: subject.exposureAED,
          cddPosture: subject.cddPosture,
          screeningTopScore,
          screeningSeverity,
          notes: subject.notes,
        }),
      });
      const data = (await res.json()) as DecisionResponse | { ok: false; error: string };
      if (!res.ok || !data.ok) {
        setState({ phase: "error", message: (data as { error?: string }).error ?? "Decision engine error" });
        return;
      }
      setState({ phase: "ready", result: data as DecisionResponse });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }, [subject, screeningTopScore, screeningSeverity, sanctionsHits, adverseMediaText]);

  const sendFeedback = async (
    result: DecisionResponse,
    outcome: "accepted" | "overridden",
    override?: AIDecision,
    notes?: string,
  ) => {
    setFeedbackSending(true);
    try {
      const res = await fetch("/api/ai-decision/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisionId: result.decisionId,
          subjectId: subject.id,
          subjectProfile: {
            entityType: subject.entityType,
            country: subject.country || subject.jurisdiction,
            riskScore: subject.riskScore,
            sanctionsHits: sanctionsHits.length,
            hasPEP: !!subject.pep,
            exposure: subject.exposureAED ?? "0",
            severity: screeningSeverity ?? "unknown",
          },
          aiDecision: result.decision,
          confidence: result.confidence,
          outcome,
          override,
          notes,
        }),
      });
      const d = (await res.json()) as { total?: number; acceptanceRate?: number | null };
      if (typeof d.total === "number") {
        setLearningStats({ total: d.total, acceptanceRate: d.acceptanceRate ?? null });
      }
    } catch {
      // silent — feedback loss is non-critical
    } finally {
      setFeedbackSending(false);
    }
  };

  const handleAccept = async (result: DecisionResponse) => {
    await sendFeedback(result, "accepted");
    setState({ phase: "accepted", result, asanaUrl: result.asanaTaskUrl });
  };

  const handleOverrideSubmit = async (result: DecisionResponse) => {
    await sendFeedback(result, "overridden", overrideChoice, overrideNotes);
    setState({ phase: "overridden", result, override: overrideChoice, notes: overrideNotes });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="border border-hair-2 rounded-lg overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-bg-2 border-b border-hair-2">
        <div className="flex items-center gap-2">
          <span className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">🤖 AI Decision Engine</span>
          {learningStats && learningStats.total > 0 && (
            <span className="text-10 font-mono text-ink-3 border border-hair-2 rounded px-1.5 py-0.5">
              {learningStats.total} trained · {learningStats.acceptanceRate ?? "—"}% accept rate
            </span>
          )}
        </div>
        {(state.phase === "idle" || state.phase === "error") && (
          <button
            onClick={() => void runDecision()}
            className="px-3 py-1 text-11 font-semibold bg-brand text-white rounded hover:bg-brand/90 transition-colors"
          >
            {state.phase === "error" ? "Retry" : "Run Decision"}
          </button>
        )}
        {state.phase === "ready" && (
          <button
            onClick={() => void runDecision()}
            className="px-2.5 py-1 text-10 font-mono text-ink-2 border border-hair-2 rounded hover:border-ink-2 transition-colors"
          >
            Re-run
          </button>
        )}
      </div>

      <div className="p-4">
        {/* Pre-LLM stress-test alerts — visible regardless of phase */}
        {firedStressTests.length > 0 && (
          <div className="mb-3 rounded-lg border border-red/40 bg-red/5 p-3">
            <div className="text-10 font-semibold uppercase tracking-wide-3 text-red mb-2">
              ⚠ {firedStressTests.length} sanctions stress test{firedStressTests.length === 1 ? "" : "s"} fired
            </div>
            <ul className="space-y-1.5">
              {firedStressTests.map((t) => (
                <li key={t.regime} className="text-11 text-ink-1">
                  <strong className="text-red">{t.regime}</strong>{" "}
                  <span className="text-10 font-mono uppercase text-ink-2">{t.severity}</span>
                  <div className="text-10 text-ink-2">{t.rationale}</div>
                  <div className="text-10 text-ink-3 font-mono">{t.citation}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Idle */}
        {state.phase === "idle" && (
          <div className="text-center py-6">
            <div className="text-28 mb-2">🤖</div>
            <p className="text-12 text-ink-2 mb-3">
              AI analyses this subject and automatically decides the disposition —
              approve, EDD, escalate, or STR.
            </p>
            <p className="text-11 text-ink-3">
              Decision auto-creates an Asana task. Your feedback improves future accuracy.
            </p>
          </div>
        )}

        {/* Loading */}
        {state.phase === "loading" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
            <p className="text-12 text-ink-2">Analysing subject · checking learning context · deciding…</p>
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <div className="text-12 text-red bg-red-dim border border-red/20 rounded px-3 py-2">
            {state.message}
          </div>
        )}

        {/* Ready — decision shown */}
        {(state.phase === "ready" || state.phase === "overriding") && (() => {
          const result = state.result;
          const col = DECISION_COLORS[result.decision];
          return (
            <div className="flex flex-col gap-4">
              {/* Decision badge */}
              <div className={`flex items-center justify-between p-3 rounded-md ${col.bg} border ${col.border}`}>
                <div>
                  <div className={`text-15 font-bold ${col.text}`}>{DECISION_LABELS[result.decision]}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${URGENCY_DOT[result.urgency] ?? "bg-ink-3"}`}
                    />
                    <span className="text-10 font-mono text-ink-2 uppercase tracking-wide">
                      {result.urgency} urgency · {result.confidence}% confidence
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {/* Confidence ring */}
                  <svg width="44" height="44" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" className="stroke-hair-2" />
                    <circle
                      cx="22" cy="22" r="18"
                      fill="none" strokeWidth="4"
                      strokeDasharray={`${(result.confidence / 100) * 113} 113`}
                      strokeLinecap="round"
                      transform="rotate(-90 22 22)"
                      className={col.text.replace("text-", "stroke-")}
                      style={{ transition: "stroke-dasharray 0.6s ease" }}
                    />
                    <text x="22" y="26" textAnchor="middle" className="fill-ink-0" style={{ fontSize: "11px", fontWeight: 600 }}>
                      {result.confidence}%
                    </text>
                  </svg>
                </div>
              </div>

              {/* Rationale */}
              <div>
                <div className="text-10 font-mono uppercase tracking-wide text-ink-2 mb-1.5">Rationale</div>
                <p className="text-12 text-ink-1 leading-relaxed">{result.rationale}</p>
              </div>

              {/* Key factors */}
              {result.keyFactors.length > 0 && (
                <div>
                  <div className="text-10 font-mono uppercase tracking-wide text-ink-2 mb-1.5">Key factors</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.keyFactors.map((f, i) => (
                      <span key={i} className="text-11 font-mono bg-bg-2 border border-hair-2 rounded px-2 py-0.5 text-ink-1">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Next steps */}
              {result.nextSteps.length > 0 && (
                <div>
                  <div className="text-10 font-mono uppercase tracking-wide text-ink-2 mb-1.5">Next steps</div>
                  <ul className="space-y-1">
                    {result.nextSteps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                        <span className="text-brand mt-0.5 shrink-0">→</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Regulatory basis */}
              <div className="text-11 font-mono text-ink-3 border-t border-hair-2 pt-2">
                {result.regulatoryBasis}
              </div>

              {/* Asana auto-task */}
              {result.asanaTaskUrl && (
                <div className="flex items-center gap-2 text-11 bg-green-dim border border-green/20 rounded px-3 py-2">
                  <span className="text-green">✓</span>
                  <span className="text-green">Asana task auto-created</span>
                  <a href={result.asanaTaskUrl} target="_blank" rel="noreferrer" className="text-green underline ml-auto">
                    view task →
                  </a>
                </div>
              )}
              {!result.asanaTaskUrl && (
                <div className="text-11 font-mono text-ink-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber" />
                  Asana auto-task skipped (ASANA_TOKEN not configured)
                </div>
              )}

              {/* Override form */}
              {state.phase === "overriding" && (
                <div className="border border-hair-2 rounded-md p-3 bg-bg-2 flex flex-col gap-2.5">
                  <div className="text-11 font-mono uppercase tracking-wide text-ink-2">Override decision</div>
                  <div className="flex flex-wrap gap-2">
                    {(["approve", "edd", "escalate", "str"] as AIDecision[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setOverrideChoice(d)}
                        className={`px-3 py-1.5 rounded text-11 font-mono font-semibold border transition-colors ${
                          overrideChoice === d
                            ? `${DECISION_COLORS[d].bg} ${DECISION_COLORS[d].border} ${DECISION_COLORS[d].text}`
                            : "border-hair-2 text-ink-2 hover:border-ink-2"
                        }`}
                      >
                        {DECISION_LABELS[d]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                    placeholder="Reason for override (helps the AI learn — optional)"
                    rows={2}
                    className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleOverrideSubmit(result)}
                      disabled={feedbackSending}
                      className="flex-1 py-1.5 rounded bg-amber text-black text-12 font-semibold hover:bg-amber/90 disabled:opacity-50 transition-colors"
                    >
                      {feedbackSending ? "Saving…" : "Confirm override"}
                    </button>
                    <button
                      onClick={() => setState({ phase: "ready", result })}
                      className="px-3 py-1.5 border border-hair-2 text-ink-2 text-12 rounded hover:text-ink-0"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {state.phase === "ready" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => void handleAccept(result)}
                    disabled={feedbackSending}
                    className="flex-1 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-50 transition-colors"
                  >
                    {feedbackSending ? "Recording…" : "✓ Accept decision"}
                  </button>
                  <button
                    onClick={() => setState({ phase: "overriding", result })}
                    disabled={feedbackSending}
                    className="px-4 py-2 border border-hair-2 text-ink-1 text-12 rounded hover:border-amber hover:text-amber transition-colors"
                  >
                    ↩ Override
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Accepted state */}
        {state.phase === "accepted" && (() => {
          const col = DECISION_COLORS[state.result.decision];
          return (
            <div className="flex flex-col gap-3">
              <div className={`flex items-center gap-3 p-3 rounded-md ${col.bg} border ${col.border}`}>
                <span className={`text-20 ${col.text}`}>✓</span>
                <div>
                  <div className={`text-13 font-bold ${col.text}`}>Decision accepted</div>
                  <div className="text-11 text-ink-2">
                    {DECISION_LABELS[state.result.decision]} · {state.result.confidence}% confidence
                  </div>
                </div>
              </div>
              {state.asanaUrl && (
                <a
                  href={state.asanaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-11 bg-green-dim border border-green/20 rounded px-3 py-2 text-green no-underline hover:opacity-80"
                >
                  <span>✓</span>
                  <span>Asana task created</span>
                  <span className="underline ml-auto">view task →</span>
                </a>
              )}
              <div className="text-11 font-mono text-ink-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green" />
                Feedback recorded · AI will learn from this outcome
              </div>
              <button
                onClick={() => void runDecision()}
                className="text-11 font-mono text-ink-2 hover:text-ink-0 transition-colors self-start"
              >
                Run again →
              </button>
            </div>
          );
        })()}

        {/* Overridden state */}
        {state.phase === "overridden" && (() => {
          const col = DECISION_COLORS[state.override];
          return (
            <div className="flex flex-col gap-3">
              <div className={`p-3 rounded-md ${col.bg} border ${col.border}`}>
                <div className={`text-13 font-bold ${col.text}`}>Decision overridden</div>
                <div className="text-11 text-ink-2 mt-0.5">
                  AI suggested: <span className="font-mono">{state.result.decision}</span> → You chose:{" "}
                  <span className="font-mono font-semibold">{state.override}</span>
                </div>
                {state.notes && (
                  <div className="text-11 text-ink-2 mt-1 italic">"{state.notes}"</div>
                )}
              </div>
              <div className="text-11 font-mono text-ink-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber" />
                Override recorded · AI will adjust future decisions
              </div>
              <button
                onClick={() => void runDecision()}
                className="text-11 font-mono text-ink-2 hover:text-ink-0 transition-colors self-start"
              >
                Run again →
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
