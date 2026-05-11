// LLM call telemetry — records per-call token counts, latency, and estimated
// cost to Netlify Blobs. Fire-and-forget: never throws or blocks callers.
//
// Race condition fix (T-1): the running SUMMARY_KEY is removed. Summary is now
// computed at read time from the CALLS_KEY list, eliminating the concurrent
// read-modify-write hazard. Cost is best-effort; individual records are still
// stored append-first (newest at index 0) and truncated to MAX_RECORDS.

import { getJson, setJson } from "./store";

const CALLS_KEY = "llm-telemetry/calls";
const MAX_RECORDS = 500;

export interface LlmCallRecord {
  id: string;
  at: string;
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  costUsd: number;
}

export interface LlmSummary {
  totalCalls: number;
  totalCostUsd: number;
  totalTokens: number;
  byModel: Record<string, { calls: number; costUsd: number; tokens: number }>;
  byRoute: Record<string, { calls: number; costUsd: number }>;
  computedAt: string;
}

// Pricing per 1M tokens (Anthropic May 2026)
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.80,  output: 4.00,  cacheRead: 0.08, cacheWrite: 1.00  },
  "claude-sonnet-4-6":         { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75  },
  "claude-opus-4-7":           { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
};

function calcCost(model: string, inp: number, out: number, cacheRead: number, cacheWrite: number): number {
  const p = PRICING[model] ?? PRICING["claude-sonnet-4-6"]!;
  return (inp * p.input + out * p.output + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) / 1_000_000;
}

export async function recordCall(rec: Omit<LlmCallRecord, "id" | "at" | "costUsd">): Promise<void> {
  try {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const costUsd = calcCost(rec.model, rec.inputTokens, rec.outputTokens, rec.cacheReadTokens, rec.cacheWriteTokens);
    const full: LlmCallRecord = { id, at: new Date().toISOString(), costUsd, ...rec };

    // Single write: prepend to calls list (no SUMMARY_KEY race condition)
    const existing = (await getJson<LlmCallRecord[]>(CALLS_KEY)) ?? [];
    existing.unshift(full);
    await setJson(CALLS_KEY, existing.slice(0, MAX_RECORDS));
  } catch (err) {
    console.warn("[llm-telemetry] recordCall failed:", err instanceof Error ? err.message : err);
  }
}

export async function listCalls(limit = 100): Promise<LlmCallRecord[]> {
  return ((await getJson<LlmCallRecord[]>(CALLS_KEY)) ?? []).slice(0, limit);
}

// Summary computed at read time — eliminates race condition on summary key
export async function getSummary(): Promise<LlmSummary> {
  const calls = (await getJson<LlmCallRecord[]>(CALLS_KEY)) ?? [];
  const summary: LlmSummary = {
    totalCalls: 0, totalCostUsd: 0, totalTokens: 0, byModel: {}, byRoute: {}, computedAt: new Date().toISOString(),
  };
  for (const c of calls) {
    summary.totalCalls += 1;
    summary.totalCostUsd += c.costUsd;
    summary.totalTokens += c.inputTokens + c.outputTokens;
    summary.byModel[c.model] ??= { calls: 0, costUsd: 0, tokens: 0 };
    summary.byModel[c.model]!.calls += 1;
    summary.byModel[c.model]!.costUsd += c.costUsd;
    summary.byModel[c.model]!.tokens += c.inputTokens + c.outputTokens;
    summary.byRoute[c.route] ??= { calls: 0, costUsd: 0 };
    summary.byRoute[c.route]!.calls += 1;
    summary.byRoute[c.route]!.costUsd += c.costUsd;
  }
  return summary;
}
