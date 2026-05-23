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
import { extractKey, validateAndConsume, type ApiKeyRecord } from "./api-keys";
import { getJson } from "./store";
import { consumeRateLimit, rateLimitHeaders } from "./rate-limit";
import { tierFor } from "@/lib/data/tiers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { looksLikeJwt, verifyJwt } from "./jwt";
import { log } from "./logger";

// Memoized HMAC key for IP anonymization. Derived once per deployment from
// SESSION_SECRET so that the same IP always produces the same hash within a
// deployment but cannot be reversed via a rainbow table of 4B IPv4 addresses.
// Falls back to a fixed dev string when SESSION_SECRET is absent so that dev
// behaviour is explicit rather than silently using bare SHA-256.
let _anonIpKey: string | undefined;
function anonIpKey(): string {
  if (_anonIpKey) return _anonIpKey;
  const secret = process.env["SESSION_SECRET"] ?? "hawkeye-ip-anon-dev";
  _anonIpKey = createHmac("sha256", secret).update("ip-anon-v1").digest("hex");
  return _anonIpKey;
}

/** Internal: emit a structured auth-failure log entry for every enforcement rejection. */
function logAuthFailure(
  req: Request,
  reason: string,
  status: number,
  extra?: Record<string, unknown>,
): void {
  const fwd = req.headers.get("x-forwarded-for");
  // Use the last (proxy-appended) IP for consistency with the rate-limit
  // bucketing below — avoids logging a different IP than the one being limited.
  const ips = fwd ? fwd.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const ip = ips.length > 0 ? (ips[ips.length - 1] ?? "unknown") : "unknown";
  const requestId = req.headers.get("x-request-id") ?? "unset";
  const route = new URL(req.url).pathname;
  log({
    level: "warn",
    route,
    event: "auth.failure",
    detail: reason,
    status,
    requestId,
    // IP HMAC-hashed for PII hygiene — raw IP not logged.
    // HMAC-SHA256 with a per-deployment key prevents rainbow-table reversal
    // of the ~4B IPv4 address space that plain SHA-256 would allow.
    ipHash: createHmac("sha256", anonIpKey()).update(ip ?? "").digest("hex").slice(0, 16),
    method: req.method,
    ...extra,
  });
}

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
  opts: { requireAuth?: boolean; requireJsonBody?: boolean } = {},
): Promise<EnforcementResult> {
  // Per-property defaulting so callers can override one option without
  // accidentally clearing the other. The previous all-or-nothing default
  // `opts = { requireAuth: true }` meant `enforce(req, { requireJsonBody: false })`
  // silently turned off auth — caught when the EOCN multipart upload route
  // tripped exactly that footgun. Always merge defaults at the property level.
  const requireAuth = opts.requireAuth ?? true;
  const requireJsonBody = opts.requireJsonBody ?? true;

  // Content-Type guard — for JSON-body methods, callers must declare
  // application/json so the handler can safely call req.json().
  // Skip GET/HEAD/DELETE/OPTIONS which have no body by convention.
  // Set requireJsonBody: false to bypass (e.g. multipart upload routes).
  const bodyMethod = ["POST", "PUT", "PATCH"].includes(req.method);
  const requireJson = requireJsonBody && bodyMethod;
  if (requireJson) {
    const ct = req.headers.get("content-type") ?? "";
    // Determine body presence via content-length only. Netlify's reverse proxy
    // strips content-length and adds transfer-encoding: chunked on all proxied
    // POST requests, even body-less ones — relying on transfer-encoding alone
    // produces false 415s for legitimate body-less POSTs from the UI.
    const cl = req.headers.get("content-length");
    const hasBody = cl !== null && parseInt(cl, 10) > 0;
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
      logAuthFailure(req, "rate_limit_exceeded:portal_admin", 429);
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

  if (anonymous && requireAuth) {
    logAuthFailure(req, "anonymous_request_rejected", 401);
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
      logAuthFailure(req, `invalid_jwt:${v.reason ?? "unknown"}`, 401);
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: `invalid JWT: ${v.reason ?? "unknown"}` },
          { status: 401 },
        ),
      };
    }
    if (!v.payload.sub) {
      logAuthFailure(req, "invalid_jwt:missing_sub", 401);
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "invalid JWT: missing sub claim" },
          { status: 401 },
        ),
      };
    }
    keyId = v.payload.sub;
    // Look up live record to get current tier — don't trust JWT-embedded tier claim.
    // A JWT holder whose tier was downgraded must get the new (lower) rate limits.
    const liveRecord = await getJson<ApiKeyRecord>(`keys/${keyId}`).catch(() => null);
    tierId = liveRecord?.tier ?? v.payload.tier ?? "free";
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
      const failReason =
        check.reason === "quota_exceeded"
          ? "monthly quota exceeded"
          : check.reason === "revoked"
            ? "API key revoked"
            : "invalid API key";
      logAuthFailure(req, `api_key_${check.reason ?? "invalid"}`, check.reason === "quota_exceeded" ? 429 : 401, { keyIdPrefix: plaintext.slice(0, 8) });
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: failReason },
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
    // Bucket anonymous callers by their remote IP (SHA-hashed for PII hygiene)
    // so one burst-heavy guest doesn't starve the rest.
    //
    // SECURITY: Use the LAST value in x-forwarded-for, not the first.
    // The last IP is appended by our trusted reverse proxy (Netlify CDN) and
    // cannot be forged by the client — the first value is client-supplied and
    // can be spoofed to an arbitrary IP, bypassing per-IP rate limiting.
    // See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For
    const fwd = req.headers.get("x-forwarded-for");
    const ips = fwd ? fwd.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const ip = ips.length > 0 ? (ips[ips.length - 1] ?? "anonymous") : "anonymous";
    keyId = `anon_${createHmac("sha256", anonIpKey()).update(ip).digest("hex").slice(0, 12)}`;
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
