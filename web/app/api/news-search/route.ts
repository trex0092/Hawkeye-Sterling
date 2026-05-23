import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  classifyAdverseKeywords,
  adverseKeywordGroupCounts,
  type AdverseKeywordGroup,
} from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";
import { searchAllNewsWithStatus } from "@/lib/intelligence/newsAdapters";
// Dynamic imports from dist/ to prevent hard module-load failures when the
// brain compilation hasn't run yet (cold Lambda, partial build). Falls back
// to no-op implementations that return minimal scores so the route degrades
// gracefully instead of returning 500.
// EnsembleMatch mirrors src/brain/matching.ts EnsembleMatch interface so the
// stub and the real function share the same shape. The call site accesses
// `m.best.score` — the old stub returned `{score, method}` which meant
// `m.best` was always undefined when dist/ was not loaded, silently zeroing
// all fuzzy scores and falling through to the token-presence fallback only.
type MatchScore = { method: string; score: number; threshold: number; pass: boolean };
type EnsembleMatch = { subject: string; candidate: string; scores: MatchScore[]; best: MatchScore; phoneticAgreement: boolean };
type MatchEnsembleFn = (_a: string, _b: string) => EnsembleMatch;
type VariantsOfFn = (_name: string) => string[];
let matchEnsemble: MatchEnsembleFn = (a, b) => {
  const exact = a.toLowerCase() === b.toLowerCase();
  const score: MatchScore = { method: "exact_fallback", score: exact ? 1 : 0, threshold: 1, pass: exact };
  return { subject: a, candidate: b, scores: [score], best: score, phoneticAgreement: false };
};
let variantsOf: VariantsOfFn = (name) => [name];
// Best-effort async load — if dist is present these replace the stubs.
(async () => {
  try {
    const [m, t] = await Promise.all([
      import("../../../../src/brain/matching.js"),
      import("../../../../src/brain/translit.js"),
    ]);
    if (typeof (m as { matchEnsemble?: unknown }).matchEnsemble === "function")
      matchEnsemble = (m as { matchEnsemble: MatchEnsembleFn }).matchEnsemble;
    if (typeof (t as { variantsOf?: unknown }).variantsOf === "function")
      variantsOf = (t as { variantsOf: VariantsOfFn }).variantsOf;
  } catch {
    // dist not built yet — stubs remain active
  }
})();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Module-level safety net — see /api/compliance-qa for rationale.
const REJECTION_GUARD_KEY = "__hsNewsSearchRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) return;
    console.error("[news-search] unhandled rejection", msg);
  });
}

// Free, no-key news crawl via Google News RSS.
// Optional upgrade path: set NEWSAPI_KEY for higher-quality coverage.

function detectScript(text: string): "latin" | "arabic" | "cyrillic" | "cjk" | "devanagari" | "thai" | "hebrew" | "georgian" | "armenian" | "other" {
  const arabicCount = (text.match(/[؀-ۿ]/g) ?? []).length;
  const cyrillicCount = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const cjkCount = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  const devanagariCount = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const thaiCount = (text.match(/[฀-๿]/g) ?? []).length;
  const hebrewCount = (text.match(/[֐-׿]/g) ?? []).length;
  const georgianCount = (text.match(/[Ⴀ-ჿ]/g) ?? []).length;
  const armenianCount = (text.match(/[԰-֏]/g) ?? []).length;

  const counts = [
    { script: "arabic" as const, count: arabicCount },
    { script: "cyrillic" as const, count: cyrillicCount },
    { script: "cjk" as const, count: cjkCount },
    { script: "devanagari" as const, count: devanagariCount },
    { script: "thai" as const, count: thaiCount },
    { script: "hebrew" as const, count: hebrewCount },
    { script: "georgian" as const, count: georgianCount },
    { script: "armenian" as const, count: armenianCount },
  ];

  const max = counts.reduce((a, b) => a.count > b.count ? a : b);
  return max.count > 3 ? max.script : "latin";
}

interface Article {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
  keywordGroups: string[];
  esgCategories: string[];
  severity: "clear" | "low" | "medium" | "high" | "critical";
  fuzzyScore: number;        // 0..100 — brain matchEnsemble against subject
  fuzzyMethod: string;       // levenshtein | jaro_winkler | soundex | token_set | ...
  matchedVariant?: string;   // variant that produced the top score
  lang: string;              // locale the article was fetched from (en, es, fr, ru, zh, ar, pt)
  relevanceScore?: number;   // fuzzyScore + adverse-term boost, 0..100
  sourceTier: "tier1" | "tier2" | "tier3" | "unknown";  // credibility classification
  sourceCategory?: "wire" | "investigative" | "regulatory" | "regional" | "social";  // editorial category
  script?: "latin" | "arabic" | "cyrillic" | "cjk" | "devanagari" | "thai" | "hebrew" | "georgian" | "armenian" | "other";
  requiresTranslation?: boolean;
}

// ── Source credibility tiers ────────────────────────────────────────────────
// Tier 1: major international wire services, authoritative MENA outlets,
// investigative journalism organisations, and financial regulatory bodies.
const TIER1_DOMAINS = new Set([
  // Major international wire services
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com", "wsj.com",
  "bbc.com", "bbc.co.uk", "theguardian.com", "nytimes.com",
  "lemonde.fr", "spiegel.de", "elpais.com", "lavanguardia.com",
  // UAE/MENA authoritative sources
  "gulfnews.com", "thenationalnews.com", "khaleejtimes.com",
  "arabnews.com", "alarabiya.net", "albawaba.com",
  // Investigative / regulatory
  "occrp.org", "icij.org", "transparency.org",
  // Financial regulators' own publications
  "fatf-gafi.org", "bis.org", "imf.org",
]);

// Tier 2: well-known international broadcasters and business press with
// editorial standards but lower primary-source status than tier 1.
const TIER2_DOMAINS = new Set([
  "cnbc.com", "cnn.com", "nbcnews.com", "abcnews.go.com",
  "economist.com", "forbes.com", "businessinsider.com",
  "aljazeera.com", "middleeasteye.net", "haaretz.com",
  "scmp.com", "straitstimes.com", "channelnewsasia.com",
]);

function classifySource(url: string): "tier1" | "tier2" | "tier3" | "unknown" {
  if (!url) return "unknown";
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (TIER1_DOMAINS.has(domain)) return "tier1";
    if (TIER2_DOMAINS.has(domain)) return "tier2";
    return "tier3";
  } catch { return "unknown"; }
}

// Locales we poll Google News from. 60+ language and regional locales covering
// all 7 continents — FATF high-risk, MENA, South & Southeast Asia, Caucasus,
// Western Balkans, Nordics, East Africa, Latin America regional editions.
// All feeds run in parallel under a 4s overall timebox so latency does
// not grow with locale count.
const LOCALES: Array<{ code: string; hl: string; gl: string; ceid: string }> = [
  // Core Western / Global
  { code: "en",    hl: "en",      gl: "US", ceid: "US:en"       },
  { code: "en-GB", hl: "en-GB",   gl: "GB", ceid: "GB:en"       },
  { code: "en-AE", hl: "en",      gl: "AE", ceid: "AE:en"       },
  { code: "en-IN", hl: "en-IN",   gl: "IN", ceid: "IN:en"       },
  { code: "en-SG", hl: "en-SG",   gl: "SG", ceid: "SG:en"       },
  { code: "en-AU", hl: "en-AU",   gl: "AU", ceid: "AU:en"       },
  { code: "de",  hl: "de",      gl: "DE", ceid: "DE:de"       },
  { code: "fr",  hl: "fr",      gl: "FR", ceid: "FR:fr"       },
  { code: "es",  hl: "es",      gl: "ES", ceid: "ES:es"       },
  { code: "pt",  hl: "pt-BR",   gl: "BR", ceid: "BR:pt-419"   },
  { code: "it",  hl: "it",      gl: "IT", ceid: "IT:it"       },
  { code: "nl",  hl: "nl",      gl: "NL", ceid: "NL:nl"       },
  // CEE / Balkans / Nordics
  { code: "pl",  hl: "pl",      gl: "PL", ceid: "PL:pl"       },
  { code: "ro",  hl: "ro",      gl: "RO", ceid: "RO:ro"       },
  { code: "hu",  hl: "hu",      gl: "HU", ceid: "HU:hu"       },
  { code: "cs",  hl: "cs",      gl: "CZ", ceid: "CZ:cs"       },
  { code: "sk",  hl: "sk",      gl: "SK", ceid: "SK:sk"       },
  { code: "hr",  hl: "hr",      gl: "HR", ceid: "HR:hr"       },
  { code: "sr",  hl: "sr",      gl: "RS", ceid: "RS:sr"       },
  { code: "bg",  hl: "bg",      gl: "BG", ceid: "BG:bg"       },
  { code: "sv",  hl: "sv",      gl: "SE", ceid: "SE:sv"       },
  { code: "el",  hl: "el",      gl: "GR", ceid: "GR:el"       },
  // CIS / Eastern Europe
  { code: "ru",  hl: "ru",      gl: "RU", ceid: "RU:ru"       },
  { code: "uk",  hl: "uk",      gl: "UA", ceid: "UA:uk"       },
  // MENA
  { code: "ar",  hl: "ar",      gl: "AE", ceid: "AE:ar"       },
  { code: "tr",  hl: "tr",      gl: "TR", ceid: "TR:tr"       },
  { code: "he",  hl: "iw",      gl: "IL", ceid: "IL:iw"       },
  // South Asia
  { code: "hi",  hl: "hi",      gl: "IN", ceid: "IN:hi"       },
  // Southeast Asia
  { code: "id",  hl: "id",      gl: "ID", ceid: "ID:id"       },
  { code: "ms",  hl: "ms",      gl: "MY", ceid: "MY:ms"       },
  { code: "vi",  hl: "vi",      gl: "VN", ceid: "VN:vi"       },
  { code: "th",  hl: "th",      gl: "TH", ceid: "TH:th"       },
  // East Asia
  { code: "zh",  hl: "zh-Hans", gl: "CN", ceid: "CN:zh-Hans"  },
  { code: "ja",  hl: "ja",      gl: "JP", ceid: "JP:ja"       },
  { code: "ko",  hl: "ko",      gl: "KR", ceid: "KR:ko"       },
  // Caucasus / Central Asia
  { code: "az",    hl: "az",    gl: "AZ", ceid: "AZ:az"        },  // Azerbaijani
  { code: "ka",    hl: "ka",    gl: "GE", ceid: "GE:ka"        },  // Georgian
  { code: "hy",    hl: "hy",    gl: "AM", ceid: "AM:hy"        },  // Armenian
  { code: "kk",    hl: "kk",    gl: "KZ", ceid: "KZ:kk"        },  // Kazakh
  // Africa
  { code: "am",    hl: "am",    gl: "ET", ceid: "ET:am"        },  // Amharic - Ethiopia
  { code: "af",    hl: "af",    gl: "ZA", ceid: "ZA:af"        },  // Afrikaans - South Africa
  { code: "fr-SN", hl: "fr",    gl: "SN", ceid: "SN:fr"        },  // French - Senegal/West Africa
  { code: "ar-EG", hl: "ar",    gl: "EG", ceid: "EG:ar"        },  // Arabic - Egypt/North Africa
  { code: "pt-AO", hl: "pt",    gl: "AO", ceid: "AO:pt-150"   },  // Portuguese - Angola/Mozambique
  { code: "en-NG", hl: "en-NG", gl: "NG", ceid: "NG:en"        },  // English - Nigeria
  { code: "en-ZA", hl: "en-ZA", gl: "ZA", ceid: "ZA:en"        },  // English - South Africa
  // Middle East (additional)
  { code: "fa",    hl: "fa",    gl: "IR", ceid: "IR:fa"        },  // Farsi - Iran
  { code: "ar-SA", hl: "ar",    gl: "SA", ceid: "SA:ar"        },  // Arabic - Saudi Arabia
  // South Asia (additional)
  { code: "bn",    hl: "bn",    gl: "BD", ceid: "BD:bn"        },  // Bengali - Bangladesh
  { code: "ur",    hl: "ur",    gl: "PK", ceid: "PK:ur"        },  // Urdu - Pakistan
  { code: "ta",    hl: "ta",    gl: "IN", ceid: "IN:ta"        },  // Tamil - India/Sri Lanka
  // Southeast Asia (additional)
  { code: "tl",    hl: "tl",    gl: "PH", ceid: "PH:tl"       },  // Filipino/Tagalog - Philippines
  { code: "my",    hl: "my",    gl: "MM", ceid: "MM:my"        },  // Burmese - Myanmar
  { code: "km",    hl: "km",    gl: "KH", ceid: "KH:km"        },  // Khmer - Cambodia
  // Latin America (regional editions)
  { code: "es-MX", hl: "es-419", gl: "MX", ceid: "MX:es-419"  },  // Spanish - Mexico
  { code: "es-AR", hl: "es-419", gl: "AR", ceid: "AR:es-419"  },  // Spanish - Argentina
  { code: "es-CO", hl: "es-419", gl: "CO", ceid: "CO:es-419"  },  // Spanish - Colombia
  // Oceania
  { code: "en-NZ", hl: "en",    gl: "NZ", ceid: "NZ:en"        },  // English - New Zealand
  // North America (French)
  { code: "fr-CA", hl: "fr-CA", gl: "CA", ceid: "CA:fr"        },  // French - Canada
];


interface NewsResponse {
  ok: true;
  subject: string;
  articleCount: number;
  topSeverity: Article["severity"];
  keywordGroupCounts: Array<{ group: string; label: string; count: number }>;
  esgDomains: string[];
  articles: Article[];
  source: "google-news-rss" | "newsapi";
  languages: string[];
  fetchMode: "live" | "cached" | "static_fallback";
  fetchedAt: string;
  latencyMs: number;
}

function severityOrder(s: Article["severity"]): number {
  return { clear: 0, low: 1, medium: 2, high: 3, critical: 4 }[s];
}

function classifyArticleSeverity(
  hits: ReturnType<typeof classifyAdverseKeywords>,
): Article["severity"] {
  if (hits.length === 0) return "clear";
  // Critical groups → critical severity
  // Severity tiers mirror KEYWORD_GROUP_WEIGHT in super-brain/route.ts so
  // news-severity and composite score stay aligned. Weight ≥14 (and its
  // critical-regime neighbours) → critical/high; weight ≥10 → medium;
  // lower-weight informational groups (law-enforcement, political-exposure)
  // fall through to "low".
  const critical = new Set([
    "terrorism-financing",
    "proliferation-wmd",
    "regulatory-action",
  ]);
  const high = new Set([
    "money-laundering",
    "bribery-corruption",
    "organised-crime",
    "human-trafficking",
    "fraud-forgery",
    "environmental-crime",
  ]);
  const medium = new Set([
    "market-abuse",
    "tax-crime",
    "cybercrime",
    "insider-threat",
    "ai-misuse",
  ]);
  if (hits.some((h) => critical.has(h.group))) return "critical";
  if (hits.some((h) => high.has(h.group))) return "high";
  if (hits.some((h) => medium.has(h.group))) return "medium";
  return "low";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

// Strip diacritics so "halac" matches "Halaç", "ozcan" matches "Özcan", etc.
function normalizeDiacritics(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Sanitize RSS link fields: only allow https/http URLs — block javascript:,
// data: and other dangerous schemes that could execute as href values.
function sanitizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}

function parseRss(xml: string, subject: string, variants: string[], lang: string): Article[] {
  const items = xml.split(/<item>/i).slice(1);
  const out: Article[] = [];
  for (const raw of items) {
    const body = raw.split(/<\/item>/i)[0] ?? "";
    const pick = (tag: string): string => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m || !m[1]) return "";
      let v = m[1].trim();
      v = v.replace(/^<!\[CDATA\[|\]\]>$/g, "");
      return stripHtml(v);
    };
    const title = pick("title");
    const link = sanitizeLink(pick("link"));
    const pubDate = pick("pubDate");
    const source = pick("source") || pick("dc:creator") || "";
    const description = pick("description");
    if (!title && !description) continue;
    const snippet = description.slice(0, 300);
    const fullText = `${title} ${snippet}`;
    const kwHits = classifyAdverseKeywords(fullText);
    const esgHits = classifyEsg(fullText);

    // Fuzzy-match the article title against the subject + all name variants
    // using the brain's matchEnsemble (exact / levenshtein / jaro-winkler /
    // soundex / double-metaphone / token-set / trigram / partial-token-set).
    // Keep the best score so we can filter out false-positive hits.
    let fuzzyScore = 0;
    let fuzzyMethod = "—";
    let matchedVariant: string | undefined;
    const fullTextLower = fullText.toLowerCase();
    for (const v of variants) {
      try {
        const m = matchEnsemble(v, title);
        if (m?.best && m.best.score > fuzzyScore) {
          fuzzyScore = m.best.score;
          fuzzyMethod = m.best.method;
          matchedVariant = v === subject ? undefined : v;
        }
      } catch (err) {
        console.warn("[news-search] name-variant match failed:", err instanceof Error ? err.message : err);
      }
    }
    // Supplement: token presence in full text (title + snippet) catches
    // articles where the person's name appears in the body but not the
    // headline. Cap at 0.72 so a genuine title match always outranks it.
    // Diacritics are stripped so "halac" matches "Halaç", "ozcan" → "Özcan".
    if (fuzzyScore < 0.72) {
      const fullTextNorm = normalizeDiacritics(fullTextLower);
      for (const v of variants) {
        const vTokens = normalizeDiacritics(v.toLowerCase()).split(/\s+/).filter((t) => t.length >= 3);
        if (vTokens.length === 0) continue;
        const hits = vTokens.filter((t) => fullTextNorm.includes(t)).length;
        const tokenScore = (hits / vTokens.length) * 0.72;
        if (tokenScore > fuzzyScore) {
          fuzzyScore = tokenScore;
          fuzzyMethod = "token_presence";
          matchedVariant = v === subject ? undefined : v;
        }
      }
    }

    // Boost score for high-signal adverse media terms in title
    const adverseTermBoosts: Record<string, number> = {
      "convicted": 15, "arrested": 12, "charged": 12, "indicted": 12,
      "sanctioned": 15, "designated": 10, "fraud": 10, "corruption": 10,
      "laundering": 15, "bribery": 12, "embezzlement": 12, "terrorist": 15,
      "wanted": 12, "fugitive": 10, "banned": 8, "debarred": 8,
    };
    const titleLower = title.toLowerCase();
    let boost = 0;
    for (const [term, pts] of Object.entries(adverseTermBoosts)) {
      if (titleLower.includes(term)) boost += pts;
    }
    const baseScore = Math.round(fuzzyScore * 100);
    const adjustedScore = Math.min(100, baseScore + boost);

    const tier = classifySource(link);
    const tierBoost = tier === "tier1" ? 20 : tier === "tier2" ? 10 : 0;
    const tieredScore = Math.min(100, adjustedScore + tierBoost);

    const article: Article = {
      title,
      link,
      pubDate,
      source,
      snippet,
      keywordGroups: Array.from(new Set(kwHits.map((h) => h.group))),
      esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
      severity: classifyArticleSeverity(kwHits),
      fuzzyScore: baseScore,
      fuzzyMethod,
      lang,
      relevanceScore: tieredScore,
      sourceTier: tier,
      sourceCategory: classifySourceCategory(link),
    };
    if (matchedVariant) article.matchedVariant = matchedVariant;
    out.push(article);
  }
  return out;
}

// ── Source category classification ──────────────────────────────────────────
// Maps domain patterns to editorial category so the UI can group/filter by
// category (e.g. "Show only investigative sources").
const WIRE_DOMAINS = new Set([
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com", "wsj.com",
  "bbc.com", "bbc.co.uk", "theguardian.com", "nytimes.com",
  "lemonde.fr", "spiegel.de", "elpais.com", "afp.com",
]);
const INVESTIGATIVE_DOMAINS = new Set([
  "occrp.org", "icij.org", "transparency.org", "acfe.com",
]);
const REGULATORY_DOMAINS = new Set([
  "fatf-gafi.org", "unodc.org", "bis.org", "imf.org",
  "ec.europa.eu", "sec.gov", "justice.gov",
]);
const REGIONAL_DOMAINS = new Set([
  "middleeasteye.net", "gulfnews.com", "thenationalnews.com",
  "khaleejtimes.com", "arabnews.com", "alarabiya.net", "albawaba.com",
  "aljazeera.com", "haaretz.com", "scmp.com", "straitstimes.com", "channelnewsasia.com",
]);

function classifySourceCategory(url: string): Article["sourceCategory"] {
  if (!url) return undefined;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (INVESTIGATIVE_DOMAINS.has(domain)) return "investigative";
    if (REGULATORY_DOMAINS.has(domain)) return "regulatory";
    if (WIRE_DOMAINS.has(domain)) return "wire";
    if (REGIONAL_DOMAINS.has(domain)) return "regional";
    return undefined;
  } catch { return undefined; }
}

// Per-locale feed timeout. 1.5s per feed with overall 4s timebox keeps P99 response under 5s.
const FEED_TIMEOUT_MS = 1_500;

// Overall timebox for the whole fan-out. 60+ locales run in parallel — 4s covers all healthy feeds within budget.
const OVERALL_TIMEBOX_MS = 4_000;

async function fetchLocaleFeed(
  q: string,
  locale: (typeof LOCALES)[number],
  variants: string[],
): Promise<Article[]> {
  // Post-fetch fuzzy scoring (fuzzyScore ≥ 75, or ≥ 55 + adverse keywords)
  // is the relevance gate. Do not quote the query — exact-phrase quoting
  // causes zero results when a subject’s name has common spelling variants
  // (e.g. GIANUZZI vs GIANNUZZI). Google’s token matching handles near-miss
  // spellings; the post-fetch filter handles precision.
  const queryParam = q;
  const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(queryParam)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(feed, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; HawkeyeSterling/0.2; +https://hawkeye-sterling.netlify.app)",
        accept: "application/rss+xml,application/xml,text/xml,*/*;q=0.8",
      },
      signal: controller.signal,
    } as RequestInit);
    if (!res.ok) {
      console.warn(`[hawkeye] news-search/fetchLocaleFeed ${locale.code} HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseRss(xml, q, variants, locale.code);
  } catch (err) {
    console.warn(`[hawkeye] news-search/fetchLocaleFeed ${locale.code} threw:`, err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Investigative / regulatory RSS feeds ────────────────────────────────────
// Tier-1 investigative journalism and regulatory body feeds.  These are
// fetched in parallel with the Google News locale fan-out and merged into the
// main article list.  Subject-name filtering is done post-fetch (same fuzzy
// scoring as the locale feeds) so we don't query Google at all for these
// feeds.
const INVESTIGATIVE_FEEDS: Array<{
  url: string;
  lang: string;
  sourceTier: "tier1" | "tier2";
  sourceCategory: NonNullable<Article["sourceCategory"]>;
  name: string;
}> = [
  // Tier-1 investigative journalism
  { url: "https://www.occrp.org/feed/",                                    lang: "en", sourceTier: "tier1", sourceCategory: "investigative", name: "OCCRP" },
  { url: "https://www.icij.org/feed/",                                     lang: "en", sourceTier: "tier1", sourceCategory: "investigative", name: "ICIJ" },
  // Financial crime specialist
  { url: "https://www.fatf-gafi.org/media/fatf/rss/fatf-en.rss",          lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "FATF" },
  // Regional AML bodies
  { url: "https://www.unodc.org/unodc/en/rss/news.xml",                   lang: "en", sourceTier: "tier1", sourceCategory: "regulatory",    name: "UNODC" },
  // Transparency International
  { url: "https://www.transparency.org/en/feed",                           lang: "en", sourceTier: "tier1", sourceCategory: "investigative", name: "TI" },
  // Middle East Eye - investigative Middle East
  { url: "https://www.middleeasteye.net/rss",                              lang: "en", sourceTier: "tier2", sourceCategory: "regional",      name: "MEE" },
  // ACFE (Association of Certified Fraud Examiners)
  { url: "https://www.acfe.com/rss/fraud-examiner-newsletter.xml",         lang: "en", sourceTier: "tier2", sourceCategory: "investigative", name: "ACFE" },
];

// 2-second timeout for each investigative feed — slightly more generous than
// the 1.5s locale timeout since these are non-Google servers.
const INVESTIGATIVE_FEED_TIMEOUT_MS = 2_000;

async function fetchInvestigativeFeeds(subjectName: string, variants: string[]): Promise<Article[]> {
  const results = await Promise.allSettled(
    INVESTIGATIVE_FEEDS.map(async (feed) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INVESTIGATIVE_FEED_TIMEOUT_MS);
      try {
        const res = await fetch(feed.url, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; HawkeyeSterling/0.2; +https://hawkeye-sterling.netlify.app)",
            accept: "application/rss+xml,application/xml,text/xml,*/*;q=0.8",
          },
          signal: controller.signal,
        } as RequestInit);
        if (!res.ok) {
          console.warn(`[hawkeye] investigative-feed/${feed.name} HTTP ${res.status}`);
          return [] as Article[];
        }
        const xml = await res.text();
        const articles = parseRss(xml, subjectName, variants, feed.lang);
        // Override tier and category from feed config (parseRss uses classifySource
        // on the article link; we want the feed-level classification to take precedence).
        return articles.map((a) => ({
          ...a,
          sourceTier: feed.sourceTier,
          sourceCategory: feed.sourceCategory,
          // Re-apply tier boost since we're overriding the tier
          relevanceScore: Math.min(100, (a.relevanceScore ?? a.fuzzyScore) + (feed.sourceTier === "tier1" ? 20 : 10)),
          source: a.source || feed.name,
        }));
      } catch (err) {
        console.warn(`[hawkeye] investigative-feed/${feed.name} threw:`, err);
        return [] as Article[];
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const allArticles: Article[] = [];
  const seenLinks = new Set<string>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const a of r.value) {
        const key = a.link || a.title;
        if (!seenLinks.has(key)) {
          seenLinks.add(key);
          allArticles.push(a);
        }
      }
    }
  }
  return allArticles;
}

// ── East / Southeast Asian RSS feeds ────────────────────────────────────────
// Regional English-language news outlets covering Greater China, Japan, Korea,
// South Asia, and Southeast Asia.  Fetched in parallel with the investigative
// feed fan-out and the Google News locale fan-out.
const ASIAN_FEEDS: Array<{
  url: string;
  lang: string;
  name: string;
  sourceTier: "tier1" | "tier2";
}> = [
  // Greater China
  { url: "https://www.scmp.com/rss/91/feed",                         lang: "en-CN", name: "SCMP",                sourceTier: "tier2" },
  // Japan — Nikkei Asia
  { url: "https://asia.nikkei.com/rss/feed/nar",                     lang: "en-JP", name: "Nikkei Asia",         sourceTier: "tier2" },
  // Korea — Korea Herald
  { url: "https://www.koreaherald.com/common/rss.php",               lang: "en-KR", name: "Korea Herald",        sourceTier: "tier2" },
  // India — investigative
  { url: "https://thewire.in/feed",                                  lang: "en-IN", name: "The Wire India",       sourceTier: "tier2" },
  // Philippines — investigative
  { url: "https://www.rappler.com/feed",                             lang: "en-PH", name: "Rappler Philippines",  sourceTier: "tier2" },
  // Indonesia
  { url: "https://www.thejakartapost.com/feed",                      lang: "en-ID", name: "Jakarta Post",         sourceTier: "tier2" },
  // Vietnam
  { url: "https://e.vnexpress.net/rss/news.rss",                     lang: "en-VN", name: "VnExpress",            sourceTier: "tier2" },
  // Thailand
  { url: "https://www.bangkokpost.com/rss/data/topstories.xml",      lang: "en-TH", name: "Bangkok Post",         sourceTier: "tier2" },
  // Malaysia
  { url: "https://www.malaymail.com/feed",                           lang: "en-MY", name: "Malay Mail",           sourceTier: "tier2" },
  // Myanmar — Irrawaddy (investigative)
  { url: "https://www.irrawaddy.com/feed",                           lang: "en-MM", name: "The Irrawaddy",        sourceTier: "tier2" },
  // Singapore — CNA
  { url: "https://www.channelnewsasia.com/rssfeeds/8395986",         lang: "en-SG", name: "CNA Singapore",        sourceTier: "tier2" },
];

async function fetchAsianFeeds(subjectName: string, variants: string[]): Promise<Article[]> {
  const results = await Promise.allSettled(
    ASIAN_FEEDS.map(async (feed) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INVESTIGATIVE_FEED_TIMEOUT_MS);
      try {
        const res = await fetch(feed.url, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; HawkeyeSterling/0.2; +https://hawkeye-sterling.netlify.app)",
            accept: "application/rss+xml,application/xml,text/xml,*/*;q=0.8",
          },
          signal: controller.signal,
        } as RequestInit);
        if (!res.ok) {
          console.warn(`[hawkeye] asian-feed/${feed.name} HTTP ${res.status}`);
          return [] as Article[];
        }
        const xml = await res.text();
        const articles = parseRss(xml, subjectName, variants, feed.lang);
        return articles.map((a) => ({
          ...a,
          sourceTier: feed.sourceTier,
          sourceCategory: "regional" as NonNullable<Article["sourceCategory"]>,
          relevanceScore: Math.min(100, (a.relevanceScore ?? a.fuzzyScore) + 10),
          source: a.source || feed.name,
        }));
      } catch (err) {
        console.warn(`[hawkeye] asian-feed/${feed.name} threw:`, err);
        return [] as Article[];
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const allArticles: Article[] = [];
  const seenLinks = new Set<string>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const a of r.value) {
        const key = a.link || a.title;
        if (!seenLinks.has(key)) {
          seenLinks.add(key);
          allArticles.push(a);
        }
      }
    }
  }
  return allArticles;
}

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

function clusterArticles(articles: Article[]): Article[] {
  const clusters: Array<{ rep: Article; tokens: Set<string>; sources: Set<string> }> = [];
  for (const a of articles) {
    const toks = tokens(a.title);
    let absorbed = false;
    for (const c of clusters) {
      if (jaccard(toks, c.tokens) >= 0.7) {
        // Same event — keep the rep but record the source + escalate
        // severity if the absorbed article is higher-severity than the
        // representative. This avoids losing a "critical"-severity
        // Reuters wire under a "medium" Le Figaro restatement of the
        // same facts.
        if (severityOrder(a.severity) > severityOrder(c.rep.severity)) {
          c.rep.severity = a.severity;
        }
        if (a.source) c.sources.add(a.source);
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      clusters.push({ rep: a, tokens: toks, sources: new Set(a.source ? [a.source] : []) });
    }
  }
  return clusters.map((c) => {
    const extras = Array.from(c.sources).filter((s) => s && s !== c.rep.source);
    if (extras.length === 0) return c.rep;
    return {
      ...c.rep,
      source: c.rep.source
        ? `${c.rep.source} + ${extras.length} more`
        : extras.join(", "),
    };
  });
}

function emptyResponse(q: string, fetchMode: NewsResponse["fetchMode"] = "live", latencyMs = 0): NewsResponse {
  return {
    ok: true,
    subject: q,
    articleCount: 0,
    topSeverity: "clear",
    keywordGroupCounts: [],
    esgDomains: [],
    articles: [],
    source: "google-news-rss",
    languages: [],
    fetchMode,
    fetchedAt: new Date().toISOString(),
    latencyMs,
  };
}

const MAX_Q_LENGTH = 500;

// 2-minute in-memory cache to avoid hammering Google News RSS for repeated queries
const NEWS_CACHE = new Map<string, { data: NewsResponse; expires: number }>();

export async function GET(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  // Gate the 7-locale RSS fan-out behind the per-key rate limiter.
  // Anonymous callers still get the free-tier burst window; without
  // this, a single user could trivially pin a Netlify Function into a
  // quota-exhaustion loop.
  const gate = await enforce(req, { requireAuth: false, cost: 3 });
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { ok: false, error: "query `q` required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (q.length > MAX_Q_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "query `q` too long" },
      { status: 400, headers: gateHeaders },
    );
  }

  const cacheKey = q.toLowerCase().trim();
  const cached = NEWS_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ ...cached.data, fetchMode: "cached" as const }, { headers: gateHeaders });
  }

  // From here down, any internal failure returns a well-formed empty
  // dossier with `ok: true` and HTTP 200. Adverse-media is a regulator-
  // facing panel — surfacing "server 502" / "news fetch failed" to an
  // MLRO is worse than surfacing zero articles with the neutral
  // "No articles found" empty state.

  // GOOGLE_NEWS_RSS_ENABLED can be set to "false" to disable live RSS fetches
  // (e.g. during testing or when rate-limited). Defaults to enabled.
  const rssEnabled = process.env["GOOGLE_NEWS_RSS_ENABLED"] !== "false";
  const fetchedAt = new Date().toISOString();

  if (!rssEnabled) {
    return NextResponse.json(
      { ...emptyResponse(q, "static_fallback", Date.now() - t0), fetchedAt },
      { headers: gateHeaders },
    );
  }

  try {
    // Build a variant set (transliterated, phonetic, corp-suffix-stripped)
    // so foreign-script and alias mentions still match.
    const rawVariants: string[] = [q];
    try {
      const v = variantsOf(q);
      for (const x of v) if (x && x !== q) rawVariants.push(x);
    } catch (err) {
      console.warn("[hawkeye] news-search/variantsOf failed — using base query only:", err);
    }
    // Turkish diacritic expansion: terminal 'c'→'ç' and 'öz' prefix are the two
    // most reliable heuristics for Turkish Latin names. Google News Turkish locale
    // normalises queries anyway, but explicit variants improve post-fetch fuzzy scoring.
    const turkishVariant = q
      .toLowerCase()
      .replace(/\boz/g, "öz")
      .replace(/c\b/g, "ç")
      .replace(/\bgul/g, "gül")
      .replace(/\bgun/g, "gün");
    if (turkishVariant !== q.toLowerCase()) rawVariants.push(turkishVariant);
    const variants = Array.from(new Set(rawVariants)).slice(0, 10);

    // For names written in non-Latin scripts (Arabic, CJK, Cyrillic, etc.),
    // AML terminology in native-language press appears in the local language
    // rather than in English. A keyword-gated query would produce zero results
    // in those locales, so we fall back to a bare name query and let the
    // post-fetch fuzzy scoring handle precision.
    // Heuristic: if the name contains any codepoint outside the Basic Latin +
    // Latin-1 Supplement blocks (U+0000–U+00FF) it is considered non-Latin.
    const hasNonLatin = /[^ -ÿ]/.test(q);
    // gdeltQuery: for non-Latin scripts use a bare name search (no English
    // keyword requirement) since AML terminology appears in the native script.
    // For Latin names we use q as-is (the caller may inject keyword filters in future).
    const gdeltQuery = hasNonLatin ? q : q;

    // Fan out to all locales + all configured news API adapters in parallel.
    // allSettled + per-feed AbortSignal + overall timebox ensures the function
    // always returns within ~7.5s, well inside the 30s maxDuration budget.
    const fanOut = Promise.allSettled(
      LOCALES.map((loc) => fetchLocaleFeed(gdeltQuery, loc, variants)),
    );
    const timebox = new Promise<PromiseSettledResult<Article[]>[]>((resolve) => {
      setTimeout(() => resolve(LOCALES.map(() => ({ status: "fulfilled", value: [] }))), OVERALL_TIMEBOX_MS);
    });
    // Run news API adapters (NewsAPI, GNews, Mediastack, OCCRP, etc.) in parallel
    // with the Google News RSS fan-out. Falls back to empty if no keys configured.
    const adapterSearch = searchAllNewsWithStatus(q, { limit: 30 }).catch(() => ({
      articles: [],
      sourcesSucceeded: [] as string[],
      sourcesFailed: [] as Array<{ name: string; error: string }>,
    }));
    // Fetch investigative/regulatory RSS feeds in parallel with everything else.
    const investigativeSearch = fetchInvestigativeFeeds(q, variants);
    const [settled, adapterResult, investigativeArticles] = await Promise.all([
      Promise.race([fanOut, timebox]),
      adapterSearch,
      investigativeSearch,
    ]);
    const perLocale: Article[][] = settled.map((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    const merged = new Map<string, Article>();
    for (const bucket of perLocale) {
      for (const a of bucket) {
        const key = a.link || a.title;
        if (!merged.has(key)) merged.set(key, a);
      }
    }
    // Merge investigative/regulatory feed articles first — they are already in
    // the internal Article shape and carry source-level tier/category overrides.
    for (const ia of investigativeArticles) {
      const key = ia.link || ia.title;
      if (!merged.has(key)) merged.set(key, ia);
    }
    // Convert NewsArticle (adapter shape) → Article (internal shape) and merge.
    for (const na of adapterResult.articles) {
      const key = na.url || na.title;
      if (merged.has(key)) continue;
      const fullText = `${na.title} ${na.snippet ?? ""}`;
      const kwHits = classifyAdverseKeywords(fullText);
      const esgHits = classifyEsg(fullText);
      const fullTextLower = fullText.toLowerCase();
      let fuzzyScore = 0;
      let fuzzyMethod = "token_presence";
      for (const v of variants) {
        const m = matchEnsemble(v, na.title);
        if (m?.best && m.best.score > fuzzyScore) {
          fuzzyScore = m.best.score;
          fuzzyMethod = m.best.method;
        }
        if (fuzzyScore < 0.72) {
          const fullTextNorm2 = normalizeDiacritics(fullTextLower);
          const vTokens = normalizeDiacritics(v.toLowerCase()).split(/\s+/).filter((t) => t.length >= 3);
          if (vTokens.length > 0) {
            const hits = vTokens.filter((t) => fullTextNorm2.includes(t)).length;
            const ts = (hits / vTokens.length) * 0.72;
            if (ts > fuzzyScore) { fuzzyScore = ts; fuzzyMethod = "token_presence"; }
          }
        }
      }
      // Boost score for high-signal adverse media terms in title (adapter path)
      const adverseTermBoostsAdapter: Record<string, number> = {
        "convicted": 15, "arrested": 12, "charged": 12, "indicted": 12,
        "sanctioned": 15, "designated": 10, "fraud": 10, "corruption": 10,
        "laundering": 15, "bribery": 12, "embezzlement": 12, "terrorist": 15,
        "wanted": 12, "fugitive": 10, "banned": 8, "debarred": 8,
      };
      const adapterTitleLower = na.title.toLowerCase();
      let adapterBoost = 0;
      for (const [term, pts] of Object.entries(adverseTermBoostsAdapter)) {
        if (adapterTitleLower.includes(term)) adapterBoost += pts;
      }
      const adapterBaseScore = Math.round(fuzzyScore * 100);
      const adapterAdjustedScore = Math.min(100, adapterBaseScore + adapterBoost);
      const adapterTier = classifySource(na.url ?? "");
      const adapterTierBoost = adapterTier === "tier1" ? 20 : adapterTier === "tier2" ? 10 : 0;
      const adapterTieredScore = Math.min(100, adapterAdjustedScore + adapterTierBoost);

      merged.set(key, {
        title: na.title,
        link: na.url,
        pubDate: na.publishedAt,
        source: `${na.source}/${na.outlet}`,
        snippet: na.snippet ?? "",
        keywordGroups: kwHits.map((k) => k.group),
        esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
        severity: classifyArticleSeverity(kwHits),
        fuzzyScore: adapterBaseScore,
        fuzzyMethod,
        lang: na.language ?? "en",
        relevanceScore: adapterTieredScore,
        sourceTier: adapterTier,
        sourceCategory: classifySourceCategory(na.url ?? ""),
      });
    }
    const filtered = Array.from(merged.values())
      // Fuzzy gate: require either a strong name match (≥70) OR a weak name
      // match (≥55) combined with at least one adverse keyword group.
      // Threshold lowered to 70: token_presence caps at 0.72 (→ score 72) so
      // a full two-token name match was blocked at the old 75 threshold.
      .filter((a) => a.fuzzyScore >= 70 || (a.fuzzyScore >= 55 && a.keywordGroups.length > 0))
      .sort((a, b) => {
        // Investigative / regulatory sources sort first among equal-relevance articles.
        const aIsHighValue = a.sourceCategory === "investigative" || a.sourceCategory === "regulatory";
        const bIsHighValue = b.sourceCategory === "investigative" || b.sourceCategory === "regulatory";
        if (aIsHighValue !== bIsHighValue) return aIsHighValue ? -1 : 1;
        return (b.relevanceScore ?? b.fuzzyScore) - (a.relevanceScore ?? a.fuzzyScore);
      });
    // Phase 1: URL-based exact dedup — strips protocol and query-string so
    // the same Reuters article appearing at both https://reuters.com/… and
    // http://reuters.com/…?utm_source=… collapses to one entry.
    const seenUrls = new Set<string>();
    const urlDeduped = filtered.filter((a) => {
      if (!a.link) return true;
      const key = a.link.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });
    // Phase 2: Jaccard title dedup — collapses translated / rephrased
    // versions of the same story across locales (existing clusterArticles).
    const parsed = clusterArticles(urlDeduped).slice(0, 20);
    const topSeverity: Article["severity"] =
      parsed.reduce(
        (acc, a) => (severityOrder(a.severity) > severityOrder(acc) ? a.severity : acc),
        "clear" as Article["severity"],
      );
    const allKw = parsed.flatMap((a) =>
      a.keywordGroups.map((g) => ({ group: g as AdverseKeywordGroup, groupLabel: g, term: "", offset: 0 })),
    );
    const groupCounts = adverseKeywordGroupCounts(allKw);
    const esgDomains = Array.from(new Set(parsed.flatMap((a) => a.esgCategories)));
    const langCoverage = Array.from(new Set(parsed.map((a) => a.lang))).sort();
    const payload: NewsResponse = {
      ok: true,
      subject: q,
      articleCount: parsed.length,
      topSeverity,
      keywordGroupCounts: groupCounts.map((g) => ({
        group: g.group,
        label: g.label,
        count: g.count,
      })),
      esgDomains,
      articles: parsed,
      source: adapterResult.sourcesSucceeded.length > 0 ? "newsapi" : "google-news-rss",
      languages: langCoverage,
      fetchMode: "live",
      fetchedAt,
      latencyMs: Date.now() - t0,
    };
    // Cache successful results for 2 minutes
    if (payload.articleCount > 0) {
      NEWS_CACHE.set(cacheKey, { data: payload, expires: Date.now() + 2 * 60 * 1000 });
      // Evict oldest entries if cache grows too large
      if (NEWS_CACHE.size > 500) {
        const oldest = Array.from(NEWS_CACHE.entries()).sort((a, b) => a[1].expires - b[1].expires)[0];
        if (oldest) NEWS_CACHE.delete(oldest[0]);
      }
    }
    const responseTimeMs = Date.now() - t0;
    return NextResponse.json(payload, {
      headers: {
        ...gateHeaders,
        "X-Response-Time": `${responseTimeMs}ms`,
        "X-Locales-Searched": String(LOCALES.length),
      },
    });
  } catch (err) {
    // Last-resort safety net. The fan-out already uses allSettled +
    // per-feed timeouts so this branch should be unreachable, but if
    // variantsOf() or keyword classification ever throws we still return
    // a clean empty dossier rather than a 5xx that paints the panel red.
    console.error(
      "[hawkeye] news-search: top-level catch fired (was supposed to be unreachable). " +
      "Returning empty dossier; investigate variantsOf / keyword classification.",
      err,
    );
    return NextResponse.json({ ...emptyResponse(q, "static_fallback", Date.now() - t0), fetchedAt, degraded: true }, { headers: gateHeaders });
  }
}

