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

// ── Session verification in Edge (pure string/HMAC — no Node crypto) ─────────
// We replicate the HMAC check from lib/server/auth.ts using the SubtleCrypto
// API available in the Edge runtime.

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function isValidSession(token: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    // Fail-closed: a missing SESSION_SECRET is a misconfiguration, not a
    // reason to allow sessions signed with a guessable fallback.
    return false;
  }
  const expected = await hmacSha256(secret, encoded);
  if (expected !== sig) return false;
  try {
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
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

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // ── 1. Session guard (non-API routes) ──────────────────────────────────────
  if (!pathname.startsWith("/api/") && !isPublic(pathname)) {
    const token = req.cookies.get(SESSION_COOKIE)?.value ?? "";
    const valid = token ? await isValidSession(token) : false;
    if (!valid) {
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
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
