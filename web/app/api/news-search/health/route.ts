// GET /api/news-search/health
//
// Adverse-media retrieval health probe. Actively checks whether this deployment
// can reach the keyless live news sources that the /api/news-search dossier
// depends on:
//   - Google News RSS  (news.google.com)        — primary locale fan-out
//   - GDELT Doc 2.0     (api.gdeltproject.org)   — independent keyless source
//
// This makes the single failure mode I could not confirm from a firewalled
// sandbox — "does production egress actually reach the news upstreams?" —
// permanently observable without an authenticated screen. Wire it into uptime
// monitoring / Prometheus alerting so a wholesale news outage pages an operator
// instead of silently surfacing zero articles as a clean negative finding
// (FATF R.10 — a "no adverse media" result must be a genuine search, not an
// outage).
//
// No auth required (liveness/readiness probes must work without creds, and the
// probe exposes no regulated data — only upstream reachability booleans).

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const PROBE_TIMEOUT_MS = 4_000;
// Same real-browser UA the dossier route uses — Google News RSS 403s obvious
// bot User-Agents from datacenter IPs, so a probe with a crawler UA would
// report a false outage.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type SourceStatus = "reachable" | "unreachable" | "skipped";

interface SourceCheck {
  name: string;
  url: string;
  status: SourceStatus;
  httpStatus?: number;
  latencyMs?: number;
  detail?: string;
}

async function probe(name: string, url: string): Promise<SourceCheck> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": BROWSER_UA,
        accept: "application/rss+xml,application/xml,text/xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    } as RequestInit);
    return {
      name,
      url,
      status: res.ok ? "reachable" : "unreachable",
      httpStatus: res.status,
      latencyMs: Date.now() - t0,
      detail: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name,
      url,
      status: "unreachable",
      latencyMs: Date.now() - t0,
      detail: err instanceof Error ? err.name : "fetch_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  const rssEnabled = process.env["GOOGLE_NEWS_RSS_ENABLED"] !== "false";

  const googleProbe: Promise<SourceCheck> = rssEnabled
    ? probe("google_news_rss", "https://news.google.com/rss/search?q=test&hl=en-US&gl=US&ceid=US:en")
    : Promise.resolve({
        name: "google_news_rss",
        url: "https://news.google.com/rss/search",
        status: "skipped" as SourceStatus,
        detail: "GOOGLE_NEWS_RSS_ENABLED=false",
      });

  const [google, gdelt] = await Promise.all([
    googleProbe,
    probe(
      "gdelt",
      "https://api.gdeltproject.org/api/v2/doc/doc?query=test&mode=artlist&maxrecords=1&format=json",
    ),
  ]);

  const sources = [google, gdelt];
  // Sources that count toward live retrieval (a deliberately skipped source is
  // neither healthy nor an outage).
  const considered = sources.filter((s) => s.status !== "skipped");
  const reachable = considered.filter((s) => s.status === "reachable").length;

  // Mirror the dossier route's retrieval-health vocabulary so dashboards can use
  // one schema for both: live = ≥1 source up, degraded = some but not all up,
  // unavailable = every considered source unreachable.
  const retrieval: "live" | "degraded" | "unavailable" =
    reachable === 0
      ? "unavailable"
      : reachable < considered.length
        ? "degraded"
        : "live";

  const httpStatus = retrieval === "unavailable" ? 503 : retrieval === "degraded" ? 207 : 200;

  return NextResponse.json(
    {
      ok: retrieval !== "unavailable",
      retrieval,
      googleNewsRssEnabled: rssEnabled,
      ts: new Date().toISOString(),
      sources,
    },
    { status: httpStatus },
  );
}
