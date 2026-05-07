// Next.js edge middleware — two responsibilities:
// 1. Session guard: redirect unauthenticated users to /login.
// 2. API token injection: for same-origin API calls, inject the server-side
//    ADMIN_TOKEN so it is never shipped to the browser JS bundle.

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "hs_session";

// Paths that are always public (no session required).
const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/auth/logout", "/_next", "/favicon"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

// ── Session verification in Edge ─────────────────────────────────────────────
// The Edge runtime is only a UX gate, not a security boundary. Full HMAC
// verification happens in auth.ts (Node.js runtime) on every API call and in
// /api/auth/me — so spoofing the cookie only buys an attacker the (empty) app
// shell; they cannot load any real data.
//
// Earlier versions tried to decode the token in Edge to check expiry. That
// produced repeated redirect-loop bugs (Edge atob/JSON.parse silently throws
// on certain runtimes, and the catch block then redirected the user back to
// /login). We now do the bare minimum here: confirm the cookie exists and has
// the expected `<encoded>.<sig>` shape. Expiry is enforced when any API call
// is made, at which point the user is forced to re-auth via the API 401.

function looksLikeSessionToken(token: string): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  // Require both halves to be non-empty.
  return dot > 0 && dot < token.length - 1;
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
    if (!looksLikeSessionToken(token)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = token ? "?__hs_dbg=malformed" : "?__hs_dbg=no-cookie";
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
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
