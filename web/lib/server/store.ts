// Server-only thin wrapper around @netlify/blobs. In local dev without a
// Netlify context, falls back to in-memory storage so routes still work.
import { getStore as getNetlifyStore } from "@netlify/blobs";

interface MinimalStore {
  get(key: string): Promise<string | null>;
  set(key: string, data: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ blobs: Array<{ key: string }> }>;
}

const memoryStore = new Map<string, string>();

function buildMemoryStore(): MinimalStore {
  return {
    get: async (key) => memoryStore.get(key) ?? null,
    set: async (key, data) => {
      memoryStore.set(key, data);
    },
    delete: async (key) => {
      memoryStore.delete(key);
    },
    list: async (opts) => {
      const prefix = opts?.prefix ?? "";
      return {
        blobs: Array.from(memoryStore.keys())
          .filter((k) => k.startsWith(prefix))
          .map((key) => ({ key })),
      };
    },
  };
}

let cached: MinimalStore | null = null;
let usingInMemoryFallback = false;

function buildStoreOptions(): Parameters<typeof getNetlifyStore>[0] {
  // Prefer explicit credentials (NETLIFY_SITE_ID + token) when available —
  // they work in every context (production, preview, dev, CI).
  // Auto-injection via NETLIFY_BLOBS_CONTEXT only works when the runtime
  // injects it; if it is absent the library throws MissingBlobsEnvironmentError
  // and we end up on the in-memory fallback, which shows "storage degraded"
  // on the status page.
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  if (siteID && token) {
    return { name: "hawkeye-sterling", siteID, token, consistency: "strong" };
  }
  // No explicit credentials — rely on auto-injected NETLIFY_BLOBS_CONTEXT.
  // Works when running inside a Netlify Function with plugin-nextjs.
  return { name: "hawkeye-sterling" };
}

export function getStore(): MinimalStore {
  if (cached) return cached;
  const onNetlify = Boolean(process.env["NETLIFY"]) || Boolean(process.env["NETLIFY_LOCAL"]);
  try {
    const ns = getNetlifyStore(buildStoreOptions());
    // IMPORTANT — do NOT flip `usingInMemoryFallback` based on per-operation
    // failures. A single failing read (transient network blip, key-not-found
    // edge case in @netlify/blobs) used to permanently degrade the entire
    // function instance, which surfaced as "storage degraded" on /status
    // even though Blobs was actually healthy. Per-op errors are now passed
    // through to the wrappers (getJson / setJson / del / listKeys) which
    // already log loudly and return null/empty. usingInMemoryFallback is
    // ONLY set when getNetlifyStore() itself throws on init.
    cached = {
      get: async (key) => {
        try {
          const v = await ns.get(key);
          return typeof v === "string" ? v : v == null ? null : String(v);
        } catch (err) {
          // On Netlify, log + propagate. Off Netlify (dev), fall back to
          // in-memory so local routes still work without a Blobs binding.
          if (onNetlify) throw err;
          console.warn(`[store] get(${key}) failed in dev — using in-memory:`, err instanceof Error ? err.message : err);
          if (!usingInMemoryFallback) {
            cached = buildMemoryStore();
            usingInMemoryFallback = true;
          }
          return cached!.get(key);
        }
      },
      set: async (key, data) => {
        try {
          await ns.set(key, data);
        } catch (err) {
          if (onNetlify) throw err;
          if (!usingInMemoryFallback) {
            cached = buildMemoryStore();
            usingInMemoryFallback = true;
          }
          await cached!.set(key, data);
        }
      },
      delete: async (key) => {
        try {
          await ns.delete(key);
        } catch (err) {
          if (onNetlify) throw err;
          if (!usingInMemoryFallback) {
            cached = buildMemoryStore();
            usingInMemoryFallback = true;
          }
          await cached!.delete(key);
        }
      },
      list: async (opts) => {
        try {
          const r = await ns.list({ ...(opts?.prefix ? { prefix: opts.prefix } : {}) });
          return { blobs: r.blobs.map((b: { key: string }) => ({ key: b.key })) };
        } catch (err) {
          if (onNetlify) throw err;
          if (!usingInMemoryFallback) {
            cached = buildMemoryStore();
            usingInMemoryFallback = true;
          }
          return cached!.list(opts);
        }
      },
    };
    return cached;
  } catch (err) {
    // Silent fallback would hide a Netlify Blobs outage from ops — the
    // in-memory store happily accepts writes that vanish on the next
    // cold-start. Log loudly so monitoring catches it; local dev still
    // gets a usable store because the catch branch is only reached
    // outside a Netlify context (where getNetlifyStore throws).
    cached = buildMemoryStore();
    usingInMemoryFallback = true;
    const detail = err instanceof Error ? err.message : String(err);
    if (onNetlify) {
      console.error(
        `[store] Netlify Blobs unavailable — falling back to in-memory store. ` +
          `Writes will be lost on cold-start. Reason: ${detail}`,
      );
    } else {
      console.warn(
        `[store] Netlify Blobs not configured (dev mode) — using in-memory store.`,
      );
    }
    return cached;
  }
}

/** True when the current process is operating without persistent storage.
 *  Used by /api/status to downgrade to "degraded" when running a Netlify
 *  deploy without a Blobs binding. */
export function isInMemoryFallback(): boolean {
  return usingInMemoryFallback;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const store = getStore();
  let raw: string | null = null;
  try {
    raw = await store.get(key);
  } catch (err) {
    console.warn(`[store] getJson(${key}) read failed:`, err instanceof Error ? err.message : err);
    return null;
  }
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    // Distinguish "missing" from "corrupted" — silent null on a parse
    // error hides on-disk corruption from ops. Loud-log and still return
    // null so the caller's existing null-check path runs.
    console.error(`[store] getJson(${key}) JSON parse failed (corrupted blob):`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  const store = getStore();
  try {
    await store.set(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[store] setJson(${key}) failed:`, err instanceof Error ? err.message : err);
  }
}

export async function del(key: string): Promise<void> {
  const store = getStore();
  try {
    await store.delete(key);
  } catch (err) {
    console.warn(`[store] del(${key}) failed:`, err instanceof Error ? err.message : err);
  }
}

export async function listKeys(prefix?: string): Promise<string[]> {
  const store = getStore();
  try {
    const opts = prefix ? { prefix } : {};
    const result = await store.list(opts);
    return result.blobs.map((b) => b.key);
  } catch (err) {
    // Loud-log: silently returning [] hides outages and makes "no data"
    // indistinguishable from "store unreachable". Callers still see the
    // empty array so existing flows don't break, but ops sees the cause.
    console.warn(
      `[store] listKeys(prefix=${prefix ?? "—"}) failed — returning empty list. Reason:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
