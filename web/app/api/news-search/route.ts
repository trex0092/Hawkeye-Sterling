import { NextResponse } from "next/server";
import {
  classifyAdverseKeywords,
  adverseKeywordGroupCounts,
} from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";

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
}

interface NewsResponse {
  ok: true;
  subject: string;
  articleCount: number;
  topSeverity: Article["severity"];
  keywordGroupCounts: Array<{ group: string; label: string; count: number }>;
  esgDomains: string[];
  articles: Article[];
  source: "google-news-rss" | "newsapi";
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

function parseRss(xml: string): Article[] {
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
    out.push({
      title,
      link,
      pubDate,
      source,
      snippet,
      keywordGroups: Array.from(new Set(kwHits.map((h) => h.group))),
      esgCategories: Array.from(new Set(esgHits.map((e) => e.categoryId))),
      severity: classifyArticleSeverity(kwHits),
    });
  }
  return out;
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
  // Enrich query with classic AML modifiers so Google returns the right
  // adverse-media articles, not PR / marketing pages about the same name.
  const enriched = `"${q}" (sanctions OR fraud OR corruption OR bribery OR arrest OR investigation OR fined OR laundering OR trafficking OR terrorism OR cartel OR lawsuit)`;
  const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(
    enriched,
  )}&hl=en&gl=US&ceid=US:en`;

  try {
    const res = await fetch(feed, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; HawkeyeSterling/0.2; +https://hawkeye-sterling.netlify.app)",
        accept: "application/rss+xml,application/xml,text/xml,*/*;q=0.8",
      },
      // Cache briefly so burst screening of the same subject doesn't hammer the feed.
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `news feed returned ${res.status}` },
        { status: 502 },
      );
    }
    const xml = await res.text();
    const parsed = parseRss(xml).slice(0, 15);
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
