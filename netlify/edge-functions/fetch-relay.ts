// Netlify Edge Function — news-feed relay.
//
// Runs on Cloudflare's edge network (NOT AWS Lambda), so its egress IP is a
// clean CDN IP that bypasses the datacenter-IP 403s that Netlify Functions
// and Next.js API routes receive from Google News RSS, GDELT, and wire feeds.
//
// Security: only fetches from an explicit allowlist of news/OSINT domains.
// Any other URL returns 403 from this relay, preventing SSRF abuse.

import type { Config, Context } from "@netlify/edge-functions";

// Allowed domains — extend as new feed sources are added.
const ALLOWED_DOMAINS = new Set([
  "news.google.com",
  "api.gdeltproject.org",
  "feeds.bbci.co.uk",
  "www.occrp.org",
  "rss.dw.com",
  "feeds.reuters.com",
  "rss.cnn.com",
  "feeds.nbcnews.com",
  "feeds.abcnews.com",
  "rss.nytimes.com",
  "feeds.theguardian.com",
  "rss.ft.com",
  "www.ft.com",
  "feeds.bloomberg.com",
  "www.aljazeera.com",
  "rss.france24.com",
  "feeds.washingtonpost.com",
  "rss.apnews.com",
  "syndication.ap.org",
  "feeds.foxnews.com",
  "moxie.foxnews.com",
  "feeds.npr.org",
  "www.transparency.org",
  "www.globalwitness.org",
  "www.occrp.org",
  "www.icij.org",
  "www.fatf-gafi.org",
  "feeds.feedburner.com",
  "api.opensanctions.org",
  // Sanctions list publishers
  "ofac.treasury.gov",
  "sanctionslistservice.ofac.treas.gov",
  "www.un.org",
  "scsanctions.un.org",
  "eeas.europa.eu",
  "webgate.ec.europa.eu",
  "assets.publishing.service.gov.uk",
  "www.seco.admin.ch",
  "www.masak.gov.tr",
  // Regional news feeds
  "allafrica.com",
  "www.africanews.com",
  "feeds.channel4.com",
  "www.iol.co.za",
  "feeds.iol.co.za",
  "www.businessdayonline.com",
  "timesofindia.indiatimes.com",
  "feeds.feedburner.com",
  "www.thehindu.com",
  "www.dawn.com",
  "feeds.dawn.com",
  "www.bangkokpost.com",
  "www.straitstimes.com",
  "www.scmp.com",
  "www.japantimes.co.jp",
  "www.koreatimes.co.kr",
  "www.abc.net.au",
  "www.nzherald.co.nz",
  "www.clarin.com",
  "www.folha.uol.com.br",
  "rss.folha.uol.com.br",
  "www.eltiempo.com",
  "www.lanacion.com.ar",
  "www.excelsior.com.mx",
]);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CORS_HEADERS = {
  "access-control-allow-origin": "same-origin",
  "access-control-allow-methods": "GET",
  "cache-control": "no-store",
  "x-relay-by": "netlify-edge",
};

export default async function handler(req: Request, _ctx: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { searchParams } = new URL(req.url);
  const targetRaw = searchParams.get("url");

  if (!targetRaw) {
    return new Response(JSON.stringify({ error: "missing url parameter" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  let target: URL;
  try {
    target = new URL(targetRaw);
  } catch {
    return new Response(JSON.stringify({ error: "invalid url" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  if (!ALLOWED_DOMAINS.has(target.hostname)) {
    return new Response(JSON.stringify({ error: "domain not in relay allowlist" }), {
      status: 403,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        "user-agent": BROWSER_UA,
        accept: "application/rss+xml,application/xml,text/xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    clearTimeout(timer);

    const body = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "content-type": contentType,
        "x-upstream-status": String(upstream.status),
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const detail = err instanceof Error ? err.message : "fetch_failed";
    return new Response(JSON.stringify({ error: detail }), {
      status: 502,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }
}

export const config: Config = {
  path: "/.netlify/edge-functions/fetch-relay",
};
