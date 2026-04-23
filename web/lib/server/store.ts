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

export function getStore(): MinimalStore {
  if (cached) return cached;
  try {
    const ns = getNetlifyStore("hawkeye-sterling");
    cached = {
      get: async (key) => {
        const v = await ns.get(key);
        return typeof v === "string" ? v : v == null ? null : String(v);
      },
      set: async (key, data) => {
        await ns.set(key, data);
      },
      delete: async (key) => {
        await ns.delete(key);
      },
      list: async (opts) => {
        const r = await ns.list({ ...(opts?.prefix ? { prefix: opts.prefix } : {}) });
        return { blobs: r.blobs.map((b) => ({ key: b.key })) };
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
    const isNetlify = Boolean(process.env["NETLIFY"]) || Boolean(process.env["NETLIFY_LOCAL"]);
    if (isNetlify) {
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
  try {
    const raw = await store.get(key);
    if (!raw || typeof raw !== "string") return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  const store = getStore();
  await store.set(key, JSON.stringify(value));
}

export async function del(key: string): Promise<void> {
  const store = getStore();
  await store.delete(key);
}

export async function listKeys(prefix?: string): Promise<string[]> {
  const store = getStore();
  try {
    const opts = prefix ? { prefix } : {};
    const result = await store.list(opts);
    return result.blobs.map((b) => b.key);
  } catch {
    return [];
  }
}
