import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson } from "@/lib/server/store";
import {
  fixturePayload,
  type EocnFeedPayload,
  type ListUpdate,
} from "@/lib/data/eocn-fixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET  /api/eocn-list-updates
//   → returns the latest EocnFeedPayload. Reads from Netlify Blobs first
//     (populated by the eocn-poll scheduled function); falls back to the
//     bundled fixture so the EOCN page always renders, even on a fresh
//     deployment with no live feed configured.
//
// POST /api/eocn-list-updates  (gated)
//   → operator-triggered re-poll. Re-fetches upstream synchronously and
//     writes to the same blob key the scheduled cron uses. Useful when
//     the operator hits the page Refresh button between cron ticks.
//
// Env-driven configuration:
//   EOCN_FEED_URL          Optional upstream URL (RSS / JSON / HTML
//                          announcements page). When set, POST attempts
//                          a live fetch; when unset, fixture is the
//                          only source.
//   EOCN_FEED_PARSER       "rss" | "json" | "auto" (default auto).
//                          Picks the parser shape — RSS is the path
//                          we're guarding for since EOCN's UAE site
//                          doesn't currently expose JSON.

const BLOB_KEY = "hawkeye-eocn/list-updates/latest.json";

type ParsedUpdate = Pick<
  ListUpdate,
  "date" | "time" | "version" | "notes"
> & {
  deltaAdded?: number;
  deltaRemoved?: number;
};

// HTML decoder for entities the parsers below will encounter when
// stripping a real-world EOCN page (named entities + numeric refs).
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// Parse the EOCN UAE announcements page (https://www.uaeiec.gov.ae/
// en-us/un-page or similar). The site doesn't expose RSS; it serves
// HTML with announcement cards. We extract title-bearing anchors and
// surrounding date text without pulling in cheerio — regex on a
// flattened DOM is plenty for the shape EOCN publishes (text-heavy,
// no script-rendered content needed for the title/date alone).
function parseEocnHtml(html: string): ParsedUpdate[] {
  // Drop scripts + styles up front so their inline text doesn't get
  // matched as titles.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Look for blocks shaped like "<a ...>Title</a> ... 29-04-2026"
  // or "<h?>Title</h?> ... <span...>29 April 2026</span>". EOCN's
  // page uses anchor-titles within news-list items; the anchor is
  // a stable hook.
  const updates: ParsedUpdate[] = [];
  const linkBlocks =
    cleaned.match(/<a\b[^>]*>[\s\S]{1,800}?<\/a>(?:[\s\S]{0,800}?<\/(?:li|div|article|section)>)?/gi) ?? [];

  // Date patterns the EOCN page uses (DD-MM-YYYY, DD/MM/YYYY,
  // "29 April 2026", "April 29, 2026"). Captured to YYYY-MM-DD.
  const MONTHS: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const datePatterns: Array<{ rx: RegExp; toIso: (m: RegExpMatchArray) => string | null }> = [
    {
      rx: /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
      toIso: (m) => {
        const dd = String(m[1]).padStart(2, "0");
        const mm = String(m[2]).padStart(2, "0");
        return `${m[3]}-${mm}-${dd}`;
      },
    },
    {
      rx: /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
      toIso: (m) => {
        const mm = String(m[2]).padStart(2, "0");
        const dd = String(m[3]).padStart(2, "0");
        return `${m[1]}-${mm}-${dd}`;
      },
    },
    {
      rx: /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
      toIso: (m) => {
        const mm = MONTHS[m[2]!.toLowerCase()];
        if (!mm) return null;
        return `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}`;
      },
    },
    {
      rx: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
      toIso: (m) => {
        const mm = MONTHS[m[1]!.toLowerCase()];
        if (!mm) return null;
        return `${m[3]}-${mm}-${String(m[2]).padStart(2, "0")}`;
      },
    },
  ];

  for (const block of linkBlocks) {
    const titleRaw = block.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
    const title = decodeEntities(titleRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!title || title.length < 8) continue;
    // Filter chrome: skip nav links / "Click here" / Arabic-only
    // titles when no English equivalent surfaced.
    if (/^(home|about|contact|click here|read more|en|ar)\s*$/i.test(title)) continue;
    if (!/announcement|sanctions?|amend|delist|add|update|resolution|name|committee|list/i.test(title)) continue;

    let isoDate: string | null = null;
    for (const p of datePatterns) {
      const m = block.match(p.rx);
      if (m) {
        isoDate = p.toIso(m);
        if (isoDate) break;
      }
    }
    const date = isoDate ?? new Date().toISOString().slice(0, 10);

    const version =
      title.match(/v?20\d{2}\.\d{2,3}/)?.[0] ??
      `EOCN-${date}`;
    const addMatch = title.match(/\b(?:add(?:ed)?|amend(?:ed)?|new)\b\D{0,30}?(\d+)/i);
    const removeMatch = title.match(/\b(?:delist(?:ed)?|remove[ds]?)\b\D{0,30}?(\d+)/i);

    updates.push({
      date,
      time: "00:00",
      version: version.startsWith("EOCN") ? version : `EOCN-TFS-${version}`,
      deltaAdded: addMatch && addMatch[1] ? Number(addMatch[1]) : 0,
      deltaRemoved: removeMatch && removeMatch[1] ? Number(removeMatch[1]) : 0,
      notes: title.slice(0, 280),
    });
  }

  // Dedupe by (date, title-prefix) so a card rendered twice in the
  // page (e.g. "latest" + "all") doesn't double-count.
  const seen = new Set<string>();
  return updates.filter((u) => {
    const key = `${u.date}::${u.notes.slice(0, 120)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Parse a minimal RSS / Atom feed into our ListUpdate shape. EOCN
// doesn't currently expose a feed; this remains the path for any
// future RSS endpoint we point EOCN_FEED_URL at.
function parseRssLikeFeed(xml: string): ParsedUpdate[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((raw): ParsedUpdate | null => {
      const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim();
      const pub = (raw.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "")
        .trim();
      const desc = (raw.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!title) return null;
      const d = new Date(pub);
      const date = isNaN(d.getTime())
        ? new Date().toISOString().slice(0, 10)
        : d.toISOString().slice(0, 10);
      const time = isNaN(d.getTime())
        ? "00:00"
        : d.toISOString().slice(11, 16);
      // Extract version-style tokens (e.g. "v2025.041") if EOCN embeds
      // them in the title or description.
      const version =
        (title + " " + desc).match(/v?20\d{2}\.\d{2,3}/)?.[0] ??
        `EOCN-TFS-${d.toISOString().slice(0, 10)}`;
      // Best-effort delta parsing — EOCN announcements often phrase
      // changes as "Add of N names" / "Delisting of N names".
      const addMatch = title.match(/\b(?:add|amend|new)\b.*?(\d+)/i);
      const removeMatch = title.match(/\b(?:delist|remove)\b.*?(\d+)/i);
      return {
        date,
        time,
        version: version.startsWith("EOCN") ? version : `EOCN-TFS-${version}`,
        deltaAdded: addMatch ? Number(addMatch[1]) : 0,
        deltaRemoved: removeMatch ? Number(removeMatch[1]) : 0,
        notes: desc.length > 0 ? desc.slice(0, 280) : title,
      };
    })
    .filter((u): u is ParsedUpdate => u !== null);
}

async function fetchUpstream(): Promise<{
  ok: boolean;
  updates?: ListUpdate[];
  url?: string;
  error?: string;
}> {
  const url = process.env["EOCN_FEED_URL"];
  if (!url) {
    return { ok: false, error: "EOCN_FEED_URL not configured" };
  }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12_000);
    // Browser-shaped headers — EOCN's WAF returns 403 to anything
    // that looks like a script. Mimicking a recent Chrome works at
    // request time; we don't execute JS so any content the page
    // hydrates client-side is invisible (acceptable — the
    // announcement titles + dates are server-rendered).
    const r = await fetch(url, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/json;q=0.7,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9,ar;q=0.5",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, error: `upstream HTTP ${r.status}`, url };
    const body = await r.text();
    // Auto-detect format. RSS / Atom feeds open with <?xml or have
    // <rss / <feed root nodes. Anything else we treat as HTML.
    const looksRss = /^\s*<\?xml|<rss\b|<feed\b/i.test(body.slice(0, 400));
    const parsed = looksRss ? parseRssLikeFeed(body) : parseEocnHtml(body);
    if (parsed.length === 0) {
      return { ok: false, error: looksRss ? "no entries parsed (RSS)" : "no entries parsed (HTML)", url };
    }
    const updates: ListUpdate[] = parsed.map((p, i) => ({
      id: `LU-LIVE-${p.date.replace(/-/g, "")}-${i}`,
      date: p.date,
      time: p.time,
      version: p.version,
      deltaAdded: p.deltaAdded ?? 0,
      deltaRemoved: p.deltaRemoved ?? 0,
      screeningStatus: "applied",
      screeningCompletedAt: `${p.date} ${p.time}`,
      notes: p.notes,
    }));
    return { ok: true, updates, url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      url,
    };
  }
}

// GET — return cached blob (or fixture), no upstream fetch.
async function handleGet(_req: Request): Promise<NextResponse> {
  const cached = await getJson<EocnFeedPayload>(BLOB_KEY);
  if (cached && cached.listUpdates && cached.listUpdates.length > 0) {
    return NextResponse.json(cached, { status: 200 });
  }
  return NextResponse.json(fixturePayload(), { status: 200 });
}

// Constant-time token comparison — rejects timing oracles on the
// Bearer token used by the eocn-poll scheduled function.
function safeTokenEqual(got: string, expected: string): boolean {
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i += 1) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// POST — live fetch. Two auth paths:
//   1. cron bypass — Bearer SANCTIONS_CRON_TOKEN (used by
//      netlify/functions/eocn-poll.mts). No rate-limit consumption.
//   2. operator path — falls through to enforce(), which handles
//      ADMIN_TOKEN portal bypass + API-key lookup.
// Result is written to the same blob key the GET handler reads, so
// the next GET sees the fresh snapshot without an extra round-trip.
async function handlePost(req: Request): Promise<NextResponse> {
  const cronToken = process.env["SANCTIONS_CRON_TOKEN"];
  const presented = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cronMatch =
    !!cronToken && !!presented && safeTokenEqual(presented, cronToken);

  let gateHeaders: Record<string, string> = {};
  if (!cronMatch) {
    const gate = await enforce(req);
    if (!gate.ok) return gate.response;
    gateHeaders = gate.headers;
  }

  const fix = fixturePayload();
  const upstream = await fetchUpstream();

  // Merge live updates over fixture so historical entries persist
  // even when the upstream only returns the recent window.
  const merged: ListUpdate[] = upstream.ok && upstream.updates
    ? [
        ...upstream.updates,
        ...fix.listUpdates.filter(
          (f) => !upstream.updates!.some((u) => u.version === f.version),
        ),
      ]
    : fix.listUpdates;

  const payload: EocnFeedPayload = {
    source: upstream.ok ? "live" : "fixture",
    lastSyncedAt: new Date().toISOString(),
    ...(upstream.url ? { upstreamUrl: upstream.url } : {}),
    ...(upstream.error ? { upstreamError: upstream.error } : {}),
    listUpdates: merged,
    matches: fix.matches,
    declarations: fix.declarations,
  };

  await setJson(BLOB_KEY, payload).catch((e) =>
    console.warn("[eocn-list-updates] blob write failed", e),
  );

  return NextResponse.json(payload, {
    status: upstream.ok ? 200 : 502,
    headers: gateHeaders,
  });
}

export const GET = handleGet;
export const POST = handlePost;
