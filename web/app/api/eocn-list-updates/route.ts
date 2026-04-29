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

// Parse a minimal RSS / Atom feed into our ListUpdate shape. EOCN
// doesn't currently expose a feed; this is the path the eocn-poll
// scheduled function will activate once one is published. Kept small
// — full XML parsing brings in a heavy dep and the EOCN feed (when
// it exists) will be tightly-shaped.
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
    const r = await fetch(url, {
      headers: {
        accept: "application/rss+xml, application/xml, text/xml, application/json, */*",
        "user-agent": "hawkeye-sterling-eocn-poll/1.0",
      },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, error: `upstream HTTP ${r.status}`, url };
    const body = await r.text();
    // Best-effort RSS parser; JSON path can be added once EOCN exposes
    // structured output.
    const parsed = parseRssLikeFeed(body);
    if (parsed.length === 0) {
      return { ok: false, error: "no entries parsed", url };
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
