import { NextResponse } from "next/server";
import {
  classifyAdverseKeywords,
  adverseKeywordGroupCounts,
} from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";
import {
  matchEnsemble,
  variantsOf,
} from "../../../../dist/src/brain/index.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free, no-key news crawl via Google News RSS.
// Optional upgrade path: set NEWSAPI_KEY for higher-quality coverage.

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
}

// Locales we poll Google News from. Adverse-media coverage for the same
// subject shows up in the local press of where events occur — English-only
// coverage misses 70%+ of regional reporting.
const LOCALES: Array<{ code: string; hl: string; gl: string; ceid: string }> = [
  { code: "en", hl: "en", gl: "US", ceid: "US:en" },
  { code: "es", hl: "es", gl: "ES", ceid: "ES:es" },
  { code: "fr", hl: "fr", gl: "FR", ceid: "FR:fr" },
  { code: "ru", hl: "ru", gl: "RU", ceid: "RU:ru" },
  { code: "zh", hl: "zh-Hans", gl: "CN", ceid: "CN:zh-Hans" },
  { code: "ar", hl: "ar", gl: "AE", ceid: "AE:ar" },
  { code: "pt", hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" },
];

// Multi-language adverse-media modifiers so each locale returns relevant
// adverse articles. Expanded from the English AML keyword floor.
const LOCALE_MODIFIERS: Record<string, string> = {
  en: "sanctions OR fraud OR corruption OR bribery OR arrest OR laundering OR trafficking OR terrorism",
  es: "sanciones OR fraude OR corrupción OR soborno OR arresto OR blanqueo OR narcotráfico OR terrorismo",
  fr: "sanctions OR fraude OR corruption OR pot-de-vin OR arrestation OR blanchiment OR trafic OR terrorisme",
  ru: "санкции OR мошенничество OR коррупция OR взятка OR арест OR отмывание OR терроризм",
  zh: "制裁 OR 欺诈 OR 腐败 OR 贿赂 OR 逮捕 OR 洗钱 OR 贩运 OR 恐怖主义",
  ar: "عقوبات OR احتيال OR فساد OR رشوة OR اعتقال OR غسل OR تهريب OR إرهاب",
  pt: "sanções OR fraude OR corrupção OR suborno OR prisão OR lavagem OR tráfico OR terrorismo",
};

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
}

function severityOrder(s: Article["severity"]): number {
  return { clear: 0, low: 1, medium: 2, high: 3, critical: 4 }[s];
}

function classifyArticleSeverity(
  hits: ReturnType<typeof classifyAdverseKeywords>,
): Article["severity"] {
  if (hits.length === 0) return "clear";
  // Critical groups → critical severity
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
  ]);
  const medium = new Set(["market-abuse", "tax-crime", "cybercrime"]);
  if (hits.some((h) => critical.has(h.group))) return "critical";
  if (hits.some((h) => high.has(h.group))) return "high";
  if (hits.some((h) => medium.has(h.group))) return "medium";
  return "low";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
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
    const link = pick("link");
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
    // soundex / double-metaphone / token-set). Keep the best score so we
    // can filter out false-positive "John Smith" hits that aren't about us.
    let fuzzyScore = 0;
    let fuzzyMethod = "—";
    let matchedVariant: string | undefined;
    for (const v of variants) {
      try {
        const m = matchEnsemble(v, title);
        if (m?.best && m.best.score > fuzzyScore) {
          fuzzyScore = m.best.score;
          fuzzyMethod = m.best.method;
          matchedVariant = v === subject ? undefined : v;
        }
      } catch {
        /* ignore per-variant errors */
      }
    }

    const article: Article = {
      title,
      link,
      pubDate,
      source,
      snippet,
      keywordGroups: Array.from(new Set(kwHits.map((h) => h.group))),
      esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
      severity: classifyArticleSeverity(kwHits),
      fuzzyScore: Math.round(fuzzyScore * 100),
      fuzzyMethod,
      lang,
    };
    if (matchedVariant) article.matchedVariant = matchedVariant;
    out.push(article);
  }
  return out;
}

// Per-locale RSS timeout. Netlify Functions cap at 10s total wall-clock; with
// 7 locales fanning out in parallel, any single stalled feed used to sink the
// whole function into a 502. A 4-second AbortSignal bounds each feed so the
// slowest locale is skipped rather than killing the response.
const FEED_TIMEOUT_MS = 4_000;

async function fetchLocaleFeed(
  q: string,
  locale: (typeof LOCALES)[number],
  variants: string[],
): Promise<Article[]> {
  const modifiers = LOCALE_MODIFIERS[locale.code] ?? LOCALE_MODIFIERS["en"] ?? "";
  const enriched = `"${q}" (${modifiers})`;
  const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(enriched)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
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
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, q, variants, locale.code);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { ok: false, error: "query `q` required" },
      { status: 400 },
    );
  }
  // Build a variant set (transliterated, phonetic, corp-suffix-stripped)
  // so foreign-script and alias mentions still match.
  const rawVariants: string[] = [q];
  try {
    const v = variantsOf(q);
    for (const x of v) if (x && x !== q) rawVariants.push(x);
  } catch {
    /* ignore */
  }
  const variants = Array.from(new Set(rawVariants)).slice(0, 8);

  try {
    // Fan out to 7 locales in parallel (EN, ES, FR, RU, ZH, AR, PT). Each
    // returns up to ~30 articles; we dedupe by URL and fuzzy-filter. Use
    // allSettled so one rejected fetch never rejects the whole batch —
    // combined with the per-feed AbortSignal this guarantees the function
    // always returns within ~5s.
    const settled = await Promise.allSettled(
      LOCALES.map((loc) => fetchLocaleFeed(q, loc, variants)),
    );
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
    const parsed = Array.from(merged.values())
      // Fuzzy gate: drop articles whose title doesn't resemble the subject.
      .filter((a) => a.fuzzyScore >= 55 || a.keywordGroups.length > 0)
      .sort((a, b) => b.fuzzyScore - a.fuzzyScore)
      .slice(0, 20);
    const topSeverity: Article["severity"] =
      parsed.reduce(
        (acc, a) => (severityOrder(a.severity) > severityOrder(acc) ? a.severity : acc),
        "clear" as Article["severity"],
      );
    const allKw = parsed.flatMap((a) =>
      a.keywordGroups.map((g) => ({ group: g, groupLabel: g, term: "", offset: 0 })),
    );
    const groupCounts = adverseKeywordGroupCounts(
      // @ts-expect-error — shape matches; we rebuild labels below
      allKw,
    );
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
      source: "google-news-rss",
      languages: langCoverage,
    };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "news fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
