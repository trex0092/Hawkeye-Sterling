// Hawkeye Sterling — worldwide adverse-media deep scan.
//
// The synchronous screening path is budget-capped (Lane C gets 3.5 s inside
// the 4.3 s SLA), so exhaustive worldwide coverage cannot run inline. This
// module runs the exhaustive sweep ASYNCHRONOUSLY: the caller gets a scanId
// immediately, the sweep executes in the background (fire-and-forget — the
// hallucination-gate pattern: it must NEVER block or fail a screening
// response), and the full result is persisted to the blob store and
// retrievable via GET /api/adverse-media/deep-scan?scanId=...
//
// Coverage ("smart worldwide" profile, user-confirmed):
//   1. Global pass — every active news adapter + RSS wires + GDELT + LLM
//      recall, default language.
//   2. Per-country passes from buildWorldwideQueryPlan: the subject's own
//      countries plus every FATF call-for-action / increased-monitoring,
//      EU AMLD high-risk, and Basel very-high jurisdiction — each queried
//      in the country's primary press language with country-scoped GDELT.
//
// No result caps: every scored article is retained. Relevance scoring and
// deduplication still apply (an unscored worldwide dump has no evidential
// value) but nothing is silently dropped — articles below the relevance
// floor are returned in a separate lowRelevance bucket with full counts.
//
// Concurrency is bounded (HAWKEYE_DEEP_SCAN_CONCURRENCY, default 5 country
// batches in parallel) to respect provider rate limits. That bounds the
// REQUEST RATE, not the result volume.

import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { writeAuditChainEntry } from "./audit-chain";
import {
  scoreAndFilterArticles,
  aggregateMediaSeverity,
  type ScoredArticle,
  type RawArticle,
  type ArticleSeverity,
} from "./adverse-media-scorer";
import {
  buildWorldwideQueryPlan,
  type CountryMediaQuery,
  type WorldwideQueryPlanSubject,
} from "@/lib/intelligence/country-media-router";
import { searchAllNews } from "@/lib/intelligence/newsAdapters";
import { fetchGdeltCached } from "@/lib/intelligence/gdelt-cache";
import { llmAdverseMediaAdapter } from "@/lib/intelligence/llmAdverseMedia";

const SCAN_PREFIX = "adverse-media-deep-scans/";
const SCAN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // results retained 7 days
const RELEVANCE_FLOOR = 0.35;                 // same floor as the sync scorer

// ── Config (env-gated, fail-open to defaults) ────────────────────────────────

export interface DeepScanConfig {
  enabled: boolean;
  maxCountries: number;        // 0 = unlimited
  concurrency: number;         // parallel country batches
  perSourceLimit: number;      // articles requested per adapter per pass
}

function intEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    console.warn(`[deep-scan] ${key}="${raw}" not in [${min}, ${max}]; using default ${fallback}.`);
    return fallback;
  }
  return Math.floor(n);
}

export function deepScanConfig(): DeepScanConfig {
  const enabledRaw = (process.env["HAWKEYE_DEEP_SCAN_ENABLED"] ?? "true").toLowerCase();
  return {
    enabled: enabledRaw !== "false" && enabledRaw !== "0" && enabledRaw !== "no",
    maxCountries: intEnv("HAWKEYE_DEEP_SCAN_MAX_COUNTRIES", 0, 0, 500),
    concurrency: intEnv("HAWKEYE_DEEP_SCAN_CONCURRENCY", 5, 1, 20),
    perSourceLimit: intEnv("HAWKEYE_DEEP_SCAN_PER_SOURCE_LIMIT", 100, 1, 1000),
  };
}

// ── Result shapes ─────────────────────────────────────────────────────────────

export interface DeepScanCountryResult {
  country?: string;
  countryName?: string;
  language?: string;
  reason: CountryMediaQuery["reason"];
  articlesFound: number;
  providersUsed: string[];
}

export interface DeepScanRecord {
  scanId: string;
  status: "running" | "complete" | "failed";
  subject: { name: string; nationality?: string; jurisdiction?: string };
  tenantId: string;
  requestedAt: string;
  completedAt?: string;
  error?: string;
  // Plan + per-pass accounting (present from the start so pollers see progress shape).
  countriesPlanned: number;
  passes?: DeepScanCountryResult[];
  // Scored output — populated on completion. NOT truncated.
  severity?: ArticleSeverity | "none";
  totalRawArticles?: number;
  articles?: ScoredArticle[];               // relevance >= 0.35, grouped client-side
  articlesByCountry?: Record<string, number>;
  lowRelevance?: { count: number; articles: ScoredArticle[] }; // below-floor bucket — reported, not dropped
}

function scanKey(scanId: string): string {
  return `${SCAN_PREFIX}${scanId.replace(/[^A-Za-z0-9\-]/g, "_").slice(0, 64)}`;
}

async function persist(record: DeepScanRecord): Promise<void> {
  const store = getStore();
  await store.set(scanKey(record.scanId), JSON.stringify(record));
}

export async function getDeepScan(scanId: string): Promise<DeepScanRecord | null> {
  try {
    const store = getStore();
    const raw = await store.get(scanKey(scanId));
    if (!raw) return null;
    const record = JSON.parse(raw) as DeepScanRecord;
    if (Date.now() - new Date(record.requestedAt).getTime() > SCAN_TTL_MS) {
      void store.delete(scanKey(scanId)).catch(() => undefined);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

// ── Sweep execution ───────────────────────────────────────────────────────────

interface PassOutput {
  pass: DeepScanCountryResult;
  articles: RawArticle[];
}

async function runPass(
  subjectName: string,
  q: CountryMediaQuery,
  perSourceLimit: number,
): Promise<PassOutput> {
  const articles: RawArticle[] = [];
  const providers = new Set<string>();

  // News adapters (60+ sources, language/country threaded through).
  try {
    const res = await searchAllNews(subjectName, {
      limit: perSourceLimit,
      ...(q.language ? { language: q.language } : {}),
      ...(q.country ? { country: q.country } : {}),
    });
    for (const a of res.articles) {
      articles.push({
        title: a.title, url: a.url, source: a.source,
        publishedAt: a.publishedAt, snippet: a.snippet,
        ...(q.country ? { country: q.country } : {}),
        ...(a.language ?? q.language ? { language: a.language ?? q.language } : {}),
      });
    }
    res.providersUsed.forEach((p) => providers.add(p));
  } catch (err) {
    console.warn(`[deep-scan] news pass failed (${q.country ?? "global"}):`, err instanceof Error ? err.message : String(err));
  }

  // GDELT — country-scoped via sourcecountry operator. The cache key is the
  // subject string, so country passes use a suffixed key to avoid colliding
  // with the global pass entry.
  try {
    const gdeltSubject = q.country ? `${subjectName} |cc:${q.country}` : subjectName;
    const gdeltQuery = q.country
      ? `"${subjectName}" sourcecountry:${q.country}`
      : undefined;
    const g = await fetchGdeltCached(gdeltSubject, gdeltQuery ? { query: gdeltQuery } : {});
    for (const a of g.articles) {
      if (!a.title && !a.url) continue;
      articles.push({
        title: a.title ?? "", url: a.url, source: "gdelt",
        publishedAt: a.seendate, snippet: undefined,
        ...(q.country ? { country: q.country } : {}),
        ...(a.language ? { language: a.language } : {}),
      });
    }
    if (g.articles.length > 0) providers.add("gdelt");
  } catch (err) {
    console.warn(`[deep-scan] gdelt pass failed (${q.country ?? "global"}):`, err instanceof Error ? err.message : String(err));
  }

  // LLM recall — global pass only (the model's recall is not country-scoped;
  // one call per scan, 24 h cached, degrades to nothing without the API key).
  if (q.reason === "global") {
    try {
      const adapter = llmAdverseMediaAdapter({});
      if (adapter.isAvailable()) {
        const res = await adapter.search(subjectName, { limit: perSourceLimit });
        for (const a of res) {
          articles.push({ title: a.title, url: a.url, source: a.source, publishedAt: a.publishedAt, snippet: a.snippet });
        }
        if (res.length > 0) providers.add("claude-llm");
      }
    } catch (err) {
      console.warn("[deep-scan] llm pass failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return {
    pass: {
      ...(q.country ? { country: q.country } : {}),
      ...(q.countryName ? { countryName: q.countryName } : {}),
      ...(q.language ? { language: q.language } : {}),
      reason: q.reason,
      articlesFound: articles.length,
      providersUsed: [...providers],
    },
    articles,
  };
}

async function runDeepScan(record: DeepScanRecord, subject: WorldwideQueryPlanSubject): Promise<void> {
  const cfg = deepScanConfig();
  const plan = buildWorldwideQueryPlan(subject, cfg.maxCountries);
  record.countriesPlanned = plan.length - 1; // minus the global pass

  const outputs: PassOutput[] = [];
  // Global pass first (sequential — it warms shared caches), then country
  // passes in bounded-concurrency batches.
  const globalQuery = plan[0]!;
  outputs.push(await runPass(subject.name, globalQuery, cfg.perSourceLimit));
  const countryQueries = plan.slice(1);
  for (let i = 0; i < countryQueries.length; i += cfg.concurrency) {
    const batch = countryQueries.slice(i, i + cfg.concurrency);
    const settled = await Promise.allSettled(batch.map((q) => runPass(subject.name, q, cfg.perSourceLimit)));
    for (const s of settled) {
      if (s.status === "fulfilled") outputs.push(s.value);
    }
  }

  // Score EVERYTHING (minRelevance 0 keeps every deduplicated article), then
  // split into the actionable set and the below-floor bucket.
  const rawArticles = outputs.flatMap((o) => o.articles);
  const allScored = scoreAndFilterArticles(subject.name, rawArticles, 0);
  const relevant = allScored.filter((a) => a.relevanceScore >= RELEVANCE_FLOOR);
  const lowRelevance = allScored.filter((a) => a.relevanceScore < RELEVANCE_FLOOR);

  const articlesByCountry: Record<string, number> = {};
  for (const o of outputs) {
    const key = o.pass.country ?? "global";
    articlesByCountry[key] = (articlesByCountry[key] ?? 0) + o.pass.articlesFound;
  }

  record.status = "complete";
  record.completedAt = new Date().toISOString();
  record.passes = outputs.map((o) => o.pass);
  record.severity = aggregateMediaSeverity(relevant);
  record.totalRawArticles = rawArticles.length;
  record.articles = relevant;
  record.articlesByCountry = articlesByCountry;
  record.lowRelevance = { count: lowRelevance.length, articles: lowRelevance };

  await persist(record);

  // Audit-chain entry on completion (invariant: every screening decision is
  // chained). ERROR-level on failure — Art.18 auditability is compliance-critical.
  void writeAuditChainEntry(
    {
      event: "adverse_media.deep_scan.completed",
      actor: "system",
      subject: subject.name,
      scanId: record.scanId,
      countriesScanned: record.countriesPlanned,
      totalRawArticles: record.totalRawArticles,
      relevantArticles: relevant.length,
      lowRelevanceArticles: lowRelevance.length,
      severity: record.severity,
    },
    record.tenantId,
  ).catch((err: unknown) => {
    console.error("[deep-scan] audit write FAILED:", err instanceof Error ? err.message : String(err));
  });
}

/**
 * Start a worldwide adverse-media deep scan. Returns the scanId immediately;
 * the sweep runs in the background. Never throws on sweep failure — the
 * record transitions to status "failed" and the failure is logged.
 *
 * Returns null when deep scans are disabled via HAWKEYE_DEEP_SCAN_ENABLED.
 */
export async function startDeepScan(
  subject: WorldwideQueryPlanSubject,
  tenantId: string,
): Promise<string | null> {
  const cfg = deepScanConfig();
  if (!cfg.enabled) return null;

  const scanId = `dscan-${randomUUID()}`;
  const record: DeepScanRecord = {
    scanId,
    status: "running",
    subject: {
      name: subject.name,
      ...(subject.nationality ? { nationality: subject.nationality } : {}),
      ...(subject.jurisdiction ? { jurisdiction: subject.jurisdiction } : {}),
    },
    tenantId,
    requestedAt: new Date().toISOString(),
    countriesPlanned: 0,
  };

  try {
    await persist(record);
  } catch (err) {
    // No store → no pollable scan; don't pretend one is running.
    console.warn("[deep-scan] could not persist scan record:", err instanceof Error ? err.message : String(err));
    return null;
  }

  // Fire-and-forget — the sweep must never block or fail the caller.
  void runDeepScan(record, subject).catch(async (err: unknown) => {
    console.error("[deep-scan] sweep failed:", err instanceof Error ? err.message : String(err));
    record.status = "failed";
    record.error = err instanceof Error ? err.message : String(err);
    record.completedAt = new Date().toISOString();
    await persist(record).catch(() => undefined);
  });

  return scanId;
}
