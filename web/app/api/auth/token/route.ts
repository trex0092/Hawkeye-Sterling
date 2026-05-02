// POST /api/auth/token
// Exchange a long-lived API key for a short-lived bearer JWT.
// Body: none (key is read from Authorization or X-Api-Key).
// Response: { token, expSec, tier }.
//
// The JWT carries { sub: keyId, tier, iat, exp } so subsequent calls
// avoid the per-request blob-store roundtrip that validateAndConsume()
// incurs. Token TTL defaults to 600s; clients should refresh proactively.
//
// Quota: this endpoint does NOT consume monthly quota — it's a bearer
// upgrade, not a screening call. Rate-limit only.

import { NextResponse } from "next/server";
import { extractKey, validateAndConsume } from "@/lib/server/api-keys";
import { issueJwt } from "@/lib/server/jwt";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(req: Request): Promise<NextResponse> {
  const plaintext = extractKey(req);
  if (!plaintext) {
    return NextResponse.json(
      { ok: false, error: "API key required. Supply Authorization: Bearer or X-Api-Key." },
      { status: 401 },
    );
  }

  const check = await validateAndConsume(plaintext);
  if (!check.ok || !check.record) {
    return NextResponse.json(
      {
        ok: false,
        error:
          check.reason === "quota_exceeded"
            ? "monthly quota exceeded"
            : check.reason === "revoked"
              ? "API key revoked"
              : "invalid API key",
      },
      { status: check.reason === "quota_exceeded" ? 429 : 401 },
    );
  }

  // Apply per-key rate limit so a token-mint loop can't drain blob-store
  // quota even though no monthly counter is incremented here.
  const rl = await consumeRateLimit(check.record.id, check.record.tier);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let issued: { token: string; expSec: number };
  try {
    issued = issueJwt(
      { sub: check.record.id, tier: check.record.tier },
      { iss: "hawkeye-sterling" },
    );
  } catch (err) {
    console.error("[auth/token]", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      offline: true,
      token: null,
      note: `JWT signing unavailable: ${err instanceof Error ? err.message : "JWT_SECRET may not be configured"}`,
    }, { headers: rateLimitHeaders(rl) });
  }

  return NextResponse.json(
    {
      ok: true,
      token: issued.token,
      tokenType: "Bearer",
      expSec: issued.expSec,
      expiresIn: issued.expSec - Math.floor(Date.now() / 1000),
      tier: check.record.tier,
    },
    { headers: rateLimitHeaders(rl) },
  );
}
