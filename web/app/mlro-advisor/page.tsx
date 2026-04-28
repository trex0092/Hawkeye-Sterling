"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReasoningMode = "quick" | "speed" | "balanced" | "multi_perspective";

interface ReasoningStep {
  stepNo: number;
  actor: "executor" | "advisor";
  modelId: string;
  at: string;
  summary: string;
  body: string;
}

interface QuestionAnalysis {
  primaryTopic: string;
  topics: string[];
  jurisdictions: string[];
  regimes: string[];
  typologies: string[];
  doctrineHints: string[];
  playbookHints: string[];
  redFlagHints: string[];
  fatfRecHints: string[];
  fatfRecDetails?: Array<{ id: string; num: number; title: string; citation: string; pillar: string }>;
  urgencyFlags: string[];
  numericThresholds: Array<{ value: number; unit: string; context: string }>;
  commonSenseRules: string[];
  suggestedFollowUps: string[];
  confidence: "high" | "medium" | "low";
  intelligenceProfile?: {
    coverageScore: number;
    doctrineCount: number;
    fatfRecCount: number;
    playbookCount: number;
    redFlagCount: number;
    typologyCount: number;
    jurisdictionCount: number;
    secondaryTopicCount: number;
    totalArtefacts: number;
  };
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
  questionAnalysis?: QuestionAnalysis;
  error?: string;
}

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
  source?: string;
  error?: string;
}

interface QaHistoryEntry {
  id: string;
  question: string;
  result: ComplianceAnswer;
  askedAt: string;
}

interface AdvisorHistoryEntry {
  id: string;
  question: string;
  mode: ReasoningMode;
  result: AdvisorResult;
  askedAt: string;
  expanded: boolean;
}

// ── Suggested questions ───────────────────────────────────────────────────────
// Sources: UAE FDL 20/2018 & Cabinet Decision 10/2019, MoE DPMS rules, UAE FIU
// (goAML), EOCN sanctions guidance, LBMA Responsible Gold Guidance, OECD CAHRA
// 5-step Due Diligence, FATF 40 Recommendations, RMI RMAP / CMRT.

const SUGGESTED_GROUPS = [
  {
    label: "UAE FDL & Cabinet Decision",
    questions: [
      "What is the record-retention period under UAE FDL 20/2018 Art.16?",
      "What are the STR reporting obligations under UAE FDL 20/2018?",
      "What are the tipping-off prohibitions under UAE FDL 20/2018 Art.25?",
      "What CDD measures does UAE Cabinet Decision 10/2019 require?",
    ],
  },
  {
    label: "MoE / DPMS",
    questions: [
      "What is the DPMS cash-transaction reporting threshold under MoE Circular 08/2021?",
      "What CDD applies to a UAE gold trader under MoE DPMS rules?",
      "Is goAML registration mandatory for MoE-supervised DPMS?",
      "What red flags must DPMS dealers monitor under MoE guidance?",
    ],
  },
  {
    label: "UAE FIU / goAML",
    questions: [
      "What is the STR submission timeline to the UAE FIU via goAML?",
      "When must an Additional Information File (AIF) be filed via goAML?",
      "What narrative elements must a goAML STR contain?",
      "Can a reporting entity disclose an STR to the subject?",
    ],
  },
  {
    label: "EOCN Sanctions",
    questions: [
      "How often must we re-screen against the UAE EOCN consolidated list?",
      "What is the freezing-action timeline under EOCN guidance?",
      "What records must be kept on EOCN sanctions screening?",
      "How do we handle a true positive against the EOCN list?",
    ],
  },
  {
    label: "LBMA Responsible Gold",
    questions: [
      "What does the LBMA Responsible Gold Guidance require at Step 1?",
      "What KYC standards apply under the LBMA RGG?",
      "What is the LBMA Step 3 supplier audit obligation?",
      "What public reporting does LBMA Step 5 require?",
    ],
  },
  {
    label: "OECD CAHRA Due Diligence",
    questions: [
      "What are the 5 steps of the OECD Due Diligence Guidance?",
      "What red flags trigger Step 3 enhanced due diligence under OECD guidance?",
      "What disengagement criteria does OECD guidance set for high-risk suppliers?",
      "What public reporting does OECD Step 5 require?",
    ],
  },
  {
    label: "FATF Recommendations",
    questions: [
      "What does FATF Recommendation 16 require for wire transfers?",
      "What does FATF Recommendation 12 require for PEPs?",
      "What does FATF Recommendation 15 require of VASPs?",
      "What ownership threshold does FATF Recommendation 24 apply to UBOs?",
    ],
  },
  {
    label: "RMI Minerals",
    questions: [
      "What does the RMI Responsible Minerals Assurance Process (RMAP) require?",
      "What is the RMI Conflict Minerals Reporting Template (CMRT) used for?",
      "What is the RMI smelter audit cadence?",
      "How does RMI align with OECD 5-step due diligence?",
    ],
  },
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const tabCls = (active: boolean) =>
  `px-2.5 py-1 rounded text-11 font-medium border transition-colors ${
    active
      ? "bg-brand text-white border-brand"
      : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
  }`;

const verdictCls = (v: string) => {
  if (v === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-300";
  if (v === "blocked") return "bg-red-100 text-red-700 border-red-300";
  if (v === "returned_for_revision") return "bg-amber-50 text-amber-700 border-amber-300";
  return "bg-gray-100 text-gray-600 border-gray-300";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportQaSession(history: QaHistoryEntry[]) {
  const lines: string[] = [`MLRO Regulatory Q&A Session Export — ${new Date().toISOString()}`, "=".repeat(72), ""];
  for (const entry of history) {
    lines.push(`Q [${entry.askedAt}]: ${entry.question}`);
    lines.push(`A: ${entry.result.answer ?? "(no answer)"}`);
    if (entry.result.citations.length > 0) {
      lines.push(`Sources: ${entry.result.citations.map((c) => c.document).join("; ")}`);
    }
    if (entry.result.confidenceScore != null) {
      lines.push(`Confidence: ${entry.result.confidenceScore}%`);
    }
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mlro-qa-session-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAdvisorSession(history: AdvisorHistoryEntry[]) {
  const lines: string[] = [`MLRO Advisor Session Export — ${new Date().toISOString()}`, "=".repeat(72), ""];
  for (const entry of history) {
    lines.push(`Q [${entry.askedAt}] mode:${entry.mode}: ${entry.question}`);
    lines.push(`Verdict: ${entry.result.complianceReview.advisorVerdict}`);
    if (entry.result.narrative) lines.push(`Narrative: ${entry.result.narrative}`);
    lines.push(`Elapsed: ${entry.result.elapsedMs}ms`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mlro-advisor-session-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MlroAdvisorPage() {
  const [pageTab, setPageTab] = useState<"advisor" | "regulatory-qa">("advisor");

  // ── Advisor state ────────────────────────────────────────────────────────────
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ReasoningMode>("quick");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisorHistory, setAdvisorHistory] = useState<AdvisorHistoryEntry[]>([]);
  /** ID of the entry currently being streamed (Quick mode). null when idle. */
  const [streamingEntryId, setStreamingEntryId] = useState<string | null>(null);

  const CLIENT_TIMEOUTS: Record<ReasoningMode, number> = {
    quick: 15_000,
    speed: 9_000,
    balanced: 45_000,
    multi_perspective: 600_000,
  };

  const recordAdvisorEntry = useCallback((q: string, m: ReasoningMode, data: AdvisorResult) => {
    setAdvisorHistory((prev) => [
      {
        id: `adv-${Date.now()}`,
        question: q,
        mode: m,
        result: data,
        askedAt: new Date().toLocaleTimeString(),
        expanded: false,
      },
      ...prev,
    ]);
    setQuestion("");
  }, []);

  /**
   * Run a Quick-mode answer via /api/mlro-advisor-quick. Single-pass
   * Haiku 4.5, no extended thinking, brain-classifier-grounded prompt.
   * Returns a single JSON {answer, elapsedMs} — Netlify Lambda buffers
   * responses regardless, so genuine SSE streaming wasn't reaching the
   * client. Target end-to-end latency: 3-7 s. The placeholder entry
   * appears instantly while the request is in flight so the user has
   * visual feedback.
   */
  const runQuick = useCallback(async (q: string): Promise<void> => {
    const entryId = `adv-${Date.now()}`;
    const startedAt = new Date();

    setAdvisorHistory((prev) => [
      {
        id: entryId,
        question: q,
        mode: "quick" as const,
        result: {
          ok: true,
          mode: "quick",
          elapsedMs: 0,
          partial: false,
          reasoningTrail: [],
          narrative: "",
          complianceReview: { advisorVerdict: "approved", issues: [] },
        },
        askedAt: startedAt.toLocaleTimeString(),
        expanded: true,
      },
      ...prev,
    ]);
    setQuestion("");
    setStreamingEntryId(entryId);

    const ctl = new AbortController();
    const killTimer = setTimeout(() => ctl.abort(), CLIENT_TIMEOUTS.quick);

    try {
      const res = await fetch("/api/mlro-advisor-quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: ctl.signal,
      });
      const data = (await res.json()) as { ok: boolean; answer?: string; error?: string; elapsedMs?: number };
      if (!data.ok || !data.answer) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setAdvisorHistory((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, result: { ...e.result, narrative: data.answer ?? "", elapsedMs: data.elapsedMs ?? Date.now() - startedAt.getTime() } }
            : e,
        ),
      );
    } catch (err) {
      // Drop the placeholder entry on error so the catch in handleAsk
      // can render the error banner cleanly.
      setAdvisorHistory((prev) => prev.filter((e) => e.id !== entryId));
      throw err;
    } finally {
      clearTimeout(killTimer);
      setStreamingEntryId(null);
    }
  }, [CLIENT_TIMEOUTS.quick]);

  // multi_perspective is offloaded to the Netlify Background Function so it
  // is not killed by Netlify's ~26 s edge inactivity timeout. Speed and
  // Balanced still use the synchronous route.
  const runDeepBackground = useCallback(async (q: string, m: ReasoningMode): Promise<void> => {
    const jobId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const startResp = await fetch("/.netlify/functions/mlro-advisor-deep-background", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, question: q, mode: m, audience: "regulator" }),
    });
    if (startResp.status === 404) {
      // Background function isn't deployed in this environment (e.g. local
      // `next dev` without `netlify dev`). Fall through to sync.
      throw new Error("__no_background__");
    }
    if (startResp.status !== 202 && !startResp.ok) {
      const txt = await startResp.text().catch(() => "");
      throw new Error(`Background start failed (HTTP ${startResp.status}): ${txt.slice(0, 240)}`);
    }

    const pollDeadline = Date.now() + CLIENT_TIMEOUTS.multi_perspective;
    let pollIntervalMs = 2_500;
    // Allow a brief grace period for the first blob write before the GET
    // can find the record.
    let notFoundStreak = 0;
    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      pollIntervalMs = Math.min(pollIntervalMs + 500, 5_000);
      const pollResp = await fetch(`/api/advisor-job/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: { "cache-control": "no-store" },
      });
      if (pollResp.status === 404) {
        notFoundStreak += 1;
        if (notFoundStreak > 30) {
          throw new Error("Background job never reported in — check function logs.");
        }
        continue;
      }
      notFoundStreak = 0;
      const rawText = await pollResp.text();
      let payload: { ok: boolean; status?: string; result?: AdvisorResult; error?: string } | null = null;
      try { payload = JSON.parse(rawText); } catch { /* ignore */ }
      if (!payload) continue;
      if (payload.status === "done" && payload.result) {
        recordAdvisorEntry(q, m, payload.result);
        return;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error ?? payload.result?.error ?? "advisor pipeline failed");
      }
      // status === "running" → keep polling
    }
    throw new Error("Multi (Deep) timed out — check Netlify function logs.");
  }, [CLIENT_TIMEOUTS.multi_perspective, recordAdvisorEntry]);

  const runSynchronous = useCallback(async (q: string, m: ReasoningMode): Promise<void> => {
    const ctl = new AbortController();
    const syncTimeout = m === "multi_perspective" ? 110_000 : CLIENT_TIMEOUTS[m];
    const timer = setTimeout(() => ctl.abort(), syncTimeout);
    try {
      const res = await fetch("/api/mlro-advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, subjectName: "Regulatory Query", mode: m, audience: "regulator" }),
        signal: ctl.signal,
      });
      const rawText = await res.text();
      let data: AdvisorResult | null = null;
      try { data = JSON.parse(rawText) as AdvisorResult; }
      catch {
        throw new Error(
          res.status === 504 || res.status === 524
            ? "Request timed out — try Speed or Balanced mode."
            : `Server error ${res.status} — check ANTHROPIC_API_KEY is configured.`,
        );
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? data.guidance ?? `HTTP ${res.status}`);
      }
      recordAdvisorEntry(q, m, data);
    } finally {
      clearTimeout(timer);
    }
  }, [CLIENT_TIMEOUTS, recordAdvisorEntry]);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setRunning(true);
    setError(null);
    try {
      if (mode === "quick") {
        await runQuick(q);
      } else if (mode === "multi_perspective") {
        try {
          await runDeepBackground(q, mode);
        } catch (err) {
          // Fall back to the synchronous route only when the background
          // function isn't reachable (local dev). Real failures should
          // surface to the user.
          if (err instanceof Error && err.message === "__no_background__") {
            await runSynchronous(q, mode);
          } else {
            throw err;
          }
        }
      } else {
        await runSynchronous(q, mode);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(mode === "quick"
          ? "Quick mode timed out (>15 s) — try again or switch to Balanced."
          : mode === "speed"
            ? "Speed mode timed out (>9 s) — check server logs or try again."
            : "Request timed out — try Quick or Balanced mode.");
      } else {
        setError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      setRunning(false);
    }
  }, [question, mode, runQuick, runDeepBackground, runSynchronous]);

  const toggleAdvisorEntry = (id: string) =>
    setAdvisorHistory((prev) =>
      prev.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e)),
    );

  // ── Regulatory Q&A state ─────────────────────────────────────────────────────
  const [qaQuery, setQaQuery] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaHistory, setQaHistory] = useState<QaHistoryEntry[]>([]);
  const [qaDepth, setQaDepth] = useState<"balanced" | "deep">("balanced");
  const [qaUseTools, setQaUseTools] = useState<boolean>(true);
  const [openGroupIdx, setOpenGroupIdx] = useState<number | null>(0);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (qaHistory.length > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [qaHistory.length]);

  const handleQaAsk = useCallback(async (q?: string) => {
    const query = (q ?? qaQuery).trim();
    if (!query) return;
    setQaQuery(query);
    setQaLoading(true);
    setQaError(null);
    try {
      const res = await fetch("/api/compliance-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, mode: "multi-agent", depth: qaDepth, useTools: qaUseTools }),
      });
      const rawText = await res.text();
      let data: (ComplianceAnswer & { partialAnswer?: string }) | null = null;
      try {
        data = rawText ? JSON.parse(rawText) as ComplianceAnswer : null;
      } catch {
        // Body wasn't JSON — likely a Netlify HTML error page (504 timeout,
        // 502 bad gateway, etc.). Surface the HTTP status + a snippet so the
        // user (and we) can actually see what happened.
        const snippet = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
        setQaError(
          `Server returned HTTP ${res.status} ${res.statusText || ""} (non-JSON body). ` +
          (snippet ? `Detail: ${snippet}` : "Likely a function timeout — try again or use the MLRO Advisor tab."),
        );
        return;
      }
      if (!data || !data.ok) {
        const baseError = data?.error ?? `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
        const suffix = data?.partialAnswer ? ` Partial answer captured below.` : "";
        setQaError(`${baseError}${suffix}`);
        if (data?.partialAnswer) {
          setQaHistory((prev) => [
            ...prev,
            {
              id: `qa-${Date.now()}`,
              question: query,
              result: { ...data, ok: true, answer: data.partialAnswer, citations: [], passedQualityGate: false, source: "mlro-advisor-fallback" } as ComplianceAnswer,
              askedAt: new Date().toLocaleTimeString(),
            },
          ]);
          setQaQuery("");
        }
      } else {
        setQaHistory((prev) => [
          ...prev,
          {
            id: `qa-${Date.now()}`,
            question: query,
            result: data,
            askedAt: new Date().toLocaleTimeString(),
          },
        ]);
        setQaQuery("");
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setQaError(`Request failed: ${detail}`);
    } finally {
      setQaLoading(false);
    }
  }, [qaQuery, qaDepth, qaUseTools]);

  return (
    <ModuleLayout asanaModule="mlro-advisor" asanaLabel="MLRO Advisor" engineLabel="MLRO Advisor">
      <ModuleHero
        eyebrow="Module 09 · Deep Reasoning"
        title="MLRO"
        titleEm="advisor."
        intro={
          <>
            <strong>Quick mode default — answers stream in ~5 s.</strong> Haiku 4.5
            grounded by the brain&apos;s rule-based classifier (FATF Recs, playbooks,
            red flags, doctrines).{" "}
            <span className="text-ink-3">
              50 MLRO topics · 250 common-sense rules · 40 FATF Recs. Switch to
              Balanced or Deep for charter-gated executor → advisor reasoning trails.
            </span>
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

        {/* ── MLRO Advisor tab ──────────────────────────────────────────────── */}
        {pageTab === "advisor" && (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
                  Deep Reasoning · MLRO Advisor
                </div>
                <div className="text-12 text-ink-2">
                  Sonnet executor → Opus advisor · 132 directives · charter P1–P10
                  <span className="ml-2 text-ink-3">— standalone mode</span>
                </div>
              </div>
              {advisorHistory.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportAdvisorSession(advisorHistory)}
                    className="text-11 text-ink-3 hover:text-brand border border-hair-2 hover:border-brand px-2.5 py-1 rounded transition-colors"
                  >
                    Export session
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvisorHistory([])}
                    className="text-11 text-ink-3 hover:text-red"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="space-y-2 mb-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handleAsk(); }}
                disabled={running}
                rows={3}
                placeholder='Ask the MLRO Advisor a compliance question — e.g. "What CDD is required for a UAE gold trader?"'
                className="w-full px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-bg-panel resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {/* Live classification badges (debounced 400ms) */}
              <LiveClassifierBadges question={question} />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-11 font-semibold text-ink-2 uppercase tracking-wide-3">Mode</span>
                  {(["quick", "speed", "balanced", "multi_perspective"] as const).map((m) => {
                    const label =
                      m === "quick"             ? "Quick (~5 s)" :
                      m === "multi_perspective" ? "Deep" :
                      m === "balanced"          ? "Balanced" :
                      m === "speed"             ? "Speed" : m;
                    const title =
                      m === "quick"             ? "Haiku 4.5 streaming, single-pass, brain-classifier-grounded. Default for everyday Q&A. ~5 s." :
                      m === "multi_perspective" ? "Sonnet executor → Opus advisor → challenger. Deepest reasoning, charter-gated. ~2 min." :
                      m === "balanced"          ? "Sonnet advisor only, ~40 s. No executor stage." :
                      "Sonnet executor only, ~9 s. No advisor review.";
                    return (
                      <button key={m} type="button" onClick={() => setMode(m)} className={tabCls(mode === m)} title={title}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex-1" />
                <span className="text-10 text-ink-3 font-mono">⌘+Enter to submit</span>
                <button
                  type="button"
                  onClick={() => { void handleAsk(); }}
                  disabled={!question.trim() || running}
                  className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {running ? (mode === "quick" ? "Streaming…" : "Analysing…") : "Ask Advisor"}
                </button>
              </div>
            </div>

            {running && mode !== "quick" && (
              <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center border border-hair-2 rounded-lg bg-bg-1 mb-4">
                <span className="animate-pulse font-mono text-brand">●</span>
                {mode === "speed"
                  ? "Speed mode — Sonnet executor only, ~9 s…"
                  : mode === "balanced"
                  ? "Balanced mode — Sonnet advisor, ~40 s…"
                  : "Deep mode — Sonnet → Opus → challenger via background job · up to ~2 min, polling for result…"}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-13 text-red-700 mb-4">
                <span className="font-semibold">Advisor error:</span> {error}
              </div>
            )}

            {/* Session log */}
            {advisorHistory.length > 0 && (
              <div className="space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
                  Session — {advisorHistory.length} {advisorHistory.length === 1 ? "query" : "queries"}
                </div>
                {advisorHistory.map((entry) => (
                  <div key={entry.id} className="border border-hair-2 rounded-xl bg-bg-1 overflow-hidden">
                    {/* Entry header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleAdvisorEntry(entry.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleAdvisorEntry(entry.id); }}
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-bg-panel transition-colors cursor-pointer"
                    >
                      <span
                        className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded border text-10 font-semibold uppercase tracking-wide-2 flex-shrink-0 ${verdictCls(entry.result.complianceReview.advisorVerdict)}`}
                      >
                        {entry.result.complianceReview.advisorVerdict.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-13 text-ink-0 font-medium truncate">{entry.question}</p>
                        <p className="text-10 text-ink-3 font-mono mt-0.5">
                          {entry.askedAt} · mode:{entry.mode} · {entry.result.elapsedMs}ms
                          {entry.result.partial && " · partial"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setQuestion(entry.question); setMode(entry.mode); }}
                          aria-label="Edit question"
                          title="Edit question — load into input"
                          className="p-1 rounded text-ink-3 hover:text-brand hover:bg-brand-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdvisorHistory((prev) => prev.filter((e) => e.id !== entry.id))}
                          aria-label="Delete entry"
                          title="Delete entry"
                          className="p-1 rounded text-ink-3 hover:text-red hover:bg-red-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                        <span className="text-11 text-ink-3 ml-1">{entry.expanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Entry detail */}
                    {entry.expanded && (
                      <div className="border-t border-hair-2 px-4 pb-4 pt-3 space-y-3">
                        {entry.result.complianceReview.issues.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="text-11 font-semibold uppercase tracking-wide-3 text-amber-700 mb-1">Charter issues</div>
                            <ul className="list-disc list-inside space-y-0.5">
                              {entry.result.complianceReview.issues.map((issue) => (
                                <li key={issue} className="text-12 text-amber-800">{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {entry.result.guidance && (
                          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
                            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">Guidance</div>
                            <p className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">{entry.result.guidance}</p>
                          </div>
                        )}
                        {(entry.result.narrative || streamingEntryId === entry.id) && (
                          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
                            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1 flex items-center gap-2">
                              <span>{entry.mode === "quick" ? "Answer" : "Regulator-facing narrative"}</span>
                              {streamingEntryId === entry.id && (
                                <span className="font-mono text-brand animate-pulse">● working ~5 s</span>
                              )}
                            </div>
                            <div className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">
                              {entry.result.narrative || (streamingEntryId === entry.id ? "" : "")}
                              {streamingEntryId === entry.id && (
                                <span className="inline-block w-1.5 h-4 bg-brand ml-0.5 animate-pulse align-middle" />
                              )}
                            </div>
                          </div>
                        )}
                        {entry.result.questionAnalysis && (
                          <ClassifierResultPanels
                            analysis={entry.result.questionAnalysis}
                            onPick={(q) => setQuestion(q)}
                          />
                        )}
                        {entry.result.reasoningTrail.length > 0 && (
                          <details className="group">
                            <summary className="text-11 font-semibold uppercase tracking-wide-3 text-ink-3 cursor-pointer hover:text-ink-1 select-none">
                              Reasoning trail ({entry.result.reasoningTrail.length} steps) ▶
                            </summary>
                            <div className="mt-2 space-y-1.5">
                              {entry.result.reasoningTrail.map((step) => (
                                <div key={step.stepNo} className="border border-hair rounded-lg bg-bg-1 p-2.5">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-10 font-mono font-bold px-1.5 py-0.5 rounded uppercase ${step.actor === "executor" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                      {step.actor}
                                    </span>
                                    <span className="text-10 font-mono text-ink-3">{step.modelId}</span>
                                    <span className="text-10 text-ink-3">{step.at}</span>
                                    <span className="flex-1 text-12 text-ink-1 truncate">{step.summary}</span>
                                  </div>
                                  <pre className="text-10 text-ink-2 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{step.body}</pre>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <AsanaReportButton payload={{
                            module: "mlro-advisor",
                            label: `MLRO Advisory · ${entry.result.complianceReview.advisorVerdict.replace(/_/g, " ")}`,
                            summary: `Q: ${entry.question.slice(0, 80)} | Verdict: ${entry.result.complianceReview.advisorVerdict} | Mode: ${entry.mode} | ${entry.result.elapsedMs}ms`,
                            metadata: { verdict: entry.result.complianceReview.advisorVerdict, mode: entry.mode, issues: entry.result.complianceReview.issues.length },
                          }} />
                          {entry.result.charterIntegrityHash && (
                            <span className="text-10 text-ink-3 font-mono">
                              hash:{entry.result.charterIntegrityHash.slice(0, 12)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {advisorHistory.length === 0 && !running && !error && (
              <div className="text-center py-10 text-ink-3 text-12 border border-dashed border-hair-2 rounded-xl">
                No queries yet — ask the MLRO Advisor a compliance question above.
              </div>
            )}
          </>
        )}

        {/* ── Regulatory Q&A tab ────────────────────────────────────────────── */}
        {pageTab === "regulatory-qa" && (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
                  Regulatory Q&A
                </div>
                <div className="text-12 text-ink-2">
                  Source-cited regulatory answers via AML-MultiAgent-RAG — 4-agent pipeline with confidence and consistency quality gates.
                  Falls back to MLRO Advisor pipeline when external RAG is unavailable.
                </div>
              </div>
              {qaHistory.length > 0 && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => exportQaSession(qaHistory)}
                    className="text-11 text-ink-3 hover:text-brand border border-hair-2 hover:border-brand px-2.5 py-1 rounded transition-colors"
                  >
                    Export Q&A
                  </button>
                  <button
                    type="button"
                    onClick={() => setQaHistory([])}
                    className="text-11 text-ink-3 hover:text-red"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 mb-4">
              <textarea
                className="w-full border border-hair-2 rounded px-3 py-2 text-13 bg-bg-panel focus:outline-none focus:border-brand resize-none text-ink-0"
                rows={3}
                placeholder="Ask a regulatory question…"
                value={qaQuery}
                onChange={(e) => setQaQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handleQaAsk(); }}
              />
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-11 text-ink-3">⌘+Enter to submit</span>
                  <div className="flex items-center gap-1.5 border border-hair-2 rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => setQaDepth("balanced")}
                      title="Advisor only · ~45 s · safe on every Netlify tier"
                      className={`text-11 px-2 py-1 rounded ${qaDepth === "balanced" ? "bg-brand text-white" : "text-ink-2 hover:text-ink-0"}`}
                    >
                      Balanced
                    </button>
                    <button
                      type="button"
                      onClick={() => setQaDepth("deep")}
                      title="Executor → Advisor (multi-perspective) · ~90 s · requires extended function timeout"
                      className={`text-11 px-2 py-1 rounded ${qaDepth === "deep" ? "bg-brand text-white" : "text-ink-2 hover:text-ink-0"}`}
                    >
                      Deep
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-11 text-ink-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={qaUseTools}
                      onChange={(e) => setQaUseTools(e.target.checked)}
                      className="accent-brand"
                    />
                    Live lookups
                  </label>
                </div>
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

            {qaLoading && (
              <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center border border-hair-2 rounded-lg bg-bg-1 mb-4">
                <span className="animate-pulse font-mono text-brand">●</span>
                Pipeline running — RAG or MLRO Advisor fallback…
              </div>
            )}

            {qaError && (
              <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mb-4">
                <span className="font-semibold">Error:</span> {qaError}
              </div>
            )}

            {/* Q&A History */}
            {qaHistory.length > 0 && (
              <div className="space-y-3 mb-5">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
                  Session — {qaHistory.length} {qaHistory.length === 1 ? "answer" : "answers"}
                </div>
                {qaHistory.map((entry) => (
                  <div key={entry.id} className="border border-hair-2 rounded-xl overflow-hidden">
                    {/* Question */}
                    <div className="bg-bg-1 px-4 py-2.5 border-b border-hair flex items-start gap-2">
                      <span className="text-11 font-mono text-ink-3 flex-shrink-0 mt-0.5">{entry.askedAt}</span>
                      <p className="text-13 text-ink-0 font-medium flex-1">{entry.question}</p>
                      {entry.result.source === "mlro-advisor-fallback" && (
                        <span className="text-10 bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                          Advisor fallback
                        </span>
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setQaQuery(entry.question)}
                          aria-label="Edit question"
                          title="Edit question — load into input"
                          className="p-1 rounded text-ink-3 hover:text-brand hover:bg-brand-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQaHistory((prev) => prev.filter((e) => e.id !== entry.id))}
                          aria-label="Delete entry"
                          title="Delete entry"
                          className="p-1 rounded text-ink-3 hover:text-red hover:bg-red-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {/* Answer */}
                    <div className="px-4 py-3 bg-bg-panel">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-11 px-2 py-0.5 rounded-full border font-semibold ${entry.result.passedQualityGate ? "bg-green-dim border-green/30 text-green" : "bg-amber-dim border-amber/30 text-amber"}`}>
                          {entry.result.passedQualityGate ? "✓ Quality gate passed" : "⚠ Below threshold"}
                        </span>
                        {entry.result.confidenceScore != null && (
                          <span className="text-11 text-ink-3 font-mono">confidence {entry.result.confidenceScore}%</span>
                        )}
                        {entry.result.consistencyScore != null && (
                          <span className="text-11 text-ink-3 font-mono">consistency {(entry.result.consistencyScore * 100).toFixed(0)}%</span>
                        )}
                        {entry.result.jurisdiction && (
                          <span className="text-11 bg-brand-dim text-brand px-2 py-0.5 rounded">{entry.result.jurisdiction}</span>
                        )}
                      </div>
                      <p className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">{entry.result.answer}</p>
                      {entry.result.citations.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Sources</div>
                          {entry.result.citations.map((c, i) => (
                            <div key={i} className="border-l-2 border-brand pl-2.5">
                              <p className="text-12 font-medium text-ink-0">{c.document}</p>
                              {c.section && <p className="text-11 text-ink-3">§ {c.section}</p>}
                              {c.jurisdiction && <span className="text-11 text-brand">{c.jurisdiction}</span>}
                              {c.excerpt && <p className="text-11 text-ink-2 mt-0.5 italic">"{c.excerpt}"</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={historyEndRef} />
              </div>
            )}

            {/* Suggested questions — always visible */}
            <div className="border border-hair-2 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-bg-1 border-b border-hair-2">
                <p className="text-11 font-semibold text-ink-2 uppercase tracking-wide-3">Suggested questions</p>
              </div>
              <div className="divide-y divide-hair">
                {SUGGESTED_GROUPS.map((group, idx) => (
                  <div key={group.label}>
                    <button
                      type="button"
                      onClick={() => setOpenGroupIdx(openGroupIdx === idx ? null : idx)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg-1 transition-colors"
                    >
                      <span className="text-12 font-semibold text-ink-1">{group.label}</span>
                      <span className="text-10 text-ink-3">{openGroupIdx === idx ? "▲" : "▼"}</span>
                    </button>
                    {openGroupIdx === idx && (
                      <div className="px-4 pb-3 space-y-0.5">
                        {group.questions.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => { void handleQaAsk(q); }}
                            disabled={qaLoading}
                            className="w-full text-left text-12 text-brand hover:text-brand-deep hover:bg-brand-dim/20 px-2.5 py-1.5 rounded transition-colors disabled:opacity-40"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ModuleLayout>
  );
}

// ── Classifier UI ───────────────────────────────────────────────────────────

interface LiveAnalysisShape {
  primaryTopic: string;
  topics: string[];
  jurisdictions: string[];
  regimes: string[];
  fatfRecHints: string[];
  doctrineHints: string[];
  redFlagHints: string[];
  urgencyFlags: string[];
  confidence: "high" | "medium" | "low";
}

function LiveClassifierBadges({ question }: { question: string }) {
  const [analysis, setAnalysis] = useState<LiveAnalysisShape | null>(null);
  useEffect(() => {
    const trimmed = question.trim();
    if (trimmed.length < 12) {
      setAnalysis(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      void fetch("/api/mlro-classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: ctl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { ok?: boolean; analysis?: LiveAnalysisShape } | null) => {
          if (j?.ok && j.analysis) setAnalysis(j.analysis);
        })
        .catch(() => { /* aborted or offline */ });
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [question]);

  if (!analysis) return null;
  const chips: Array<{ label: string; tone: "brand" | "violet" | "amber" | "red" | "ink" }> = [];
  chips.push({ label: `topic: ${analysis.primaryTopic.replace(/_/g, " ")}`, tone: "brand" });
  for (const j of analysis.jurisdictions) chips.push({ label: j, tone: "violet" });
  for (const r of analysis.regimes.slice(0, 4)) chips.push({ label: r, tone: "amber" });
  for (const f of analysis.fatfRecHints.slice(0, 3)) chips.push({ label: f.replace("_", " "), tone: "ink" });
  for (const u of analysis.urgencyFlags) chips.push({ label: `⚠ ${u.replace(/_/g, " ")}`, tone: "red" });
  return (
    <div className="flex flex-wrap gap-1 items-center text-10 font-mono">
      <span className="text-ink-3 mr-1">classifier ({analysis.confidence}):</span>
      {chips.map((c, i) => (
        <span
          key={i}
          className={
            c.tone === "brand" ? "px-1.5 py-px rounded bg-brand-dim text-brand"
            : c.tone === "violet" ? "px-1.5 py-px rounded bg-violet-dim text-violet"
            : c.tone === "amber" ? "px-1.5 py-px rounded bg-amber-dim text-amber"
            : c.tone === "red" ? "px-1.5 py-px rounded bg-red-dim text-red"
            : "px-1.5 py-px rounded bg-bg-2 text-ink-1"
          }
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function ClassifierResultPanels({
  analysis,
  onPick,
}: {
  analysis: QuestionAnalysis;
  onPick: (q: string) => void;
}) {
  const moduleChips: Array<[string, string]> = [
    ...analysis.doctrineHints.map((d) => ["doctrine", d] as [string, string]),
    ...analysis.fatfRecHints.map((f) => ["fatf", f.replace("_", " ")] as [string, string]),
    ...analysis.playbookHints.slice(0, 8).map((p) => ["playbook", p] as [string, string]),
    ...analysis.redFlagHints.slice(0, 8).map((r) => ["red-flag", r] as [string, string]),
    ...analysis.typologies.map((t) => ["typology", t] as [string, string]),
  ];
  const ip = analysis.intelligenceProfile;
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 space-y-3">
      {ip && (() => {
        const score = ip.coverageScore;
        const grade =
          score >= 75 ? { label: "STRONG", cls: "text-brand", bar: "bg-brand" }
          : score >= 45 ? { label: "MEDIUM", cls: "text-amber", bar: "bg-amber" }
          : { label: "WEAK",   cls: "text-red",   bar: "bg-red" };
        return (
          <div className="flex items-center gap-3">
            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
              Brain coverage
            </div>
            <div className="flex-1 h-2 bg-bg-2 rounded overflow-hidden max-w-xs">
              <div
                className={`h-2 ${grade.bar}`}
                style={{ width: `${Math.min(100, score)}%` }}
              />
            </div>
            <div className={`font-mono text-12 font-semibold ${grade.cls}`}>{score}/100</div>
            <div
              className={`text-10 font-mono font-semibold uppercase tracking-wide-3 ${grade.cls}`}
              title="STRONG ≥75 = safe to act on; MEDIUM 45–74 = corroborate; WEAK <45 = escalate to Opus deep-reasoning."
            >
              {grade.label}
            </div>
            <div className="text-10 font-mono text-ink-3 ml-1">
              ({ip.totalArtefacts} artefacts · {ip.doctrineCount} doc · {ip.fatfRecCount} FATF · {ip.playbookCount} pb · {ip.redFlagCount} rf · {ip.typologyCount} typ · {ip.jurisdictionCount} juris)
            </div>
          </div>
        );
      })()}
      {analysis.fatfRecDetails && analysis.fatfRecDetails.length > 0 && (
        <details className="group">
          <summary className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 cursor-pointer hover:text-ink-1 select-none">
            FATF Recommendations anchored ({analysis.fatfRecDetails.length}) ▶
          </summary>
          <div className="mt-2 space-y-1">
            {analysis.fatfRecDetails.map((f) => (
              <div key={f.id} className="text-11 leading-snug border-l-2 border-amber pl-2">
                <span className="font-mono font-semibold text-amber">R.{f.num}</span>{" "}
                <span className="text-ink-0">{f.title}</span>
                <span className="ml-2 font-mono text-10 text-ink-3">{f.citation}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <div>
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
          Brain modules engaged
          <span className="ml-2 font-mono text-ink-3 normal-case">({moduleChips.length})</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {moduleChips.map(([kind, id], i) => (
            <span
              key={`${kind}-${id}-${i}`}
              className={
                kind === "doctrine" ? "text-10 font-mono px-1.5 py-px rounded bg-violet-dim text-violet"
                : kind === "fatf" ? "text-10 font-mono px-1.5 py-px rounded bg-amber-dim text-amber"
                : kind === "playbook" ? "text-10 font-mono px-1.5 py-px rounded bg-brand-dim text-brand"
                : kind === "red-flag" ? "text-10 font-mono px-1.5 py-px rounded bg-red-dim text-red"
                : "text-10 font-mono px-1.5 py-px rounded bg-bg-2 text-ink-1"
              }
              title={kind}
            >
              {id}
            </span>
          ))}
        </div>
      </div>

      {analysis.commonSenseRules.length > 0 && (
        <details className="group">
          <summary className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 cursor-pointer hover:text-ink-1 select-none">
            Common-sense rules applied ({analysis.commonSenseRules.length}) ▶
          </summary>
          <ol className="mt-2 space-y-1 list-decimal pl-5">
            {analysis.commonSenseRules.map((r, i) => (
              <li key={i} className="text-11 text-ink-1 leading-relaxed">{r}</li>
            ))}
          </ol>
        </details>
      )}

      {analysis.suggestedFollowUps.length > 0 && (
        <div>
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
            Suggested next questions
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.suggestedFollowUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onPick(q)}
                className="text-11 px-2 py-1 rounded border border-hair-2 bg-bg-1 hover:border-brand hover:bg-brand-dim hover:text-brand transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
