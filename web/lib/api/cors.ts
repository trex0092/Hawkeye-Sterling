// Centralised CORS policy for Hawkeye Sterling API routes.
//
// All public-facing API routes must import corsHeaders() from here instead of
// hard-coding "access-control-allow-origin": "*". Wildcard CORS on an AML
// platform allows any website to read screening results, PEP classifications,
// and case data — a significant information-disclosure risk.
//
// Policy:
//   - Same-origin portal calls pass through the middleware ADMIN_TOKEN injection
//     path and never reach these headers (middleware sets Authorization before
//     the route handler runs).
//   - External API callers (SDK / Postman) supply their own Authorization or
//     X-Api-Key header. The allowlist below permits them from any origin when
//     a valid key is present because the auth guard is the real enforcement layer.
//   - Explicitly configured partner origins (CORS_ALLOWED_ORIGINS env var,
//     comma-separated) are also permitted.
//
// When to use "*" vs allowlist:
//   Truly public unauthenticated endpoints (e.g. /.well-known/*, /api/status)
//   may still set "*". All endpoints that return subject data, screening results,
//   or compliance information must use corsHeaders() from this module.

const ENV_ALLOWED_ORIGINS = (process.env["CORS_ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const BASE_ALLOWED_ORIGINS = [
  "https://hawkeye-sterling.netlify.app",
  process.env["NEXT_PUBLIC_APP_URL"] ?? "",
].filter(Boolean);

const ALL_ALLOWED_ORIGINS = [...new Set([...BASE_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS])];

/**
 * Returns CORS headers for a given request origin.
 *
 * If the origin is in the allowlist, reflect it back (so the browser accepts
 * the response). Otherwise reflect the primary origin — the browser will block
 * the cross-origin read, which is the desired behaviour.
 *
 * Always includes Vary: Origin so CDN caches don't serve one origin's response
 * to a different origin.
 */
export function corsHeaders(
  origin: string | null,
  opts: {
    methods?: string;
    allowedHeaders?: string;
  } = {},
): Record<string, string> {
  const allowed =
    origin !== null && ALL_ALLOWED_ORIGINS.includes(origin)
      ? origin
      : (ALL_ALLOWED_ORIGINS[0] ?? "https://hawkeye-sterling.netlify.app");

  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": opts.methods ?? "POST, OPTIONS",
    "access-control-allow-headers": opts.allowedHeaders ?? "content-type, authorization, x-api-key",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}

/**
 * Shorthand for the pre-flight OPTIONS response used by every public API route.
 */
export function corsPreflight(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, { methods: "POST, GET, OPTIONS" }),
  });
}
