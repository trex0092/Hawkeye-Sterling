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

async function redisIncr(key: string, ttlSeconds: number): Promise<number | null> {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return null;
  try {
    // INCR key — atomic increment
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!incrRes.ok) return null;
    const incrBody = await incrRes.json() as { result?: number };
    const count = incrBody.result ?? 0;
    // Only set TTL on first write (count === 1) to avoid resetting the window
    if (count === 1) {
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    return count;
  } catch {
    return null;
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

  // For cost > 1 we issue cost increments but only one TTL set. Use sequential
  // INCR calls so the final count reflects the full cost of this request.
  async function incrBy(key: string, ttlSec: number, n: number): Promise<number | null> {
    let last: number | null = null;
    for (let i = 0; i < n; i++) {
      const v = await redisIncr(key, ttlSec);
      if (v === null) return null;
      last = v;
    }
    return last;
  }

  const [secCount, minCount] = await Promise.all([
    incrBy(secKey, 2, cost),
    incrBy(minKey, 62, cost),
  ]);
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
