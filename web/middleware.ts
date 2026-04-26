// Next.js edge middleware — injects the server-side ADMIN_TOKEN for
// same-origin portal requests so the token is never shipped to the browser.
//
// Logic:
//   - Only fires for /api/* paths.
//   - If the caller already supplies Authorization or X-Api-Key, pass through
//     untouched so external API clients are not affected.
//   - For requests with a same-origin Origin/Referer (i.e. the portal UI),
//     or for SSR-initiated requests (no origin header at all), inject
//     `Authorization: Bearer <ADMIN_TOKEN>` server-side.
//
// This replaces the NEXT_PUBLIC_ADMIN_TOKEN pattern that baked the credential
// into the browser JS bundle.

import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest): NextResponse {
  // Only relevant for API routes.
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // External callers supply their own auth — don't override.
  if (req.headers.get("authorization") || req.headers.get("x-api-key")) {
    return NextResponse.next();
  }

  const adminToken = process.env["ADMIN_TOKEN"];
  if (!adminToken) return NextResponse.next();

  // Determine if the request originates from the same host (portal UI or SSR).
  const host = req.headers.get("host") ?? "";
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  const isSameOrigin =
    (!origin && !referer) || // SSR / server-action with no browser origin
    (origin != null && origin.includes(host)) ||
    (referer != null && referer.includes(host));

  if (!isSameOrigin) return NextResponse.next();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("authorization", `Bearer ${adminToken}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/api/:path*",
};
