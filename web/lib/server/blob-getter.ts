// Hawkeye Sterling — shared @netlify/blobs store accessor.
//
// 20+ files in the codebase independently dynamic-import @netlify/blobs,
// read NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN, construct the same options
// object, and wrap getStore() in a try/catch that returns null on failure.
// This module centralises that pattern so:
//
//   1. Credentials resolution is identical everywhere (one source of truth)
//   2. Tests can stub a single module instead of every adapter
//   3. Failures are logged with a consistent prefix
//   4. Future migration off Blobs touches one file
//
// Does NOT replace `web/lib/server/store.ts`'s in-memory fallback — that
// module wraps Blobs for the persistence layer. This helper is for ad-hoc
// reads of specialised stores (hawkeye-lseg-cfs, hawkeye-lseg-pep-index,
// hawkeye-lists, hawkeye-brain-governance, etc.) that already have
// per-store accessor patterns.

export interface NamedBlobStore {
  get: (key: string, opts?: { type?: string }) => Promise<unknown>;
  setJSON?: (key: string, value: unknown) => Promise<void>;
  set?: (key: string, value: string) => Promise<void>;
  list?: (opts?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
  delete?: (key: string) => Promise<void>;
}

interface BlobsModuleShape {
  getStore: (opts: {
    name: string;
    siteID?: string;
    token?: string;
    consistency?: "strong" | "eventual";
  }) => NamedBlobStore;
}

let _modPromise: Promise<BlobsModuleShape | null> | undefined;

function loadBlobsModule(): Promise<BlobsModuleShape | null> {
  if (_modPromise === undefined) {
    _modPromise = (async () => {
      try {
        return (await import("@netlify/blobs")) as unknown as BlobsModuleShape;
      } catch {
        return null;
      }
    })();
  }
  return _modPromise;
}

function readCredentials(): { siteID?: string; token?: string } {
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

export interface GetNamedStoreOptions {
  /** Default: "strong". Pass "eventual" for read-heavy paths that tolerate stale. */
  consistency?: "strong" | "eventual";
  /** Suppress the warn log when the @netlify/blobs module can't be imported. */
  silent?: boolean;
}

/**
 * Get a named Blobs store, or null if the runtime can't initialise one
 * (local dev without netlify-cli linked, or a hard failure). Returns
 * null instead of throwing so callers can fall through to a static
 * fixture / "empty" response without try/catch boilerplate.
 *
 * Logs once at the warn level when the @netlify/blobs module isn't
 * importable, so missing-dep regressions show up in the function log.
 */
export async function getNamedStore(
  name: string,
  opts: GetNamedStoreOptions = {},
): Promise<NamedBlobStore | null> {
  const mod = await loadBlobsModule();
  if (!mod) {
    if (!opts.silent) {
      console.warn(`[blob-getter] @netlify/blobs module not importable — store "${name}" unavailable`);
    }
    return null;
  }
  const creds = readCredentials();
  const consistency = opts.consistency ?? "strong";
  try {
    return mod.getStore({
      name,
      consistency,
      ...(creds.siteID ? { siteID: creds.siteID } : {}),
      ...(creds.token ? { token: creds.token } : {}),
    });
  } catch (err) {
    console.warn(`[blob-getter] getStore("${name}") failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Convenience: read a JSON key from a named store with safe parsing.
 * Returns `null` on any failure — caller distinguishes "not found" from
 * "store unreachable" by checking `getNamedStore()` health separately if
 * needed.
 */
export async function readJsonFromStore<T>(name: string, key: string, opts?: GetNamedStoreOptions): Promise<T | null> {
  const store = await getNamedStore(name, opts);
  if (!store) return null;
  try {
    const raw = await store.get(key, { type: "json" });
    return raw as T | null;
  } catch (err) {
    console.warn(`[blob-getter] read ${name}/${key} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
