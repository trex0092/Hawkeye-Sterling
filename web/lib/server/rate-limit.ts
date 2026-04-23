// Hawkeye Sterling — per-API-key rate limiter.
//
// Fixed-window counters in Netlify Blobs. Two windows per key:
//   second-resolution cap (burst)
//   minute-resolution cap (sustained)
// Limits come from the tier definition so commercial tiers are published
// in one place.

import { getJson, setJson } from "./store";
import { tierFor, type TierDefinition } from "@/lib/data/tiers";

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
): Promise<RateLimitResult> {
  const tier = tierFor(tierId);
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

  const nextSecond = prior.second.count + 1;
  const nextMinute = prior.minute.count + 1;

  if (nextSecond > tier.rateLimitPerSecond) {
    return {
      allowed: false,
      retryAfterSec: 1,
      remainingSecond: 0,
      remainingMinute: Math.max(0, tier.rateLimitPerMinute - prior.minute.count),
      tier,
    };
  }
  if (nextMinute > tier.rateLimitPerMinute) {
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

  return {
    allowed: true,
    retryAfterSec: 0,
    remainingSecond: Math.max(0, tier.rateLimitPerSecond - nextSecond),
    remainingMinute: Math.max(0, tier.rateLimitPerMinute - nextMinute),
    tier,
  };
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "x-ratelimit-tier": r.tier.id,
    "x-ratelimit-limit-minute": String(r.tier.rateLimitPerMinute),
    "x-ratelimit-remaining-minute": String(r.remainingMinute),
    "x-ratelimit-limit-second": String(r.tier.rateLimitPerSecond),
    "x-ratelimit-remaining-second": String(r.remainingSecond),
    ...(r.allowed ? {} : { "retry-after": String(r.retryAfterSec) }),
  };
}
