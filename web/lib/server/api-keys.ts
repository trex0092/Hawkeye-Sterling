// Hawkeye Sterling — API key registry.
//
// In-memory registry seeded from the HAWKEYE_API_KEYS env var (JSON array of
// ApiKeyRecord). No external deps. For production the registry is swappable
// behind the ApiKeyStore interface — plug in a DB-backed store without
// touching the guard or handler code.
//
// Schema:
//   { "key": "hk_live_...",
//     "tenantId": "acme",
//     "tier": "free" | "growth" | "scale" | "enterprise",
//     "monthlyQuota": 1000,
//     "issuedAt": "2026-04-23T00:00:00Z" }

export type ApiTier = "free" | "growth" | "scale" | "enterprise";

export interface ApiKeyRecord {
  readonly key: string;
  readonly tenantId: string;
  readonly tier: ApiTier;
  readonly monthlyQuota: number;
  readonly issuedAt: string;
}

export interface ApiKeyStore {
  get(key: string): ApiKeyRecord | null;
  list(): ReadonlyArray<ApiKeyRecord>;
}

const DEFAULT_QUOTA: Record<ApiTier, number> = {
  free: 1_000,
  growth: 50_000,
  scale: 500_000,
  enterprise: Number.POSITIVE_INFINITY,
};

export function defaultMonthlyQuotaFor(tier: ApiTier): number {
  return DEFAULT_QUOTA[tier];
}

class InMemoryStore implements ApiKeyStore {
  private readonly records = new Map<string, ApiKeyRecord>();

  constructor(records: Iterable<ApiKeyRecord>) {
    for (const r of records) this.records.set(r.key, r);
  }

  get(key: string): ApiKeyRecord | null {
    return this.records.get(key) ?? null;
  }

  list(): ReadonlyArray<ApiKeyRecord> {
    return [...this.records.values()];
  }
}

function parseSeed(raw: string | undefined): ApiKeyRecord[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ApiKeyRecord[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const key = typeof e["key"] === "string" ? e["key"] : null;
      const tenantId = typeof e["tenantId"] === "string" ? e["tenantId"] : null;
      const tier =
        e["tier"] === "free" ||
        e["tier"] === "growth" ||
        e["tier"] === "scale" ||
        e["tier"] === "enterprise"
          ? e["tier"]
          : null;
      if (!key || !tenantId || !tier) continue;
      const monthlyQuota =
        typeof e["monthlyQuota"] === "number" && Number.isFinite(e["monthlyQuota"])
          ? (e["monthlyQuota"] as number)
          : DEFAULT_QUOTA[tier];
      const issuedAt =
        typeof e["issuedAt"] === "string" ? e["issuedAt"] : new Date().toISOString();
      out.push({ key, tenantId, tier, monthlyQuota, issuedAt });
    }
    return out;
  } catch {
    return [];
  }
}

let SINGLETON: ApiKeyStore | null = null;

function getStore(): ApiKeyStore {
  if (SINGLETON) return SINGLETON;
  SINGLETON = new InMemoryStore(parseSeed(process.env["HAWKEYE_API_KEYS"]));
  return SINGLETON;
}

/** Test-only override — inject a custom store (e.g. vitest fixture). */
export function __setStore(store: ApiKeyStore | null): void {
  SINGLETON = store;
}

/** Extract the API key from an incoming request. Supports X-Api-Key header
 *  (canonical) and Authorization: Bearer <key> (RFC 6750 convenience). */
export function extractApiKey(req: Request): string | null {
  const headerKey = req.headers.get("x-api-key");
  if (headerKey && headerKey.trim()) return headerKey.trim();
  const auth = req.headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) {
    const token = auth.replace(/^bearer\s+/i, "").trim();
    if (token) return token;
  }
  return null;
}

/** Resolve a request to its ApiKeyRecord, or null if the key is missing /
 *  unknown. Does NOT touch rate-limit state. */
export function resolveApiKey(req: Request): ApiKeyRecord | null {
  const key = extractApiKey(req);
  if (!key) return null;
  return getStore().get(key);
}
