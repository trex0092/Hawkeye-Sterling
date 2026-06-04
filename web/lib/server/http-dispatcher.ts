// Hawkeye Sterling — shared outbound dispatcher for adverse-media / news egress.
//
// WHY THIS EXISTS
// ---------------
// The adverse-media dossier (`/api/news-search`) fans out to ~200 external news
// and OSINT feeds at request time. In production the serving runtime (Netlify
// Functions / container / k8s pod) egresses from a datacenter IP, and Google
// News RSS, GDELT and many wire/outlet feeds return HTTP 403 to datacenter IPs
// *regardless of User-Agent*. Every feed then fails, `feedsReachable === 0`, and
// the dossier correctly reports `retrieval: "unavailable"` (the FATF R.10
// fail-safe). See docs/EGRESS-ALLOWLIST.md.
//
// This module lets an operator route news egress through an allowed / non-403'd
// outbound proxy via a single env var, without touching any other subsystem.
//
// SCOPING — IMPORTANT
// -------------------
// We deliberately DO NOT call undici's `setGlobalDispatcher`. A global dispatcher
// would also route Netlify Blobs, Upstash Redis, Anthropic, MoonDB and the whole
// sanctions/PEP path through the proxy. Instead `newsFetch` injects the proxy
// `dispatcher` per-call, so only the news feed fetches are proxied. Everything
// else continues to egress directly.

import { ProxyAgent, type Dispatcher } from "undici";

// Real-browser UA — Google News RSS and several mainstream outlets 403 obvious
// bot User-Agents. Shared by every feed fetch and the health probe so the probe
// observes exactly what the dossier does.
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const FEED_HEADERS: Record<string, string> = {
  "user-agent": BROWSER_UA,
  accept: "application/rss+xml,application/xml,text/xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

// Proxy env resolution. NEWS_HTTP_PROXY is preferred (news-egress only); we fall
// back to the conventional HTTPS_PROXY / HTTP_PROXY (+ lowercase) so a runtime
// that already sets a standard proxy is honoured.
function readProxyEnv(): { uri: string; source: string } | null {
  const candidates: Array<[string, string | undefined]> = [
    ["NEWS_HTTP_PROXY", process.env["NEWS_HTTP_PROXY"]],
    ["HTTPS_PROXY", process.env["HTTPS_PROXY"]],
    ["https_proxy", process.env["https_proxy"]],
    ["HTTP_PROXY", process.env["HTTP_PROXY"]],
    ["http_proxy", process.env["http_proxy"]],
  ];
  for (const [source, value] of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return { uri: trimmed, source };
  }
  return null;
}

// Resolved once at module load — proxy config is process-wide and immutable.
const proxyConfig = readProxyEnv();

// Free public-relay fallback. A "reader" / CORS relay fetches the target URL
// from ITS OWN (clean, non-datacenter) IP and returns the raw body, which often
// defeats the datacenter-IP 403 with no API key and no paid proxy. Best-effort
// only — public relays are rate-limited and flaky — so it is OFF by default and
// applied ONLY to keyless public feeds (never the API-key vendor adapters, which
// would leak credentials to a third party). Enable with NEWS_RELAY_ENABLED=1
// (uses a built-in raw-passthrough default) or set NEWS_FETCH_RELAY to a custom
// template containing "{url}".
//
// GOVERNANCE NOTE: when enabled, the subject NAME (as a query string) transits a
// third-party relay. Acceptable only where that is compatible with the operator's
// data-handling policy — hence opt-in.
const RELAY_TEMPLATE: string | null = (() => {
  const explicit = process.env["NEWS_FETCH_RELAY"]?.trim();
  if (explicit) return explicit;
  const flag = process.env["NEWS_RELAY_ENABLED"]?.trim();
  if (flag && flag !== "false" && flag !== "0") {
    // Raw-passthrough relay: returns the unmodified feed body (RSS XML / GDELT
    // JSON), unlike content-extracting readers that would mangle structured feeds.
    return "https://api.allorigins.win/raw?url={url}";
  }
  return null;
})();

// Upstream statuses that mean "this IP is refused / throttled" — the cases a
// clean-IP relay can plausibly recover. Other errors (404, 500) are real and
// must NOT be retried through the relay.
const RELAYABLE_STATUSES = new Set([403, 429, 451, 503]);

function buildRelayUrl(target: string): string | null {
  if (!RELAY_TEMPLATE) return null;
  return RELAY_TEMPLATE.includes("{url}")
    ? RELAY_TEMPLATE.replace("{url}", encodeURIComponent(target))
    : `${RELAY_TEMPLATE}${encodeURIComponent(target)}`;
}

export function newsRelayInfo(): { enabled: boolean } {
  return { enabled: Boolean(RELAY_TEMPLATE) };
}

let cachedDispatcher: Dispatcher | undefined;
let dispatcherResolved = false;

// Lazily build the ProxyAgent so a malformed proxy URL fails soft (direct fetch)
// rather than throwing at import time and taking down the whole route.
export function getNewsDispatcher(): Dispatcher | undefined {
  if (dispatcherResolved) return cachedDispatcher;
  dispatcherResolved = true;
  if (!proxyConfig) {
    cachedDispatcher = undefined;
    return cachedDispatcher;
  }
  try {
    const options: ProxyAgent.Options = { uri: proxyConfig.uri };
    const ca = process.env["NEWS_PROXY_CA"]?.trim();
    const rejectUnauthorized = process.env["NEWS_PROXY_TLS_REJECT_UNAUTHORIZED"];
    if (ca || rejectUnauthorized === "false") {
      options.requestTls = {
        ...(ca ? { ca } : {}),
        ...(rejectUnauthorized === "false" ? { rejectUnauthorized: false } : {}),
      };
    }
    cachedDispatcher = new ProxyAgent(options);
  } catch (err) {
    console.warn("[hawkeye] http-dispatcher: failed to build news proxy agent, using direct egress:", err);
    cachedDispatcher = undefined;
  }
  return cachedDispatcher;
}

export interface NewsProxyInfo {
  configured: boolean;
  // Which env var supplied the proxy. Never the URL/credentials.
  source: string | null;
}

export function newsProxyInfo(): NewsProxyInfo {
  return { configured: Boolean(proxyConfig), source: proxyConfig?.source ?? null };
}

// undici extends RequestInit with `dispatcher`; the DOM lib's RequestInit does
// not, so we widen the type locally rather than casting away safety everywhere.
type DispatcherRequestInit = RequestInit & { dispatcher?: Dispatcher };

function targetUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

// Drop-in replacement for `fetch` for all news/feed egress. Behaves exactly like
// global fetch when no proxy is configured; otherwise routes the single request
// through the proxy dispatcher. Caller-supplied headers/signal/etc. are passed
// through untouched.
//
// `opts.allowRelay` opts a call into the free public-relay fallback (see
// RELAY_TEMPLATE): if the direct fetch is refused (403/429/451/503) or throws,
// AND a relay is configured, the request is retried once through the relay.
// Only keyless public feeds should set this — NEVER an API-key adapter.
export async function newsFetch(
  input: string | URL | Request,
  init?: RequestInit,
  opts?: { allowRelay?: boolean },
): Promise<Response> {
  const dispatcher = getNewsDispatcher();
  const directInit: RequestInit = dispatcher
    ? ({ ...init, dispatcher } as DispatcherRequestInit as RequestInit)
    : (init ?? {});

  const relayEnabled = Boolean(opts?.allowRelay) && Boolean(RELAY_TEMPLATE);

  let directRes: Response | null = null;
  try {
    directRes = await fetch(input as RequestInfo, directInit);
    if (!relayEnabled || !RELAYABLE_STATUSES.has(directRes.status)) return directRes;
  } catch (err) {
    if (!relayEnabled) throw err;
    // Network-level failure — fall through and try the relay.
  }

  const relayUrl = buildRelayUrl(targetUrl(input));
  if (!relayUrl) return directRes ?? Promise.reject(new Error("news fetch failed"));
  try {
    const relayInit: RequestInit = {
      headers: FEED_HEADERS,
      ...(init?.signal ? { signal: init.signal } : {}),
      ...(dispatcher ? ({ dispatcher } as DispatcherRequestInit) : {}),
    };
    const relayed = await fetch(relayUrl, relayInit);
    // Prefer the relay only when it actually succeeded; otherwise hand back the
    // original response so callers see the true upstream status.
    if (relayed.ok) return relayed;
    return directRes ?? relayed;
  } catch {
    if (directRes) return directRes;
    throw new Error("news fetch failed (direct and relay)");
  }
}
