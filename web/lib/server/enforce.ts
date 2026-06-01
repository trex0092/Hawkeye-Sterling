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
import { verifySession, SESSION_COOKIE } from "./auth";
import { log } from "./logger";
import { startSpan, SpanStatus } from "./tracer";
import { incrementCounter } from "./metrics-store";
import { writeAuditChainEntry } from "./audit-chain";

// Memoized HMAC key for IP anonymization. Derived once per deployment from
// SESSION_SECRET so that the same IP always produces the same hash within a
// deployment but cannot be reversed via a rainbow table of 4B IPv4 addresses.
// Falls back to a fixed dev string when SESSION_SECRET is absent so that dev
// behaviour is explicit rather than silently using bare SHA-256.
// HMAC normalization key for constant-time token comparisons (ADMIN_TOKEN,
// SANCTIONS_CRON_TOKEN). Produces fixed 32-byte digests so timingSafeEqual
// never short-circuits on byte-length mismatch — avoids leaking token length.
const ENFORCE_COMPARE_KEY = Buffer.from("hawkeye-enforce-token-v1", "utf8");

// Stable placeholder used wherever an IP or key is unavailable — prevents
// rate-limit bucket collisions between different code paths.
const UNKNOWN_IP = "anonymous-ip";

let _anonIpKey: string | undefined;
export function anonIpKey(): string {
  if (_anonIpKey) return _anonIpKey;
  const secret = process.env["SESSION_SECRET"] ?? "hawkeye-ip-anon-dev";
  _anonIpKey = createHmac("sha256", secret).update("ip-anon-v1").digest("hex");
  return _anonIpKey;
}

// F-14: Auth failure reasons that are high-severity enough to warrant a
// tamper-evident chain entry. Mutable-log rotation cannot be relied upon for
// forensic reconstruction of credential-stuffing or key-revocation evasion.
const HIGH_SEVERITY_AUTH_REASONS = new Set([
  "jwt_key_revoked",
  "anonymous_request_rejected",
  "invalid_jwt:bad_signature",
  "invalid_jwt:alg_mismatch",
]);

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
  const ip = ips.length > 0 ? (ips[ips.length - 1] ?? UNKNOWN_IP) : UNKNOWN_IP;
  const requestId = req.headers.get("x-request-id") ?? "unset";
  const route = new URL(req.url).pathname;
  const ipHash = createHmac("sha256", anonIpKey()).update(ip ?? "").digest("hex").slice(0, 16);
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
    ipHash,
    method: req.method,
    ...extra,
  });
  incrementCounter('hawkeye_auth_failures_total', 1, { reason: reason.split(':')[0] ?? reason });

  // F-14: Write high-severity failures to the tamper-evident audit chain so
  // credential-stuffing and revocation-evasion attempts survive log rotation.
  if (HIGH_SEVERITY_AUTH_REASONS.has(reason)) {
    void writeAuditChainEntry(
      {
        event: "auth.failure",
        actor: "system",
        route,
        reason,
        ipHash,
        method: req.method,
        status,
        ...extra,
      },
      "default",
    ).catch(() => undefined);
  }

  // LOG-001: feed the distributed-bruteforce correlator. Fire-and-forget so
  // the hot enforcement path is unaffected by Blobs latency or unavailability.
  // The auth-failure-correlator.mts scheduled function reads from this ring
  // buffer every 10 minutes and alerts when an ipHash exceeds the threshold.
  void recordAuthFailureToBlobs({ ipHash, route, reason, status, at: new Date().toISOString() }).catch(() => undefined);
}

// LOG-001: Blobs-backed auth-failure ring buffer for the correlator.
// Dynamic import keeps the Next.js cold-start unchanged and Blobs failures
// never reach the enforcement path. Key format mirrors the prefix the
// correlator reads (`auth-failures/<ipHash>/<iso>.json`).
async function recordAuthFailureToBlobs(record: {
  ipHash: string;
  route: string;
  reason: string;
  status: number;
  at: string;
}): Promise<void> {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("hawkeye-sterling");
    const key = `auth-failures/${record.ipHash}/${record.at}.json`;
    await store.setJSON(key, record);
  } catch {
    // Best-effort — production logs (and the F-14 audit chain for high-severity
    // events) remain the authoritative record. The correlator simply has
    // fewer records to grouping over until Blobs comes back.
  }
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
  opts: { requireAuth?: boolean; requireJsonBody?: boolean; cost?: number; maxBodyBytes?: number } = {},
): Promise<EnforcementResult> {
  const route = new URL(req.url).pathname;
  const span = startSpan('enforce.auth', { 'http.route': route, 'http.method': req.method });
  try {
    return await _enforce(req, opts, span);
  } catch (err) {
    span.setStatus({ code: SpanStatus.ERROR });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    span.end();
  }
}

async function _enforce(
  req: Request,
  opts: { requireAuth?: boolean; requireJsonBody?: boolean; cost?: number; maxBodyBytes?: number },
  span: ReturnType<typeof startSpan>,
): Promise<EnforcementResult> {
  // Per-property defaulting so callers can override one option without
  // accidentally clearing the other. The previous all-or-nothing default
  // `opts = { requireAuth: true }` meant `enforce(req, { requireJsonBody: false })`
  // silently turned off auth — caught when the EOCN multipart upload route
  // tripped exactly that footgun. Always merge defaults at the property level.
  const requireAuth = opts.requireAuth ?? true;
  const requireJsonBody = opts.requireJsonBody ?? true;
  const cost = opts.cost ?? 1;
  // 1 MiB default. Override with a larger value only for routes that legitimately
  // accept documents (e.g. trade-finance, EOCN ingest). Netlify's reverse proxy
  // strips content-length so this check is enforced on direct/k8s callers only
  // — it is defence-in-depth, not the sole body-size gate.
  const maxBodyBytes = opts.maxBodyBytes ?? 1_048_576;

  // Content-Type + body-size guard — for JSON-body methods.
  // Skip GET/HEAD/DELETE/OPTIONS which have no body by convention.
  // Set requireJsonBody: false to bypass (e.g. multipart upload routes).
  const bodyMethod = ["POST", "PUT", "PATCH"].includes(req.method);
  const requireJson = requireJsonBody && bodyMethod;
  if (requireJson) {
    const ct = req.headers.get("content-type") ?? "";

    // F-12: Enforce body size via streaming byte-count on a cloned request so the
    // check covers chunked transfer encoding (Netlify strips Content-Length on all
    // proxied requests, making header-only enforcement useless there). The original
    // `req` body is not consumed — route handlers can still call req.json() normally.
    // Fall back to Content-Length check when the body stream is unavailable (e.g.
    // body-less POSTs from the portal UI that arrive without a body at all).
    let actualBodyBytes = 0;
    let streamChecked = false;
    if (req.body) {
      try {
        const cloned = req.clone();
        const reader = cloned.body?.getReader();
        if (reader) {
          let overflow = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            actualBodyBytes += value.byteLength;
            if (actualBodyBytes > maxBodyBytes) {
              overflow = true;
              reader.cancel().catch(() => undefined);
              break;
            }
          }
          streamChecked = true;
          if (overflow) {
            logAuthFailure(req, "request_body_too_large", 413, { bodyBytes: `>${maxBodyBytes}`, maxBodyBytes });
            return {
              ok: false,
              response: NextResponse.json(
                { ok: false, error: `Request body too large. Maximum allowed: ${maxBodyBytes} bytes.`, code: "PAYLOAD_TOO_LARGE" },
                { status: 413 },
              ),
            };
          }
        }
      } catch {
        // Clone/stream read failed — fall through to Content-Length check below.
        streamChecked = false;
      }
    }

    // Legacy Content-Length fallback for environments where body streaming is
    // unavailable (older runtimes, certain test environments).
    if (!streamChecked) {
      const cl = req.headers.get("content-length");
      const clNum = cl !== null ? parseInt(cl, 10) : -1;
      if (clNum > maxBodyBytes) {
        logAuthFailure(req, "request_body_too_large", 413, { contentLength: clNum, maxBodyBytes });
        return {
          ok: false,
          response: NextResponse.json(
            { ok: false, error: `Request body too large. Maximum allowed: ${maxBodyBytes} bytes.`, code: "PAYLOAD_TOO_LARGE" },
            { status: 413 },
          ),
        };
      }
      actualBodyBytes = clNum > 0 ? clNum : 0;
    }

    const hasBody = actualBodyBytes > 0;
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
  // by web/proxy.ts for same-origin portal requests — never exposed in
  // the browser bundle) skip API-key lookup and grant enterprise-tier rate
  // limits without consuming monthly quota.
  const adminToken = process.env["ADMIN_TOKEN"];
  const adminMatch = adminToken && plaintext !== null && (() => {
    const ha = createHmac("sha256", ENFORCE_COMPARE_KEY).update(adminToken).digest();
    const hb = createHmac("sha256", ENFORCE_COMPARE_KEY).update(plaintext).digest();
    return timingSafeEqual(ha, hb);
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
  // API routes without consuming an API key quota. Same HMAC-normalised compare.
  const cronToken = process.env["SANCTIONS_CRON_TOKEN"];
  const cronMatch = cronToken && plaintext !== null && (() => {
    const ha = createHmac("sha256", ENFORCE_COMPARE_KEY).update(cronToken).digest();
    const hb = createHmac("sha256", ENFORCE_COMPARE_KEY).update(plaintext).digest();
    return timingSafeEqual(ha, hb);
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

  // Session cookie path: portal same-origin requests that arrive without an
  // Authorization header (e.g. when ADMIN_TOKEN is not set in the deployment
  // env and proxy.ts skips token injection) can still authenticate via the
  // HMAC-signed hs_session cookie issued by /api/auth/login.
  // This is the fallback that makes the portal work correctly regardless of
  // whether ADMIN_TOKEN is configured in Netlify env vars.
  if (anonymous) {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const sessionToken = cookieHeader
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1) ?? "";
    if (sessionToken) {
      let sessionPayload: ReturnType<typeof verifySession> = null;
      try { sessionPayload = verifySession(sessionToken); } catch { /* SESSION_SECRET missing or invalid */ }
      if (sessionPayload) {
        const sessionKeyId = `session_${sessionPayload.userId}`;
        const rl = await consumeRateLimit(sessionKeyId, "enterprise");
        if (!rl.allowed) {
          logAuthFailure(req, "rate_limit_exceeded:session_portal", 429);
          return {
            ok: false,
            response: NextResponse.json(
              { ok: false, error: "rate limit exceeded", retryAfterSec: rl.retryAfterSec },
              { status: 429, headers: rateLimitHeaders(rl) },
            ),
          };
        }
        span.setAttribute('auth.keyId', sessionKeyId);
        span.setAttribute('auth.tier', 'enterprise');
        span.setAttribute('auth.outcome', 'allow_session');
        return { ok: true, tier: rl.tier, keyId: sessionKeyId, record: null, remainingMonthly: null, headers: rateLimitHeaders(rl) };
      }
    }
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
    // Also check revoked state: a key revoked after JWT issuance must be rejected here.
    const liveRecord = await getJson<ApiKeyRecord>(`keys/${keyId}`).catch(() => null);
    if (liveRecord?.revokedAt) {
      logAuthFailure(req, "jwt_key_revoked", 401, { keyId });
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "API key has been revoked" },
          { status: 401 },
        ),
      };
    }
    tierId = liveRecord?.tier ?? v.payload.tier ?? "free";
    const rl = await consumeRateLimit(keyId, tierId, cost);
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
      logAuthFailure(req, `api_key_${check.reason ?? "invalid"}`, check.reason === "quota_exceeded" ? 429 : 401, { keyIdPrefix: check.record?.id?.slice(0, 8) ?? "[unknown]" });
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
    const ip = ips.length > 0 ? (ips[ips.length - 1] ?? UNKNOWN_IP) : UNKNOWN_IP;
    keyId = `anon_${createHmac("sha256", anonIpKey()).update(ip).digest("hex").slice(0, 12)}`;
  }

  const rl = await consumeRateLimit(keyId, tierId, cost);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "rate limit exceeded", retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: rateLimitHeaders(rl) },
      ),
    };
  }

  span.setAttribute('auth.keyId', keyId);
  span.setAttribute('auth.tier', tierId);
  span.setAttribute('auth.outcome', 'allow');
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
