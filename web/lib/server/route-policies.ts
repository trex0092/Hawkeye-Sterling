// Hawkeye Sterling — declarative per-route policy map.
//
// Spring-cloud-gateway-inspired: instead of hardcoding rate-limit cost
// multipliers, timeout overrides, and role requirements inside each route.ts,
// we declare them here and let enforce() pick them up centrally.
//
// Lookup is first-exact, then longest-prefix. Add entries here rather than
// touching individual route files when policy changes.
//
// RFC 8594 Sunset/Deprecation headers: set sunsetDate + deprecationDate on
// routes scheduled for removal so clients receive advance warning on every
// response before the route goes dark.

export interface RouteLimitPolicy {
  /** Multiply the route's per-call cost before it reaches consumeRateLimit. */
  costMultiplier: number;
  perSecondOverride?: number;
  perMinuteOverride?: number;
}

export interface RoutePolicy {
  /** Exact path or prefix* pattern. */
  path: string;
  /** Hard timeout advisory (ms). Routes can read this via routePolicyFor(). */
  timeoutMs?: number;
  /** Circuit-breaker key override (default: derived from path). */
  circuitBreakerKey?: string;
  rateLimitPolicy?: RouteLimitPolicy;
  /** RFC 8594 Sunset header value (ISO-8601). */
  sunsetDate?: string;
  /** RFC draft Deprecation header. */
  deprecationDate?: string;
  /** Link header successor, e.g. '</api/v2/screen>; rel="successor-version"'. */
  deprecationLink?: string;
}

export const ROUTE_POLICIES: readonly RoutePolicy[] = [
  // AI-heavy routes — cost reflects Claude Opus token spend
  { path: "/api/mlro-advisor",          timeoutMs: 55_000, rateLimitPolicy: { costMultiplier: 5 } },
  { path: "/api/mlro-advisor/*",        timeoutMs: 55_000, rateLimitPolicy: { costMultiplier: 5 } },
  { path: "/api/screening/run",         timeoutMs: 30_000, rateLimitPolicy: { costMultiplier: 3 } },
  { path: "/api/batch-screen",          timeoutMs: 60_000, rateLimitPolicy: { costMultiplier: 3 } },
  { path: "/api/transaction-anomaly",   timeoutMs: 30_000, rateLimitPolicy: { costMultiplier: 2 } },
  { path: "/api/entity-graph",          timeoutMs: 30_000, rateLimitPolicy: { costMultiplier: 2 } },
  { path: "/api/customer-risk-rating",  timeoutMs: 45_000, rateLimitPolicy: { costMultiplier: 5 } },
  { path: "/api/generate-report",       timeoutMs: 60_000, rateLimitPolicy: { costMultiplier: 10 } },
  { path: "/api/country-risk",          timeoutMs: 45_000, rateLimitPolicy: { costMultiplier: 2 } },

  // Regulatory filing routes — lower cost multiplier but role-gated
  { path: "/api/sar-report",  rateLimitPolicy: { costMultiplier: 1 } },
  { path: "/api/goaml",       rateLimitPolicy: { costMultiplier: 1 } },

  // v1 prefix — ready for future deprecation annotation
  // Uncomment when v2 is stable and v1 retirement is scheduled:
  // {
  //   path: "/api/v1/*",
  //   sunsetDate: "2027-01-01T00:00:00Z",
  //   deprecationDate: "2026-07-01T00:00:00Z",
  //   deprecationLink: '</api/v2>; rel="successor-version"',
  // },
];

/**
 * Look up the policy for a pathname. Exact match wins; otherwise longest
 * prefix (entries ending in *). Returns null when no policy is registered.
 */
export function routePolicyFor(pathname: string): RoutePolicy | null {
  const exact = ROUTE_POLICIES.find((p) => p.path === pathname);
  if (exact) return exact;
  const prefixes = ROUTE_POLICIES.filter(
    (p) => p.path.endsWith("*") && pathname.startsWith(p.path.slice(0, -1)),
  ).sort((a, b) => b.path.length - a.path.length);
  return prefixes[0] ?? null;
}

/**
 * Append RFC 8594 Sunset / Deprecation / Link headers to an existing
 * header map when the route policy has them set. Safe to call with null.
 */
export function applySunsetHeaders(
  headers: Record<string, string>,
  policy: RoutePolicy | null,
): Record<string, string> {
  if (!policy) return headers;
  const out = { ...headers };
  if (policy.sunsetDate)     out["Sunset"]      = policy.sunsetDate;
  if (policy.deprecationDate) out["Deprecation"] = policy.deprecationDate;
  if (policy.deprecationLink) out["Link"]        = policy.deprecationLink;
  return out;
}
