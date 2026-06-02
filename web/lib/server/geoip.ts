// Hawkeye Sterling — IP geolocation and network risk lookup.
//
// nxtrace/NTrace-core and GIScience/openrouteservice inspired:
// attach geographic and network-infrastructure context to every compliance
// request so behavioral flags (ip_jurisdiction_mismatch, vpn_or_tor_detected)
// actually fire instead of silently staying dead.
//
// Privacy invariants (per CLAUDE.md):
//   - Raw IP addresses are NEVER stored or logged.
//   - All cache keys use HMAC-SHA256(ip, anonIpKey()) — same pattern as
//     enforce.ts IP-anonymization so per-deployment protection applies.
//   - Lookup errors are silently swallowed so GeoIP failure never blocks
//     a compliance decision.
//
// Provider: ip-api.com (free tier, no key needed, 45 req/min).
//   Set GEOIP_PROVIDER=maxmind or GEOIP_PROVIDER=ipinfo to stub in other
//   providers once implemented.

import { createHmac } from "node:crypto";
import { getJson, setJson } from "./store";
import { incrementCounter } from "./metrics-store";
import { anonIpKey } from "./enforce";

export interface IpRiskResult {
  /** ISO 3166-1 alpha-2 country code, or null if unavailable. */
  countryIso2: string | null;
  /** True if IP belongs to a known datacenter or cloud hosting range. */
  isDatacenter: boolean;
  /** True if IP is a known VPN exit node or proxy. */
  isVpn: boolean;
  /** True if IP is a Tor exit node. ip-api free tier does not distinguish
   *  Tor separately — future MaxMind provider will. Always false here. */
  isTor: boolean;
  /** ASN organisation name (e.g. "Amazon.com Inc."). */
  asnOrg: string | null;
  /** ASN number string (e.g. "AS16509"). */
  asnNumber: string | null;
  /** Composite risk score 0–100. */
  riskScore: number;
  fromCache: boolean;
}

const GEOIP_CACHE_PREFIX = "geoip/v1/";
const GEOIP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ip-api.com field selection. "proxy" covers VPN+proxy; "hosting" = datacenter.
const IP_API_FIELDS = "status,countryCode,proxy,hosting,as,query";
const IP_API_BASE = "http://ip-api.com/json";

interface IpApiResponse {
  status: "success" | "fail";
  countryCode?: string;
  proxy?: boolean;
  hosting?: boolean;
  as?: string;  // e.g. "AS16509 Amazon.com Inc."
}

/**
 * Extract the real client IP from a request.
 *
 * Priority (per CLAUDE.md: never trust first x-forwarded-for value):
 *   1. cf-connecting-ip — Cloudflare, single real IP, unforged
 *   2. x-real-ip       — set by some Netlify / nginx configurations
 *   3. LAST value of x-forwarded-for — proxy-appended by Netlify CDN
 *
 * Returns null when no IP is determinable (e.g. local dev, CLI tools).
 */
export function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf && isValidIp(cf.trim())) return cf.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp.trim())) return realIp.trim();

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && isValidIp(last)) return last;
  }
  return null;
}

function isValidIp(ip: string): boolean {
  // Reject private/loopback ranges in production to avoid caching internal IPs.
  if (process.env["NODE_ENV"] === "production") {
    if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd)/i.test(ip)) {
      return false;
    }
  }
  return /^[\d.:a-fA-F]+$/.test(ip) && ip.length <= 45;
}

function hashIp(ip: string): string {
  return createHmac("sha256", anonIpKey()).update(ip).digest("hex").slice(0, 32);
}

async function fetchFromIpApi(ip: string): Promise<IpApiResponse | null> {
  try {
    const res = await fetch(
      `${IP_API_BASE}/${encodeURIComponent(ip)}?fields=${IP_API_FIELDS}`,
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) return null;
    return await res.json() as IpApiResponse;
  } catch {
    return null;
  }
}

function computeRiskScore(data: IpApiResponse): number {
  let score = 0;
  if (data.proxy)   score += 40;  // VPN / proxy: anonymization signal
  if (data.hosting) score += 25;  // Datacenter: attacker infrastructure
  return Math.min(100, score);
}

/**
 * Look up the risk profile for a client IP address.
 *
 * Caches results by HMAC hash of the IP for 24 hours.
 * Never logs or stores the raw IP — only the hash appears in storage keys.
 * Errors are swallowed: on failure returns a zero-risk result so compliance
 * decisions are never blocked by GeoIP unavailability.
 */
export async function lookupIpRisk(ip: string): Promise<IpRiskResult> {
  const ipHash = hashIp(ip);
  const cacheKey = `${GEOIP_CACHE_PREFIX}${ipHash}.json`;

  // Cache read
  try {
    type Cached = IpRiskResult & { cachedAt: string };
    const cached = await getJson<Cached>(cacheKey);
    if (cached) {
      const age = Date.now() - new Date(cached.cachedAt).getTime();
      if (age < GEOIP_CACHE_TTL_MS) {
        incrementCounter("hawkeye_geoip_lookups_total", 1, { source: "cache", cached: "true" });
        return { ...cached, fromCache: true };
      }
    }
  } catch {
    // Cache unavailable — proceed to live lookup
  }

  const provider = process.env["GEOIP_PROVIDER"] ?? "ip-api";
  if (provider !== "ip-api") {
    // Future: add maxmind, ipinfo, etc. branches here.
    console.warn(`[geoip] GEOIP_PROVIDER=${provider} not implemented — falling back to ip-api`);
  }

  incrementCounter("hawkeye_geoip_lookups_total", 1, { source: "ip-api", cached: "false" });
  const data = await fetchFromIpApi(ip);

  const asnRaw = data?.as ?? null;
  const result: IpRiskResult = {
    countryIso2:  data?.countryCode ?? null,
    isDatacenter: data?.hosting ?? false,
    isVpn:        data?.proxy ?? false,
    isTor:        false,  // ip-api free tier doesn't distinguish Tor
    asnOrg:       asnRaw ? asnRaw.replace(/^AS\d+\s*/, "") : null,
    asnNumber:    asnRaw ? (asnRaw.match(/^(AS\d+)/)?.[1] ?? null) : null,
    riskScore:    data?.status === "success" ? computeRiskScore(data) : 0,
    fromCache:    false,
  };

  if (result.isVpn || result.isTor) {
    incrementCounter("hawkeye_geoip_vpn_detected_total", 1, {});
  }

  // Cache write — fire-and-forget, never block compliance path
  void setJson(cacheKey, { ...result, cachedAt: new Date().toISOString() }).catch(() => undefined);

  return result;
}
