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
  return "other";
}

function entityToCandidate(e: NormalisedEntity): QuickScreenCandidate {
  const programs = e.listings
    .map((l) => l.program)
    .filter((p): p is string => Boolean(p));

  // Prefer the listing-level source+reference for list attribution.
  const primaryListing = e.listings[0];
  const listId = primaryListing?.source ?? e.source;
  const listRef = primaryListing?.reference ?? e.id;
  const jurisdiction = e.nationalities[0] ?? e.jurisdictions[0];

  const candidate: QuickScreenCandidate = {
    listId,
    listRef,
    name: e.name,
    entityType: mapType(e.type),
  };
  if (e.aliases.length > 0) candidate.aliases = e.aliases;
  if (jurisdiction) candidate.jurisdiction = jurisdiction;
  if (programs.length > 0) candidate.programs = programs;
  return candidate;
}

// Per-process cache.
let _cached: QuickScreenCandidate[] | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
// In-flight promise deduplication — prevents cache stampede on first cold load.
let _loadInFlight: Promise<QuickScreenCandidate[]> | null = null;

async function loadFromBlobs(): Promise<QuickScreenCandidate[] | null> {
  let blobsMod: typeof import("@netlify/blobs") | null = null;
  try {
    blobsMod = await import("@netlify/blobs");
  } catch {
    return null; // not in a Netlify context
  }

  const { getStore } = blobsMod;
  // On Netlify's own runtime, trust the auto-injected NETLIFY_BLOBS_CONTEXT.
  // Using explicit NETLIFY_BLOBS_TOKEN (a custom non-PAT value) overrides the
  // injection and causes every read to 401 → silent fallback to the 50-entry
  // demo fixture — real OFAC/UN/EU/UAE designees are never screened.
  const onNetlify = Boolean(process.env["NETLIFY"]) || Boolean(process.env["NETLIFY_LOCAL"]);
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"] ??
    process.env["NETLIFY_BLOBS_TOKEN"];

  const storeOpts =
    !onNetlify && siteID && token
      ? ({ name: "hawkeye-lists", siteID, token, consistency: "strong" } as Parameters<typeof getStore>[0])
      : ({ name: "hawkeye-lists" } as Parameters<typeof getStore>[0]);

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(storeOpts);
  } catch {
    return null;
  }

  // Read all adapter blobs in parallel (was sequential — each network round-trip
  // added ~80-200ms; with 18 adapters that was 1.5-3.6s on cold start).
  // Individual failures are swallowed so one missing list never blocks others.
  const PER_KEY_TIMEOUT_MS = 1_200;
  const results = await Promise.all(
    ADAPTER_IDS.map(async (adapterId) => {
      try {
        const raw = await Promise.race([
          store.get(`${adapterId}/latest.json`, { type: "json" }) as Promise<{ entities: NormalisedEntity[] } | null>,
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("blob read timeout")), PER_KEY_TIMEOUT_MS)),
        ]);
        return raw?.entities ?? null;
      } catch {
        return null;
      }
    }),
  );

  const live: QuickScreenCandidate[] = [];
  let anyLoaded = false;
  for (const entities of results) {
    if (!entities?.length) continue;
    anyLoaded = true;
    for (const e of entities) {
      try { live.push(entityToCandidate(e)); } catch { /* malformed — skip */ }
    }
  }

  return anyLoaded ? live : null;
}

/**
 * Returns the best available candidate list for screening.
 *
 * Priority: live Blobs data → static seed corpus.
 * Merges both: live list entries take precedence; seed corpus entries not
 * present in the live data are appended so known demo subjects always render.
 */
export async function loadCandidates(): Promise<QuickScreenCandidate[]> {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL_MS) return _cached;
  if (_loadInFlight) return _loadInFlight;

  _loadInFlight = _doLoad().finally(() => { _loadInFlight = null; });
  return _loadInFlight;
}

async function _doLoad(): Promise<QuickScreenCandidate[]> {
  const now = Date.now();
  try {
    const live = await loadFromBlobs();

    if (!live || live.length === 0) {
      // Blobs not yet populated (fresh deploy, cron hasn't run) or load failed.
      // Log prominently — using the static seed corpus means real OFAC/UN/EU/UAE
      // designees added after the last build will NOT be screened.
      console.warn(
        "[candidates-loader] Live sanctions lists unavailable — screening against static seed corpus " +
        `(${STATIC_CANDIDATES.length} entries). Newly designated entities since last build will NOT be matched. ` +
        "Ensure refresh-lists cron has run and Netlify Blobs is bound.",
      );
      _cached = STATIC_CANDIDATES;
      _cachedAt = now;
      return _cached;
    }

    // Append static seed entries not already covered by the live data.
    const liveKeys = new Set(live.map((c) => `${c.listId}|${c.listRef}`));
    const extras = STATIC_CANDIDATES.filter(
      (c) => !liveKeys.has(`${c.listId}|${c.listRef}`),
    );

    _cached = [...live, ...extras];
    _cachedAt = now;
    return _cached;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const staleSec = _cachedAt > 0 ? Math.round((Date.now() - _cachedAt) / 1000) : null;
    console.error(
      `[candidates-loader] Unexpected error loading candidates: ${detail}. ` +
      `Returning static seed corpus (${STATIC_CANDIDATES.length} entries). ` +
      (staleSec !== null ? `Cache is ${staleSec}s old.` : "Cache was never populated."),
    );
    return STATIC_CANDIDATES;
  }
}

/** Invalidate the cache (called after a list refresh completes). */
export function invalidateCandidateCache(): void {
  _cached = null;
  _cachedAt = 0;
}

// Eagerly start loading on module import so the first real request hits a warm
// cache instead of waiting for the full Blobs fetch inline.
void loadCandidates().catch(() => {/* silent — cache will load on first real request */});
