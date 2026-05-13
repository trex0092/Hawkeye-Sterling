// GDELT cache layer — resolves D1 from the Section D refactor.
//
// Before: every screening run made one GDELT call from adverse-media-live and
// potentially another from super_brain or weaponized-brain. When GDELT
// degraded (10s+ latency, transient 502s, etc.) every call site failed
// simultaneously — the confirmed single-point-of-failure.
//
// After: all GDELT reads route through fetchGdeltCached(). Hot path serves
// from in-memory (warm-Lambda) or Redis (across-Lambda) without hitting
// GDELT at all. Cold path makes one upstream call and persists the result.
// On GDELT failure, returns the last-known result with stale=true rather
// than a hard failure — gives the brain something to reason about while
// upstream recovers.
//
// Layers (probed in order, populated downward on miss):
//   1. In-memory Map  (TTL 30 min, scoped to a single warm Lambda instance)
//   2. Upstash Redis  (TTL 6 h, shared across all Lambdas; optional)
//   3. Live GDELT     (with retry-once + 20s timeout)
//
// Stale fallback: if GDELT fails AND a stale (Redis-only) result is available
// within STALE_OK_SECONDS, return it tagged stale. The caller decides how to
// downgrade confidence based on the flag.

import { getRedis } from "@/lib/cache/redis";

export interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  tone?: number;
  relevance?: number;
  socialimage?: string;
}

export interface GdeltCachedResult {
  articles: GdeltArticle[];
  fetchedAt: number;
  source: "memory" | "redis" | "live";
  stale: boolean;
  serviceError: boolean;
}

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 20_000;
const ART19_LOOKBACK_YEARS = 10;
const GDELT_MAX_RECORDS = 75;

// In-memory cache TTL — 30 min. Short enough that a single warm Lambda doesn't
// serve very stale results across many screenings; long enough to absorb
// repeated calls within the same case workup.
const MEMORY_TTL_MS = 30 * 60 * 1_000;

// Redis TTL — 6 h. Balances freshness (GDELT updates roughly every 15 min) with
// cost (one upstream call per subject per 6 h instead of per request).
const REDIS_TTL_SECONDS = 6 * 3_600;

// Stale window — return Redis-cached results up to 7 days old on GDELT failure.
// Past this point the staleness exceeds compliance value (FDL Art.19 expects
// reasonably current data) and we surface the upstream error instead.
const STALE_OK_SECONDS = 7 * 24 * 3_600;

// ─── In-memory layer ────────────────────────────────────────────────────────

interface MemEntry { value: Omit<GdeltCachedResult, "source" | "stale">; expiresAt: number }
const _mem = new Map<string, MemEntry>();

function memKey(subjectName: string): string {
  return `gdelt:${subjectName.toLowerCase().trim()}`;
}

function memGet(key: string): MemEntry["value"] | null {
  const e = _mem.get(key);
  if (!e) return null;
  if (Date.now() >= e.expiresAt) {
    _mem.delete(key);
    return null;
  }
  return e.value;
}

function memSet(key: string, value: MemEntry["value"]): void {
  _mem.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  // Cap memory cache size to prevent unbounded growth across long-lived warm
  // Lambdas. Eviction is FIFO — Map iteration order is insertion order.
  while (_mem.size > 500) {
    const first = _mem.keys().next().value;
    if (first === undefined) break;
    _mem.delete(first);
  }
}

// ─── Redis layer ────────────────────────────────────────────────────────────

async function redisGet(key: string): Promise<MemEntry["value"] | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    return await redis.get<MemEntry["value"]>(key);
  } catch (err) {
    console.warn("[gdelt-cache] redis get failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function redisSet(key: string, value: MemEntry["value"]): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    // We store with the longer STALE_OK_SECONDS TTL but treat anything older
    // than REDIS_TTL_SECONDS as a soft miss (live fetch is preferred). The
    // longer raw TTL is what enables the stale-on-failure fallback.
    await redis.set(key, value, { ex: STALE_OK_SECONDS });
  } catch (err) {
    console.warn("[gdelt-cache] redis set failed:", err instanceof Error ? err.message : err);
  }
}

// ─── GDELT live fetch ───────────────────────────────────────────────────────

function gdeltDateTime(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

// Default adverse-media keyword OR clause. Kept here so the cache module is
// self-contained — callers can override by passing a custom `query` parameter
// (used for cases where the standard adverse-media keyword set isn't right).
const DEFAULT_ADVERSE_KEYWORDS = [
  "sanction*", "OFAC", "SDN", "designat*",
  "fraud", "scam", "Ponzi", "embezzl*",
  "money launder*", "AML",
  "corrupt*", "brib*",
  "arrest*", "indict*", "convict*", "guilty", "prosecut*",
  "terror*", "militant",
  "investigat*",
];

function defaultQuery(subjectName: string): string {
  const kw = DEFAULT_ADVERSE_KEYWORDS.join(" OR ");
  return `"${subjectName}" AND (${kw})`;
}

async function liveFetch(subjectName: string, customQuery?: string): Promise<{ articles: GdeltArticle[]; serviceError: boolean }> {
  const rawQuery = customQuery ?? defaultQuery(subjectName);
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - ART19_LOOKBACK_YEARS);

  const params = new URLSearchParams({
    query: rawQuery,
    mode: "artlist",
    maxrecords: String(GDELT_MAX_RECORDS),
    format: "json",
    sort: "DateDesc",
    startdatetime: gdeltDateTime(start),
    enddatetime: gdeltDateTime(end),
  });
  const url = `${GDELT_BASE}?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3_000));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; gdelt-cache)",
          accept: "application/json",
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429) continue; // rate-limited, retry once
      if (!res.ok) return { articles: [], serviceError: true };
      const data = (await res.json()) as { articles?: GdeltArticle[] };
      return {
        articles: Array.isArray(data.articles) ? data.articles.filter((a) => a.url && a.title) : [],
        serviceError: false,
      };
    } catch {
      clearTimeout(timer);
    }
  }
  return { articles: [], serviceError: true };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface FetchGdeltOpts {
  /** Override the default adverse-media keyword query. */
  query?: string;
  /**
   * Force a live fetch (bypass cache). The result is still written to the
   * cache layers so subsequent calls benefit. Use sparingly — defeats the
   * point of the cache.
   */
  forceRefresh?: boolean;
}

export async function fetchGdeltCached(
  subjectName: string,
  opts: FetchGdeltOpts = {},
): Promise<GdeltCachedResult> {
  const key = memKey(subjectName);

  // Layer 1 — memory (skipped when forceRefresh).
  if (!opts.forceRefresh) {
    const memHit = memGet(key);
    if (memHit) {
      return { ...memHit, source: "memory", stale: false };
    }
    // Layer 2 — Redis.
    const redisHit = await redisGet(key);
    if (redisHit) {
      const age = (Date.now() - redisHit.fetchedAt) / 1_000;
      if (age < REDIS_TTL_SECONDS) {
        memSet(key, redisHit);
        return { ...redisHit, source: "redis", stale: false };
      }
      // Older than REDIS_TTL but within STALE_OK — we'll keep this as a
      // fallback in case the live call fails below.
    }
  }

  // Layer 3 — live GDELT.
  const live = await liveFetch(subjectName, opts.query);
  if (!live.serviceError) {
    const value: MemEntry["value"] = {
      articles: live.articles,
      fetchedAt: Date.now(),
      serviceError: false,
    };
    memSet(key, value);
    await redisSet(key, value);
    return { ...value, source: "live", stale: false };
  }

  // Live failed — try to recover with stale Redis data if available.
  const stale = opts.forceRefresh ? null : await redisGet(key);
  if (stale) {
    const ageSeconds = (Date.now() - stale.fetchedAt) / 1_000;
    if (ageSeconds < STALE_OK_SECONDS) {
      return { ...stale, source: "redis", stale: true, serviceError: true };
    }
  }

  // No recoverable data — surface the upstream failure.
  return {
    articles: [],
    fetchedAt: Date.now(),
    source: "live",
    stale: false,
    serviceError: true,
  };
}

// Clear the in-memory cache. Tests + admin diagnostics. Does not flush Redis.
export function clearGdeltMemoryCache(): void {
  _mem.clear();
}

// Diagnostic snapshot of memory cache state — used by /api/status or admin.
export function gdeltCacheStats(): { entries: number; oldestAgeMs: number | null } {
  if (_mem.size === 0) return { entries: 0, oldestAgeMs: null };
  let oldest = Date.now();
  for (const entry of _mem.values()) {
    const t = entry.expiresAt - MEMORY_TTL_MS;
    if (t < oldest) oldest = t;
  }
  return { entries: _mem.size, oldestAgeMs: Date.now() - oldest };
}
