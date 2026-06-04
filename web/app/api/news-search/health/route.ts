// GET /api/news-search/health
//
// Adverse-media retrieval health probe. Actively checks whether this deployment
// can reach the live news sources that the /api/news-search dossier depends on,
// THROUGH THE SAME EGRESS PATH the dossier uses (newsFetch → optional proxy).
//
// This makes the failure mode that surfaces as "0/202 feeds reachable" in the UI
// — "does this runtime's egress actually reach the news upstreams?" — directly
// observable without an authenticated screen. Per-source httpStatus (403 vs 200
// vs timeout) localizes WHERE egress is blocked, and the `proxy` block shows
// whether an outbound proxy is configured/active. Wire it into uptime monitoring
// so a wholesale news outage pages an operator instead of silently surfacing
// zero articles as a clean negative finding (FATF R.10 — a "no adverse media"
// result must be a genuine search, not an outage).
//
// `?verbose=1` adds extra representative hosts (investigative + regional feeds).
//
// No auth required (liveness/readiness probes must work without creds, and the
// probe exposes no regulated data — only upstream reachability booleans).

import { NextResponse } from "next/server";
import { newsFetch, newsProxyInfo, newsRelayInfo, FEED_HEADERS } from "@/lib/server/http-dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const PROBE_TIMEOUT_MS = 4_000;

type SourceStatus = "reachable" | "unreachable" | "skipped";

interface SourceCheck {
  name: string;
  url: string;
  status: SourceStatus;
  httpStatus?: number;
  latencyMs?: number;
  detail?: string;
  // Whether this probe egressed via the configured proxy or directly — mirrors
  // exactly how the dossier route would have fetched the same host.
  via: "proxy" | "direct";
}

async function probe(
  name: string,
  url: string,
  via: "proxy" | "direct",
  allowRelay = false,
): Promise<SourceCheck> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await newsFetch(
      url,
      { headers: FEED_HEADERS, signal: controller.signal } as RequestInit,
      { allowRelay },
    );
    return {
      name,
      url,
      status: res.ok ? "reachable" : "unreachable",
      httpStatus: res.status,
      latencyMs: Date.now() - t0,
      detail: res.ok ? undefined : `HTTP ${res.status}`,
      via,
    };
  } catch (err) {
    return {
      name,
      url,
      status: "unreachable",
      latencyMs: Date.now() - t0,
      detail: err instanceof Error ? err.name : "fetch_failed",
      via,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const rssEnabled = process.env["GOOGLE_NEWS_RSS_ENABLED"] !== "false";
  const proxy = newsProxyInfo();
  const relay = newsRelayInfo();
  const via: "proxy" | "direct" = proxy.configured ? "proxy" : "direct";
  const verbose = new URL(req.url).searchParams.get("verbose") === "1";

  // Core keyless sources the dossier always depends on. `relayable` mirrors
  // which sources the dossier route retries through the free public relay (GDELT).
  const targets: Array<{ name: string; url: string; gatedByRss?: boolean; relayable?: boolean }> = [
    {
      name: "google_news_rss",
      url: "https://news.google.com/rss/search?q=test&hl=en-US&gl=US&ceid=US:en",
      gatedByRss: true,
    },
    {
      name: "gdelt",
      url: "https://api.gdeltproject.org/api/v2/doc/doc?query=test&mode=artlist&maxrecords=1&format=json",
      relayable: true,
    },
  ];

  // Verbose mode adds a representative investigative + regional feed so an
  // operator sees the full egress picture, not just the two primary sources.
  if (verbose) {
    targets.push(
      { name: "occrp_investigative", url: "https://www.occrp.org/feed/" },
      { name: "bbc_regional", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
      { name: "opensanctions", url: "https://api.opensanctions.org/healthz" },
    );
  }

  const checks = await Promise.all(
    targets.map((t) =>
      t.gatedByRss && !rssEnabled
        ? Promise.resolve<SourceCheck>({
            name: t.name,
            url: t.url,
            status: "skipped",
            detail: "GOOGLE_NEWS_RSS_ENABLED=false",
            via,
          })
        : probe(t.name, t.url, via, Boolean(t.relayable && relay.enabled)),
    ),
  );

  // Sources that count toward live retrieval (a deliberately skipped source is
  // neither healthy nor an outage).
  const considered = checks.filter((s) => s.status !== "skipped");
  const reachable = considered.filter((s) => s.status === "reachable").length;

  // Mirror the dossier route's retrieval-health vocabulary so dashboards can use
  // one schema for both: live = all up, degraded = some but not all up,
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
      // Echoes only WHICH env var supplied the proxy — never the URL/credentials.
      proxy,
      // Whether the free public-relay fallback is enabled (NEWS_RELAY_ENABLED / NEWS_FETCH_RELAY).
      relay,
      ts: new Date().toISOString(),
      sources: checks,
    },
    { status: httpStatus },
  );
}
