// POST /api/admin/import-cfs
//
// Parses every file currently in the hawkeye-lseg-cfs Blob store
// (downloaded by netlify/functions/lseg-cfs-poll.mts every 6 h) using
// the generic LSEG CFS parser, and writes the normalised entities into
// a queryable index at `hawkeye-lseg-pep-index` keyed by primary name.
//
// Use case: closes the deferred "consume LSEG CFS bulk data" workstream.
// After this runs the brain (or any consumer) can look up a name across
// the LSEG-supplied PEP / sanctions / adverse data without each consumer
// re-parsing raw bulk files.
//
// Auth: Bearer ADMIN_TOKEN.
//
// Idempotent: re-running rebuilds the index. Returns parse statistics
// per file so operators see which subscriptions/packages produce useful
// data and which return empty payloads.

import { NextResponse } from "next/server";
import { parseCfsPayload } from "@/lib/lseg/cfs-parser";
import {
  classifyToSanctionsListIds,
  LSEG_SUPPLEMENT_LIST_IDS,
  type SanctionsListId,
} from "@/lib/lseg/sanctions-classifier";
import {
  classifyAdverseCategories,
  type AdverseCategoryId,
} from "@/lib/lseg/adverse-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: "strong" | "eventual";
  }) => {
    list: (opts?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
    setJSON: (key: string, value: unknown) => Promise<void>;
  };
}

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  if (got.length !== expected.length) return false;
  const { timingSafeEqual } = await import("crypto");
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(got);
  const ab = new Uint8Array(a.length);
  ab.set(b.slice(0, a.length));
  return timingSafeEqual(a, ab);
}

function credentials(): { siteID?: string; token?: string } {
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  const out: { siteID?: string; token?: string } = {};
  if (siteID) out.siteID = siteID;
  if (token) out.token = token;
  return out;
}

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "service unavailable — ADMIN_TOKEN not set" },
      { status: 503 },
    );
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got || !(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let mod: BlobsModuleShape;
  try {
    mod = (await import("@netlify/blobs")) as unknown as BlobsModuleShape;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `@netlify/blobs unavailable — ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }

  const creds = credentials();
  const cfsStore = mod.getStore({
    name: "hawkeye-lseg-cfs",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });
  const indexStore = mod.getStore({
    name: "hawkeye-lseg-pep-index",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });
  // Adverse-media bucketed index — same shape as the PEP index but keyed
  // by adverse-media categories. Read by lookupLsegAdverseIndex().
  const adverseStore = mod.getStore({
    name: "hawkeye-lseg-adverse-index",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });
  // Vessel index — IMO-keyed lookup consumed by /api/vessel-check when the
  // external Equasis/Datalastic provider isn't configured. LSEG CFS bulk
  // files include OFAC SDN / EU / UN vessel sanctions records with IMO
  // numbers; this index makes them queryable by IMO.
  const vesselStore = mod.getStore({
    name: "hawkeye-lseg-vessel-index",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });
  // hawkeye-lists is the same store the primary refresh-lists cron writes
  // to. We never overwrite a primary blob — supplement entries are written
  // under `lseg_<listId>/latest.json` so the candidates loader can merge
  // them alongside the official feeds (audit H-01/H-02/H-03/C-01).
  const listsStore = mod.getStore({
    name: "hawkeye-lists",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });

  // Parser is statically imported above — Next.js handles bundling.

  // List all files written by lseg-cfs-poll.
  let fileKeys: string[] = [];
  try {
    const listing = await cfsStore.list({ prefix: "files/" });
    fileKeys = (listing.blobs ?? []).map((b) => b.key);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `cfs store list failed — ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }

  if (fileKeys.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      indexed: 0,
      hint: "No CFS files in store. Run /.netlify/functions/lseg-cfs-poll first (cron fires every 6 h) or check your CFS subscription entitles bulk packages.",
    });
  }

  // Parse each file in parallel (bounded by 4 concurrent).
  interface PerFile {
    key: string;
    format: string;
    entityCount: number;
    error?: string;
  }
  interface IndexedEntity {
    id: string;
    primaryName: string;
    aliases: string[];
    categories: string[];
    sourceFile: string;
  }
  // Shape consumed by the existing candidates loader (mirrors
  // src/ingestion/types.NormalisedEntity). Sanctions supplement entries
  // are converted into this shape so the loader treats LSEG-derived
  // entities identically to the primary cron output.
  interface NormalisedEntity {
    id: string;
    name: string;
    aliases: string[];
    type: string;
    nationalities: string[];
    jurisdictions: string[];
    listings: Array<{ source: string; program?: string; reference?: string }>;
    source: string;
  }

  function entityTypeForLoader(raw: string): string {
    if (raw === "individual") return "individual";
    if (raw === "vessel") return "vessel";
    if (raw === "aircraft") return "aircraft";
    if (raw === "entity") return "entity";
    return "unknown";
  }

  const perFile: PerFile[] = [];
  const allEntities = new Map<string, IndexedEntity>();
  // Per-listId sanctions buckets keyed by listId, then by lowercased name
  // for dedup. Each entity is the candidates-loader shape so the live
  // sanctions matcher can consume it without further conversion.
  const sanctionsByList = new Map<SanctionsListId, Map<string, NormalisedEntity>>();
  for (const lid of LSEG_SUPPLEMENT_LIST_IDS) sanctionsByList.set(lid, new Map());
  // Adverse-media entries keyed by lowercased name. Shape matches what
  // lookupLsegAdverseIndex() reads back from hawkeye-lseg-adverse-index.
  interface AdverseIndexEntry {
    id: string;
    primaryName: string;
    aliases: string[];
    categories: AdverseCategoryId[];
    rawCategories: string[];
    sourceFile: string;
  }
  const adverseEntities = new Map<string, AdverseIndexEntry>();

  // Vessel entries keyed by 7-digit IMO. Shape mirrors VesselIndexEntry in
  // web/lib/lseg/vessel-index.ts so lookupLsegVesselByImo() can consume
  // these blobs directly without a translation layer.
  interface VesselIndexEntry {
    imoNumber: string;
    primaryName: string;
    aliases: string[];
    flag?: string;
    vesselType?: string;
    mmsi?: string;
    callSign?: string;
    countries: string[];
    sanctionsLists: string[];
    categories: string[];
    sourceFile: string;
    lastUpdated: string;
  }
  const vesselByImo = new Map<string, VesselIndexEntry>();

  const CONCURRENCY = 4;
  for (let i = 0; i < fileKeys.length; i += CONCURRENCY) {
    const batch = fileKeys.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (key) => {
      try {
        const payload = await cfsStore.get(key, { type: "text" }) as string | null;
        if (!payload) {
          perFile.push({ key, format: "unknown", entityCount: 0, error: "empty payload" });
          return;
        }
        const parsed = parseCfsPayload(payload, key);
        const entry: PerFile = { key, format: parsed.format, entityCount: parsed.entities.length };
        if (parsed.error) entry.error = parsed.error;
        perFile.push(entry);
        for (const e of parsed.entities) {
          const k = e.primaryName.toLowerCase();
          if (!allEntities.has(k)) {
            allEntities.set(k, {
              id: e.id,
              primaryName: e.primaryName,
              aliases: e.aliases,
              categories: e.categories,
              sourceFile: key,
            });
          }
          // Classify the entity into one or more sanctions regimes by its
          // LSEG category labels. Sanctions-bearing entries are written
          // to per-list supplement blobs so the screening engine matches
          // them as if they came from the primary feed.
          const sanctionsIds = classifyToSanctionsListIds(e.categories);
          for (const lid of sanctionsIds) {
            const bucket = sanctionsByList.get(lid)!;
            if (!bucket.has(k)) {
              const program = e.categories.find((c) => c.length > 0) ?? lid.replace(/^lseg_/, "");
              bucket.set(k, {
                id: `${lid}:${e.id}`,
                name: e.primaryName,
                aliases: e.aliases,
                type: entityTypeForLoader(e.entityType),
                nationalities: e.countries,
                jurisdictions: e.countries,
                listings: [{ source: lid, program, reference: e.id }],
                source: lid,
              });
            }
          }
          // Vessel index — only populated when LSEG flagged the entity as
          // a vessel AND the parser extracted a valid 7-digit IMO. Used by
          // /api/vessel-check to close audit C-02 without an external
          // vessel-intel provider when LSEG carries the data already.
          if (e.entityType === "vessel" && e.imoNumber && /^[0-9]{7}$/.test(e.imoNumber)) {
            const sanctionsIds = classifyToSanctionsListIds(e.categories);
            const existing = vesselByImo.get(e.imoNumber);
            if (!existing) {
              const vesselEntry: VesselIndexEntry = {
                imoNumber: e.imoNumber,
                primaryName: e.primaryName,
                aliases: e.aliases,
                countries: e.countries,
                sanctionsLists: sanctionsIds,
                categories: e.categories,
                sourceFile: key,
                lastUpdated: e.publishedAt ?? new Date().toISOString(),
              };
              if (e.flag)       vesselEntry.flag       = e.flag;
              if (e.vesselType) vesselEntry.vesselType = e.vesselType;
              if (e.mmsi)       vesselEntry.mmsi       = e.mmsi;
              if (e.callSign)   vesselEntry.callSign   = e.callSign;
              vesselByImo.set(e.imoNumber, vesselEntry);
            } else {
              // Merge sanctions-list attribution from a later CFS file. The
              // same vessel often appears across multiple regime feeds.
              const merged = new Set([...existing.sanctionsLists, ...sanctionsIds]);
              existing.sanctionsLists = Array.from(merged);
            }
          }
          // Adverse-media classification — independent of sanctions
          // categorisation. LSEG flags many entities with adverse risk
          // factors (fraud, corruption, ML, etc.) without putting them on
          // any sanctions list; those still need to surface in adverse-
          // media screens.
          const adverseCats = classifyAdverseCategories(e.categories);
          if (adverseCats.length > 0 && !adverseEntities.has(k)) {
            adverseEntities.set(k, {
              id: e.id,
              primaryName: e.primaryName,
              aliases: e.aliases,
              categories: adverseCats,
              rawCategories: e.categories,
              sourceFile: key,
            });
          }
        }
      } catch (err) {
        perFile.push({
          key,
          format: "unknown",
          entityCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }));
  }

  // Write the consolidated PEP index. One blob per first-letter bucket so a
  // lookup doesn't require loading all entities into memory at query time.
  const byBucket = new Map<string, IndexedEntity[]>();
  for (const e of allEntities.values()) {
    const firstChar = e.primaryName.charAt(0).toLowerCase();
    const bucket = /[a-z]/.test(firstChar) ? firstChar : "_";
    const list = byBucket.get(bucket);
    if (list) {
      list.push(e);
    } else {
      byBucket.set(bucket, [e]);
    }
  }
  try {
    for (const [bucket, entries] of byBucket) {
      await indexStore.setJSON(`bucket/${bucket}.json`, entries);
    }
    await indexStore.setJSON("manifest.json", {
      builtAt: new Date().toISOString(),
      filesProcessed: perFile.length,
      entitiesIndexed: allEntities.size,
      buckets: Array.from(byBucket.keys()).sort(),
      perFile,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        filesProcessed: perFile.length,
        entitiesParsed: allEntities.size,
        error: `index write failed — ${err instanceof Error ? err.message : String(err)}`,
        perFile,
      },
      { status: 503 },
    );
  }

  // Adverse-media bucketed index — same first-letter bucketing as the
  // PEP index. Read by lookupLsegAdverseIndex() at screening time.
  const adverseByBucket = new Map<string, AdverseIndexEntry[]>();
  for (const e of adverseEntities.values()) {
    const firstChar = e.primaryName.charAt(0).toLowerCase();
    const bucket = /[a-z]/.test(firstChar) ? firstChar : "_";
    const list = adverseByBucket.get(bucket);
    if (list) list.push(e); else adverseByBucket.set(bucket, [e]);
  }
  try {
    for (const [bucket, entries] of adverseByBucket) {
      await adverseStore.setJSON(`bucket/${bucket}.json`, entries);
    }
    await adverseStore.setJSON("manifest.json", {
      builtAt: new Date().toISOString(),
      filesProcessed: perFile.length,
      entitiesIndexed: adverseEntities.size,
      buckets: Array.from(adverseByBucket.keys()).sort(),
    });
  } catch (err) {
    console.warn("[import-cfs] adverse-media index write failed:", err instanceof Error ? err.message : err);
  }

  // Vessel index writes — one blob per IMO in hawkeye-lseg-vessel-index.
  // Closes audit C-02 (vessel screening) using LSEG CFS bulk data instead
  // of an Equasis/Datalastic external integration.
  try {
    for (const [imo, entry] of vesselByImo) {
      await vesselStore.setJSON(`imo/${imo}.json`, entry);
    }
    await vesselStore.setJSON("manifest.json", {
      builtAt: new Date().toISOString(),
      filesProcessed: perFile.length,
      vesselCount: vesselByImo.size,
    });
  } catch (err) {
    console.warn("[import-cfs] vessel index write failed:", err instanceof Error ? err.message : err);
  }

  // Sanctions supplement writes. One blob per supplement listId in the
  // hawkeye-lists store, alongside the primary refresh-lists cron output.
  // The candidates loader's ADAPTER_IDS includes these lseg_* ids so screen
  // routes match against the supplement too. Shape is identical to the
  // primary feed: { entities: NormalisedEntity[], fetchedAt, ... }.
  const sanctionsCounts: Record<string, number> = {};
  const fetchedAt = Date.now();
  try {
    for (const [lid, bucket] of sanctionsByList) {
      const entities = Array.from(bucket.values());
      sanctionsCounts[lid] = entities.length;
      // Always write — empty arrays let downstream consumers detect that we
      // ran but found no entries (vs blob missing → never ran).
      await listsStore.setJSON(`${lid}/latest.json`, {
        entities,
        fetchedAt,
        generatedAt: new Date().toISOString(),
        source: "lseg-cfs-import",
      });
    }
  } catch (err) {
    console.warn("[import-cfs] sanctions supplement write failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    ok: true,
    filesProcessed: perFile.length,
    entitiesIndexed: allEntities.size,
    buckets: Array.from(byBucket.keys()).sort(),
    sanctionsSupplement: sanctionsCounts,
    adverseIndexed: adverseEntities.size,
    vesselsIndexed: vesselByImo.size,
    perFile,
    hint:
      allEntities.size === 0
        ? "Files parsed but no entities extracted — formats may differ from the assumed JSON/XML/CSV layouts. Inspect perFile[].format and perFile[].error to identify schemas the parser doesn't yet handle."
        : "PEP → hawkeye-lseg-pep-index. Sanctions → hawkeye-lists/lseg_*. Adverse → hawkeye-lseg-adverse-index. Vessels → hawkeye-lseg-vessel-index. Re-run after each new CFS fileset arrives (6 h cron).",
  });
}
