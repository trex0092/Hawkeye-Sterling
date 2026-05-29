// OpenCorporates corporate registry connector.
//
// Searches the OpenCorporates API for company records by name (and optionally
// jurisdiction). Uses OPENCORPORATES_API_KEY from process.env when available;
// falls back to unauthenticated requests (subject to stricter rate limits).
//
// Features:
//   - 5-second AbortController timeout on all network calls
//   - 15-minute in-process result cache keyed by (name, jurisdiction)
//   - Graceful 429 rate-limit handling (returns [] + logs warning)
//   - Typed CorporateRecord output

export interface CorporateRecord {
  name: string;
  jurisdiction: string;
  companyNumber: string;
  companyType: string;
  incorporationDate?: string;
  dissolutionDate?: string;
  registeredAddress?: string;
  officers?: { name: string; position: string; startDate?: string }[];
  source: "opencorporates";
}

// ── In-process 15-minute cache ───────────────────────────────────────────────

interface CacheEntry {
  data: CorporateRecord[];
  cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1_000; // 15 minutes
const _cache = new Map<string, CacheEntry>();

function cacheKey(name: string, jurisdiction?: string): string {
  return `${name.toLowerCase().trim()}||${(jurisdiction ?? "").toLowerCase().trim()}`;
}

function cacheGet(name: string, jurisdiction?: string): CorporateRecord[] | null {
  const key = cacheKey(name, jurisdiction);
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(name: string, jurisdiction: string | undefined, data: CorporateRecord[]): void {
  _cache.set(cacheKey(name, jurisdiction), { data, cachedAt: Date.now() });
}

// ── OpenCorporates API response types ────────────────────────────────────────

interface OcOfficer {
  name?: string;
  position?: string;
  start_date?: string;
}

interface OcCompany {
  name?: string;
  jurisdiction_code?: string;
  company_number?: string;
  company_type?: string;
  incorporation_date?: string;
  dissolution_date?: string;
  registered_address?: { in_full?: string } | null;
  officers?: { officer?: OcOfficer }[];
}

interface OcCompanyWrapper {
  company?: OcCompany;
}

interface OcResults {
  companies?: OcCompanyWrapper[];
}

interface OcResponse {
  results?: OcResults;
}

// ── Parser ───────────────────────────────────────────────────────────────────

function parseCompany(wrapper: OcCompanyWrapper): CorporateRecord | null {
  const c = wrapper.company;
  if (!c || typeof c !== "object") return null;
  const name = typeof c.name === "string" ? c.name.trim() : "";
  const companyNumber = typeof c.company_number === "string" ? c.company_number.trim() : "";
  const jurisdiction = typeof c.jurisdiction_code === "string" ? c.jurisdiction_code.toUpperCase().trim() : "";
  if (!name || !companyNumber) return null;

  const officers: CorporateRecord["officers"] = [];
  if (Array.isArray(c.officers)) {
    for (const ow of c.officers) {
      const o = ow?.officer;
      if (!o || typeof o !== "object") continue;
      const oName = typeof o.name === "string" ? o.name.trim() : "";
      if (!oName) continue;
      officers.push({
        name: oName,
        position: typeof o.position === "string" ? o.position.trim() : "Officer",
        startDate: typeof o.start_date === "string" ? o.start_date : undefined,
      });
    }
  }

  let registeredAddress: string | undefined;
  if (c.registered_address && typeof c.registered_address === "object") {
    const inFull = c.registered_address.in_full;
    if (typeof inFull === "string" && inFull.trim()) {
      registeredAddress = inFull.trim();
    }
  }

  return {
    name,
    jurisdiction,
    companyNumber,
    companyType: typeof c.company_type === "string" ? c.company_type.trim() : "Unknown",
    incorporationDate: typeof c.incorporation_date === "string" ? c.incorporation_date : undefined,
    dissolutionDate: typeof c.dissolution_date === "string" ? c.dissolution_date : undefined,
    registeredAddress,
    officers: officers.length > 0 ? officers : undefined,
    source: "opencorporates",
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Search OpenCorporates for companies matching `name`, optionally filtered by
 * `jurisdiction` (ISO 3166-1 alpha-2 or OpenCorporates jurisdiction code).
 *
 * Returns an empty array on error or when rate-limited.
 */
export async function searchCorporateRegistry(
  name: string,
  jurisdiction?: string,
): Promise<CorporateRecord[]> {
  const trimmedName = name.trim();
  if (!trimmedName) return [];

  // Return cached result if available
  const cached = cacheGet(trimmedName, jurisdiction);
  if (cached !== null) return cached;

  const apiKey = process.env["OPENCORPORATES_API_KEY"];
  const baseUrl = "https://api.opencorporates.com/v0.4/companies/search";

  const params = new URLSearchParams({ q: trimmedName });
  if (jurisdiction) params.set("jurisdiction_code", jurisdiction.toLowerCase().trim());
  if (apiKey) params.set("api_token", apiKey);

  const url = `${baseUrl}?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn("[opencorporates] network error:", err instanceof Error ? err.message : String(err));
    return [];
  }

  if (response.status === 429) {
    console.warn("[opencorporates] rate limited — returning empty result. Retry after:", response.headers.get("retry-after") ?? "unknown");
    return [];
  }

  if (!response.ok) {
    console.warn("[opencorporates] non-OK response:", response.status, response.statusText);
    return [];
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    console.warn("[opencorporates] JSON parse error:", err instanceof Error ? err.message : String(err));
    return [];
  }

  const data = json as OcResponse;
  const companies = data?.results?.companies;
  if (!Array.isArray(companies)) {
    cacheSet(trimmedName, jurisdiction, []);
    return [];
  }

  const records = companies
    .map((w) => parseCompany(w))
    .filter((r): r is CorporateRecord => r !== null);

  cacheSet(trimmedName, jurisdiction, records);
  return records;
}
