// Builds the AdverseMediaSummary surfaced on /api/quick-screen responses.
//
// quick-screen already fetches news + LLM adverse-media articles for its
// reasoning layer; this module turns that same article set into the
// AdverseMediaSummary contract the UI renders (SubjectDetailPanel
// "Worldwide Intel Feed"), reusing the relevance scorer that
// /api/screening/run applies to its Lane C output. Pure function — no I/O.

import { createHash } from "node:crypto";
import {
  scoreAndFilterArticles,
  aggregateMediaSeverity,
  type ScoredArticle,
} from "./adverse-media-scorer";
import {
  classifyAdverseKeywords,
  type AdverseKeywordGroup,
} from "@/lib/data/adverse-keywords";
import type {
  AdverseMediaItem,
  AdverseMediaSummary,
} from "@/lib/api/quickScreen.types";

// Structural subset of newsAdapters' NewsArticle — keeps this module free of
// a hard dependency on the intelligence layer.
export interface AdverseMediaInputArticle {
  title: string;
  url?: string;
  publishedAt?: string;
  source?: string; // provider id ("newsapi", "claude", ...)
  outlet?: string; // publisher domain — preferred for display
  snippet?: string;
  language?: string;
}

// Keyword-group → FATF reference, the keyword-classifier analogue of
// FATF_MAP in multi-source-screener.ts. Groups without a defensible direct
// FATF mapping are omitted rather than guessed.
const GROUP_FATF_MAP: Partial<Record<AdverseKeywordGroup, string>> = {
  "money-laundering": "FATF R.3 (ML offence)",
  "terrorism-financing": "FATF R.5 (TF offence)",
  "proliferation-wmd": "FATF R.7 (PF sanctions)",
  "sanctions-circumvention": "FATF R.6 (targeted financial sanctions)",
  "bribery-corruption": "FATF R.10 (CDD / corruption)",
  "political-exposure": "FATF R.12 (PEPs)",
  "charity-npo-abuse": "FATF R.8 (NPO abuse)",
  "crypto-asset-crime": "FATF R.15 (virtual assets)",
  "fraud-forgery": "FATF R.3 (predicate offences)",
  "tax-crime": "FATF R.3 (predicate offences)",
  "organised-crime": "FATF R.3 (predicate offences)",
  "human-trafficking": "FATF R.3 (predicate offences)",
  "extortion-kidnapping": "FATF R.3 (predicate offences)",
  "counterfeiting": "FATF R.3 (predicate offences)",
  "illicit-trade": "FATF R.3 (predicate offences)",
  "environmental-crime": "FATF R.3 (predicate offences)",
};

// Worldwide-coverage caps (env-overridable). Raised from the historical
// 10/6 so the summary no longer hides findings; the deep-scan endpoint
// returns the uncapped set.
function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? Math.floor(n) : fallback;
}
const MAX_ITEMS = intEnv("HAWKEYE_ADVERSE_MEDIA_MAX_ITEMS", 50);
const MAX_CATEGORIES_PER_ITEM = 5;
const MAX_PROVIDERS_SHOWN = intEnv("HAWKEYE_ADVERSE_MEDIA_MAX_PROVIDERS", 20);

function articleId(a: ScoredArticle): string {
  return createHash("sha256")
    .update(a.url ?? a.title)
    .digest("hex")
    .slice(0, 16);
}

function providerLabel(providersUsed: string[], hasArticles: boolean): string {
  const unique = [...new Set(providersUsed.filter((p) => p.trim().length > 0))];
  if (unique.length === 0) return hasArticles ? "news-adapters" : "none";
  if (unique.length <= MAX_PROVIDERS_SHOWN) return unique.join(", ");
  return `${unique.slice(0, MAX_PROVIDERS_SHOWN).join(", ")} +${unique.length - MAX_PROVIDERS_SHOWN} more`;
}

/**
 * Build the quick-screen adverse-media summary from the articles the route
 * already fetched.
 *
 * Returns `null` when nothing was queried (no articles AND no providers
 * reported) — the response must omit the field rather than assert a
 * "checked, clear" negative finding for a check that never ran (FATF R.10).
 */
export function buildAdverseMediaSummary(
  subjectName: string,
  articles: AdverseMediaInputArticle[],
  providersUsed: string[],
): AdverseMediaSummary | null {
  if (articles.length === 0 && providersUsed.length === 0) return null;

  const scored = scoreAndFilterArticles(
    subjectName,
    articles.map((a) => ({
      title: a.title,
      ...(a.url !== undefined ? { url: a.url } : {}),
      // Publisher domain reads better in the feed than the provider id.
      ...(a.outlet ?? a.source ? { source: a.outlet ?? a.source } : {}),
      ...(a.publishedAt !== undefined ? { publishedAt: a.publishedAt } : {}),
      ...(a.snippet !== undefined ? { snippet: a.snippet } : {}),
    })),
  );

  // Language survives via a url/title lookup — the scorer's RawArticle shape
  // doesn't carry it through.
  const langByKey = new Map<string, string>();
  for (const a of articles) {
    if (a.language) langByKey.set(a.url ?? a.title, a.language);
  }

  const itemsAll = scored.map((s) => {
    const groups = [
      ...new Set(
        classifyAdverseKeywords(`${s.title} ${s.snippet ?? ""}`).map((h) => h.group),
      ),
    ].slice(0, MAX_CATEGORIES_PER_ITEM);
    const language = langByKey.get(s.url ?? s.title);
    const item: AdverseMediaItem = {
      id: articleId(s),
      title: s.title,
      url: s.url ?? "",
      source: s.source ?? "news",
      categories: groups,
      severity: s.severity,
      ...(s.publishedAt !== undefined ? { publishedAt: s.publishedAt } : {}),
      ...(language !== undefined ? { language } : {}),
    };
    return item;
  });

  const adverseItems = itemsAll.filter((i) => i.categories.length > 0);
  const adverseScored = scored.filter((_, idx) => (itemsAll[idx]?.categories.length ?? 0) > 0);

  const categories = [...new Set(adverseItems.flatMap((i) => i.categories))];
  const fatfPredicates = [
    ...new Set(
      categories
        .map((g) => GROUP_FATF_MAP[g as AdverseKeywordGroup])
        .filter((p): p is string => p !== undefined),
    ),
  ];

  return {
    found: adverseItems.length > 0,
    // Severity is aggregated over keyword-classified (adverse) articles only —
    // a relevant-but-benign article must not lift the badge above "none".
    severity: aggregateMediaSeverity(adverseScored),
    itemCount: itemsAll.length,
    adverseCount: adverseItems.length,
    items: itemsAll.slice(0, MAX_ITEMS),
    categories,
    provider: providerLabel(providersUsed, articles.length > 0),
    fatfPredicates,
  };
}
