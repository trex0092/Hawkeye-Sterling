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

// Adapter IDs written by netlify/functions/refresh-lists.ts
const ADAPTER_IDS = [
  "un_consolidated",
  "ofac_sdn",
  "ofac_cons",
  "eu_fsf",
  "uk_ofsi",
  "uae_eocn",
  "uae_ltl",
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

async function loadFromBlobs(): Promise<QuickScreenCandidate[] | null> {
  let blobsMod: typeof import("@netlify/blobs") | null = null;
  try {
    blobsMod = await import("@netlify/blobs");
  } catch {
    return null; // not in a Netlify context
  }

  const { getStore } = blobsMod;
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];

  const storeOpts =
    siteID && token
      ? ({ name: "hawkeye-lists", siteID, token, consistency: "strong" } as Parameters<typeof getStore>[0])
      : ({ name: "hawkeye-lists" } as Parameters<typeof getStore>[0]);

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(storeOpts);
  } catch {
    return null;
  }

  const live: QuickScreenCandidate[] = [];
  let anyLoaded = false;

  for (const adapterId of ADAPTER_IDS) {
    try {
      const raw = (await store.get(`${adapterId}/latest.json`, {
        type: "json",
      })) as { entities: NormalisedEntity[] } | null;
      if (!raw?.entities?.length) continue;
      anyLoaded = true;
      for (const e of raw.entities) {
        try {
          live.push(entityToCandidate(e));
        } catch {
          // malformed entity — skip and continue
        }
      }
    } catch {
      // individual list failure — degrade gracefully, try others
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

  try {
    const live = await loadFromBlobs();

    if (!live || live.length === 0) {
      return STATIC_CANDIDATES;
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
    console.warn("[candidates-loader] unexpected error, falling back to static corpus:", err);
    return STATIC_CANDIDATES;
  }
}

/** Invalidate the cache (called after a list refresh completes). */
export function invalidateCandidateCache(): void {
  _cached = null;
  _cachedAt = 0;
}
