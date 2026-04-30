// Hawkeye Sterling — smart model router (audit follow-up #34).
//
// Picks the right Claude model for a given task by trading off depth,
// latency, and cost. Centralised so every Anthropic integration uses
// the same selection rules; tune in one place.
//
// Inputs are TASK descriptors (semantic), not model names — callers do
// NOT hard-code "claude-opus-4-7" anywhere. They describe what they
// need; the router answers with the right model.
//
// Cost-sensitivity model:
//   · 'cheap'    — bulk batch, low-stakes (Haiku)
//   · 'balanced' — routine ops, normal-stakes (Sonnet)
//   · 'best'     — high-stakes, regulator-facing (Opus)
//
// Latency budget:
//   · sub-second perceived UX (snappy UI helpers) → Haiku
//   · 5–25s synchronous request → Sonnet
//   · 25–60s deep reasoning → Opus
//
// Audit (Charter P9): every selection records the model + the reason in
// the returned ModelChoice so it can be persisted alongside the verdict.

export type ModelTaskKind =
  | "screening_verdict"        // produces a regulator-facing BrainVerdict
  | "narrative_drafting"        // STR / SAR / regulator narrative
  | "counterfactual"            // counterfactual / pre-mortem / steelman
  | "tool_use_loop"             // multi-iteration agent
  | "classification"            // single-shot classify (PEP / adverse-media tag)
  | "summarisation"             // shrink long input → short summary
  | "extraction"                // structured extraction from documents
  | "ranking"                   // sort N items by criterion
  | "ui_assist"                 // snappy in-flight UI suggestion
  | "batch_screen";             // bulk overnight job;

export type CostSensitivity = "cheap" | "balanced" | "best";

export interface ModelTask {
  kind: ModelTaskKind;
  /** Required regulator-grade output? (forces Opus when true) */
  regulatorFacing?: boolean;
  /** Latency budget in ms (UI snap < 3000, sync < 25000, deep < 60000). */
  latencyBudgetMs?: number;
  /** Caller cost preference. */
  costSensitivity?: CostSensitivity;
  /** Approximate input token count (helps with cache decisions downstream). */
  inputTokens?: number;
  /** Caller already requires extended thinking? (forces Opus) */
  extendedThinking?: boolean;
  /** Override — caller overrides the router (audit-recorded). */
  overrideModel?: string;
}

export interface ModelChoice {
  model: string;                 // canonical Anthropic model id
  reason: string;                // single-sentence audit note
  recommendsCaching: boolean;    // true when the system prompt is large enough
  recommendsThinking: boolean;   // true when the model would benefit from extended thinking
  costTier: CostSensitivity;
  latencyTier: "snap" | "sync" | "deep";
}

const OPUS = "claude-opus-4-7";
const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";

/** Select the model for a task. Pure function; deterministic; no IO. */
export function pickModel(task: ModelTask): ModelChoice {
  // Caller override — recorded but always honoured.
  if (task.overrideModel) {
    return {
      model: task.overrideModel,
      reason: `caller-override: ${task.overrideModel}`,
      recommendsCaching: (task.inputTokens ?? 0) >= 4000,
      recommendsThinking: !!task.extendedThinking,
      costTier: task.costSensitivity ?? "best",
      latencyTier: latencyTier(task.latencyBudgetMs),
    };
  }

  // Hard rules first — any one of these forces Opus.
  if (task.regulatorFacing === true) {
    return choice(OPUS, "regulator-facing output requires charter-grade model", task);
  }
  if (task.extendedThinking === true) {
    return choice(OPUS, "extended thinking requested; only Opus runs at full thinking budget", task);
  }
  if (task.kind === "screening_verdict" || task.kind === "narrative_drafting") {
    return choice(OPUS, `task '${task.kind}' is regulator-facing by category`, task);
  }
  if (task.kind === "tool_use_loop" && (task.costSensitivity ?? "best") !== "cheap") {
    return choice(OPUS, "tool-use loop benefits materially from Opus reasoning depth", task);
  }

  // Cheap requests — Haiku unless input is too large for it to be sensible.
  if (task.costSensitivity === "cheap") {
    if ((task.inputTokens ?? 0) > 30_000) {
      return choice(SONNET, "cheap requested but input >30k tokens — Haiku context is too short", task);
    }
    return choice(HAIKU, "cheap-tier request; Haiku is the cost-optimal choice", task);
  }

  // Latency — sub-3s requests can't wait for Opus; pick Sonnet (or Haiku).
  if ((task.latencyBudgetMs ?? Infinity) <= 3_000) {
    return choice(HAIKU, "snap-latency budget (<3s) — Haiku is fastest", task);
  }
  if ((task.latencyBudgetMs ?? Infinity) <= 8_000) {
    return choice(SONNET, "tight-latency budget (<8s) — Sonnet balances speed and quality", task);
  }

  // Routine ops at default cost — Sonnet.
  if (task.kind === "classification" || task.kind === "summarisation" || task.kind === "ranking" || task.kind === "ui_assist") {
    return choice(SONNET, `task '${task.kind}' is routine; Sonnet is the default tier`, task);
  }

  // Batch / bulk — cheapest viable.
  if (task.kind === "batch_screen") {
    return choice(HAIKU, "batch screening — Haiku per-call cost is lowest", task);
  }

  // Counterfactual / extraction — Sonnet by default unless caller upgrades.
  if (task.kind === "counterfactual" || task.kind === "extraction") {
    if (task.costSensitivity === "best") {
      return choice(OPUS, `task '${task.kind}' best-tier — Opus for max depth`, task);
    }
    return choice(SONNET, `task '${task.kind}' default-tier — Sonnet is sufficient`, task);
  }

  // Fallback — Sonnet.
  return choice(SONNET, "default — Sonnet is the conservative middle tier", task);
}

function choice(model: string, reason: string, task: ModelTask): ModelChoice {
  return {
    model,
    reason,
    recommendsCaching: (task.inputTokens ?? 0) >= 4000,
    recommendsThinking: model === OPUS && (task.extendedThinking ?? task.regulatorFacing ?? false),
    costTier: task.costSensitivity ?? (model === OPUS ? "best" : model === HAIKU ? "cheap" : "balanced"),
    latencyTier: latencyTier(task.latencyBudgetMs),
  };
}

function latencyTier(budget: number | undefined): ModelChoice["latencyTier"] {
  if (budget === undefined) return "sync";
  if (budget <= 3_000) return "snap";
  if (budget <= 25_000) return "sync";
  return "deep";
}

/** Convenience batch — score N tasks at once for telemetry. */
export function batchPick(tasks: readonly ModelTask[]): ModelChoice[] {
  return tasks.map(pickModel);
}

/** Inspect what model the router would choose for a task without executing. */
export function explain(task: ModelTask): string {
  const c = pickModel(task);
  return `${c.model} (${c.costTier} / ${c.latencyTier}) — ${c.reason}`;
}

/** Anthropic model name → cost tier (rough — for routing telemetry). */
export function tierOf(model: string): CostSensitivity {
  if (model.includes("opus")) return "best";
  if (model.includes("haiku")) return "cheap";
  return "balanced";
}
