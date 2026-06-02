// Hawkeye Sterling — AI multi-provider gateway.
//
// Portkey-AI/gateway inspired: wraps llm.ts with semantic response caching,
// per-model monthly token budget enforcement, and improved fallback tracking.
// Does not replace getAnthropicClient — callers opt in per route.
//
// Key behaviours:
//   1. Semantic cache: hash(model + system[0:256] + normalised_user_msg) → 24h
//      Blob cache. Only safe for non-PII routes (narrative, summarisation).
//   2. Budget gate: if a tenant exhausts their Opus monthly token allowance,
//      downgrade to Sonnet and write an audit chain entry. Advisory soft limit.
//   3. Actual token usage post-corrects the pre-call estimate (fire-and-forget).
//
// Architecture invariant: writeAuditChainEntry is called fire-and-forget with
// .catch(() => undefined) so budget-downgrade audit failures never block the
// compliance response path.

import { createHash } from "node:crypto";
import { getJson, setJson } from "./store";
import { writeAuditChainEntry } from "./audit-chain";
import { incrementCounter } from "./metrics-store";
import { getAnthropicClient, type AnthropicMessage } from "./llm";
import type Anthropic from "@anthropic-ai/sdk";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModelBudgetTier = "haiku" | "sonnet" | "opus";

export interface TenantModelBudget {
  tenantId: string;
  monthKey: string;
  haiku:  { used: number; limit: number };
  sonnet: { used: number; limit: number };
  opus:   { used: number; limit: number };
}

interface SemanticCacheEntry {
  response: AnthropicMessage;
  cachedAt: string;
  model: string;
  ttlMs: number;
}

export interface GatewayCallOptions {
  apiKey: string;
  route: string;
  tenantId: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
  /** Enable semantic response cache. Default false — opt in explicitly. */
  enableCache?: boolean;
  /** Cache TTL in ms. Default 5 minutes. */
  cacheTtlMs?: number;
  timeoutMs?: number;
}

export interface GatewayCallResult {
  response: AnthropicMessage;
  fromCache: boolean;
  budgetDowngraded: boolean;
  requestedModel: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const CACHE_PREFIX = "ai-gateway/cache/";
const BUDGET_PREFIX = "ai-gateway/budget/";
const CACHE_SYSTEM_LEN = 256;

function deriveCacheKey(
  model: string,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): string {
  const system =
    typeof params.system === "string"
      ? params.system.slice(0, CACHE_SYSTEM_LEN)
      : JSON.stringify(params.system ?? "").slice(0, CACHE_SYSTEM_LEN);

  const lastUser = [...(params.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user");
  const userText =
    typeof lastUser?.content === "string"
      ? lastUser.content.trim().replace(/\s+/g, " ").toLowerCase()
      : JSON.stringify(lastUser?.content ?? "").toLowerCase();

  const material = `${model}::${system}::${userText}`;
  return CACHE_PREFIX + createHash("sha256").update(material).digest("hex").slice(0, 48);
}

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function budgetStoreKey(tenantId: string): string {
  return `${BUDGET_PREFIX}${tenantId}/${monthKey()}.json`;
}

function modelBudgetTier(model: string): ModelBudgetTier {
  if (model.includes("opus"))  return "opus";
  if (model.includes("haiku")) return "haiku";
  return "sonnet";
}

function defaultBudgetLimits(): Pick<TenantModelBudget, "haiku" | "sonnet" | "opus"> {
  return {
    haiku:  { used: 0, limit: parseInt(process.env["GATEWAY_HAIKU_MONTHLY_LIMIT"]  ?? "10000000", 10) },
    sonnet: { used: 0, limit: parseInt(process.env["GATEWAY_SONNET_MONTHLY_LIMIT"] ?? "3000000",  10) },
    opus:   { used: 0, limit: parseInt(process.env["GATEWAY_OPUS_MONTHLY_LIMIT"]   ?? "500000",   10) },
  };
}

// Opus → Sonnet is the only defined downgrade. Sonnet/Haiku exhaustion doesn't
// downgrade further — silent degradation at lower tiers is worse than a 429.
function downgradePath(tier: ModelBudgetTier): string | null {
  if (tier === "opus") return "claude-sonnet-4-6";
  return null;
}

async function checkAndIncrementBudget(
  tenantId: string,
  model: string,
  estimatedTokens: number,
): Promise<{ allowed: boolean; downgradeModel: string | null }> {
  const tier = modelBudgetTier(model);
  const key  = budgetStoreKey(tenantId);

  const existing = await getJson<TenantModelBudget>(key).catch(() => null);
  const budget: TenantModelBudget = existing ?? {
    tenantId,
    monthKey: monthKey(),
    ...defaultBudgetLimits(),
  };

  const tierBudget   = budget[tier];
  const projectedUse = tierBudget.used + estimatedTokens;

  if (projectedUse > tierBudget.limit) {
    return { allowed: false, downgradeModel: downgradePath(tier) };
  }

  tierBudget.used = projectedUse;
  void setJson(key, budget).catch(() => undefined);
  return { allowed: true, downgradeModel: null };
}

function recordActualTokens(tenantId: string, model: string, actual: number): void {
  void (async () => {
    try {
      const key      = budgetStoreKey(tenantId);
      const existing = await getJson<TenantModelBudget>(key);
      if (!existing) return;
      const tier = modelBudgetTier(model);
      existing[tier].used += actual;
      await setJson(key, existing);
    } catch {
      // Best-effort; budget accounting is advisory
    }
  })();
}

// ── Main gateway function ─────────────────────────────────────────────────────

export async function gatewayCall(opts: GatewayCallOptions): Promise<GatewayCallResult> {
  const {
    apiKey,
    route,
    tenantId,
    enableCache  = false,
    cacheTtlMs   = 5 * 60 * 1000,
    timeoutMs,
  } = opts;

  let params            = opts.params;
  const requestedModel  = params.model;
  let budgetDowngraded  = false;

  // ── 1. Budget gate ────────────────────────────────────────────────────────
  // Estimate input tokens conservatively: 1 token ≈ 4 chars (English).
  // Arabic text is ~2 chars/token; the post-call correction handles the delta.
  const estimatedTokens = Math.ceil(
    JSON.stringify(params.messages ?? []).length / 4 +
    (typeof params.system === "string" ? params.system.length / 4 : 0),
  );

  const budget = await checkAndIncrementBudget(tenantId, params.model, estimatedTokens);
  if (!budget.allowed) {
    if (budget.downgradeModel) {
      void writeAuditChainEntry(
        {
          event:          "ai_budget_downgrade",
          actor:          "system",
          fromModel:      params.model,
          toModel:        budget.downgradeModel,
          estimatedTokens,
          tenantId,
          route,
        },
        tenantId,
      ).catch(() => undefined);

      incrementCounter("hawkeye_ai_budget_downgrade_total", 1, {
        from_model: params.model,
        to_model:   budget.downgradeModel,
        // Truncate tenant ID to cap cardinality — UUID tenants would blow the 10k series limit.
        tenant: tenantId.slice(0, 16),
      });

      params = { ...params, model: budget.downgradeModel };
      budgetDowngraded = true;
    } else {
      // No downgrade path: advisory only, don't block compliance
      console.warn(
        `[ai-gateway] ${params.model} budget exhausted for tenant ${tenantId.slice(0, 8)} — no downgrade path, proceeding`,
      );
    }
  }

  // ── 2. Semantic cache lookup ──────────────────────────────────────────────
  const cacheKey = enableCache ? deriveCacheKey(params.model, params) : null;
  if (cacheKey) {
    try {
      const cached = await getJson<SemanticCacheEntry>(cacheKey);
      if (cached) {
        const age = Date.now() - new Date(cached.cachedAt).getTime();
        if (age < (cached.ttlMs ?? cacheTtlMs)) {
          incrementCounter("hawkeye_ai_cache_hits_total", 1, { model: params.model, route });
          return {
            response:         cached.response,
            fromCache:        true,
            budgetDowngraded,
            requestedModel,
          };
        }
      }
    } catch {
      // Cache unavailable — proceed to live call
    }
  }

  // ── 3. LLM call ──────────────────────────────────────────────────────────
  const client   = getAnthropicClient(apiKey, timeoutMs, route);
  const response = await client.messages.create(params);

  // ── 4. Post-call budget correction ───────────────────────────────────────
  const actualTokens =
    (response.usage?.input_tokens  ?? 0) +
    (response.usage?.output_tokens ?? 0);
  recordActualTokens(tenantId, response.model, actualTokens);

  // ── 5. Semantic cache write ───────────────────────────────────────────────
  if (cacheKey) {
    void setJson<SemanticCacheEntry>(cacheKey, {
      response,
      cachedAt: new Date().toISOString(),
      model:    response.model,
      ttlMs:    cacheTtlMs,
    }).catch(() => undefined);
  }

  return { response, fromCache: false, budgetDowngraded, requestedModel };
}
