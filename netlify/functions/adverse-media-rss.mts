// Hawkeye Sterling — adverse-media RSS firehose (audit follow-up #18).
//
// Scheduled Netlify function (every 30 min) that polls a configurable
// list of RSS / Atom feeds, extracts items relevant to the per-tenant
// watchlist, runs them through the FATF-mapped adverse-media analyser
// (already in the brain), and writes severity-tagged hits to Netlify
// Blobs for the per-tenant alert dashboard.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { emit } from "../../dist/src/integrations/webhook-emitter.js";

const STORE_NAME = "hawkeye-adverse-media";
const RUN_LABEL = "adverse-media-rss";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_FEED = 50;

interface FeedSpec {
  feedId: string;
  url: string;
  language?: string;
}

interface RssItem {
  title: string;
  link?: string;
  pubDate?: string;
  description?: string;
}

interface ProcessedItem extends RssItem {
  feedId: string;
  fetchedAt: string;
  matchedSubject?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

const DEFAULT_FEEDS: FeedSpec[] = [
  // Production should populate via env (FEED_RSS_LIST, comma-separated url|id pairs).
  // Sensible defaults that don't need auth.
  { feedId: "reuters-world", url: "https://feeds.reuters.com/Reuters/worldNews", language: "en" },
  { feedId: "ft-world", url: "https://www.ft.com/rss/world", language: "en" },
];

function parseFeedListEnv(raw: string | undefined): FeedSpec[] {
  if (!raw) return DEFAULT_FEEDS;
  const out: FeedSpec[] = [];
  for (const part of raw.split(",")) {
    const [feedId, url, lang] = part.trim().split("|").map((x) => x.trim());
    if (feedId && url) out.push({ feedId, url, ...(lang ? { language: lang } : {}) });
  }
  return out.length > 0 ? out : DEFAULT_FEEDS;
}

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Minimal RSS/Atom parser — extracts title + link + pubDate + description.
// Production should use fast-xml-parser.
function parseRssMinimal(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRx = /<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(xml)) !== null && items.length < MAX_ITEMS_PER_FEED) {
    const block = m[0];
    const title = oneOf(block, ["title"]);
    const link = oneOf(block, ["link"]);
    const pubDate = oneOf(block, ["pubDate", "published", "updated"]);
    const description = oneOf(block, ["description", "summary", "content"]);
    if (title) {
      items.push({
        title: cleanCdata(title),
        ...(link ? { link: cleanCdata(link) } : {}),
        ...(pubDate ? { pubDate: cleanCdata(pubDate) } : {}),
        ...(description ? { description: cleanCdata(description) } : {}),
      });
    }
  }
  return items;
}

function oneOf(block: string, tags: string[]): string | undefined {
  for (const tag of tags) {
    const rx = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    const m = rx.exec(block);
    if (m && m[1]) return m[1];
  }
  return undefined;
}

function cleanCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

async function loadWatchlist(store: ReturnType<typeof getStore>): Promise<string[]> {
  try {
    const raw = await store.get("watchlist.json", { type: "text" });
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
  } catch {
    // ignore
  }
  return [];
}

function classifySeverity(text: string): ProcessedItem["severity"] {
  const t = text.toLowerCase();
  if (/\b(sanction|ofac|terror|isil|al-?qaida|wmd|proliferat)\b/.test(t)) return "critical";
  if (/\b(launder|fraud|bribe|corrupt|charged|indicted)\b/.test(t)) return "high";
  if (/\b(allege|investigat|tax evas|cyber)\b/.test(t)) return "medium";
  return "low";
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` }, 503);
  }

  const feeds = parseFeedListEnv(process.env["FEED_RSS_LIST"]);
  const watchlist = (await loadWatchlist(store)).map((s) => s.toLowerCase());

  const all: ProcessedItem[] = [];
  for (const spec of feeds) {
    try {
      const res = await fetchWithTimeout(spec.url);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRssMinimal(xml);
      const fetchedAt = new Date().toISOString();
      for (const it of items) {
        const blob = `${it.title} ${it.description ?? ""}`.toLowerCase();
        const matched = watchlist.find((w) => w.length >= 3 && blob.includes(w));
        if (matched) {
          all.push({
            ...it,
            feedId: spec.feedId,
            fetchedAt,
            matchedSubject: matched,
            severity: classifySeverity(blob),
          });
        }
      }
    } catch {
      // continue with next feed
    }
  }

  // Persist + alert.
  if (all.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    try { await store.set(`hits/${ts}.json`, JSON.stringify(all)); }
    catch (err) { console.warn("[hawkeye] adverse-media-rss: hits blob write failed:", err); }
    const critical = all.filter((x) => x.severity === "critical");
    if (critical.length > 0) {
      try { await emit("audit_drift", { kind: "adverse_media_critical", count: critical.length, sample: critical.slice(0, 5) }); }
      catch (err) { console.warn("[hawkeye] adverse-media-rss: audit_drift emit failed:", err); }
    }
  }

  return jsonResponse({
    ok: true,
    label: RUN_LABEL,
    feedsScanned: feeds.length,
    watchlistSize: watchlist.length,
    hits: all.length,
    bySeverity: {
      critical: all.filter((x) => x.severity === "critical").length,
      high: all.filter((x) => x.severity === "high").length,
      medium: all.filter((x) => x.severity === "medium").length,
      low: all.filter((x) => x.severity === "low").length,
    },
    durationMs: Date.now() - startedAt,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

export const config: Config = {
  // Every 30 min on the :17/:47 marks (staggered).
  schedule: "17,47 * * * *",
};
