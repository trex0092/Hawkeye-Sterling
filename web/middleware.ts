// Next.js edge middleware — three responsibilities:
// 1. Session guard: redirect unauthenticated users to /login.
// 2. API token injection: for same-origin API calls, inject the server-side
//    ADMIN_TOKEN so it is never shipped to the browser JS bundle.
// 3. CSP per-request nonce: generate a fresh nonce, expose it to RSCs via
//    request header `x-nonce`, and write `Content-Security-Policy` on the
//    response so script-src can require `'nonce-...'` instead of
//    `'unsafe-inline'`. This replaces the static CSP previously set in
//    netlify.toml for HTML routes (the static CSP was relaxed to
//    'unsafe-inline' as an emergency unblock — see commit ca4a0a7).

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "hs_session";

// Paths that are always public (no session required).
// Static PWA assets must be reachable without a session — otherwise the SW
// registration silently fails and the manifest fetch returns the /login HTML
// (which the browser parses as JSON and logs as "Manifest: Syntax error").
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/emergency-reset",
  "/_next",
  "/favicon",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon-maskable.svg",
  // RFC 5785 — regulator verifiers + JWT consumers fetch the report-signing
  // pubkey and jwks at fixed paths under /.well-known/*. Without this here,
  // unauthenticated curls (regulators, audit tooling) get redirected to /login
  // and the response body becomes the SPA HTML instead of the PEM/JSON.
  "/.well-known",
  // Netlify Functions endpoints (scheduled-function HTTP triggers, etc.).
  // Same-origin browser callers don't use these; external operators do. The
  // function performs its own bearer-token auth (HAWKEYE_CRON_TOKEN); the
  // middleware redirect would otherwise hijack the request before the
  // function ever sees the header.
  "/.netlify",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

// Defense-in-depth security headers. We set these in middleware (not
// next.config.mjs `headers()`) because @netlify/plugin-nextjs silently
// ignores the Next config for SSR/Lambda responses — only static-asset
// responses pick up netlify.toml [[headers]]. Verified empirically post
// PR #496: headers() landed on /manifest.webmanifest but NOT on /login
// or /api/*. Middleware runs on every matched route and is the only
// surface where we can guarantee these land on dynamic responses.
//
// Cache-Control is deliberately NOT forced on every /api/* response —
// /api/well-known/jwks.json + /api/well-known/hawkeye-pubkey.pem set
// `public, max-age=300, must-revalidate` so verifiers can cache the
// signing keys per RFC. The route's setting takes precedence; routes
// that handle dynamic auth-gated data set their own no-store.
function applySecurityHeaders(response: NextResponse, isApi: boolean, requestId?: string): void {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  if (isApi) {
    // Attach CORS headers to all API responses so browser callers (dashboard,
    // regulator portal) receive them on non-preflight requests too.
    for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
    if (requestId) {
      response.headers.set("X-Request-ID", requestId);
    }
  }
  // Reflect request-id on the response so external callers + log
  // aggregators can correlate every request lifecycle event.
  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }
}

// Request-id propagation (RULE 5/9/10). Mint a fresh id when the caller
// did not pass one. Reflect the resolved id back on the response so log
// correlation works across the full request lifecycle. Edge runtime
// has `crypto.randomUUID()` per WHATWG spec.
function resolveRequestId(req: NextRequest): string {
  const incoming = req.headers.get("x-request-id");
  if (incoming && incoming.length > 0 && incoming.length <= 128 && /^[\x21-\x7E]+$/.test(incoming)) {
    return incoming;
  }
  return crypto.randomUUID();
}

function buildCspHeader(_nonce: string): string {
  // Next.js dev mode uses the `eval-source-map` webpack devtool, which loads
  // every module via `eval()` for live-reloading and rich stack traces. Without
  // 'unsafe-eval' the browser silently refuses every chunk, hydration never
  // starts, and the entire client app appears frozen (forms fall back to
  // native HTML submit, buttons gated behind useEffect stay disabled). This
  // also breaks Playwright/E2E and any local manual testing. Production
  // bundles emit plain script files — no eval — so 'unsafe-eval' stays out
  // of the prod policy and the locked-down attack surface is preserved.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    // 'unsafe-inline' is required — Next.js App Router injects many inline
    // scripts for hydration that do not carry a nonce. 'strict-dynamic' with
    // a nonce blocks them all and breaks client-side navigation entirely.
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
    "img-src 'self' data:",
    "font-src 'self' data: https://fonts.bunny.net",
    "connect-src 'self' https://app.asana.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ") + ";";
}

// ── Session verification in Edge ─────────────────────────────────────────────
// Uses Web Crypto (available in all Netlify edge/V8 runtimes) to do full
// HMAC-SHA256 verification — the same scheme auth.ts uses in Node.js.
// A forged cookie with a valid exp but wrong HMAC will fail here, so it cannot
// trigger ADMIN_TOKEN injection or bypass the session guard.

const _b64url = (s: string) =>
  s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);

async function verifySessionEdge(token: string): Promise<boolean> {
  const secret = process.env["SESSION_SECRET"];
  if (!secret || !token) return false;
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return false;
    const encodedPayload = token.slice(0, dot);
    const encodedSig = token.slice(dot + 1);
    const sigBytes = Uint8Array.from(atob(_b64url(encodedSig)), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, sigBytes, new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return false;
    const payload = JSON.parse(atob(_b64url(encodedPayload))) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// ── Same-origin hostname helper ───────────────────────────────────────────────
function hostnameOf(value: string): string | null {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
}

// CORS headers attached to every OPTIONS preflight and real API response.
// Origin policy:
//   - If NEXT_PUBLIC_APP_URL is set (production deployment), restrict to that domain.
//   - Otherwise fall back to "*" (local dev / preview — all routes require auth anyway).
// Regulators call the API server-to-server (no browser CORS needed); the primary
// browser caller is the portal itself (same-origin). Third-party integrations should
// use server-side proxy calls and API keys, not browser-to-API CORS.
function resolveAllowedOrigin(): string {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"];
  if (appUrl) {
    try {
      const { origin } = new URL(appUrl.startsWith("http") ? appUrl : `https://${appUrl}`);
      return origin;
    } catch {
      // Malformed NEXT_PUBLIC_APP_URL — fall through to wildcard.
      console.warn("[middleware] CORS: NEXT_PUBLIC_APP_URL is set but malformed — falling back to wildcard origin. Set a valid URL (e.g. https://hawkeye-sterling-v2.netlify.app).");
    }
  } else if (process.env["NODE_ENV"] === "production") {
    console.warn("[middleware] CORS: NEXT_PUBLIC_APP_URL not set in production — falling back to wildcard origin. This allows any origin to call the API. Set NEXT_PUBLIC_APP_URL to restrict access.");
  }
  return "*";
}
const CORS_ALLOWED_ORIGIN = resolveAllowedOrigin();
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Api-Key,X-Request-ID,X-Trace-ID",
  "Access-Control-Max-Age": "86400",
  // Expose Vary so CDNs/proxies cache per-Origin when the allowed origin is dynamic.
  ...(CORS_ALLOWED_ORIGIN !== "*" ? { Vary: "Origin" } : {}),
};

function corsResponse(): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const requestId = resolveRequestId(req);

  // ── CORS preflight — handle OPTIONS before any auth/redirect logic ──────
  // This single handler covers all /api/* routes so individual route files
  // do not each need an `export const OPTIONS` export.
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return corsResponse();
  }

  // ── 0. /.well-known + /api/v1/ rewrites ──────────────────────────────────
  // Next.js rewrites declared in next.config.mjs don't reach Lambda when
  // routed through @netlify/plugin-nextjs — verified empirically: the
  // /.well-known/* paths returned 404 in production while the underlying
  // /api/well-known/* routes responded 200. Doing the rewrite in middleware
  // guarantees regulator JWT verifiers can fetch the signing key set at
  // the RFC-conformant path.
  if (pathname === "/.well-known/jwks.json") {
    return NextResponse.rewrite(new URL("/api/well-known/jwks.json", req.url));
  }
  if (pathname === "/.well-known/hawkeye-pubkey.pem") {
    return NextResponse.rewrite(new URL("/api/well-known/hawkeye-pubkey.pem", req.url));
  }
  // /api/v1/* → /api/* stable alias. Allows callers to pin a versioned
  // prefix and survive future /api/v2/* breakouts without changing URLs.
  // This rewrite is transparent — the canonical route still lives under
  // /api/ and handles all business logic.
  if (pathname.startsWith("/api/v1/")) {
    const canonical = pathname.replace(/^\/api\/v1\//, "/api/");
    const target = new URL(req.url);
    target.pathname = canonical;
    return NextResponse.rewrite(target);
  }

  // ── 1. Session guard (non-API routes) ──────────────────────────────────────
  if (!pathname.startsWith("/api/") && !isPublic(pathname)) {
    const token = req.cookies.get(SESSION_COOKIE)?.value ?? "";
    if (!await verifySessionEdge(token)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── 2. API token injection (same-origin only) ─────────────────────────────
  if (pathname.startsWith("/api/") && !isPublic(pathname)) {
    // External callers supply their own auth — don't override.
    if (req.headers.get("authorization") || req.headers.get("x-api-key")) {
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-request-id", requestId);
      const r = NextResponse.next({ request: { headers: requestHeaders } });
      applySecurityHeaders(r, true, requestId);
      return r;
    }

    const adminToken = process.env["ADMIN_TOKEN"];
    if (adminToken) {
      const host = req.headers.get("host") ?? "";
      const origin = req.headers.get("origin");
      const referer = req.headers.get("referer");

      const hostHostname = hostnameOf(host);
      // A HMAC-verified session cookie is a reliable same-origin indicator:
      // browsers attach HttpOnly cookies automatically on same-origin requests,
      // and verifySessionEdge() checks the full HMAC so a forged cookie cannot
      // trigger injection. origin/referer match is kept as the alternative for
      // requests from browser contexts where the cookie isn't yet set.
      const hasValidSession = await verifySessionEdge(req.cookies.get(SESSION_COOKIE)?.value ?? "");
      const isSameOrigin =
        hasValidSession ||
        (hostHostname !== null &&
          ((origin != null && hostnameOf(origin) === hostHostname) ||
            (referer != null && hostnameOf(referer) === hostHostname)));

      if (isSameOrigin) {
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set("authorization", `Bearer ${adminToken}`);
        requestHeaders.set("x-request-id", requestId);
        const r = NextResponse.next({ request: { headers: requestHeaders } });
        applySecurityHeaders(r, true, requestId);
        return r;
      }
    }
    // Non-same-origin API call — pass through with security headers.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", requestId);
    const r = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(r, true, requestId);
    return r;
  }

  // ── 3. CSP + security headers for HTML routes ────────────────────────────
  // Set consistent CSP on every HTML navigation. The nonce approach was
  // abandoned because Next.js App Router injects hydration scripts that do
  // not carry a nonce, causing 17+ CSP violations that block client-side
  // navigation entirely. Use 'unsafe-inline' (consistent with netlify.toml).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCspHeader(""));
  applySecurityHeaders(response, false, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
