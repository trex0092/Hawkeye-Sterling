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
    // Netlify Blobs is unavailable (local dev or misconfigured deployment).
    // Data written to the in-memory fallback is NOT shared across Lambda
    // instances and is lost on cold start. If you see this in production,
    // check that the site is linked to a Netlify project with Blobs enabled.
    console.error(
      "[hawkeye] Netlify Blobs unavailable — falling back to in-memory storage.",
      "Issued keys, rate-limit counters and enrolled subjects will not persist.",
      err,
    );
    cached = buildMemoryStore();
    return cached;
  }
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
