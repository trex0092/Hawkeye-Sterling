// Hawkeye Sterling — per-request enforcement middleware.
//
// Every paid API route calls `enforce(req)`; it:
//   1. resolves the API key from Authorization / x-api-key / ?api_key
//   2. validates + increments monthly usage
//   3. applies the tier's per-second and per-minute rate limits
// If any check fails, returns a NextResponse to short-circuit the route.
//
// If NO key is present AND the route is public-tier compatible, the
// request is allowed through against the `free` tier limits — so the
// sandbox keeps working for anonymous testing without a key.

import { NextResponse } from "next/server";
import { extractKey, validateAndConsume } from "./api-keys";
import { consumeRateLimit, rateLimitHeaders } from "./rate-limit";
import { tierFor } from "@/lib/data/tiers";
import { createHash } from "node:crypto";

export interface EnforcementAllow {
  ok: true;
  tier: ReturnType<typeof tierFor>;
  keyId: string;
  remainingMonthly: number | null;
  headers: Record<string, string>;
}

export type EnforcementResult = EnforcementAllow | { ok: false; response: NextResponse };

export async function enforce(req: Request): Promise<EnforcementResult> {
  const plaintext = extractKey(req);
  const anonymous = plaintext === null;

  let keyId = "anonymous";
  let tierId = "free";
  let remainingMonthly: number | null = null;

  if (!anonymous) {
    const check = await validateAndConsume(plaintext);
    if (!check.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error:
              check.reason === "quota_exceeded"
                ? "monthly quota exceeded"
                : check.reason === "revoked"
                  ? "API key revoked"
                  : "invalid API key",
          },
          {
            status: check.reason === "quota_exceeded" ? 429 : 401,
            headers: check.tier ? rateLimitHeaders({
              allowed: false,
              retryAfterSec: 60,
              remainingSecond: 0,
              remainingMinute: 0,
              tier: check.tier,
            }) : {},
          },
        ),
      };
    }
    keyId = check.record?.id ?? "unknown";
    tierId = check.record?.tier ?? "free";
    remainingMonthly = check.remainingMonthly ?? null;
  } else {
    // Bucket anonymous callers by their remote IP (SHA-hashed for PII
    // hygiene) so one burst-happy guest doesn't starve the rest.
    const fwd = req.headers.get("x-forwarded-for");
    const ip = (fwd ?? "anonymous").split(",")[0]?.trim() ?? "anonymous";
    keyId = `anon_${createHash("sha256").update(ip).digest("hex").slice(0, 12)}`;
  }

  const rl = await consumeRateLimit(keyId, tierId);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "rate limit exceeded", retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: rateLimitHeaders(rl) },
      ),
    };
  }

  return {
    ok: true,
    tier: rl.tier,
    keyId,
    remainingMonthly,
    headers: {
      ...rateLimitHeaders(rl),
      ...(remainingMonthly !== null
        ? { "x-quota-remaining-monthly": String(remainingMonthly) }
        : {}),
    },
  };
}
