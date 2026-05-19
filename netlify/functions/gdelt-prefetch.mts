// Hawkeye Sterling — GDELT pre-warming scheduled function.
//
// Runs every 6 hours and pre-fetches GDELT adverse-media articles for a
// configured list of active watchlist subjects, storing results in the
// `gdelt-cache` Netlify Blobs store under keys `gdelt:{subjectName}`.
//
// The /api/adverse-media route reads from Blobs first and skips the live
// GDELT call entirely — eliminating the 8 000+ ms synchronous latency that
// previously blocked every user-facing screening request.
//
// HOW TO POPULATE SUBJECTS:
//   Replace the empty SUBJECTS array below with the names of entities in
//   your active watchlist. You can generate this list dynamically by
//   querying your database, or hardcode it for a fixed set of subjects.
//
// Schedule: every 6 hours ("0 */6 * * *").

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "gdelt-cache";
const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 25_000;
const GDELT_MAX_RECORDS = 250;
const ART19_LOOKBACK_YEARS = 10;

// TODO: populate with active watchlist subjects from your database.
// Example: const SUBJECTS = ["John Smith", "Acme Corp Ltd", "Jane Doe"];
const SUBJECTS: string[] = [];

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
        const res = await fetch(`${GDELT_BASE}?${params}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
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

  if (SUBJECTS.length === 0) {
    console.info("[gdelt-prefetch] SUBJECTS list is empty — nothing to pre-warm. Populate the SUBJECTS array in netlify/functions/gdelt-prefetch.mts.");
    return new Response(JSON.stringify({ ok: true, refreshed: 0, skipped: "SUBJECTS list empty", durationMs: Date.now() - startedAt }), {
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

  for (const subject of SUBJECTS) {
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
      errors.push(`subject ${refreshed + errors.length + 1}: ${msg}`);
      console.warn(`[gdelt-prefetch] failed for subject (redacted): ${msg}`);
    }
  }

  console.info(`[gdelt-prefetch] done — refreshed ${refreshed}/${SUBJECTS.length} subjects in ${Date.now() - startedAt}ms`);

  return new Response(
    JSON.stringify({ ok: errors.length === 0, refreshed, total: SUBJECTS.length, errors, durationMs: Date.now() - startedAt }),
    { headers: { "content-type": "application/json" } },
  );
}

export const config: Config = {
  schedule: "0 */6 * * *",
};
