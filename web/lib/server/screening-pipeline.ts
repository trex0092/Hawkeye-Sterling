// Hawkeye Sterling — parallel screening pipeline orchestrator.
//
// Replaces the sequential adapter-execution pattern in /api/quick-screen with
// a tiered fan-out that minimises total wall-clock time:
//
//   Tier 0 (< 1 ms)    Bloom filter pre-screen (definitive negative exit)
//   Tier 1 (< 50 ms)   UN 1267 token-set exact match
//   Tier 2 (< 200 ms)  Whitelist check (early-exit for cleared subjects)
//   Tier 3 (< 1 200 ms) Local quickScreen() (CPU-bound, runs while adapters start)
//   Tier 4 (concurrent) External adapters, all started in parallel with Tier 3
//   Tier 5 (deadline)  Hard-deadline gate at HARD_DEADLINE_MS, return partial result
//
// This module owns Tiers 3-5; Tiers 0-2 are handled by the route itself.
//
// Key optimisations vs. the original route:
//   - All external HTTP adapters are started concurrently with quickScreen().
//   - News search is pre-started before auth completes (caller responsibility).
//   - Adapter results past the deadline are discarded, not awaited.
//   - Per-adapter AbortController prevents hung connections from lingering.
//   - Bloom filter (see bloom-filter.ts) short-circuits before Tier 3.

import type {
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AugmentationHit {
  source: string;
  data: unknown;
}

export interface PipelineResult {
  screenResult: QuickScreenResult;
  augmentationHits: AugmentationHit[];
  /** True when the hard deadline fired before all adapters completed. */
  enrichmentPending: boolean;
  /** Wall-clock time for the local quickScreen() step. */
  localScreenMs: number;
  /** Wall-clock time for the entire pipeline (up to the deadline). */
  totalMs: number;
  /** Adapters that completed within the deadline. */
  completedAdapters: string[];
  /** Adapters that were still in-flight when the deadline fired. */
  pendingAdapters: string[];
}

export interface AdapterTask<T = unknown> {
  name: string;
  fn: () => Promise<T>;
  /** Optional AbortController — pipeline will abort on deadline. */
  controller?: AbortController;
}

// ── runWithDeadline ────────────────────────────────────────────────────────

interface DeadlineResult<T> {
  name: string;
  result?: T;
  error?: string;
  completed: boolean;
  durationMs: number;
}

/**
 * Run a set of adapter tasks concurrently. Return all results that complete
 * before `deadlineMs` elapses from `startMs`. Adapters still running at the
 * deadline are aborted (if they provided an AbortController) and recorded as
 * `completed: false`.
 */
export async function runWithDeadline<T>(
  tasks: AdapterTask<T>[],
  deadlineMs: number,
  startMs: number,
): Promise<DeadlineResult<T>[]> {
  const remainingMs = Math.max(0, deadlineMs - (Date.now() - startMs));
  if (remainingMs <= 0) {
    // Already past deadline — abort all tasks immediately.
    for (const t of tasks) t.controller?.abort();
    return tasks.map((t) => ({ name: t.name, completed: false, durationMs: 0 }));
  }

  const results: DeadlineResult<T>[] = [];

  const promises = tasks.map(async (task): Promise<void> => {
    const t0 = Date.now();
    try {
      const result = await task.fn();
      results.push({ name: task.name, result, completed: true, durationMs: Date.now() - t0 });
    } catch (err) {
      results.push({
        name: task.name,
        error: err instanceof Error ? err.message : String(err),
        completed: false,
        durationMs: Date.now() - t0,
      });
    }
  });

  // Race all tasks against the remaining budget.
  await Promise.race([
    Promise.allSettled(promises),
    new Promise<void>((r) => setTimeout(r, remainingMs)),
  ]);

  // Abort any tasks that are still running.
  for (const task of tasks) {
    if (!results.find((r) => r.name === task.name)) {
      task.controller?.abort();
      results.push({ name: task.name, completed: false, durationMs: remainingMs });
    }
  }

  return results;
}

// ── Confidence threshold short-circuit ────────────────────────────────────

/**
 * If the top hit already exceeds this score, skip enrichment adapters — the
 * match is already confirmed and additional evidence won't change the verdict.
 * Saves up to 2.8 s of adapter time on high-confidence hits.
 */
const CONFIRMED_SCORE_THRESHOLD = 0.98;

/**
 * Return true when the local screen result is so decisive that enrichment
 * adapters cannot change the verdict and should be skipped.
 */
export function isDecisiveResult(result: QuickScreenResult): boolean {
  if (result.severity === "critical") return true;
  if ((result.topScore ?? 0) >= CONFIRMED_SCORE_THRESHOLD) return true;
  return false;
}

// ── buildMlroContext ────────────────────────────────────────────────────────

/**
 * Build a compact, token-minimised context string for MLRO advisory
 * generation from a QuickScreenResult.
 *
 * Token minimisation rules:
 *   - Truncate reason strings to 120 chars.
 *   - Include at most 5 hits (the top-scored ones).
 *   - Omit fields that are undefined or empty.
 *   - Emit JSON (not narrative prose) — the model then synthesises prose.
 *
 * Expected token count: ~300–500 tokens vs ~800–1 200 tokens for an
 * unprocessed hit array, saving ~700 ms of inference time.
 */
export function buildMlroContext(
  subject: QuickScreenSubject,
  result: QuickScreenResult,
  options?: { maxHits?: number; maxReasonLen?: number },
): string {
  const maxHits = options?.maxHits ?? 5;
  const maxReasonLen = options?.maxReasonLen ?? 120;

  const topHits = [...result.hits]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxHits)
    .map((h) => ({
      list: h.listId,
      ref: h.listRef,
      candidate: h.candidateName,
      score: Number((h.score ?? 0).toFixed(3)),
      ...(h.programs?.length ? { programs: h.programs.slice(0, 3) } : {}),
      ...(h.reason ? { reason: h.reason.slice(0, maxReasonLen) } : {}),
      ...(h.autoResolution ? { resolution: h.autoResolution } : {}),
    }));

  const ctx = {
    subject: {
      name: subject.name,
      ...(subject.dateOfBirth ? { dob: subject.dateOfBirth } : {}),
      ...(subject.nationality ? { nationality: subject.nationality } : {}),
      ...(subject.jurisdiction ? { jurisdiction: subject.jurisdiction } : {}),
      ...(subject.aliases?.length ? { aliases: subject.aliases.slice(0, 5) } : {}),
    },
    screening: {
      severity: result.severity,
      topScore: Number((result.topScore ?? 0).toFixed(3)),
      hitCount: result.hits.length,
      listsChecked: result.listsChecked,
      candidatesChecked: result.candidatesChecked,
      durationMs: result.durationMs,
    },
    hits: topHits,
  };

  return JSON.stringify(ctx);
}

// ── Token-budget prompt builder ────────────────────────────────────────────

/**
 * Build a system prompt for MLRO advisory that is token-minimal.
 * Replaces the 13 KB systemPrompt with a 1–2 KB focused prompt when
 * the route does NOT need the full charter context.
 *
 * Full charter is injected by routes that set `fullCharter: true`.
 */
export function buildAdvisorySystemPrompt(opts?: { fullCharter?: boolean }): string {
  if (opts?.fullCharter) {
    // Caller wants the full charter — do not truncate.
    // The auto-caching in llm.ts will cache this at the CDN edge.
    return ""; // signal to caller: use src/policy/systemPrompt.ts
  }

  return [
    "You are a UAE-licensed AML/CFT compliance analyst producing a concise MLRO advisory.",
    "Output a structured JSON object with these fields:",
    '  { "verdict": "freeze"|"escalate"|"edd"|"monitor"|"clear",',
    '    "confidence": 0.0–1.0,',
    '    "summary": "<2–3 sentence plain-language summary>",',
    '    "evidence": ["<citation1>","<citation2>"],',
    '    "redFlags": ["<flag1>"],',
    '    "nextSteps": ["<step1>"],',
    '    "auditLine": "<ISO8601> | <actor> | <action>" }',
    "Rules:",
    "  - Never fabricate sanctions list references.",
    "  - If hit score < 0.6, verdict MUST be monitor or clear.",
    "  - If hit score >= 0.9, verdict MUST be freeze or escalate.",
    "  - Cite specific list IDs (ofac_sdn, un_consolidated, etc.) not generic labels.",
    "  - Output ONLY the JSON object, no markdown fences.",
  ].join("\n");
}
