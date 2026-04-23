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

let blobsStore: MinimalStore | null = null;
let blobsAvailable: boolean | null = null; // null = untested

export function getStore(): MinimalStore {
  // If we already confirmed Netlify Blobs is available, reuse the store.
  if (blobsAvailable === true && blobsStore) return blobsStore;
  // If we already confirmed it is unavailable, fall back to memory without
  // retrying getNetlifyStore() (which would throw on every call).
  if (blobsAvailable === false) return buildMemoryStore();

  // First call: probe Netlify Blobs. Only cache on success — a transient
  // failure (e.g. missing NETLIFY_BLOBS_CONTEXT at import time) must not
  // permanently redirect all storage to the in-memory fallback.
  try {
    const ns = getNetlifyStore("hawkeye-sterling");
    blobsStore = {
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
    blobsAvailable = true;
    return blobsStore;
  } catch {
    // Mark as unavailable so subsequent calls skip the probe, but return a
    // fresh memory store each call (not a singleton) so that a later
    // re-import in a new Lambda invocation can re-probe successfully.
    blobsAvailable = false;
    return buildMemoryStore();
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
