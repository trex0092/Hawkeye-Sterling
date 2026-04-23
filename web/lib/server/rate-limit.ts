// Hawkeye Sterling — tiered rate limiting.
//
// Token bucket for per-minute burst protection + monthly counter for quota.
// In-memory default; swap via setRateLimitStore for production backends
// (Redis, Upstash). Emits the canonical X-RateLimit-* headers used by every
// modern REST API so clients can self-throttle.
//
// Tiers (requests per minute / requests per month):
//   free        60      1,000
//   growth     600     50,000
//   scale    6,000    500,000
//   enterprise ∞          ∞   (or overridden by ApiKeyRecord.monthlyQuota)

import type { ApiKeyRecord, ApiTier } from "./api-keys.js";

export interface RateLimitResult {
  allowed: boolean;
  limitPerMinute: number;
  remainingPerMinute: number;
  resetAtSec: number;            // unix seconds when the minute bucket refills
  monthlyLimit: number;
  monthlyRemaining: number;
  monthlyResetAtSec: number;     // unix seconds at start of next month
  retryAfterSec?: number;        // present when denied
}

const TIER_PER_MINUTE: Record<ApiTier, number> = {
  free: 60,
  growth: 600,
  scale: 6_000,
  enterprise: Number.POSITIVE_INFINITY,
};

interface Bucket {
  tokens: number;
  lastRefill: number;            // ms timestamp
  monthly: { count: number; period: string };
}

interface RateLimitStore {
  get(tenantId: string): Bucket | undefined;
  set(tenantId: string, bucket: Bucket): void;
}

class InMemoryBucketStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  get(tenantId: string): Bucket | undefined {
    return this.buckets.get(tenantId);
  }
  set(tenantId: string, bucket: Bucket): void {
    this.buckets.set(tenantId, bucket);
  }
}

let STORE: RateLimitStore = new InMemoryBucketStore();

export function setRateLimitStore(store: RateLimitStore): void {
  STORE = store;
}

/** Test-only — reset the in-memory store. */
export function __resetRateLimitStore(): void {
  STORE = new InMemoryBucketStore();
}

function periodKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfNextMonthSec(now: Date): number {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return Math.floor(next.getTime() / 1000);
}

export function checkRateLimit(
  record: ApiKeyRecord,
  now: Date = new Date(),
): RateLimitResult {
  const perMinute = TIER_PER_MINUTE[record.tier];
  const monthlyLimit = record.monthlyQuota;
  const nowMs = now.getTime();
  const period = periodKey(now);

  let bucket = STORE.get(record.tenantId);
  if (!bucket) {
    bucket = {
      tokens: Number.isFinite(perMinute) ? perMinute : Number.POSITIVE_INFINITY,
      lastRefill: nowMs,
      monthly: { count: 0, period },
    };
  }

  // Refill token bucket — full refill every 60s, linear interpolation between.
  if (Number.isFinite(perMinute)) {
    const elapsedMs = nowMs - bucket.lastRefill;
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 60_000) * perMinute;
      bucket.tokens = Math.min(perMinute, bucket.tokens + refill);
      bucket.lastRefill = nowMs;
    }
  }

  // Reset monthly counter when the calendar month rolls over.
  if (bucket.monthly.period !== period) {
    bucket.monthly = { count: 0, period };
  }

  const resetAtSec = Math.floor(nowMs / 1000) + 60;
  const monthlyResetAtSec = startOfNextMonthSec(now);

  // Quota denial wins over burst denial, since quota is the enforcing constraint.
  if (bucket.monthly.count >= monthlyLimit) {
    STORE.set(record.tenantId, bucket);
    return {
      allowed: false,
      limitPerMinute: Number.isFinite(perMinute) ? perMinute : 0,
      remainingPerMinute: Math.floor(bucket.tokens),
      resetAtSec,
      monthlyLimit,
      monthlyRemaining: 0,
      monthlyResetAtSec,
      retryAfterSec: monthlyResetAtSec - Math.floor(nowMs / 1000),
    };
  }

  if (Number.isFinite(perMinute) && bucket.tokens < 1) {
    const secondsToOneToken = Math.ceil((1 - bucket.tokens) * (60 / perMinute));
    STORE.set(record.tenantId, bucket);
    return {
      allowed: false,
      limitPerMinute: perMinute,
      remainingPerMinute: 0,
      resetAtSec,
      monthlyLimit,
      monthlyRemaining: monthlyLimit - bucket.monthly.count,
      monthlyResetAtSec,
      retryAfterSec: Math.max(1, secondsToOneToken),
    };
  }

  // Charge the request.
  if (Number.isFinite(perMinute)) bucket.tokens -= 1;
  bucket.monthly.count += 1;
  STORE.set(record.tenantId, bucket);

  return {
    allowed: true,
    limitPerMinute: Number.isFinite(perMinute) ? perMinute : 0,
    remainingPerMinute: Number.isFinite(perMinute) ? Math.floor(bucket.tokens) : 0,
    resetAtSec,
    monthlyLimit,
    monthlyRemaining:
      Number.isFinite(monthlyLimit) ? monthlyLimit - bucket.monthly.count : 0,
    monthlyResetAtSec,
  };
}

/** Build the X-RateLimit-* headers for a response. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const h: Record<string, string> = {
    "X-RateLimit-Limit": String(r.limitPerMinute),
    "X-RateLimit-Remaining": String(r.remainingPerMinute),
    "X-RateLimit-Reset": String(r.resetAtSec),
    "X-RateLimit-Monthly-Limit": String(r.monthlyLimit),
    "X-RateLimit-Monthly-Remaining": String(r.monthlyRemaining),
    "X-RateLimit-Monthly-Reset": String(r.monthlyResetAtSec),
  };
  if (r.retryAfterSec !== undefined) {
    h["Retry-After"] = String(r.retryAfterSec);
  }
  return h;
}
