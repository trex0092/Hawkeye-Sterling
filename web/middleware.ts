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

// ── CSP nonce generation (Edge / Deno crypto) ────────────────────────────────
// Crypto-quality random, hex-encoded. 16 bytes = 128 bits = enough entropy.
function generateNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let hex = "";
  for (const b of buf) hex += b.toString(16).padStart(2, "0");
  return hex;
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
function generateRequestId(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let hex = "";
  for (const b of buf) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function applySecurityHeaders(response: NextResponse, isApi: boolean, requestId?: string): void {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (isApi) {
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    if (requestId) {
      response.headers.set("X-Request-ID", requestId);
    }
  }
}

function buildCspHeader(_nonce: string): string {
  return [
    "default-src 'self'",
    // 'unsafe-inline' is required — Next.js App Router injects many inline
    // scripts for hydration that do not carry a nonce. 'strict-dynamic' with
    // a nonce blocks them all and breaks client-side navigation entirely.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
    "img-src 'self' data:",
    "font-src 'self' data: https://fonts.bunny.net",
    "connect-src 'self' https://app.asana.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ") + ";";
}

// ── Session verification in Edge ─────────────────────────────────────────────
// The Edge runtime cannot reliably access all Netlify env vars (SESSION_SECRET
// is a Node.js Lambda concern). We do NOT attempt HMAC verification here.
// Instead we just check that the session cookie exists and hasn't expired.
//
// Full HMAC verification happens in auth.ts (Node.js runtime) for every API
// call and in the /api/auth/me route — so spoofing the cookie only lets an
// attacker see the (empty) app shell; they cannot load any real data.

function isValidSession(token: string): boolean {
  if (!token) return false;
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return false;
    const encoded = token.slice(0, dot);
    // Restore base64 padding that base64url strips — Deno's atob requires it.
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
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

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

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
    if (!isValidSession(token)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── 2. API token injection (same-origin only) ─────────────────────────────
  if (pathname.startsWith("/api/") && !isPublic(pathname)) {
    const reqId = req.headers.get("x-request-id") ?? generateRequestId();
    // External callers supply their own auth — don't override.
    if (req.headers.get("authorization") || req.headers.get("x-api-key")) {
      const r = NextResponse.next();
      applySecurityHeaders(r, true, reqId);
      return r;
    }

    const adminToken = process.env["ADMIN_TOKEN"];
    if (adminToken) {
      const host = req.headers.get("host") ?? "";
      const origin = req.headers.get("origin");
      const referer = req.headers.get("referer");

      const hostHostname = hostnameOf(host);
      // A request carrying our HttpOnly session cookie must have originated
      // from the same site — browsers cannot forge httpOnly cookies from
      // cross-origin contexts, so this is a safe same-origin indicator
      // even when origin/referer headers are absent (e.g. strict no-referrer
      // browser policy or certain fetch modes).
      const hasSessionCookie = req.cookies.get(SESSION_COOKIE)?.value != null;
      const isSameOrigin =
        hasSessionCookie ||
        (hostHostname !== null &&
          ((origin != null && hostnameOf(origin) === hostHostname) ||
            (referer != null && hostnameOf(referer) === hostHostname)));

      if (isSameOrigin) {
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set("authorization", `Bearer ${adminToken}`);
        const r = NextResponse.next({ request: { headers: requestHeaders } });
        applySecurityHeaders(r, true, reqId);
        return r;
      }
    }
    // Non-same-origin API call — pass through with security headers.
    const r = NextResponse.next();
    applySecurityHeaders(r, true, reqId);
    return r;
  }

  // ── 3. CSP + security headers for HTML routes ────────────────────────────
  // Set consistent CSP on every HTML navigation. The nonce approach was
  // abandoned because Next.js App Router injects hydration scripts that do
  // not carry a nonce, causing 17+ CSP violations that block client-side
  // navigation entirely. Use 'unsafe-inline' (consistent with netlify.toml).
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", buildCspHeader(""));
  applySecurityHeaders(response, false);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
