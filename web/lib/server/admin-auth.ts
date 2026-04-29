// Shared admin-auth guard for privileged endpoints (key management, GDPR).
// Returns null on success; returns a NextResponse to short-circuit on failure.
//
// Fail-closed: if ADMIN_TOKEN is not configured the endpoint returns 503
// rather than opening access. Set a high-entropy value (e.g. `openssl rand
// -hex 32`) in Netlify → Site settings → Environment variables.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

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
  const enc = new TextEncoder();
  const expBuf = enc.encode(expected);
  const tokBuf = enc.encode(token);
  const match = token.length > 0 && expBuf.byteLength === tokBuf.byteLength && timingSafeEqual(expBuf, tokBuf);
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "Admin authorization required." },
      { status: 401 },
    );
  }
  return null;
}
