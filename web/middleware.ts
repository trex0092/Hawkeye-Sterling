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

function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets Next.js's nonced loader script load further
    // chunks without requiring every chunk URL in the policy. Falls back
    // to 'self' on browsers that don't support strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://app.asana.com https://api.anthropic.com",
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
    // External callers supply their own auth — don't override.
    if (req.headers.get("authorization") || req.headers.get("x-api-key")) {
      return NextResponse.next();
    }

    const adminToken = process.env["ADMIN_TOKEN"];
    if (adminToken) {
      const host = req.headers.get("host") ?? "";
      const origin = req.headers.get("origin");
      const referer = req.headers.get("referer");

      const hostHostname = hostnameOf(host);
      const isSameOrigin =
        hostHostname !== null &&
        ((origin != null && hostnameOf(origin) === hostHostname) ||
          (referer != null && hostnameOf(referer) === hostHostname));

      if (isSameOrigin) {
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set("authorization", `Bearer ${adminToken}`);
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
    }
    // Non-same-origin API call — pass through untouched (no CSP needed
    // on API JSON responses; the static netlify.toml header still applies
    // as a defence-in-depth baseline).
    return NextResponse.next();
  }

  // ── 3. CSP nonce for HTML routes ──────────────────────────────────────────
  // Only emit the nonced CSP for navigations to actual pages, not for
  // API routes (which don't render HTML). The nonce is set on the *request*
  // headers so React Server Components in app/layout.tsx can read it via
  // `headers().get('x-nonce')` and pass it as the `nonce` prop on inline
  // <script> tags. The CSP is set on the *response* headers and overrides
  // the static one from netlify.toml for HTML routes.
  const nonce = generateNonce();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
