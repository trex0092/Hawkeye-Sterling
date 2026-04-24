// Hawkeye Sterling — UAE Regulatory Live Feed
// Pulls the latest regulatory notices from three primary UAE sources:
//   1. Ministry of Economy (MoET) — moet.gov.ae
//   2. UAE Import-Export Compliance (UAE IEC) — uaeiec.gov.ae
//   3. Central Bank of the UAE (CBUAE) — centralbank.ae
//   4. Google News RSS — targeted queries for UAE AML/CFT regulatory news
//
// Each source is attempted independently; failures are silently dropped
// so a single unavailable government portal never blocks the feed.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RegulatoryItem {
  id: string;
  title: string;
  url: string;
  pubDate: string;     // ISO-8601 or free-form date string
  source: string;      // "MoET" | "UAE IEC" | "CBUAE" | "UAEFIU" | "FATF" | "Google News"
  category: string;    // "AML/CFT" | "Sanctions" | "PDPL" | "Trade" | "AI Governance" ...
  tone: "green" | "amber" | "red";  // green = informational, amber = guidance update, red = enforcement/alert
  snippet?: string;
}

interface FeedResult {
  ok: true;
  items: RegulatoryItem[];
  sources: string[];
  fetchedAt: string;
  errors: string[];
}

const FETCH_TIMEOUT_MS = 5_000;

function mkAbort(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&[^;]{1,8};/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Google News RSS — targeted UAE regulatory queries
// ─────────────────────────────────────────────────────────────────────────────

interface GNewsQuery {
  q: string;
  source: string;
  category: string;
  tone: RegulatoryItem["tone"];
}

const GNEWS_QUERIES: GNewsQuery[] = [
  { q: '"Ministry of Economy" UAE AML CFT circular regulation 2025 2026', source: "MoET", category: "AML/CFT", tone: "amber" },
  { q: '"Central Bank UAE" OR "CBUAE" AML CFT directive circular guidance 2025 2026', source: "CBUAE", category: "AML/CFT", tone: "amber" },
  { q: '"UAE FIU" OR "goAML" UAE financial intelligence unit 2025 2026', source: "UAEFIU", category: "AML/CFT", tone: "amber" },
  { q: 'UAE import export compliance regulation circular 2025 2026', source: "UAE IEC", category: "Trade", tone: "green" },
  { q: 'FATF UAE mutual evaluation AML money laundering 2025 2026', source: "FATF", category: "AML/CFT", tone: "red" },
  { q: 'UAE VARA virtual assets crypto regulation 2025 2026', source: "VARA", category: "VASPs", tone: "amber" },
  { q: 'UAE Cabinet decision AML sanctions 2025 2026', source: "UAE Cabinet", category: "Sanctions", tone: "red" },
  { q: 'PDPL UAE data protection law regulation 2025 2026', source: "UAE PDPL", category: "PDPL", tone: "amber" },
  { q: 'UAE Ministry Economy DPMS gold precious metals 2025 2026', source: "MoET / DPMS", category: "DPMS", tone: "amber" },
  { q: 'UAE AI artificial intelligence regulation governance 2025 2026', source: "UAE Digital", category: "AI Governance", tone: "green" },
];

function parseGNewsRss(xml: string, meta: GNewsQuery): RegulatoryItem[] {
  const items = xml.split(/<item>/i).slice(1);
  const out: RegulatoryItem[] = [];
  for (const raw of items.slice(0, 5)) {
    const body = raw.split(/<\/item>/i)[0] ?? "";
    const pick = (tag: string): string => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      const val = m?.[1];
      if (!val) return "";
      return stripHtml(val.trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""));
    };
    const title = pick("title");
    const link = sanitizeUrl(pick("link"));
    const pubDate = pick("pubDate");
    const description = pick("description");
    if (!title) continue;
    out.push({
      id: `gnews-${meta.source.replace(/\s/g, "_")}-${Buffer.from(title).toString("base64").slice(0, 12)}`,
      title,
      url: link || `https://news.google.com/search?q=${encodeURIComponent(meta.q)}`,
      pubDate,
      source: meta.source,
      category: meta.category,
      tone: meta.tone,
      snippet: description.slice(0, 200) || undefined,
    });
  }
  return out;
}

async function fetchGNews(query: GNewsQuery): Promise<RegulatoryItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query.q)}&hl=en&gl=AE&ceid=AE:en`;
  const { signal, clear } = mkAbort(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; regulatory-monitor)", accept: "application/rss+xml,*/*" },
      signal,
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseGNewsRss(xml, query);
  } catch {
    return [];
  } finally {
    clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct site scrapers — MoET, UAE IEC, CBUAE
// Each scraper fetches the news/media page and extracts article links + titles.
// Pattern matching is intentionally broad so minor HTML changes don't break it.
// ─────────────────────────────────────────────────────────────────────────────

interface SiteScrapeConfig {
  name: string;
  url: string;
  baseUrl: string;
  category: string;
  tone: RegulatoryItem["tone"];
  // CSS-class or tag hints (we use regex, not a DOM parser)
  linkPattern: RegExp;
  titlePattern?: RegExp;
  datePattern?: RegExp;
}

const SITE_CONFIGS: SiteScrapeConfig[] = [
  {
    name: "MoET",
    url: "https://www.moet.gov.ae/en/media-center/news",
    baseUrl: "https://www.moet.gov.ae",
    category: "AML/CFT",
    tone: "amber",
    linkPattern: /href="([^"]*\/media-center\/news[^"]+)"[^>]*>([^<]{15,200})</gi,
  },
  {
    name: "UAE IEC",
    url: "https://www.uaeiec.gov.ae/en-us/media/news",
    baseUrl: "https://www.uaeiec.gov.ae",
    category: "Trade",
    tone: "green",
    linkPattern: /href="([^"]*\/media\/news[^"]*)"[^>]*>([^<]{15,200})</gi,
  },
  {
    name: "CBUAE",
    url: "https://www.centralbank.ae/en/news",
    baseUrl: "https://www.centralbank.ae",
    category: "AML/CFT",
    tone: "amber",
    linkPattern: /href="([^"]*\/en\/news\/[^"]+)"[^>]*>([^<]{15,200})</gi,
  },
  {
    name: "UAEFIU",
    url: "https://www.uaefiu.gov.ae/en/news",
    baseUrl: "https://www.uaefiu.gov.ae",
    category: "AML/CFT",
    tone: "red",
    linkPattern: /href="([^"]*\/en\/news[^"]*)"[^>]*>([^<]{15,200})</gi,
  },
];

async function scrapeSite(cfg: SiteScrapeConfig): Promise<RegulatoryItem[]> {
  const { signal, clear } = mkAbort(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(cfg.url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; regulatory-monitor)",
        accept: "text/html,application/xhtml+xml,*/*",
        "accept-language": "en-US,en;q=0.9",
      },
      signal,
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const items: RegulatoryItem[] = [];
    const seen = new Set<string>();

    // Extract <a href="...">title</a> pairs matching the linkPattern
    const matches = [...html.matchAll(cfg.linkPattern)];
    for (const m of matches.slice(0, 8)) {
      const rawHref = m[1] ?? "";
      const rawTitle = stripHtml(m[2] ?? "").trim();
      if (!rawTitle || rawTitle.length < 12) continue;
      const href = rawHref.startsWith("http") ? rawHref : `${cfg.baseUrl}${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;
      const cleanUrl = sanitizeUrl(href);
      if (!cleanUrl || seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);

      items.push({
        id: `scrape-${cfg.name}-${Buffer.from(cleanUrl).toString("base64").slice(0, 12)}`,
        title: rawTitle.slice(0, 200),
        url: cleanUrl,
        pubDate: "",
        source: cfg.name,
        category: cfg.category,
        tone: cfg.tone,
      });
    }

    // Fallback: generic <a href> targeting article/news-item class names
    if (items.length === 0) {
      const genericRe = /class="[^"]*(?:news|article|media|press)[^"]*"[^>]*>[\s\S]{0,300}?href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi;
      for (const m of [...html.matchAll(genericRe)].slice(0, 8)) {
        const rawHref = m[1] ?? "";
        const rawTitle = stripHtml(m[2] ?? "").trim();
        if (!rawTitle || rawTitle.length < 12) continue;
        const href = rawHref.startsWith("http") ? rawHref : `${cfg.baseUrl}${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;
        const cleanUrl = sanitizeUrl(href);
        if (!cleanUrl || seen.has(cleanUrl)) continue;
        seen.add(cleanUrl);
        items.push({
          id: `scrape-${cfg.name}-fb-${Buffer.from(cleanUrl).toString("base64").slice(0, 12)}`,
          title: rawTitle.slice(0, 200),
          url: cleanUrl,
          pubDate: "",
          source: cfg.name,
          category: cfg.category,
          tone: cfg.tone,
        });
      }
    }

    return items;
  } catch {
    return [];
  } finally {
    clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Static curated items — always present so the feed is never empty.
// These represent the always-active regulatory basis for UAE AML compliance.
// ─────────────────────────────────────────────────────────────────────────────

const STATIC_ITEMS: RegulatoryItem[] = [
  {
    id: "static-fdl-10-2025",
    title: "Federal Decree-Law No. 10/2025 — Anti-Money Laundering & Combating Terrorism Financing",
    url: "https://www.moet.gov.ae/en/legislation/laws/federal-decree-law-no-10-of-2025",
    pubDate: "2025-01-01",
    source: "MoET",
    category: "AML/CFT",
    tone: "amber",
    snippet: "Primary AML/CFT legislation. Mandates EWRA, CDD, STR filing, 10-year retention, MLRO appointment. Replaces FDL 20/2018 provisions.",
  },
  {
    id: "static-cr-134-2025",
    title: "Cabinet Resolution No. 134/2025 — AML/CFT Executive Regulations",
    url: "https://www.moet.gov.ae/en/legislation",
    pubDate: "2025-01-01",
    source: "UAE Cabinet",
    category: "AML/CFT",
    tone: "amber",
    snippet: "Implementing regulations: four-eyes STR approval, CO notification thresholds, annual EWRA submission, board reporting cadence.",
  },
  {
    id: "static-cd-74-2020",
    title: "Cabinet Decision No. 74/2020 — Targeted Financial Sanctions & Counter-Terrorism",
    url: "https://www.moet.gov.ae/en/legislation",
    pubDate: "2020-10-01",
    source: "UAE Cabinet",
    category: "Sanctions",
    tone: "red",
    snippet: "TFS implementation framework. Establishes EOCN screening, asset freeze within 24h, goAML reporting obligations.",
  },
  {
    id: "static-pdpl-45-2021",
    title: "Federal Decree-Law No. 45/2021 — Personal Data Protection Law (PDPL)",
    url: "https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-personal-data-in-uae",
    pubDate: "2021-09-27",
    source: "UAE PDPL",
    category: "PDPL",
    tone: "amber",
    snippet: "Data protection obligations for AML-regulated entities. Retention, consent, cross-border transfer, breach notification within 72 hours.",
  },
  {
    id: "static-moe-dpms-55k",
    title: "MoET Circular — DPMS Threshold AED 55,000 & Mandatory KYC",
    url: "https://www.moet.gov.ae/en/legislation",
    pubDate: "2024-01-01",
    source: "MoET",
    category: "DPMS",
    tone: "amber",
    snippet: "All dealers in precious metals and stones must conduct CDD for single transactions or related series above AED 55,000.",
  },
  {
    id: "static-vara-2023",
    title: "VARA Virtual Assets Regulation — UAE Federal AML Framework for VASPs",
    url: "https://www.vara.ae/en/legal-framework/regulations/",
    pubDate: "2023-02-07",
    source: "VARA",
    category: "VASPs",
    tone: "amber",
    snippet: "Licensing, Travel Rule, KYC, STR obligations for UAE Virtual Asset Service Providers. FATF R.15 implementation.",
  },
  {
    id: "static-cbuae-aml-2021",
    title: "CBUAE — AML/CFT Standards for Licensed Financial Institutions (2021)",
    url: "https://www.centralbank.ae/en/aml",
    pubDate: "2021-04-01",
    source: "CBUAE",
    category: "AML/CFT",
    tone: "amber",
    snippet: "Binding standards for banks and exchange houses: transaction monitoring, correspondent banking, sanctions screening architecture.",
  },
  {
    id: "static-fatf-uae-2024",
    title: "FATF — UAE Mutual Evaluation Report 2024 Key Follow-Up Findings",
    url: "https://www.fatf-gafi.org/content/dam/fatf-gafi/mer/MER-UAE-2024.pdf.coredownload.pdf",
    pubDate: "2024-01-01",
    source: "FATF",
    category: "AML/CFT",
    tone: "red",
    snippet: "FATF identified key areas for improvement: beneficial ownership, DNFBP supervision, TFS effectiveness. UAE action plan progress tracked.",
  },
  {
    id: "static-uaeiec-customs",
    title: "UAE IEC — Import/Export AML Red Flag Advisory for Trade Compliance Officers",
    url: "https://www.uaeiec.gov.ae/en-us",
    pubDate: "2025-01-01",
    source: "UAE IEC",
    category: "Trade",
    tone: "green",
    snippet: "TBML indicators for customs compliance: misclassification, mis-invoicing, phantom shipments, third-country routing.",
  },
  {
    id: "static-oecd-ddg",
    title: "OECD Due Diligence Guidance — Responsible Supply Chains from Conflict-Affected Areas",
    url: "https://www.oecd.org/daf/inv/mne/mining.htm",
    pubDate: "2023-01-01",
    source: "OECD",
    category: "DPMS",
    tone: "green",
    snippet: "Five-step OECD DDG framework for LBMA-registered refiners. CAHRA definition, Annex II due diligence obligations.",
  },
  {
    id: "static-lbma-rgg",
    title: "LBMA Responsible Gold Guidance — UAE Refinery Compliance Standard",
    url: "https://www.lbma.org.uk/rules-and-standards/responsible-sourcing",
    pubDate: "2023-01-01",
    source: "LBMA",
    category: "DPMS",
    tone: "green",
    snippet: "LBMA RGG five-step audit requirement for all LBMA-listed gold refiners including UAE-based entities.",
  },
  {
    id: "static-egmont-goaml",
    title: "Egmont Group / UAEFIU — goAML 2.0 Reporting Platform Update",
    url: "https://www.uaefiu.gov.ae",
    pubDate: "2024-06-01",
    source: "UAEFIU",
    category: "AML/CFT",
    tone: "amber",
    snippet: "goAML 2.0 mandatory for all reporting entities. Enhanced XML schema, new STR/SAR/FFR/PNMR filing requirements.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: Request): Promise<NextResponse> {
  const errors: string[] = [];
  const sourcesHit = new Set<string>();

  // Fan out: direct site scrapes + Google News RSS queries in parallel
  const [siteResults, gnewsResults] = await Promise.all([
    Promise.allSettled(SITE_CONFIGS.map((cfg) => scrapeSite(cfg))),
    Promise.allSettled(GNEWS_QUERIES.map((q) => fetchGNews(q))),
  ]);

  const live: RegulatoryItem[] = [];

  for (let i = 0; i < SITE_CONFIGS.length; i++) {
    const r = siteResults[i];
    if (!r) continue;
    if (r.status === "fulfilled" && r.value.length > 0) {
      live.push(...r.value);
      sourcesHit.add(SITE_CONFIGS[i]!.name);
    } else if (r.status === "rejected") {
      errors.push(`${SITE_CONFIGS[i]!.name}: fetch failed`);
    }
  }

  for (let i = 0; i < GNEWS_QUERIES.length; i++) {
    const r = gnewsResults[i];
    if (!r) continue;
    if (r.status === "fulfilled" && r.value.length > 0) {
      live.push(...r.value);
      sourcesHit.add(GNEWS_QUERIES[i]!.source);
    }
  }

  // Deduplicate by URL (direct scrapes and Google News may overlap)
  const seen = new Set<string>();
  const deduped = live.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // Merge: live items first (sorted by pubDate desc), then static items not
  // already covered by a live item with the same title or URL.
  const staticFiltered = STATIC_ITEMS.filter(
    (s) => !seen.has(s.url) && !deduped.some((d) => d.title.toLowerCase() === s.title.toLowerCase()),
  );

  const allItems: RegulatoryItem[] = [
    ...deduped.slice(0, 40),
    ...staticFiltered,
  ];

  // Tone-sort: red → amber → green, preserve order within same tone
  const toneRank = { red: 2, amber: 1, green: 0 };
  allItems.sort((a, b) => (toneRank[b.tone] ?? 0) - (toneRank[a.tone] ?? 0));

  const payload: FeedResult = {
    ok: true,
    items: allItems.slice(0, 60),
    sources: Array.from(sourcesHit),
    fetchedAt: new Date().toISOString(),
    errors,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
