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

// Free public-relay fallback CHAIN. A "reader" / CORS relay fetches the target
// URL from ITS OWN (clean, non-datacenter) IP and returns the raw body, which
// often defeats the datacenter-IP 403 with no API key and no paid proxy. We try
// several independent free relays in order so that one being blocked/down/rate-
// limited does not sink the fallback — the first that returns 2xx wins.
//
// Best-effort only — public relays are flaky — and applied ONLY to keyless public
// feeds (never the API-key vendor adapters, which would leak credentials to a
// third party).
//
// OFF BY DEFAULT — opt-in. Two reasons it must NOT be default-on:
//   1. RELIABILITY (the hard one): public relays are flaky, and a dropped/reset
//      connection from one surfaces as an UNHANDLED socket error (read
//      ECONNRESET at TCP.onStreamRead — no app frame to catch it) that crashes
//      the whole serverless function. A default-on public chain therefore turned
//      the news health probe / dossier from a clean "unavailable" into a 500
//      crash in production. Opt-in keeps the FATF R.10 fail-safe intact.
//   2. DATA HANDLING: the screened name transits a third-party relay. Querying
//      public news is not "tipping off" (the subject never sees it), but the
//      processor hop is still an operator decision.
// Operators who want public-relay fallback opt in explicitly, and should prefer
// a relay they control:
//   - NEWS_FETCH_RELAY=<tmpl[,tmpl]> → use ONLY the operator's own relay(s)
//   - NEWS_RELAY_ENABLED=1|true|on   → use the built-in public chain below
// Each template must contain "{url}". When off, refused feeds simply surface as
// the true upstream status.
//
// NOTE: this public chain is for NEWS only. Sanctions/PEP LIST downloads are
// deliberately NOT routed through public relays — a tampering relay could strip
// a designated name (false negative), so list ingestion uses the operator's
// trusted proxy (NEWS_HTTP_PROXY) instead. See src/ingestion/fetch-util.ts.
const DEFAULT_RELAYS: string[] = [
  // Raw-passthrough relays: return the unmodified feed body (RSS XML / GDELT
  // JSON), unlike content-extracting readers that would mangle structured feeds.
  "https://api.allorigins.win/raw?url={url}",
  "https://corsproxy.io/?url={url}",
  "https://api.codetabs.com/v1/proxy/?quest={url}",
];
const RELAY_TEMPLATES: string[] = (() => {
  // An operator-supplied relay is an explicit choice of destination → honour it.
  const custom = process.env["NEWS_FETCH_RELAY"]?.trim();
  if (custom) return custom.split(",").map((s) => s.trim()).filter(Boolean);
  // The built-in public chain is opt-in only (see reliability note above).
  const flag = process.env["NEWS_RELAY_ENABLED"]?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "on") return DEFAULT_RELAYS;
  return [];
})();

// Upstream statuses that mean "this IP is refused / throttled" — the cases a
// clean-IP relay can plausibly recover. Other errors (404, 500) are real and
// must NOT be retried through the relay.
const RELAYABLE_STATUSES = new Set([403, 429, 451, 503]);

function buildRelayUrl(template: string, target: string): string {
  return template.includes("{url}")
    ? template.replace("{url}", encodeURIComponent(target))
    : `${template}${encodeURIComponent(target)}`;
}

export function newsRelayInfo(): { enabled: boolean; count: number } {
  return { enabled: RELAY_TEMPLATES.length > 0, count: RELAY_TEMPLATES.length };
}

// Returns true when the operator has configured their own relay via NEWS_FETCH_RELAY.
// Use this (not newsRelayInfo().enabled) to opt keyless bulk feeds into relay — the
// built-in public chain (NEWS_RELAY_ENABLED) is too flaky for parallel fan-out.
export function newsOperatorRelayEnabled(): boolean {
  return Boolean(process.env["NEWS_FETCH_RELAY"]?.trim());
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

// Release an unconsumed response body so undici can recycle the underlying
// socket cleanly. A discarded keep-alive response whose body is never read can
// later be reset by the peer, and that reset surfaces as an UNHANDLED 'error'
// (read ECONNRESET) that crashes a serverless invocation. Cancelling the body
// is best-effort — it throws if already consumed/aborted, which we ignore.
export async function drainResponse(res: Response | null | undefined): Promise<void> {
  try {
    await res?.body?.cancel();
  } catch {
    /* already consumed, locked, or aborted — nothing to release */
  }
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

  const relayEnabled = Boolean(opts?.allowRelay) && RELAY_TEMPLATES.length > 0;

  let directRes: Response | null = null;
  try {
    directRes = await fetch(input as RequestInfo, directInit);
    if (!relayEnabled || !RELAYABLE_STATUSES.has(directRes.status)) return directRes;
  } catch (err) {
    if (!relayEnabled) throw err;
    // Network-level failure — fall through and try the relay chain.
  }

  // Try each free relay in order; the first that returns 2xx wins. A relay that
  // is itself blocked/down/rate-limited just advances to the next.
  const target = targetUrl(input);
  const relayInit: RequestInit = {
    headers: FEED_HEADERS,
    ...(init?.signal ? { signal: init.signal } : {}),
    ...(dispatcher ? ({ dispatcher } as DispatcherRequestInit) : {}),
  };
  for (const template of RELAY_TEMPLATES) {
    try {
      const relayed = await fetch(buildRelayUrl(template, target), relayInit);
      if (relayed.ok) {
        // Discarding the refused direct response — release its socket so a later
        // reset can't crash the function as an unhandled error.
        await drainResponse(directRes);
        return relayed;
      }
      await drainResponse(relayed); // non-2xx relay — release before next attempt
    } catch {
      // This relay failed — try the next one.
    }
  }
  // Every relay failed: hand back the true upstream response so callers see the
  // real status, or surface the outage if the direct call also threw.
  if (directRes) return directRes;
  throw new Error("news fetch failed (direct and all relays)");
}
