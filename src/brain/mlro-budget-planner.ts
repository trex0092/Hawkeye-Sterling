// Hawkeye Sterling — per-step budget planner.
// Given N modes + a total budget, hand back per-step budgets that respect
// the 25s hard ceiling and leave a safety margin for merging + gating.

export const HARD_CEILING_MS = 60_000;
export const SAFETY_MARGIN_MS = 500;

export interface StepWeight {
  /** Relative cost hint — 1 = baseline, 2 = twice as long, 0.5 = half, etc. */
  weight?: number;
  /** Optional hard minimum for this step, ms. */
  minMs?: number;
  /** Optional hard maximum for this step, ms. */
  maxMs?: number;
}

export interface AllocatedStep {
  budgetMs: number;
}

export function planBudget(
  steps: readonly StepWeight[],
  totalBudgetMs: number = HARD_CEILING_MS,
): AllocatedStep[] {
  if (steps.length === 0) return [];
  const total = Math.min(totalBudgetMs, HARD_CEILING_MS) - SAFETY_MARGIN_MS;
  if (total <= 0) return steps.map(() => ({ budgetMs: 0 }));

  const weights = steps.map((s) => Math.max(0.1, s.weight ?? 1));
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  const initial = weights.map((w) => Math.floor((w / sumWeights) * total));

  // Apply min/max constraints.
  const out: number[] = initial.slice();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    if (s.minMs !== undefined && (out[i] ?? 0) < s.minMs) out[i] = s.minMs;
    if (s.maxMs !== undefined && (out[i] ?? 0) > s.maxMs) out[i] = s.maxMs;
  }

  // Re-normalise so sum <= total.
  let sum = out.reduce((a, b) => a + b, 0);
  if (sum > total) {
    const scale = total / sum;
    for (let i = 0; i < out.length; i++) out[i] = Math.max(steps[i]?.minMs ?? 0, Math.floor((out[i] ?? 0) * scale));
    sum = out.reduce((a, b) => a + b, 0);
  }

  // If we still have headroom (because floors kicked in), distribute to steps
  // with remaining headroom (respecting maxMs).
  let headroom = total - sum;
  let guard = 0;
  while (headroom > 0 && guard++ < 50) {
    const candidates = out
      .map((v, i) => ({ i, room: (steps[i]?.maxMs ?? Infinity) - v }))
      .filter((c) => c.room > 0);
    if (candidates.length === 0) break;
    const share = Math.max(1, Math.floor(headroom / candidates.length));
    for (const c of candidates) {
      const bump = Math.min(share, c.room);
      out[c.i] = (out[c.i] ?? 0) + bump;
    }
    const newSum = out.reduce((a, b) => a + b, 0);
    if (newSum === sum) break;
    headroom = total - newSum;
    sum = newSum;
  }

  return out.map((budgetMs) => ({ budgetMs }));
}

/** Convenience: equal split. */
export function equalSplit(stepCount: number, totalBudgetMs: number = HARD_CEILING_MS): AllocatedStep[] {
  return planBudget(Array.from({ length: stepCount }, () => ({ weight: 1 })), totalBudgetMs);
}

/** Convenience: front-weighted split — first step gets 2×, rest equal. */
export function frontWeightedSplit(stepCount: number, totalBudgetMs: number = HARD_CEILING_MS): AllocatedStep[] {
  const weights: StepWeight[] = Array.from({ length: stepCount }, (_, i) => ({ weight: i === 0 ? 2 : 1 }));
  return planBudget(weights, totalBudgetMs);
}
