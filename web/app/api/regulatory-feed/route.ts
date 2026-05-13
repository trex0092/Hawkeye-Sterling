// Hawkeye Sterling — UAE Regulatory Live Feed
// Pulls the latest regulatory notices from primary UAE and international sources:
//   1. Ministry of Economy (MoET) — moet.gov.ae
//   2. UAE Import-Export Compliance (UAE IEC) — uaeiec.gov.ae
//   3. Central Bank of the UAE (CBUAE) — centralbank.ae
//   4. Google News RSS — targeted queries for UAE AML/CFT regulatory news
//   5. GDELT Project API — live AML/sanctions/DPMS news with tone scores
//   6. FATF Latest News RSS — fatf-gafi.org
//   7. OFAC Sanctions Actions XML — ofac.treasury.gov
//   8. UN Security Council Press Releases — un.org
//
// Each source is attempted independently; failures are silently dropped
// so a single unavailable government portal never blocks the feed.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Module-level safety net — see /api/compliance-qa for rationale.
const REJECTION_GUARD_KEY = "__hsRegulatoryFeedRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) return;
    console.error("[regulatory-feed] unhandled rejection", msg);
  });
}

export interface RegulatoryItem {
  id: string;
  title: string;
  url: string;
  pubDate: string;     // ISO-8601 or free-form date string
  publishedAt?: string; // alias for pubDate used by UI
  source: string;      // "MoET" | "UAE IEC" | "CBUAE" | "UAEFIU" | "FATF" | "Google News"
  category: string;    // "AML/CFT" | "Sanctions" | "PDPL" | "Trade" | "AI Governance" ...
  tone: "green" | "amber" | "red";  // green = informational, amber = guidance update, red = enforcement/alert
  summary?: string;    // alias for snippet used by UI
  snippet?: string;
}

interface FeedResult {
  ok: true;
  items: RegulatoryItem[];
  totalCount: number;
  sources: string[];
  fetchedAt: string;
  latencyMs: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 15-minute module-level cache
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  payload: FeedResult;
  ts: number; // Date.now() at write time
}

const _cache = globalThis as unknown as Record<string, CacheEntry | undefined>;
const CACHE_KEY = "__hsRegulatoryFeedCache";
const CACHE_TTL_MS = 30 * 60_000; // 30 minutes

const FETCH_TIMEOUT_MS = 5_000;
// GDELT free API p95 is routinely 10-14s. Cap at 8s here (vs 18s before) so
// the regulatory-feed route (maxDuration=30s) stays safely under budget when
// multiple GDELT queries run concurrently. GDELT failures degrade gracefully
// to the RSS/XML sources which have their own 5s timeout.
const GDELT_FETCH_TIMEOUT_MS = 8_000;

function mkAbort(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

function stripHtml(s: string): string {
  // Decode HTML entities to real characters first (handles entity-encoded HTML in RSS)
  const decoded = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // Strip all HTML tags (including freshly-decoded ones)
  return decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// RSS/XML helpers — no external XML library needed; extract fields with regex
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the text content of the first occurrence of <tag>...</tag> */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  const raw = m[1] ?? "";
  return stripHtml(raw.trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""));
}

/** Split XML into individual <item>...</item> blocks */
function splitItems(xml: string): string[] {
  return xml.split(/<item[\s>]/i).slice(1).map((chunk) => {
    const end = chunk.indexOf("</item>");
    return end >= 0 ? chunk.slice(0, end) : chunk;
  });
}

/** Classify tone based on keywords in title/description */
function classifyTone(text: string): RegulatoryItem["tone"] {
  const lower = text.toLowerCase();
  if (/grey\s*list|blacklist|sanctioned|violation|penalty|enforcement|criminal|freeze|convicted/.test(lower)) {
    return "red";
  }
  if (/updated|new guidance|circular|consultation|review|amended|guidance|revision|notice/.test(lower)) {
    return "amber";
  }
  return "green";
}

// ─────────────────────────────────────────────────────────────────────────────
// FATF Latest News RSS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFatfRss(): Promise<RegulatoryItem[]> {
  const url = "https://www.fatf-gafi.org/en/topics/fatf-latest-news.rss";
  const { signal, clear } = mkAbort(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; fatf-feed)",
        accept: "application/rss+xml, application/xml, */*",
      },
      signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = splitItems(xml);
    return items.slice(0, 8).map((block, i): RegulatoryItem | null => {
      const title = extractTag(block, "title");
      if (!title) return null;
      const link = sanitizeUrl(extractTag(block, "link"));
      const pubDate = extractTag(block, "pubDate");
      const description = extractTag(block, "description");
      const combined = `${title} ${description}`;
      return {
        id: `fatf-rss-${i}-${Buffer.from(title).toString("base64").slice(0, 10)}`,
        title: title.slice(0, 200),
        url: link || "https://www.fatf-gafi.org/en/topics/fatf-latest-news.html",
        pubDate,
        publishedAt: pubDate,
        source: "FATF",
        category: "AML/CFT",
        tone: classifyTone(combined),
        summary: description.slice(0, 300) || undefined,
        snippet: description.slice(0, 300) || undefined,
      };
    }).filter((x): x is RegulatoryItem => x !== null);
  } catch {
    return [];
  } finally {
    clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OFAC Sanctions Actions XML
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOfacXml(): Promise<RegulatoryItem[]> {
  const url = "https://ofac.treasury.gov/system/files/126/ofac_sanctions_actions.xml";
  const { signal, clear } = mkAbort(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; ofac-feed)",
        accept: "application/xml, */*",
      },
      signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = splitItems(xml);
    return items.slice(0, 8).map((block, i): RegulatoryItem | null => {
      const title = extractTag(block, "title");
      if (!title) return null;
      const link = sanitizeUrl(extractTag(block, "link"));
      const pubDate = extractTag(block, "pubDate") || extractTag(block, "date");
      const description = extractTag(block, "description");
      const combined = `${title} ${description}`;
      return {
        id: `ofac-${i}-${Buffer.from(title).toString("base64").slice(0, 10)}`,
        title: title.slice(0, 200),
        url: link || "https://ofac.treasury.gov/recent-actions",
        pubDate,
        publishedAt: pubDate,
        source: "OFAC",
        category: "Sanctions",
        tone: classifyTone(combined),
        summary: description.slice(0, 300) || undefined,
        snippet: description.slice(0, 300) || undefined,
      };
    }).filter((x): x is RegulatoryItem => x !== null);
  } catch {
    return [];
  } finally {
    clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UN Security Council press release feed
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUnScFeed(): Promise<RegulatoryItem[]> {
  const url = "https://www.un.org/press/en/feeds/all-press-releases";
  const { signal, clear } = mkAbort(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; un-feed)",
        accept: "application/rss+xml, application/xml, */*",
      },
      signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = splitItems(xml);
    // Filter to SC/sanctions-relevant items only
    const relevant = items.filter((block) => {
      const title = extractTag(block, "title").toLowerCase();
      const desc = extractTag(block, "description").toLowerCase();
      const combined = `${title} ${desc}`;
      return /sanction|terror|al-qaeda|isil|dprk|iran|freeze|designat|proliferat|money laundering|aml|financial crime/.test(combined);
    });
    return relevant.slice(0, 6).map((block, i): RegulatoryItem | null => {
      const title = extractTag(block, "title");
      if (!title) return null;
      const link = sanitizeUrl(extractTag(block, "link"));
      const pubDate = extractTag(block, "pubDate");
      const description = extractTag(block, "description");
      const combined = `${title} ${description}`;
      return {
        id: `unsc-${i}-${Buffer.from(title).toString("base64").slice(0, 10)}`,
        title: title.slice(0, 200),
        url: link || "https://www.un.org/press/en",
        pubDate,
        publishedAt: pubDate,
        source: "UN Security Council",
        category: "Sanctions",
        tone: classifyTone(combined),
        summary: description.slice(0, 300) || undefined,
        snippet: description.slice(0, 300) || undefined,
      };
    }).filter((x): x is RegulatoryItem => x !== null);
  } catch {
    return [];
  } finally {
    clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UAE-specific static items — always shown, not from a feed
// ─────────────────────────────────────────────────────────────────────────────

const UAE_STATIC: RegulatoryItem[] = [
  {
    id: "uae-001",
    title: "FDL 10/2025 — UAE AML/CFT Law in Force",
    url: "https://www.moet.gov.ae/en/legislation/laws/federal-decree-law-no-10-of-2025",
    pubDate: "2025-01-01",
    publishedAt: "2025-01-01",
    source: "UAE Cabinet",
    tone: "green",
    category: "legislation",
    summary: "Federal Decree-Law No. 10 of 2025 on AML/CFT entered into force, replacing FDL 20/2018. Key changes: DPMS obligations, 10-year retention, enhanced UBO requirements.",
    snippet: "Federal Decree-Law No. 10 of 2025 on AML/CFT entered into force, replacing FDL 20/2018. Key changes: DPMS obligations, 10-year retention, enhanced UBO requirements.",
  },
  {
    id: "uae-002",
    title: "MoE Circular 2/2024 — DPMS AED 55,000 Cash Reporting",
    url: "https://www.moet.gov.ae/en/legislation",
    pubDate: "2024-06-01",
    publishedAt: "2024-06-01",
    source: "UAE MoE",
    tone: "amber",
    category: "circular",
    summary: "Ministry of Economy mandates CTR filing for DPMS cash transactions ≥ AED 55,000. Effective immediately. Non-compliance: AED 100K–1M penalty.",
    snippet: "Ministry of Economy mandates CTR filing for DPMS cash transactions ≥ AED 55,000. Effective immediately. Non-compliance: AED 100K–1M penalty.",
  },
  {
    id: "uae-003",
    title: "CBUAE AML Standards — Updated §3.4 PEP Requirements",
    url: "https://www.centralbank.ae/en/aml",
    pubDate: "2025-02-01",
    publishedAt: "2025-02-01",
    source: "CBUAE",
    tone: "amber",
    category: "standards",
    summary: "Updated PEP EDD requirements including enhanced source of wealth verification and quarterly review for PEP-1 customers.",
    snippet: "Updated PEP EDD requirements including enhanced source of wealth verification and quarterly review for PEP-1 customers.",
  },
  {
    id: "uae-004",
    title: "LBMA RGG v9 — Step-4 Audit Requirements Updated",
    url: "https://www.lbma.org.uk/rules-and-standards/responsible-sourcing",
    pubDate: "2025-01-01",
    publishedAt: "2025-01-01",
    source: "LBMA",
    tone: "amber",
    category: "guidance",
    summary: "LBMA Responsible Gold Guidance v9 updates Step-4 independent audit requirements. New audit scope includes digital supply chain tracking.",
    snippet: "LBMA Responsible Gold Guidance v9 updates Step-4 independent audit requirements. New audit scope includes digital supply chain tracking.",
  },
  {
    id: "uae-005",
    title: "FATF Plenary — UAE Mutual Evaluation Follow-up",
    url: "https://www.fatf-gafi.org/en/topics/fatf-latest-news.html",
    pubDate: "2025-03-01",
    publishedAt: "2025-03-01",
    source: "FATF",
    tone: "green",
    category: "evaluation",
    summary: "FATF Plenary acknowledges UAE progress on follow-up actions from 2020 Mutual Evaluation Report. Enhanced follow-up status maintained.",
    snippet: "FATF Plenary acknowledges UAE progress on follow-up actions from 2020 Mutual Evaluation Report. Enhanced follow-up status maintained.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GDELT Project API — live news with sentiment tone scores
// Free, no API key. Tone < -5 → red, -5 to -2 → amber, else → green.
// ─────────────────────────────────────────────────────────────────────────────

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_QUERIES = [
  "FATF AML sanctions money laundering",
  "UAE Central Bank compliance financial crime",
  "gold silver DPMS precious metals fraud",
] as const;

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string; // "20250501T120000Z"
  domain?: string;
  tone?: number;    // sentiment: negative = bad news
  relevance?: number;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

function gdeltTone(tone: number): RegulatoryItem["tone"] {
  if (tone < -5) return "red";
  if (tone < -2) return "amber";
  return "green";
}

function gdeltDate(seendate: string | undefined): string {
  if (!seendate) return "";
  // Format: "20250501T120000Z" → "2025-05-01T12:00:00Z"
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return seendate;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

async function fetchGdelt(query: string): Promise<RegulatoryItem[]> {
  const url =
    `${GDELT_BASE}?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=10&format=json&timespan=7d`;
  const { signal, clear } = mkAbort(GDELT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; gdelt-feed)",
        accept: "application/json",
      },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as GdeltResponse;
    if (!Array.isArray(data.articles)) return [];
    return data.articles
      .filter((a) => a.url && a.title)
      .map((a) => {
        const tone = a.tone ?? 0;
        const pubDate = gdeltDate(a.seendate);
        const source = a.domain ?? "GDELT";
        return {
          id: `gdelt-${Buffer.from(a.url!).toString("base64").slice(0, 14)}`,
          title: a.title!.slice(0, 200),
          url: a.url!,
          pubDate,
          source,
          category: "AML/CFT",
          tone: gdeltTone(tone),
          snippet: undefined,
        } satisfies RegulatoryItem;
      });
  } catch {
    return [];
  } finally {
    clear();
  }
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
  // ── UAE Regulatory ────────────────────────────────────────────────────────
  { q: '"Ministry of Economy" UAE AML CFT circular regulation 2025', source: "MoET", category: "AML/CFT", tone: "amber" },
  { q: '"Central Bank UAE" OR "CBUAE" AML CFT directive circular 2025', source: "CBUAE", category: "AML/CFT", tone: "amber" },
  { q: '"UAE FIU" OR "goAML" UAE financial intelligence unit suspicious transaction', source: "UAEFIU", category: "AML/CFT", tone: "amber" },
  { q: 'FATF UAE money laundering financing terrorism 2025', source: "FATF", category: "AML/CFT", tone: "red" },
  { q: 'UAE VARA virtual assets crypto regulation enforcement 2025', source: "VARA", category: "VASPs", tone: "amber" },
  { q: 'UAE Cabinet decision AML sanctions enforcement', source: "UAE Cabinet", category: "Sanctions", tone: "red" },
  { q: 'UAE DPMS gold precious metals regulation compliance dealer', source: "MoET / DPMS", category: "DPMS", tone: "amber" },
  { q: 'EOCN UAE sanctions non-proliferation targeted financial asset freeze', source: "EOCN UAE", category: "Sanctions", tone: "red" },
  { q: 'UAE sanctions Russia Iran DPRK North Korea enforcement', source: "UAE Cabinet", category: "Sanctions", tone: "red" },
  { q: 'UAE financial crime enforcement arrest prosecution money laundering', source: "UAEFIU", category: "AML/CFT", tone: "red" },
  { q: 'FATF grey list black list mutual evaluation 2025', source: "FATF", category: "AML/CFT", tone: "red" },
  { q: 'LBMA "responsible gold" refinery audit good delivery 2025', source: "LBMA", category: "DPMS", tone: "green" },
  { q: 'OECD conflict minerals due diligence CAHRA cobalt tantalum', source: "OECD", category: "DPMS", tone: "green" },
  { q: 'RMI "Responsible Minerals Initiative" smelter audit 3TG 2025', source: "RMI", category: "DPMS", tone: "amber" },
  // ── Mining & Metals — Global ──────────────────────────────────────────────
  { q: 'gold mining illegal artisanal conflict minerals Africa 2025', source: "Mining", category: "Mining", tone: "red" },
  { q: 'gold price bullion market London fix spot price 2025', source: "Mining", category: "Mining", tone: "green" },
  { q: 'illegal gold mining money laundering smuggling criminal network', source: "Mining", category: "Mining", tone: "red" },
  { q: 'conflict minerals DRC Congo Sudan Mali gold tantalum mining', source: "Mining", category: "Mining", tone: "red" },
  { q: 'gold refinery UAE Dubai smuggling trafficking seizure arrest', source: "Mining", category: "DPMS", tone: "red" },
  { q: 'artisanal small scale gold mining ASGM mercury environment', source: "Mining", category: "Mining", tone: "amber" },
  { q: 'gold mining company ESG sanctions compliance supply chain', source: "Mining", category: "Mining", tone: "amber" },
  { q: 'precious metals diamond trade financial crime typology', source: "Mining", category: "DPMS", tone: "red" },
  { q: 'cobalt lithium mining Democratic Republic Congo supply chain risk', source: "Mining", category: "Mining", tone: "amber" },
  { q: 'gold silver platinum price manipulation market abuse 2025', source: "Mining", category: "Mining", tone: "red" },
  { q: 'mining company AML compliance due diligence 2025', source: "Mining", category: "Mining", tone: "amber" },
  { q: '"World Gold Council" gold demand report 2025', source: "Mining", category: "Mining", tone: "green" },
  { q: 'gold smuggling Africa Middle East UAE Dubai seizure customs', source: "Mining", category: "DPMS", tone: "red" },
  { q: 'critical minerals strategic resources sanctions supply disruption', source: "Mining", category: "Mining", tone: "amber" },
  { q: 'mining royalties corruption bribery Africa Latin America investigation', source: "Mining", category: "Mining", tone: "red" },
  { q: 'LBMA gold bar seized counterfeit fraudulent refinery hallmark', source: "LBMA", category: "DPMS", tone: "red" },
];

/** Extract the actual publisher from a Google News RSS item.
 *  Google News embeds the real publisher in <source url="...">Name</source>.
 *  Falling back to the URL domain prevents misattributing Reuters/Bloomberg
 *  articles to UAE regulatory agencies based solely on query keywords. */
function extractRssSource(body: string, articleUrl: string): string {
  // Try <source url="...">Publisher Name</source>
  const sourceTagMatch = body.match(/<source[^>]*>([^<]{2,120})<\/source>/i);
  if (sourceTagMatch?.[1]) {
    return stripHtml(sourceTagMatch[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""));
  }
  // Fall back to domain of the article URL
  try {
    const domain = new URL(articleUrl).hostname.replace(/^www\./, "");
    if (domain) return domain;
  } catch { /* malformed URL — leave empty */ }
  return "";
}

function parseGNewsRss(xml: string, meta: GNewsQuery): RegulatoryItem[] {
  const items = xml.split(/<item>/i).slice(1);
  const out: RegulatoryItem[] = [];
  for (const raw of items.slice(0, 8)) {
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
    // Use the real publisher from the RSS item, not the query's source label.
    // meta.source is a query-routing hint and must NOT be used as attribution.
    const actualSource = extractRssSource(body, link) || meta.source;
    out.push({
      id: `gnews-${meta.source.replace(/\s/g, "_")}-${Buffer.from(title).toString("base64").slice(0, 12)}`,
      title,
      url: link || `https://news.google.com/search?q=${encodeURIComponent(meta.q)}`,
      pubDate,
      source: actualSource,
      category: meta.category,
      tone: meta.tone,
      snippet: description.slice(0, 200) || undefined,
    });
  }
  return out;
}

async function fetchGNews(query: GNewsQuery): Promise<RegulatoryItem[]> {
  // tbs=qdr:m — rolling past-month window, always returns the latest results
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query.q)}&hl=en&gl=AE&ceid=AE:en&tbs=qdr:m`;
  const { signal, clear } = mkAbort(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; HawkeyeSterling/1.0; regulatory-monitor)", accept: "application/rss+xml,*/*" },
      signal,
      cache: "no-store",
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
      cache: "no-store",
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
  {
    id: "static-rmi-crb",
    title: "RMI — Responsible Minerals Initiative: Refiner Audit & RMAP Programme",
    url: "https://www.responsibleminerals.org/rmap",
    pubDate: "2024-01-01",
    source: "RMI",
    category: "DPMS",
    tone: "amber",
    snippet: "RMAP audit standard for 3TG and cobalt smelters/refiners. UAE-based entities sourcing from CAHRAs must align with RMI/OECD DDG requirements.",
  },
  {
    id: "static-eocn-tfs",
    title: "EOCN UAE — Executive Office for Control & Non-Proliferation: Targeted Financial Sanctions List",
    url: "https://www.eocn.gov.ae",
    pubDate: "2025-01-01",
    source: "EOCN UAE",
    category: "Sanctions",
    tone: "red",
    snippet: "UAE consolidated TFS list. All regulated entities must screen against EOCN list within 24h of update. Asset freeze and goAML filing mandatory on match.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  try {
    return await _handleGet(req);
  } catch (err) {
    console.error("[regulatory-feed] unhandled top-level error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "regulatory-feed temporarily unavailable — please retry.", degraded: true },
      { status: 503 },
    );
  }
}

async function _handleGet(req: Request): Promise<NextResponse> {
  const t0 = Date.now();
  // Operator-pressed refresh button passes ?force=1 to bypass the
  // 15-min module-level cache. Auto-refresh (timer) doesn't pass it,
  // so the cache still spares the upstream sites in steady state.
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const categoryFilter = url.searchParams.get("category")?.toLowerCase() ?? null;
  const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 20;
  const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const ARCHIVE_CUTOFF_MS = 36 * 30 * 24 * 60 * 60 * 1_000; // 36 months

  // Return cached payload if still fresh (15-minute TTL) — but only
  // when the caller didn't explicitly ask for a fresh fetch.
  const cached = _cache[CACHE_KEY];
  if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    let items = cached.payload.items;
    if (categoryFilter) items = items.filter((i) => i.category.toLowerCase().includes(categoryFilter));
    if (!includeArchived) {
      const cutoff = Date.now() - ARCHIVE_CUTOFF_MS;
      items = items.filter((i) => {
        const d = new Date(i.publishedAt ?? i.pubDate ?? "").getTime();
        return isNaN(d) || d >= cutoff;
      });
    }
    const totalCount = items.length;
    return NextResponse.json(
      { ...cached.payload, items: items.slice(offset, offset + limit), totalCount, latencyMs: Date.now() - t0 },
      { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800", "X-Cache": "HIT" } },
    );
  }

  const errors: string[] = [];
  const sourcesHit = new Set<string>();

  // Fan out: direct site scrapes + Google News RSS queries + GDELT + FATF RSS + OFAC + UN SC in parallel
  const [siteResults, gnewsResults, gdeltResults, fatfItems, ofacItems, unScItems] = await Promise.all([
    Promise.allSettled(SITE_CONFIGS.map((cfg) => scrapeSite(cfg))),
    Promise.allSettled(GNEWS_QUERIES.map((q) => fetchGNews(q))),
    Promise.allSettled(GDELT_QUERIES.map((q) => fetchGdelt(q))),
    fetchFatfRss(),
    fetchOfacXml(),
    fetchUnScFeed(),
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

  // GDELT results — collect, deduplicate later, sort by tone (most negative first)
  const gdeltItems: RegulatoryItem[] = [];
  for (let i = 0; i < GDELT_QUERIES.length; i++) {
    const r = gdeltResults[i];
    if (!r) continue;
    if (r.status === "fulfilled" && r.value.length > 0) {
      gdeltItems.push(...r.value);
      sourcesHit.add("GDELT");
    } else if (r.status === "rejected") {
      errors.push(`GDELT[${i}]: fetch failed`);
    }
  }

  // Deduplicate GDELT by URL and sort most negative tone first
  const gdeltSeen = new Set<string>();
  const gdeltDeduped = gdeltItems
    .filter((item) => {
      if (gdeltSeen.has(item.url)) return false;
      gdeltSeen.add(item.url);
      return true;
    });
  const gdeltToneRank = (t: RegulatoryItem["tone"]) => t === "red" ? 2 : t === "amber" ? 1 : 0;
  gdeltDeduped.sort((a, b) => gdeltToneRank(b.tone) - gdeltToneRank(a.tone));

  // Add GDELT items to live feed
  live.push(...gdeltDeduped.slice(0, 20));

  // Add FATF RSS items
  if (fatfItems.length > 0) {
    live.push(...fatfItems);
    sourcesHit.add("FATF");
  }

  // Add OFAC items
  if (ofacItems.length > 0) {
    live.push(...ofacItems);
    sourcesHit.add("OFAC");
  }

  // Add UN SC items
  if (unScItems.length > 0) {
    live.push(...unScItems);
    sourcesHit.add("UN Security Council");
  }

  // Deduplicate all live items by URL
  const seen = new Set<string>();
  const deduped = live.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // Populate publishedAt and summary aliases from existing fields
  for (const item of deduped) {
    if (!item.publishedAt) item.publishedAt = item.pubDate;
    if (!item.summary) item.summary = item.snippet;
  }

  // UAE static items — always shown, always in output regardless of live results
  const uaeStaticFiltered = UAE_STATIC.filter(
    (s) => !seen.has(s.url) && !deduped.some((d) => d.id === s.id),
  );

  // Merge: live items first, then legacy static items not already covered
  const staticFiltered = STATIC_ITEMS.filter(
    (s) => !seen.has(s.url) && !deduped.some((d) => d.title.toLowerCase() === s.title.toLowerCase()),
  );

  const allItems: RegulatoryItem[] = [
    ...uaeStaticFiltered,
    ...deduped.slice(0, 80),
    ...staticFiltered,
  ];

  // Sort by date descending, then by tone (red first within same date)
  const toneRank = { red: 2, amber: 1, green: 0 };
  allItems.sort((a, b) => {
    const aDate = a.pubDate || a.publishedAt || "";
    const bDate = b.pubDate || b.publishedAt || "";
    if (bDate > aDate) return 1;
    if (aDate > bDate) return -1;
    return (toneRank[b.tone] ?? 0) - (toneRank[a.tone] ?? 0);
  });

  // Add sourceType to items and exclude items older than 36 months unless
  // includeArchived is requested.
  const cutoff = Date.now() - ARCHIVE_CUTOFF_MS;
  const sourceTypeMap: Record<string, string> = {
    "MoET": "government", "UAE IEC": "government", "CBUAE": "government",
    "UAEFIU": "government", "FATF": "international_body", "OFAC": "sanctions_authority",
    "UN Security Council": "international_body", "Google News": "news_aggregator",
    "GDELT": "news_aggregator",
  };
  for (const item of allItems) {
    if (!(item as RegulatoryItem & { sourceType?: string }).sourceType) {
      (item as RegulatoryItem & { sourceType?: string }).sourceType =
        sourceTypeMap[item.source] ?? "news_aggregator";
    }
  }

  let filteredItems = allItems.slice(0, 200);
  if (!includeArchived) {
    filteredItems = filteredItems.filter((i) => {
      const d = new Date(i.publishedAt ?? i.pubDate ?? "").getTime();
      return isNaN(d) || d >= cutoff;
    });
  }
  if (categoryFilter) {
    filteredItems = filteredItems.filter((i) => i.category.toLowerCase().includes(categoryFilter));
  }
  const totalCount = filteredItems.length;
  const pagedItems = filteredItems.slice(offset, offset + limit);

  const fullPayload: FeedResult = {
    ok: true,
    items: allItems.slice(0, 200),
    totalCount: allItems.slice(0, 200).length,
    sources: Array.from(sourcesHit),
    fetchedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    errors,
  };

  // Write to cache (unfiltered full set)
  _cache[CACHE_KEY] = { payload: fullPayload, ts: Date.now() };

  return NextResponse.json(
    { ...fullPayload, items: pagedItems, totalCount, latencyMs: Date.now() - t0 },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-Cache": "MISS",
      },
    },
  );
}
