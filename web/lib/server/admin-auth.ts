// Shared admin-auth guard for privileged endpoints (key management, GDPR).
// Returns null on success; returns a NextResponse to short-circuit on failure.
//
// Two authentication paths (tried in order):
//   1. ADMIN_TOKEN bearer token injected by web/middleware.ts for same-origin portal
//      requests, or supplied directly by external operator tooling.
//   2. Session-cookie fallback: a valid hs_session cookie issued by
//      /api/auth/login.  Mirrors the session-cookie path added to enforce.ts
//      (commit e8c9536f) so that adminAuth() routes are equally robust when
//      the proxy's isSameOrigin detection cannot inject the ADMIN_TOKEN
//      (e.g. GET requests without an Origin header, missing env vars, etc.).

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifySession, SESSION_COOKIE } from "./auth";

// Normalize variable-length strings to fixed-length HMAC digests before
// constant-time comparison. The early-exit `byteLength === byteLength` check
// in timingSafeEqual() would otherwise leak the exact byte length of
// ADMIN_TOKEN via timing (an attacker submits tokens of increasing length
// and watches for the first response that takes longer than empty-string
// rejection). Both values are always hashed so comparison is always 32 bytes.
const COMPARE_KEY = Buffer.from("hawkeye-admin-auth-compare-v1", "utf8");
function constantTimeEq(a: string, b: string): boolean {
  const ha = createHmac("sha256", COMPARE_KEY).update(a).digest();
  const hb = createHmac("sha256", COMPARE_KEY).update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function adminAuth(req: Request): NextResponse | null {
  // Path 1: ADMIN_TOKEN via Authorization header.
  // Injected server-side by web/middleware.ts for same-origin portal requests;
  // also used directly by external operator tooling and cron jobs.
  const expected = process.env["ADMIN_TOKEN"];
  if (expected) {
    const auth = req.headers.get("authorization");
    const token = auth?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (constantTimeEq(token, expected)) return null;
  }

  // Path 2: Session-cookie fallback.
  // Portal API calls that arrive without an Authorization header (e.g. when
  // isSameOrigin detection in middleware.ts skips ADMIN_TOKEN injection) can still
  // authenticate via the HMAC-signed hs_session cookie issued at login.
  // verifySession() is synchronous; wrapped in try/catch so a missing or
  // too-short SESSION_SECRET does not throw past the caller.
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const sessionToken = cookieHeader
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1) ?? "";
    if (sessionToken) {
      const payload = verifySession(sessionToken);
      // Only portal sessions with admin-level roles bypass the ADMIN_TOKEN gate.
      // Roles such as "mlro", "co", "management" must NOT gain access to admin
      // routes (key issuance, tenant management, RBAC, regulator token issuance).
      if (payload && (payload.role === "admin" || payload.role === "compliance_admin")) return null;
    }
  } catch { /* SESSION_SECRET missing or too short — fall through to 401 */ }

  return NextResponse.json(
    { ok: false, error: "Admin authorization required." },
    { status: 401 },
  );
}
