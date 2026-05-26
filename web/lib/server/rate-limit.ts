// Hawkeye Sterling — per-API-key rate limiter.
//
// Two enforcement paths:
//
// 1. Upstash Redis (hard enforcement): when UPSTASH_REDIS_REST_URL and
//    UPSTASH_REDIS_REST_TOKEN are set, uses atomic INCR + EXPIRE via the
//    Upstash REST API. Provides strict per-second and per-minute limits
//    with no race conditions across Lambda instances.
//
// 2. Netlify Blobs (soft enforcement): fallback when Redis is unavailable.
//    Fixed-window counters with no CAS — concurrent requests in the same
//    blob round-trip can slip through. Acceptable at low concurrency.
//
// Required env vars for hard enforcement:
//   UPSTASH_REDIS_REST_URL   – e.g. https://<id>.upstash.io
//   UPSTASH_REDIS_REST_TOKEN – service account token

import { getJson, setJson } from "./store";
import { tierFor, type TierDefinition } from "@/lib/data/tiers";
import { incrementCounter } from "./metrics-store";

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

async function redisPipeline(
  commands: Array<readonly [string, ...string[]]>,
): Promise<Array<number | null>> {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return commands.map(() => null);
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) return commands.map(() => null);
    const results = await res.json() as Array<{ result?: number }>;
    return results.map((r) => (typeof r?.result === "number" ? r.result : null));
  } catch {
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

export async function consumeRateLimit(
  keyId: string,
  tierId: string,
  cost = 1,
): Promise<RateLimitResult> {
  const tier = tierFor(tierId);
  // Clamp cost to a positive integer so a misconfigured caller can't
  // zero-out the counter or overflow it.
  const effectiveCost = Math.max(1, Math.floor(cost));

  // Prefer Redis atomic enforcement when configured.
  const redisResult = await consumeRedis(keyId, tier, effectiveCost);
  if (redisResult !== null) return redisResult;

  // When RATE_LIMIT_STRICT=true and Redis is unavailable, refuse the request
  // rather than falling back to blob-based soft enforcement (which is vulnerable
  // to read-modify-write races under concurrent Lambda invocations).
  if (process.env["RATE_LIMIT_STRICT"] === "true") {
    console.error("[rate-limit] RATE_LIMIT_STRICT=true but Redis unavailable — returning 503 to prevent soft-limit bypass");
    incrementCounter('hawkeye_rate_limit_rejections_total', 1, { tier: tier.id, window: 'strict_redis_unavailable' });
    return {
      allowed: false,
      retryAfterSec: 5,
      remainingSecond: 0,
      remainingMinute: 0,
      tier,
    };
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

  // Post-write read-back: detect concurrent increments. If the stored value
  // jumped further than our write (another Lambda incremented concurrently),
  // log it so operators know the soft-limit is being exercised. The check
  // is best-effort — a second concurrent read could mask the discrepancy.
  // For hard enforcement, set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
  const readBack = await getJson<LimitState>(storageKey).catch(() => null);
  if (readBack && readBack.second.count > nextSecond + 1) {
    console.warn(
      `[rate-limit] concurrent write detected for key=${keyId}: ` +
      `expected count=${nextSecond}, stored count=${readBack.second.count} ` +
      `— rate limit is soft-enforced (blob CAS unavailable)`,
    );
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remainingSecond: Math.max(0, tier.rateLimitPerSecond - nextSecond),
    remainingMinute: Math.max(0, tier.rateLimitPerMinute - nextMinute),
    tier,
  };
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
    ...(r.allowed ? {} : { "retry-after": String(r.retryAfterSec) }),
  };
}
