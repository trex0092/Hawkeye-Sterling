// Hawkeye Sterling — per-request enforcement middleware.
//
// Every paid API route calls `enforce(req)`; it:
//   1. resolves the API key from Authorization / x-api-key
//   2. validates + increments monthly usage
//   3. applies the tier's per-second and per-minute rate limits
// If any check fails, returns a NextResponse to short-circuit the route.
//
// If NO key is present AND requireAuth is false (default), the request is
// allowed through on the `free` tier — so the sandbox keeps working for
// anonymous testing without a key.

import { NextResponse } from "next/server";
import { extractKey, validateAndConsume } from "./api-keys";
import type { ApiKeyRecord } from "./api-keys";
import { consumeRateLimit, rateLimitHeaders } from "./rate-limit";
import { tierFor } from "@/lib/data/tiers";
import { createHash } from "node:crypto";

export interface EnforcementAllow {
  ok: true;
  tier: ReturnType<typeof tierFor>;
  keyId: string;
  record: ApiKeyRecord | null; // null when the caller is anonymous
  remainingMonthly: number | null;
  headers: Record<string, string>;
}

export type EnforcementResult = EnforcementAllow | { ok: false; response: NextResponse };

export async function enforce(
  req: Request,
  opts: { requireAuth?: boolean } = {},
): Promise<EnforcementResult> {
  const plaintext = extractKey(req);
  const anonymous = plaintext === null;

  if (anonymous && opts.requireAuth) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "API key required. Supply Authorization: Bearer or X-Api-Key." },
        { status: 401 },
      ),
    };
  }

  let keyId = "anonymous";
  let tierId = "free";
  let remainingMonthly: number | null = null;
  let record: ApiKeyRecord | null = null;

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
            headers: check.tier
              ? rateLimitHeaders({
                  allowed: false,
                  retryAfterSec: 60,
                  remainingSecond: 0,
                  remainingMinute: 0,
                  tier: check.tier,
                })
              : {},
          },
        ),
      };
    }
    keyId = check.record?.id ?? "unknown";
    tierId = check.record?.tier ?? "free";
    remainingMonthly = check.remainingMonthly ?? null;
    record = check.record ?? null;
  } else {
    // Bucket anonymous callers by their remote IP (SHA-hashed for PII
    // hygiene) so one burst-heavy guest doesn't starve the rest.
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
    record,
    remainingMonthly,
    headers: {
      ...rateLimitHeaders(rl),
      ...(remainingMonthly !== null
        ? { "x-quota-remaining-monthly": String(remainingMonthly) }
        : {}),
    },
  };
}
