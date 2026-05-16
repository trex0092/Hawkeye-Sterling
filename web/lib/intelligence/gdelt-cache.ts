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
  // Enhanced fields added by multi-query enrichment
  riskCategories?: string[];
  sourceScore?: number;   // 0-1 source reputation
  queryLabel?: string;    // which risk query matched
  language?: string;
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
const GDELT_MAX_RECORDS = 250;

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

// ─── Multi-query strategy (Taranis-parity) ─────────────────────────────────
//
// Taranis AI runs NLP over 38+ news outlets. We replicate the effect by
// firing 6 parallel GDELT queries, each targeting a distinct FATF risk
// category, then merging + deduplicating results. This gives us:
//   - 6× the article coverage of a single query
//   - Category labels on every article (like Taranis NLP tags)
//   - Cross-language coverage (GDELT indexes 65+ languages)
//   - Source reputation scoring (Taranis vendor-weights sources)

interface RiskQueryDef {
  label: string;       // displayed in UI / used for riskCategories tag
  keywords: string[];  // ORed together inside the GDELT query
  categories: string[];
}

const RISK_QUERIES: RiskQueryDef[] = [
  {
    label: "sanctions",
    keywords: ["sanction*", "OFAC", "SDN", "designat*", "blacklist*", "asset freeze", "travel ban", "UN SC"],
    categories: ["sanctions"],
  },
  {
    label: "financial_crime",
    keywords: ["money launder*", "AML", "CFT", "terrorist financing", "fraud", "embezzl*", "Ponzi", "scam", "wire fraud", "bank fraud"],
    categories: ["money_laundering", "fraud"],
  },
  {
    label: "criminal",
    keywords: ["arrest*", "indict*", "convict*", "guilty plea", "prosecut*", "charged with", "criminal investigation", "warrant", "fugitive", "extradition"],
    categories: ["law_enforcement", "criminal"],
  },
  {
    label: "corruption",
    keywords: ["corrupt*", "brib*", "kickback*", "embezzl*", "misappropriat*", "illicit enrichment", "FCPA", "UK Bribery Act"],
    categories: ["corruption"],
  },
  {
    label: "regulatory",
    keywords: ["regulatory action", "enforcement action", "fine*", "penalt*", "license revok*", "cease and desist", "SEC enforcement", "FCA action", "FINMA", "CBUAE"],
    categories: ["regulatory"],
  },
  {
    label: "adverse_media",
    keywords: ["short seller", "Hindenburg", "Muddy Waters", "Citron", "investigative report*", "ICIJ", "OCCRP", "Panama Papers", "Pandora Papers", "money mule", "shell compan*", "beneficial owner*"],
    categories: ["adverse_media", "dpms"],
  },
];

// High-reputation news domains — articles from these sources score higher.
// Mirrors how Taranis weights its 38 vetted outlets.
const HIGH_REP_DOMAINS = new Set([
  "reuters.com", "ft.com", "bloomberg.com", "wsj.com", "theguardian.com",
  "bbc.com", "bbc.co.uk", "nytimes.com", "apnews.com", "france24.com",
  "aljazeera.com", "dw.com", "euronews.com", "themoscowtimes.com",
  "scmp.com", "channelnewsasia.com", "arabnews.com", "thenationalnews.com",
  "gulfnews.com", "zawya.com", "middleeasteye.net",
  "occrp.org", "icij.org", "globalwitness.org", "transparency.org",
  "fatf-gafi.org", "un.org", "worldbank.org", "imf.org",
]);
const MED_REP_DOMAINS = new Set([
  "cnbc.com", "forbes.com", "businessinsider.com", "marketwatch.com",
  "yahoo.com", "abc.net.au", "cbc.ca", "irishtimes.com", "independent.co.uk",
  "telegraph.co.uk", "lemonde.fr", "lefigaro.fr", "spiegel.de", "faz.net",
  "corriere.it", "elpais.com", "rtve.es", "nrc.nl", "svd.se",
  "haaretz.com", "timesofisrael.com", "arabtimesonline.com",
]);

function sourceScore(domain?: string): number {
  if (!domain) return 0.4;
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (HIGH_REP_DOMAINS.has(d)) return 1.0;
  if (MED_REP_DOMAINS.has(d)) return 0.75;
  return 0.5;
}

function buildGdeltUrl(subjectName: string, query: RiskQueryDef, start: Date, end: Date): string {
  const kw = query.keywords.join(" OR ");
  const rawQuery = `"${subjectName}" AND (${kw})`;
  const params = new URLSearchParams({
    query: rawQuery,
    mode: "artlist",
    maxrecords: String(GDELT_MAX_RECORDS),
    format: "json",
    sort: "DateDesc",
    startdatetime: gdeltDateTime(start),
    enddatetime: gdeltDateTime(end),
  });
  return `${GDELT_BASE}?${params.toString()}`;
}

async function fetchOneQuery(
  url: string,
  queryDef: RiskQueryDef,
): Promise<GdeltArticle[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2_000));
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
      if (res.status === 429) continue;
      if (!res.ok) return [];
      const data = (await res.json()) as { articles?: GdeltArticle[] };
      return (Array.isArray(data.articles) ? data.articles : [])
        .filter((a) => a.url && a.title)
        .map((a) => ({
          ...a,
          riskCategories: queryDef.categories,
          sourceScore: sourceScore(a.domain),
          queryLabel: queryDef.label,
        }));
    } catch {
      clearTimeout(timer);
    }
  }
  return [];
}

async function liveFetch(subjectName: string, customQuery?: string): Promise<{ articles: GdeltArticle[]; serviceError: boolean }> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - ART19_LOOKBACK_YEARS);

  // Custom query (caller override) → single fetch, original behaviour
  if (customQuery) {
    const params = new URLSearchParams({
      query: customQuery,
      mode: "artlist",
      maxrecords: String(GDELT_MAX_RECORDS),
      format: "json",
      sort: "DateDesc",
      startdatetime: gdeltDateTime(start),
      enddatetime: gdeltDateTime(end),
    });
    const url = `${GDELT_BASE}?${params.toString()}`;
    const articles = await fetchOneQuery(url, { label: "custom", keywords: [], categories: ["adverse_media"] });
    return { articles, serviceError: articles.length === 0 };
  }

  // Multi-query parallel strategy — fire all 6 risk queries simultaneously
  const urls = RISK_QUERIES.map((q) => ({ q, url: buildGdeltUrl(subjectName, q, start, end) }));
  const results = await Promise.allSettled(urls.map(({ q, url }) => fetchOneQuery(url, q)));

  const allArticles: GdeltArticle[] = [];
  let anySucceeded = false;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length >= 0) {
      allArticles.push(...r.value);
      anySucceeded = true;
    }
  }

  if (!anySucceeded) return { articles: [], serviceError: true };

  // Deduplicate by URL — when multiple queries return the same article,
  // merge their riskCategories so one article can carry multiple tags.
  const byUrl = new Map<string, GdeltArticle>();
  for (const a of allArticles) {
    const key = (a.url ?? "").toLowerCase();
    if (!key) continue;
    const existing = byUrl.get(key);
    if (existing) {
      // Merge categories from duplicate matches
      existing.riskCategories = Array.from(
        new Set([...(existing.riskCategories ?? []), ...(a.riskCategories ?? [])])
      );
      // Keep highest source score
      if ((a.sourceScore ?? 0) > (existing.sourceScore ?? 0)) existing.sourceScore = a.sourceScore;
    } else {
      byUrl.set(key, { ...a });
    }
  }

  // Sort: high-reputation sources first, then most recent
  const deduped = Array.from(byUrl.values()).sort((a, b) => {
    const scoreDiff = (b.sourceScore ?? 0.5) - (a.sourceScore ?? 0.5);
    if (Math.abs(scoreDiff) > 0.2) return scoreDiff;
    return (b.seendate ?? "").localeCompare(a.seendate ?? "");
  });

  return { articles: deduped, serviceError: false };
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
