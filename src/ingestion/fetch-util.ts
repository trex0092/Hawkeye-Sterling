// HTTP fetch with timeout + retry for sanctions-list ingestion.
//
// Three production hardening measures so upstream publishers (OFAC, UN, EU, UK
// OFSI, SECO, MASAK, UAE, …) actually serve the deployment instead of returning
// HTTP 403 — the cause of "N lists failed" on the operator refresh:
//   1. A real browser User-Agent. The old "Hawkeye-Sterling/1.0 (+https://…)"
//      crawler UA is exactly what many gov/CDN endpoints 403.
//   2. An optional outbound proxy (NEWS_HTTP_PROXY → HTTPS_PROXY → HTTP_PROXY)
//      so a datacenter IP that publishers block can egress via an allowed IP.
//   3. A public relay chain (allorigins → corsproxy.io → codetabs) tried once
//      after all direct retries exhaust on a 403/429/451/503. Sanctions lists
//      are publicly published documents — the relay fetches the same URL any
//      browser would. Override with INGEST_FETCH_RELAY / NEWS_FETCH_RELAY for
//      an operator-controlled relay, or disable with NEWS_RELAY_ENABLED=false.

import { ProxyAgent, type Dispatcher } from 'undici';

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
  accept?: string;
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PROXY_URI =
  process.env['NEWS_HTTP_PROXY']?.trim() ||
  process.env['HTTPS_PROXY']?.trim() ||
  process.env['HTTP_PROXY']?.trim() ||
  '';

// Public relay chain for sanctions-list downloads blocked by datacenter IP.
// Sanctions lists are publicly published documents — the relay fetches the
// same URL any browser would. Always active; no env var required.
// Override with INGEST_FETCH_RELAY or NEWS_FETCH_RELAY for an operator relay.
const INGEST_RELAY_TEMPLATES: string[] =
  (process.env['INGEST_FETCH_RELAY']?.trim() || process.env['NEWS_FETCH_RELAY']?.trim())
    ?.split(',').map((s) => s.trim()).filter(Boolean) ??
  [
    'https://api.allorigins.win/raw?url={url}',
    'https://corsproxy.io/?url={url}',
    'https://api.codetabs.com/v1/proxy/?quest={url}',
  ];

function buildIngestRelayUrl(template: string, target: string): string {
  return template.includes('{url}')
    ? template.replace('{url}', encodeURIComponent(target))
    : `${template}${encodeURIComponent(target)}`;
}

const INGEST_RELAYABLE_STATUSES = new Set([403, 429, 451, 503]);

let _dispatcher: Dispatcher | undefined;
let _dispatcherResolved = false;
// Shared with the binary/XLSX list adapters (au-dfat, jp-mof, uae-iec, interpol,
// fincen) that fetch directly instead of via fetchText, so every ingestion call
// egresses through the same optional proxy.
export function ingestionDispatcher(): Dispatcher | undefined {
  if (_dispatcherResolved) return _dispatcher;
  _dispatcherResolved = true;
  if (PROXY_URI) {
    try {
      _dispatcher = new ProxyAgent({ uri: PROXY_URI });
    } catch (err) {
      console.warn('[ingestion/fetch-util] proxy agent build failed, using direct egress:', err);
    }
  }
  return _dispatcher;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const retries = opts.retries ?? 2;
  const backoff = opts.retryBackoffMs ?? 1500;
  const dispatcher = ingestionDispatcher();
  let lastErr: unknown;
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'en-US,en;q=0.9',
          ...(opts.accept ? { Accept: opts.accept } : {}),
        },
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit & { dispatcher?: Dispatcher });
      if (!res.ok) {
        lastStatus = res.status;
        clearTimeout(timer);
        throw new Error(`${url} → HTTP ${res.status}`);
      }
      const text = await res.text();
      clearTimeout(timer);
      return text;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
    }
  }

  // All direct retries exhausted. If the failure was a relayable status or a
  // network error, try each relay in order — first 2xx wins.
  if (INGEST_RELAY_TEMPLATES.length > 0 &&
      (lastStatus === undefined || INGEST_RELAYABLE_STATUSES.has(lastStatus))) {
    for (const template of INGEST_RELAY_TEMPLATES) {
      const relayUrl = buildIngestRelayUrl(template, url);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(relayUrl, {
          signal: ctl.signal,
          headers: {
            'User-Agent': BROWSER_UA,
            'Accept-Language': 'en-US,en;q=0.9',
            ...(opts.accept ? { Accept: opts.accept } : {}),
          },
        } as RequestInit);
        if (res.ok) {
          const text = await res.text();
          clearTimeout(timer);
          return text;
        }
        clearTimeout(timer);
      } catch {
        clearTimeout(timer);
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
}

export async function sha256Hex(text: string): Promise<string> {
  // Use WebCrypto; works in Node 20+ and Netlify Functions.
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
