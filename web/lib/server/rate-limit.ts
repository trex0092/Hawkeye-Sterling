// Hawkeye Sterling — per-API-key rate limiter.
//
// Three enforcement paths:
//
// 1. Upstash Redis (hard enforcement): when UPSTASH_REDIS_REST_URL and
//    UPSTASH_REDIS_REST_TOKEN are set, uses atomic INCR + EXPIRE via the
//    Upstash REST API. Provides strict per-second and per-minute limits
//    with no race conditions across Lambda instances.
//
// 2. In-memory per-instance windows (production default when Redis is
//    unavailable, and RATE_LIMIT_STRICT=true everywhere): deterministic,
//    zero-I/O fixed windows scoped to the Lambda instance. Cross-instance
//    aggregation is lost while Redis is down, but tier limits stay enforced
//    per instance and — critically — the platform stays up.
//
//    Incident 2026-06-11: the previous behaviour here was a blanket
//    allowed:false for every caller ("fail-closed"). When Upstash became
//    unreachable from a degraded Lambda (the recurring instance-level
//    egress brownout), that turned a throttling-control outage into a
//    full platform outage — every screening route answered 429. Rate
//    limiting is a protective control, not a correctness gate: when its
//    backing store is unavailable the control degrades, the service must
//    not. Auth (401) is unaffected either way.
//
// 3. Netlify Blobs (soft enforcement, RATE_LIMIT_STRICT=false and dev/test
//    default): fixed-window counters with no CAS — concurrent requests in
//    the same blob round-trip can slip through. Acceptable at low
//    concurrency; costs up to three store round-trips per check.
//
// Required env vars for hard enforcement:
//   UPSTASH_REDIS_REST_URL   – e.g. https://<id>.upstash.io
//   UPSTASH_REDIS_REST_TOKEN – service account token

import { getJson, setJson } from "./store";
import { tierFor, type TierDefinition } from "@/lib/data/tiers";
import { incrementCounter } from "./metrics-store";
import { HS_DEFAULTS } from "@/lib/config/hs-defaults";

// ── Upstash Redis path ────────────────────────────────────────────────────────
//
// Latency optimisation: use the Upstash /pipeline endpoint to batch all INCR +
// EXPIRE commands into a SINGLE HTTP round-trip instead of two sequential
// requests.  The previous implementation called INCR and then (conditionally)
// EXPIRE as separate fetches, adding ~40-80 ms per rate-limit check.
//
// Pipeline payload format per Upstash docs:
//   POST /pipeline  body: [["INCR","key"],["EXPIRE","key","ttl"]]
// Response:           [{"result":N},{"result":1}]

// After a Redis transport failure, skip further probes for a short cooldown
// so a browned-out instance pays the 1s abort timeout once per window rather
// than on every request. Missing configuration never arms the cooldown.
let redisDownUntil = 0;
const REDIS_RETRY_COOLDOWN_MS = 5_000;

async function redisPipeline(
  commands: Array<readonly [string, ...string[]]>,
): Promise<Array<number | null>> {
  const url = process.env["UPSTASH_REDIS_REST_URL"] ?? HS_DEFAULTS.UPSTASH_REDIS_REST_URL;
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return commands.map(() => null);
  if (Date.now() < redisDownUntil) return commands.map(() => null);
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      // Bounded: this runs inside enforce() ahead of every screening-path
      // route; an Upstash hang must degrade to the fallback limiter rather
      // than spend the route's 5s SLA. Timeout lands in the catch → nulls.
      signal: AbortSignal.timeout(1_000),
    });
    if (!res.ok) {
      redisDownUntil = Date.now() + REDIS_RETRY_COOLDOWN_MS;
      return commands.map(() => null);
    }
    const results = await res.json() as Array<{ result?: number }>;
    redisDownUntil = 0;
    return results.map((r) => (typeof r?.result === "number" ? r.result : null));
  } catch {
    redisDownUntil = Date.now() + REDIS_RETRY_COOLDOWN_MS;
    return commands.map(() => null);
  }
}

async function consumeRedis(
  keyId: string,
  tier: TierDefinition,
  cost = 1,
): Promise<RateLimitResult | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  const secWindow = Math.floor(nowSec);
  const minWindow = Math.floor(nowSec / 60);
  const secKey = `rl:${keyId}:s:${secWindow}`;
  const minKey = `rl:${keyId}:m:${minWindow}`;

  // Build a single pipeline: INCRBY secKey cost, EXPIRE secKey 2,
  //                           INCRBY minKey cost, EXPIRE minKey 62
  // All four commands go in one HTTP call — saves one full round-trip (~40-80 ms).
  const pipeline: Array<readonly [string, ...string[]]> = [
    ["INCRBY", secKey, String(cost)],
    ["EXPIRE",  secKey, "2"],
    ["INCRBY", minKey, String(cost)],
    ["EXPIRE",  minKey, "62"],
  ];
  const pipelineResult = await redisPipeline(pipeline);
  const secCount = pipelineResult[0] ?? null;
  const minCount = pipelineResult[2] ?? null;
  if (secCount === null || minCount === null) return null; // Redis unavailable

  const secAllowed = secCount <= tier.rateLimitPerSecond;
  const minAllowed = minCount <= tier.rateLimitPerMinute;

  if (!secAllowed) {
    return {
      allowed: false,
      retryAfterSec: 1,
      remainingSecond: 0,
      remainingMinute: Math.max(0, tier.rateLimitPerMinute - minCount),
      tier,
    };
  }
  if (!minAllowed) {
    const secsToNextMinute = 60 - (nowSec % 60);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, secsToNextMinute),
      remainingSecond: Math.max(0, tier.rateLimitPerSecond - secCount),
      remainingMinute: 0,
      tier,
    };
  }
  return {
    allowed: true,
    retryAfterSec: 0,
    remainingSecond: Math.max(0, tier.rateLimitPerSecond - secCount),
    remainingMinute: Math.max(0, tier.rateLimitPerMinute - minCount),
    tier,
  };
}

interface Window {
  startMs: number;
  count: number;
}

interface LimitState {
  second: Window;
  minute: Window;
}

const PREFIX = "ratelimit/";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remainingSecond: number;
  remainingMinute: number;
  tier: TierDefinition;
}

function bucketStart(now: number, widthMs: number): number {
  return Math.floor(now / widthMs) * widthMs;
}

// ── In-memory per-instance fallback ──────────────────────────────────────────
//
// Used when Redis is unavailable in production (and under
// RATE_LIMIT_STRICT=true anywhere). Atomic within the instance because JS is
// single-threaded between awaits and this path performs no I/O — it cannot
// hang, cannot race, and adds zero latency inside enforce().
const memoryWindows = new Map<string, LimitState>();
const MEMORY_WINDOWS_MAX = 10_000;

function consumeMemory(
  keyId: string,
  tier: TierDefinition,
  cost: number,
): RateLimitResult {
  const now = Date.now();
  const secondStart = bucketStart(now, 1_000);
  const minuteStart = bucketStart(now, 60_000);

  let state = memoryWindows.get(keyId);
  if (!state) {
    if (memoryWindows.size >= MEMORY_WINDOWS_MAX) {
      // Prune entries whose minute window has rolled over; if the map is
      // somehow still full (10k live keys in one minute), evict the oldest
      // insertion so the limiter keeps working under key-churn attacks.
      for (const [k, v] of memoryWindows) {
        if (v.minute.startMs !== minuteStart) memoryWindows.delete(k);
      }
      if (memoryWindows.size >= MEMORY_WINDOWS_MAX) {
        const oldest = memoryWindows.keys().next().value;
        if (oldest !== undefined) memoryWindows.delete(oldest);
      }
    }
    state = {
      second: { startMs: secondStart, count: 0 },
      minute: { startMs: minuteStart, count: 0 },
    };
    memoryWindows.set(keyId, state);
  }
  if (state.second.startMs !== secondStart) state.second = { startMs: secondStart, count: 0 };
  if (state.minute.startMs !== minuteStart) state.minute = { startMs: minuteStart, count: 0 };

  const nextSecond = state.second.count + cost;
  const nextMinute = state.minute.count + cost;

  if (nextSecond > tier.rateLimitPerSecond) {
    incrementCounter('hawkeye_rate_limit_rejections_total', 1, { tier: tier.id, window: 'memory_second' });
    return {
      allowed: false,
      retryAfterSec: 1,
      remainingSecond: 0,
      remainingMinute: Math.max(0, tier.rateLimitPerMinute - state.minute.count),
      tier,
    };
  }
  if (nextMinute > tier.rateLimitPerMinute) {
    incrementCounter('hawkeye_rate_limit_rejections_total', 1, { tier: tier.id, window: 'memory_minute' });
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((minuteStart + 60_000 - now) / 1_000)),
      remainingSecond: Math.max(0, tier.rateLimitPerSecond - state.second.count),
      remainingMinute: 0,
      tier,
    };
  }

  state.second.count = nextSecond;
  state.minute.count = nextMinute;
  return {
    allowed: true,
    retryAfterSec: 0,
    remainingSecond: Math.max(0, tier.rateLimitPerSecond - nextSecond),
    remainingMinute: Math.max(0, tier.rateLimitPerMinute - nextMinute),
    tier,
  };
}

export async function consumeRateLimit(
  keyId: string,
  tierId: string,
  cost = 1,
): Promise<RateLimitResult> {
  const tier = tierFor(tierId);
  // Clamp cost to a positive integer so a misconfigured caller can't
  // zero-out the counter or overflow it. Log misconfigurations so they
  // aren't silently swallowed.
  if (cost < 1) {
    console.warn(`[rate-limit] cost ${cost} for key '${keyId}' is below 1 — clamping to 1. Check the caller's cost configuration.`);
    incrementCounter('hawkeye_rate_limit_cost_clamp_total', 1, { tier: tierId });
  }
  const effectiveCost = Math.max(1, Math.floor(cost));

  // Prefer Redis atomic enforcement when configured.
  const redisResult = await consumeRedis(keyId, tier, effectiveCost);
  if (redisResult !== null) return redisResult;

  // When Redis is unavailable, decide between the deterministic in-memory
  // per-instance limiter and the blob-based soft fallback (vulnerable to
  // read-modify-write races under concurrent Lambda invocations, and up to
  // three store round-trips per check).
  //
  // In-memory is the DEFAULT in production: tier limits stay enforced (per
  // instance) with zero I/O. The previous blanket allowed:false here caused
  // the 2026-06-11 platform outage — every route answered 429 while Upstash
  // was unreachable from a degraded Lambda. RATE_LIMIT_STRICT=true selects
  // the in-memory path in any environment; =false opts into the soft blob
  // fallback; unset → in-memory in production, blobs in dev/test.
  const strictFlag = process.env["RATE_LIMIT_STRICT"]?.trim().toLowerCase();
  const strict =
    strictFlag === "true" ||
    (strictFlag !== "false" && process.env.NODE_ENV === "production");
  if (strict) {
    console.warn("[rate-limit] Redis unavailable — enforcing per-instance in-memory limits until it recovers (cross-instance aggregation suspended)");
    incrementCounter('hawkeye_rate_limit_fallback_total', 1, { tier: tier.id, mode: 'memory' });
    return consumeMemory(keyId, tier, effectiveCost);
  }

  const now = Date.now();
  const storageKey = `${PREFIX}${keyId}`;
  const prior = (await getJson<LimitState>(storageKey)) ?? {
    second: { startMs: bucketStart(now, 1_000), count: 0 },
    minute: { startMs: bucketStart(now, 60_000), count: 0 },
  };

  const secondStart = bucketStart(now, 1_000);
  const minuteStart = bucketStart(now, 60_000);
  if (prior.second.startMs !== secondStart) {
    prior.second = { startMs: secondStart, count: 0 };
  }
  if (prior.minute.startMs !== minuteStart) {
    prior.minute = { startMs: minuteStart, count: 0 };
  }

  const nextSecond = prior.second.count + effectiveCost;
  const nextMinute = prior.minute.count + effectiveCost;

  if (nextSecond > tier.rateLimitPerSecond) {
    incrementCounter('hawkeye_rate_limit_rejections_total', 1, { tier: tier.id, window: 'second' });
    return {
      allowed: false,
      retryAfterSec: 1,
      remainingSecond: 0,
      remainingMinute: Math.max(0, tier.rateLimitPerMinute - prior.minute.count),
      tier,
    };
  }
  if (nextMinute > tier.rateLimitPerMinute) {
    incrementCounter('hawkeye_rate_limit_rejections_total', 1, { tier: tier.id, window: 'minute' });
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((minuteStart + 60_000 - now) / 1_000)),
      remainingSecond: Math.max(0, tier.rateLimitPerSecond - prior.second.count),
      remainingMinute: 0,
      tier,
    };
  }

  prior.second.count = nextSecond;
  prior.minute.count = nextMinute;
  await setJson(storageKey, prior);

  // Post-write read-back: detect a subset of concurrent increments from other
  // Lambda instances. Catches the case where one Lambda incremented the bucket
  // to a different value than ours (i.e. reads back a higher count). Does NOT
  // catch the "last-writer-wins with identical value" race where two Lambdas
  // independently compute the same nextSecond and one silently overwrites the
  // other — in that case both see the expected count and both are allowed through.
  // For strictly atomic per-second enforcement, configure
  // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (the primary Redis path).
  const readBack = await getJson<LimitState>(storageKey).catch(() => null);
  if (readBack && readBack.second.count !== nextSecond) {
    console.warn(
      `[rate-limit] concurrent write detected for key=${keyId}: ` +
      `expected count=${nextSecond}, stored count=${readBack.second.count} ` +
      `— treating as limit exceeded (blob CAS unavailable; use Redis for atomic enforcement)`,
    );
    incrementCounter('hawkeye_rate_limit_rejections_total', 1, { tier: tier.id, window: 'concurrent_write' });
    return {
      allowed: false,
      retryAfterSec: 1,
      remainingSecond: 0,
      remainingMinute: Math.max(0, tier.rateLimitPerMinute - readBack.minute.count),
      tier,
    };
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remainingSecond: Math.max(0, tier.rateLimitPerSecond - nextSecond),
    remainingMinute: Math.max(0, tier.rateLimitPerMinute - nextMinute),
    tier,
  };
}

// ── Org-level quota pool ──────────────────────────────────────────────────────
//
// Spring-cloud-gateway inspired: multi-key organisations share a monthly pool
// so they can't bypass per-key limits by fanning out across many API keys.
// Enforcement is best-effort (last-writer-wins, same as Blobs rate limiter).
// For hard enforcement, the same Redis pipeline pattern used above applies.

export interface OrgQuotaResult {
  allowed: boolean;
  remaining: number;
}

const ORG_QUOTA_PREFIX = "org-quota/";

function orgQuotaMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface OrgQuotaState {
  orgId: string;
  monthKey: string;
  used: number;
  limit: number;
}

/**
 * Check and decrement an org-level monthly quota pool. Returns allowed=false
 * when the organisation has exhausted its monthly budget across all its keys.
 *
 * This is layered on top of per-key enforcement — both must pass. Keys without
 * an orgId skip this check entirely and are governed only by per-key limits.
 *
 * @param orgId  Organisation identifier from ApiKeyRecord.orgId.
 * @param cost   Request cost units to consume (same units as consumeRateLimit).
 */
export async function consumeOrgQuota(
  orgId: string,
  cost: number,
): Promise<OrgQuotaResult> {
  const limit   = parseInt(process.env["GATEWAY_ORG_MONTHLY_LIMIT"] ?? "1000000", 10);
  const monthKey = orgQuotaMonthKey();
  const key     = `${ORG_QUOTA_PREFIX}${orgId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64)}/${monthKey}.json`;

  const existing = await getJson<OrgQuotaState>(key).catch(() => null);
  const state: OrgQuotaState = existing ?? { orgId, monthKey, used: 0, limit };

  // Reset if stored month key is stale (Lambda warm across month boundary)
  if (state.monthKey !== monthKey) {
    state.monthKey = monthKey;
    state.used     = 0;
    state.limit    = limit;
  }

  const projected = state.used + cost;
  if (projected > state.limit) {
    incrementCounter("hawkeye_org_quota_exceeded_total", 1, {
      orgId: orgId.slice(0, 12),
    });
    return { allowed: false, remaining: Math.max(0, state.limit - state.used) };
  }

  state.used = projected;
  void setJson(key, state).catch((err: unknown) => {
    console.error("[rate-limit] org quota state write failed — stale quota possible:", err instanceof Error ? err.message : String(err));
  });
  return { allowed: true, remaining: state.limit - projected };
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  // x-ratelimit-reset: Unix timestamp (seconds) when the most-constrained
  // window resets. Clients use this to schedule the next retry precisely.
  const resetTimestamp = Math.floor(Date.now() / 1000) + (r.allowed ? 0 : r.retryAfterSec);
  return {
    "x-ratelimit-tier": r.tier.id,
    // Per-minute window (the primary capacity window)
    "x-ratelimit-limit": String(r.tier.rateLimitPerMinute),
    "x-ratelimit-remaining": String(r.remainingMinute),
    "x-ratelimit-reset": String(resetTimestamp),
    // Granular windows for clients that want sub-minute visibility
    "x-ratelimit-limit-minute": String(r.tier.rateLimitPerMinute),
    "x-ratelimit-remaining-minute": String(r.remainingMinute),
    "x-ratelimit-limit-second": String(r.tier.rateLimitPerSecond),
    "x-ratelimit-remaining-second": String(r.remainingSecond),
    // Retry-After on 429 responses (RFC 7231 §7.1.3)
    // Seconds form is the primary value; HTTP-date form is a convenience alias
    // for clients that prefer absolute timestamps (e.g. browsers, fetch polyfills).
    ...(r.allowed ? {} : {
      "retry-after": String(r.retryAfterSec),
      "retry-after-date": new Date(Date.now() + r.retryAfterSec * 1000).toUTCString(),
    }),
  };
}
