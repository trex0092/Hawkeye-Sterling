// Hawkeye Sterling — LSEG CFS PEP index reader.
//
// Reads the bucketed index written by POST /api/admin/import-cfs and
// returns a KnownPEP-shaped hit when a screened name matches an entity
// extracted from any LSEG CFS bulk file. Bucket key = first lowercase
// letter of primaryName (or "_" for non-Latin). One blob read per
// lookup; result cached in-process for 5 min.
//
// Returns null when:
//   · Index doesn't exist (admin never ran import-cfs)
//   · Bucket doesn't contain the name
//   · Blobs is unavailable
//
// Never throws.

import type { KnownPEP } from "@/lib/data/known-entities";

interface IndexEntry {
  id: string;
  primaryName: string;
  aliases: string[];
  categories: string[];
  sourceFile: string;
}

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: "strong" | "eventual";
  }) => {
    get: (key: string, opts?: { type?: string }) => Promise<unknown>;
  };
}

interface BucketCacheEntry {
  entries: IndexEntry[];
  expiresAt: number;
}

const _bucketCache = new Map<string, BucketCacheEntry>();
const BUCKET_CACHE_TTL_MS = 5 * 60 * 1_000;
const LOOKUP_TIMEOUT_MS = 1_500;

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function bucketKey(name: string): string {
  const first = norm(name)[0];
  return first && /[a-z]/.test(first) ? first : "_";
}

let _blobsMod: BlobsModuleShape | null | undefined;
async function loadBlobs(): Promise<BlobsModuleShape | null> {
  if (_blobsMod !== undefined) return _blobsMod;
  try {
    _blobsMod = (await import("@netlify/blobs")) as unknown as BlobsModuleShape;
  } catch {
    _blobsMod = null;
  }
  return _blobsMod;
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

async function loadBucket(bucket: string): Promise<IndexEntry[]> {
  const cached = _bucketCache.get(bucket);
  if (cached && Date.now() < cached.expiresAt) return cached.entries;
  const mod = await loadBlobs();
  if (!mod) return [];
  const creds = credentials();
  const store = mod.getStore({
    name: "hawkeye-lseg-pep-index",
    ...(creds.siteID ? { siteID: creds.siteID } : {}),
    ...(creds.token ? { token: creds.token } : {}),
    consistency: "strong",
  });
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
    let entries: IndexEntry[] = [];
    try {
      const raw = await store.get(`bucket/${bucket}.json`, { type: "json" });
      if (Array.isArray(raw)) entries = raw as IndexEntry[];
    } finally {
      clearTimeout(t);
    }
    _bucketCache.set(bucket, { entries, expiresAt: Date.now() + BUCKET_CACHE_TTL_MS });
    return entries;
  } catch {
    return [];
  }
}

function categoryTier(categories: string[]): KnownPEP["tier"] {
  const c = categories.map((x) => x.toLowerCase());
  if (c.some((x) => x.includes("head of state") || x.includes("head of government"))) {
    return "tier_1_head_of_state_or_gov";
  }
  if (c.some((x) => x.includes("minister") || x.includes("judge") || x.includes("military") || x.includes("central bank"))) {
    return "tier_2_senior_political_judicial_military";
  }
  if (c.some((x) => x.includes("soe") || x.includes("state-owned") || x.includes("state owned"))) {
    return "tier_3_state_owned_enterprise_exec";
  }
  if (c.some((x) => x.includes("family") || x.includes("spouse") || x.includes("sibling"))) {
    return "family";
  }
  if (c.some((x) => x.includes("associate") || x.includes("close associate") || x.includes("rca"))) {
    return "close_associate";
  }
  return "tier_4_party_official_senior_civil_servant";
}

/**
 * Look up a name in the LSEG CFS-derived PEP index. Returns a KnownPEP
 * hit if any indexed entity's primaryName or aliases match (normalised),
 * otherwise null.
 */
export async function lookupLsegPepIndex(name: string): Promise<KnownPEP | null> {
  const q = norm(name);
  if (!q) return null;
  const entries = await loadBucket(bucketKey(name));
  if (entries.length === 0) return null;

  for (const e of entries) {
    if (norm(e.primaryName) === q) {
      return {
        names: [e.primaryName, ...e.aliases].slice(0, 6),
        tier: categoryTier(e.categories),
        role: e.categories[0] ?? "PEP (LSEG CFS classification)",
        rationale: `LSEG CFS index entry — categories: ${e.categories.slice(0, 4).join(", ") || "n/a"}; source file: ${e.sourceFile}.`,
      };
    }
    for (const alias of e.aliases) {
      if (norm(alias) === q) {
        return {
          names: [e.primaryName, ...e.aliases].slice(0, 6),
          tier: categoryTier(e.categories),
          role: e.categories[0] ?? "PEP (LSEG CFS classification, alias match)",
          rationale: `LSEG CFS index entry — alias match against "${alias}"; categories: ${e.categories.slice(0, 4).join(", ") || "n/a"}; source file: ${e.sourceFile}.`,
        };
      }
    }
  }
  return null;
}
