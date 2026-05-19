// Hawkeye Sterling — live candidate loader.
//
// Screening routes (quick-screen, batch-screen, super-brain) previously
// imported a static 50-entry fixture.  This module replaces that with a
// Blobs-backed loader that reads the full ingested lists (OFAC-SDN,
// UN-1267, EU-CFSP, UK-OFSI, UAE-EOCN/LTL, OFAC-Consolidated) and
// converts them to QuickScreenCandidate[].
//
// Fallback chain:
//   1. Netlify Blobs "hawkeye-lists" store (populated by refresh-lists cron)
//   2. Static seed corpus (web/lib/data/candidates.ts)
//
// Results are cached in-process for CACHE_TTL_MS to avoid per-request
// Blobs reads on high-traffic endpoints.
//
// Data source health:
//   Every load produces a CandidateLoadHealth record that callers can
//   embed in screening results so compliance analysts and audit trails
//   can see whether a screen ran against live or static data.

import type { QuickScreenCandidate } from "@/lib/api/quickScreen.types";
import { CANDIDATES as STATIC_CANDIDATES } from "@/lib/data/candidates";

// Adapter IDs written by netlify/functions/refresh-lists.ts (primary feeds)
// plus LSEG-derived supplement IDs written by /api/admin/import-cfs.
// Audit H-01/H-02/H-03/C-01: when a primary feed is missing/empty/stale,
// the LSEG CFS supplement backfills so the screening engine still has
// coverage of that regime — the listId in the candidate result tells the
// MLRO which source produced the hit ("lseg_uae_eocn" vs "uae_eocn").
const ADAPTER_IDS = [
  "un_consolidated",
  "ofac_sdn",
  "ofac_cons",
  "eu_fsf",
  "uk_ofsi",
  "uae_eocn",
  "uae_ltl",
  // LSEG supplements — only present if /api/admin/import-cfs has run.
  "lseg_un_consolidated",
  "lseg_ofac_sdn",
  "lseg_ofac_cons",
  "lseg_eu_fsf",
  "lseg_uk_ofsi",
  "lseg_ca_osfi",
  "lseg_au_dfat",
  "lseg_ch_seco",
  "lseg_jp_mof",
  "lseg_uae_eocn",
  "lseg_uae_ltl",
] as const;

// Cache TTL — configurable via env for environments that refresh more
// frequently or need immediate invalidation after a cron run.
// Default: 5 minutes. Set CANDIDATES_CACHE_TTL_MS to override.
function getCacheTtlMs(): number {
  const raw = process.env["CANDIDATES_CACHE_TTL_MS"];
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 5 * 60 * 1_000;
}

// Per-request Blobs read timeout. Set CANDIDATES_BLOB_TIMEOUT_MS to override.
function getBlobTimeoutMs(): number {
  const raw = process.env["CANDIDATES_BLOB_TIMEOUT_MS"];
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1_200;
}

/**
 * Describes the health of the data source used for the most recent load.
 * Callers should embed this in screening API responses so compliance
 * analysts can see whether a screen ran against live or stale/static data.
 */
export interface CandidateLoadHealth {
  /** "live" = loaded from Netlify Blobs; "static" = fell back to seed corpus. */
  source: "live" | "static";
  /** ISO-8601 timestamp of when the candidates were loaded. */
  loadedAt: string;
  /** Total candidate count available for matching. */
  candidateCount: number;
  /**
   * True only when source === "live" AND all primary adapters responded.
   * False when any primary feed timed out, errored, or returned no entities.
   */
  healthy: boolean;
  /**
   * Adapters that failed to load (timed out, errored, or empty).
   * Empty when source === "live" and all adapters succeeded.
   */
  failedAdapters: string[];
  /**
   * Human-readable degradation note. Present whenever healthy === false or
   * source === "static". Callers MUST surface this to analysts and audit logs.
   */
  degradationNote?: string;
}

// Ingestion NormalisedEntity shape (mirrors src/ingestion/types.ts without
// importing across the web/ boundary — avoids bundling the full ingestion
// module into Netlify Functions).
interface Listing {
  source: string;
  program?: string;
  reference?: string;
}

interface NormalisedEntity {
  id: string;
  name: string;
  aliases: string[];
  type: string; // 'individual'|'entity'|'vessel'|'aircraft'|'wallet'|'unknown'
  nationalities: string[];
  jurisdictions: string[];
  listings: Listing[];
  source: string;
}

type EntityType = NonNullable<QuickScreenCandidate["entityType"]>;

function mapType(t: string): EntityType {
  if (t === "individual") return "individual";
  if (t === "entity") return "organisation";
  if (t === "vessel") return "vessel";
  if (t === "aircraft") return "aircraft";
  if (t !== "wallet" && t !== "unknown" && t !== "other") {
    // Log unexpected type strings — they indicate schema drift in the ingestion
    // pipeline. Do not throw; map to "other" so screening can still run.
    console.warn(`[candidates-loader] Unmapped entity type "${t}" — defaulting to "other". Check ingestion pipeline for schema drift.`);
  }
  return "other";
}

function isValidEntity(e: unknown): e is NormalisedEntity {
  if (!e || typeof e !== "object") return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    obj["name"].length > 0 &&
    Array.isArray(obj["aliases"]) &&
    Array.isArray(obj["listings"]) &&
    typeof obj["source"] === "string"
  );
}

function entityToCandidate(e: NormalisedEntity): QuickScreenCandidate {
  const programs = e.listings
    .map((l) => l.program)
    .filter((p): p is string => Boolean(p));

  // Prefer the listing-level source+reference for list attribution.
  const primaryListing = e.listings[0];
  const listId = primaryListing?.source ?? e.source;
  const listRef = primaryListing?.reference ?? e.id;
  const nationality = Array.isArray(e.nationalities) ? e.nationalities[0] : undefined;
  const jurisdiction = nationality ?? (Array.isArray(e.jurisdictions) ? e.jurisdictions[0] : undefined);

  const candidate: QuickScreenCandidate = {
    listId,
    listRef,
    name: e.name,
    entityType: mapType(e.type),
  };
  if (Array.isArray(e.aliases) && e.aliases.length > 0) candidate.aliases = e.aliases;
  if (jurisdiction) candidate.jurisdiction = jurisdiction;
  if (programs.length > 0) candidate.programs = programs;
  return candidate;
}

// Per-process cache.
let _cached: QuickScreenCandidate[] | null = null;
let _cachedAt = 0;
let _cachedHealth: CandidateLoadHealth | null = null;
// In-flight promise deduplication — prevents cache stampede on first cold load.
let _loadInFlight: Promise<{ candidates: QuickScreenCandidate[]; health: CandidateLoadHealth }> | null = null;

interface BlobsLoadResult {
  candidates: QuickScreenCandidate[];
  failedAdapters: string[];
  malformedCount: number;
}

async function loadFromBlobs(): Promise<BlobsLoadResult | null> {
  let blobsMod: typeof import("@netlify/blobs") | null = null;
  try {
    blobsMod = await import("@netlify/blobs");
  } catch {
    console.warn("[candidates-loader] @netlify/blobs not available — not in a Netlify context");
    return null; // not in a Netlify context
  }

  const { getStore } = blobsMod;
  // Next.js API routes do NOT receive NETLIFY_BLOBS_CONTEXT auto-injection —
  // explicit credentials are always required. NETLIFY_BLOBS_TOKEN is the
  // confirmed working token (v8 audit).
  //
  // Dual-store strategy: try hawkeye-list-reports first (ingestion now writes
  // entities there too). If a list has no entity data there yet (pre-first-
  // ingestion-after-deploy), fall back to hawkeye-lists where entities are
  // written by the native Netlify Function. This ensures screening works both
  // before and after the new ingestion path is populated.
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];

  function makeStore(name: string) {
    return siteID && token
      ? getStore({ name, siteID, token, consistency: "strong" } as Parameters<typeof getStore>[0])
      : getStore({ name } as Parameters<typeof getStore>[0]);
  }

  let storeReports: ReturnType<typeof getStore>;
  let storeLists: ReturnType<typeof getStore>;
  try {
    storeReports = makeStore("hawkeye-list-reports");
    storeLists   = makeStore("hawkeye-lists");
  } catch (err) {
    console.error("[candidates-loader] Failed to open Blobs stores:", err instanceof Error ? err.message : String(err));
    return null;
  }

  // Read all adapter blobs in parallel — try hawkeye-list-reports first,
  // fall back to hawkeye-lists per adapter if no entity data found.
  const perKeyTimeoutMs = getBlobTimeoutMs();
  const adapterResults = await Promise.all(
    ADAPTER_IDS.map(async (adapterId): Promise<{ adapterId: string; entities: NormalisedEntity[] | null; error?: string }> => {
      const key = `${adapterId}/latest.json`;
      for (const [storeIdx, store] of ([storeReports, storeLists] as const).entries()) {
        try {
          const raw = await Promise.race([
            store.get(key, { type: "json" }) as Promise<{ entities: NormalisedEntity[] } | null>,
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error(`blob read timeout after ${perKeyTimeoutMs}ms`)), perKeyTimeoutMs),
            ),
          ]);
          if (raw?.entities?.length) {
            return { adapterId, entities: raw.entities };
          }
          // null or empty — try next store
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Log the error from the first (primary) store for observability but
          // still try the fallback store before marking this adapter failed.
          if (storeIdx === 0) {
            console.warn(`[candidates-loader] Blobs read failed adapterId=${adapterId} store=hawkeye-list-reports key=${key}: ${msg}`);
          }
        }
      }
      // Both stores failed or returned empty for this adapter.
      return { adapterId, entities: null, error: `no entities found in either store for ${adapterId}` };
    }),
  );

  const live: QuickScreenCandidate[] = [];
  const failedAdapters: string[] = [];
  let anyLoaded = false;
  let totalMalformed = 0;

  for (const result of adapterResults) {
    if (!result.entities?.length) {
      // Only count primary adapters (non-LSEG) as failures for health reporting.
      // LSEG supplements are optional and only present after import-cfs.
      if (!result.adapterId.startsWith("lseg_")) {
        failedAdapters.push(result.adapterId);
      }
      continue;
    }
    anyLoaded = true;
    for (const e of result.entities) {
      if (!isValidEntity(e)) {
        totalMalformed++;
        continue;
      }
      try {
        live.push(entityToCandidate(e));
      } catch (err) {
        totalMalformed++;
        console.warn(
          `[candidates-loader] entityToCandidate failed adapterId=${result.adapterId}: ` +
          (err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }

  if (totalMalformed > 0) {
    console.warn(
      `[candidates-loader] Skipped ${totalMalformed} malformed entities across all adapters. ` +
      "Screening corpus is incomplete. Check ingestion pipeline for schema drift.",
    );
  }

  if (failedAdapters.length > 0) {
    console.warn(
      `[candidates-loader] ${failedAdapters.length} primary adapter(s) produced no data: ` +
      failedAdapters.join(", ") +
      ". These lists are NOT covered in the current screening corpus.",
    );
  }

  return anyLoaded ? { candidates: live, failedAdapters, malformedCount: totalMalformed } : null;
}

/**
 * Returns the best available candidate list for screening, along with health metadata.
 *
 * Priority: live Blobs data → static seed corpus.
 * Merges both: live list entries take precedence; seed corpus entries not
 * present in the live data are appended so known demo subjects always render.
 */
export async function loadCandidatesWithHealth(): Promise<{ candidates: QuickScreenCandidate[]; health: CandidateLoadHealth }> {
  const now = Date.now();
  const cacheTtlMs = getCacheTtlMs();
  if (_cached && _cachedHealth && now - _cachedAt < cacheTtlMs) {
    return { candidates: _cached, health: _cachedHealth };
  }
  if (_loadInFlight) return _loadInFlight;

  _loadInFlight = _doLoad().finally(() => { _loadInFlight = null; });
  return _loadInFlight;
}

/** Returns the candidate list only (backwards-compatible wrapper). */
export async function loadCandidates(): Promise<QuickScreenCandidate[]> {
  const { candidates } = await loadCandidatesWithHealth();
  return candidates;
}

/** Returns the most recently loaded health status without triggering a reload. */
export function getCandidateLoadHealth(): CandidateLoadHealth | null {
  return _cachedHealth;
}

async function _doLoad(): Promise<{ candidates: QuickScreenCandidate[]; health: CandidateLoadHealth }> {
  const now = Date.now();
  const loadedAt = new Date(now).toISOString();

  try {
    const blobsResult = await loadFromBlobs();

    if (!blobsResult || blobsResult.candidates.length === 0) {
      // Blobs not yet populated (fresh deploy, cron hasn't run) or load failed.
      // Log prominently — using the static seed corpus means real OFAC/UN/EU/UAE
      // designees added after the last build will NOT be screened.
      const degradationNote =
        "Live sanctions lists unavailable — screening against static seed corpus " +
        `(${STATIC_CANDIDATES.length} entries). Entities designated since last build will NOT be matched. ` +
        "Ensure refresh-lists cron has run and Netlify Blobs is bound.";
      console.warn(`[candidates-loader] ${degradationNote}`);

      const health: CandidateLoadHealth = {
        source: "static",
        loadedAt,
        candidateCount: STATIC_CANDIDATES.length,
        healthy: false,
        failedAdapters: [...ADAPTER_IDS].filter((id) => !id.startsWith("lseg_")),
        degradationNote,
      };
      _cached = STATIC_CANDIDATES;
      _cachedAt = now;
      _cachedHealth = health;
      return { candidates: _cached, health };
    }

    // Append static seed entries not already covered by the live data.
    const liveKeys = new Set(blobsResult.candidates.map((c) => `${c.listId}|${c.listRef}`));
    const extras = STATIC_CANDIDATES.filter(
      (c) => !liveKeys.has(`${c.listId}|${c.listRef}`),
    );

    const merged = [...blobsResult.candidates, ...extras];
    const isFullyHealthy = blobsResult.failedAdapters.length === 0 && blobsResult.malformedCount === 0;

    const health: CandidateLoadHealth = {
      source: "live",
      loadedAt,
      candidateCount: merged.length,
      healthy: isFullyHealthy,
      failedAdapters: blobsResult.failedAdapters,
      ...(isFullyHealthy
        ? {}
        : {
            degradationNote:
              blobsResult.failedAdapters.length > 0
                ? `${blobsResult.failedAdapters.length} primary feed(s) missing: ${blobsResult.failedAdapters.join(", ")}. Coverage is degraded.`
                : `${blobsResult.malformedCount} malformed entities skipped. Corpus may be incomplete.`,
          }),
    };

    _cached = merged;
    _cachedAt = now;
    _cachedHealth = health;
    return { candidates: merged, health };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const staleSec = _cachedAt > 0 ? Math.round((Date.now() - _cachedAt) / 1000) : null;
    const degradationNote =
      `Unexpected error loading candidates: ${detail}. ` +
      `Falling back to static seed corpus (${STATIC_CANDIDATES.length} entries). ` +
      (staleSec !== null ? `Cache was ${staleSec}s old.` : "Cache was never populated.");

    console.error(`[candidates-loader] ${degradationNote}`);

    const health: CandidateLoadHealth = {
      source: "static",
      loadedAt,
      candidateCount: STATIC_CANDIDATES.length,
      healthy: false,
      failedAdapters: [...ADAPTER_IDS].filter((id) => !id.startsWith("lseg_")),
      degradationNote,
    };
    _cached = STATIC_CANDIDATES;
    _cachedAt = Date.now();
    _cachedHealth = health;
    return { candidates: STATIC_CANDIDATES, health };
  }
}

/** Invalidate the cache (called after a list refresh completes). */
export function invalidateCandidateCache(): void {
  _cached = null;
  _cachedAt = 0;
  _cachedHealth = null;
}

// Eagerly start loading on module import so the first real request hits a warm
// cache instead of waiting for the full Blobs fetch inline.
void loadCandidatesWithHealth().catch((err) => {
  console.warn("[candidates-loader] Eager pre-load failed:", err instanceof Error ? err.message : String(err));
});
