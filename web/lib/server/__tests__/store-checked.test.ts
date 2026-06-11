import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getJsonChecked must keep three outcomes distinct:
//   missing key      → { ok: true,  value: null }   (safe to seed)
//   store read throw → { ok: false }                (NOT safe to seed)
//   corrupted JSON   → { ok: false }                (NOT safe to seed)
// getJson collapses all three to null — that collapse is what let a Blobs
// blip masquerade as a first deploy and reseed the users blob.

const blobGet = vi.fn();

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    get: blobGet,
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(async () => ({ blobs: [] })),
  }),
}));

async function freshStoreModule() {
  vi.resetModules();
  // store.ts anchors its instance cache on globalThis to survive HMR — clear
  // it so each test gets a fresh store built from the mock above.
  const g = globalThis as { __hs_store_cached?: unknown; __hs_store_inMemory?: boolean };
  g.__hs_store_cached = undefined;
  g.__hs_store_inMemory = undefined;
  return import("@/lib/server/store");
}

describe("getJsonChecked", () => {
  beforeEach(() => {
    blobGet.mockReset();
    // Per-op read failures only propagate (instead of degrading to the dev
    // in-memory store) when running "on Netlify".
    vi.stubEnv("NETLIFY", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns ok:true value:null for a missing key", async () => {
    blobGet.mockResolvedValue(null);
    const store = await freshStoreModule();
    expect(await store.getJsonChecked("users/all.v1.json")).toEqual({ ok: true, value: null });
  });

  it("returns ok:true with the parsed value for a present key", async () => {
    blobGet.mockResolvedValue(JSON.stringify([{ id: "usr-001" }]));
    const store = await freshStoreModule();
    expect(await store.getJsonChecked("users/all.v1.json")).toEqual({
      ok: true,
      value: [{ id: "usr-001" }],
    });
  });

  it("returns ok:false when the underlying read throws", async () => {
    blobGet.mockRejectedValue(new Error("blobs unreachable"));
    const store = await freshStoreModule();
    const res = await store.getJsonChecked("users/all.v1.json");
    expect(res.ok).toBe(false);
  });

  it("returns ok:false for a corrupted (non-JSON) blob", async () => {
    blobGet.mockResolvedValue("{not valid json");
    const store = await freshStoreModule();
    const res = await store.getJsonChecked("users/all.v1.json");
    expect(res.ok).toBe(false);
  });

  it("getJson keeps its legacy null-collapsing behavior for cache callers", async () => {
    blobGet.mockRejectedValue(new Error("blobs unreachable"));
    const store = await freshStoreModule();
    expect(await store.getJson("some/cache.json")).toBeNull();
  });
});
