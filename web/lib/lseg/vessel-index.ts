// Hawkeye Sterling — LSEG CFS vessel-screening index.
//
// Equasis's terms of service forbid programmatic access, so the audit
// flagged C-02 (vessel screening unconfigured) as deferred. This module
// closes the gap using LSEG CFS bulk data instead: when /api/admin/
// import-cfs runs, any entity with entityType === "vessel" + a parseable
// IMO number is indexed here, keyed by IMO. /api/vessel-check consults
// this index before falling back to the optional external vessel-check
// provider (Datalastic, etc.).
//
// Index layout (in Netlify Blobs store `hawkeye-lseg-vessel-index`):
//   imo/<7-digit-imo>.json        → VesselIndexEntry
//   manifest.json                  → { builtAt, vesselCount }
//
// Returns null when:
//   · No vessel record exists for that IMO (caller falls back)
//   · Index not yet built (admin hasn't run import-cfs)
//   · Blobs unreachable

import { getNamedStore } from "@/lib/server/blob-getter";

export interface VesselIndexEntry {
  imoNumber: string;            // 7 digits
  primaryName: string;
  aliases: string[];
  flag?: string;
  vesselType?: string;
  mmsi?: string;
  callSign?: string;
  countries: string[];           // owner / operator country attribution
  sanctionsLists: string[];      // listIds the vessel appears on (lseg_ofac_sdn, lseg_eu_fsf, etc.)
  categories: string[];          // raw LSEG categories — used for adverse-media flagging
  sourceFile: string;
  lastUpdated: string;
}

/**
 * Look up a vessel by IMO number in the LSEG CFS-derived vessel index.
 * IMO must be normalised to 7 digits — caller is responsible for
 * stripping any "IMO " prefix and leading zeros that aren't part of the
 * canonical number. Returns null on no match / index missing / blobs error.
 */
export async function lookupLsegVesselByImo(imoNumber: string): Promise<VesselIndexEntry | null> {
  const normalised = imoNumber.replace(/[^0-9]/g, "");
  if (normalised.length !== 7) return null;
  const store = await getNamedStore("hawkeye-lseg-vessel-index");
  if (!store) return null;
  try {
    const raw = await store.get(`imo/${normalised}.json`, { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    return raw as VesselIndexEntry;
  } catch {
    return null;
  }
}

/**
 * Lightweight existence check — used by /api/vessel-check and
 * /api/integrations/status to surface whether the LSEG vessel coverage
 * is populated. Reads the manifest blob (which is small) instead of
 * scanning every IMO key.
 */
export async function getLsegVesselIndexManifest(): Promise<{
  builtAt: string;
  vesselCount: number;
} | null> {
  const store = await getNamedStore("hawkeye-lseg-vessel-index");
  if (!store) return null;
  try {
    const raw = await store.get("manifest.json", { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    const m = raw as { builtAt?: string; vesselCount?: number };
    if (typeof m.builtAt !== "string" || typeof m.vesselCount !== "number") return null;
    return { builtAt: m.builtAt, vesselCount: m.vesselCount };
  } catch {
    return null;
  }
}
