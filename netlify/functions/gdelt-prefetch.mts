// Hawkeye Sterling — GDELT pre-warming scheduled function.
//
// Runs every 6 hours. Pulls active subjects from MoonDB (status=active,
// sorted by risk_score DESC) and pre-fetches GDELT adverse-media articles
// for each one, storing results in the `gdelt-cache` Netlify Blobs store
// under keys `gdelt:{subjectName}`.
//
// The /api/adverse-media route reads from Blobs first and skips the live
// GDELT call entirely — eliminating the 8 000+ ms synchronous latency.
//
// Schedule: every 6 hours ("0 */6 * * *").

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { ProxyAgent, type Dispatcher } from "undici";
import { writeHeartbeat } from "../lib/heartbeat.js";

const STORE_NAME = "gdelt-cache";
const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

// Optional outbound proxy for GDELT egress — mirrors web/lib/server/http-dispatcher.
// GDELT 403s datacenter IPs; routing through NEWS_HTTP_PROXY lets this scheduled
// prefetch actually warm the cache from a Netlify runtime. Inlined (not imported
// from web/lib) because this function is bundled separately. Per-call dispatcher
// only — never setGlobalDispatcher (would also proxy Blobs/MoonDB).
const NEWS_PROXY_URI =
  process.env["NEWS_HTTP_PROXY"]?.trim() ||
  process.env["HTTPS_PROXY"]?.trim() ||
  process.env["HTTP_PROXY"]?.trim() ||
  "";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
let _newsDispatcher: Dispatcher | undefined;
let _newsDispatcherResolved = false;
function newsDispatcher(): Dispatcher | undefined {
  if (_newsDispatcherResolved) return _newsDispatcher;
  _newsDispatcherResolved = true;
  if (NEWS_PROXY_URI) {
    try {
      _newsDispatcher = new ProxyAgent({ uri: NEWS_PROXY_URI });
    } catch (err) {
      console.warn("[gdelt-prefetch] failed to build proxy agent, using direct egress:", err);
    }
  }
  return _newsDispatcher;
}
function gdeltFetch(url: string, init: RequestInit): Promise<Response> {
  const dispatcher = newsDispatcher();
  const merged = {
    ...init,
    headers: { "user-agent": BROWSER_UA, ...(init.headers as Record<string, string> | undefined) },
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit;
  return fetch(url, merged);
}
const FETCH_TIMEOUT_MS = 25_000;
const GDELT_MAX_RECORDS = 250;
const ART19_LOOKBACK_YEARS = 10;

// Max subjects to pre-fetch per run (highest risk_score first).
// Keeps the scheduled run well within the Lambda time ceiling.
const MAX_SUBJECTS = 100;
// Process this many subjects in parallel per batch.
const BATCH_SIZE = 20;

// ── MoonDB subject loader ────────────────────────────────────────────────────

async function fetchActiveSubjects(): Promise<string[]> {
  const projectId = process.env["MOONDB_PROJECT_ID"];
  const adminKey  = process.env["MOONDB_ADMIN_KEY"];
  if (!projectId || !adminKey) {
    console.error(
      "[gdelt-prefetch] MOONDB_PROJECT_ID or MOONDB_ADMIN_KEY not set — " +
      "GDELT cache will remain empty, adverse-media calls will incur live GDELT latency. " +
      "Set both env vars in Netlify to enable per-subject pre-warming.",
    );
    return [];
  }

  const base = `https://moondb.ai/p/${projectId}/api/subjects`;
  const headers = { "X-Admin-Key": adminKey, "Content-Type": "application/json" };
  const names = new Set<string>();
  let offset = 0;
  const limit = 500;

  try {
    while (names.size < MAX_SUBJECTS) {
      const params = new URLSearchParams({
        status: "eq.active",
        sort:   "risk_score:desc",
        select: "name",
        limit:  String(limit),
        offset: String(offset),
      });
      const res = await fetch(`${base}?${params}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(`[gdelt-prefetch] MoonDB subjects query failed: HTTP ${res.status}`);
        break;
      }
      const json = await res.json() as { data?: { name: string }[]; meta?: { has_more: boolean } };
      for (const row of json.data ?? []) {
        if (row.name) names.add(row.name);
        if (names.size >= MAX_SUBJECTS) break;
      }
      if (!json.meta?.has_more) break;
      offset += limit;
    }
  } catch (err) {
    console.warn("[gdelt-prefetch] MoonDB fetch error:", err instanceof Error ? err.message : String(err));
  }

  return Array.from(names);
}

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  tone?: number;
  relevance?: number;
  language?: string;
  riskCategories?: string[];
  sourceScore?: number;
  queryLabel?: string;
}

function gdeltDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

const RISK_QUERIES = [
  { label: "sanctions", keywords: ["sanction*", "OFAC", "SDN", "designat*", "blacklist*", "asset freeze"], categories: ["sanctions"] },
  { label: "financial_crime", keywords: ["money launder*", "AML", "fraud", "terrorist financing", "embezzl*"], categories: ["money_laundering", "fraud"] },
  { label: "criminal", keywords: ["arrest*", "indict*", "convict*", "criminal investigation", "warrant"], categories: ["law_enforcement"] },
  { label: "corruption", keywords: ["corrupt*", "brib*", "kickback*", "misappropriat*"], categories: ["corruption"] },
  { label: "regulatory", keywords: ["enforcement action", "fine*", "penalt*", "license revok*", "cease and desist"], categories: ["regulatory"] },
  { label: "adverse_media", keywords: ["investigative report*", "ICIJ", "OCCRP", "Panama Papers", "Pandora Papers", "shell compan*"], categories: ["adverse_media"] },
];

function sourceScore(domain?: string): number {
  if (!domain) return 0.4;
  const HIGH = new Set(["reuters.com", "ft.com", "bloomberg.com", "wsj.com", "theguardian.com", "bbc.com", "bbc.co.uk", "nytimes.com", "apnews.com", "aljazeera.com", "occrp.org", "icij.org"]);
  const d = domain.toLowerCase().replace(/^www\./, "");
  return HIGH.has(d) ? 1.0 : 0.5;
}

async function fetchGdeltForSubject(subjectName: string): Promise<GdeltArticle[]> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - ART19_LOOKBACK_YEARS);

  const results = await Promise.allSettled(
    RISK_QUERIES.map(async (q) => {
      const kw = q.keywords.join(" OR ");
      const params = new URLSearchParams({
        query: `"${subjectName}" AND (${kw})`,
        mode: "artlist",
        maxrecords: String(GDELT_MAX_RECORDS),
        format: "json",
        sort: "DateDesc",
        startdatetime: gdeltDateTime(start),
        enddatetime: gdeltDateTime(end),
      });
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await gdeltFetch(`${GDELT_BASE}?${params}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
        clearTimeout(t);
        if (!res.ok) return [] as GdeltArticle[];
        const data = (await res.json()) as { articles?: GdeltArticle[] };
        return (data.articles ?? [])
          .filter((a) => a.url && a.title)
          .map((a) => ({
            ...a,
            riskCategories: q.categories,
            sourceScore: sourceScore(a.domain),
            queryLabel: q.label,
          }));
      } catch {
        clearTimeout(t);
        return [] as GdeltArticle[];
      }
    }),
  );

  const byUrl = new Map<string, GdeltArticle>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const a of r.value) {
      const key = (a.url ?? "").toLowerCase();
      if (!key) continue;
      const existing = byUrl.get(key);
      if (existing) {
        existing.riskCategories = Array.from(new Set([...(existing.riskCategories ?? []), ...(a.riskCategories ?? [])]));
        if ((a.sourceScore ?? 0) > (existing.sourceScore ?? 0)) existing.sourceScore = a.sourceScore;
      } else {
        byUrl.set(key, { ...a });
      }
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => (b.sourceScore ?? 0.5) - (a.sourceScore ?? 0.5)).slice(0, 250);
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();

  const subjects = await fetchActiveSubjects();

  if (subjects.length === 0) {
    console.info("[gdelt-prefetch] no active subjects found — nothing to pre-warm.");
    return new Response(JSON.stringify({ ok: true, refreshed: 0, skipped: "no active subjects", durationMs: Date.now() - startedAt }), {
      headers: { "content-type": "application/json" },
    });
  }

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  let refreshed = 0;
  const errors: string[] = [];

  // Process in parallel batches to stay within Lambda time ceiling.
  for (let i = 0; i < subjects.length; i += BATCH_SIZE) {
    const batch = subjects.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (subject) => {
        try {
          const articles = await fetchGdeltForSubject(subject);
          await store.setJSON(`gdelt:${subject}`, {
            articles,
            cachedAt: new Date().toISOString(),
            articleCount: articles.length,
          });
          refreshed++;
          console.info(`[gdelt-prefetch] cached ${articles.length} articles for subject (redacted)`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`subject ${i}: ${msg}`);
          console.warn(`[gdelt-prefetch] failed for subject (redacted): ${msg}`);
        }
      }),
    );
  }

  console.info(`[gdelt-prefetch] done — refreshed ${refreshed}/${subjects.length} subjects in ${Date.now() - startedAt}ms`);

  if (errors.length === 0) await writeHeartbeat("gdelt-prefetch");

  return new Response(
    JSON.stringify({ ok: errors.length === 0, refreshed, total: subjects.length, errors, durationMs: Date.now() - startedAt }),
    { headers: { "content-type": "application/json" } },
  );
}

export const config: Config = {
  // Every 2h — aligns cache freshness with the adverse-media-rss 30min cadence
  // while keeping GDELT API costs manageable (12 runs/day vs 48).
  schedule: "0 */2 * * *",
};
