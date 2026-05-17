// Hawkeye Sterling — per-request enforcement middleware.
//
// Every paid API route calls `enforce(req)`; it:
//   1. resolves the API key from Authorization / x-api-key
//   2. validates + increments monthly usage
//   3. applies the tier's per-second and per-minute rate limits
// If any check fails, returns a NextResponse to short-circuit the route.
//
// Default is FAIL-CLOSED: anonymous callers get a 401 unless the route opts
// in to the free-tier sandbox by passing `{ requireAuth: false }`. This
// closes the prior bypass where 300+ compliance routes (super-brain, mcp,
// screening/run, etc.) silently accepted unauthenticated traffic because
// they used the default-permissive `enforce(req)` call form.
//
// To deliberately allow anonymous traffic on a sandbox/demo route:
//   const gate = await enforce(req, { requireAuth: false });

import { NextResponse } from "next/server";
import { extractKey, validateAndConsume } from "./api-keys";
import type { ApiKeyRecord } from "./api-keys";
import { consumeRateLimit, rateLimitHeaders } from "./rate-limit";
import { tierFor } from "@/lib/data/tiers";
import { createHash, timingSafeEqual } from "node:crypto";
import { looksLikeJwt, verifyJwt } from "./jwt";

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
  opts: { requireAuth?: boolean; requireJsonBody?: boolean } = { requireAuth: true },
): Promise<EnforcementResult> {
  // Content-Type guard — for JSON-body methods, callers must declare
  // application/json so the handler can safely call req.json().
  // Skip GET/HEAD/DELETE/OPTIONS which have no body by convention.
  // Set requireJsonBody: false to bypass (e.g. multipart upload routes).
  const bodyMethod = ["POST", "PUT", "PATCH"].includes(req.method);
  const requireJson = opts.requireJsonBody !== false && bodyMethod;
  if (requireJson) {
    const ct = req.headers.get("content-type") ?? "";
    const hasBody =
      req.headers.has("content-length")
        ? (parseInt(req.headers.get("content-length") ?? "0", 10) > 0)
        : req.headers.has("transfer-encoding");
    if (hasBody && !ct.toLowerCase().includes("application/json")) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Content-Type: application/json required for POST/PUT/PATCH requests with a body", code: "UNSUPPORTED_MEDIA_TYPE" },
          { status: 415 },
        ),
      };
    }
  }
  const plaintext = extractKey(req);
  const anonymous = plaintext === null;

  // Portal bypass: if the caller presents ADMIN_TOKEN (injected server-side
  // by web/middleware.ts for same-origin portal requests — never exposed in
  // the browser bundle) skip API-key lookup and grant enterprise-tier rate
  // limits without consuming monthly quota.
  const adminToken = process.env["ADMIN_TOKEN"];
  const adminMatch = adminToken && plaintext !== null && (() => {
    const enc = new TextEncoder();
    const a = enc.encode(adminToken);
    const b = enc.encode(plaintext);
    return a.byteLength === b.byteLength && timingSafeEqual(a, b);
  })();
  if (adminMatch) {
    const rl = await consumeRateLimit("portal_admin", "enterprise");
    if (!rl.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "rate limit exceeded", retryAfterSec: rl.retryAfterSec },
          { status: 429, headers: rateLimitHeaders(rl) },
        ),
      };
    }
    return { ok: true, tier: rl.tier, keyId: "portal_admin", record: null, remainingMonthly: null, headers: rateLimitHeaders(rl) };
  }

  // Cron bypass: SANCTIONS_CRON_TOKEN allows internal scheduled functions
  // (health-monitor, sanctions-daily-report, refresh-lists) to call protected
  // API routes without consuming an API key quota. Same constant-time compare.
  const cronToken = process.env["SANCTIONS_CRON_TOKEN"];
  const cronMatch = cronToken && plaintext !== null && (() => {
    const enc = new TextEncoder();
    const a = enc.encode(cronToken);
    const b = enc.encode(plaintext);
    return a.byteLength === b.byteLength && timingSafeEqual(a, b);
  })();
  if (cronMatch) {
    const rl = await consumeRateLimit("cron_internal", "enterprise");
    if (!rl.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "rate limit exceeded", retryAfterSec: rl.retryAfterSec },
          { status: 429, headers: rateLimitHeaders(rl) },
        ),
      };
    }
    return { ok: true, tier: rl.tier, keyId: "cron_internal", record: null, remainingMonthly: null, headers: rateLimitHeaders(rl) };
  }

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

  // JWT path: caller exchanged an API key for a short-lived bearer JWT
  // via /api/auth/token. Verify the signature + expiry and use the
  // embedded { sub, tier } as the rate-limit identity. The monthly
  // quota counter is intentionally NOT decremented here — it was
  // decremented at issuance time. This keeps a hot loop on a token
  // from triple-spending a key's quota.
  if (!anonymous && looksLikeJwt(plaintext)) {
    const v = verifyJwt(plaintext);
    if (!v.ok || !v.payload) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: `invalid JWT: ${v.reason ?? "unknown"}` },
          { status: 401 },
        ),
      };
    }
    if (!v.payload.sub) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "invalid JWT: missing sub claim" },
          { status: 401 },
        ),
      };
    }
    keyId = v.payload.sub;
    tierId = v.payload.tier;
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
      record: null,
      remainingMonthly: null,
      headers: rateLimitHeaders(rl),
    };
  }

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
                  retryAfterSec: check.reason === "quota_exceeded" ? 2_592_000 : 60,
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
