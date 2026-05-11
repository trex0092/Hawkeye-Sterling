// LLM call telemetry — records per-call token counts, latency, and estimated
// cost to Netlify Blobs. Fire-and-forget: never throws or blocks callers.

import { getJson, setJson } from "./store";

const CALLS_KEY = "llm-telemetry/calls";
const SUMMARY_KEY = "llm-telemetry/summary";
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
  updatedAt: string;
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

    const existing = (await getJson<LlmCallRecord[]>(CALLS_KEY)) ?? [];
    existing.unshift(full);
    await setJson(CALLS_KEY, existing.slice(0, MAX_RECORDS));

    const summary = (await getJson<LlmSummary>(SUMMARY_KEY)) ?? {
      totalCalls: 0, totalCostUsd: 0, totalTokens: 0, byModel: {}, byRoute: {}, updatedAt: "",
    };
    summary.totalCalls += 1;
    summary.totalCostUsd += costUsd;
    summary.totalTokens += rec.inputTokens + rec.outputTokens;
    summary.byModel[rec.model] ??= { calls: 0, costUsd: 0, tokens: 0 };
    summary.byModel[rec.model]!.calls += 1;
    summary.byModel[rec.model]!.costUsd += costUsd;
    summary.byModel[rec.model]!.tokens += rec.inputTokens + rec.outputTokens;
    summary.byRoute[rec.route] ??= { calls: 0, costUsd: 0 };
    summary.byRoute[rec.route]!.calls += 1;
    summary.byRoute[rec.route]!.costUsd += costUsd;
    summary.updatedAt = new Date().toISOString();
    await setJson(SUMMARY_KEY, summary);
  } catch {
    // telemetry is best-effort — never block callers
  }
}

export async function listCalls(limit = 100): Promise<LlmCallRecord[]> {
  return ((await getJson<LlmCallRecord[]>(CALLS_KEY)) ?? []).slice(0, limit);
}

export async function getSummary(): Promise<LlmSummary> {
  return (await getJson<LlmSummary>(SUMMARY_KEY)) ?? {
    totalCalls: 0, totalCostUsd: 0, totalTokens: 0, byModel: {}, byRoute: {}, updatedAt: new Date().toISOString(),
  };
}
