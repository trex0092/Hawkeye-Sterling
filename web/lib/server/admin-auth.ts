// Shared admin-auth guard for privileged endpoints (key management, GDPR).
// Returns null on success; returns a NextResponse to short-circuit on failure.
//
// Fail-closed: if ADMIN_TOKEN is not configured the endpoint returns 503
// rather than opening access. Set a high-entropy value (e.g. `openssl rand
// -hex 32`) in Netlify → Site settings → Environment variables.

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

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
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "ADMIN_TOKEN not configured. Set it in Netlify environment variables.",
      },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!constantTimeEq(token, expected)) {
    return NextResponse.json(
      { ok: false, error: "Admin authorization required." },
      { status: 401 },
    );
  }
  return null;
}
