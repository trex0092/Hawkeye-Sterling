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

// Internal Netlify Edge Function relay — runs on Cloudflare's edge network
// (NOT AWS Lambda), so its egress IP is a clean CDN IP that bypasses the
// datacenter-IP 403s that Netlify Functions and Next.js API routes receive.
// The edge function validates the target against an allowlist (no SSRF risk)
// and proxies the raw response body back verbatim.
// Template uses {url} placeholder — same convention as the old public chain.
const RELAY_TEMPLATES: string[] =
  process.env["NEWS_FETCH_RELAY"]?.trim()
    ? process.env["NEWS_FETCH_RELAY"].trim().split(",").map((s) => s.trim()).filter(Boolean)
    : ["/.netlify/edge-functions/fetch-relay?url={url}"];

// Upstream statuses that mean "this IP is refused / throttled" — the cases a
// clean-IP relay can plausibly recover. Other errors (404, 500) are real and
// must NOT be retried through the relay.
const RELAYABLE_STATUSES = new Set([403, 429, 451, 503]);

// How long the direct fetch gets to answer EXCLUSIVELY before the relay is
// hedged in parallel (relay-enabled calls only). GDELT's dominant brownout mode
// is a HANG, not a fast 403 (docs/RELIABILITY-REPORT.md: multiple times per
// week, 60+ s) — a hang used to consume the caller's entire timeout, leaving
// the relay zero budget and turning every brownout into a hard miss. Healthy
// GDELT answers in ~1-3 s, so 1.5 s keeps the common case relay-free while a
// hang still leaves ~2.5 s of the 4 s screening budget for the edge relay.
// The hedge never aborts the direct attempt — if direct answers first (even
// after the relay fired), direct still wins.
const RELAY_HEDGE_MS: number = (() => {
  const raw = process.env["NEWS_RELAY_HEDGE_MS"]?.trim();
  if (!raw) return 1_500;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1_500;
})();

// Netlify injects URL (canonical site URL) at runtime. Used to resolve the
// internal edge-function relay path to an absolute URL for server-side fetch.
const SITE_ORIGIN: string =
  process.env["NEXT_PUBLIC_APP_URL"]?.trim() ||
  process.env["URL"]?.trim() ||
  "http://localhost:3000";

function buildRelayUrl(template: string, target: string): string {
  const filled = template.includes("{url}")
    ? template.replace("{url}", encodeURIComponent(target))
    : `${template}${encodeURIComponent(target)}`;
  // Resolve relative relay paths (e.g. /.netlify/edge-functions/…) to absolute
  // so server-side fetch can reach them. Absolute templates (https://…) pass through.
  if (filled.startsWith("/")) {
    return `${SITE_ORIGIN}${filled}`;
  }
  return filled;
}

export function newsRelayInfo(): { enabled: boolean; count: number } {
  return { enabled: RELAY_TEMPLATES.length > 0, count: RELAY_TEMPLATES.length };
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

// Try each free relay in order; the first that returns 2xx wins. A relay that
// is itself blocked/down/rate-limited just advances to the next. Resolves with
// the first OK response, or null when every relay failed — never rejects.
//
// The chain gets a FRESH 8s AbortController combined with the caller's signal:
// fresh, so a direct attempt that already fired the shared signal can't kill
// the relay outright; combined, so an expired per-feed timeout (e.g. the 800ms
// locale AbortController) still bounds the relay rather than letting it run
// for 8s past the 4s OVERALL_TIMEBOX_MS — which would leave feedStats reading
// 0/0 and the dossier reporting "unavailable" even when Google News is up.
// `abandon` lets a hedged caller cancel the chain when the direct fetch wins.
async function runRelayChain(
  target: string,
  dispatcher: Dispatcher | undefined,
  callerSignal: AbortSignal | undefined,
  abandon?: AbortSignal,
): Promise<Response | null> {
  const relayController = new AbortController();
  const relayTimeout = setTimeout(() => relayController.abort(), 8_000);
  const signals = [relayController.signal];
  if (callerSignal) signals.push(callerSignal);
  if (abandon) signals.push(abandon);
  const relaySignal = signals.length > 1 ? AbortSignal.any(signals) : relayController.signal;
  const relayInit: RequestInit = {
    headers: FEED_HEADERS,
    signal: relaySignal,
    ...(dispatcher ? ({ dispatcher } as DispatcherRequestInit) : {}),
  };
  try {
    for (const template of RELAY_TEMPLATES) {
      try {
        const relayed = await fetch(buildRelayUrl(template, target), relayInit);
        if (relayed.ok) return relayed;
        await drainResponse(relayed); // non-2xx relay — release before next attempt
      } catch {
        // This relay failed — try the next one.
      }
    }
    return null;
  } finally {
    clearTimeout(relayTimeout);
  }
}

type DirectOutcome = { kind: "res"; res: Response } | { kind: "err"; err: unknown };

// Drop-in replacement for `fetch` for all news/feed egress. Behaves exactly like
// global fetch when no proxy is configured; otherwise routes the single request
// through the proxy dispatcher. Caller-supplied headers/signal/etc. are passed
// through untouched.
//
// `opts.allowRelay` opts a call into the free public-relay fallback (see
// RELAY_TEMPLATES). Only keyless public feeds should set this — NEVER an
// API-key adapter. The relay engages two ways:
//   1. Fast failure: the direct fetch is refused (403/429/451/503) or throws —
//      the relay chain runs immediately, exactly as before.
//   2. Hang (hedge): the direct fetch hasn't settled after RELAY_HEDGE_MS — the
//      relay chain starts IN PARALLEL while direct keeps running. First usable
//      response wins; the loser is aborted/drained. Without the hedge, a
//      hanging upstream (GDELT's weekly brownout mode) consumed the caller's
//      whole timeout and the relay — combined with the already-fired caller
//      signal — aborted before it could send a single byte.
async function newsFetchInner(
  input: string | URL | Request,
  init?: RequestInit,
  opts?: {
    allowRelay?: boolean;
    /** Override the relay hedge delay for this call. Callers with a per-feed
     *  budget SHORTER than the global RELAY_HEDGE_MS (e.g. the 1.2s Google
     *  locale fan-out vs the 1.5s default tuned for GDELT) must pass a smaller
     *  value or a hanging direct fetch exhausts the budget before the relay is
     *  ever allowed to start — the exact failure that surfaces as
     *  "0/N feeds reachable" during a datacenter-IP brownout. */
    relayHedgeMs?: number;
  },
): Promise<Response> {
  const dispatcher = getNewsDispatcher();
  const relayEnabled = Boolean(opts?.allowRelay) && RELAY_TEMPLATES.length > 0;

  if (!relayEnabled) {
    const directInit: RequestInit = dispatcher
      ? ({ ...init, dispatcher } as DispatcherRequestInit as RequestInit)
      : (init ?? {});
    return fetch(input as RequestInfo, directInit);
  }

  // Relay-enabled path. Wrap the direct fetch in our own controller (combined
  // with the caller's signal) so a relay win can release the hanging socket.
  const callerSignal = init?.signal ?? undefined;
  const directController = new AbortController();
  const directSignal = callerSignal
    ? AbortSignal.any([callerSignal, directController.signal])
    : directController.signal;
  const directInit: RequestInit = {
    ...init,
    signal: directSignal,
    ...(dispatcher ? ({ dispatcher } as DispatcherRequestInit) : {}),
  };

  const target = targetUrl(input);
  // Normalize to an outcome object so the promise never rejects unobserved
  // while it races the hedge timer / relay chain.
  const directOutcome: Promise<DirectOutcome> = fetch(input as RequestInfo, directInit).then(
    (res): DirectOutcome => ({ kind: "res", res }),
    (err): DirectOutcome => ({ kind: "err", err }),
  );

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const hedgeMs = opts?.relayHedgeMs ?? RELAY_HEDGE_MS;
    const hedge = new Promise<"hedge">((resolve) => {
      hedgeTimer = setTimeout(() => resolve("hedge"), hedgeMs);
    });

    const first = await Promise.race([directOutcome, hedge]);

    if (first !== "hedge") {
      // Direct settled within the hedge window — original sequential semantics.
      if (first.kind === "res" && !RELAYABLE_STATUSES.has(first.res.status)) return first.res;
      const relayed = await runRelayChain(target, dispatcher, callerSignal);
      if (relayed) {
        // Discarding the refused direct response — release its socket so a later
        // reset can't crash the function as an unhandled error.
        if (first.kind === "res") await drainResponse(first.res);
        return relayed;
      }
      // Every relay failed: hand back the true upstream response so callers see
      // the real status, or surface the outage if the direct call also threw.
      if (first.kind === "res") return first.res;
      throw new Error("news fetch failed (direct and all relays)");
    }

    // Hedge fired — direct is slow or hanging. Race it against the relay chain;
    // a usable direct response still wins (the hedge never truncates a healthy
    // 1-3s direct round-trip), the relay only covers for it.
    const abandonRelay = new AbortController();
    const relayRace = runRelayChain(target, dispatcher, callerSignal, abandonRelay.signal);
    const winner = await Promise.race([
      directOutcome.then((o) => ({ src: "direct" as const, o })),
      relayRace.then((res) => ({ src: "relay" as const, res })),
    ]);

    if (winner.src === "direct") {
      if (winner.o.kind === "res" && !RELAYABLE_STATUSES.has(winner.o.res.status)) {
        abandonRelay.abort();
        // If a relay response had already landed in the race window, release it.
        void relayRace.then((res) => drainResponse(res)).catch(() => undefined);
        return winner.o.res;
      }
      // Direct produced a relayable refusal or threw — the in-flight relay is
      // the only remaining hope; wait for it.
      const relayed = await relayRace;
      if (relayed) {
        if (winner.o.kind === "res") await drainResponse(winner.o.res);
        return relayed;
      }
      if (winner.o.kind === "res") return winner.o.res;
      throw new Error("news fetch failed (direct and all relays)");
    }

    if (winner.res) {
      // Relay won while direct is still in flight — abort the hung socket and
      // drain it if it had already resolved in the race window.
      directController.abort();
      void directOutcome
        .then((o) => (o.kind === "res" ? drainResponse(o.res) : undefined))
        .catch(() => undefined);
      return winner.res;
    }

    // Relay chain exhausted while direct is still pending — let direct run to
    // the caller's own deadline and report its true outcome.
    const last = await directOutcome;
    if (last.kind === "res") return last.res;
    throw new Error("news fetch failed (direct and all relays)");
  } finally {
    if (hedgeTimer !== undefined) clearTimeout(hedgeTimer);
  }
}

// ── Global news-egress concurrency cap ──────────────────────────────────────
// The dossier fan-out fires the Google-News locale pool (10) PLUS every
// regional/investigative feed bank (~70 feeds via unpooled Promise.allSettled)
// at once. On Netlify that ~80-socket burst collapses the instance's outbound
// egress — every fetch, direct AND relay, then fails `network` and the dossier
// returns 0 articles at ~10s (observed live 2026-06-11: feedFailures
// {network:91}, latencyMs 11255), while a SINGLE fetch from the same instance
// still succeeds — the tell that this is burst-induced egress death, not a
// Google IP block (which would surface as http_403, not network). Capping the
// TOTAL concurrent news sockets keeps egress alive so the feeds that do run
// actually return articles, and bounds the worst-case latency. Override with
// NEWS_MAX_CONCURRENCY.
const NEWS_MAX_CONCURRENCY = ((): number => {
  const raw = Number(process.env["NEWS_MAX_CONCURRENCY"]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6;
})();
let activeNewsFetches = 0;
const newsSlotQueue: Array<() => void> = [];
function acquireNewsSlot(): Promise<void> {
  if (activeNewsFetches < NEWS_MAX_CONCURRENCY) {
    activeNewsFetches += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => newsSlotQueue.push(resolve));
}
function releaseNewsSlot(): void {
  const next = newsSlotQueue.shift();
  if (next) next(); // hand the permit straight to the next waiter (active count unchanged)
  else activeNewsFetches = Math.max(0, activeNewsFetches - 1);
}

// Public entry point for all news/feed egress. Acquires a global permit so the
// combined fan-out can't open ~80 sockets at once and collapse the instance's
// egress. The permit is always released (finally), and the inner fetch is
// bounded by the caller's AbortSignal plus the relay's 8s ceiling, so a permit
// is never held indefinitely.
export async function newsFetch(
  input: string | URL | Request,
  init?: RequestInit,
  opts?: { allowRelay?: boolean; relayHedgeMs?: number },
): Promise<Response> {
  await acquireNewsSlot();
  try {
    return await newsFetchInner(input, init, opts);
  } finally {
    releaseNewsSlot();
  }
}
